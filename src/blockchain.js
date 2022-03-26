const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const Block = require("./block");
const Transaction = require("./transaction");
const { log16 } = require("./utils");
const { changeState, triggerContract } = require("./state");
const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

class Blockchain {
    constructor() {
        // Initial coin release transaction
        const initialCoinRelease = new Transaction(MINT_PUBLIC_ADDRESS, "04f91a1954d96068c26c860e5935c568c1a4ca757804e26716b27c95d152722c054e7a459bfd0b3ab22ef65a820cc93a9f316a9dd213d31fdf7a28621b43119b73", 100000000000000, 0, [], "");
        // Transaction pool
        this.transactions = [];
        // Blocks
        this.chain = [new Block(1, "1647245268695", [initialCoinRelease], 1)];
        // Mining difficulty
        this.difficulty = 1;
        // Fixed blockTime
        this.blockTime = 30000;
        // Fixed reward
        this.reward = 297;
        // Chain state
        this.state = {
            // State of the initial address, as you can see, it will contain:
            // - "balance" which is the address's balance.
            // - "body" which is the body of a contract address, it is left empty if it's not a contract address.
            // - "timestamps" which holds all existed timestamps.
            // - "storage" which acts a key-value database for a contract.
            "04f91a1954d96068c26c860e5935c568c1a4ca757804e26716b27c95d152722c054e7a459bfd0b3ab22ef65a820cc93a9f316a9dd213d31fdf7a28621b43119b73": {
                balance: 100000000000000,
                body: "",
                timestamps: [],
                storage: {}
            }
        };
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }

    addTransaction(transaction) {
        // Transactions are added into "this.transactions", which is the transaction pool.
        // To be added, transactions must be valid, and they are valid under these criterias:
        // - They are valid based on Transaction.isValid
        // - The balance of the sender is enough to make the transaction (based his transactions the pool).
        // - Its timestamp are not already used.

        let balance = this.getBalance(transaction.from) - transaction.amount - transaction.gas;

        this.transactions.forEach(tx => {
            if (tx.from === transaction.from) {
                balance -= tx.amount + tx.gas;
            }
        });

        if (
            Transaction.isValid(transaction, this.state) && 
            balance >= 0 && 
            !this.transactions.filter(_tx => _tx.from === transaction.from).some(_tx => _tx.timestamp === transaction.timestamp)
        ) {
            this.transactions.push(transaction);
        }
    }

    getBalance(address) {
        // Get balance from chain state.
        return this.state[address] ? this.state[address].balance : 0;
    }

    static isValid(blockchain) {
        // Iterate over blocks, checking if their hashes and transactions are valid.

        // Blocks are valid under these conditions:
        // - Current block's prevHash is equal to previous block's hash.
        // - The hash of the current block matches with its data.
        // - Transactions in the block is valid.
        // - Block's hash starts with 4+floor(log16(block_difficulty)).
        // - Current block's blockNumber is next to previous block's blockNumber.
        // - Current block's timestamp must be greater than previous block's timestamp.
        // - Difficulty must be changed correctly.

        let difficulty = 1;
        let state = {
            "04f91a1954d96068c26c860e5935c568c1a4ca757804e26716b27c95d152722c054e7a459bfd0b3ab22ef65a820cc93a9f316a9dd213d31fdf7a28621b43119b73": {
                balance: 100000000000000,
                body: "",
                timestamps: [],
                storage: {}
            }
        };

        for (let i = 1; i < blockchain.chain.length; i++) {
            const currentBlock = blockchain.chain[i];
            const prevBlock = blockchain.chain[i-1];

            if (
                currentBlock.difficulty !== difficulty ||
                currentBlock.hash !== Block.getHash(currentBlock) || 
                prevBlock.hash !== currentBlock.prevHash || 
                !Block.hasValidTransactions(currentBlock, state) ||
                !currentBlock.hash.startsWith("0000" + Array(Math.floor(log16(difficulty)) + 1).join("0")) ||
                currentBlock.blockNumber - 1 !== prevBlock.blockNumber ||
                parseInt(currentBlock.timestamp) <= parseInt(prevBlock.timestamp)
            ) {
                return false;
            }

            if (currentBlock.blockNumber % 100 === 0) {
                difficulty = Math.ceil(difficulty * 3000000 / (parseInt(currentBlock.timestamp) - parseInt(blockchain.chain[blockchain.chain.blockNumber-100].timestamp)));
            }

            changeState(currentBlock, state);

            triggerContract(currentBlock, state);
        }

        return true;
    }
}

module.exports = Blockchain;
