const { Level } = require('level');

const Transaction = require("./transaction");

async function addTransaction(transaction, txPool, stateDB) {
    // Transactions are added into "this.transactions", which is the transaction pool.
    // To be added, transactions must be valid, and they are valid under these criterias:
    // - They are valid based on Transaction.isValid
    // - The balance of the sender is enough to make the transaction (based his transactions the pool).
    // - Its timestamp are not already used.

    if (!(await stateDB.keys().all()).includes(transaction.sender)) return;

    // Fetch sender's state object
    const dataFromSender = await stateDB.get(transaction.sender);
    // Get sender's balance
    let balance = dataFromSender.balance - transaction.amount - transaction.gas - (transaction.additionalData.contractGas || 0);

    txPool.forEach(tx => {
        if (tx.sender === transaction.sender) {
            balance -= tx.amount + tx.gas + (tx.additionalData.contractGas || 0);
        }
    });

    if (
        await Transaction.isValid(transaction, stateDB) && 
        balance >= 0 && 
        !txPool.filter(_tx => _tx.sender === transaction.sender).some(_tx => _tx.timestamp === transaction.timestamp)
    ) {
        txPool.push(transaction);
    }

    console.log("LOG :: Sent one transaction, added transaction to pool.");
}

module.exports = addTransaction;
