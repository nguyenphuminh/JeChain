"use strict";

const { Level } = require('level');
const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const Transaction = require("./transaction");
const Merkle = require("./merkle");
const { BLOCK_REWARD, BLOCK_GAS_LIMIT, EMPTY_HASH } = require("../config.json");
const jelscript = require("./runtime");
const { serializeState, deserializeState } = require("../utils/utils");

class Block {
    constructor(blockNumber = 1, timestamp = Date.now(), transactions = [], difficulty = 1, parentHash = "", coinbase = "") {
        this.transactions = transactions;                      // Transaction list

        // Block header
        this.blockNumber  = blockNumber;                       // Block's index in chain
        this.timestamp    = timestamp;                         // Block creation timestamp
        this.difficulty   = difficulty;                        // Difficulty to mine block
        this.parentHash   = parentHash;                        // Parent (previous) block's hash
        this.nonce        = 0;                                 // Nonce
        this.coinbase     = coinbase;                          // Address to receive reward
        this.hash         = Block.getHash(this);               // Hash of the block
        // Merkle root of transactions
        this.txRoot       = Merkle.buildTxTrie(transactions.map(tx => Transaction.deserialize(tx))).root;
    }

    static serialize(block) {
        // Block fields

        // - Block number: 4 bytes | Int
        // - Timestamp: 6 bytes | Int
        // - Difficulty: 8 bytes | Int
        // - Parent hash: 32 bytes | Hex string
        // - Nonce: 5 bytes | Int
        // - Tx root: 32 bytes | Hex string
        // - Coinbase: 32 bytes | Hex string
        // - Hash: 32 bytes | Hex string
        // - Transactions: What's left, for each transaction we do:
        //   - Offset: 4 bytes | Int
        //   - Transaction body: <offset> bytes | Byte array

        let blockHexString = "";

        // Block number
        blockHexString += block.blockNumber.toString(16).padStart(8, "0");
        // Timestamp
        blockHexString += block.timestamp.toString(16).padStart(12, "0");
        // Difficulty
        blockHexString += block.difficulty.toString(16).padStart(16, "0");
        // Parent hash
        blockHexString += block.parentHash.toString(16).padStart(64, "0");
        // Nonce
        blockHexString += block.nonce.toString(16).padStart(10, "0");
        // Tx root
        blockHexString += block.txRoot.toString(16).padStart(64, "0");
        // Coinbase
        blockHexString += block.coinbase.toString(16).padStart(64, "0");
        // Hash
        blockHexString += block.hash.toString(16).padStart(64, "0");

        // Transactions
        for (const tx of block.transactions) {
            // Offset for knowing transaction's size
            blockHexString += tx.length.toString(16).padStart(8, "0");

            // The transaction
            blockHexString += Buffer.from(tx).toString("hex");
        }

        return new Array(...Buffer.from(blockHexString, "hex"));
    }

    static deserialize(block) {
        let blockHexString = Buffer.from(block).toString("hex");

        const blockObj = { transactions: [] };

        blockObj.blockNumber = parseInt(blockHexString.slice(0, 8), 16);
        blockHexString = blockHexString.slice(8);

        blockObj.timestamp = parseInt(blockHexString.slice(0, 12), 16);
        blockHexString = blockHexString.slice(12);

        blockObj.difficulty = parseInt(blockHexString.slice(0, 16),16);
        blockHexString = blockHexString.slice(16);

        blockObj.parentHash = blockHexString.slice(0, 64), 16;
        blockHexString = blockHexString.slice(64);

        blockObj.nonce = parseInt(blockHexString.slice(0, 10), 16);
        blockHexString = blockHexString.slice(10);

        blockObj.txRoot = blockHexString.slice(0, 64);
        blockHexString = blockHexString.slice(64);

        blockObj.coinbase = blockHexString.slice(0, 64);
        blockHexString = blockHexString.slice(64);

        blockObj.hash = blockHexString.slice(0, 64);
        blockHexString = blockHexString.slice(64);

        while (blockHexString.length > 0) {
            let offset = parseInt(blockHexString.slice(0, 8), 16);

            blockHexString = blockHexString.slice(8);

            blockObj.transactions.push([...Buffer.from(blockHexString.slice(0, offset * 2), "hex")]);

            blockHexString = blockHexString.slice(offset * 2);
        }

        return blockObj;
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

    static async verifyTxAndTransit(block, stateDB, codeDB, enableLogging = false) {        
        // Basic verification
        for (const tx of block.transactions) {
            if (!(await Transaction.isValid(tx, stateDB))) return false;
        }

        // Get all existing addresses
        const addressesInBlock = block.transactions.map(tx => SHA256(Transaction.getPubKey(tx)));
        const existedAddresses = await stateDB.keys().all();

        // If senders' address doesn't exist, return false
        if (!addressesInBlock.every(address => existedAddresses.includes(address))) return false;
        
        // Start state replay to check if transactions are legit
        let states = {}, code = {}, storage = {};

        for (const tx of block.transactions) {
            const txSenderPubkey = Transaction.getPubKey(tx);
            const txSenderAddress = SHA256(txSenderPubkey);

            const totalAmountToPay = BigInt(tx.amount) + BigInt(tx.gas) + BigInt(tx.additionalData.contractGas || 0);
            
            if (!states[txSenderAddress]) {
                const senderState = deserializeState(await stateDB.get(txSenderAddress));

                states[txSenderAddress] = senderState;
                
                code[senderState.codeHash] = await codeDB.get(senderState.codeHash);

                if (senderState.codeHash !== EMPTY_HASH || BigInt(senderState.balance) < totalAmountToPay) return false;
 
                states[txSenderAddress].balance = (BigInt(senderState.balance) - totalAmountToPay).toString();
            } else {
                if (states[txSenderAddress].codeHash !== EMPTY_HASH || BigInt(states[txSenderAddress].balance) < totalAmountToPay) return false;

                states[txSenderAddress].balance = (BigInt(states[txSenderAddress].balance) - totalAmountToPay).toString();
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
                states[tx.recipient] = { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storageRoot: EMPTY_HASH }
                code[EMPTY_HASH] = "";
            }
        
            if (existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
                states[tx.recipient] = deserializeState(await stateDB.get(tx.recipient));
                code[states[tx.recipient].codeHash] = await codeDB.get(states[tx.recipient].codeHash);
            }
        
            states[tx.recipient].balance = (BigInt(states[tx.recipient].balance) + BigInt(tx.amount)).toString();
        
            // Contract execution
            if (states[tx.recipient].codeHash !== EMPTY_HASH) {
                const contractInfo = { address: tx.recipient };
                
                const [ newState, newStorage ] = await jelscript(code[states[tx.recipient].codeHash], states, BigInt(tx.additionalData.contractGas || 0), stateDB, block, tx, contractInfo, enableLogging);
        
                for (const account of Object.keys(newState)) {
                    states[account] = newState[account];
                }

                storage[tx.recipient] = newStorage;
            }
        }

        // Reward

        if (!existedAddresses.includes(block.coinbase) && !states[block.coinbase]) {
            states[block.coinbase] = { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storageRoot: EMPTY_HASH }
            code[EMPTY_HASH] = "";
        }
    
        if (existedAddresses.includes(block.coinbase) && !states[block.coinbase]) {
            states[block.coinbase] = deserializeState(await stateDB.get(block.coinbase));
            code[states[block.coinbase].codeHash] = await codeDB.get(states[block.coinbase].codeHash);
        }

        let gas = 0n;

        for (const tx of block.transactions) { gas += BigInt(tx.gas) + BigInt(tx.additionalData.contractGas || 0) }

        states[block.coinbase].balance = (BigInt(states[block.coinbase].balance) + BigInt(BLOCK_REWARD) + gas).toString();

        // Finalize state and contract storage into DB

        for (const address in storage) {
            const storageDB = new Level("./log/accountStore/" + address);
            const keys = Object.keys(storage[address]);

            states[address].storageRoot = Merkle.buildTxTrie(keys.map(key => key + " " + storage[address][key]), false).root;

            for (const key of keys) {
                await storageDB.put(key, storage[address][key]);
            }

            await storageDB.close();
        }

        for (const account of Object.keys(states)) {
            await stateDB.put(account, Buffer.from(serializeState(states[account])));

            await codeDB.put(states[account].codeHash, code[states[account].codeHash]);
        }

        block.transactions = block.transactions.map(tx => Transaction.serialize(tx));

        return true;
    }

    static async hasValidTxOrder(block, stateDB) {
        // Deserialize transactions - garbage code, will be deleted in the future
        try {
            block.transactions = block.transactions.map(tx => Transaction.deserialize(tx));
        } catch (e) {
            // If a transaction fails to be deserialized, the block is faulty
            return false;
        }

        const nonces = {};
        
        for (const tx of block.transactions) {
            const txSenderPubkey = Transaction.getPubKey(tx);
            const txSenderAddress = SHA256(txSenderPubkey);

            if (typeof nonces[txSenderAddress] === "undefined") {
                const senderState = deserializeState(await stateDB.get(txSenderAddress));

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
