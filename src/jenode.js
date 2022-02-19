"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const WS = require("ws");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const { fork } = require("child_process");
const Block = require("./block");
const Transaction = require("./transaction");
const Blockchain = require("./blockchain");
const jelscript = require("./jelscript");

const JeChain = new Blockchain();

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

const opened = [];
const connected = [];

let tempChain = new Blockchain();
let worker = fork(`${__dirname}/worker.js`);
let mined = false;

console.log("Listening on PORT", PORT);

server.on("connection", async (socket, req) => {
    socket.on("message", message => {
        const _message = JSON.parse(message);

        switch(_message.type) {
            case "TYPE_REPLACE_CHAIN":
                const [ newBlock, newDiff ] = _message.data;

                const ourTx = [...JeChain.transactions.map(tx => JSON.stringify(tx))];
                const theirTx = [...newBlock.data.filter(tx => tx.from !== MINT_PUBLIC_ADDRESS).map(tx => JSON.stringify(tx))];

                if (newBlock.prevHash !== JeChain.getLastBlock().prevHash) {
                    if (
                        SHA256(JeChain.getLastBlock().hash + newBlock.timestamp + JSON.stringify(newBlock.data) + newBlock.nonce) === newBlock.hash &&
                        newBlock.hash.startsWith("0000" + Array(JeChain.difficulty + 1).join("0")) &&
                        Block.hasValidTransactions(newBlock, JeChain) &&
                        (parseInt(newBlock.timestamp) > parseInt(JeChain.getLastBlock().timestamp) || JeChain.getLastBlock().timestamp === "") &&
                        parseInt(newBlock.timestamp) < Date.now() &&
                        JeChain.getLastBlock().hash === newBlock.prevHash &&
                        (newDiff + 1 === JeChain.difficulty || newDiff - 1 === JeChain.difficulty)
                    ) {
                        JeChain.chain.push(newBlock);
                        JeChain.difficulty = newDiff;
                        JeChain.transactions = [...ourTx.filter(tx => theirTx.indexOf(tx) === -1).map(tx => JSON.parse(tx))];

                        changeState(newBlock);

                        triggerContract(newBlock);

                        if (ENABLE_MINING) {
                            mined = true;

                            worker.kill();

                            worker = fork(`${__dirname}/worker.js`);
                        }
                    }
                }

                break;

            case "TYPE_CREATE_TRANSACTION":
                const transaction = _message.data;

                JeChain.addTransaction(transaction);

                break;

            case "TYPE_REQUEST_CHAIN":
                const socket = opened.find(node => node.address === _message.data).socket;
                
                for (let i = 1; i < JeChain.chain.length; i++) {
                    socket.send(produceMessage(
                        "TYPE_SEND_CHAIN",
                        {
                            block: JeChain.chain[i],
                            finished: i === JeChain.chain.length - 1
                        }
                    ));
                }

                break;

            case "TYPE_SEND_CHAIN":
                const { block, finished } = _message.data;

                if (!finished) {
                    tempChain.chain.push(block);
                } else {
                    tempChain.chain.push(block);

                    if (Blockchain.isValid(tempChain)) {
                        JeChain.chain = tempChain.chain;
                    }

                    tempChain = new Blockchain();
                }

                break;

            case "TYPE_REQUEST_INFO":
                opened.find(node => node.address === _message.data).socket.send(produceMessage(
                    "TYPE_SEND_INFO",
                    [JeChain.difficulty, JeChain.transactions, JeChain.state]
                ));

                break;

            case "TYPE_SEND_INFO":
                [ JeChain.difficulty, JeChain.transactions, JeChain.state ] = _message.data;
                
                break;

            case "TYPE_HANDSHAKE":
                connect(_message.data);
        }
    });
})

async function connect(address) {
    if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
        const socket = new WS(address);

        socket.on("open", () => {
            [MY_ADDRESS, ...connected].forEach(_address => socket.send(produceMessage("TYPE_HANDSHAKE", _address)));
            
            opened.forEach(node => node.socket.send(produceMessage("TYPE_HANDSHAKE", address)));

            if (!opened.find(peer => peer.address === address) && address !== MY_ADDRESS) {
                opened.push({ socket, address });
            }

            if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
                connected.push(address);
            }
        });
        
        socket.on("close", () => {
            opened.splice(connected.indexOf(address), 1);
            connected.splice(connected.indexOf(address), 1);
        });
    }
}

function produceMessage(type, data) {
    return JSON.stringify({ type, data });
}

function sendMessage(message) {
    opened.forEach(node => node.socket.send(message));
}

function changeState(newBlock) {
    newBlock.data.forEach(tx => {
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
        } else if (tx.to.startsWith("SC") && !JeChain.state[tx.to].body) {
            JeChain.state[tx.from].body = tx.to;
        }

        JeChain.state[tx.to].balance += tx.amount;
        JeChain.state[tx.from].balance -= tx.amount + tx.gas;
        JeChain.state[tx.from].timestamps.push(tx.timestamp);
    });
}

function triggerContract(newBlock) {
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
    function mine(block, difficulty) {
        return new Promise((resolve, reject) => {
            worker.addListener("message", message => resolve(message.result));

            worker.send({
                type: "MINE",
                data: [block, difficulty]
            });
        });
    }

    let gas = 0;

    JeChain.transactions.forEach(transaction => {
        gas += transaction.gas;
    });

    const rewardTransaction = new Transaction(MINT_PUBLIC_ADDRESS, publicKey, JeChain.reward + gas);
    rewardTransaction.sign(MINT_KEY_PAIR);

    const block = new Block(Date.now().toString(), [rewardTransaction, ...JeChain.transactions]);
    block.prevHash = JeChain.getLastBlock().hash;
    block.hash = Block.getHash(block);

    mine(block, JeChain.difficulty)
        .then(result => {
            if (!mined) {
                JeChain.chain.push(Object.freeze(result));

                JeChain.difficulty += Date.now() - parseInt(JeChain.getLastBlock().timestamp) < JeChain.blockTime ? 1 : -1;

                if (JeChain.difficulty < 1) {
                    JeChain.difficulty = 1;
                }

                JeChain.transactions = [];

                changeState(JeChain.getLastBlock());

                triggerContract(JeChain.getLastBlock());

                sendMessage(produceMessage("TYPE_REPLACE_CHAIN", [
                    JeChain.getLastBlock(),
                    JeChain.difficulty
                ]));
            } else {
                mined = false;
            }

            worker.kill();

            worker = fork(`${__dirname}/worker.js`);
        })
        .catch(err => console.log(err));
}

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

function sendTransaction(transaction) {
    sendMessage(produceMessage("TYPE_CREATE_TRANSACTION", transaction));

    JeChain.addTransaction(transaction);
}

function requestChain(address) {
    const socket = opened.find(node => node.address === address).socket;

    socket.send(produceMessage("TYPE_REQUEST_CHAIN", MY_ADDRESS));
    socket.send(produceMessage("TYPE_REQUEST_INFO", MY_ADDRESS));
}

PEERS.forEach(peer => connect(peer));

process.on("uncaughtException", err => console.log(err));

// Your code goes here
