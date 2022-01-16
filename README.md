<div align="center">
	<br/>
	<img src="./assets/extended-logo.png"/>
	<br/>
	<div><b>An educational-purpose, light smart-contract-supported blockchain</b></div>
	<br/>
	<a href="https://github.com/nguyenphuminh/JeChain/blob/master/LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-blue.svg"/></a>
	<a href="https://github.com/nguyenphuminh/JeChain/releases"><img src="https://img.shields.io/github/package-json/v/nguyenphuminh/JeChain?label=stable"></a>
	<a href="https://snyk.io/test/github/nguyenphuminh/JeChain"><img src="https://snyk.io/test/github/nguyenphuminh/JeChain/badge.svg"/></a>
</div>

## What is JeChain?
JeChain is a proof-of-work blockchain which has smart contract supports, created using Javascript, originally used in [this series on dev.to](https://dev.to/freakcdev297/series/15322). If you are here for that, consider checking out [this repo](https://github.com/nguyenphuminh/blockchain-tutorial/tree/main/Creating%20a%20blockchain%20in%2060%20lines%20of%20Javascript).

To know how this code work properly, you can check out the tutorial series on dev.to:
* [Part 1: Creating a blockchain in 60 lines of Javascript](https://dev.to/freakcdev297/creating-a-blockchain-in-60-lines-of-javascript-5fka)
* [Part 2: Creating a cryptocurrency - Creating transactions, mining rewards, mint and gas fee ](https://dev.to/freakcdev297/creating-transactions-mining-rewards-mint-and-gas-fee-5hhf)
* [Part 3: Build a p2p network and release your cryptocurrency](https://dev.to/freakcdev297/build-a-p2p-network-and-release-your-cryptocurrency-clf)

Although created mainly as an educational project, JeChain is still being actively developed and new features are still coming in. It might even be production-ready in the future.

## Why JeChain?
* Good learning material.
* Simple, easy to configure.
* Open-source
* Smart contract support.

## Setup and use
First, be sure to have Nodejs installed on your machine.

Next, install all the needed packages:
```
npm install
```

If you haven't had your keys, goto `./utils` and type `node keygen`, it will generate a key pair for you. 

Then, if you want to start a node, open the terminal, configure it first:
```sh
# PORT
PORT=Insert your port here
# Peers to connect when startup
PEERS=Address 1, address 2, address 3
# Set your address
MY_ADDRESS=ws://your.ip.and:port
# Set your private key
PRIVATE_KEY=your key
# Assign "true" if you want to setup a mining node
ENABLE_MINING=true

# Start the node
node .
```

The equivalent of this on Windows is `set PORT=Insert your port here`

You can mine a block like this:
```js
mine();
```

You can broadcast a transaction like this:
```js
sendTransaction(yourTransaction);
```

You can request for a chain and chain's info with a handy dandy function called `requestChain`: 
```js
requestChain("An address you trust");
```

If you just want to set up a node that mines continously (like most people would), use `loopMine`:
```js
loopMine(optional_delay_time);
```

You can manually connect to a node using `connect`:
```js
connect("address");
```

### Initial coin release?
Check `./src/blockchain.js`, have a look at the genesis block, change the receiver address to your public address (because you should be the one who holds all the coins initally). Change the amount of coins if you want, it is set to `100000000` by default.

You shouldn't care about the minting address though, it can be anything you want.

### Using it publicly
Just forward port, drop your public IP + the port you forwarded in and you are set! If you don't know how to forward port, just search it up online, I can't really put a link here because each router model has a different way to do port forwarding.

### Host your own blockchain network using JeChain's base
Just host a bootstrap node and a node that mines continously, and then ask people to connect to the bootstrap node, and you have technically had a working blockchain network!

## Smart contracts?
This feature is very new, and is likely going to change in the future, but for now, you can read [this document](./CONTRACT.md) on creating smart contracts using a low-level language that I have created called `jelscript`.

Remember to only use it for experimental purposes, I can not guarantee that this feature will be changed or not in the future.

## Should you use JeChain?
You can use it now, but wait until 1.0 to have the best experience.

## Upcoming features
* Improved security and performance.
* Proof-of-stake.

## Using JeChain's code
You can use the code in this project to build a chain on your own, but remember to mention me (and any other main contributors of the project) in the credit, thanks.

## Support the project/tutorial series
If you love the project or [my tutorial series on dev.to](https://dev.to/freakcdev297/build-a-p2p-network-and-release-your-cryptocurrency-clf), you can support me by:
* Leaving a star on this repo.
* Buying me a cup of latte through sending me some cryptos to:
  * My Bitcoin address: `bc1qk329eh7ggwrx34qnkzkgsm50jjv3x7haydfzk6`.
  * My Ethereum/BSC/Aurora address: `0x029B93211e7793759534452BDB1A74b58De22C9c`.
  * My Near address: `freakdev095.near`
  * My Solana address: `3tpbc8EXnUVqU3nkTSF3wm7NQsmJ2AW7syJGArFdJ9Yd`.

Thanks a lot for your help, I really appreciate it!

## Copyrights and License
Copyrights © 2021 Nguyen Phu Minh.

This project is licensed under the MIT License.
