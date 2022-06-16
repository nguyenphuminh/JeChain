// Bad RPC server implementation, will be updated soon.

const fastify = require("fastify")();

function rpc(PORT, chain, client, transactionHandler) {

    fastify.get("/:option", (req, reply) => {
        switch (req.params.option) {
            case "get_blockNumber":
                reply.send({
                    success: true,
                    payload: {
                        blockNumber: chain.chain.length
                    }
                });
                
                break;
            
            case "get_address":
                reply.send({
                    success: true, 
                    payload: {
                        address: client.publicKey
                    } 
                });

                break;
            
            case "get_work":
                reply.send({
                    success: true,
                    payload: {
                        hash: chain.getLastBlock().hash, 
                        nonce: chain.getLastBlock().nonce
                    }
                });
                
                break;
            
            default:
                reply.status(404);

                reply.send({
                    success: false,
                    payload: null,
                    error: {
                        message: "Invalid option."
                    }
                });
        }
    })

    fastify.post("/:option", (req, reply) => {
        switch (req.params.option) {

            case "get_blockByHash":
                if (typeof req.body.params !== "object" || typeof req.body.params.hash !== "string") {
                    reply.status(400);

                    reply.send({
                        success: false,
                        payload: null,
                        error: {
                            message: "Invalid request."
                        }
                    });
                } else {
                    const block = chain.chain.find(block => block.hash === req.body.params.hash);

                    if (!block) {
                        reply.status(400);

                        reply.send({
                            success: false,
                            payload: null,
                            error: {
                                message: "Invalid block hash."
                            }
                        });
                    } else {
                        reply.send({
                            success: true,
                            payload: { block }
                        });
                    }
                }
                
                break;

            case "get_blockByNumber":
                if (typeof req.body.params !== "object" || typeof req.body.params.blockNumber !== "number") {
                    reply.status(400);

                    reply.send({
                        success: false,
                        payload: null,
                        error: {
                            message: "Invalid request."
                        }
                    });
                } else {
                    if (req.body.params.blockNumber-1 < 0 || req.body.params.blockNumber-1 >= chain.chain.length) {
                        reply.status(400);

                        reply.send({
                            success: false,
                            payload: null,
                            error: {
                                message: "Invalid block number."
                            }
                        });
                    } else {
                        reply.send({
                            success: true,
                            payload: { 
                                block: chain.chain[req.body.params.blockNumber-1]
                            }
                        });
                    }
                }
                
                break;

            case "get_blockTransactionCountByHash":
                if (typeof req.body.params !== "object" || typeof req.body.params.hash !== "string") {
                    reply.status(400);

                    reply.send({
                        success: false,
                        payload: null,
                        error: {
                            message: "Invalid request."
                        }
                    })
                } else {
                    const block = chain.chain.find(block => block.hash === req.body.params.hash);

                    if (!block) {
                        reply.status(400);

                        reply.send({
                            success: false,
                            payload: null,
                            error: {
                                message: "Invalid block hash."
                            }
                        });
                    } else {
                        reply.send({
                            success: true,
                            payload: {
                                count: chain.chain.find(block => block.hash === req.body.params.hash).data.length
                            }
                        });
                    }
                }
                
                break;

            case "get_blockTransactionCountByNumber":
                if (typeof req.body.params !== "object" || typeof req.body.params.blockNumber !== "number") {
                    reply.status(400);

                    reply.send({
                        success: false,
                        payload: null,
                        error: {
                            message: "Invalid request."
                        }
                    })
                } else {
                    if (req.body.params.blockNumber-1 < 0 || req.body.params.blockNumber-1 >= chain.chain.length) {
                        reply.status(400);

                        reply.send({
                            success: false,
                            payload: null,
                            error: {
                                message: "Invalid block number."
                            }
                        });
                    } else {
                        reply.send({
                            success: true,
                            payload: {
                                count: chain.chain[parseInt(req.body.params.blockNumber)].data.length
                            }
                        });
                    }
                }

                break;
            
            case "get_balance":
                if (typeof req.body.params !== "object" || typeof req.body.params.address !== "string") {
                    reply.status(400);

                    reply.send({
                        success: false,
                        payload: null,
                        error: {
                            message: "Invalid request."
                        }
                    })
                } else {
                    reply.send({
                        success: true,
                        payload: {
                            balance: chain.getBalance(req.body.params.address) 
                        }
                    });
                }
                
                break;
           
            case "get_code":
                if (typeof req.body.params !== "object" || typeof req.body.params.address !== "string") {
                    reply.status(400);

                    reply.send({
                        success: false,
                        payload: null,
                        error: {
                            message: "Invalid request."
                        }
                    })
                } else {
                    reply.send({
                        success: true,
                        payload: {
                            code: chain.state[req.body.params.address] ? chain.state[req.body.params.address].body : ""
                        }
                    });
                }
                
                break;
            
            case "get_transactionByBlockNumberAndIndex":
                if (
                    typeof req.body.params !== "object" ||
                    typeof req.body.params.blockNumber !== "number" ||
                    typeof req.body.params.index !== "number"
                ) {
                    reply.status(400);

                    reply.send({
                        success: false,
                        payload: null,
                        error: {
                            message: "Invalid request."
                        }
                    })
                } else {
                    if (req.body.params.blockNumber-1 < 0 || req.body.params.blockNumber-1 >= chain.chain.length) {
                        reply.status(400);

                        reply.send({
                            success: false,
                            payload: null,
                            error: {
                                message: "Invalid block number."
                            }
                        });
                    } else {
                        const block = chain.chain[req.body.params.blockNumber-1];

                        if (req.body.params.index < 0 || req.body.params.index >= block.data.length) {
                            reply.status(400);
    
                            reply.send({
                                success: false,
                                payload: null,
                                error: {
                                    message: "Invalid transaction index."
                                }
                            });
                        } else {
                            reply.send({
                                success: true,
                                payload: {
                                    transaction: block.data[req.body.params.index]
                                }
                            });
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
                    reply.status(400);

                    reply.send({
                        success: false,
                        payload: null,
                        error: {
                            message: "Invalid request."
                        }
                    })
                } else {
                    const block = chain.chain.find(block => block.hash === req.body.params.hash);

                    if (!block) {
                        reply.status(400);

                        reply.send({
                            success: false,
                            payload: null,
                            error: {
                                message: "Invalid block hash."
                            }
                        });
                    } else {
                        if (req.body.params.index < 0 || req.body.params.index >= block.data.length) {
                            reply.status(400);
    
                            reply.send({
                                success: false,
                                payload: null,
                                error: {
                                    message: "Invalid transaction index."
                                }
                            });
                        } else {
                            reply.send({
                                success: true,
                                payload: {
                                    transaction: block.data[req.body.params.index]
                                }
                            });
                        }
                    }
                }

                break;

            case "sendTransaction":
                if (
                    typeof req.body.params !== "object" ||
                    typeof req.body.params.transaction !== "object"
                ) {
                    reply.status(400);

                    reply.send({
                        success: false,
                        payload: null,
                        error: {
                            message: "Invalid request."
                        }
                    })
                } else {
                    transactionHandler(req.body.params.transaction);

                    reply.send({
                        success: true,
                        payload: {
                            message: "tx received."
                        }
                    });
                }

                break;
            
            default:
                reply.status(404);

                reply.send({
                    success: false,
                    payload: null,
                    error: {
                        message: "Invalid option."
                    }
                });
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
