const SHA256 = require("crypto-js/sha256");

class Block {
    constructor(timestamp = "", data = []) {
        this.timestamp = timestamp;
        this.data = data;
        this.prevHash = "";
        this.hash = this.getHash();
        this.nonce = 0;
    }

    getHash() {
        return SHA256(this.prevHash + this.timestamp + JSON.stringify(this.data) + this.nonce).toString();
    }

    mine(difficulty) {
        while(this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
            this.nonce++;
            this.hash = this.getHash();
        }
    }
}

class Blockchain {
    constructor() {
        this.chain = [new Block(Date.now().toString(), {}, "")];
        this.difficulty = 1;
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }

    addBlock(block) {
        block.prevHash = this.getLastBlock().hash;
        block.hash = block.getHash();
        block.mine(this.difficulty);
        this.chain.push(block);
    }

    isValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const prevBlock = this.chain[i-1];

            if (currentBlock.hash !== currentBlock.getHash() || prevBlock.hash !== currentBlock.prevHash) {
                return false;
            }
        }

        return true;
    }
}

const JeChain = new Blockchain();

module.exports.Block = Block;
module.exports.Blockchain = Blockchain;
module.exports.JeChain = JeChain;
