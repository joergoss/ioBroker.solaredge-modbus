/**
 * Decodes a captured register dump with the current model.
 *
 * Companion to the "log_raw_registers" instance setting: a user pastes the hex
 * lines from the log, and this tool shows what the adapter makes of them -
 * without access to the inverter.
 *
 * Input format (JSON): { "blocks": { "<label>": { "start": <number>, "hex": "<hex>" } } }
 * usage: npx ts-node src/solaredge/decodeCapture.ts <capture.json> [filter]
 */
import * as fs from "fs";
import { SolaredgeModel } from "./solaredgeModel";

export interface CaptureBlock {
	start: number;
	hex: string;
	error?: string;
}

/** Copies captured blocks into a buffer at their absolute register addresses. */
export function bufferFromCapture(capture: { blocks: Record<string, CaptureBlock> }): Buffer {
	const buf = Buffer.alloc(0xFFFF * 2);
	for (const block of Object.values(capture.blocks)) {
		if (block.error) {
			continue;
		}
		const data = Buffer.from(block.hex, "hex");
		data.copy(buf, block.start * 2);
	}
	return buf;
}

function main(): void {
	const file = process.argv[2];
	const filter = process.argv[3];
	if (!file) {
		throw new Error("usage: ts-node decodeCapture.ts <capture.json> [filter]");
	}
	const capture = JSON.parse(fs.readFileSync(file, "utf8"));
	const buf = bufferFromCapture(capture);
	const model = new SolaredgeModel();

	for (const [key, entry] of Object.entries(model)) {
		if (filter && !key.includes(filter)) {
			continue;
		}
		if (!entry.readRegister) {
			continue;
		}
		try {
			const value = entry.readRegister(buf);
			console.log(`${key}\t${value}\t${entry.unit}`);
		} catch (e) {
			console.log(`${key}\t<error: ${(e as Error).message}>`);
		}
	}
}

if (require.main === module) {
	main();
}
