"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const WS = require("ws");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const { fork } = require("child_process");
const Block = require("./block");
const Transaction = require("./transaction");
const Blockchain = require("./blockchain");
const jelscript = require("./jelscript");

// The main chain
const JeChain = new Blockchain();

// Node's keys
const privateKey = process.env.PRIVATE_KEY || ec.genKeyPair().getPrivate("hex");
const keyPair = ec.keyFromPrivate(privateKey, "hex");
const publicKey = keyPair.getPublic("hex");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

const PORT = process.env.PORT || 3000;
const PEERS = process.env.PEERS ? process.env.PEERS.split(",") : [];
const MY_ADDRESS = process.env.MY_ADDRESS || "ws://localhost:3000";
const ENABLE_MINING = process.env.ENABLE_MINING === "true" ? true : false;
const ENABLE_LOGGING = process.env.ENABLE_LOGGING === "true" ? true : false;
const server = new WS.Server({ port: PORT });

let ENABLE_CHAIN_REQUEST = false;

// Addresses and sockets from connected nodes.
const opened = [];
// Addresses from connected nodes.
const connected = [];

// A blank, unused chain used only for getting others' chain.
let tempChain = new Blockchain();
// Worker thread
let worker = fork(`${__dirname}/worker.js`);
// This will be used to inform the node that another node has already mined before it.
let mined = false;

console.log("LOG :: Listening on PORT", PORT);

// Listening to connection
server.on("connection", async (socket, req) => {
    // Message handler
    socket.on("message", message => {
        // Parse binary message to JSON
        const _message = JSON.parse(message);

        switch(_message.type) {
            // Below are handlers for every message types.

            case "TYPE_REPLACE_CHAIN":
                // "TYPE_REPLACE_CHAIN" is sent when someone wants to submit a new block.
                // Its message body must contain the new block and the new difficulty.

                const [ newBlock, newDiff ] = _message.data;

                // We will only continue checking the block if its prevHash is not the same as the latest block's hash.
                // This is because the block sent to us is likely duplicated or from a node that has lost and should be discarded.
                if (newBlock.prevHash !== JeChain.getLastBlock().prevHash) {
                    // Check if the block is valid or not, if yes, we will push it to the chain, update the difficulty, chain state and the transaction pool.
                    
                    // A block is valid under these factors:
                    // - The hash of this block is equal to the hash re-generated according to the block's info.
                    // - The block is mined (the hash starts with (4+difficulty) amount of zeros).
                    // - Transactions in the block are valid.
                    // - Block's timestamp is not greater than the current timestamp and is not lower than the previous block's timestamp.
                    // - Block's prevHash is equal to latest block's hash
                    // - The new difficulty can only be greater than 1 or lower than 1 compared to the old difficulty.

                    if (
                        SHA256(newBlock.blockNumber.toString() + JeChain.getLastBlock().hash + newBlock.timestamp + JSON.stringify(newBlock.data) + newBlock.difficulty + newBlock.nonce) === newBlock.hash &&
                        newBlock.hash.startsWith("0000" + Array(JeChain.difficulty + 1).join("0")) &&
                        Block.hasValidTransactions(newBlock, JeChain) &&
                        (parseInt(newBlock.timestamp) > parseInt(JeChain.getLastBlock().timestamp) || JeChain.getLastBlock().timestamp === "") &&
                        parseInt(newBlock.timestamp) < Date.now() &&
                        JeChain.getLastBlock().hash === newBlock.prevHash &&
                        (newDiff + 1 === JeChain.difficulty || newDiff - 1 === JeChain.difficulty) &&
                        newBlock.blockNumber - 1 === JeChain.getLastBlock().blockNumber &&
                        newBlock.difficulty === JeChain.difficulty
                    ) {
                        console.log("LOG :: New block received.");

                        JeChain.chain.push(newBlock);
                        JeChain.difficulty = newDiff;
                        // Update the new transaction pool (remove all the transactions that are no longer valid).
                        JeChain.transactions = JeChain.transactions.filter(tx => Transaction.isValid(tx, JeChain));

                        // Transist state
                        changeState(newBlock);

                        // Trigger contracts
                        triggerContract(newBlock);

                        // If mining is enabled, we will set mined to true, informing that another node has mined before us.
                        if (ENABLE_MINING) {
                            mined = true;

                            // Stop the worker thread
                            worker.kill();

                            worker = fork(`${__dirname}/worker.js`);
                        }

                        // Send the block to other nodes
                        sendMessage(produceMessage("TYPE_REPLACE_CHAIN", [
                            newBlock,
                            newDiff
                        ]));

                        console.log(`LOG :: Block #${JeChain.chain.length} synced, state transisted.`);
                    }
                }

                break;

            case "TYPE_CREATE_TRANSACTION":
                // "TYPE_CREATE_TRANSACTION" is sent when someone wants to submit a transaction.
                // Its message body must contain a transaction.

                const transaction = _message.data;

                // Transactions are added into "JeChain.transactions", which is the transaction pool.
                // To be added, transactions must be valid, and they are valid under these criterias:
                // - They are valid based on Transaction.isValid
                // - The balance of the sender is enough to make the transaction (based his transactions the pool).
                // - Its timestamp are not already used.
                
                // After adding the transaction, the transaction must also be broadcasted to all nodes,
                // since the sender might only send it to a group of nodes.

                // This is pretty much the same as JeChain.addTransaction, but we will send the transaction
                // to other connected nodes if it's valid.
                
                let balance = JeChain.getBalance(transaction.from) - transaction.amount - transaction.gas;

                JeChain.transactions.forEach(tx => {
                    if (tx.from === transaction.from) {
                        balance -= tx.amount + tx.gas;
                    }
                });

                if (
                    Transaction.isValid(transaction, JeChain) && 
                    balance >= 0 && 
                    !JeChain.transactions.filter(_tx => _tx.from === transaction.from).some(_tx => _tx.timestamp === transaction.timestamp)
                ) {
                    console.log("LOG :: New transaction received.");

                    JeChain.transactions.push(transaction);
                    // Broadcast the transaction
                    sendTransaction(transaction);
                }

                break;

            case "TYPE_REQUEST_CHAIN":
                // "TYPE_REQUEST_CHAIN" is sent when someone wants to receive someone's chain.
                // Its body must contain the sender's address to send back.

                console.log(`LOG :: Chain request received from #${_message.data}, started sending blocks.`);

                // Get the socket from the address sent
                const socket = opened.find(node => node.address === _message.data).socket;
                
                // Loop over the chain, sending each block in each message.
                for (let i = 1; i < JeChain.chain.length; i++) {
                    socket.send(produceMessage(
                        "TYPE_SEND_CHAIN",
                        {
                            block: JeChain.chain[i],
                            // It is finished when the last block is sent.
                            finished: i === JeChain.chain.length - 1
                        }
                    ));
                }

                console.log(`LOG :: Blocks sent to ${_message.data}.`);

                break;

            case "TYPE_SEND_CHAIN":
                // "TYPE_SEND_CHAIN" is sent as a reply for "TYPE_REQUEST_CHAIN".
                // It must contain a block and a boolean value to identify if the chain is fully sent or not.

                if (ENABLE_CHAIN_REQUEST) {
                    const { block, finished } = _message.data;

                    // If the chain is not complete, it will simply push in the chain.
                    // When it is finished, it will check if the chain is valid or not, and then decides to change the chain or not.

                    if (!finished) {
                        tempChain.chain.push(block);
                    } else {
                        tempChain.chain.push(block);

                        if (Blockchain.isValid(tempChain)) {
                            JeChain.chain = tempChain.chain;
                        }

                        tempChain = new Blockchain();

                        console.log(`LOG :: Synced new chain from temp chain.`);

                        ENABLE_CHAIN_REQUEST = false;
                    }

                    break;
                }

            case "TYPE_REQUEST_INFO":
                // "TYPE_REQUEST_INFO" is sent when someone wants to receive someone's chain\'s information (difficulty, tx pool, chain state).
                // Its body must contain the sender's address to send back.

                console.log(`LOG :: Chain data request received from #${_message.data}, started sending blocks.`);

                // Find the socket that matches with the address and send them back needed info.
                opened.find(node => node.address === _message.data).socket.send(produceMessage(
                    "TYPE_SEND_INFO",
                    [JeChain.difficulty, JeChain.transactions, JeChain.state]
                ));

                console.log(`LOG :: Chain data sent to ${_message.data}.`);

                break;

            case "TYPE_SEND_INFO":
                // "TYPE_SEND_INFO" is sent as a reply for "TYPE_REQUEST_INFO".
                // It must contain a block and a boolean value to identify if the chain is fully sent or not.

                if (ENABLE_CHAIN_REQUEST) {
                    // Update difficulty, tx pool and chain state.
                    [ JeChain.difficulty, JeChain.transactions, JeChain.state ] = _message.data;

                    console.log(`LOG :: Synced new chain information.`);

                    ENABLE_CHAIN_REQUEST = false;
                }
                
                break;

            // Handshake message used to connect to other nodes.
            case "TYPE_HANDSHAKE":
                connect(_message.data);
        }
    });
})

async function connect(address) {
    if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
        // Get address's socket.
        const socket = new WS(address);

        // Open a connection to the socket.
        socket.on("open", () => {
            [MY_ADDRESS, ...connected].forEach(_address => socket.send(produceMessage("TYPE_HANDSHAKE", _address)));
            
            opened.forEach(node => node.socket.send(produceMessage("TYPE_HANDSHAKE", address)));

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
}

function produceMessage(type, data) {
    // Produce a JSON message
    return JSON.stringify({ type, data });
}

function sendMessage(message) {
    // Broadcast message to all nodes
    opened.forEach(node => node.socket.send(message));
}

function changeState(newBlock) {
    newBlock.data.forEach(tx => {
        // If the address doesn't already exist in the chain state, we will create a new empty one.

        if (!JeChain.state[tx.to]) {
            JeChain.state[tx.to] = {
                balance: 0,
                body: "",
                timestamps: [],
                storage: {}
            };
        }

        if (!JeChain.state[tx.from]) {
            JeChain.state[tx.from] = {
                balance: 0,
                body: "",
                timestamps: [],
                storage: {}
            };

            if (tx.to.startsWith("SC")) {
                JeChain.state[tx.from].body = tx.to;
            }
        // If one's state already exists, but with no contract deployed, we can deploy a contract, but we can't 
        // re-deploy it later, maintaining immutability. 
        } else if (tx.to.startsWith("SC") && !JeChain.state[tx.to].body) {
            JeChain.state[tx.from].body = tx.to;
        }

        // Transist state
        JeChain.state[tx.to].balance += tx.amount;
        JeChain.state[tx.from].balance -= tx.amount + tx.gas;

        // Add used timestamps
        JeChain.state[tx.from].timestamps.push(tx.timestamp);
    });
}

function triggerContract(newBlock) {
    // Loops though every transactions in a block, if the recipient is a contract address (the body is not empty) and 
    // the gas fee is suitable, the contract will be executed.
    newBlock.data.forEach(tx => {
        if (JeChain.state[tx.to].body && tx.amount >= calculateGasFee(tx.to, tx.args)) {
            try {
                [JeChain.state[tx.to].storage, JeChain.state[tx.to].balance] = jelscript(
                    JeChain.state[tx.to].body.replace("SC", ""),
                    JeChain.state[tx.to].storage, 
                    JeChain.state[tx.to].balance, 
                    tx.args,
                    tx.from,
                    { difficulty: JeChain.difficulty, timestamp: JeChain.getLastBlock().timestamp },
                    tx.to,
                    !ENABLE_LOGGING
                );
            } catch (error) {
                console.log("Error at contract", tx.to, error);
            }
        }
    })
}

function calculateGasFee(contract, args, from = publicKey) {
    // Calculate the estimated gas fee by re-running the contract with a huge balance.
    const originalBalance = 100000000000000;
    const [, balance] = jelscript(
        JeChain.state[contract].body.replace("SC", ""),
        JeChain.state[contract].storage,
        originalBalance,
        args,
        from,
        { difficulty: JeChain.difficulty, timestamp: JeChain.getLastBlock().timestamp },
        contract,
        true
    );

    return originalBalance - balance;
}

function mine() {
    // Send a message to the worker thread, asking it to mine.
    function mine(block, difficulty) {
        return new Promise((resolve, reject) => {
            worker.addListener("message", message => resolve(message.result));

            worker.send({
                type: "MINE",
                data: [block, difficulty]
            });
        });
    }

    // We will collect all the gas fee and add it to the mint transaction, along with the fixed mining reward.
    let gas = 0;

    JeChain.transactions.forEach(transaction => {
        gas += transaction.gas;
    });

    // Mint transaction for miner's reward.
    const rewardTransaction = new Transaction(MINT_PUBLIC_ADDRESS, publicKey, JeChain.reward + gas);
    rewardTransaction.sign(MINT_KEY_PAIR);

    // Create a new block.
    const block = new Block(JeChain.chain.length + 1, Date.now().toString(), [rewardTransaction, ...JeChain.transactions], JeChain.difficulty);
    block.prevHash = JeChain.getLastBlock().hash;
    block.hash = Block.getHash(block);

    // Mine the block.
    mine(block, JeChain.difficulty)
        .then(result => {
            // If the block is not mined before, we will add it to our chain and broadcast this new block.
            if (!mined) {
                JeChain.chain.push(Object.freeze(result));

                JeChain.difficulty += Date.now() - parseInt(JeChain.getLastBlock().timestamp) < JeChain.blockTime ? 1 : -1;

                if (JeChain.difficulty < 1) {
                    JeChain.difficulty = 1;
                }

                JeChain.transactions = [];

                // Transist state
                changeState(JeChain.getLastBlock());

                // Triggering all contracts
                triggerContract(JeChain.getLastBlock());

                // Broadcast the new block
                sendMessage(produceMessage("TYPE_REPLACE_CHAIN", [
                    JeChain.getLastBlock(),
                    JeChain.difficulty
                ]));
            } else {
                mined = false;
            }

            console.log(`LOG :: Block #${JeChain.chain.length} mined and synced, state transisted.`);

            // Re-create the worker thread
            worker.kill();

            worker = fork(`${__dirname}/worker.js`);
        })
        .catch(err => console.log(err));
}

// Mine continuously
function loopMine(time = 1000) {
    let length = JeChain.chain.length;
    let mining = true;

    setInterval(() => {
        if (mining || length !== JeChain.chain.length) {
            mining = false;
            length = JeChain.chain.length;

            mine();
        }
    }, time);
}

// Broadcast a transaction
function sendTransaction(transaction) {
    sendMessage(produceMessage("TYPE_CREATE_TRANSACTION", transaction));

    JeChain.addTransaction(transaction);
}

// Request chain from a node, this function will get the socket from the address, 
// send it 2 messages with type "TYPE_REQUEST_CHAIN" and "TYPE_REQUEST_INFO"
function requestChain(address) {
    ENABLE_CHAIN_REQUEST = true;

    const socket = opened.find(node => node.address === address).socket;

    socket.send(produceMessage("TYPE_REQUEST_CHAIN", MY_ADDRESS));
    socket.send(produceMessage("TYPE_REQUEST_INFO", MY_ADDRESS));
}

// Connect to all peers set by the user.
PEERS.forEach(peer => connect(peer));

// Error handling
process.on("uncaughtException", err => console.log(err));

// Your code goes here
setTimeout(() => {
    loopMine();
}, 1000);
