import { State } from "../core/state";
import { TCPClient } from "./tcp";

export interface ClientOptions {
    state?: State;
    peers?: { host: string, port: number }[];
}

export class Client {
    public state: State;
    public peersTCP: TCPClient[];

    constructor(options: ClientOptions = {}) {
        this.state = options.state || new State();
        this.peersTCP = (options.peers || []).map(peer => new TCPClient({
            host: peer.host,
            port: peer.port,
            messageHandler: this.handleMessage
        }));
    }

    handleMessage(message: Buffer) {
        // Read first byte to get message type
        const messageType = message[0];

        switch (messageType) {
            
        }
    }
}