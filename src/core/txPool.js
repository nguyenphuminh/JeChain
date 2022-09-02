const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");

const Transaction = require("./transaction");

async function addTransaction(transaction, txPool, stateDB) {
    // Transactions are added into "this.transactions", which is the transaction pool.
    // To be added, transactions must be valid, and they are valid under these criterias:
    // - They are valid based on Transaction.isValid
    // - The balance of the sender is enough to make the transaction (based his transactions the pool).
    // - Its timestamp are not already used.

    if (!(await Transaction.isValid(transaction, stateDB))) {
        console.log("LOG :: Failed to add one transaction to pool.");
        return;
    }

    // Get public key and address from sender
    const txSenderPubkey = Transaction.getPubKey(transaction);
    const txSenderAddress = SHA256(txSenderPubkey);

    if (!(await stateDB.keys().all()).includes(txSenderAddress)) {
        console.log("LOG :: Failed to add one transaction to pool.");
        return;
    }

    // Fetch sender's state object
    const dataFromSender = await stateDB.get(txSenderAddress);
    // Get sender's balance
    let balance = BigInt(dataFromSender.balance) - BigInt(transaction.amount) - BigInt(transaction.gas) - BigInt(transaction.additionalData.contractGas || 0);

    txPool.forEach(tx => {
        const _txSenderPubkey = Transaction.getPubKey(tx);
        const _txSenderAddress = SHA256(_txSenderPubkey);

        if (_txSenderAddress === txSenderAddress) {
            balance -= BigInt(tx.amount) + BigInt(tx.gas) + BigInt(tx.additionalData.contractGas || 0);
        }
    });

    if ( 
        balance >= 0 && 
        !txPool.filter(_tx => SHA256(Transaction.getPubKey(_tx)) === txSenderAddress).some(_tx => _tx.timestamp === transaction.timestamp)
    ) {
        txPool.push(transaction);

        console.log("LOG :: Added one transaction to pool.");
    } else {
        console.log("LOG :: Failed to add one transaction to pool.");
    }
}

module.exports = addTransaction;
