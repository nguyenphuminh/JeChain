<div align="center">
	<br/>
	<img src="./assets/extended-logo.png"/>
	<br/>
	<div><b>An experimental smart contract blockchain network</b></div>
	<br/>
	<a href="https://github.com/nguyenphuminh/JeChain/blob/master/LICENSE.md"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg"/></a>
	<a href="https://github.com/nguyenphuminh/JeChain/releases"><img src="https://img.shields.io/github/package-json/v/nguyenphuminh/JeChain?label=stable"></a>
	<a href="https://github.com/nguyenphuminh/JeChain/blob/main/.github/PULL_REQUEST_TEMPLATE.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
	<a href="https://github.com/nguyenphuminh/JeChain/stargazers"><img src="https://img.shields.io/github/stars/nguyenphuminh/JeChain?color=gold"></a>
</div>

## What is JeChain?

JeChain is a blockchain network platform that supports smart contracts and can act as a payment system/cryptocurrency. It is originally and still is made for experimental and educational purposes, you can have a brief look at its core ideas through its [**outdated** and unfinished whitepaper](https://nguyenphuminh.github.io/jechain-whitepaper.pdf).


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

And it will generate an address, a public key and a private key for you.

### Configure your node

In `config.json`, change the props for your needs:

```js
{
    "PORT": /*PORT that your node will run on, default is 3000*/,
    "RPC_PORT": /*PORT that the RPC server will run on, default is 5000*/,
    "PEERS": /*An array containing peers' address that the node will connect with, default is an empty array*/, 
    "MY_ADDRESS": /*A string containing the node's address, default is "localhost:3000"*/,
    "PRIVATE_KEY": /*A string containing a private key*/,
    "ENABLE_MINING": /*Leave true if you want to mine, default is false*/
    "ENABLE_LOGGING": /*Leave true if you want to log out contract logs, default is false*/,
    "ENABLE_RPC": /*Leave true if you want to run a RPC server, default is false*/,
    "ENABLE_CHAIN_REQUEST": /*Leave true if you want to sync chain from others, default is false*/
}
```

To see an example, `config.json` already has some data set for you to have a look at.

### Running the node

After everything is all set, simply type `node .` to run the node.

### Interacting with the node through RPC apis

This process will require you to run an RPC server, basically leave `true` in `ENABLE_RPC` in `config.json` to enable it.

To properly interact with the node, you should use the RPC apis, especially if you are creating dapps. To get started, check out [docs for RPC APIs here.](./RPC.md)

**Note: This feature is still in its early stages, things might change when a stable release is ready.**

### Run JeChain node publicly

Just do some port-forwarding, drop your public IP + the port you forwarded in and you are all set!

If you don't know how to forward port, just search it up online, each router model should have its own way to do port-forwarding.

### The JeChain network?

Note that a blockchain network is formed when a lot of computers run nodes and communicate with each other. An official "JeChain network" has not existed yet, the only thing we currently have is the node software. But hey, if you want to run an experimental test network with your friends, do it! Hit me up if you do, so I can run a node to join in your network 😉.


## Smart contracts?

Smart contract is still a fairly new feature in JeChain. It is only a proof of concept currently and is likely going to change in the future, but for now, you can read [this document](./CONTRACT.md) on creating smart contracts using a small language I have created called `jelscript`.

Remember to only use it for experimental purposes, I can not guarantee that this feature will be changed or not in the future. The language is also really limited and far from ready.


## How "ready" is JeChain?

JeChain is currently at the stage of "having all the basic things work", there are a lot of optimizations and things to implement to make it even near production-ready. To see what I am doing, check out JeChain's todo list: https://github.com/nguyenphuminh/JeChain/projects/3

### What do we currently have specifically?

* A simple P2P client for messaging in the network, with basic blocks/transactions propagation, block sync, peer discovery, etc.
* Basic data structures and serialization for transactions and blocks, with all the necessary constructs included like transaction signing, transaction/block verification, etc.
* PoW-based consensus with proper difficulty adjustment and built-in mining software.
* A runtime environment that can be used as a payment system/cryptocurrency or application platform with its smart contract support through a simple interpreted language.
* Transaction trie and storage trie that can be used for pruning/light client/safe data request in the future.
* An RPC server for applications (e.g. wallets) to interact with the blockchain data/network.


## Support the project!

I have been maintaining the project in my free time on my own. A blockchain client is really a lot of work for just one person, so if you like JeChain and want to support, you can just leave a star, feel free to open issues and pull requests and watch the projects for upcoming updates!


## Using the project's source code

JeChain is 100% open-source, but if you are integrating its source code into your own project, it would be lovely if you credit the original JeChain, I would really appreciate it!


## Copyrights and License

Copyrights © 2021 Nguyen Phu Minh.

This project is licensed under the Apache 2.0 License.
