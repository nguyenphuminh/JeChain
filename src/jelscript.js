function jelscript(input, storage, balance, userArgs, address, blockInfo) {
	const instructions = input.trim().replace(/\t/g, "").split("\n").filter(ins => ins !== "");

	const memory = {};

	userArgs = userArgs.map(arg => arg.toString());

	let ptr = 0;

	while (ptr < instructions.length && balance >= 0) {
		const line = instructions[ptr].trim();
		const command = line.split(" ").filter(tok => tok !== "")[0];
		const args = line.slice(command.length + 1).replace(/\s/g, "").split(",").filter(tok => tok !== "");

		switch (command) {
			case "set":
				memory[args[0]] = getValue(args[1], memory, userArgs);
				break;
			case "balance":
				memory[args[0]] = balance.toString();
				break;
			case "address":
				memory[args[0]] = address;
				break;
			case "timestamp":
				memory[args[0]] = blockInfo.timestamp;
				break;
			case "difficulty":
				memory[args[0]] = blockInfo.difficulty;
				break;
			case "store":
				storage[getValue(args[0], memory, userArgs)] = getValue(args[1], memory, userArgs);
				break;
			case "pull":
				memory[args[0]] = storage[getValue(args[1], memory, userArgs)] ? storage[getValue(args[1], memory, userArgs)] : "0";
				break;
			case "jump":
				if (getValue(args[0], memory, userArgs) === "1") {
					ptr = instructions.indexOf(instructions.find(line => line.startsWith("label " + getValue(args[1], memory, userArgs))));
				}
				break;
			case "add":
				memory[args[0]] = (parseInt(memory[args[0]]) + parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "sub":
				memory[args[0]] = (parseInt(memory[args[0]]) - parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "mul":
				memory[args[0]] = (parseInt(memory[args[0]]) * parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "div":
				memory[args[0]] = (parseInt(memory[args[0]]) / parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "mod":
				memory[args[0]] = (parseInt(memory[args[0]]) % parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "and":
				memory[args[0]] = (parseInt(memory[args[0]]) & parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "or":
				memory[args[0]] = (parseInt(memory[args[0]]) | parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "xor":
				memory[args[0]] = (parseInt(memory[args[0]]) ^ parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "not":
				memory[args[0]] = (~parseInt(memory[args[0]])).toString();
				break;
			case "gtr":
				memory[args[0]] = parseInt(memory[args[0]]) > parseInt(getValue(args[1], memory, userArgs)) ? "1" : "0";
				break;
			case "lss":
				memory[args[0]] = parseInt(memory[args[0]]) < parseInt(getValue(args[1], memory, userArgs)) ? "1" : "0";
				break;
			case "geq":
				memory[args[0]] = parseInt(memory[args[0]]) >= parseInt(getValue(args[1], memory, userArgs)) ? "1" : "0";
				break;
			case "leq":
				memory[args[0]] = parseInt(memory[args[0]]) <= parseInt(getValue(args[1], memory, userArgs)) ? "1" : "0";
				break;
			case "equ":
				memory[args[0]] = parseInt(memory[args[0]]) === parseInt(getValue(args[1], memory, userArgs)) ? "1" : "0";
				break;
			case "neq":
				memory[args[0]] = parseInt(memory[args[0]]) !== parseInt(getValue(args[1], memory, userArgs)) ? "1" : "0";
				break;
			case "ls":
				memory[args[0]] = (parseInt(memory[args[0]]) << parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "rs":
				memory[args[0]] = (parseInt(memory[args[0]]) >> parseInt(getValue(args[1], memory, userArgs))).toString();
				break;
			case "log":
				console.log(getValue(args[0], memory, userArgs));
		}

		ptr++;
		balance--;
	}

	return [storage, balance];
}

function getValue(token, memory, userArgs) {
	if (token.startsWith("$")) {
		token = token.replace("$", "");

		if (typeof memory[token] === "undefined") {
			memory[token] = "0";
		}

		return memory[token];
	} else if (token.startsWith("%")) {
		token = token.replace("%", "");

		return typeof userArgs[parseInt(token)] === "undefined" ? "0" : userArgs[parseInt(token)];
	} else {
		return token;
	}
}

module.exports = jelscript;
