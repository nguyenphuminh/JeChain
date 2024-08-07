"use strict";

const { Level } = require("level");
const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const fs = require("fs");
const Transaction = require("../core/transaction");
const Block = require("../core/block");
const { deserializeState } = require("../utils/utils");

const fastify = require("fastify")();

function rpc(PORT, client, transactionHandler, keyPair, stateDB, blockDB, bhashDB, codeDB, txhashDB) {

    process.on("uncaughtException", err => console.log(`\x1b[31mERROR\x1b[0m [${(new Date()).toISOString()}] Uncaught Exception`, err));

    fastify.get("/:option", async (req, reply) => {

        function throwError(message, status, payload = null) {
            reply.status(status);

            reply.send({
                success: false,
                payload,
                error: { message }
            });
        }

        function respond(payload) {
            reply.send({
                success: true,
                payload
            })
        }

        switch (req.params.option) {
            case "get_blockNumber":
                respond({ blockNumber: client.chainInfo.latestBlock.blockNumber });
                
                break;
            
            case "get_address":
                respond({ address: SHA256(client.publicKey) });

                break;
            
            case "get_pubkey":
                respond({ pubkey: client.publicKey });

                break;
            
            case "get_work":
                respond({
                    hash: client.chainInfo.latestBlock.hash,
                    nonce: client.chainInfo.latestBlock.nonce
                });
                
                break;
            
            case "mining":
                respond({ mining: client.mining });
                
                break;
            
            default:
                throwError("Invalid option.", 404);
        }
    });

    fastify.post("/:option", async (req, reply) => {
        function throwError(message, status, payload = null) {
            reply.status(status);

            reply.send({
                success: false,
                payload,
                error: { message }
            });
        }

        function respond(payload) {
            reply.send({
                success: true,
                payload
            })
        }

        switch (req.params.option) {

            case "get_blockByHash":
                if (typeof req.body.params !== "object" || typeof req.body.params.hash !== "string") {
                    throwError("Invalid request.");
                } else {
                    try {
                        const blockNumber = parseInt((await bhashDB.get(req.body.params.hash)).toString("hex"), 16).toString();
                        const block = [...await blockDB.get(blockNumber)];

                        respond({ block: Block.deserialize(block) });
                    } catch (e) {
                        throwError("Invalid block hash.", 400);
                    }
                }
                
                break;

            case "get_blockByNumber":
                if (typeof req.body.params !== "object" || typeof req.body.params.blockNumber !== "number") {
                    throwError("Invalid request.");
                } else {
                    try {
                        const block = [...await blockDB.get( req.body.params.blockNumber.toString() )];

                        respond({ block: Block.deserialize(block) });
                    } catch (e) {
                        throwError("Invalid block number.", 400);
                    }
                }
                
                break;

            case "get_blockTransactionCountByHash":
                if (typeof req.body.params !== "object" || typeof req.body.params.hash !== "string") {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        const blockNumber = parseInt((await bhashDB.get(req.body.params.hash)).toString("hex"), 16).toString();
                        const block = Block.deserialize([...await blockDB.get(blockNumber)]);

                        respond({ count: block.transactions.length });
                    } catch (e) {
                        throwError("Invalid block hash.", 400);
                    }
                }
                
                break;

            case "get_blockTransactionCountByNumber":
                if (typeof req.body.params !== "object" || typeof req.body.params.blockNumber !== "number") {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        const block = Block.deserialize([...await blockDB.get( req.body.params.blockNumber.toString() )]);

                        respond({ count: block.transactions.length });
                    } catch (e) {
                        throwError("Invalid block number.", 400);
                    }
                }

                break;
            
            case "get_balance":
                if (typeof req.body.params !== "object" || typeof req.body.params.address !== "string") {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        const dataFromTarget = deserializeState(await stateDB.get(req.body.params.address)); // Fetch target's state object
                        const targetBalance = dataFromTarget.balance;                                        // Get target's balance

                        respond({ balance: targetBalance });
                    } catch (e) {
                        throwError("Can not find account.", 400);
                    }
                }
                
                break; 
           
            case "get_code":
                if (typeof req.body.params !== "object" || typeof req.body.params.codeHash !== "string") {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        respond({ code: await codeDB.get(req.body.params.codeHash) });
                    } catch (e) {
                        throwError("Can not find code.", 400);
                    }
                }
                
                break;

            case "get_codeHash":
                if (typeof req.body.params !== "object" || typeof req.body.params.address !== "string") {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        const dataFromTarget = deserializeState(await stateDB.get(req.body.params.address)); // Fetch target's state object

                        respond({ codeHash: dataFromTarget.codeHash });
                    } catch (e) {
                        throwError("Can not find account.", 400);
                    }
                }

                break;

            case "get_nonce":
                if (typeof req.body.params !== "object" || typeof req.body.params.address !== "string") {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        const dataFromTarget = deserializeState(await stateDB.get(req.body.params.address)); // Fetch target's state object

                        respond({ nonce: dataFromTarget.nonce });
                    } catch (e) {
                        throwError("Can not find account.", 400);
                    }
                }
                
                break;
            
            case "get_storage":
                if (
                    typeof req.body.params !== "object"            ||
                    typeof req.body.params.address !== "string"    ||
                    typeof req.body.params.key !== "string"        ||
                    !fs.existsSync("./log/accountStore/" + req.body.params.address)
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        const storageDB = new Level("./log/accountStore/" + req.body.params.address);

                        respond({ storage: await storageDB.get(req.body.params.key) });

                        storageDB.close();
                    } catch (e) {
                        throwError("Can not find storage slot.", 400);
                    }
                }
                
                break;

            case "get_storageKeys":
                if (
                    typeof req.body.params.address !== "string"    ||
                    !fs.existsSync("./log/accountStore/" + req.body.params.address)
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    const storageDB = new Level("./log/accountStore/" + req.body.params.address);

                    respond({ storage: await storageDB.keys().all() });

                    storageDB.close();
                }
                
                break;
            
            case "get_storageRoot":
                if (typeof req.body.params.address !== "string") {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        respond({ storageRoot: (deserializeState(await stateDB.get(req.body.params.address))).storageRoot });
                    } catch (e) {
                        throwError("Can not find account.", 400);
                    }
                }
                
                break;
            
            case "get_transactionByBlockNumberAndIndex":
                if (
                    typeof req.body.params !== "object" ||
                    typeof req.body.params.blockNumber !== "number" ||
                    typeof req.body.params.index !== "number"
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        const block = Block.deserialize([...await blockDB.get( req.body.params.blockNumber.toString() )]);

                        if (req.body.params.index < 0 || req.body.params.index >= block.transactions.length) {
                            throwError("Invalid transaction index.", 400);
                        } else {
                            respond({ transaction: block.transactions[req.body.params.index] });
                        }
                    } catch (e) {
                        throwError("Invalid block number.", 400);
                    }
                }

                break;

            case "get_transactionByBlockHashAndIndex":
                if (
                    typeof req.body.params !== "object" ||
                    typeof req.body.params.hash !== "string" ||
                    typeof req.body.params.index !== "number"
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        const blockNumber = parseInt((await bhashDB.get(req.body.params.hash)).toString("hex"), 16).toString();
                        const block = Block.deserialize([...await blockDB.get( blockNumber )]);

                        if (req.body.params.index < 0 || req.body.params.index >= block.transactions.length) {
                            throwError("Invalid transaction index.", 400);
                        } else {
                            respond({ transaction: block.transactions[req.body.params.index] });
                        }
                    } catch (e) {
                        throwError("Invalid block hash.", 400);
                    }
                }

                break;

            case "get_transactionByTxHash":
                if (
                    typeof req.body.params !== "object" ||
                    typeof req.body.params.hash !== "string"
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    try {
                        const indexPair = await txhashDB.get(req.body.params.hash);

                        const [ blockNumber, txIndex ] = indexPair.split(" ").map(item => parseInt(item));

                        const block = Block.deserialize([...await blockDB.get( blockNumber.toString() )]);
                        const transaction = block.transactions[txIndex];

                        respond({ transaction });
                    } catch (e) {
                        throwError("Failed to get transaction with the given hash.", 400);
                    }
                }

                break;

            case "sendTransaction":
                if (
                    typeof req.body.params !== "object" ||
                    !Array.isArray(req.body.params.transaction)
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    respond({ message: "tx received." });

                    await transactionHandler(req.body.params.transaction);
                }

                break;
            
            case "signTransaction":
                if (
                    typeof req.body.params !== "object" ||
                    typeof req.body.params.transaction !== "object"
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    const transaction = req.body.params.transaction;

                    Transaction.sign(transaction, keyPair);

                    respond({ transaction });
                }

                break;
            
            case "serializeTransaction":
                if (
                    typeof req.body.params !== "object" ||
                    typeof req.body.params.transaction !== "object"
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    const transaction = req.body.params.transaction;

                    try {
                        respond({ transaction: Transaction.serialize(transaction) });
                    } catch (e) {
                        throwError("Failed to serialize.", 400);
                    }
                }

                break;
            
            case "deserializeTransaction":
                if (
                    typeof req.body.params !== "object" ||
                    !Array.isArray(req.body.params.transaction)
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    const transaction = req.body.params.transaction;

                    try {
                        respond({ transaction: Transaction.deserialize(transaction) });
                    } catch (e) {
                        throwError("Failed to deserialize.", 400);
                    }
                }

                break;
            
            default:
                throwError("Invalid option.", 404);
        }
    });

    fastify.listen(PORT, (err) => {
        if (err) {
            console.log(`\x1b[31mERROR\x1b[0m [${(new Date()).toISOString()}] Error at RPC server: Fastify: `, err);
            process.exit(1);
        }

        console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] RPC server listening on PORT ${PORT}`);
    });
}

module.exports = rpc;
