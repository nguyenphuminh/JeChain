"use strict";

const BN = require("bn.js");
const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

class Transaction {
    constructor(recipient = "", amount = "0", gas = "1000000000000", additionalData = {}, timestamp = Date.now()) {
        this.recipient      = recipient;      // Recipient's address (public key)
        this.amount         = amount;         // Amount to be sent
        this.gas            = gas;            // Gas that transaction consumed + tip for miner
        this.additionalData = additionalData; // Additional data that goes into the transaction
        this.timestamp      = timestamp;      // Creation timestamp (doesn't matter if true or not, just for randomness)
        this.signature      = {};             // Transaction's signature, will be generated later
    }

    static getHash(tx) {
        return SHA256(
            tx.recipient                      +
            tx.amount                         +
            tx.gas                            +
            JSON.stringify(tx.additionalData) +
            tx.timestamp.toString()
        )
    }

    static sign(transaction, keyPair) {
        const sigObj = keyPair.sign(Transaction.getHash(transaction));
        
        transaction.signature = {
            v: sigObj.recoveryParam.toString(16),
            r: sigObj.r.toString(16),
            s: sigObj.s.toString(16)
        };
    }

    static getPubKey(tx) {
        // Get transaction's body's hash and recover original signature object
        const msgHash = Transaction.getHash(tx);

        const sigObj = {"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const Transaction = require("./transaction");
const generateMerkleRoot = require("./merkle");
const { BLOCK_REWARD } = require("../config.json");

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

    static async hasValidTransactions(block, stateDB) {
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

        let gas = 0, reward = 0, balances = {};

        for (const transaction of block.transactions) {
            const txSenderPubkey = Transaction.getPubKey(transaction);
            const txSenderAddress = SHA256(txSenderPubkey);
            
            if (txSenderPubkey !== MINT_PUBLIC_ADDRESS) {
                if (!balances[txSenderAddress]) {
                    const dataFromSender = await stateDB.get(txSenderAddress);
                    const senderBalance = dataFromSender.balance;

                    balances[txSenderAddress] = senderBalance - transaction.amount - transaction.gas - (transaction.additionalData.contractGas || 0);
                } else {
                    balances[txSenderAddress] -= transaction.amount + transaction.gas + (transaction.additionalData.contractGas || 0);
                }
                gas += transaction.gas + (transaction.additionalData.contractGas || 0);
            } else {
                reward = transaction.amount;
            }
        }

        // The transactions are valid under these criterias:
        // - The subtraction of "reward" and "gas" should be the fixed reward, so that they can't get lower/higher reward.
        // - Every transactions are valid on their own (checked by Transaction.isValid).
        // - There is only one mint transaction.
        // - Senders' balance after sending should be greater than 1, which means they have enough money to create their transactions.

        let everyTransactionIsValid = true;

        for (const transaction of block.transactions) {
            if (!(await Transaction.isValid(transaction, stateDB))) {
                everyTransactionIsValid = false;
                break;
            }
        }

        return (
            reward - gas === BLOCK_REWARD &&
            everyTransactionIsValid &&
            block.transactions.filter(transaction => Transaction.getPubKey(transaction) === MINT_PUBLIC_ADDRESS).length === 1 &&
            Object.values(balances).every(balance => balance >= 0)
        );
    }
}

module.exports = Block;
            r: new BN(tx.signature.r, 16),
            s: new BN(tx.signature.s, 16),
            recoveryParam: parseInt(tx.signature.v, 16)
        };
        
        // Recover public key and get real address.
        const txSenderPubkey = ec.recoverPubKey(
            new BN(msgHash, 16).toString(10),
            sigObj,
            ec.getKeyRecoveryParam(msgHash, sigObj, ec.genKeyPair().getPublic())
        );

        return ec.keyFromPublic(txSenderPubkey).getPublic("hex");
    }

    static async isValid(tx, stateDB) {
        const txSenderPubkey = Transaction.getPubKey(tx);
        const txSenderAddress = SHA256(txSenderPubkey);

        // If state of sender does not exist, then the transaction is 100% false
        if (!(await stateDB.keys().all()).includes(txSenderAddress)) return false;

        // Fetch sender's state object
        const dataFromSender = await stateDB.get(txSenderAddress);
        // Get sender's balance and used timestamps
        const senderBalance = dataFromSender.balance;
        const usedTimestamps = dataFromSender.timestamps;

        // If sender is a contract address, then it's not supposed to be used to send money, so return false if it is.
        if (dataFromSender.body !== "") return false;

        // A transaction is valid when the amount of money sent is not below 0, the gas is at least 1, the sender's
        // balance is big enough to create transactions, the timestamp is less or equal to the moment we check, 
        // the signature matches with the public key the timestamp does not exist in the used timestamps list.

        return ( 
            (
                (
                    BigInt(senderBalance) >= BigInt(tx.amount) + BigInt(tx.gas) + BigInt(tx.additionalData.contractGas || 0) && 
                    BigInt(tx.gas) >= 1000000000000n
                ) || 
                txSenderPubkey === MINT_PUBLIC_ADDRESS
            ) &&
            BigInt(tx.amount) >= 0 &&
            !usedTimestamps.includes(tx.timestamp) &&
            tx.timestamp <= Date.now() &&
            typeof tx.amount === "string" &&
            typeof tx.gas === "string" && 
            (typeof tx.additionalData.contractGas === "undefined" || typeof tx.additionalData.contractGas === "string")
        )
    }
}

module.exports = Transaction;
