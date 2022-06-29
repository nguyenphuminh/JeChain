## What are smart contracts?

Smart contracts are basically pieces of code that are attached to an address. They get called every time someone create a transaction pointing to their contract address. Remember that smart contracts can only be deployed once with each address, bringing immutability.

## Using Jelscript to create smart contracts

Jelscript is basically a small low-level language used to create smart contracts on JeChain.

### Gas

For every instructions, you will lose 1 Jem, preventing infinite loops.

### Data types

There is no "real" data type in JeChain. You can use numbers and words (string with no whitespace) and there is no proper string because you don't really need strings.

### Variable declaration

Declaring/setting a variable:
```
set var_name, value
```

You can use variables by simply add a `$` character before it:
```
set a, 100
set b, $a
```

The example above declared variable `a` with the value of `100`, then assigned `a` to `b`.

### Math instructions

* Addition: `add var_name, value`
* Subtraction: `sub var_name, value`
* Multiplication: `mul var_name, value`
* Division: `div var_name, value`
* Modulo: `mod var_name, value`
* And: `and var_name, value`
* Or: `or var_name, value`
* Xor: `xor var_name, value`
* Not: `not var_name`
* Left shift: `ls var_name, value`
* Right shift: `rs var_name, value`


### Flow control

For conditions, you can use these instructions:

* Greater than - `gtr var_name, value`.
* Less than - `lss var_name, value`.
* Greater or equal to - `geq var_name, value`.
* Less or equal to - `leq var_name, value`.
* Equal to - `equ var_name, value`.
* Not equal to - `neq var_name, value`.

Note that all of these will store `1` to variable if the condition is true, `0` otherwise.

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

If `value` is equal to 1, it will jump to `label_name`.

### Storage

Before we dig in, we need to know that a contract's storage is a key-value object.

* Store into storage: `store key, value`.
* Pull from storage and store it into a variable: `pull var_name, key`.

### Arguments

Arguments can be represented as `%0`, `%1`, `%2`,..., `%n`.

### Block data

* Store block's timestamp into a variable: `timestamp var_name`.
* Store block's number into a variable: `blocknumber var_name`.
* Store block's hash into a variable: `blockhash var_name`.
* Store block's difficulty into a variable: `difficulty var_name`.

### Transaction data

* Store transaction's amount into a variable: `txvalue var_name`.
* Store transaction's sender address into a variable: `txsender var_name`.
* Store transaction's gas into a variable: `txgas var_name`.
* Store transaction's contract execution gas into a variable: `txexecgas var_name`.

### Contract data

* Store contract's address into a variable: `address var_name`.
* Store contract's balance into a variable: `selfbalance var_name`.

### Chain interactions

* Store address's balance into a variable: `balance var_name, address`.
* Send Jem to an address: `send address, amount`.

### Others

* Print out a value: `log value`.
* Generate SHA256 hash of a value and store into a variable: `sha256 var_name, value`.
* Store remaining gas into a variable: `gas var_name`.
* Stop execution: `stop`. (will not cost gas)

## Deploying a contract

A contract is attached to a transaction when deployed, so to deploy a contract, simply create a transaction, paste the contract's code into `<tx>.additionalData.scBody`, and then broadcast the transaction away.

```js
const myContract = `
...
...
...
`;

const transaction = new Transaction(publicKey, "", amount, gas, {
	scBody: myContract;
});

Transaction.sign(transaction, keyPair);

sendTransaction(transaction);
```

## Triggering a contract

Just simply send a transaction to the contract address, also adding the contract execution gas in `Transaction.additionalData.contractGas`:
```js
const transaction = new Transaction(publicKey, "some contract address", amount, gas, {
	contractGas: someAmount
});

transaction.sign(keyPair);

sendTransaction(transaction);
```

You can call the contract with arguments by passing in an additional array to `Transaction.additionalData.args`:
```js
const transaction = new Transaction(publicKey, "some contract address", amount, gas, {
	contractGas: someAmount,
	args: [args, go, into, here]
});
```

Note that all args should be strings and are then stringified.

## Example

### Fibonacci

This ís a sample contract with the functionality of calculating the fibonacci number and store it into storage until its balance wears off.
```
set a, 0
set b, 1

store result, 1

label fib
    set c, 0
    add c, $a
    add c, $b
    
    set a, $b
    set b, $c

    store result, $c

    jump 1, fib
```

### Simple token

This is an example of a simple token. It will release `297297297` tokens, and people can send tokens to each others.
```
pull contract_balance, insert_contract_address_here
equ contract_balance, 0
jump $contract_balance, release_token
jump 1, transfer

label release_token
    store insert_some_address_here, 297297297

label transfer
    address sender_address
    pull sender_balance, $sender_address
    lss sender_balance, %0
    jump $sender_balance, eof

    pull receiver_balance, %1
    pull sender_balance, $sender_address
    add receiver_balance, %0
    sub sender_balance, %0

    store $sender_address, $sender_balance
    store %1, $receiver_balance

label eof
```
Note that this is built just to be an example, a good token would follow some standards like ERC-20.
