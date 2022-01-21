"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const WS = require("ws");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const { fork } = require("child_process");
const Block = require("./block");
const Transaction = require("./transaction");
const Blockchain = require("./blockchain");
const jelscript = require("./jelscript");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

let worker = fork(`${__dirname}/worker.js`);
let mined = false;

class P2P {
    constructor(options = {}) {
        this.privateKey = options.PRIVATE_KEY || ec.genKeyPair().getPrivate("hex");
        this.keyPair = ec.keyFromPrivate(this.privateKey, "hex");
        this.publicKey = this.keyPair.getPublic("hex");
        this.chain = new Blockchain();
        this.tempChain = new Blockchain();
        this.opened = [];
        this.connected = [];
    }

    startNode(options = {}) {
        this.PORT = options.PORT || 3000;
        this.PEERS = options.PEERS || [];
        this.MY_ADDRESS = options.MY_ADDRESS || "ws://localhost:3000";
        this.ENABLE_MINING = options.ENABLE_MINING;
        const server = new WS.Server({ port: this.PORT });

        server.on("connection", async (socket, req) => {
            socket.on("message", message => {
                const _message = JSON.parse(message);

                switch(_message.type) {
                    case "TYPE_REPLACE_CHAIN":
                        const [ newBlock, newDiff ] = _message.data;

                        const ourTx = [...this.chain.transactions.map(tx => JSON.stringify(tx))];
                        const theirTx = [...newBlock.data.filter(tx => tx.from !== MINT_PUBLIC_ADDRESS).map(tx => JSON.stringify(tx))];

                        if (newBlock.prevHash !== this.chain.getLastBlock().prevHash) {
                            for (;;) {
                                const index = ourTx.indexOf(theirTx[0]);

                                if (index === -1) break;
                                
                                ourTx.splice(index, 1);
                                theirTx.splice(0, 1);
                            }

                            if (
                                theirTx.length === 0 &&
                                SHA256(this.chain.getLastBlock().hash + newBlock.timestamp + JSON.stringify(newBlock.data) + newBlock.nonce) === newBlock.hash &&
                                newBlock.hash.startsWith(Array(this.chain.difficulty + 1).join("0")) &&
                                Block.hasValidTransactions(newBlock, this.chain) &&
                                (parseInt(newBlock.timestamp) > parseInt(this.chain.getLastBlock().timestamp) || this.chain.getLastBlock().timestamp === "") &&
                                parseInt(newBlock.timestamp) < Date.now() &&
                                this.chain.getLastBlock().hash === newBlock.prevHash &&
                                (newDiff + 1 === this.chain.difficulty || newDiff - 1 === this.chain.difficulty)
                            ) {
                                this.chain.chain.push(newBlock);
                                this.chain.difficulty = newDiff;
                                this.chain.transactions = [...ourTx.map(tx => JSON.parse(tx))];

                                this.changeState(newBlock);

                                this.triggerContract(newBlock);

                                if (this.ENABLE_MINING) {
                                    mined = true;

                                    worker.kill();

                                    worker = fork("./worker.js");
                                }
                            }
                        }

                        break;

                    case "TYPE_CREATE_TRANSACTION":
                        const transaction = _message.data;

                        this.chain.addTransaction(transaction);

                        break;

                    case "TYPE_SEND_CHAIN":
                        const { block, finished } = _message.data;

                        if (!finished) {
                            this.tempChain.chain.push(block);
                        } else {
                            this.tempChain.chain.push(block);

                            if (Blockchain.isValid(this.tempChain)) {
                                this.chain.chain = this.tempChain.chain;
                            }

                            this.tempChain = new Blockchain();
                        }

                        break;


                    case "TYPE_REQUEST_CHAIN":
                        const socket = this.opened.find(node => node.address === _message.data).socket;
                        
                        for (let i = 1; i < this.chain.chain.length; i++) {
                            socket.send(this.produceMessage(
                                "TYPE_SEND_CHAIN",
                                {
                                    block: this.chain.chain[i],
                                    finished: i === this.chain.chain.length - 1
                                }
                            ));
                        }

                        break;

                    case "TYPE_REQUEST_INFO":
                        this.opened.find(node => node.address === _message.data).socket.send(this.produceMessage(
                            "TYPE_SEND_INFO",
                            [this.chain.difficulty, this.chain.transactions, this.chain.state]
                        ));

                        break;

                    case "TYPE_SEND_INFO":
                        [ this.chain.difficulty, this.chain.transactions, this.chain.state ] = _message.data;
                        
                        break;

                    case "TYPE_HANDSHAKE":
                        this.connect(_message.data);
                }
            });
        })

        console.log("Listening on PORT", this.PORT);

        this.PEERS.forEach(peer => this.connect(peer));

        process.on("uncaughtException", err => console.log(err));
    }

    async connect(address) {
            if (!this.connected.find(peerAddress => peerAddress === address) && address !== this.MY_ADDRESS) {
            const socket = new WS(address);

            socket.on("open", () => {
                [this.MY_ADDRESS, ...this.connected].forEach(_address => socket.send(this.produceMessage("TYPE_HANDSHAKE", _address)));
                
                this.opened.forEach(node => node.socket.send(this.produceMessage("TYPE_HANDSHAKE", address)));

                if (!this.opened.find(peer => peer.address === address) && address !== this.MY_ADDRESS) {
                    this.opened.push({ socket, address });
                }

                if (!this.connected.find(peerAddress => peerAddress === address) && address !== this.MY_ADDRESS) {
                    this.connected.push(address);
                }
            });
            
            socket.on("close", () => {
                this.opened.splice(this.connected.indexOf(address), 1);
                this.connected.splice(this.connected.indexOf(address), 1);
            });
        }
    }

    produceMessage(type, data) {
        return JSON.stringify({ type, data });
    }

    sendMessage(message) {
        this.opened.forEach(node => node.socket.send(message));
    }

    changeState(newBlock) {
        newBlock.data.forEach(tx => {
            if (!this.chain.state[tx.to]) {
                this.chain.state[tx.to] = {
                    balance: 0,
                    body: "",
                    storage: {}
                };
            }

            if (!this.chain.state[tx.from]) {
                this.chain.state[tx.from] = {
                    balance: 0,
                    body: "",
                    storage: {}
                };

                if (tx.to.startsWith("SC")) {
                    this.chain.state[tx.from].body = tx.to;
                }
            }

            this.chain.state[tx.to].balance += tx.amount;
            this.chain.state[tx.from].balance -= tx.amount;
            this.chain.state[tx.from].balance -= tx.gas;
        });
    }

    triggerContract(newBlock) {
        newBlock.data.forEach(tx => {
            if (this.chain.state[tx.to].body) {
                try {
                    [this.chain.state[tx.to].storage, this.chain.state[tx.to].balance] = jelscript(
                        this.chain.state[tx.to].body.replace("SC", ""),
                        this.chain.state[tx.to].storage, 
                        this.chain.state[tx.to].balance, 
                        tx.args,
                        tx.from,
                        { difficulty: this.chain.difficulty, timestamp: this.chain.getLastBlock().timestamp }
                    );
                } catch (error) {
                    console.log("Error at contract", tx.to, error);
                }
            }
        })
    }

    mine() {
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

        this.chain.transactions.forEach(transaction => {
            gas += transaction.gas;
        });

        const rewardTransaction = new Transaction(MINT_PUBLIC_ADDRESS, this.publicKey, this.chain.reward + gas);
        rewardTransaction.sign(MINT_KEY_PAIR);

        const block = new Block(Date.now().toString(), [rewardTransaction, ...this.chain.transactions]);
        block.prevHash = this.chain.getLastBlock().hash;
        block.hash = Block.getHash(block);

        mine(block, this.chain.difficulty)
            .then(result => {
                if (!mined) {
                    this.chain.chain.push(Object.freeze(result));

                    this.chain.difficulty += Date.now() - parseInt(this.chain.getLastBlock().timestamp) < this.chain.blockTime ? 1 : -1;

                    this.chain.transactions = [];

                    this.changeState(this.chain.getLastBlock());

                    this.triggerContract(this.chain.getLastBlock());

                    this.sendMessage(this.produceMessage("TYPE_REPLACE_CHAIN", [
                        this.chain.getLastBlock(),
                        this.chain.difficulty
                    ]));
                } else {
                    mined = false;
                }

                worker.kill();

                worker = fork("./worker.js");
            })
            .catch(err => console.log(err));
    }

    loopMine(time = 1000) {
        let length = this.chain.chain.length;
        let mining = true;

        setInterval(() => {
            if (mining || length !== this.chain.chain.length) {
                mining = false;
                length = this.chain.chain.length;

                this.mine();
            }
        }, time);
    }

    sendTransaction(transaction) {
        this.sendMessage(this.produceMessage("TYPE_CREATE_TRANSACTION", transaction));

        this.chain.addTransaction(transaction);
    }

    requestChain(address) {
        const socket = this.opened.find(node => node.address === address).socket;

        socket.send(this.produceMessage("TYPE_REQUEST_CHAIN", this.MY_ADDRESS));
        socket.send(this.produceMessage("TYPE_REQUEST_INFO", this.MY_ADDRESS));
    }
}

module.exports = P2P;
