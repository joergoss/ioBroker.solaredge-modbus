import { expect } from "chai";
import { extractValue, writeValue, extractBigUint64Sw, NOT_IMPLEMENTED_UINT64 } from "./common";

describe("writeValue", () => {
	it("writes the high word of a 64 bit value correctly", () => {
		// value >> 32 is a no-op in JavaScript (shift count is taken modulo 32),
		// so the old code wrote the low bits into both words.
		const buf = writeValue("uint64be", 0x0000000100000002);
		expect(buf).to.not.be.undefined;
		expect(buf!.toString("hex")).to.equal("0000000100000002");
	});

	it("keeps small 64 bit values intact", () => {
		expect(writeValue("uint64be", 4096)!.toString("hex")).to.equal("0000000000001000");
	});

	it("writes 16 bit control values as before", () => {
		expect(writeValue("uint16be", 4)!.toString("hex")).to.equal("0004");
	});
});

describe("extractValue / extractBigUint64Sw", () => {
	it("reads a signed scale factor as negative", () => {
		const buf = Buffer.alloc(4);
		buf.writeInt16BE(-2, 0);
		expect(extractValue("int16be", 1, buf, 0)).to.equal(-2);
		expect(extractValue("uint16be", 1, buf, 0)).to.equal(65534);
	});

	it("reverses register order for 64 bit battery values", () => {
		const buf = Buffer.alloc(16);
		// on the wire: r0=2, r1=0, r2=1, r3=0 -> value 0x0000000100000002
		buf.writeUInt16BE(2, 0);
		buf.writeUInt16BE(0, 2);
		buf.writeUInt16BE(1, 4);
		buf.writeUInt16BE(0, 6);
		expect(Number(extractBigUint64Sw(buf, 0))).to.equal(4294967298);
	});

	it("exposes the not-implemented marker for comparison", () => {
		const buf = Buffer.alloc(8, 0xFF);
		expect(extractBigUint64Sw(buf, 0)).to.equal(NOT_IMPLEMENTED_UINT64);
	});
});
