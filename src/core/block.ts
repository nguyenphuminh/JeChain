import { Utils } from "../utils/utils";
import { Transaction } from "./transaction";
import common from "../common/common";
import { Merkle } from "./merkle";

export interface BlockOptions {
    transactions?: Transaction[];
    txRoot?: string;
    number?: number;
    timestamp?: number;
    parentHash?: string;
    difficulty?: number;
    coinbase?: string;
    nonce?: number;
    hash?: string;
}

export class Block {
    public transactions: Transaction[];
    public txRoot: string;
    public number: number;
    public timestamp: number;
    public parentHash: string;
    public difficulty: number;
    public coinbase: string;
    public nonce: number;
    public hash: string;

    constructor(options: BlockOptions) {
        this.transactions = options.transactions || [];
        this.txRoot = options.txRoot || Merkle.buildRoot(this.transactions.map(tx => Transaction.getHash(tx, false)));
        this.number = options.number || 0;
        this.timestamp = options.timestamp || Date.now();
        this.parentHash = options.parentHash || common.emptyHash;
        this.difficulty = options.difficulty || 1;
        this.coinbase = options.coinbase || common.emptyHash;
        this.nonce = options.nonce || 0;
        this.hash = options.hash || Block.getHash(this);
    }

    static serialize(block: Block): Buffer {
        // Block fields
        // - Block number: 4 bytes | number
        // - Timestamp: 6 bytes | number
        // - Difficulty: 8 bytes | number
        // - Parent hash: 32 bytes | Hex string
        // - Nonce: 5 bytes | number
        // - Tx root: 32 bytes | Hex string
        // - Coinbase: 32 bytes | Hex string
        // - Hash: 32 bytes | Hex string
        // - Transactions: What"s left, for each transaction we do:
        //   - Offset: 4 bytes | number
        //   - Transaction body: <offset> bytes | Byte array

        // Calculate transaction data size
        const serializedTxs = block.transactions.map(tx => Transaction.serialize(tx));
        const txDataSize = serializedTxs.reduce((sum, tx) => sum + 4 + tx.length, 0); // 4 bytes offset + tx data

        // Allocate buffer: 151 bytes fixed + transaction data
        const buffer = Buffer.alloc(151 + txDataSize);

        // Closure for writing fields
        let offset = 0;
        const writeField = (value: string | number, bytes: number) => {
            if (typeof value === "string") {
                buffer.write(value.padStart(bytes * 2, "0"), offset, "hex");
            } else {
                buffer.write(value.toString(16).padStart(bytes * 2, "0"), offset, "hex");
            }
            offset += bytes;
        };

        // Write fixed fields
        writeField(block.number, 4);
        writeField(block.timestamp, 6);
        writeField(block.difficulty, 8);
        writeField(block.parentHash, 32);
        writeField(block.nonce, 5);
        writeField(block.txRoot, 32);
        writeField(block.coinbase, 32);
        writeField(block.hash, 32);

        // Write transactions
        serializedTxs.forEach(txBuffer => {
            writeField(txBuffer.length, 4); // Transaction length
            txBuffer.copy(buffer, offset);   // Transaction data
            offset += txBuffer.length;
        });

        return buffer;
    }

    static deserialize(buffer: Buffer): Block {
        const number = parseInt("0x" + buffer.subarray(0, 4).toString("hex"));
        const timestamp = parseInt("0x" + buffer.subarray(4, 10).toString("hex"));
        const difficulty = parseInt("0x" + buffer.subarray(10, 18).toString("hex"));
        const parentHash = buffer.subarray(18, 50).toString("hex");
        const nonce = parseInt("0x" + buffer.subarray(50, 55).toString("hex"));
        const txRoot = buffer.subarray(55, 87).toString("hex");
        const coinbase = buffer.subarray(87, 119).toString("hex");
        const hash = buffer.subarray(119, 151).toString("hex");

        // Deserialize transactions
        const transactions: Transaction[] = [];
        let offset = 151;

        while (offset < buffer.length) {
            const txLength = parseInt("0x" + buffer.subarray(offset, offset + 4).toString("hex"));
            offset += 4;

            const txBuffer = buffer.subarray(offset, offset + txLength);
            transactions.push(Transaction.deserialize(txBuffer));
            offset += txLength;
        }

        return new Block({
            number,
            timestamp,
            difficulty,
            parentHash,
            nonce,
            txRoot,
            coinbase,
            hash,
            transactions
        });
    }

    static getHash(block: Block): string {
        // Fields to hash (exclude hash field):
        // - number, timestamp, difficulty, parentHash, nonce, txRoot, coinbase

        const buffer = Buffer.alloc(119); // Total bytes for these fields
        let offset = 0;

        const writeField = (value: string | number, bytes: number) => {
            if (typeof value === 'string') {
                buffer.write(value.padStart(bytes * 2, "0"), offset, "hex");
            } else {
                buffer.write(value.toString(16).padStart(bytes * 2, "0"), offset, "hex");
            }
            offset += bytes;
        };

        writeField(block.number, 4);
        writeField(block.timestamp, 6);
        writeField(block.difficulty, 8);
        writeField(block.parentHash, 32);
        writeField(block.nonce, 5);
        writeField(block.txRoot, 32);
        writeField(block.coinbase, 32);

        return Utils.sha256(buffer);
    }
}
