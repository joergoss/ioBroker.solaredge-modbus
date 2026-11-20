/**
 * Regression tests for the SunSpec register decoding.
 *
 * The registers are addressed as zero based register numbers, exactly like
 * SolaredgeTCPModbus.readHoldingRegisterBlock() fills the buffer (start * 2).
 * No inverter hardware is required: the tests write raw register values into a
 * buffer and read them back through the model.
 */

import { expect } from "chai";
import { SolaredgeModel } from "./solaredgeModel";

/** Same buffer size as SolaredgeTCPModbus uses for a complete poll cycle. */
function emptyRegisterBuffer(): Buffer {
	return Buffer.alloc(0xFFFF * 2);
}

describe("solaredgeModel register decoding", () => {

	describe("ac.I_AC_Energy_WH (issue #1)", () => {
		// 40093/40094 = uint32 energy counter, 40095 = signed scale factor
		const ENERGY_REGISTER = 93;
		const SCALE_FACTOR_REGISTER = 95;

		it("applies a negative scale factor instead of reading it as unsigned", () => {
			const tmd = emptyRegisterBuffer();
			tmd.writeUInt32BE(123456, ENERGY_REGISTER * 2);
			tmd.writeInt16BE(-2, SCALE_FACTOR_REGISTER * 2);

			const model = new SolaredgeModel();
			const value = model["ac.I_AC_Energy_WH"].readRegister!(tmd);

			// 0.0.25 read the scale factor as uint16be: -2 became 65534 and the
			// result overflowed towards 10^65534 instead of 1234.56 Wh.
			expect(value).to.be.closeTo(1234.56, 0.000001);
		});

		it("keeps a positive scale factor working", () => {
			const tmd = emptyRegisterBuffer();
			tmd.writeUInt32BE(123456, ENERGY_REGISTER * 2);
			tmd.writeInt16BE(2, SCALE_FACTOR_REGISTER * 2);

			const model = new SolaredgeModel();
			const value = model["ac.I_AC_Energy_WH"].readRegister!(tmd);

			expect(value).to.equal(12345600);
		});

		it("keeps a zero scale factor working", () => {
			const tmd = emptyRegisterBuffer();
			tmd.writeUInt32BE(987654, ENERGY_REGISTER * 2);
			tmd.writeInt16BE(0, SCALE_FACTOR_REGISTER * 2);

			const model = new SolaredgeModel();
			const value = model["ac.I_AC_Energy_WH"].readRegister!(tmd);

			expect(value).to.equal(987654);
		});
	});

	describe("battery lifetime energy counters (issue #4)", () => {
		// 0xE176 = export, 0xE17A = import, each 4 registers.
		// SolarEdge stores the battery block with reversed register order,
		// exactly like the battery floats which the model reads as "floatsw".
		const EXPORT_REGISTER = 0xE176;
		const IMPORT_REGISTER = 0xE17A;

		it("decodes a small Wh value stored in the lowest register", () => {
			const tmd = emptyRegisterBuffer();
			tmd.writeUInt16BE(0x1000, EXPORT_REGISTER * 2); // 4096 Wh

			const model = new SolaredgeModel();
			const value = model["battery.lifetime_export_energy_counter"].readRegister!(tmd);

			// the old uint64be decoding returned 4096 * 2^48 = 1.15e18 instead
			expect(value).to.equal(4096);
		});

		it("places all four registers in reversed order", () => {
			const tmd = emptyRegisterBuffer();
			// target value 0x0000000100000002 = 4294967298
			// on the wire the register order is reversed: r0=2, r1=0, r2=1, r3=0
			tmd.writeUInt16BE(2, IMPORT_REGISTER * 2);
			tmd.writeUInt16BE(0, IMPORT_REGISTER * 2 + 2);
			tmd.writeUInt16BE(1, IMPORT_REGISTER * 2 + 4);
			tmd.writeUInt16BE(0, IMPORT_REGISTER * 2 + 6);

			const model = new SolaredgeModel();
			expect(model["battery.lifetime_import_energy_counter"].readRegister!(tmd)).to.equal(4294967298);
		});

		it("returns null for the SunSpec not-implemented marker instead of 1.8e19", () => {
			const tmd = emptyRegisterBuffer();
			for (let word = 0; word < 4; word++) {
				tmd.writeUInt16BE(0xFFFF, EXPORT_REGISTER * 2 + word * 2);
				tmd.writeUInt16BE(0xFFFF, IMPORT_REGISTER * 2 + word * 2);
			}

			const model = new SolaredgeModel();
			expect(model["battery.lifetime_export_energy_counter"].readRegister!(tmd)).to.be.null;
			expect(model["battery.lifetime_import_energy_counter"].readRegister!(tmd)).to.be.null;
		});

		it("keeps zero as a real value", () => {
			const model = new SolaredgeModel();
			expect(model["battery.lifetime_export_energy_counter"].readRegister!(emptyRegisterBuffer())).to.equal(0);
		});
	});

	describe("ac.I_AC_Power (reference for signed scale factors)", () => {
		it("decodes a negative power value with a negative scale factor", () => {
			const tmd = emptyRegisterBuffer();
			tmd.writeInt16BE(-55, 83 * 2); // I_AC_Power
			tmd.writeInt16BE(0, 84 * 2);   // I_AC_Power_SF

			const model = new SolaredgeModel();
			expect(model["ac.I_AC_Power"].readRegister!(tmd)).to.equal(-55);
		});
	});
});
