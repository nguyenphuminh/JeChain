import net from "net";
import { Utils } from "../utils/utils";

export interface TCPClientOptions {
    host: string;
    port: number;
    messageHandler: (message: Buffer) => void;
}

export class TCPClient {
    public socket: net.Socket;
    public buffer: Buffer;
    public messageHandler: (message: Buffer) => void;
    public maxMessageSize = 1024 * 1024 * 5; // 5mb

    constructor(options: TCPClientOptions) {
        // TCP socket
        this.socket = new net.Socket();
        // Message buffer
        this.buffer = Buffer.alloc(0);
        // Connect
        this.connect(options.host, options.port);
        // Assign message handler
        this.messageHandler = options.messageHandler;
    }

    connect(host: string, port: number) {
        this.socket.connect(port, host, () => {
            Utils.clog(`Connected to ${host}:${port}`);
        });

        this.socket.on("data", (data: Buffer) => {
            this.buffer = Buffer.concat([this.buffer, data]);
            this.processMessages();
        });

        this.socket.on("close", () => {
            Utils.clog(`Connection closed from ${host}:${port}`);
        });

        this.socket.on("error", (error) => {
            Utils.cerror(`Connection error from ${host}:${port}: ${error}`);
        });
    }

    processMessages() {
        while (this.buffer.length >= 4) {
            // Read message length (first 4 bytes)
            const messageLength = this.buffer.readUInt32BE(0);

            // Disconnect if message size is violated
            if (messageLength > this.maxMessageSize) {
                this.socket.destroy();
                return;
            }

            // Check if we have complete message
            if (this.buffer.length >= 4 + messageLength) {
                // Extract message (skip 4-byte length header)
                const message = this.buffer.subarray(4, 4 + messageLength);

                // Remove processed message from buffer
                this.buffer = this.buffer.subarray(4 + messageLength);

                this.messageHandler(message);
            } else {
                break; // Wait for more data
            }
        }
    }

    send(messageBuffer: Buffer) {
        if (messageBuffer.length > this.maxMessageSize) {
            throw new Error(`Message too large: ${messageBuffer.length} bytes`);
        }

        // Create length-prefixed message
        const lengthHeader = Buffer.allocUnsafe(4);
        lengthHeader.writeUInt32BE(messageBuffer.length, 0);

        const fullMessage = Buffer.concat([lengthHeader, messageBuffer]);
        this.socket.write(fullMessage);
    }

    close() {
        this.socket.destroy();
    }
}
