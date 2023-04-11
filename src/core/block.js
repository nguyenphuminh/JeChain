"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const Transaction = require("./transaction");
const { buildMerkleTree } = require("./merkle");
const { BLOCK_REWARD, BLOCK_GAS_LIMIT, EMPTY_HASH } = require("../config.json");
const jelscript = require("./runtime");

class Block {
    constructor(blockNumber = 1, timestamp = Date.now(), transactions = [], difficulty = 1, parentHash = "", coinbase = "") {
        this.transactions = transactions;                      // Transaction list

        // Block header
        this.blockNumber  = blockNumber;                       // Block's index in chain
        this.timestamp    = timestamp;                         // Block creation timestamp
        this.difficulty   = difficulty;                        // Difficulty to mine block
        this.parentHash   = parentHash;                        // Parent (previous) block's hash
        this.nonce        = 0;                                 // Nonce
        this.txRoot       = buildMerkleTree(transactions).val; // Merkle root of transactions
        this.coinbase     = coinbase;                                // Address to receive reward
        this.hash         = Block.getHash(this);               // Hash of the block
    }

    static getHash(block) {
        // Convert every piece of data to string, merge and then hash
        return SHA256(
            block.blockNumber.toString()       + 
            block.timestamp.toString()         + 
            block.txRoot                       + 
            block.difficulty.toString()        +
            block.parentHash                   +
            block.nonce.toString()
        );
    }

    static hasValidPropTypes(block) {
        return (
            Array.isArray(block.transactions)     &&
            typeof block.blockNumber === "number" &&
            typeof block.timestamp   === "number" &&
            typeof block.difficulty  === "number" &&
            typeof block.parentHash  === "string" &&
            typeof block.nonce       === "number" &&
            typeof block.txRoot      === "string" &&
            typeof block.hash        === "string"
        )
    } 

    static async verifyTxAndTransit(block, stateDB, codeDB, enableLogging = false) {
        for (const tx of block.transactions) {
            if (!(await Transaction.isValid(tx, stateDB))) return false;
        }

        // Get all existing addresses
        const addressesInBlock = block.transactions.map(tx => SHA256(Transaction.getPubKey(tx)));
        const existedAddresses = await stateDB.keys().all();

        // If senders' address doesn't exist, return false
        if (!addressesInBlock.every(address => existedAddresses.includes(address))) return false;
        
        // Start state replay to check if transactions are legit
        let gas = 0n, reward, states = {}, code = {};

        for (const tx of block.transactions) {
            const txSenderPubkey = Transaction.getPubKey(tx);
            const txSenderAddress = SHA256(txSenderPubkey);
            
            if (!states[txSenderAddress]) {
                const senderState = await stateDB.get(txSenderAddress);

                states[txSenderAddress] = senderState;
                
                code[senderState.codeHash] = await codeDB.get(senderState.codeHash);

                if (senderState.codeHash !== EMPTY_HASH) return false;
 
                states[txSenderAddress].balance = (BigInt(senderState.balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
            } else {
                if (states[txSenderAddress].codeHash !== EMPTY_HASH) return false;

                states[txSenderAddress].balance = (BigInt(states[txSenderAddress].balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
            }

            // Contract deployment
            if (
                states[txSenderAddress].codeHash === EMPTY_HASH &&
                typeof tx.additionalData.scBody === "string"
            ) {
                states[txSenderAddress].codeHash = SHA256(tx.additionalData.scBody);
                code[states[txSenderAddress].codeHash] = tx.additionalData.scBody;
            }

            // Update nonce
            states[txSenderAddress].nonce += 1;

            if (BigInt(states[txSenderAddress].balance) < 0n) return false;

            if (!existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
                states[tx.recipient] = { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storage: {} }
                code[EMPTY_HASH] = "";
            }
        
            if (existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
                states[tx.recipient] = await stateDB.get(tx.recipient);
                code[states[tx.recipient].codeHash] = await codeDB.get(states[tx.recipient].codeHash);
            }
        
            states[tx.recipient].balance = (BigInt(states[tx.recipient].balance) + BigInt(tx.amount)).toString();
        
            // Contract execution
            if (states[tx.recipient].codeHash !== EMPTY_HASH) {
                const contractInfo = { address: tx.recipient };
                
                const newState = await jelscript(code[states[tx.recipient].codeHash], states, BigInt(tx.additionalData.contractGas || 0), stateDB, block, tx, contractInfo, enableLogging);
        
                for (const account of Object.keys(newState)) {
                    states[account] = newState[account];
                }
            }
        }

        // Reward

        if (!existedAddresses.includes(block.coinbase) && !states[block.coinbase]) {
            states[block.coinbase] = { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storage: {} }
            code[EMPTY_HASH] = "";
        }
    
        if (existedAddresses.includes(block.coinbase) && !states[block.coinbase]) {
            states[block.coinbase] = await stateDB.get(block.coinbase);
            code[states[block.coinbase].codeHash] = await codeDB.get(states[block.coinbase].codeHash);
        }

        states[block.coinbase].balance = (BigInt(states[block.coinbase].balance) + BigInt(BLOCK_REWARD)).toString();

        // Finalize state into DB

        for (const account of Object.keys(states)) {
            await stateDB.put(account, states[account]);

            await codeDB.put(states[account].codeHash, code[states[account].codeHash]);
        }

        return true;
    }

    static async hasValidTxOrder(block, stateDB) {
        const nonces = {};
        
        for (const tx of block.transactions) {
            const txSenderPubkey = Transaction.getPubKey(tx);
            const txSenderAddress = SHA256(txSenderPubkey);

            if (typeof nonces[txSenderAddress] === "undefined") {
                const senderState = await stateDB.get(txSenderAddress);

                nonces[txSenderAddress] = senderState.nonce;
            }

            if (nonces[txSenderAddress] + 1 !== tx.nonce) return false;

            nonces[txSenderAddress]++;
        }

        return true;
    }

    static hasValidGasLimit(block) {
        let totalGas = 0n;

        for (const tx of block.transactions) {
            totalGas += BigInt(tx.additionalData.contractGas || 0);
        }

        return totalGas <= BigInt(BLOCK_GAS_LIMIT);
    }
}

module.exports = Block;
