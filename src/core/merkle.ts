import { Utils } from "src/utils/utils";
import common from "../common/common";

export class Merkle {
    static buildRoot(hashes: string[] = []) {
        // Return empty hash as root if not hashes specified
        if (hashes.length === 0) {
            return common.emptyHash;
        }

        // Build root
        while (hashes.length !== 1) {
            // If leaves are odd, duplicate last leaf
            if (hashes.length % 2 !== 0) {
                hashes.push(hashes[hashes.length-1]);
            }

            // Hashes
            const newHashes: string[] = [];

            for (let i = 0; i < hashes.length - 1; i+=2) {
                const left = hashes[i];
                const right = hashes[i+1];
            
                // Sort pair
                const [a, b] = left <= right ? [left, right] : [right, left];
                
                const combined = Buffer.from(a + b, "hex");
                newHashes.push(Utils.sha256(combined));
            }

            hashes = newHashes;
        }

        return hashes[0];
    }
}
