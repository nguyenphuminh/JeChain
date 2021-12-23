"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const WS = require("ws");
const { Block, Transaction, Blockchain, JeChain } = require("./jechain");
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const privateKey = process.env.PRIVATE_KEY || ec.genKeyPair().getPrivate("hex");
const keyPair = ec.keyFromPrivate(privateKey, "hex");
const publicKey = keyPair.getPublic("hex");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

const PORT = process.env.PORT || 3000;
const PEERS = process.env.PEERS ? process.env.PEERS.split(",") : [];
const MY_ADDRESS = process.env.MY_ADDRESS || "ws://localhost:3000";
const server = new WS.Server({ port: PORT });

console.log("Listening on PORT", PORT);

let opened = [];
let connected = [];
let check = [];
let checked = [];
let checking = false;
let tempChain = new Blockchain();

server.on("connection", async (socket, req) => {
    socket.on("message", message => {
        const _message = JSON.parse(message);

        switch(_message.type) {
            case "TYPE_REPLACE_CHAIN":
                const [ newBlock, newDiff ] = _message.data;

                const ourTx = [...JeChain.transactions.map(tx => JSON.stringify(tx))];
                const theirTx = [...newBlock.data.filter(tx => tx.from !== MINT_PUBLIC_ADDRESS).map(tx => JSON.stringify(tx))];
                const n = theirTx.length;

                if (newBlock.prevHash !== JeChain.getLastBlock().prevHash) {
                    for (let i = 0; i < n; i++) {
                        const index = ourTx.indexOf(theirTx[0]);

                        if (index === -1) break;
                        
                        ourTx.splice(index, 1);
                        theirTx.splice(0, 1);
                    }

                    if (
                        theirTx.length === 0 &&
                        SHA256(JeChain.getLastBlock().hash + newBlock.timestamp + JSON.stringify(newBlock.data) + newBlock.nonce) === newBlock.hash &&
                        newBlock.hash.startsWith(Array(JeChain.difficulty + 1).join("0")) &&
                        Block.hasValidTransactions(newBlock, JeChain) &&
                        (parseInt(newBlock.timestamp) > parseInt(JeChain.getLastBlock().timestamp) || JeChain.getLastBlock().timestamp === "") &&
                        parseInt(newBlock.timestamp) < Date.now() &&
                        JeChain.getLastBlock().hash === newBlock.prevHash &&
                        (newDiff + 1 === JeChain.difficulty || newDiff - 1 === JeChain.difficulty)
                    ) {
                        JeChain.chain.push(newBlock);
                        JeChain.difficulty = newDiff;
                        JeChain.transactions = [...ourTx.map(tx => JSON.parse(tx))];
                    }
                } else if (!checked.includes(JSON.stringify([newBlock.prevHash, JeChain.chain[JeChain.chain.length-2].timestamp || ""]))) {
                    checked.push(JSON.stringify([JeChain.getLastBlock().prevHash, JeChain.chain[JeChain.chain.length-2].timestamp || ""]));

                    const position = JeChain.chain.length - 1;

                    checking = true;

                    sendMessage(produceMessage("TYPE_REQUEST_CHECK", MY_ADDRESS));

                    setTimeout(() => {
                        checking = false;

                        let mostAppeared = check[0];

                        check.forEach(group => {
                            if (check.filter(_group => _group === group).length > check.filter(_group => _group === mostAppeared).length) {
                                mostAppeared = group;
                            }
                        })

                        const group = JSON.parse(mostAppeared)

                        JeChain.chain[position] = group[0];
                        JeChain.transactions = [...group[1]];
                        JeChain.difficulty = group[2];

                        check.splice(0, check.length);
                    }, 5000);
                }

                break;

            case "TYPE_REQUEST_CHECK":
                opened.filter(node => node.address === _message.data)[0].socket.send(
                    JSON.stringify(produceMessage(
                        "TYPE_SEND_CHECK",
                        JSON.stringify([JeChain.getLastBlock(), JeChain.transactions, JeChain.difficulty])
                    ))
                );

                break;

            case "TYPE_SEND_CHECK":
                if (checking) check.push(_message.data);

                break;

            case "TYPE_CREATE_TRANSACTION":
                const transaction = _message.data;

                JeChain.addTransaction(transaction);

                break;

            case "TYPE_SEND_CHAIN":
                const { block, finished } = _message.data;

                if (!finished) {
                    tempChain.chain.push(block);
                } else {
                    if (Blockchain.isValid(tempChain)) {
                        JeChain.chain = tempChain.chain;
                    }
                    tempChain = new Blockchain();
                }

                break;


            case "TYPE_REQUEST_CHAIN":
                const socket = opened.filter(node => node.address === _message.data)[0].socket;
                
                for (let i = 0; i < JeChain.chain.length; i++) {
                    socket.send(JSON.stringify(produceMessage(
                        "TYPE_SEND_CHAIN",
                        {
                            block: JeChain.chain[i],
                            finished: i === JeChain.chain.length
                        }
                    )));
                }

                break;

            case "TYPE_REQUEST_INFO":
                opened.filter(node => node.address === _message.data)[0].socket.send(
                    "TYPE_SEND_INFO",
                    [JeChain.difficulty, JeChain.transactions]
                );

                break;

            case "TYPE_SEND_INFO":
                [ JeChain.difficulty, JeChain.transactions ] = _message.data;
                
                break;

            case "TYPE_HANDSHAKE":
                const nodes = _message.data;

                nodes.forEach(node => connect(node))
        }
    });
})

async function connect(address) {
    if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
        const socket = new WS(address);

        socket.on("open", () => {
            socket.send(JSON.stringify(produceMessage("TYPE_HANDSHAKE", [MY_ADDRESS, ...connected])));
            
            opened.forEach(node => node.socket.send(JSON.stringify(produceMessage("TYPE_HANDSHAKE", [address]))));

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
    return { type, data }
}

function sendMessage(message) {
    opened.forEach(node => {
        node.socket.send(JSON.stringify(message));
    });
}

function mine() {
    JeChain.mineTransactions(publicKey);

    sendMessage(produceMessage("TYPE_REPLACE_CHAIN", [
        JeChain.getLastBlock(),
        JeChain.difficulty
    ]));
}

function sendTransaction(transaction) {
    sendMessage(produceMessage("TYPE_CREATE_TRANSACTION", transaction));

    JeChain.addTransaction(transaction);
}

PEERS.forEach(peer => connect(peer));

process.on("uncaughtException", err => console.log(err));
