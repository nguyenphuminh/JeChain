// Worker thread's code.

const Block = require("./block");
const { log16 } = require("./utils");

// Listening for messages from the main process.
process.on("message", message => {
    if (message.type === "MINE") {
        // When the "MINE" message is received, the thread should be mining by incrementing the nonce value until a preferable hash is met.

        const block = message.data[0];
        const difficulty = message.data[1];

        for (;;) {
            // We will loop until the hash has "4+difficulty" starting zeros.
            if (block.hash.startsWith("0000" + Array(Math.floor(log16(difficulty)) + 1).join("0"))) {
                process.send({ result: block });

                break;
            }
            
            block.nonce++;
            block.hash = Block.getHash(block);
        }
    }
});
