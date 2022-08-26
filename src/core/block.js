"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const Transaction = require("./transaction");
const generateMerkleRoot = require("./merkle");
const { BLOCK_REWARD, BLOCK_GAS_LIMIT } = require("../config.json");

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

    static async hasValidTransactions(block, stateDB) {
        // The transactions are valid under these criterias:
        // - The subtraction of "reward" and "gas" should be the fixed reward, so that they can't get lower/higher reward.
        // - Every transactions are valid on their own (checked by Transaction.isValid).
        // - There is only one mint transaction.
        // - Senders' balance after sending should be greater than 1, which means they have enough money to create their transactions.

        for (const transaction of block.transactions) {
            if (!(await Transaction.isValid(transaction, stateDB))) {
                return false;
            }
        }

        // We will loop over the "data" prop, which holds all the transactions.
        // If the sender's address is the mint address, we will store the amount into "reward".
        // Gases are stored into "gas".
        
        // Senders' balance are stored into "balance" with the key being their address, the value being their balance.
        // Their balance are changed based on "amount" and "gas" props in each transactions.

        // Get all existing addresses
        const addressesInBlock = block.transactions.map(transaction => SHA256(Transaction.getPubKey(transaction)));
        const existedAddresses = await stateDB.keys().all();

        // If senders' address doesn't exist, return false
        if (!addressesInBlock.every(address => existedAddresses.includes(address))) return false;

        let gas = BigInt(0), reward, balances = {};

        for (const transaction of block.transactions) {
            const txSenderPubkey = Transaction.getPubKey(transaction);
            const txSenderAddress = SHA256(txSenderPubkey);
            
            if (txSenderPubkey !== MINT_PUBLIC_ADDRESS) {
                if (!balances[txSenderAddress]) {
                    const dataFromSender = await stateDB.get(txSenderAddress);
                    const senderBalance = dataFromSender.balance;

                    balances[txSenderAddress] = BigInt(senderBalance) - BigInt(transaction.amount) - BigInt(transaction.gas) - BigInt(transaction.additionalData.contractGas || 0);
                } else {
                    balances[txSenderAddress] -= BigInt(transaction.amount) + BigInt(transaction.gas) + BigInt(transaction.additionalData.contractGas || 0);
                }
                gas += BigInt(transaction.gas) + BigInt(transaction.additionalData.contractGas || 0);
            } else {
                reward = BigInt(transaction.amount);
            }
        }

        return (
            reward - gas === BigInt(BLOCK_REWARD) &&
            block.transactions.filter(transaction => Transaction.getPubKey(transaction) === MINT_PUBLIC_ADDRESS).length === 1 &&
            Object.values(balances).every(balance => balance >= 0)
        );
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

