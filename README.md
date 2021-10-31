# JeChain
A PoW blockchain written in 60 lines of Javascript

## What is JeChain?
JeChain is a proof-of-work blockchain created using Javascript in just 60 lines of code.

## Why JeChain?
JeChain was created for educational purposes, so you can learn the basics of blockchains through JeChain.

## Should you use JeChain for your project?
No, proof-of-work is extremely outdated, JeChain is slow as well since it's written in Javascript, and the thing has no modern feature you would expect from a blockchain platform. It should only stay as an educational project.

## How to use
1. Create an entry file (index.js for example)

2. Here are some features of JeChain, read the usage and start coding:
```js
const { Block, Blockchain, JeChain } = require("./jechain.js");
// Block is a class for creating blocks.
// Blockchain is the blockchain class, which means you can inherit this class and upgrade JeChain if you want.
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

## Resources
JeChain is actually used as a tutorial on [dev.to - Creating a blockchain in 60 lines of Javascript](https://dev.to/freakcdev297/creating-a-blockchain-in-60-lines-of-javascript-5fka)

## Honourable mention
This is actually based on a blockchain that I created a while ago while learning from Simply Explained, so be sure to check them out on Youtube.

## Support me!
If you like JeChain and my article at dev.to, please buy me a cup of coffee through sending me some coins. My BEP-20 address is `0x1848Ba922d6eD66D4910176998fF4fa77AEb82D5`.

## Copyrights and License
Copyrights (c) 2021 Nguyen Phu Minh.

This project is licensed under the MIT License.
