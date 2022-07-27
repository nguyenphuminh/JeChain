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
        "52472d59e3c01bc2cf9496c959d924ce5f469d4e097c395f5605f70633e44a28",
        INITIAL_SUPPLY,
        0,
        {},
        Date.now()
    );

    Transaction.sign(firstMint, MINT_KEY_PAIR);

    return new Block(1, Date.now(), [firstMint], 1, "");
}

module.exports = generateGenesisBlock;
