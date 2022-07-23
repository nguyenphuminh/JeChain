"use strict";

const { Level } = require('level');
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const jelscript = require("./runtime");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

async function changeState(newBlock, stateDB, enableLogging = false) {
    const existedAddresses = await stateDB.keys().all();

    for (const tx of newBlock.transactions) {
        // If the address doesn't already exist in the chain state, we will create a new empty one.
        if (!existedAddresses.includes(tx.recipient)) {
            await stateDB.put(tx.recipient, {
                balance: 0,
                body: "",
                timestamps: [],
                storage: {}
            });
        }

        // If the address doesn't already exist in the chain state, we will create a new empty one.
        if (!existedAddresses.includes(tx.sender)) {
            await stateDB.put(tx.sender, {
                balance: 0,
                body: "",
                timestamps: [],
                storage: {}
            });
        } else if (typeof tx.additionalData.scBody === "string") {
            const dataFromSender = await stateDB.get(tx.sender);

            if (dataFromSender.body === "") {
                dataFromSender.body = tx.additionalData.scBody;

                await stateDB.put(tx.sender, dataFromSender);
            }
        }

        const dataFromSender = await stateDB.get(tx.sender);
        const dataFromRecipient = await stateDB.get(tx.recipient);

        await stateDB.put(tx.sender, {
            balance: dataFromSender.balance - tx.amount - tx.gas - (tx.additionalData.contractGas || 0),
            body: dataFromSender.body,
            timestamps: [...dataFromSender.timestamps, tx.timestamp],
            storage: dataFromSender.storage
        });

        await stateDB.put(tx.recipient, {
            balance: dataFromRecipient.balance + tx.amount,
            body: dataFromRecipient.body,
            timestamps: dataFromRecipient.timestamps,
            storage: dataFromRecipient.storage
        });

        if (
            tx.sender !== MINT_PUBLIC_ADDRESS &&
            typeof dataFromRecipient.body === "string" && 
            dataFromRecipient.body !== ""
        ) {
            const contractInfo = { address: tx.recipient };
            
            await jelscript(dataFromRecipient.body, (tx.additionalData.contractGas || 0), stateDB, newBlock, tx, contractInfo, enableLogging);
        }
    }
}

module.exports = changeState;
