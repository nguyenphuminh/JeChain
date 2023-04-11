"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const jelscript = require("./runtime");
const Transaction = require("./transaction");

const { EMPTY_HASH, BLOCK_REWARD } = require("../config.json");

async function changeState(newBlock, stateDB, codeDB, enableLogging = false) { // Manually change state
    const existedAddresses = await stateDB.keys().all();

    for (const tx of newBlock.transactions) {
        // If the address doesn't already exist in the chain state, we will create a new empty one.
        if (!existedAddresses.includes(tx.recipient)) {
            await stateDB.put(tx.recipient, { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storage: {} });
        }

        // Get sender's public key and address
        const txSenderPubkey = Transaction.getPubKey(tx);
        const txSenderAddress = SHA256(txSenderPubkey);

        // If the address doesn't already exist in the chain state, we will create a new empty one.
        if (!existedAddresses.includes(txSenderAddress)) {
            await stateDB.put(txSenderAddress, { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storage: {} });
        } else if (typeof tx.additionalData.scBody === "string") { // Contract deployment
            const dataFromSender = await stateDB.get(txSenderAddress);

            if (dataFromSender.codeHash === EMPTY_HASH) {
                dataFromSender.codeHash = SHA256(tx.additionalData.scBody);
                
                await codeDB.put(dataFromSender.codeHash, tx.additionalData.scBody);

                await stateDB.put(txSenderAddress, dataFromSender);
            }
        }

        // Normal transfer
        const dataFromSender = await stateDB.get(txSenderAddress);
        const dataFromRecipient = await stateDB.get(tx.recipient);

        await stateDB.put(txSenderAddress, {
            balance: (BigInt(dataFromSender.balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt((tx.additionalData.contractGas || 0))).toString(),
            codeHash: dataFromSender.codeHash,
            nonce: dataFromSender.nonce + 1, // Update nonce
            storage: dataFromSender.storage
        });

        await stateDB.put(tx.recipient, {
            balance: (BigInt(dataFromRecipient.balance) + BigInt(tx.amount)).toString(),
            codeHash: dataFromRecipient.codeHash,
            nonce: dataFromRecipient.nonce,
            storage: dataFromRecipient.storage
        });

        // Contract execution
        if (dataFromRecipient.codeHash !== EMPTY_HASH) {
            const contractInfo = { address: tx.recipient };

            const newState = await jelscript(await codeDB.get(dataFromRecipient.codeHash), {}, BigInt(tx.additionalData.contractGas || 0), stateDB, newBlock, tx, contractInfo, enableLogging);

            for (const account of Object.keys(newState)) {
                await stateDB.put(account, newState[account]);
            }
        }
    }

    // Reward

    if (!existedAddresses.includes(newBlock.coinbase)) {
        await stateDB.put(newBlock.coinbase, { balance: BLOCK_REWARD, codeHash: EMPTY_HASH, nonce: 0, storage: {} });
    } else {
        const minerState = await stateDB.get(newBlock.coinbase);

        minerState.balance = (BigInt(minerState.balance) + BigInt(BLOCK_REWARD)).toString();

        await stateDB.put(newBlock.coinbase, minerState);
    }
}

module.exports = changeState;
