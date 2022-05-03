// Bad RPC server implementation, will be updated soon so no doc.

const fastify = require("fastify")();

function rpc(PORT, chain, client, transactionHandler) {
    fastify.post("/:option", (req, reply) => {
        switch (req.params.option) {
            case "blockByHash":
                reply.send({ block: chain.chain.find(block => block.hash === req.body.params.hash) });
                break;
            case "blockByNumber":
                reply.send({ block: chain.chain[parseInt(req.body.params.blockNumber-1)] });
                break;
            case "blockTransactionCountByHash":
                reply.send({ count: chain.chain.find(block => block.hash === req.body.params.hash).data.length });
                break;
            case "blockTransactionCountByNumber":
                reply.send({ count: chain.chain[parseInt(req.body.params.blockNumber)].data.length });
                break;
            case "blockNumber":
                reply.send({ blockNumber: chain.chain.length });
                break;
            case "address":
                reply.send({ address: client.publicKey }); 
                break;
            case "balance":
                reply.send({ balance: chain.getBalance(req.body.params.address) });
                break;
            case "code":
                reply.send({ code: chain.state[req.body.params.address].body });
                break;
            case "work":
                reply.send({ hash: chain.getLastBlock().hash, nonce: chain.getLastBlock().nonce });
                break;
            case "transactionByBlockNumberAndIndex":
                reply.send({ transaction: chain.chain[req.body.params.blockNumber-1].data[req.body.params.index] });
                break;
            case "transactionByBlockHashAndIndex":
                reply.send({ transaction: chain.chain.find(block => block.hash === req.body.params.hash).data[req.body.params.index] });
                break;
            case "sendTransaction":
                transactionHandler(req.body.params.transaction);

                reply.send({ status: "tx received." })

                break;
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
