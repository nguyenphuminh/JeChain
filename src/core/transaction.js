"use strict";

const BN = require("bn.js");
const { isNumber } = require("../utils/utils");
const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
global.share = {
    MINT_PRIVATE_ADDRESS,
    MINT_KEY_PAIR,
    MINT_PUBLIC_ADDRESS: MINT_KEY_PAIR.getPublic("hex"),
};
const {MINT_PUBLIC_ADDRESS} = global.share;

class Transaction {
    constructor(recipient = "", amount = "0", gas = "1000000000000", additionalData = {}, nonce = 0) {
        this.recipient      = recipient;      // Recipient's address (public key)
        this.amount         = amount;         // Amount to be sent
        this.gas            = gas;            // Gas that transaction consumed + tip for miner
        this.additionalData = additionalData; // Additional data that goes into the transaction
        this.nonce          = nonce           // Nonce for signature entropy
        this.signature      = {};             // Transaction's signature, will be generated later
    }

    static getHash(tx) {
        return SHA256(
            tx.recipient                      +
            tx.amount                         +
            tx.gas                            +
            JSON.stringify(tx.additionalData) +
            tx.nonce.toString()
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

        const sigObj = {
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
        // Check types from properties first.
        if (!(
            typeof tx.recipient      === "string" &&
            typeof tx.amount         === "string" &&
            typeof tx.gas            === "string" &&
            typeof tx.additionalData === "object" &&
            typeof tx.nonce          === "number" &&
            (
                typeof tx.additionalData.contractGas === "undefined" ||
                (
                    typeof tx.additionalData.contractGas === "string" &&
                    isNumber(tx.additionalData.contractGas)
                )
            ) &&
            isNumber(tx.amount) &&
            isNumber(tx.gas)
        )) { return false; }

        let txSenderPubkey;
        
        // If recovering public key fails, then transaction is not valid.
        try {
            txSenderPubkey = Transaction.getPubKey(tx);
        } catch (e) {
            return false;
        }
        
        const txSenderAddress = SHA256(txSenderPubkey);

        // If state of sender does not exist, then the transaction is 100% false
        if (!(await stateDB.keys().all()).includes(txSenderAddress)) return false;

        // Fetch sender's state object
        const dataFromSender = await stateDB.get(txSenderAddress);
        const senderBalance = dataFromSender.balance;

        // If sender is a contract address, then it's not supposed to be used to send money, so return false if it is.
        if (dataFromSender.body !== "") return false;

        return (
            // Check if balance of sender is enough to fulfill transaction's cost.
            ((
                BigInt(senderBalance) >= BigInt(tx.amount) + BigInt(tx.gas) + BigInt(tx.additionalData.contractGas || 0) && 
                BigInt(tx.gas) >= 1000000000000n
            ) || txSenderPubkey === MINT_PUBLIC_ADDRESS) &&

            BigInt(tx.amount) >= 0 // Transaction's amount must be at least 0.
        )
    }
}

module.exports = Transaction;
