const jelscript = require("./jelscript");

function changeState(newBlock, state, chain, log) {
    newBlock.data.forEach(tx => {
        // If the address doesn't already exist in the chain state, we will create a new empty one.

        if (!state[tx.to]) {
            state[tx.to] = {
                balance: 0,
                body: "",
                timestamps: [],
                storage: {}
            };
        }

        if (!state[tx.from]) {
            state[tx.from] = {
                balance: 0,
                body: "",
                timestamps: [],
                storage: {}
            };

            if (tx.to.startsWith("SC")) {
                state[tx.from].body = tx.to;
            }
        // If one's state already exists, but with no contract deployed, we can deploy a contract, but we can't 
        // re-deploy it later, maintaining immutability. 
        } else if (tx.to.startsWith("SC") && !state[tx.to].body) {
            state[tx.from].body = tx.to;
        }

        // Transist state
        state[tx.to].balance += tx.amount;
        state[tx.from].balance -= tx.amount + tx.gas;

        // Add used timestamps
        state[tx.from].timestamps.push(tx.timestamp);
    });
}

function triggerContract(newBlock, state, chain, log) {
    // Loops though every transactions in a block, if the recipient is a contract address (the body is not empty) and 
    // the gas fee is suitable, the contract will be executed.
    newBlock.data.forEach(tx => {
        if (state[tx.to].body) {
            try {
                [state[tx.to].storage, state[tx.to].balance] = jelscript(
                    state[tx.to].body.replace("SC", ""),
                    state[tx.to].storage, 
                    state[tx.to].balance - tx.amount,
                    tx.args,
                    tx.from,
                    { difficulty: chain.difficulty, timestamp: chain.getLastBlock().timestamp },
                    tx.to,
                    tx.amount,
                    !log
                );
            } catch (error) {
                console.log("LOG :: Error at contract", tx.to, error);
            }
        }
    })
}

module.exports = { changeState, triggerContract };
