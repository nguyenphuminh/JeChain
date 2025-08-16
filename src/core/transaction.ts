import BN from "bn.js";
import EC from "elliptic";
import { Utils } from "../utils/utils";

const ec = new EC.ec("secp256k1");

export interface Signature {
    v?: number;
    r?: bigint;
    s?: bigint;
}

export interface TransactionOptions {
    recipient?: string;
    amount?: bigint;
    gas?: number;
    gasPrice?: bigint;
    data?: Buffer;
    nonce?: number;
}

export class Transaction {
    public recipient: string; // Recipient's address
    public amount: bigint;    // Amount to be sent
    public gas: number;       // Gas that transaction consumed + tip for miner
    public gasPrice: bigint;  // Price per gas
    public data: Buffer;      // Transaction data
    public nonce: number;     // Nonce
    public signature: Signature = {};    // Signature

    constructor(options: TransactionOptions) {
        this.recipient = options.recipient || "";
        this.amount = options.amount || 0n;
        this.gas = options.gas || 0;
        this.gasPrice = options.gasPrice || 0n;
        this.data = options.data || Buffer.from([]);
        this.nonce = options.nonce || 0;
        this.signature = {};
    }

    static serialize(tx: Transaction, noSig: boolean = false): Buffer {
        // Transaction fields
        // - recipient: 32 bytes | Hex string
        // - amount: 11 bytes | bigint
        // - gas: 3 bytes | number
        // - gas price: 8 bytes | bigint
        // - nonce: 3 bytes | number
        // - r: 32 bytes | bigint
        // - s: 32 bytes | bigint
        // - v: 1 byte | number
        // - data: n bytes left

        // Signature validation for full serialization
        if (!noSig && (!tx.signature.v || !tx.signature.r || !tx.signature.s)) {
            throw new Error("No signature to serialize");
        }

        // Calculate buffer size
        const baseSize = 57; // recipient(32) + amount(11) + gas(3) + gasPrice(8) + nonce(3)
        const sigSize = noSig ? 0 : 65; // r(32) + s(32) + v(1)
        const txBuffer = Buffer.alloc(baseSize + sigSize + tx.data.length);

        // Closure for writing fields
        let offset = 0;
        const writeField = (value: string | number | bigint, bytes: number) => {
            if (typeof value === 'string') {
                txBuffer.write(value.padStart(bytes * 2, "0"), offset, "hex");
            } else {
                txBuffer.write(value.toString(16).padStart(bytes * 2, "0"), offset, "hex");
            }
            offset += bytes;
        };

        // Write common fields
        writeField(tx.recipient, 32);
        writeField(tx.amount, 11);
        writeField(tx.gas, 3);
        writeField(tx.gasPrice, 8);
        writeField(tx.nonce, 3);

        // Write signature fields if needed
        if (!noSig) {
            writeField(tx.signature.r!, 32);
            writeField(tx.signature.s!, 32);
            writeField(tx.signature.v!, 1);
        }

        // Write data
        tx.data.copy(txBuffer, offset);

        return txBuffer;
    }

    static deserialize(txBuffer: Buffer): Transaction {
        const recipient = txBuffer.subarray(0, 32).toString("hex");
        const amount = BigInt("0x" + txBuffer.subarray(32, 43).toString("hex"));
        const gas = parseInt("0x" + txBuffer.subarray(43, 46).toString("hex"));
        const gasPrice = BigInt("0x" + txBuffer.subarray(46, 54).toString("hex"));
        const nonce = parseInt("0x" + txBuffer.subarray(54, 57).toString("hex"));
        const signature = {
            r: BigInt("0x" + txBuffer.subarray(57, 89).toString("hex")),
            s: BigInt("0x" + txBuffer.subarray(89, 121).toString("hex")),
            v: parseInt("0x" + txBuffer.subarray(121, 122).toString("hex"))
        }
        const data = txBuffer.subarray(122, txBuffer.length);

        const txObj: Transaction = {
            recipient,
            amount,
            gas,
            gasPrice,
            nonce,
            signature,
            data,
        };

        return txObj;
    }

    static getHash(tx: Transaction, noSig = true) {
        return Utils.sha256(Transaction.serialize(tx, noSig));
    }

    static sign(tx: Transaction, keyPair: EC.ec.KeyPair) {
        const sigObj = keyPair.sign(Transaction.getHash(tx));

        tx.signature = {
            v: sigObj.recoveryParam || 0,
            r: BigInt(sigObj.r.toString()),
            s: BigInt(sigObj.s.toString())
        };
    }

    static getPubKey(tx: Transaction): string {
        // Checks
        if (!tx.signature.v || !tx.signature.r || !tx.signature.s) {
            throw new Error("No signature to serialize");
        }

        // Get transaction's body's hash and recover original signature object
        const msgHash = Transaction.getHash(tx);

        const sigObj = {
            r: new BN(tx.signature.r.toString(16), 16),
            s: new BN(tx.signature.s.toString(16), 16),
            recoveryParam: tx.signature.v
        };

        // Recover public key and get real address.
        const txSenderPubkey = ec.recoverPubKey(
            new BN(msgHash, 16).toString(10),
            sigObj,
            sigObj.recoveryParam
        );

        return ec.keyFromPublic(txSenderPubkey).getPublic("hex");
    }

    static getAddress(tx: Transaction): string {
        return Utils.sha256(Buffer.from(Transaction.getPubKey(tx), "hex"));
    }
}
