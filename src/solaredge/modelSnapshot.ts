/**
 * Decodes every model entry for a deterministic pseudo random buffer.
 *
 * Used to prove that the table driven meter/battery definitions decode exactly
 * like the previous hand written ones. The captured output is committed as
 * legacyModelSnapshot.json and checked by solaredgeModel.test.ts, so any later
 * change to offsets, register types or scale factors is caught without an
 * inverter.
 *
 * Regenerate deliberately with: npx ts-node src/solaredge/modelSnapshot.ts <out.json>
 */
import * as fs from "node:fs";
import { SolaredgeModel } from "./solaredgeModel";

export function createDeterministicBuffer(): Buffer {
	// Fixed seed: same bytes on every run, no hardware involved.
	let seed = 20261120;
	const buf = Buffer.alloc(0xFFFF * 2);
	for (let i = 0; i < buf.length; i++) {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		buf[i] = seed % 256;
	}
	return buf;
}

export function decodeAll(buffer: Buffer): Record<string, unknown> {
	const model = new SolaredgeModel();
	const result: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(model)) {
		try {
			result[key] = entry.readRegister ? entry.readRegister(buffer) : "<no readRegister>";
		} catch (e) {
			result[key] = `<error: ${(e as Error).message}>`;
		}
	}
	return result;
}

function main(): void {
	const target = process.argv[2];
	if (!target) {
		throw new Error("usage: ts-node modelSnapshot.ts <output.json>");
	}
	const result = decodeAll(createDeterministicBuffer());
	fs.writeFileSync(target, JSON.stringify(result, null, 1) + "\n");
	console.log(`wrote ${Object.keys(result).length} entries to ${target}`);
}

if (require.main === module) {
	main();
}
