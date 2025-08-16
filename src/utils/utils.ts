import crypto from "crypto";

export class Utils {
    static sha256 = (message: crypto.BinaryLike) => crypto.createHash("sha256").update(message).digest("hex");
    
    static log16(x: number): number {
        return Math.log(x) / Math.log(16);
    }

    static clog(message: string) {
        console.log(`\x1b[32mLOG\x1b[0m [${(new Date()).toISOString()}] ${message}`);
    }

    static cerror(message: string) {
        console.log(`\x1b[31mERROR\x1b[0m [${(new Date()).toISOString()}] ${message}`);
    }
}
