// Miner worker thread's code.
import { Block } from "../core/block";
import { Utils } from "../utils/utils";

interface MineMessage {
    type: "MINE";
    data: [Block, number];
}

interface MineResult {
    result: Block;
}

// Listening for messages from the main process
process.on("message", (message: MineMessage) => {
    if (message.type === "MINE") {
        // When the "MINE" message is received, the thread should be mining by incrementing the nonce value until a preferable hash is met.

        const block = message.data[0];
        const difficulty = message.data[1];

        for (;;) {
            // We will loop until the hash has "5+difficulty" starting zeros.
            if (block.hash.startsWith("00000" + Array(Math.floor(Utils.log16(difficulty)) + 1).join("0"))) {
                process.send!({ result: block } as MineResult);
                break;
            }
            
            block.nonce++;
            block.hash = Block.getHash(block);
        }
    }
});
