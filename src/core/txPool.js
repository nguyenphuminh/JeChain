const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");

const Transaction = require("./transaction");
const jelscript = require("./runtime");

const { BLOCK_GAS_LIMIT } = require("../config.json");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

async function addTransaction(transaction, chainInfo, stateDB) {
    // Transactions are added into "this.transactions", which is the transaction pool.
    // To be added, transactions must be valid, and they are valid under these criterias:
    // - They are valid based on Transaction.isValid
    // - The balance of the sender is enough to make the transaction (based his transactions the pool).
    // - It has a correct nonce.

    if (!(await Transaction.isValid(transaction, stateDB)) || BigInt(transaction.additionalData.contractGas || 0) > BigInt(BLOCK_GAS_LIMIT)) {
        console.log("LOG :: Failed to add one transaction to pool.");
        return;
    }

    const txPool = chainInfo.transactionPool;
    const latestBlock = chainInfo.latestBlock;

    // Get public key and address from sender
    const txSenderPubkey = Transaction.getPubKey(transaction);
    const txSenderAddress = SHA256(txSenderPubkey);

    if (!(await stateDB.keys().all()).includes(txSenderAddress)) {
        console.log("LOG :: Failed to add one transaction to pool.");
        return;
    }

    // Emulate state
    const states = {};

    const existedAddresses = await stateDB.keys().all();

    for (const tx of txPool.filter(tx => Transaction.getPubKey(tx) === txSenderPubkey)) {
        if (!states[txSenderAddress]) {
            const senderState = await stateDB.get(txSenderAddress);

            states[txSenderAddress] = senderState;

            if (senderState.body !== "") { 
                console.log("LOG :: Failed to add one transaction to pool.");
                return;
            }
    
            states[txSenderAddress].balance = (BigInt(senderState.balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
        } else {
            if (states[txSenderAddress].body !== "") {
                console.log("LOG :: Failed to add one transaction to pool.");
                return;
            }

            states[txSenderAddress].balance = (BigInt(states[txSenderAddress].balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
        }

        // Contract deployment
        if (
            states[txSenderAddress].body === "" &&
            typeof tx.additionalData.scBody === "string" &&
            txSenderPubkey !== MINT_PUBLIC_ADDRESS
        ) {
            states[txSenderAddress].body = tx.additionalData.scBody;
        }

        // Update nonce
        states[txSenderAddress].nonce += 1;
    
        if (states[txSenderAddress].balance < 0) {
            console.log("LOG :: Failed to add one transaction to pool.");
            return;
        }
    
        if (!existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
            states[tx.recipient] = { balance: "0", body: "", nonce: 0, storage: {} }
        }
    
        if (existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
            states[tx.recipient] = await stateDB.get(tx.recipient);
        }
    
        states[tx.recipient].balance = BigInt(states[tx.recipient].balance) + BigInt(tx.amount);
    
        // Contract execution
        if (
            txSenderPubkey !== MINT_PUBLIC_ADDRESS &&
            typeof states[tx.recipient].body === "string" && 
            states[tx.recipient].body !== ""
        ) {
            const contractInfo = { address: tx.recipient };
            
            const newState = await jelscript(states[tx.recipient].body, states, BigInt(tx.additionalData.contractGas || 0), stateDB, latestBlock, tx, contractInfo, enableLogging);
    
            for (const account of Object.keys(newState)) {
                states[account] = newState[account];
            }
        }
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
        console.log("LOG :: Failed to add one transaction to pool.");
        return;
    }

    txPool.push(transaction);

    console.log("LOG :: Added one transaction to pool.");
}

async function clearDepreciatedTxns(chainInfo, stateDB) {
    const txPool = chainInfo.transactionPool;
    const latestBlock = chainInfo.latestBlock;

    const newTxPool = [], states = {}, skipped = {}, maxNonce = {};

    const existedAddresses = await stateDB.keys().all();

    for (const tx of txPool) {
        const txSenderPubkey = Transaction.getPubKey(tx);
        const txSenderAddress = SHA256(txSenderPubkey);

        if (skipped[txSenderAddress]) continue;

        const senderState = await stateDB.get(txSenderAddress);

        if (!maxNonce[txSenderAddress]) {
            maxNonce[txSenderAddress] = senderState.nonce;
        }
        
        if (!states[txSenderAddress]) {
            const senderState = await stateDB.get(txSenderAddress);

            states[txSenderAddress] = senderState;

            if (senderState.body !== "") {
                skipped[txSenderAddress] = true;
                continue;
            }
    
            states[txSenderAddress].balance = (BigInt(senderState.balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
        } else {
            if (states[txSenderAddress].body !== "") {
                skipped[txSenderAddress] = true;
                continue;
            }

            states[txSenderAddress].balance = (BigInt(states[txSenderAddress].balance) - BigInt(tx.amount) - BigInt(tx.gas) - BigInt(tx.additionalData.contractGas || 0)).toString();
        }

        // Contract deployment
        if (
            states[txSenderAddress].body === "" &&
            typeof tx.additionalData.scBody === "string" &&
            txSenderPubkey !== MINT_PUBLIC_ADDRESS
        ) {
            states[txSenderAddress].body = tx.additionalData.scBody;
        }

        // Update nonce
        states[txSenderAddress].nonce += 1;

        if (states[txSenderAddress].balance < 0) {
            skipped[txSenderAddress] = true;
            continue;
        } else if (tx.nonce - 1 === maxNonce[txSenderAddress]) {
            newTxPool.push(tx);
            maxNonce[txSenderAddress] = tx.nonce;
        }

        if (!existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
            states[tx.recipient] = { balance: "0", body: "", nonce: 0, storage: {} }
        }
    
        if (existedAddresses.includes(tx.recipient) && !states[tx.recipient]) {
            states[tx.recipient] = await stateDB.get(tx.recipient);
        }
    
        states[tx.recipient].balance = BigInt(states[tx.recipient].balance) + BigInt(tx.amount);

        // Contract execution
        if (
            txSenderPubkey !== MINT_PUBLIC_ADDRESS &&
            typeof states[tx.recipient].body === "string" && 
            states[tx.recipient].body !== ""
        ) {
            const contractInfo = { address: tx.recipient };
            
            const newState = await jelscript(states[tx.recipient].body, states, BigInt(tx.additionalData.contractGas || 0), stateDB, latestBlock, tx, contractInfo, false);

            for (const account of Object.keys(newState)) {
                states[account] = newState[account];
            }
        }
    }

    return newTxPool;
}

module.exports = { addTransaction, clearDepreciatedTxns };
