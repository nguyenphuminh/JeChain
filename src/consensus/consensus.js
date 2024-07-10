"use strict";

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const Block = require("../core/block");
const { log16 } = require("../utils/utils");
const Merkle = require("../core/merkle");
const { BLOCK_TIME } = require("../config.json");

async function verifyBlock(newBlock, chainInfo, stateDB, codeDB, enableLogging = false) {
    // Check if the block is valid or not, if yes, we will push it to the chain, update the difficulty, chain state and the transaction pool.
                        
    // A block is valid under these factors:
    // - The hash of this block is equal to the hash re-generated according to the block's info.
    // - The block is mined (the hash starts with (4+difficulty) amount of zeros).
    // - Transactions in the block are valid.
    // - Block's timestamp is not greater than the current timestamp and is not lower than the previous block's timestamp.
    // - Block's parentHash is equal to latest block's hash
    // - The new difficulty can only be greater than 1 or lower than 1 compared to the old difficulty.

    return (
        // Check hash
        SHA256(
            newBlock.blockNumber.toString()       + 
            newBlock.timestamp.toString()         + 
            newBlock.txRoot                       + 
            newBlock.difficulty.toString()        +
            chainInfo.latestBlock.hash            +
            newBlock.nonce.toString()
        ) === newBlock.hash &&
        chainInfo.latestBlock.hash === newBlock.parentHash &&
        
        // Check proof of work
        newBlock.hash.startsWith("00000" + Array(Math.floor(log16(chainInfo.difficulty)) + 1).join("0")) &&
        newBlock.difficulty === chainInfo.difficulty &&

        // Check transactions ordering
        await Block.hasValidTxOrder(newBlock, stateDB) &&

        // Check transaction trie root
        Merkle.buildTxTrie(newBlock.transactions).root === newBlock.txRoot &&
        
        // Check timestamp
        newBlock.timestamp > chainInfo.latestBlock.timestamp &&
        newBlock.timestamp < Date.now() &&
    
        // Check block number
        newBlock.blockNumber - 1 === chainInfo.latestBlock.blockNumber &&

        // Check gas limit
        Block.hasValidGasLimit(newBlock) &&

        // Check transactions and transit state right after
        await Block.verifyTxAndTransit(newBlock, stateDB, codeDB, enableLogging)
    )
}

async function updateDifficulty(newBlock, chainInfo, blockDB) {
    if (newBlock.blockNumber % 100 === 0) {
        const oldBlock = Block.deserialize([...await blockDB.get((newBlock.blockNumber - 99).toString())]);

        chainInfo.difficulty = Math.ceil(chainInfo.difficulty * 100 * BLOCK_TIME / (newBlock.timestamp - oldBlock.timestamp));
    }
}

module.exports = { verifyBlock, updateDifficulty };
