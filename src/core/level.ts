import { Level } from "level";

export class CustomLevel {
    public db: Level;

    constructor(location: string, options: any = { valueEncoding: "buffer" }) {
        this.db = new Level(location, options);
    }

    get(key: string): Promise<Buffer> {
        return this.db.get(key) as any as Promise<Buffer>;
    }

    batch(ops: { type: string, key: string, value?: Buffer }[]): Promise<void> {
        return this.db.batch(ops as any);
    }
}
