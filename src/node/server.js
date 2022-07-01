"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const WS = require("ws");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const { Level } = require('level');
const { fork } = require("child_process");

const Block = require("../core/block");
const Transaction = require("../core/transaction");
const changeState = require("../core/state");
const { log16 } = require("../utils/utils");
const { BLOCK_REWARD, BLOCK_TIME } = require("../config.json");
const { produceMessage, sendMessage } = require("./message");
const generateGenesisBlock = require("../core/genesis");
const addTransaction = require("../core/txPool");
const rpc = require("../rpc/rpc");
const generateMerkleRoot = require("../core/merkle");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

const opened    = [];  // Addresses and sockets from connected nodes.
const connected = [];  // Addresses from connected nodes.

let worker = fork(`${__dirname}/../miner/worker.js`); // Worker thread (for PoW mining).
let mined = false; // This will be used to inform the node that another node has already mined before it.

const chainInfo = {
    transactionPool: [],
    latestBlock: generateGenesisBlock(), 
    latestSyncBlock: null,
    difficulty: 1
};

let stateDB = new Level(__dirname + "/../log/stateStore", { valueEncoding: "json" });
let blockDB = new Level(__dirname + "/../log/blockStore", { valueEncoding: "json" });

async function startServer(options) {
    const PORT                 = options.PORT || 3000;                        // Node's PORT
    const RPC_PORT             = options.RPC_PORT || 5000;                    // RPC server's PORT
    const PEERS                = options.PEERS || [];                         // Peers to connect to
    const MY_ADDRESS           = options.MY_ADDRESS || "ws://localhost:3000"; // Node's address
    const ENABLE_MINING        = options.ENABLE_MINING ? true : false;        // Enable mining?
    const ENABLE_LOGGING       = options.ENABLE_LOGGING ? true : false;       // Enable logging?
    const ENABLE_RPC           = options.ENABLE_RPC ? true : false;           // Enable RPC server?
    const SYNC_FROM            = options.SYNC_FROM || "";
    let   ENABLE_CHAIN_REQUEST = options.ENABLE_CHAIN_REQUEST ? true : false; // Enable chain sync request?

    const privateKey = options.PRIVATE_KEY || ec.genKeyPair().getPrivate("hex");
    const keyPair = ec.keyFromPrivate(privateKey, "hex");
    const publicKey = keyPair.getPublic("hex");

    let privateKeyForSync = ec.genKeyPair().getPrivate("hex");
    let keyPairForSync = ec.keyFromPrivate(privateKeyForSync, "hex");
    let publicKeyForSync = keyPairForSync.getPublic("hex");

    process.on("uncaughtException", err => console.log("LOG ::", err));

    const server = new WS.Server({ port: PORT });

    console.log("LOG :: Listening on PORT", PORT);

    server.on("connection", async (socket, req) => {
        // Message handler
        socket.on("message", async message => {
            // Parse binary message to JSON
            const _message = JSON.parse(message);

            switch (_message.type) {
                // Below are handlers for every message types.

                case "TYPE_NEW_BLOCK":
                    // "TYPE_NEW_BLOCK" is sent when someone wants to submit a new block.
                    // Its message body must contain the new block and the new difficulty.

                    const newBlock = _message.data;

                    // We will only continue checking the block if its parentHash is not the same as the latest block's hash.
                    // This is because the block sent to us is likely duplicated or from a node that has lost and should be discarded.

                    if (newBlock.parentHash !== chainInfo.latestBlock.parentHash) {
                        // Check if the block is valid or not, if yes, we will push it to the chain, update the difficulty, chain state and the transaction pool.
                        
                        // A block is valid under these factors:
                        // - The hash of this block is equal to the hash re-generated according to the block's info.
                        // - The block is mined (the hash starts with (4+difficulty) amount of zeros).
                        // - Transactions in the block are valid.
                        // - Block's timestamp is not greater than the current timestamp and is not lower than the previous block's timestamp.
                        // - Block's parentHash is equal to latest block's hash
                        // - The new difficulty can only be greater than 1 or lower than 1 compared to the old difficulty.

                        if (
                            SHA256(
                                newBlock.blockNumber.toString()       + 
                                newBlock.timestamp.toString()         + 
                                newBlock.txRoot                       + 
                                newBlock.difficulty.toString()        +
                                chainInfo.latestBlock.hash            +
                                newBlock.nonce.toString()
                            ) === newBlock.hash &&
                            newBlock.hash.startsWith("00000" + Array(Math.floor(log16(chainInfo.difficulty)) + 1).join("0")) &&
                            await Block.hasValidTransactions(newBlock, stateDB) &&
                            newBlock.timestamp > chainInfo.latestBlock.timestamp &&
                            newBlock.timestamp < Date.now() &&
                            chainInfo.latestBlock.hash === newBlock.parentHash &&
                            newBlock.blockNumber - 1 === chainInfo.latestBlock.blockNumber &&
                            newBlock.difficulty === chainInfo.difficulty &&
                            generateMerkleRoot(newBlock.transactions) === newBlock.txRoot
                        ) {
                            console.log("LOG :: New block received.");

                            // If mining is enabled, we will set mined to true, informing that another node has mined before us.
                            if (ENABLE_MINING) {
                                mined = true;

                                // Stop the worker thread
                                worker.kill();

                                worker = fork(`${__dirname}/../miner/worker.js`);
                            }

                            // Update difficulty
                            if (newBlock.blockNumber % 100 === 0) {
                                const oldBlock = await blockDB.get((newBlock.blockNumber - 99).toString());

                                chainInfo.difficulty = Math.ceil(chainInfo.difficulty * 100 * BLOCK_TIME / (newBlock.timestamp - oldBlock.timestamp));
                            }

                            // Add block to chain
                            await blockDB.put(newBlock.blockNumber.toString(), newBlock);

                            chainInfo.latestBlock = newBlock;

                            // Transist state
                            await changeState(newBlock, stateDB, ENABLE_LOGGING);

                            // Update the new transaction pool (remove all the transactions that are no longer valid).
                            const newTransactionPool = [];

                            for (const tx of chainInfo.transactionPool) {
                                if (await Transaction.isValid(tx, stateDB)) newTransactionPool.push(tx);
                            }

                            chainInfo.transactionPool = newTransactionPool;

                            sendMessage(produceMessage("TYPE_NEW_BLOCK", newBlock), opened);

                            console.log(`LOG :: Block #${newBlock.blockNumber} synced, state transisted.`);
                        }
                    }

                    break;
                
                case "TYPE_CREATE_TRANSACTION":
                    // "TYPE_CREATE_TRANSACTION" is sent when someone wants to submit a transaction.
                    // Its message body must contain a transaction.

                    const transaction = _message.data;

                    // Transactions are added into "chainInfo.transactions", which is the transaction pool.
                    // To be added, transactions must be valid, and they are valid under these criterias:
                    // - They are valid based on Transaction.isValid
                    // - The balance of the sender is enough to make the transaction (based on his transactions in the pool).
                    // - Its timestamp are not already used.

                    // After transaction is added, the transaction must be broadcasted to others since the sender might only send it to a few nodes.
    
                    // This is pretty much the same as addTransaction, but we will send the transaction to other connected nodes if it's valid.

                    if (!(await stateDB.keys().all()).includes(transaction.sender)) break;

                    const dataFromSender = await stateDB.get(transaction.sender); // Fetch sender's state object
                    const senderBalance = dataFromSender.balance; // Get sender's balance
                    
                    let balance = senderBalance - transaction.amount - transaction.gas;
    
                    chainInfo.transactionPool.forEach(tx => {
                        if (tx.sender === transaction.sender) {
                            balance -= tx.amount + tx.gas;
                        }
                    });
    
                    if (
                        await Transaction.isValid(transaction, stateDB) && 
                        balance >= 0 && 
                        !chainInfo.transactionPool.filter(_tx => _tx.sender === transaction.sender).some(_tx => _tx.timestamp === transaction.timestamp)
                    ) {
                        console.log("LOG :: New transaction received.");
    
                        chainInfo.transactionPool.push(transaction);
                        // Broadcast the transaction
                        sendTransaction(transaction);
                    }
    
                    break;

                case "TYPE_REQUEST_CHAIN":
                    // "TYPE_REQUEST_CHAIN" is sent when someone wants to receive someone's chain.
                    // Its body must contain the sender's address to send back.

                    // It will also contain a private key, the receiver will generate a signature
                    // from the key, with the data to sign is the block itself. This is used to 
                    // prove that the sender is the correct one.
    
                    const _address = _message.data.address;
                    const privateKey = _message.data.privateKeyForSync;
                    const keyPair = ec.keyFromPrivate(privateKey, "hex");

                    console.log(`LOG :: Chain request received, started sending blocks.`);
                    
                    const socket = opened.find(node => node.address === _address).socket;

                    // Loop over the chain, sending each block in each message.
                    for (let count = 1; count <= chainInfo.latestBlock.blockNumber; count++) {
                        const block = await blockDB.get(count.toString());

                        socket.send(produceMessage(
                            "TYPE_SEND_CHAIN",
                            { 
                                block, 
                                finished: count === chainInfo.latestBlock.blockNumber,
                                sig: keyPair.sign(SHA256(JSON.stringify(block)), "base64").toDER("hex")
                            }
                        ));
                    }
    
                    console.log(`LOG :: Blocks sent, chain request fulfilled.`);
    
                    break;
                
                case "TYPE_SEND_CHAIN":
                    // "TYPE_SEND_CHAIN" is sent as a reply for "TYPE_REQUEST_CHAIN".
                    // It must contain a block and a boolean value to identify if the chain is fully sent or not.

                    // It will also contain a signature, we will then verify if the signature is correct or not,
                    // if yes, then the sender is the correct one and we will proceed.

                    if (ENABLE_CHAIN_REQUEST) {
                        const { block, finished, sig } = _message.data;

                        if (ec.keyFromPublic(publicKeyForSync, "hex").verify(SHA256(JSON.stringify(block)), sig)) {
                            if (
                                chainInfo.latestSyncBlock === null // If latest synced block is null then we immediately add the block into the chain without verification.
                                ||                                 // This happens due to the fact that the genesis block can discard every possible set rule ¯\_(ツ)_/¯
                                (SHA256(
                                    block.blockNumber.toString()       + 
                                    block.timestamp.toString()         + 
                                    block.txRoot                       + 
                                    block.difficulty.toString()        +
                                    chainInfo.latestSyncBlock.hash     +
                                    block.nonce.toString()
                                ) === block.hash &&
                                block.hash.startsWith("00000" + Array(Math.floor(log16(chainInfo.difficulty)) + 1).join("0")) &&
                                await Block.hasValidTransactions(block, stateDB) &&
                                block.timestamp > chainInfo.latestSyncBlock.timestamp &&
                                block.timestamp < Date.now() &&
                                chainInfo.latestBlock.hash === block.parentHash &&
                                block.blockNumber - 1 === chainInfo.latestBlock.blockNumber &&
                                block.difficulty === chainInfo.difficulty) &&
                                block.txRoot === generateMerkleRoot(block.transactions)
                            ) {
                                // Update difficulty
                                if (block.blockNumber % 100 === 0) {
                                    const oldBlock = await blockDB.get((block.blockNumber - 99).toString());
                        
                                    chainInfo.difficulty = Math.ceil(chainInfo.difficulty * 100 * BLOCK_TIME / (block.timestamp - oldBlock.timestamp));
                                }
                        
                                await blockDB.put(block.blockNumber.toString(), block);
                        
                                chainInfo.latestSyncBlock = block;
                        
                                // Transist state
                                await changeState(block, stateDB);
    
                                if (finished) {
                                    ENABLE_CHAIN_REQUEST = false;
                                    chainInfo.latestBlock = chainInfo.latestSyncBlock;
    
                                    console.log(`LOG :: Synced new chain.`);
                                }
                            } else {
                                ENABLE_CHAIN_REQUEST = false;
    
                                for (const key of (await stateDB.keys().all())) {
                                    await stateDB.del(key);
                                }
    
                                for (const key of (await blockDB.keys().all())) {
                                    await blockDB.del(key);
                                }
    
                                await blockDB.put(chainInfo.latestBlock.blockNumber.toString(), chainInfo.latestBlock);
                        
                                chainInfo.difficulty = 1;
                        
                                await changeState(chainInfo.latestBlock, stateDB);
    
                                console.log(`LOG :: Received chain is not valid, recreating from genesis.`);
                            }
                        }
                    }

                    break;
                
                case "TYPE_HANDSHAKE":
                    const address = _message.data;

                    connect(MY_ADDRESS, address);
            }
        });
    });

    if (!ENABLE_CHAIN_REQUEST) {
        if ((await blockDB.keys().all()).length === 0) {
            await blockDB.put(chainInfo.latestBlock.blockNumber.toString(), chainInfo.latestBlock);
    
            await changeState(chainInfo.latestBlock, stateDB);
        } else {
            chainInfo.latestBlock = await blockDB.get( Math.max(...(await blockDB.keys().all()).map(key => parseInt(key))).toString() );
            chainInfo.difficulty = chainInfo.latestBlock.difficulty;
        }
    }

    for (const peer of PEERS) {
        connect(MY_ADDRESS, peer);
    }

    if (ENABLE_CHAIN_REQUEST) {
        for (const key of (await stateDB.keys().all())) {
            await stateDB.del(key);
        }

        for (const key of (await blockDB.keys().all())) {
            await blockDB.del(key);
        }

        new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                throw new Error(`LOG :: Timeout when connecting to ${SYNC_FROM} to sync.`);
            }, 60000);
            
            setInterval(() => {
                if (connected.includes(SYNC_FROM)) {
                    clearTimeout(timeout);
                    resolve();
                }
            }, 100);
        })
        .then(() => {
            const socket = opened.find(node => node.address === SYNC_FROM).socket;

            socket.send(produceMessage("TYPE_REQUEST_CHAIN", {
                address: MY_ADDRESS,
                privateKeyForSync
            }));
        })
        .catch(async (err) => {
            console.log(err);

            if ((await blockDB.keys().all()).length === 0) {
                await blockDB.put(chainInfo.latestBlock.blockNumber.toString(), chainInfo.latestBlock);
        
                await changeState(chainInfo.latestBlock, stateDB);
            } else {
                chainInfo.latestBlock = await blockDB.get( Math.max(...(await blockDB.keys().all()).map(key => parseInt(key))).toString() );
                chainInfo.difficulty = chainInfo.latestBlock.difficulty;
            }
        })
    }

    if (ENABLE_MINING) loopMine(publicKey, ENABLE_CHAIN_REQUEST, ENABLE_LOGGING);
    if (ENABLE_RPC) rpc(RPC_PORT, { publicKey }, sendTransaction, stateDB, blockDB);
}

function connect(MY_ADDRESS, address) {
    if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
        // Get address's socket.
        const socket = new WS(address);

        // Open a connection to the socket.
        socket.on("open", async () => {
            for (const _address of [MY_ADDRESS, ...connected]) {
                socket.send(produceMessage("TYPE_HANDSHAKE", _address));
            }
            
            for (const node of opened) {
                node.socket.send(produceMessage("TYPE_HANDSHAKE", address));
            }

            // If the address already existed in "connected" or "opened", we will not push, preventing duplications.
            if (!opened.find(peer => peer.address === address) && address !== MY_ADDRESS) {
                opened.push({ socket, address });
            }

            if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
                connected.push(address);

                console.log(`LOG :: Connected to ${address}.`);
            }
        });

        // Listen for disconnection, will remove them from "opened" and "connected".
        socket.on("close", () => {
            opened.splice(connected.indexOf(address), 1);
            connected.splice(connected.indexOf(address), 1);

            console.log(`LOG :: Disconnected from ${address}.`);
        });
    }

    return true;
}

// Function to broadcast a transaction
async function sendTransaction(transaction) {
    sendMessage(produceMessage("TYPE_CREATE_TRANSACTION", transaction), opened);

    await addTransaction(transaction, chainInfo.transactionPool, stateDB);

    console.log("LOG :: Sent one transaction, added transaction to pool.");
}

function mine(publicKey, ENABLE_LOGGING) {
    // Send a message to the worker thread, asking it to mine.
    function mine(block, difficulty) {
        return new Promise((resolve, reject) => {
            worker.addListener("message", message => resolve(message.result));

            worker.send({ type: "MINE", data: [block, difficulty] });
        });
    }

    // We will collect all the gas fee and add it to the mint transaction, along with the fixed mining reward.
    let gas = 0;

    chainInfo.transactionPool.forEach(transaction => { gas += transaction.gas });

    // Mint transaction for miner's reward.
    const rewardTransaction = new Transaction(MINT_PUBLIC_ADDRESS, publicKey, BLOCK_REWARD + gas);
    Transaction.sign(rewardTransaction, MINT_KEY_PAIR);

    // Create a new block.
    const block = new Block(
        chainInfo.latestBlock.blockNumber + 1, 
        Date.now(), 
        [rewardTransaction, ...chainInfo.transactionPool], 
        chainInfo.difficulty, 
        chainInfo.latestBlock.hash
    );

    // Mine the block.
    mine(block, chainInfo.difficulty)
        .then(async result => {
            // If the block is not mined before, we will add it to our chain and broadcast this new block.
            if (!mined) {
                // Update difficulty
                if (result.blockNumber % 100 === 0) {
                    const oldBlock = await blockDB.get((result.blockNumber - 99).toString());

                    chainInfo.difficulty = Math.ceil(chainInfo.difficulty * 100 * BLOCK_TIME / (result.timestamp - oldBlock.timestamp));
                }

                // Add block to chain
                await blockDB.put(result.blockNumber.toString(), result);

                chainInfo.latestBlock = result;

                // Transist state
                await changeState(chainInfo.latestBlock, stateDB, ENABLE_LOGGING);

                chainInfo.transactionPool.splice(0, result.transactions.length-1);

                // Broadcast the new block
                sendMessage(produceMessage("TYPE_NEW_BLOCK", chainInfo.latestBlock), opened);

                console.log(`LOG :: Block #${chainInfo.latestBlock.blockNumber} mined and synced, state transisted.`);
            } else {
                mined = false;
            }

            // Re-create the worker thread
            worker.kill();

            worker = fork(`${__dirname}/../miner/worker.js`);
        })
        .catch(err => console.log(err));
}

// Mine continuously
function loopMine(publicKey, ENABLE_CHAIN_REQUEST, ENABLE_LOGGING, time = 1000) {
    let length = chainInfo.latestBlock.blockNumber;
    let mining = true;

    setInterval(() => {
        if (mining || length !== chainInfo.latestBlock.blockNumber) {
            mining = false;
            length = chainInfo.latestBlock.blockNumber;

            if (!ENABLE_CHAIN_REQUEST) mine(publicKey, ENABLE_LOGGING);
        }
    }, time);
}

module.exports = { startServer };
