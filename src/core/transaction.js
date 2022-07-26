"use strict";

const { Level } = require('level');
const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

class Transaction {
    constructor(sender = "", recipient = "", amount = 0, gas = 1, additionalData = {}, timestamp = Date.now()) {
        this.sender         = sender;         // Sender's address (public key)
        this.recipient      = recipient;      // Recipient's address (public key)
        this.amount         = amount;         // Amount to be sent
        this.gas            = gas;            // Gas that transaction consumed + tip for miner
        this.additionalData = additionalData; // Additional data that goes into the transaction
        this.timestamp      = timestamp;      // Creation timestamp (doesn't matter if true or not, just for randomness)
        this.signature      = "";             // Transaction's signature, will be generated later
    }

    static getHash(tx) {
        return SHA256(
            tx.sender                         +
            tx.recipient                      +
            tx.amount.toString()              +
            tx.gas.toString()                 +
            JSON.stringify(tx.additionalData) +
            tx.timestamp.toString()
        )
    }

    static sign(transaction, keyPair) {
        transaction.signature = keyPair.sign(Transaction.getHash(transaction), "base64").toDER("hex");
    }

    static async isValid(tx, stateDB) {
        // If state of sender does not exist, then the transaction is 100% false
        if (!(await stateDB.keys().all()).includes(tx.sender)) return false;

        // Fetch sender's state object
        const dataFromSender = await stateDB.get(tx.sender);
        // Get sender's balance and used timestamps
        const senderBalance = dataFromSender.balance;
        const usedTimestamps = dataFromSender.timestamps;

        // If sender is a contract address, then it's not supposed to be used to send money, so return false if it is.
        if (dataFromSender.body !== "") return false;

        // A transaction is valid when the amount of money sent is not below 0, the gas is at least 1, the sender's
        // balance is big enough to create transactions, the timestamp is less or equal to the moment we check, 
        // the signature matches with the public key the timestamp does not exist in the used timestamps list.

        return ( 
            tx.amount >= 0 &&
            ((senderBalance >= tx.amount + tx.gas + (tx.additionalData.contractGas || 0) && tx.gas >= 1) || tx.sender === MINT_PUBLIC_ADDRESS) && 
            ec.keyFromPublic(tx.sender, "hex").verify(Transaction.getHash(tx), tx.signature) &&
            !usedTimestamps.includes(tx.timestamp) &&
            tx.timestamp <= Date.now()
        )
    }
}

module.exports = Transaction;
