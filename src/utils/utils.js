"use strict";

function log16(x) {
    return Math.log(x) / Math.log(16);
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

function numToBuffer(value) {
    const hexValue = value.toString(16);
    const hexLength = hexValue.length + (hexValue.length % 2 !== 0 ? 1 : 0);

    return Buffer.from(hexValue.padStart(hexLength, "0"), "hex");
}

function serializeState(stateHeader) {
    let hexState = "";

    hexState += BigInt(stateHeader.balance).toString(16).padStart(22, "0");
    hexState += stateHeader.codeHash;
    hexState += BigInt(stateHeader.nonce).toString(16).padStart(8, "0");
    hexState += stateHeader.storageRoot;

    return new Array(...Buffer.from(hexState, "hex"));
}

function deserializeState(stateInBytes) {
    const stateHeader = {};
    let hexState = Buffer.from(stateInBytes).toString("hex");
    
    stateHeader.balance = BigInt("0x" + hexState.slice(0, 22)).toString();
    hexState = hexState.slice(22);

    stateHeader.codeHash = hexState.slice(0, 64);
    hexState = hexState.slice(64);

    stateHeader.nonce = parseInt("0x" + hexState.slice(0, 8));
    hexState = hexState.slice(8);

    stateHeader.storageRoot = hexState.slice(0, 64);
    hexState = hexState.slice(64);

    return stateHeader;
}

module.exports = { log16, isHex, parseJSON, bigIntable, numToBuffer, serializeState, deserializeState };
