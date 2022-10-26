const { bigIntable } = require("../utils/utils");
const Transaction = require("./transaction");

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");

async function jelscript(input, originalState = {}, gas, stateDB, block, txInfo, contractInfo, enableLogging = false) {
	const instructions = input.trim().replace(/\t/g, "").split("\n").map(ins => ins.trim()).filter(ins => ins !== "");

	const memory = {}, state = originalState;

	const userArgs = typeof txInfo.additionalData.txCallArgs !== "undefined" ? txInfo.additionalData.txCallArgs.map(arg => "0x" + arg.toString(16)) : [];

	let ptr = 0;

	while (
		ptr < instructions.length &&
		gas >= BigInt("10000000") &&
		instructions[ptr].trim() !== "stop" &&
		instructions[ptr].trim() !== "revert"
	) {
		const line = instructions[ptr].trim();
		const command = line.split(" ").filter(tok => tok !== "")[0];
		const args = line.slice(command.length + 1).replace(/\s/g, "").split(",").filter(tok => tok !== "");

		switch (command) {

			// Memory stuff
			
			case "set": // Used to set values for variables
				setMem(args[0], getValue(args[1]));
				
				break;

			case "add": // Add value to variable
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) + BigInt(getValue(args[1])) ).toString(16));

				break;

			case "sub": // Subtract value from variable
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) - BigInt(getValue(args[1])) ).toString(16));

				break;

			case "mul": // Multiply variable by value
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) * BigInt(getValue(args[1])) ).toString(16));

				break;

			case "div": // Divide variable by value
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) / BigInt(getValue(args[1])) ).toString(16));

				break;

			case "mod": // Modulo
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) % BigInt(getValue(args[1])) ).toString(16));

				break;

			case "and":
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) & BigInt(getValue(args[1])) ).toString(16));

				break;

			case "or":
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) | BigInt(getValue(args[1])) ).toString(16));

				break;

			case "xor":
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) ^ BigInt(getValue(args[1])) ).toString(16));

				break;
			
			case "ls": // Left shift
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) << BigInt(getValue(args[1])) ).toString(16));

				break;
			
			case "rs": // Right shift
				setMem(args[0], "0x" + ( BigInt(getValue("$" + args[0])) >> BigInt(getValue(args[1])) ).toString(16));

				break;

			case "not":
				setMem(args[0], "0x" + ( ~BigInt(getValue("$" + args[0])) ).toString(16));

				break;

			case "gtr": // Greater than
				setMem(args[0], "0x" + BigInt(getValue("$" + args[0])) > BigInt(getValue(args[1])) ? "0x1" : "0x0");

				break;
	
			case "lss": // Less than
				setMem(args[0], "0x" + BigInt(getValue("$" + args[0])) < BigInt(getValue(args[1])) ? "0x1" : "0x0");

				break;
	
			case "geq": // Greater or equal to
				setMem(args[0], "0x" + BigInt(getValue("$" + args[0])) >= BigInt(getValue(args[1])) ? "0x1" : "0x0");

				break;
	
			case "leq": // Less or equal to
				setMem(args[0], "0x" + BigInt(getValue("$" + args[0])) <= BigInt(getValue(args[1])) ? "0x1" : "0x0");

				break;
	
			case "equ": // Equal to
				setMem(args[0], "0x" + BigInt(getValue("$" + args[0])) === BigInt(getValue(args[1])) ? "0x1" : "0x0");

				break;
	
			case "neq": // Not equal to
				setMem(args[0], "0x" + BigInt(getValue("$" + args[0])) !== BigInt(getValue(args[1])) ? "0x1" : "0x0");

				break;

			
			// Flow control

			case "jump": // Command to jump to labels conditionally
				if (BigInt(getValue(args[0])) === 1n) {
					ptr = instructions.indexOf(instructions.find(line => line.startsWith("label " + getValue(args[1]))));
				}

				break;

			
			// Storage stuff

			case "store": // storage[key] = value
				await setStorage(getValue(args[0]), getValue(args[1]));

				break;

			case "pull": // memory[key1] = storage[key2]
				setMem(args[0], await getStorage(getValue(args[1])));

				break;


			// Block info

			case "timestamp": // Block's timestamp
				setMem(args[0], "0x" + block.timestamp.toString(16));

				break;
			
			case "blocknumber": // Block's number
				setMem(args[0], "0x" + block.blockNumber.toString(16));

				break;
			
			case "blockhash": // Block's hash
				setMem(args[0], "0x" + block.hash);

				break;
			
			case "difficulty": // Block's difficulty
				setMem(args[0], "0x" + block.difficulty.toString(16));

				break;

			// Transaction info

			case "txvalue": // Amount of tokens sent in transaction
				setMem(args[0], "0x" + txInfo.amount.toString(16));

				break;
			
			case "txsender": // Sender of transaction
				const txSenderPubkey = Transaction.getPubKey(txInfo);
				const txSenderAddress = SHA256(txSenderPubkey);

				setMem(args[0], txSenderAddress);

				break;
			
			case "txgas": // Transaction gas
				setMem(args[0], "0x" + txInfo.gas.toString(16));

				break;
			
			case "txexecgas": // Contract execution gas
				setMem(args[0], "0x" + txInfo.additionalData.contractGas.toString(16));

				break;
			

			// Contract info

			case "address": // Contract's address
				setMem(args[0], contractInfo.address);
				break;

			case "selfbalance": // Contract's balance
				if (!state[contractInfo.address]) {
					const contractState = await stateDB.get(contractInfo.address);
					state[contractInfo.address] = contractState;
				}

				setMem(args[0], state[contractInfo.address].balance);

				break;

			// Interactions with others
			
			case "balance": // Get balance from address
				const address = getValue(args[1]); // Get address

				const existedAddresses = await stateDB.keys().all();

				if (!existedAddresses.includes(address) && !state[address]) {
					setMem(getValue(args[0]), "0x0");
				}

				if (existedAddresses.includes(address) && !state[address]) {
					setMem(args[0], "0x" + (await stateDB.get(address)).balance.toString(16));
				}

				if (!existedAddresses.includes(address) && state[address]) {
					setMem(args[0], "0x" + state[address].balance.toString(16));
				}

				break;

			case "send": // Send tokens to address
				const target = getValue(args[0]);
				const amount = BigInt(getValue(args[1]));

				if (!state[contractInfo.address]) {
					const contractState = await stateDB.get(contractInfo.address);
					state[contractInfo.address] = contractState;
				}

				const balance = state[contractInfo.address].balance;

				if (BigInt(balance) >= amount) {
					if (!await stateDB.keys().all().includes(target) && !state[target]) {
						state[target] = {
							balance: amount.toString(),
							body: "",
							nonce: 0,
							storage: {}
						}
					} else {
						if (!state[target]) {
							state[target] = await stateDB.get(target);
						}

						state[target].balance = BigInt(targetState.balance) + amount;
					}

					state[contractInfo.address].balance = BigInt(state.balance) - amount;
				}			

				break;

			/* TODO
			case "call": // Used to call other contracts

				break;
			*/


			// Others

			case "sha256": // Generate sha256 hash of value and assign to variable
				setMem(args[0], "0x" + SHA256(getValue(args[1])));

				break;

			case "log": // Log out data
				if (enableLogging) console.log("LOG ::", contractInfo.address + ":", getValue(args[0]));
			
				break;

			case "gas": // Show current available gas
				setMem(args[0], "0x" + gas.toString(16));

				break;
		}

		ptr++;
		gas-=10000000n;
	}

	if (ptr < instructions.length && instructions[ptr].trim() === "revert") return originalState; // Revert all changes made to state

	function getValue(token) {
		if (token.startsWith("$")) {
			token = token.replace("$", "");

			if (typeof memory[token] === "undefined") {
				memory[token] = "0x0";
			}

			return memory[token];
		} else if (token.startsWith("%")) {
			token = token.replace("%", "");

			if (typeof userArgs[parseInt(token)] === "undefined") {
				return "0x0";
			} else {
				return bigIntable(userArgs[parseInt(token)]) ? "0x" + BigInt(userArgs[parseInt(token)]).toString(16) : "0x0"; 
			}
		} else {
			return token;
		}
	}

	function setMem(key, value) {
		memory[key] = bigIntable(value) ? "0x" + BigInt(value).toString(16) : "0x0";
	}

	async function setStorage(key, value) {
		if (!state[contractInfo.address]) {
			const contractState = await stateDB.get(contractInfo.address);
			state[contractInfo.address] = contractState;
		}

		state[contractInfo.address].storage[key] = bigIntable(value) ? "0x" + BigInt(value).toString(16) : "0x0";
	}

	async function getStorage(key) {
		if (!state[contractInfo.address]) {
			const contractState = await stateDB.get(contractInfo.address);
			state[contractInfo.address] = contractState;
		}

		return state[contractInfo.address].storage[key] ? state[contractInfo.address].storage[key] : "0x0";
	}

	return state;
}

module.exports = jelscript;
