"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const jelscript = require("./runtime");
const Transaction = require("./transaction");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

async function changeState(newBlock, stateDB, enableLogging = false) {
    const existedAddresses = await stateDB.keys().all();

    for (const tx of newBlock.transactions) {
        // If the address doesn't already exist in the chain state, we will create a new empty one.
        if (!existedAddresses.includes(tx.recipient)) {
            await stateDB.put(tx.recipient, {
                balance: "0",
                body: "",
                nonce: 0,
                storage: {}
            });
        }

        // Get sender's public key and address
        const txSenderPubkey = Transaction.getPubKey(tx);
        const txSenderAddress = SHA256(txSenderPubkey);

        // If the address doesn't already exist in the chain state, we will create a new empty one.
        if (!existedAddresses.includes(txSenderAddress)) {
            await stateDB.put(txSenderAddress, {
                balance: "0",
                body: "",
                nonce: 0,
                storage: {}
            });
        } else if (typeof tx.additionalData.scBody === "string") {
            const dataFromSender = await stateDB.get(txSenderAddress);

            if (dataFromSender.body === "") {
                dataFromSender.body = tx.additionalData.scBody;

                await stateDB.put(txSenderAddress, dataFromSender);
            }
        }

        const dataFromSender = await stateDB.get(txSenderAddress);
        const dataFromRecipient = await stateDB.get(tx.recipient);

        await stateDB.put(txSenderAddress, {
            balance: (BigInt(dataFromSender.balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt((tx.additionalData.contractGas || 0))).toString(),
            body: dataFromSender.body,
            nonce: dataFromSender.nonce + 1,
            storage: dataFromSender.storage
        });

        await stateDB.put(tx.recipient, {
            balance: (BigInt(dataFromRecipient.balance) + BigInt(tx.amount)).toString(),
            body: dataFromRecipient.body,
            nonce: dataFromRecipient.nonce,
            storage: dataFromRecipient.storage
        });
    }

    // Separate contract execution from normal transfers.
    // EXTREMELY stupud decision but works for now lmao, should be fixed soon.

    for (const tx of newBlock.transactions) {
        const txSenderPubkey = Transaction.getPubKey(tx);

        const dataFromRecipient = await stateDB.get(tx.recipient);

        if (
            txSenderPubkey !== MINT_PUBLIC_ADDRESS &&
            typeof dataFromRecipient.body === "string" && 
            dataFromRecipient.body !== ""
        ) {
            const contractInfo = { address: tx.recipient };
            
            await jelscript(dataFromRecipient.body, BigInt(tx.additionalData.contractGas || 0), stateDB, newBlock, tx, contractInfo, enableLogging);
        }
    }
}

module.exports = changeState;
