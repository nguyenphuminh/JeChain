import common from "../common/common";
import { Block } from "./block";
import { CustomLevel } from "./level";
import { Transaction } from "./transaction";

export interface StateOptions {
    db?: CustomLevel;
}

export interface StateHeader {
    balance: bigint,
    codeHash: string,
    nonce: number,
    storageRoot: string
}

export interface StateRunOptions {
    block: Block;
    terminateIfFaulty?: boolean;
    writeToDB?: boolean;
}

export interface StateRunResult {
    updatedState: Record<string, StateHeader>;
    failedTransactions: Transaction[];
    terminated: boolean;
}

export class State {
    public db: CustomLevel;

    constructor(options: StateOptions = {}) {
        this.db = options.db || new CustomLevel("./db/state");
    }

    static serialize(stateHeader: StateHeader): Buffer {
        const stateBuffer = Buffer.alloc(78);
        let offset = 0;

        stateBuffer.write(stateHeader.balance.toString(16).padStart(22, "0"), offset, "hex");
        offset += 11;
        stateBuffer.write(stateHeader.codeHash, offset, "hex");
        offset += 32;
        stateBuffer.write(stateHeader.nonce.toString(16).padStart(6, "0"), offset, "hex");
        offset += 3;
        stateBuffer.write(stateHeader.storageRoot, offset, "hex");
        offset += 32;

        return stateBuffer;
    }

    static deserialize(stateBuffer: Buffer): StateHeader {
        const balance = BigInt("0x" + stateBuffer.subarray(0, 11).toString("hex"));
        const codeHash = stateBuffer.subarray(11, 43).toString("hex");
        const nonce = parseInt("0x" + stateBuffer.subarray(43, 46).toString("hex"));
        const storageRoot = stateBuffer.subarray(46, 78).toString("hex");

        return {
            balance,
            codeHash,
            nonce,
            storageRoot
        }
    }

    static newAccountHeader(): StateHeader {
        return {
            balance: 0n,
            codeHash: common.emptyHash,
            nonce: 0,
            storageRoot: common.emptyHash
        }
    }

    async run(options: StateRunOptions): Promise<StateRunResult> {
        // Input
        const block = options.block;
        const terminateIfFaulty = options.terminateIfFaulty ?? false;
        const writeToDB = options.writeToDB ?? true;
        // Hold cache or new state to update
        const stateCache: Record<string, StateHeader> = {};
        // Hold failed transactions
        const failedTransactions = [];
        // Total gas fee rewarded to miner (coinbase address)
        let gasFeeForCoinbase = 0n;
        let gasUsedInBlock = 0;
    
        // Iterate over transactions in block
        for (let index = 0; index < block.transactions.length; index++) {
            const tx = block.transactions[index];
            let gasUsed = 21000; // Base tx gas usage

            // We write it in a check-then-effects way, order the fail-able tasks first, and only update state in
            // the most simple manner possible so that those updates would not fail which can cause state disparity
            try {
                // Get sender from sig
                const senderAddress = Transaction.getAddress(tx);

                // Cache sender state if not already
                if (!stateCache[senderAddress]) {
                    stateCache[senderAddress] = State.deserialize(await this.db.get(`ACCOUNT${senderAddress}`));
                }

                const senderState = stateCache[senderAddress];

                // Check nonce
                if (senderState.nonce !== tx.nonce) {
                    throw new Error("INVALID_NONCE");
                }

                // Check gas price (simplified to 1 wei for now)
                if (tx.gasPrice < 1n) {
                    throw new Error("GAS_PRICE_TOO_LOW");
                }

                // Check gas
                if (tx.gas < gasUsed) {
                    throw new Error("NOT_ENOUGH_GAS");
                }

                if (gasUsed + gasUsedInBlock > common.blockGasLimit) {
                    throw new Error("GAS_EXCEEDED_LIMIT");
                }

                // Check balance
                const totalGasFee = (BigInt(gasUsed) * tx.gasPrice);
                const totalSpent = tx.amount + totalGasFee;
                if (senderState.balance < totalSpent) {
                    throw new Error("INSUFFICIENT_BALANCE");
                }

                // Cache recipient state if not already
                if (!stateCache[tx.recipient]) {
                    try {
                        stateCache[tx.recipient] = State.deserialize(await this.db.get(`ACCOUNT${tx.recipient}`));
                    } catch (error: any) {
                        // If account does not exist already, create new
                        if (error.notFound || error.code === "LEVEL_NOT_FOUND") {
                            stateCache[tx.recipient] = State.newAccountHeader();
                        }
                    }
                }

                // Update balance
                senderState.balance -= totalSpent;
                stateCache[tx.recipient].balance += tx.amount;
                gasFeeForCoinbase += totalGasFee;

                // Increase nonce
                senderState.nonce++;

                // Add gas used to total gas used in block
                gasUsedInBlock += gasUsed;
            } catch (error) {
                // If any error happens, the transaction is faulty
                if (terminateIfFaulty) return {
                    updatedState: stateCache,
                    failedTransactions: [tx],
                    terminated: true
                }
                
                failedTransactions.push(tx);
            }
        }

        // Send reward to coinbase address
        if (!stateCache[block.coinbase]) {
            try {
                stateCache[block.coinbase] = State.deserialize(await this.db.get(`ACCOUNT${block.coinbase}`));
            } catch (error: any) {
                // If account does not exist already, create new
                if (error.notFound || error.code === "LEVEL_NOT_FOUND") {
                    stateCache[block.coinbase] = State.newAccountHeader();
                }
            }
        }

        stateCache[block.coinbase].balance += common.blockReward + gasFeeForCoinbase;

        // Finalize state into DB if specified
        if (writeToDB) {
            const ops = [];

            for (const address in stateCache) {
                ops.push({
                    type: "put",
                    key: `ACCOUNT${address}`,
                    value: State.serialize(stateCache[address])
                });
            }

            await this.db.batch(ops);
        }

        return {
            updatedState: stateCache,
            failedTransactions,
            terminated: false
        }
    } 
}
