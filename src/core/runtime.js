const Transaction = require("./transaction");

const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");

async function jelscript(input, gas, stateDB, block, txInfo, contractInfo, enableLogging) {
	const instructions = input.trim().replace(/\t/g, "").split("\n").map(ins => ins.trim()).filter(ins => ins !== "");

	const memory = {};

	const userArgs = typeof txInfo.additionalData.txCallArgs !== "undefined" ? txInfo.additionalData.txCallArgs.map(arg => arg.toString()) : [];

	let ptr = 0;

	while (
		ptr < instructions.length &&
		gas >= BigInt("10000000") &&
		instructions[ptr].trim() !== "stop"
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
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) + BigInt(getValue(args[1])) ).toString()
				);

				break;

			case "sub": // Subtract value from variable
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) - BigInt(getValue(args[1])) ).toString()
				);

				break;

			case "mul": // Multiply variable by value
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) * BigInt(getValue(args[1])) ).toString()
				);

				break;

			case "div": // Divide variable by value
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) / BigInt(getValue(args[1])) ).toString()
				);

				break;

			case "mod": // Modulo
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) % BigInt(getValue(args[1])) ).toString()
				);

				break;

			case "and":
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) & BigInt(getValue(args[1])) ).toString()
				);

				break;

			case "or":
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) | BigInt(getValue(args[1])) ).toString()
				);

				break;

			case "xor":
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) ^ BigInt(getValue(args[1])) ).toString()
				);

				break;
			
			case "ls": // Left shift
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) << BigInt(getValue(args[1])) ).toString()
				);

				break;
			
			case "rs": // Right shift
				setMem(
					args[0], 
					( BigInt(getValue("$" + args[0])) >> BigInt(getValue(args[1])) ).toString()
				);

				break;

			case "not":
				setMem(
					args[0], 
					( ~BigInt(getValue("$" + args[0])) ).toString()
				);

				break;

			case "gtr": // Greater than
				setMem(
					args[0], 
					BigInt(getValue("$" + args[0])) > BigInt(getValue(args[1])) ? "1" : "0"
				);

				break;
	
			case "lss": // Less than
				setMem(
					args[0], 
					BigInt(getValue("$" + args[0])) < BigInt(getValue(args[1])) ? "1" : "0"
				);

				break;
	
			case "geq": // Greater or equal to
				setMem(
					args[0], 
					BigInt(getValue("$" + args[0])) >= BigInt(getValue(args[1])) ? "1" : "0"
				);

				break;
	
			case "leq": // Less or equal to
				setMem(
					args[0], 
					BigInt(getValue("$" + args[0])) <= BigInt(getValue(args[1])) ? "1" : "0"
				);

				break;
	
			case "equ": // Equal to
				setMem(
					args[0], 
					BigInt(getValue("$" + args[0])) === BigInt(getValue(args[1])) ? "1" : "0"
				);

				break;
	
			case "neq": // Not equal to
				setMem(
					args[0], 
					BigInt(getValue("$" + args[0])) !== BigInt(getValue(args[1])) ? "1" : "0"
				);

				break;

			
			// Flow control

			case "jump": // Command to jump to labels conditionally
				if (getValue(args[0]) === "1") {
					ptr = instructions.indexOf(
						instructions.find(
							line => line.startsWith("label " + getValue(args[1]))
						)
					);
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
				setMem(args[0], block.timestamp.toString());

				break;
			
			case "blocknumber": // Block's number
				setMem(args[0], block.blockNumber.toString());

				break;
			
			case "blockhash": // Block's hash
				setMem(args[0], block.hash);

				break;
			
			case "difficulty": // Block's difficulty
				setMem(args[0], block.difficulty.toString());

				break;

			// Transaction info

			case "txvalue": // Amount of tokens sent in transaction
				setMem(args[0], txInfo.amount.toString());

				break;
			
			case "txsender": // Sender of transaction
				const txSenderPubkey = Transaction.getPubKey(txInfo);
				const txSenderAddress = SHA256(txSenderPubkey);

				setMem(args[0], txSenderAddress);

				break;
			
			case "txgas": // Transaction gas
				setMem(args[0], txInfo.gas.toString());

				break;
			
			case "txexecgas": // Contract execution gas
				setMem(args[0], txInfo.additionalData.contractGas.toString());

				break;
			

			// Contract info

			case "address": // Contract's address
				setMem(args[0], contractInfo.address);
				break;

			case "selfbalance": // Contract's balance
				const contractState = await stateDB.get(contractInfo.address);

				setMem(args[0], contractState.balance);

				break;

			// Interactions with others
			
			case "balance": // Get balance from address
				const address = getValue(args[1]);

				if (!(await stateDB.keys().all()).includes(address)) {
					setMem(getValue(args[0]), "0");
					break;
				}

				const targetState = await stateDB.get(address);
				const targetBalance = targetState.balance;

				setMem(args[0], targetBalance.toString());

				break;

			case "send": // Send tokens to address
				const target = getValue(args[0]);
				const amount = BigInt(getValue(args[1]));
				const state = await stateDB.get(contractInfo.address);
				const balance = state.balance;

				if (BigInt(balance) >= amount) {
					const existedAddresses = await stateDB.keys().all();

					if (!existedAddresses.includes(target)) {
						await stateDB.put(target, {
							balance: amount.toString(),
							body: "",
							timestamps: [],
							storage: {}
						});
					} else {
						const targetState = await stateDB.get(target);

						targetState.balance = BigInt(targetState.balance) + amount;

						await stateDB.put(target, targetState);
					}

					state.balance = BigInt(state.balance) - amount;

					await stateDB.put(contractInfo.address, state);
				}			

				break;

			/* TODO
			case "call": // Used to call other contracts

				break;
			*/


			// Others

			case "sha256": // Generate sha256 hash of value and assign to variable
				setMem(args[0], SHA256(getValue(args[1])));

				break;

			case "log": // Log out data
				if (enableLogging) console.log("LOG ::", contractInfo.address + ":", getValue(args[0]));
			
				break;

			case "gas": // Show current available gas
				setMem(args[0], gas.toString());

				break;
		}

		ptr++;
		gas-=BigInt("10000000");
	}

	function getValue(token) {
		if (token.startsWith("$")) {
			token = token.replace("$", "");

			if (typeof memory[token] === "undefined") {
				memory[token] = "0";
			}

			return memory[token];
		} else if (token.startsWith("%")) {
			token = token.replace("%", "");

			return typeof userArgs[BigInt(token)] === "undefined" ? "0" : userArgs[BigInt(token)];
		} else {
			return token;
		}
	}

	function setMem(key, value) {
		memory[key] = value;
	}

	async function setStorage(key, value) {
		const contractState = await stateDB.get(contractInfo.address);

		contractState.storage[key] = value;		

		stateDB.put(contractInfo.address, contractState);
	}

	async function getStorage(key) {
		const contractState = await stateDB.get(contractInfo.address);

		return contractState.storage[key] ? contractState.storage[key] : "0";
	}
}

module.exports = jelscript;
