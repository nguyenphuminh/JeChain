const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");

function generateMerkleRoot(transactions) {
    const hashList = transactions.map(transaction => SHA256(JSON.stringify(transaction)));

    while (hashList.length > 1) {
        const left = hashList.shift();
        const right = hashList.shift();

        hashList.push(SHA256(left + right));
    }

    return hashList[0];
}

module.exports = generateMerkleRoot;
