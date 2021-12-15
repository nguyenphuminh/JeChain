"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

class Block {
    constructor(timestamp = Date.now().toString(), data = []) {
        this.timestamp = timestamp;
        this.data = data;
        this.prevHash = "";
        this.hash = Block.getHash(this);
        this.nonce = 0;
    }

    static getHash(block) {
        return SHA256(block.prevHash + block.timestamp + JSON.stringify(block.data) + block.nonce);
    }

    mine(difficulty) {
        while (!this.hash.startsWith(Array(difficulty + 1).join("0"))) {
            this.nonce++;
            this.hash = Block.getHash(this);
        }
    }

    static hasValidTransactions(block, chain) {
        let gas = 0, reward = 0;

        block.data.forEach(transaction => {
            if (transaction.from !== MINT_PUBLIC_ADDRESS) {
                gas += transaction.gas;
            } else {
                reward = transaction.amount;
            }
        });

        return (
            reward - gas === chain.reward &&
            block.data.every(transaction => Transaction.isValid(transaction, chain)) && 
            block.data.filter(transaction => transaction.from === MINT_PUBLIC_ADDRESS).length === 1
        );
    }
}

class Blockchain {
    constructor() {
        const initalCoinRelease = new Transaction(MINT_PUBLIC_ADDRESS, "04719af634ece3e9bf00bfd7c58163b2caf2b8acd1a437a3e99a093c8dd7b1485c20d8a4c9f6621557f1d583e0fcff99f3234dd1bb365596d1d67909c270c16d64", 100000000);
        this.transactions = [];
        this.chain = [new Block("", [initalCoinRelease])];
        this.difficulty = 1;
        this.blockTime = 30000;
        this.reward = 297;
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }

    addBlock(block) {
        block.prevHash = this.getLastBlock().hash;
        block.hash = Block.getHash(block);
        block.mine(this.difficulty);
        this.chain.push(Object.freeze(block));

        this.difficulty += Date.now() - parseInt(this.getLastBlock().timestamp) < this.blockTime ? 1 : -1;
    }

    addTransaction(transaction) {
        if (Transaction.isValid(transaction, this)) {
            this.transactions.push(transaction);
        }
    }

    mineTransactions(rewardAddress) {
        let gas = 0;

        this.transactions.forEach(transaction => {
            gas += transaction.gas;
        });

        const rewardTransaction = new Transaction(MINT_PUBLIC_ADDRESS, rewardAddress, this.reward + gas);
        rewardTransaction.sign(MINT_KEY_PAIR);

        const blockTransactions = [rewardTransaction, ...this.transactions];

        if (this.transactions.length !== 0) this.addBlock(new Block(Date.now().toString(), blockTransactions));

        this.transactions.splice(0, blockTransactions.length - 1);
    }

    getBalance(address) {
        let balance = 0;

        this.chain.forEach(block => {
            block.data.forEach(transaction => {
                if (transaction.from === address) {
                    balance -= transaction.amount;
                    balance -= transaction.gas;
                }

                if (transaction.to === address) {
                    balance += transaction.amount;
                }
            })
        })

        return balance;
    }

    static isValid(blockchain) {
        for (let i = 1; i < blockchain.chain.length; i++) {
            const currentBlock = blockchain.chain[i];
            const prevBlock = blockchain.chain[i-1];

            if (
                currentBlock.hash !== Block.getHash(currentBlock) || 
                prevBlock.hash !== currentBlock.prevHash || 
                !Block.hasValidTransactions(currentBlock, blockchain)
            ) {
                return false;
            }
        }

        return true;
    }
}

class Transaction { 
    constructor(from, to, amount, gas = 0) { 
        this.from = from; 
        this.to = to; 
        this.amount = amount; 
        this.gas = gas; 
    } 
 
    sign(keyPair) { 
        if (keyPair.getPublic("hex") === this.from) { 
            this.signature = keyPair.sign(SHA256(this.from + this.to + this.amount + this.gas), "base64").toDER("hex"); 
        } 
    } 
 
    static isValid(tx, chain) { 
        return ( 
            tx.from && 
            tx.to && 
            tx.amount && 
            (chain.getBalance(tx.from) >= tx.amount + tx.gas || tx.from === MINT_PUBLIC_ADDRESS) && 
            ec.keyFromPublic(tx.from, "hex").verify(SHA256(tx.from + tx.to + tx.amount + tx.gas), tx.signature)
        )
    }
} 

const JeChain = new Blockchain();

module.exports = { Block, Transaction, Blockchain, JeChain };
