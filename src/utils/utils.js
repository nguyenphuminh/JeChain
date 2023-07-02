"use strict";

function log16(x) {
    return Math.log(x) / Math.log(16);
}

function isNumber(str) {
    return str.split("").every(char => "0123456789".includes(char));
}

function isHex(str) {
    return (
        str.startsWith("0x") &&
        str.slice(2).split("").every(char => "0123456789abcdef".includes(char))
    )
}

function bigIntable(str) {
    try {
        BigInt(str);

        return true;
    } catch (e) {
        return false;
    }
}

function parseJSON(value) {
    let parsed;
    
    try {
        parsed = JSON.parse(value);
    } catch (e) {
        return {};
    }

    return parsed;
}

function indexTxns(transactions) {
    return transactions.map((txn, index) => index.toString() + JSON.stringify(txn));
}

module.exports = { log16, isNumber, isHex, parseJSON, bigIntable, indexTxns };
