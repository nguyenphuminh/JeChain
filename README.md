<div align="center">
	<br/>
	<img src="./assets/extended-logo.png"/>
	<br/>
	<div><b>An experimental smart contract blockchain network</b></div>
	<br/>
	<a href="https://github.com/nguyenphuminh/JeChain/blob/master/LICENSE.md"><img src="https://img.shields.io/badge/license-GPLv3-blue.svg"/></a>
	<a href="https://github.com/nguyenphuminh/JeChain/releases"><img src="https://img.shields.io/github/package-json/v/nguyenphuminh/JeChain?label=stable"></a>
	<a href="https://snyk.io/test/github/nguyenphuminh/JeChain"><img src="https://snyk.io/test/github/nguyenphuminh/JeChain/badge.svg"/></a>
	<a href="https://github.com/nguyenphuminh/JeChain/stargazers"><img src="https://img.shields.io/github/stars/nguyenphuminh/JeChain?color=gold"></a>
	<a href="https://github.com/nguyenphuminh/JeChain/blob/main/.github/PULL_REQUEST_TEMPLATE.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
</div>

## What is JeChain?

JeChain is a blockchain network platform that supports smart contracts and can act as a payment system/cryptocurrency. It is originally and still is made for experimental and educational purposes, you can have a brief look at its core ideas through its [unfinished whitepaper](https://nguyenphuminh.github.io/jechain-whitepaper.pdf).


## Setup a node

### Dependencies 

* NodeJS v16 or higher.
* Latest release of npm.

### Requirements

A system that is running Windows, Linux, or MacOS with a dual-core CPU and 8GB of RAM with a mediocre SSD/HDD should be enough.

### Installation

First, download the latest release from: https://github.com/nguyenphuminh/JeChain/releases.

Extract the zip file, in the `JeChain` folder, open up your terminal and install the required packages through `npm`:

```
npm install
```

### Generate your keys

If you haven't had a JeChain key pair before, hop over to `./utils/`, on the command line, type:

```
node keygen.js
```

And it will generate a public key and a private key for you.

### Sync chain

Currently, an "agreed" JeChain chain hasn't existed yet, so you can either create a new chain by skipping this whole section, or sync a chain from someone you happen to know that runs a JeChain node using `requestChain`.

In `./src/jenode.js`, at the bottom of the file, add:

```js
requestChain("Some JeChain node address");
```

### Configure your node

In the terminal, follow this template:

```sh
# PORT=Server's port (e.g: 3000) (default is 3000)
# PEERS=Addresses to connect to (e.g: ws://localhost:3001, ws://localhost:3002, ws://localhost:3003) (default is blank)
# MY_ADDRESS=Server's address: ws://your.ip.and:port (e.g: ws://192.168.100.2:3004) (default is ws://localhost:3000)
# PRIVATE_KEY=Your private key (default is a new randomly generated key)
# ENABLE_MINING=true if you want to mine, skip otherwise (default is blank)
# ENABLE_LOGGING=true if you want to log out contract messages, skip otherwise (default is blank)

# ENABLE_RPC=true if you want to run an RPC server, skip otherwise (default is blank)
# RPC_PORT=RPC server's port (e.g: 5000) (default is 5000)

# Start the node
node .
```

Use `set` on Windows to set variables.

### Interacting with the node through JSON-RPC apis

(This will require you to run an RPC server).

To properly interact with the node, you should use the JSON-RPC apis, especially if you are creating dapps.

[Check out docs for JSON-RPC APIs here.](./JSON-RPC.md)

**Note: This feature is still in its early stages, things might change when a stable release is ready.**

### Using the node manually through code:

You can also just use manual functions in `./src/jenode.js`

Mine a block:
```js
mine();
```

Broadcast a transaction:
```js
sendTransaction(yourTransactionObject);
```

To create a transaction object, use `Transaction`:

```js
const tx = new Transaction(publicKey, "address to be sent to", amount, gas, [args_optional]);

// Sign the transaction
tx.sign(keyPair);
```

Request for a chain and its information from some address:
```js
requestChain("Some JeChain node address");
```

If you just want to set up a node that mines continuously (like most people would), use `loopMine`:
```js
loopMine(optionalDelayTime);
```

Note: `loopMine` is used by default when mining is enabled.

You can manually connect to a node using `connect`:
```js
connect("Some JeChain node address");
```

### Run JeChain node publicly

Just do some port-forwarding, drop your public IP + the port you forwarded in and you are set!

If you don't know how to forward port, just search it up online, each router model should have its own way to do port-forwarding.


## Smart contracts?

Smart contract is still a fairly new feature in JeChain. It is only a proof of concept currently and is likely going to change in the future, but for now, you can read [this document](./CONTRACT.md) on creating smart contracts using a small language I have created called `jelscript`.

Remember to only use it for experimental purposes, I can not guarantee that this feature will be changed or not in the future. The language is also really limited and far from ready.


## Economy 

Note that this is an experimental project which is still under development, and an agreed JeChain network hasn't been formed yet, so this section is mainly just for fun.

### Units

| Unit  | Jem       |
|-------|-----------|
| Jem   | 1         |
| KJem  | 1,000     |
| Jelly | 1,000,000 |

### Tokenomic

* 100000000 Jelly (or 100000000000000 Jem) is minted originally.
* Current mining reward is 0.000297 Jelly (or 297 Jem).
* Minimum transation fee is 1 Jem or (or 0.000001 Jelly).


## Todos

* Implement a proof of stake protocol.
* Implement sharding.
* Integrate EVM into the chain?
* Use a proper database (preferably LevelDB).
* Refactor codes, or rewrite in another language entirely, preferably Rust.
* Port websocket to other p2p protocols.
* Update missing documentation.

Full todo list can be seen here: https://github.com/nguyenphuminh/JeChain/projects/2


## Support the project!

I have been maintaining the project in my free time, if you like JeChain and want to support, you can just leave a star and feel free to open issues and pull requests!

Thanks a lot!


## Using the project's source code

JeChain is 100% open-source, but if you are integrating its source code into your own project, it would be lovely if you credit the original JeChain, I would really appreciate it!


## Copyrights and License

Copyrights © 2021 Nguyen Phu Minh.

This project is licensed under the GPL 3.0 License.
