<div align="center">
	<br/>
	<img src="./assets/extended-logo.png"/>
	<br/>
	<div><b>An experimental, light smart-contract-supported blockchain</b></div>
	<br/>
	<a href="https://github.com/nguyenphuminh/JeChain/blob/master/LICENSE.md"><img src="https://img.shields.io/badge/license-GPLv3-blue.svg"/></a>
	<a href="https://github.com/nguyenphuminh/JeChain/releases"><img src="https://img.shields.io/github/package-json/v/nguyenphuminh/JeChain?label=stable"></a>
	<a href="https://snyk.io/test/github/nguyenphuminh/JeChain"><img src="https://snyk.io/test/github/nguyenphuminh/JeChain/badge.svg"/></a>
</div>

## What is JeChain?
JeChain is a blockchain network platform that supports smart contracts and can act as a payment system/cryptocurrency. It is originally and still is made for experimental and educational purposes, you can have a brief look on its core ideas through its [unfinished whitepaper](https://nguyenphuminh.github.io/jechain-whitepaper.pdf).

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
# Assign "true" if you want to setup a mining node, mining is disabled by default
ENABLE_MINING=true
# Assign "true" if you want to log out smart contracts' messages, this is disabled by default
ENABLE_LOGGING=true

# Start the node
node .
```

On Windows, you can do the same with variables through `set`.

Mining a block:
```js
mine();
```

Broadcasting a transaction:
```js
sendTransaction(yourTransaction);
```

Requesting for a chain and its information: 
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

Note: All of the functions above are asynchronous functions.

### Initial coin mint?
Check `./src/blockchain.js`, have a look at the genesis block, change the receiver address to your public address (because you should be the one who holds all the coins initally). Change the amount of coins if you want, it is set to `100000000000000` by default.

You shouldn't care about the minting address though, it can be anything you want.

### Using it publicly
Just forward port, drop your public IP + the port you forwarded in and you are set! If you don't know how to forward port, just search it up online, each model should have its own way to do port-forwarding.

### Host your own blockchain network using JeChain's node
Just host a bootstrap node and a node that mines continously, and then ask people to connect to the bootstrap node, and you have technically had a working blockchain network!

## Smart contracts?
This feature is very new, and is likely going to change in the future, but for now, you can read [this document](./CONTRACT.md) on creating smart contracts using a low-level language I have created called `jelscript`.

Remember to only use it for experimental purposes, I can not guarantee that this feature will be changed or not in the future. The language is also really limited and far from ready.

## Should you use JeChain?
Surely you can, but there might be some bugs or unexpected errors, so wait for 1.0 to have the best experience.

## Upcoming features
* Proof of stake.
* Sharding.
* EVM?
* RAM to ROM.
* Better APIs.
* 

(Many features are already built, but are not pushed publicly due to testing).

## Support the project!
I have been maintaining the project for free in my own free time, if you like the project and want to support, please leave a star on this project, feel free to open issues and pull requests!

You can kindly buy me a cup of coffee through sending me some ETH or Near too if you want ❤️, my addresses are `0x029B93211e7793759534452BDB1A74b58De22C9c` and `freakdev095.near`.

Thanks!

## Using the project's code
JeChain is 100% open-source, but if you are using it for your own project, it would be lovely if you leave a credit for me, I appreciate it!

## Copyrights and License
Copyrights © 2021 Nguyen Phu Minh.

This project is licensed under the GPL 3.0 License.
