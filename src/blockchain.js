const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const Block = require("./block");
const Transaction = require("./transaction");
const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

class Blockchain {
    constructor() {
        const initialCoinRelease = new Transaction(MINT_PUBLIC_ADDRESS, "04f91a1954d96068c26c860e5935c568c1a4ca757804e26716b27c95d152722c054e7a459bfd0b3ab22ef65a820cc93a9f316a9dd213d31fdf7a28621b43119b73", 100000000000000);
        this.transactions = [];
        this.chain = [new Block("", [initialCoinRelease])];
        this.difficulty = 1;
        this.blockTime = 30000;
        this.reward = 297;
        this.state = {
            "04f91a1954d96068c26c860e5935c568c1a4ca757804e26716b27c95d152722c054e7a459bfd0b3ab22ef65a820cc93a9f316a9dd213d31fdf7a28621b43119b73": {
                balance: 100000000000000,
                body: "",
                storage: {}
            }
        };
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }

    addTransaction(transaction) {
        let balance = this.getBalance(transaction.from) - transaction.amount - transaction.gas;

        this.transactions.forEach(tx => {
            if (tx.from === transaction.from) {
                balance -= tx.amount + tx.gas;
            }
        });

        if (Transaction.isValid(transaction, this) && balance >= 0) {
            this.transactions.push(transaction);
        }
    }

    getBalance(address) {
        return this.state[address] ? this.state[address].balance : 0;
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

module.exports = Blockchain;
