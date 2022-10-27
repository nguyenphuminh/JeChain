"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const Transaction = require("./transaction");
const generateMerkleRoot = require("./merkle");
const { BLOCK_REWARD, BLOCK_GAS_LIMIT } = require("../config.json");
const jelscript = require("./runtime");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

class Block {
    constructor(blockNumber = 1, timestamp = Date.now(), transactions = [], difficulty = 1, parentHash = "") {
        this.transactions = transactions;                     // Transaction list

        // Block header
        this.blockNumber  = blockNumber;                      // Block's index in chain
        this.timestamp    = timestamp;                        // Block creation timestamp
        this.difficulty   = difficulty;                       // Difficulty to mine block
        this.parentHash   = parentHash;                       // Parent (previous) block's hash
        this.nonce        = 0;                                // Nonce
        this.txRoot       = generateMerkleRoot(transactions); // Merkle root of transactions
        this.hash         = Block.getHash(this)               // Hash of the block
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

    static async verifyTxAndTransit(block, stateDB, enableLogging = false) {
        for (const tx of block.transactions) {
            if (!(await Transaction.isValid(tx, stateDB))) return false;
        }

        // Get all existing addresses
        const addressesInBlock = block.transactions.map(tx => SHA256(Transaction.getPubKey(tx)));
        const existedAddresses = await stateDB.keys().all();

        // If senders' address doesn't exist, return false
        if (!addressesInBlock.every(address => existedAddresses.includes(address))) return false;

        // Start state replay to check if transactions are legit
        let gas = 0n, reward, states = {};

        for (const tx of block.transactions) {
            const txSenderPubkey = Transaction.getPubKey(tx);
            const txSenderAddress = SHA256(txSenderPubkey);
            
            if (!states[txSenderAddress]) {
                const senderState = await stateDB.get(txSenderAddress);

                states[txSenderAddress] = senderState;

                if (senderState.body !== "") return false;
        
                states[txSenderAddress].balance = (BigInt(senderState.balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
            } else {
                if (states[txSenderAddress].body !== "") return false;

                states[txSenderAddress].balance = (BigInt(states[txSenderAddress].balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
            }

            // Contract deployment
            if (
                states[txSenderAddress].body === "" &&
                typeof tx.additionalData.scBody === "string" &&
                txSenderPubkey !== MINT_PUBLIC_ADDRESS
            ) {
                states[txSenderAddress].body = tx.additionalData.scBody;
            }

            // Update nonce
            states[txSenderAddress].nonce += 1;

            if (BigInt(states[txSenderAddress].balance) < 0n && txSenderPubkey !== MINT_PUBLIC_ADDRESS) return false;

            if (!existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
                states[tx.recipient] = { balance: "0", body: "", nonce: 0, storage: {} }
            }
        
            if (existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
                states[tx.recipient] = await stateDB.get(tx.recipient);
            }
        
            states[tx.recipient].balance = (BigInt(states[tx.recipient].balance) + BigInt(tx.amount)).toString();
        
            // Contract execution
            if (
                txSenderPubkey !== MINT_PUBLIC_ADDRESS &&
                typeof states[tx.recipient].body === "string" && 
                states[tx.recipient].body !== ""
            ) {
                const contractInfo = { address: tx.recipient };
                
                const newState = await jelscript(states[tx.recipient].body, states, BigInt(tx.additionalData.contractGas || 0), stateDB, block, tx, contractInfo, enableLogging);
        
                for (const account of Object.keys(newState)) {
                    states[account] = newState[account];
                }
            }

            if (txSenderPubkey === MINT_PUBLIC_ADDRESS) { // Get mining reward
                reward = BigInt(tx.amount);
            } else { // Count gas used
                gas += BigInt(tx.gas) + BigInt(tx.additionalData.contractGas || 0);
            }
        }

        if (
            reward - gas === BigInt(BLOCK_REWARD) && 
            block.transactions.filter(tx => Transaction.getPubKey(tx) === MINT_PUBLIC_ADDRESS).length === 1 &&
            Transaction.getPubKey(block.transactions[0]) === MINT_PUBLIC_ADDRESS
        ) {
            for (const account of Object.keys(states)) {
                await stateDB.put(account, states[account]);
            }

            return true;
        }

        return false;
    }

    static async hasValidTxOrder(block, stateDB) {
        const nonces = {};
        
        for (const tx of block.transactions) {
            const txSenderPubkey = Transaction.getPubKey(tx);
            const txSenderAddress = SHA256(txSenderPubkey);

            if (txSenderPubkey === MINT_PUBLIC_ADDRESS) continue; 

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
