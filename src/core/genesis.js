const EC = require("elliptic").ec, ec = new EC("secp256k1");
const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");

const Block = require("./block");
const Transaction = require("./transaction");
const { INITIAL_SUPPLY } = require("../config.json");

const MINT_PRIVATE_ADDRESS = "0700a1ad28a20e5b2a517c00242d3e25a88d84bf54dce9e1733e6096e6d6495e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

function generateGenesisBlock() {
    const firstMint = new Transaction(
        SHA256("04f91a1954d96068c26c860e5935c568c1a4ca757804e26716b27c95d152722c054e7a459bfd0b3ab22ef65a820cc93a9f316a9dd213d31fdf7a28621b43119b73"),
        INITIAL_SUPPLY,
        0,
        {},
        Date.now()
    );

    Transaction.sign(firstMint, MINT_KEY_PAIR);

    return new Block(1, Date.now(), [firstMint], 1, "");
}

module.exports = generateGenesisBlock;
