# JeChain
A PoW blockchain written in 60 lines of Javascript

## How to use
1. Type:
```
npm install
```

2. Usage:
```js
const { Block, Blockchain, JeChain } = require("./jechain.js");
// Block is a class for creating blocks.
// Blockchain is the blockchain class.
// JeChain is a "Blockchain" object, which is ready to use.

// JeChain.chain // The whole chain
// JeChain.difficulty // The difficulty
// JeChain.getLastBlock() // The latest block
// JeChain.isValid() // "true" if chain is valid, "false" otherwise.
// new Block(timestamp /*string - "optional"*/, data /*array - "optional"*/) // Creates a new "Block" object.
// JeChain.addBlock(block) // Mines the block and add the block to the chain.

// A transaction example:
JeChain.addBlock(new Block(Date.now().toString(), [{ from: "nguyenphuminh", to: "girlfriend", amount: 100 }]));
// Note that this is only an example, transactions often need more steps before being pushed to the chain.
```

## Honourable mention
This is actually based on a blockchain that I created a while ago while learning from Simply Explained, so be sure to check them out on Youtube.
