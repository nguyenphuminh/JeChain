const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const Transaction = require("./transaction");
const jelscript = require("./runtime");

const { BLOCK_GAS_LIMIT } = require("../config.json");

async function addTransaction(transaction, chainInfo, stateDB) {
    try {
        transaction = Transaction.deserialize(transaction);
    } catch (e) {
        // If transaction can not be deserialized, it's faulty
        return;
    }

    // Transactions are weakly verified when added to the pool (does no state checking), but will be fully checked in block production.
    if (!(
        await Transaction.isValid(transaction, stateDB)) || 
        BigInt(transaction.additionalData.contractGas || 0) > BigInt(BLOCK_GAS_LIMIT)
    ) {
        console.log(`LOG [${(new Date()).toISOString()}] Failed to add one transaction to pool.`);
        return;
    }

    const txPool = chainInfo.transactionPool;

    // Get public key and address from sender
    const txSenderPubkey = Transaction.getPubKey(transaction);
    const txSenderAddress = SHA256(txSenderPubkey);

    if (!(await stateDB.keys().all()).includes(txSenderAddress)) {
        console.log(`LOG [${(new Date()).toISOString()}] Failed to add one transaction to pool.`);
        return;
    }

    // Check nonce
    let maxNonce = 0;

    for (const tx of txPool) {
        const poolTxSenderPubkey = Transaction.getPubKey(transaction);
        const poolTxSenderAddress = SHA256(poolTxSenderPubkey);

        if (poolTxSenderAddress === txSenderAddress && tx.nonce > maxNonce) {
            maxNonce = tx.nonce;
        }
    }

    if (maxNonce + 1 !== transaction.nonce) {
        console.log(`LOG [${(new Date()).toISOString()}] Failed to add one transaction to pool.`);
        return;
    }

    txPool.push(transaction);

    console.log(`LOG [${(new Date()).toISOString()}] Added one transaction to pool.`);
}

async function clearDepreciatedTxns(chainInfo, stateDB) {
    const txPool = chainInfo.transactionPool;

    const newTxPool = [], skipped = {}, maxNonce = {};

    for (const tx of txPool) {
        const txSenderPubkey = Transaction.getPubKey(tx);
        const txSenderAddress = SHA256(txSenderPubkey);

        if (skipped[txSenderAddress]) continue;

        const senderState = await stateDB.get(txSenderAddress);

        if (!maxNonce[txSenderAddress]) {
            maxNonce[txSenderAddress] = senderState.nonce;
        }

        // Weak-checking
        if (Transaction.isValid(tx, stateDB) && tx.nonce - 1 === maxNonce[txSenderAddress]) {
            newTxPool.push(tx);
            maxNonce[txSenderAddress] = tx.nonce;
        }
    }

    return newTxPool;
}

module.exports = { addTransaction, clearDepreciatedTxns };
