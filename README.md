# JeChain
A simple PoW blockchain.

## What is JeChain?
JeChain is a proof-of-work blockchain created using Javascript, originally used in [this series on dev.to](https://dev.to/freakcdev297/series/15322). If you are here for that, consider checking out [this repo](https://github.com/nguyenphuminh/blockchain-tutorial/tree/main/Creating%20a%20blockchain%20in%2060%20lines%20of%20Javascript).

## Why JeChain?
JeChain was created for educational purposes, also as an attempt trying to create a full-blown blockchain network.

## Setup and use
First, be sure to have Nodejs installed on your machine first.

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

# Start the node
node jecoin
```

The equivalent with this on Windows is `set var_name=value`

You can mine a block like this:
```js
if (JeChain.transactions.length !== 0) {
    JeChain.mineTransactions(publicKey);

    sendMessage(produceMessage("TYPE_REPLACE_CHAIN", [
        JeChain.getLastBlock(),
        JeChain.difficulty
    ]));
}
```

You can create a transaction like this:
```js
sendMessage(produceMessage("TYPE_CREATE_TRANSACTION", someTransaction));
JeChain.addTransaction(someTransaction);
```

You can request for a chain and chain's info like this: 
```js
const socket = opened.filter(node => node.address === "An address you trust")[0].socket;

socket.send(JSON.stringify(produceMessage("TYPE_REQUEST_CHAIN", MY_ADDRESS)));
socket.send(JSON.stringify(produceMessage("TYPE_REQUEST_INFO", MY_ADDRESS)));
```

## Should you use JeChain?
No, it's more of a proof-of-concept, not a production-ready chain, so no.

## Copyrights and License
Copyrights (c) 2021 Nguyen Phu Minh.

This project is licensed under the MIT License.
