function jelscript(input, storage, balance) {
	const instructions = input.replace(/\t/g, "").split("\n").filter(ins => ins !== "");

	const memory = {};

	let ptr = 0;

	while (ptr < instructions.length && balance >= 0) {
		const line = instructions[ptr];
		const command = line.split(" ").filter(tok => tok !== "")[0];
		const args = line.slice(command.length + 1).replace(/\s/g, "").split(",").filter(tok => tok !== "");

		switch (command) {
			case "set":
				memory[args[0]] = getValue(args[1], memory);
				break;
			case "store":
				storage[args[0]] = getValue(args[1], memory);
				break;
			case "pull":
				memory[args[0]] = storage[args[1]];
				break;
			case "jump":
				if (getValue(args[0], memory) === "1") {
					ptr = instructions.indexOf(instructions.find(line => line.startsWith("label " + getValue(args[1], memory))));
				}
				break;
			case "add":
				memory[args[0]] = (parseInt(memory[args[0]]) + parseInt(getValue(args[1], memory))).toString();
				break;
			case "sub":
				memory[args[0]] = (parseInt(memory[args[0]]) - parseInt(getValue(args[1], memory))).toString();
				break;
			case "mul":
				memory[args[0]] = (parseInt(memory[args[0]]) * parseInt(getValue(args[1], memory))).toString();
				break;
			case "div":
				memory[args[0]] = (parseInt(memory[args[0]]) / parseInt(getValue(args[1], memory))).toString();
				break;
			case "mod":
				memory[args[0]] = (parseInt(memory[args[0]]) % parseInt(getValue(args[1], memory))).toString();
				break;
			case "and":
				memory[args[0]] = (parseInt(memory[args[0]]) & parseInt(getValue(args[1], memory))).toString();
				break;
			case "or":
				memory[args[0]] = (parseInt(memory[args[0]]) | parseInt(getValue(args[1], memory))).toString();
				break;
			case "xor":
				memory[args[0]] = (parseInt(memory[args[0]]) ^ parseInt(getValue(args[1], memory))).toString();
				break;
			case "not":
				memory[args[0]] = (~parseInt(memory[args[0]])).toString();
				break;
			case "gtr":
				memory[args[0]] = parseInt(memory[args[0]]) > parseInt(getValue(args[1], memory)) ? "1" : "0";
				break;
			case "lss":
				memory[args[0]] = parseInt(memory[args[0]]) < parseInt(getValue(args[1], memory)) ? "1" : "0";
				break;
			case "geq":
				memory[args[0]] = parseInt(memory[args[0]]) >= parseInt(getValue(args[1], memory)) ? "1" : "0";
				break;
			case "leq":
				memory[args[0]] = parseInt(memory[args[0]]) <= parseInt(getValue(args[1], memory)) ? "1" : "0";
				break;
			case "equ":
				memory[args[0]] = parseInt(memory[args[0]]) === parseInt(getValue(args[1], memory)) ? "1" : "0";
				break;
			case "neq":
				memory[args[0]] = parseInt(memory[args[0]]) !== parseInt(getValue(args[1], memory)) ? "1" : "0";
				break;
			case "ls":
				memory[args[0]] = (parseInt(memory[args[0]]) << parseInt(getValue(args[1], memory))).toString();
			case "rs":
				memory[args[0]] = (parseInt(memory[args[0]]) >> parseInt(getValue(args[1], memory))).toString();
			case "log":
				console.log(getValue(args[0], memory));
		}

		ptr++;
		balance--;
	}

	return [storage, balance];
}

function getValue(token, memory) {
	if (token.startsWith("$")) {
		token = token.replace("$", "");

		if (typeof memory[token] === "undefined") {
			memory[token] = "0";
		}

		return memory[token];
	} else {
		return token;
	}
}

module.exports = jelscript;
