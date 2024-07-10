"use strict";

const Block = require("./block");
const { FIRST_ACCOUNT } = require("../config.json");

function generateGenesisBlock() {
    return new Block(1, Date.now(), [], 1, "", FIRST_ACCOUNT);
}

module.exports = generateGenesisBlock;
