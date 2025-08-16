import crypto from "crypto";

export class Utils {
    static sha256 = (message: crypto.BinaryLike) => crypto.createHash("sha256").update(message).digest("hex");
    
    static log16(x: number): number {
        return Math.log(x) / Math.log(16);
    }
}
