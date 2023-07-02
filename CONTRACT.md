## What are smart contracts?

Smart contracts are basically pieces of code that are attached to an address. They get called every time someone create a transaction pointing to their contract address. Remember that smart contracts can only be deployed once with each address, bringing immutability.

## Using Jelscript to create smart contracts

Jelscript is basically a small low-level language used to create smart contracts on JeChain.

### Gas

For every instructions, you will lose 10000000 Jem, preventing infinite loops.

### Data

There is no "real" data type in JeChain, values are represented as dynamic hex strings.

### Memory access

"Memory" means that data is only stored in one contract execution, in RAM, or more specifically just in a map.

Set a value for a memory slot at a position provided:
```
set mem_key, value
```

You can reference a value from a memory slot
```
set 0x1, 0x100
set 0x2, $0x1
```

The example above set `0x100` to memory position `0x1`, then assigned the value of that position (which is `0x100`) to memory slot position `0x2`.

### Math instructions

* Addition: `add mem_key, value`
* Subtraction: `sub mem_key, value`
* Multiplication: `mul mem_key, value`
* Division: `div mem_key, value`
* Modulo: `mod mem_key, value`
* And: `and mem_key, value`
* Or: `or mem_key, value`
* Xor: `xor mem_key, value`
* Left shift: `ls mem_key, value`
* Right shift: `rs mem_key, value`


### Flow control

For conditions, you can use these instructions:

* Greater than - `gtr mem_key, value`.
* Less than - `lss mem_key, value`.
* Greater or equal to - `geq mem_key, value`.
* Less or equal to - `leq mem_key, value`.
* Equal to - `equ mem_key, value`.
* Not equal to - `neq mem_key, value`.

Note that all of these will store `0x1` to the memory slot if the condition is true, `0x0` otherwise.

For loops, you can use labels and the `jump` instruction:

Labels:
```
label label_name
	...
	...
	...
```

Jump:
```
	jump value, label_name
```

If `value` is evaluated to be `0x1`, it will jump to `label_name`.

### Storage

Before we dig in, we need to know that a contract's storage is a key-value database. The difference with memory is that data will be kept on your computer and can be reused in the future.

* Store into storage: `store storage_key, value`.
* Pull from storage and store it into a memory slot: `pull mem_key, storage_key`.

### Arguments

External arguments that users pass into the contract call can be represented as `%0`, `%1`, `%2`,..., `%n`.

### Block data

* Store block's timestamp into a memory slot: `timestamp mem_key`.
* Store block's number into a memory slot: `blocknumber mem_key`.
* Store block's hash into a memory slot: `blockhash mem_key`.
* Store block's difficulty into a memory slot: `difficulty mem_key`.

### Transaction data

* Store transaction's amount into a memory slot: `txvalue mem_key`.
* Store transaction's sender address into a memory slot: `txsender mem_key`.
* Store transaction's gas into a memory slot: `txgas mem_key`.
* Store transaction's contract execution gas into a memory slot: `txexecgas mem_key`.

### Contract data

* Store contract's address into a memory slot: `address mem_key`.
* Store contract's balance into a memory slot: `selfbalance mem_key`.

### Chain interactions

* Store address's balance into a memory slot: `balance mem_key, address`.
* Send Jem to an address: `send address, amount`.

### Others

* Print out a value: `log value`.
* Generate SHA256 hash of a value and store into a memory slot: `sha256 mem_key, value`.
* Store remaining gas into a memory slot: `gas mem_key`.
* Stop execution: `stop` (will not cost gas).
* Stop execution and revert all changes: `revert` (will not cost gas).

## Deploying a contract

A contract is attached to a transaction when deployed, so to deploy a contract, simply create a transaction, paste the contract's code into `<tx>.additionalData.scBody`, and then broadcast the transaction away.

```js
const myContract = `
...
...
...
`;

const transaction = new Transaction("contract address", amount, gas, {
	scBody: myContract;
});

Transaction.sign(transaction, keyPair);

sendTransaction(transaction);
```

## Triggering a contract

Just simply send a transaction to the contract address, also adding the contract execution gas in `Transaction.additionalData.contractGas`:
```js
const transaction = new Transaction("some contract address", amount, gas, {
	contractGas: someAmount
});

Transaction.sign(transaction, keyPair);

sendTransaction(transaction);
```

You can call the contract with arguments by passing in an additional array to `Transaction.additionalData.args`:
```js
const transaction = new Transaction("some contract address", amount, gas, {
	contractGas: someAmount,
	args: [args, go, into, here]
});
```

Note that all args should be numbers and they will be converted to hex strings in execution.

## Example

### Fibonacci

This ís a sample contract with the functionality of calculating the fibonacci number and store it into storage until its balance wears off.
```
set 0x1, 0x0
set 0x2, 0x1

store 0x3, 0x1

label 0x10
    set 0x4, 0x0
    add 0x4, $0x1
    add 0x4, $0x2
    
    set 0x1, $0x2
    set 0x2, $0x4

    store 0x3, $0x4

    jump 0x1, 0x10
```

### Simple token

This is an example of a simple token. It will release `297297297` tokens, and people can send tokens to each others.
```
pull 0x1, insert_contract_address_here
equ 0x1, 0
jump $0x1, 0x10
jump 0x1, 0x20

label 0x10
    store insert_some_address_here, 297297297

label 0x20
    address 0x2
    pull 0x3, $0x2
    lss 0x3, %0
    jump $0x3, 0x30

    pull 0x4, %1
    pull 0x3, $0x2
    add 0x4, %0
    sub 0x3, %0

    store $0x2, $0x3
    store %1, $0x4

label 0x30
```
Note that this is built just to be an example, a good token would follow some standards like ERC-20.
