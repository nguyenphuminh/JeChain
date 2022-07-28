"use strict";

function log16(x) {
    return Math.log(x) / Math.log(16);
}

function isNumber(str) {
    return str.split("").every(char => "0123456789".includes(char));
}

module.exports = { log16, isNumber };
