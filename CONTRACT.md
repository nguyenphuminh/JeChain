## What are smart contracts?
Smart contracts are basically pieces of code that attaches to an address. It get called every time someone create a transaction pointing to its address. Remember that smart contracts can be deployed only once with each address.

## Using Jelscript to create smart contracts
Jelscript is basically a small low-level language used to create smart contracts on JeChain.

### Data types
There are not any "real" data type in JeChain. You can use numbers and words (string with no whitespace) and there is no proper string because you don't really need strings.

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

Store into storage: `store key, value`.
Pull from storage and store it into a variable: `pull var_name, key`.

### Utils
Print out a value: `log value`.

## Deploying a contract
A contract is attached to a transaction when deployed, so to deploy a contract, simply create a transaction, paste the contract's code into the `to` property, put `SC` at the beginning of the code to show that this is a smart contract's code and send the transaction away.

```js
const myContract = `
...
...
...
`;

const transaction = new Transaction(publicKey, "SC" + myContract, amount, gas);

transaction.sign(keyPair);

sendTransaction(transaction);
```

## Triggering a contract
Just simply send a transaction to the contract address:
```js
const transaction = new Transaction(publicKey, "some contract address", amount, gas);

transaction.sign(keyPair);

sendTransaction(transaction);
```
