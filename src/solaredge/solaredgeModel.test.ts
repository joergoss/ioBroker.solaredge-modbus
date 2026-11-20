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
