"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const WS = require("ws");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const { Level } = require('level');
const { fork } = require("child_process");

const Block = require("../core/block");
const Transaction = require("../core/transaction");
const changeState = require("../core/state");
const { BLOCK_REWARD, BLOCK_GAS_LIMIT, EMPTY_HASH, INITIAL_SUPPLY, FIRST_ACCOUNT } = require("../config.json");
const { produceMessage, sendMessage } = require("./message");
const generateGenesisBlock = require("../core/genesis");
const { addTransaction, clearDepreciatedTxns }= require("../core/txPool");
const rpc = require("../rpc/rpc");
const TYPE = require("./message-types");
const { verifyBlock, updateDifficulty } = require("../consensus/consensus");
const { parseJSON, indexTxns, numToBuffer, serializeState, deserializeState } = require("../utils/utils");
const jelscript = require("../core/runtime");
const { buildMerkleTree } = require("../core/merkle");

const opened    = [];  // Addresses and sockets from connected nodes.
const connected = [];  // Addresses from connected nodes.
let connectedNodes = 0;

let worker = fork(`${__dirname}/../miner/worker.js`); // Worker thread (for PoW mining).
let mined = false; // This will be used to inform the node that another node has already mined before it.


// Some chain info cache
const chainInfo = {
    transactionPool: [],
    latestBlock: generateGenesisBlock(), 
    latestSyncBlock: null,
    checkedBlock: {},
    tempStates: {},
    difficulty: 1
};

const stateDB = new Level(__dirname + "/../log/stateStore", { valueEncoding: "buffer" });
const blockDB = new Level(__dirname + "/../log/blockStore", { valueEncoding: "buffer" });
const bhashDB = new Level(__dirname + "/../log/bhashStore", { valueEncoding: "buffer" });
const codeDB = new Level(__dirname + "/../log/codeStore");

async function startServer(options) {
    const PORT                 = options.PORT || 3000;                        // Node's PORT
    const RPC_PORT             = options.RPC_PORT || 5000;                    // RPC server's PORT
    const PEERS                = options.PEERS || [];                         // Peers to connect to
    const MAX_PEERS            = options.MAX_PEERS || 10                      // Maximum number of peers to connect to
    const MY_ADDRESS           = options.MY_ADDRESS || "ws://localhost:3000"; // Node's address
    const ENABLE_MINING        = options.ENABLE_MINING ? true : false;        // Enable mining?
    const ENABLE_LOGGING       = options.ENABLE_LOGGING ? true : false;       // Enable logging?
    const ENABLE_RPC           = options.ENABLE_RPC ? true : false;           // Enable RPC server?
    let   ENABLE_CHAIN_REQUEST = options.ENABLE_CHAIN_REQUEST ? true : false; // Enable chain sync request?

    const privateKey = options.PRIVATE_KEY || ec.genKeyPair().getPrivate("hex");
    const keyPair = ec.keyFromPrivate(privateKey, "hex");
    const publicKey = keyPair.getPublic("hex");

    process.on("uncaughtException", err => console.log(`\x1b[31mERROR\x1b[0m [${(new Date()).toISOString()}] Uncaught Exception`, err));

    await codeDB.put(EMPTY_HASH, "");

    const server = new WS.Server({ port: PORT });

    console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] P2P server listening on PORT`, PORT.toString());

    server.on("connection", async (socket, req) => {
        // Message handler
        socket.on("message", async message => {
            const _message = parseJSON(message); // Parse binary message to JSON

            switch (_message.type) {
                // Below are handlers for every message types.

                case TYPE.NEW_BLOCK:
                    // "TYPE.NEW_BLOCK" is sent when someone wants to submit a new block.
                    // Its message body must contain the new block and the new difficulty.

                    let newBlock;

                    try {
                        newBlock = Block.deserialize(_message.data);
                    } catch (e) {
                        // If block fails to be deserialized, it's faulty
                        
                        return;
                    }

                    // We will only continue checking the block if its parentHash is not the same as the latest block's hash.
                    // This is because the block sent to us is likely duplicated or from a node that has lost and should be discarded.

                    if (!chainInfo.checkedBlock[newBlock.hash]) {
                        chainInfo.checkedBlock[newBlock.hash] = true;
                    } else { return; }

                    if (
                        newBlock.parentHash !== chainInfo.latestBlock.parentHash &&
                        (!ENABLE_CHAIN_REQUEST || (ENABLE_CHAIN_REQUEST && currentSyncBlock > 1))
                        // Only proceed if syncing is disabled or enabled but already synced at least the genesis block
                    ) {
                        chainInfo.checkedBlock[newBlock.hash] = true;

                        if (await verifyBlock(newBlock, chainInfo, stateDB, codeDB, ENABLE_LOGGING)) {
                            console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] New block received.`);

                            // If mining is enabled, we will set mined to true, informing that another node has mined before us.
                            if (ENABLE_MINING) {
                                mined = true;

                                worker.kill(); // Stop the worker thread

                                worker = fork(`${__dirname}/../miner/worker.js`); // Renew
                            }

                            await updateDifficulty(newBlock, chainInfo, blockDB); // Update difficulty

                            await blockDB.put(newBlock.blockNumber.toString(), Buffer.from(_message.data)); // Add block to chain
                            await bhashDB.put(newBlock.hash, numToBuffer(newBlock.blockNumber)); // Assign block number to the matching block hash

                            chainInfo.latestBlock = newBlock; // Update chain info

                            // Update the new transaction pool (remove all the transactions that are no longer valid).
                            chainInfo.transactionPool = await clearDepreciatedTxns(chainInfo, stateDB);

                            console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] Block #${newBlock.blockNumber} synced, state transited.`);

                            sendMessage(message, opened); // Broadcast block to other nodes

                            if (ENABLE_CHAIN_REQUEST) {
                                ENABLE_CHAIN_REQUEST = false;
                            }
                        }
                    }

                    break;
                
                case TYPE.CREATE_TRANSACTION:
                    if (ENABLE_CHAIN_REQUEST) break; // Unsynced nodes should not be able to proceed.

                    // TYPE.CREATE_TRANSACTION is sent when someone wants to submit a transaction.
                    // Its message body must contain a transaction.

                    // Weakly verify the transation, full verification is achieved in block production.

                    let transaction;

                    try {
                        transaction = Transaction.deserialize(_message.data);
                    } catch (e) {
                        // If transaction can not be deserialized, it's faulty
                        break;
                    }

                    if (!(await Transaction.isValid(transaction, stateDB))) break;

                    // Get public key and address from sender
                    const txSenderPubkey = Transaction.getPubKey(transaction);
                    const txSenderAddress = SHA256(txSenderPubkey);

                    if (!(await stateDB.keys().all()).includes(txSenderAddress)) break;

                    // After transaction is added, the transaction must be broadcasted to others since the sender might only send it to a few nodes.
    
                    // This is pretty much the same as addTransaction, but we will send the transaction to other connected nodes if it's valid.
    
                    // Check nonce
                    let maxNonce = 0;

                    for (const tx of chainInfo.transactionPool) {
                        const poolTxSenderPubkey = Transaction.getPubKey(transaction);
                        const poolTxSenderAddress = SHA256(poolTxSenderPubkey);

                        if (poolTxSenderAddress === txSenderAddress && tx.nonce > maxNonce) {
                            maxNonce = tx.nonce;
                        }
                    }

                    if (maxNonce + 1 !== transaction.nonce) return;

                    console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] New transaction received, broadcasted and added to pool.`);

                    chainInfo.transactionPool.push(transaction);
                    
                    // Broadcast the transaction
                    sendMessage(message, opened);
    
                    break;

                case TYPE.REQUEST_BLOCK:
                    if (!ENABLE_CHAIN_REQUEST) { // Unsynced nodes should not be able to send blocks
                        const { blockNumber, requestAddress } = _message.data;

                        const socket = opened.find(node => node.address === requestAddress).socket; // Get socket from address

                        const currentBlockNumber = Math.max(...(await blockDB.keys().all()).map(key => parseInt(key))); // Get latest block number

                        if (blockNumber > 0 && blockNumber <= currentBlockNumber) { // Check if block number is valid
                            const block = [ ...await blockDB.get( blockNumber.toString() ) ]; // Get block

                            socket.send(produceMessage(TYPE.SEND_BLOCK, block)); // Send block
                        
                            console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] Sent block at position ${blockNumber} to ${requestAddress}.`);
                        }
                    }
    
                    break;
                
                case TYPE.SEND_BLOCK:
                    let block;

                    try {
                        block = Block.deserialize(_message.data);
                    } catch (e) {
                        // If block fails to be deserialized, it's faulty
                
                        return;
                    }

                    if (ENABLE_CHAIN_REQUEST && currentSyncBlock === block.blockNumber) {
                        if (
                            chainInfo.latestSyncBlock === null // If latest synced block is null then we immediately add the block into the chain without verification.
                            ||                                 // This happens due to the fact that the genesis block can discard every possible set rule ¯\_(ツ)_/¯
                            await verifyBlock(block, chainInfo, stateDB, codeDB, ENABLE_LOGGING)
                        ) {
                            currentSyncBlock += 1;

                            await blockDB.put(block.blockNumber.toString(), Buffer.from(_message.data)); // Add block to chain.
                            await bhashDB.put(block.hash, numToBuffer(block.blockNumber)); // Assign block number to the matching block hash

                            if (!chainInfo.latestSyncBlock) {
                                chainInfo.latestSyncBlock = block; // Update latest synced block.                                

                                await changeState(block, stateDB, codeDB, ENABLE_LOGGING); // Transit state
                            }

                            chainInfo.latestBlock = block; // Update latest block.

                            await updateDifficulty(block, chainInfo, blockDB); // Update difficulty.

                            console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] Synced block at position ${block.blockNumber}.`);

                            // Continue requesting the next block
                            for (const node of opened) {
                                node.socket.send(
                                    produceMessage(
                                        TYPE.REQUEST_BLOCK,
                                        { blockNumber: currentSyncBlock, requestAddress: MY_ADDRESS }
                                    )
                                );

                                await new Promise(r => setTimeout(r, 5000)); // Delay for block verification
                            }
                        }
                    }

                    break;
                
                case TYPE.HANDSHAKE:
                    const address = _message.data;

                    if (connectedNodes <= MAX_PEERS) {
                        try {
                            connect(MY_ADDRESS, address);
                        } catch(e) {
                            // Debug console.log(e);
                        }
                    }
            }
        });
    });

    if (!ENABLE_CHAIN_REQUEST) {
        if ((await blockDB.keys().all()).length === 0) {
            // Initial state

            await stateDB.put(FIRST_ACCOUNT, Buffer.from(serializeState({ balance: INITIAL_SUPPLY, codeHash: EMPTY_HASH, nonce: 0, storageRoot: EMPTY_HASH })));

            await blockDB.put(chainInfo.latestBlock.blockNumber.toString(), Buffer.from(Block.serialize(chainInfo.latestBlock)));
            await bhashDB.put(chainInfo.latestBlock.hash, numToBuffer(chainInfo.latestBlock.blockNumber)); // Assign block number to the matching block hash
    
            await changeState(chainInfo.latestBlock, stateDB, codeDB);
        } else {
            chainInfo.latestBlock = Block.deserialize([...await blockDB.get( Math.max(...(await blockDB.keys().all()).map(key => parseInt(key))).toString() )]);
            chainInfo.difficulty = chainInfo.latestBlock.difficulty;
        }
    }

    try {
        PEERS.forEach(peer => connect(MY_ADDRESS, peer)); // Connect to peers
    } catch(e) {}

    // Sync chain
    let currentSyncBlock = 1;

    if (ENABLE_CHAIN_REQUEST) {
        const blockNumbers = await blockDB.keys().all();

        if (blockNumbers.length !== 0) {
            currentSyncBlock = Math.max(...blockNumbers.map(key => parseInt(key)));
        }

        if (currentSyncBlock === 1) {
            // Initial state

            await stateDB.put(FIRST_ACCOUNT, Buffer.from(serializeState({ balance: INITIAL_SUPPLY, codeHash: EMPTY_HASH, nonce: 0, storageRoot: EMPTY_HASH })));
        }

        setTimeout(async () => {
            for (const node of opened) {
                node.socket.send(
                    produceMessage(
                        TYPE.REQUEST_BLOCK,
                        { blockNumber: currentSyncBlock, requestAddress: MY_ADDRESS }
                    )
                );

                await new Promise(r => setTimeout(r, 5000)); // Delay for block verification
            }
        }, 5000);
    }

    if (ENABLE_MINING) loopMine(publicKey, ENABLE_CHAIN_REQUEST, ENABLE_LOGGING);
    if (ENABLE_RPC) rpc(RPC_PORT, { publicKey, mining: ENABLE_MINING, chainInfo }, sendTransaction, keyPair, stateDB, blockDB, bhashDB, codeDB);
}

// Function to connect to a node.
function connect(MY_ADDRESS, address) {
    if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
        const socket = new WS(address); // Get address's socket.

        // Open a connection to the socket.
        socket.on("open", async () => {
            for (const _address of [MY_ADDRESS, ...connected]) socket.send(produceMessage(TYPE.HANDSHAKE, _address));
            for (const node of opened) node.socket.send(produceMessage(TYPE.HANDSHAKE, address));

            // If the address already existed in "connected" or "opened", we will not push, preventing duplications.
            if (!opened.find(peer => peer.address === address) && address !== MY_ADDRESS) {
                opened.push({ socket, address });
            }

            if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
                connected.push(address);

                connectedNodes++;

                console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] Connected to ${address}.`);

                // Listen for disconnection, will remove them from "opened" and "connected".
                socket.on("close", () => {
                    opened.splice(connected.indexOf(address), 1);
                    connected.splice(connected.indexOf(address), 1);

                    console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] Disconnected from ${address}.`);
                });
            }
        });
    }

    return true;
}

// Function to broadcast a transaction.
async function sendTransaction(transaction) {
    sendMessage(produceMessage(TYPE.CREATE_TRANSACTION, transaction), opened);

    console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] Sent one transaction.`);

    await addTransaction(transaction, chainInfo, stateDB);
}

async function mine(publicKey, ENABLE_LOGGING) {
    function mine(block, difficulty) {
        return new Promise((resolve, reject) => {
            worker.addListener("message", message => resolve(message.result));

            worker.send({ type: "MINE", data: [block, difficulty] }); // Send a message to the worker thread, asking it to mine.
        });
    }

    // Create a new block.
    const block = new Block(
        chainInfo.latestBlock.blockNumber + 1, 
        Date.now(), 
        [], // Will add transactions down here 
        chainInfo.difficulty, 
        chainInfo.latestBlock.hash,
        SHA256(publicKey)
    );

    // Collect a list of transactions to mine
    const transactionsToMine = [], states = {}, code = {}, storage = {}, skipped = {};
    let totalContractGas = 0n, totalTxGas = 0n;

    const existedAddresses = await stateDB.keys().all();

    for (const tx of chainInfo.transactionPool) {
        if (totalContractGas + BigInt(tx.additionalData.contractGas || 0) >= BigInt(BLOCK_GAS_LIMIT)) break;

        const txSenderPubkey = Transaction.getPubKey(tx);
        const txSenderAddress = SHA256(txSenderPubkey);

        if (skipped[txSenderAddress]) continue; // Check if transaction is from an ignored address.

        const totalAmountToPay = BigInt(tx.amount) + BigInt(tx.gas) + BigInt(tx.additionalData.contractGas || 0);

        // Normal coin transfers
        if (!states[txSenderAddress]) {
            const senderState = deserializeState(await stateDB.get(txSenderAddress));

            states[txSenderAddress] = senderState;
            code[senderState.codeHash] = await codeDB.get(senderState.codeHash);

            if (senderState.codeHash !== EMPTY_HASH || BigInt(senderState.balance) < totalAmountToPay) {
                skipped[txSenderAddress] = true;
                continue;
            }
    
            states[txSenderAddress].balance = (BigInt(senderState.balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
        } else {
            if (states[txSenderAddress].codeHash !== EMPTY_HASH || BigInt(states[txSenderAddress].balance) < totalAmountToPay) {
                skipped[txSenderAddress] = true;
                continue;
            }

            states[txSenderAddress].balance = (BigInt(states[txSenderAddress].balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
        }

        if (!existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
            states[tx.recipient] = { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storageRoot: EMPTY_HASH }
            code[EMPTY_HASH] = "";
        }
    
        if (existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
            states[tx.recipient] = deserializeState(await stateDB.get(tx.recipient));
            code[states[tx.recipient].codeHash] = await codeDB.get(states[tx.recipient].codeHash);
        }
    
        states[tx.recipient].balance = (BigInt(states[tx.recipient].balance) + BigInt(tx.amount)).toString();

        // Contract deployment
        if (
            states[txSenderAddress].codeHash === EMPTY_HASH &&
            typeof tx.additionalData.scBody === "string"
        ) {
            states[txSenderAddress].codeHash = SHA256(tx.additionalData.scBody);
            code[states[txSenderAddress].codeHash] = tx.additionalData.scBody
        }

        // Update nonce
        states[txSenderAddress].nonce += 1;

        // Decide to drop or add transaction to block
        if (BigInt(states[txSenderAddress].balance) < 0n) {
            skipped[txSenderAddress] = true;
            continue;
        } else {
            transactionsToMine.push(tx);

            totalContractGas += BigInt(tx.additionalData.contractGas || 0);
            totalTxGas += BigInt(tx.gas) + BigInt(tx.additionalData.contractGas || 0);
        }

        // Contract execution
        if (states[tx.recipient].codeHash !== EMPTY_HASH) {
            const contractInfo = { address: tx.recipient };
            
            const [ newState, newStorage ] = await jelscript(code[states[tx.recipient].codeHash], states, BigInt(tx.additionalData.contractGas || 0), stateDB, block, tx, contractInfo, false);

            for (const account of Object.keys(newState)) {
                states[account] = newState[account];

                storage[tx.recipient] = newStorage;
            }
        }
    }

    const transactionsAsObj = [...transactionsToMine];

    block.transactions = transactionsToMine.map(tx => Transaction.serialize(tx)); // Add transactions to block
    block.hash = Block.getHash(block); // Re-hash with new transactions
    block.txRoot = buildMerkleTree(indexTxns(block.transactions)).val; // Re-gen transaction root with new transactions

    // Mine the block.
    mine(block, chainInfo.difficulty)
        .then(async result => {
            // If the block is not mined before, we will add it to our chain and broadcast this new block.
            if (!mined) {
                await updateDifficulty(result, chainInfo, blockDB); // Update difficulty

                await blockDB.put(result.blockNumber.toString(), Buffer.from(Block.serialize(result))); // Add block to chain
                await bhashDB.put(result.hash, numToBuffer(result.blockNumber)); // Assign block number to the matching block hash

                chainInfo.latestBlock = result; // Update chain info

                // Reward

                if (!existedAddresses.includes(result.coinbase) && !states[result.coinbase]) {
                    states[result.coinbase] = { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storageRoot: EMPTY_HASH }
                    code[EMPTY_HASH] = "";
                }
            
                if (existedAddresses.includes(result.coinbase) && !states[result.coinbase]) {
                    states[result.coinbase] = deserializeState(await stateDB.get(result.coinbase));
                    code[states[result.coinbase].codeHash] = await codeDB.get(states[result.coinbase].codeHash);
                }

                let gas = 0n;

                for (const tx of transactionsAsObj) { gas += BigInt(tx.gas) + BigInt(tx.additionalData.contractGas || 0) }

                states[result.coinbase].balance = (BigInt(states[result.coinbase].balance) + BigInt(BLOCK_REWARD) + gas).toString();

                // Transit state
                for (const address in storage) {
                    const storageDB = new Level(__dirname + "/../log/accountStore/" + address);
                    const keys = Object.keys(storage[address]);
        
                    states[address].storageRoot = buildMerkleTree(keys.map(key => key + " " + storage[address][key])).val;
        
                    for (const key of keys) {
                        await storageDB.put(key, storage[address][key]);
                    }
        
                    await storageDB.close();
                }
        
                for (const account of Object.keys(states)) {
                    await stateDB.put(account, Buffer.from(serializeState(states[account])));
        
                    await codeDB.put(states[account].codeHash, code[states[account].codeHash]);
                }

                // Update the new transaction pool (remove all the transactions that are no longer valid).
                chainInfo.transactionPool = await clearDepreciatedTxns(chainInfo, stateDB);

                sendMessage(produceMessage(TYPE.NEW_BLOCK, Block.serialize(chainInfo.latestBlock)), opened); // Broadcast the new block

                console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] Block #${chainInfo.latestBlock.blockNumber} mined and synced, state transited.`);
            } else {
                mined = false;
            }

            // Re-create the worker thread
            worker.kill();

            worker = fork(`${__dirname}/../miner/worker.js`);
        })
        .catch(err => console.log(`\x1b[31mERROR\x1b[0m [${(new Date()).toISOString()}] Error at mining child process`, err));
}

// Function to mine continuously
function loopMine(publicKey, ENABLE_CHAIN_REQUEST, ENABLE_LOGGING, time = 1000) {
    let length = chainInfo.latestBlock.blockNumber;
    let mining = true;

    setInterval(async () => {
        if (mining || length !== chainInfo.latestBlock.blockNumber) {
            mining = false;
            length = chainInfo.latestBlock.blockNumber;

            if (!ENABLE_CHAIN_REQUEST) await mine(publicKey, ENABLE_LOGGING);
        }
    }, time);
}

module.exports = { startServer };

