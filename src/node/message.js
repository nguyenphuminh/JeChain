function produceMessage(type, data) {
    // Produce a JSON message
    return JSON.stringify({ type, data });
}

function sendMessage(message, nodes) {
    // Broadcast message to all nodes
    nodes.forEach(node => node.socket.send(message));
}

module.exports = { produceMessage, sendMessage };
