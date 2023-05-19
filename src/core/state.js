"use strict";

const { Level } = require('level');
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
            await stateDB.put(tx.recipient, { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storageRoot: EMPTY_HASH });
        }

        // Get sender's public key and address
        const txSenderPubkey = Transaction.getPubKey(tx);
        const txSenderAddress = SHA256(txSenderPubkey);

        // If the address doesn't already exist in the chain state, we will create a new empty one.
        if (!existedAddresses.includes(txSenderAddress)) {
            await stateDB.put(txSenderAddress, { balance: "0", codeHash: EMPTY_HASH, nonce: 0, storage: EMPTY_HASH });
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

        const totalAmountToPay = BigInt(tx.amount) + BigInt(tx.gas) + BigInt((tx.additionalData.contractGas || 0));

        // Check balance
        if (BigInt(dataFromSender.balance) >= totalAmountToPay) {
            await stateDB.put(txSenderAddress, {
                balance: (BigInt(dataFromSender.balance) - totalAmountToPay).toString(),
                codeHash: dataFromSender.codeHash,
                nonce: dataFromSender.nonce + 1, // Update nonce
                storageRoot: dataFromSender.storageRoot
            });
    
            await stateDB.put(tx.recipient, {
                balance: (BigInt(dataFromRecipient.balance) + BigInt(tx.amount)).toString(),
                codeHash: dataFromRecipient.codeHash,
                nonce: dataFromRecipient.nonce,
                storageRoot: dataFromRecipient.storageRoot
            });
    
            // Contract execution
            if (dataFromRecipient.codeHash !== EMPTY_HASH) {
                const contractInfo = { address: tx.recipient };
    
                const [ newState, newStorage ] = await jelscript(await codeDB.get(dataFromRecipient.codeHash), {}, BigInt(tx.additionalData.contractGas || 0), stateDB, newBlock, tx, contractInfo, enableLogging);
    
                const storageDB = new Level(__dirname + "/../log/accountStore/" + tx.recipient);
                const keys = Object.keys(newStorage);
    
                newState[tx.recipient].storageRoot = buildMerkleTree(keys.map(key => key + " " + newStorage[key])).val;
    
                for (const key in newStorage) {
                    await storageDB.put(key, newStorage[key]);
                }
    
                await storageDB.close();
    
                for (const account of Object.keys(newState)) {
                    await stateDB.put(account, newState[account]);
    
                    await storageDB.close();
                }
            }
        }
    }

    // Reward

    let gas = 0n;

    for (const tx of newBlock.transactions) { gas += BigInt(tx.gas) + BigInt() + BigInt(tx.additionalData.contractGas || 0) }

    if (!existedAddresses.includes(newBlock.coinbase)) {
        await stateDB.put(newBlock.coinbase, { balance: (BigInt(BLOCK_REWARD) + gas).toString(), codeHash: EMPTY_HASH, nonce: 0, storageRoot: EMPTY_HASH });
    } else {
        const minerState = await stateDB.get(newBlock.coinbase);

        minerState.balance = (BigInt(minerState.balance) + BigInt(BLOCK_REWARD) + gas).toString();

        await stateDB.put(newBlock.coinbase, minerState);
    }
}

module.exports = changeState;
