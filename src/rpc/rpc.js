// Bad RPC server implementation, will be updated soon.

"use strict";

const fastify = require("fastify")();

function rpc(PORT, client, transactionHandler, stateDB, blockDB) {

    process.on("uncaughtException", err => console.log("LOG ::", err));

    fastify.get("/:option", async (req, reply) => {

        function throwError(message, status, payload = null) {
            reply.status(status);

            reply.send({
                success: false,
                payload: null,
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
                respond({ blockNumber: Math.max(...(await blockDB.keys().all()).map(key => parseInt(key))) });
                
                break;
            
            case "get_address":
                respond({ address: client.publicKey });

                break;
            
            case "get_work":
                const latestBlock = await blockDB.get( Math.max(...(await blockDB.keys().all()).map(key => parseInt(key))).toString() );

                respond({
                    hash: latestBlock.hash, 
                    nonce: latestBlock.nonce
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
                payload: null,
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
                    const keys = (await blockDB.keys().all());

                    for (const [index, key] of keys.entries()) {
                        const block = await blockDB.get(key);
                        
                        if (index === keys.length - 1) {
                            throwError("Invalid block hash.", 400);
                        }
                        
                        if (block.hash === req.body.params.hash) {
                            respond({ block });
                        }
                    }
                }
                
                break;

            case "get_blockByNumber":
                if (typeof req.body.params !== "object" || typeof req.body.params.blockNumber !== "number") {
                    throwError("Invalid request.");
                } else {
                    const currentBlockNumber = Math.max(...(await blockDB.keys().all()).map(key => parseInt(key)));

                    if (req.body.params.blockNumber <= 0 || req.body.params.blockNumber > currentBlockNumber) {
                        throwError("Invalid block number.", 400);
                    } else {
                        const block = await blockDB.get( req.body.params.blockNumber.toString() );

                        respond({ block });
                    }
                }
                
                break;

            case "get_blockTransactionCountByHash":
                if (typeof req.body.params !== "object" || typeof req.body.params.hash !== "string") {
                    throwError("Invalid request.", 400);
                } else {
                    const keys = (await blockDB.keys().all());

                    for (const [index, key] of keys.entries()) {
                        const block = await blockDB.get(key);
                        
                        if (index === keys.length - 1) {
                            throwError("Invalid block hash.", 400);
                        }
                        
                        if (block.hash === req.body.params.hash) {
                            respond({ count: block.transactions.length });
                        }
                    }
                }
                
                break;

            case "get_blockTransactionCountByNumber":
                if (typeof req.body.params !== "object" || typeof req.body.params.blockNumber !== "number") {
                    throwError("Invalid request.", 400);
                } else {
                    const currentBlockNumber = Math.max(...(await blockDB.keys().all()).map(key => parseInt(key)));

                    if (req.body.params.blockNumber <= 0 || req.body.params.blockNumber > currentBlockNumber) {
                        throwError("Invalid block number.", 400);
                    } else {
                        const block = await blockDB.get( req.body.params.blockNumber.toString() );

                        respond({ count: block.transactions.length });
                    }
                }

                break;
            
            case "get_balance":
                if (
                    typeof req.body.params !== "object"            ||
                    typeof req.body.params.address !== "string"    ||
                    !(await stateDB.keys().all()).includes(req.body.params.address)
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    const dataFromTarget = await stateDB.get(req.body.params.address); // Fetch target's state object
                    const targetBalance = dataFromTarget.balance;                      // Get target's balance

                    respond({ balance: targetBalance });
                }
                
                break;
           
            case "get_code":
                if (
                    typeof req.body.params !== "object"            ||
                    typeof req.body.params.address !== "string"    ||
                    !(await stateDB.keys().all()).includes(req.body.params.address)
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    const dataFromTarget = await stateDB.get(req.body.params.address); // Fetch target's state object
                    const targetBody = dataFromTarget.body;                            // Get target's code body

                    respond({ code: targetBody });
                }
                
                break;
            
            case "get_storage":
                if (
                    typeof req.body.params !== "object"            ||
                    typeof req.body.params.address !== "string"    ||
                    !(await stateDB.keys().all()).includes(req.body.params.address)
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    const dataFromTarget = await stateDB.get(req.body.params.address); // Fetch target's state object
                    const targetStorage = dataFromTarget.body;                            // Get target's storage object

                    respond({ storage: targetStorage });
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
                    const currentBlockNumber = Math.max(...(await blockDB.keys().all()).map(key => parseInt(key)));

                    if (req.body.params.blockNumber <= 0 || req.body.params.blockNumber > currentBlockNumber) {
                        throwError("Invalid block number.", 400);
                    } else {
                        const block = await blockDB.get( req.body.params.blockNumber.toString() );

                        if (req.body.params.index < 0 || req.body.params.index >= block.transactions.length) {
                            throwError("Invalid transaction index.", 400);
                        } else {
                            respond({ transaction: block.transactions[req.body.params.index] });
                        }
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
                    const keys = (await blockDB.keys().all());

                    for (const [index, key] of keys.entries()) {
                        const block = await blockDB.get(key);
                        
                        if (index === keys.length - 1) {
                            throwError("Invalid block hash.", 400);
                        }
                        
                        if (block.hash === req.body.params.hash) {
                            if (req.body.params.index < 0 || req.body.params.index >= block.transactions.length) {
                                throwError("Invalid transaction index.", 400);
                            } else {
                                respond({ transaction: block.transactions[req.body.params.index] });
                            }
                        }
                    }
                }

                break;

            case "sendTransaction":
                if (
                    typeof req.body.params !== "object" ||
                    typeof req.body.params.transaction !== "object"
                ) {
                    throwError("Invalid request.", 400);
                } else {
                    respond({ message: "tx received." });

                    await transactionHandler(req.body.params.transaction);
                }

                break;
            
            default:
                throwError("Invalid option.", 404);
        }
    });

    fastify.listen(PORT, (err, address) => {
        if (err) {
            console.log("LOG :: Error at RPC server: Fastify: ", err);
            process.exit(1);
        }

        console.log(`LOG :: RPC server running on PORT ${PORT}`);
    });
}

module.exports = rpc;
