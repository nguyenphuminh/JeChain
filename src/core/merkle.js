"use strict";

const Transaction = require("./transaction");
const { EMPTY_HASH } = require("../config.json");

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");

class Node {
    constructor(leftHash = EMPTY_HASH, rightHash = EMPTY_HASH, parentHash = EMPTY_HASH) {
        this.leftHash = leftHash;
        this.rightHash = rightHash;
        this.parentHash = parentHash;
    }
}

class TxTrie {
    constructor(root, trieMap) {
        this.root = root;
        this.trieMap = trieMap;
    }
}

class Merkle {
    static buildTxTrie(transactionList = [], indexed = true) {
        let hashList = [];
        const trieMap = [];
        
        // Hash transactions
        for (let index = 0; index < transactionList.length; index++) {
            const tx = transactionList[index];

            const hash = indexed ? SHA256(`${index} ` + Transaction.getHash(tx)) : SHA256(tx);

            hashList.push(hash);
            trieMap[hash] = new Node();
        }

        // If there are no transaction, supply an empty hash so there would not be an error
        if (transactionList.length === 0) {
            hashList.push(EMPTY_HASH);
            trieMap[EMPTY_HASH] = new Node();
        }

        // Build the tree up continuously
        while (true) {
            // If the hash list only have one hash left, it is the root and we have finished building the tree
            if (hashList.length === 1) return new TxTrie(hashList[0], trieMap);

            // If hash amount is odd, then we duplicate the latest hash
            if (hashList.length % 2 !== 0) {
                hashList.push(hashList.at(-1));
            }

            const newHashList = [];

            // Generate hashes at current depth
            while (hashList.length !== 0) {

                const leftHash = hashList.shift();
                const rightHash = hashList.shift();

                let hash = EMPTY_HASH;

                if (BigInt("0x" + leftHash) > BigInt("0x" + rightHash)) {
                    hash = SHA256(leftHash + rightHash);
                } else {
                    hash = SHA256(rightHash + leftHash);
                }

                // Push hash to hash list
                newHashList.push(hash);
                // Update nodes in trie
                trieMap[hash] = new Node(leftHash, rightHash);
                trieMap[leftHash].parentHash = hash;
                trieMap[rightHash].parentHash = hash;
            }

            hashList = newHashList;
        }
    }

    static getTxTriePath(trieMap, rootHash, target) {
        const path = [];

        let currentHash = target;

        while (true) {
            if (currentHash === rootHash) return path;

            const currentNode = trieMap[currentHash];
            const parentNode = trieMap[currentNode.parentHash];
            
            if (parentNode.leftHash === currentHash) {
                path.push(parentNode.rightHash);
            } else {
                path.push(parentNode.leftHash);
            }

            currentHash = currentNode.parentHash;
        }
    }
}

module.exports = Merkle;
