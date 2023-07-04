const { Level } = require('level');

const { bigIntable, isHex } = require("../utils/utils");
const Transaction = require("./transaction");

const { EMPTY_HASH } = require("../config.json");

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");

async function jelscript(input, originalState = {}, gas, stateDB, block, txInfo, contractInfo, enableLogging = false) {
	const storageDB = new Level(__dirname + "/../log/accountStore/" + contractInfo.address);

	const instructions = input.trim().replace(/\t/g, "").split("\n").map(ins => ins.trim()).filter(ins => ins !== "");

	const memory = {}, state = { ...originalState }, storage = {};

	const userArgs = typeof txInfo.additionalData.txCallArgs !== "undefined" ? txInfo.additionalData.txCallArgs.map(arg => "0x" + BigInt(arg).toString(16)) : [];

	let ptr = 0;

	while (
		ptr < instructions.length &&
		instructions[ptr].trim() !== "stop" &&
		instructions[ptr].trim() !== "revert"
	) {
		if (gas < 10000000n) {
			// Revert state changes because not enough gas to continue
			return originalState;
		}

		const line = instructions[ptr].trim();
		const command = line.split(" ").filter(tok => tok !== "")[0];
		const args = line.slice(command.length + 1).replace(/\s/g, "").split(",").filter(tok => tok !== "");

		while (args.length !== 2) {
			args.push("0x0");
		}

		const a = BigInt(getValue("$" + getValue(args[0])));
		const b = BigInt(getValue(args[1]));

		const c = getValue(args[0]);

		switch (command) {

			// Memory stuff

			case "set": // Used to set values for variables
				setMem(c, getValue(args[1]));

				break;

			case "add": // Add value to variable
				setMem(c, "0x" + (a + b).toString(16));

				break;

			case "sub": // Subtract value from variable
				setMem(c, "0x" + (a - b > 0 ? a - b : 0).toString(16));

				break;

			case "mul": // Multiply variable by value
				setMem(c, "0x" + (a * b).toString(16));

				break;

			case "div": // Divide variable by value
				if (b === 0n) {
					setMem(c, "0x0");
				} else {
					setMem(c, "0x" + (a / b).toString(16));
				}

				break;

			case "mod": // Modulo
				setMem(c, "0x" + (a % b).toString(16));

				break;

			case "and": // AND gate
				setMem(c, "0x" + (a & b).toString(16));

				break;

			case "or": // OR gate
				setMem(c, "0x" + (a | b).toString(16));

				break;

			case "xor": // XOR gate
				setMem(c, "0x" + (a ^ b).toString(16));

				break;

			case "ls": // Left shift
				setMem(c, "0x" + (a << b).toString(16));

				break;

			case "rs": // Right shift
				setMem(c, "0x" + (a >> b).toString(16));

				break;

			case "gtr": // Greater than
				setMem(c, "0x" + a > b ? "0x1" : "0x0");

				break;

			case "lss": // Less than
				setMem(c, "0x" + a < b ? "0x1" : "0x0");

				break;

			case "geq": // Greater or equal to
				setMem(c, "0x" + a >= b ? "0x1" : "0x0");

				break;

			case "leq": // Less or equal to
				setMem(c, "0x" + a <= b ? "0x1" : "0x0");

				break;

			case "equ": // Equal to
				setMem(c, "0x" + a === b ? "0x1" : "0x0");

				break;

			case "neq": // Not equal to
				setMem(c, "0x" + a !== b ? "0x1" : "0x0");

				break;


			// Flow control

			case "jump": // Command to jump to labels conditionally
				if (BigInt(getValue(c)) === 1n) {
					const newPtr = instructions.indexOf(instructions.find(line => line.startsWith("label " + getValue(args[1]))));

					if (newPtr !== -1) { ptr = newPtr; }
				}

				break;


			// Storage stuff

			case "store": // storage[key] = value
				await setStorage(getValue(c), getValue(args[1]));

				break;

			case "pull": // memory[key1] = storage[key2]
				setMem(c, await getStorage(getValue(args[1])));

				break;


			// Block info

			case "timestamp": // Block's timestamp
				setMem(c, "0x" + block.timestamp.toString(16));

				break;

			case "blocknumber": // Block's number
				console.log(block);
				setMem(c, "0x" + block.blockNumber.toString(16));

				break;

			case "blockhash": // Block's hash
				setMem(c, "0x" + block.parentHash);

				break;

			case "difficulty": // Block's difficulty
				setMem(c, "0x" + block.difficulty.toString(16));

				break;

			// Transaction info

			case "txvalue": // Amount of tokens sent in transaction
				setMem(c, "0x" + txInfo.amount.toString(16));

				break;

			case "txsender": // Sender of transaction
				const txSenderPubkey = Transaction.getPubKey(txInfo);
				const txSenderAddress = SHA256(txSenderPubkey);

				setMem(c, "0x" + txSenderAddress);

				break;

			case "txgas": // Transaction gas
				setMem(c, "0x" + txInfo.gas.toString(16));

				break;

			case "txexecgas": // Contract execution gas
				setMem(c, "0x" + txInfo.additionalData.contractGas.toString(16));

				break;


			// Contract info

			case "address": // Contract's address
				setMem(c, "0x" + contractInfo.address);
				break;

			case "selfbalance": // Contract's balance
				if (!state[contractInfo.address]) {
					const contractState = await stateDB.get(contractInfo.address);
					state[contractInfo.address] = contractState;
				}

				setMem(c, "0x" + BigInt(state[contractInfo.address].balance).toString(16));

				break;

			// Interactions with others

			case "balance": // Get balance from address
				const address = getValue(args[1]).slice(2); // Get address

				const existedAddresses = await stateDB.keys().all();

				if (!existedAddresses.includes(address) && !state[address]) {
					setMem(c, "0x0");
				}

				if (existedAddresses.includes(address) && !state[address]) {
					setMem(c, "0x" + BigInt((await stateDB.get(address)).balance).toString(16));
				}

				if (!existedAddresses.includes(address) && state[address]) {
					setMem(c, "0x" + BigInt(state[address].balance).toString(16));
				}

				break;

			case "send": // Send tokens to address
				const target = getValue(c).slice(2);
				const amount = BigInt(getValue(args[1]));

				if (!state[contractInfo.address]) {
					const contractState = await stateDB.get(contractInfo.address);
					state[contractInfo.address] = contractState;
				}

				const balance = state[contractInfo.address].balance;

				if (BigInt(balance) >= amount) {
					if (!(await stateDB.keys().all()).includes(target) && !state[target]) {
						state[target] = {
							balance: amount.toString(),
							codeHash: EMPTY_HASH,
							nonce: 0,
							storageRoot: EMPTY_HASH
						}
					} else {
						if (!state[target]) {
							state[target] = await stateDB.get(target);
						}

						state[target].balance = BigInt(state[target].balance) + amount;
					}

					state[contractInfo.address].balance = BigInt(state[contractInfo.address].balance) - amount;
				}

				break;

			/* TODO
			case "call": // Used to call other contracts
				break;
			*/


			// Others

			case "sha256": // Generate sha256 hash of value and assign to variable
				setMem(c, "0x" + SHA256( Buffer.from(getValue(args[1]).slice(2), "hex") ));

				break;

			case "log": // Log out data
				if (enableLogging) console.log("LOG ::", contractInfo.address + ":", c);

				break;

			case "gas": // Show current available gas
				setMem(c, "0x" + gas.toString(16));

				break;
		}

		ptr++;
		gas -= 10000000n;
	}

	if (ptr < instructions.length && instructions[ptr].trim() === "revert") return originalState; // Revert all changes made to state

	function getValue(token) {
		if (token.startsWith("$")) {
			token = token.slice(1);

			if (typeof memory[token] === "undefined") {
				memory[token] = "0x0";
			}

			return memory[token];
		} else if (token.startsWith("%")) {
			token = token.slice(1);

			if (typeof userArgs[parseInt(token)] === "undefined") {
				return "0x0";
			} else {
				return bigIntable(userArgs[parseInt(token)]) ? "0x" + BigInt(userArgs[parseInt(token)]).toString(16) : "0x0";
			}
		} else if (isHex(token)) {
			return token;
		} else {
			return "0x0";
		}
	}

	function setMem(key, value) {
		memory[key] = value;
	}

	async function setStorage(key, value) {
		if (!state[contractInfo.address]) {
			const contractState = await stateDB.get(contractInfo.address);
			state[contractInfo.address] = contractState;
		}

		for (const key of (await storageDB.keys().all())) {
			storage[key] = await storageDB.get(key);
		}

		storage[key] = value;
	}

	async function getStorage(key) {
		if (!state[contractInfo.address]) {
			const contractState = await stateDB.get(contractInfo.address);
			state[contractInfo.address] = contractState;
		}

		for (const key of (await storageDB.keys().all())) {
			storage[key] = await storageDB.get(key);
		}

		return storage[key] ? storage[key] : "0x0";
	}

	await storageDB.close();

	return [state, storage];
}

module.exports = jelscript;
