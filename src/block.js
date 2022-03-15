const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const Transaction = require("./transaction");
const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

class Block {
    constructor(index = 1, timestamp, data, difficulty = 1) {
        // Block's index
        this.blockNumber = index;
        // Block's creation timestamp
        this.timestamp = timestamp;
        // Block's transactions
        this.data = data;
        // Parent (previous) block's hash
        this.prevHash = "";
        // Block's hash
        this.hash = Block.getHash(this);
        // Difficulty
        this.difficulty = difficulty;
        // Nonce
        this.nonce = 0;
    }

    // Calculate the hash of the block
    static getHash(block) {
        return SHA256(block.blockNumber.toString() + block.prevHash + block.timestamp + JSON.stringify(block.data) + block.difficulty + block.nonce);
    }

    // Check if transactions in the block are valid
    static hasValidTransactions(block, state) {
        // We will loop over the "data" prop, which holds all the transactions.
        // If the sender's address is the mint address, we will store the amount into "reward".
        // Gases are stored into "gas".
        
        // Senders' balance are stored into "balance" with the key being their address, the value being their balance.
        // Their balance are changed based on "amount" and "gas" props in each transactions.

        let gas = 0, reward = 0, balances = {};

        block.data.forEach(transaction => {
            if (transaction.from !== MINT_PUBLIC_ADDRESS) {
                if (!balances[transaction.from]) {
                    balances[transaction.from] = (state[transaction.from] ? state[transaction.from].balance : 0) - transaction.amount - transaction.gas;
                } else {
                    balances[transaction.from] -= transaction.amount + transaction.gas;
                }
                gas += transaction.gas;
            } else {
                reward = transaction.amount;
            }
        });

        // The transactions are valid under these criterias:
        // - The subtraction of "reward" and "gas" should be the fixed reward, so that they can't get lower/higher reward.
        // - Every transactions are valid on their own (checked by Transaction.isValid).
        // - There is only one mint transaction.
        // - Senders' balance after sending should be greater than 1, which means they have enough money to create their transactions.

        return (
            reward - gas === 297 &&
            block.data.every(transaction => Transaction.isValid(transaction, state)) && 
            block.data.filter(transaction => transaction.from === MINT_PUBLIC_ADDRESS).length === 1 &&
            Object.values(balances).every(balance => balance >= 0)
        );
    }
}

module.exports = Block;
