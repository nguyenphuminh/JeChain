const Block = require("./block");

process.on("message", message => {
    if (message.type === "MINE") {
        const block = message.data[0];
        const difficulty = message.data[1];

        for (;;) {
            if (block.hash.startsWith(Array(difficulty + 1).join("0"))) {
                process.send({ result: block });

                break;
            }
            
            block.nonce++;
            block.hash = Block.getHash(block);
        }
    }
});
