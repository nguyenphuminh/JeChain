const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");

function Node(val, left = null, right = null) {
    return { val, left, right };
}

function getMerklePath(node, target, path = []) {
    if (node.val === target) return [...path, target];
    if (node.left === null) return [];

    const path1 = getMerklePath(node.left, target, [...path, node.right.val]);
    const path2 = getMerklePath(node.right, target, [...path, node.left.val]);

    if (path1.length !== 0) return path1;
    if (path2.length !== 0) return path2;

    return [];
}

function verifyMerkleProof(leaves, root) {
    let genHash = leaves[0];

    for (let i = 1; i < leaves.length; i++) {
        if (BigInt("0x" + genHash) < BigInt("0x" + leaves[i])) {
            genHash = SHA256(genHash + leaves[i]);
        } else {
            genHash = SHA256(leaves[i] + genHash);
        }
    }

    return genHash === root;
}

function buildMerkleTree(items) {
    if (items.length === 0) return Node(SHA256("0"));

    let hashList = items.map(transaction => Node(SHA256(JSON.stringify(transaction))));
    
    if (hashList.length % 2 !== 0 && hashList.length !== 1) {
        hashList.push(hashList[hashList.length-1]);
    }

    while (hashList.length !== 1) {
        const newRow = [];

        while (hashList.length !== 0) {
            if (hashList.length % 2 !== 0 && hashList.length !== 1) {
                hashList.push(hashList[hashList.length-1]);
            }
    
            const left = hashList.shift();
            const right = hashList.shift();

            if (BigInt("0x" + left.val) < BigInt("0x" + right.val)) {
                const node = Node(SHA256(left.val + right.val), left, right);

                newRow.push(node);
            } else {
                const node = Node(SHA256(right.val + left.val), right, left);

                newRow.push(node);
            }
        }

        hashList = newRow;
    }
    
    return hashList[0];
}

module.exports = { getMerklePath, verifyMerkleProof, buildMerkleTree };
