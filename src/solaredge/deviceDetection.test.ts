/**
 * Auto detection rules tested against the real identification blocks of a
 * reference system (SE10K + one BYD battery + one meter). See
 * realDeviceIdentification.json - serial numbers are pseudonymised there.
 */

import { expect } from "chai";
import { bufferFromCapture } from "./decodeCapture";
import {
	evaluateBattery,
	evaluateMeter,
	isPrintableText,
	readBatteryIdentity,
	readMeterIdentity,
} from "./deviceDetection";
import capture from "./realDeviceIdentification.json";
import batteryCapture from "./realBatteryCapture.json";
import { SolaredgeModel } from "./solaredgeModel";

describe("deviceDetection with real identification blocks", () => {
	const buf = bufferFromCapture(capture as { blocks: Record<string, { start: number; hex: string }> });

	it("detects the installed battery 1 and reports its identity", () => {
		const identity = readBatteryIdentity(buf, 1);
		expect(identity.model).to.equal("BYD Premium LVS 16.0");
		expect(identity.ratedEnergy).to.equal(16000);
		expect(identity.serialNumber).to.match(/^PSEUDO-/);

		const result = evaluateBattery(identity, new Set());
		expect(result.present, result.reason).to.be.true;
	});

	it("rejects battery 2: SunSpec not-implemented float and empty serial", () => {
		const identity = readBatteryIdentity(buf, 2);
		// SunSpec marks unimplemented float32 as 0xFF7FFFFF = -FLT_MAX, not NaN.
		// After word swap the raw bytes ff ff ff 7f decode to exactly this value.
		expect(identity.ratedEnergy).to.equal(-3.4028234663852886e+38);
		expect(identity.serialNumber.trim()).to.equal("");

		const result = evaluateBattery(identity, new Set());
		expect(result.present).to.be.false;
		expect(result.reason).to.match(/rated energy/);
	});

	it("rejects a battery whose serial number is already known (mirrored slot)", () => {
		const first = readBatteryIdentity(buf, 1);
		const serial = first.serialNumber.trim();
		const duplicate = evaluateBattery(first, new Set([serial]));
		expect(duplicate.present).to.be.false;
		expect(duplicate.reason).to.match(/duplicate/);
	});

	it("detects meter 1 via its SunSpec DID and printable identification", () => {
		const identity = readMeterIdentity(buf, 1);
		expect(identity.manufacturer).to.equal("SolarEdge");
		expect(identity.model).to.equal("SE-MTR-3Y-400V-A");
		expect(identity.sunspecDid).to.equal(203);

		expect(evaluateMeter(identity).present).to.be.true;
	});

	it("exposes the full meter identification as states", () => {
		const model = new SolaredgeModel();
		expect(model["meter.1.C_Option"].readRegister!(buf)).to.equal("Export+Import");
		expect(model["meter.1.C_Version"].readRegister!(buf)).to.equal("79");
		expect(model["meter.1.C_DeviceAddress"].readRegister!(buf)).to.equal(2);
		expect(model["meter.1.C_SunSpec_DID"].readRegister!(buf)).to.equal(203);
		// 105 registers is exactly the SunSpec model 203 block length
		expect(model["meter.1.C_SunSpec_Length"].readRegister!(buf)).to.equal(105);
		expect(model["meter.1.C_SerialNumber"].readRegister!(buf)).to.match(/^PSEUDO-/);
	});

	it("exposes battery sunspec did and event logs", () => {
		const model = new SolaredgeModel();
		expect(model["battery.sunspec_did"].readRegister!(buf)).to.equal(0);
		const batteryBuf = bufferFromCapture(batteryCapture as { blocks: Record<string, { start: number; hex: string }> });
		expect(model["battery.event_log"].readRegister!(batteryBuf)).to.equal(0);
		expect(model["battery.event_log_internal"].readRegister!(batteryBuf)).to.equal(0);
	});

	it("rejects meters 2 and 3 which contain garbage", () => {
		for (const slot of [2, 3]) {
			const identity = readMeterIdentity(buf, slot);
			const result = evaluateMeter(identity);
			expect(result.present, `meter ${slot} should be absent`).to.be.false;
		}
	});
});

describe("isPrintableText", () => {
	it("accepts normal device strings", () => {
		expect(isPrintableText("SolarEdge")).to.be.true;
		expect(isPrintableText("BYD Premium LVS 16.0")).to.be.true;
	});

	it("rejects empty and control character content", () => {
		expect(isPrintableText("")).to.be.false;
		expect(isPrintableText("   ")).to.be.false;
		expect(isPrintableText("\x7f\x7f\x7f")).to.be.false;
		expect(isPrintableText("\x00\x01\x02")).to.be.false;
	});
});
