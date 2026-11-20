/**
 * Regression tests against a real, read-only register capture from a SolarEdge
 * SE10K with a BYD Premium LVS 16.0 battery (issue #4).
 *
 * The capture is committed as realBatteryCapture.json with the battery serial
 * number zeroed. It proves the word order fixes with actual device bytes, not
 * with assumptions about the documentation.
 */

import { expect } from "chai";
import { SolaredgeModel } from "./solaredgeModel";
import { bufferFromCapture } from "./decodeCapture";
import capture from "./realBatteryCapture.json";

describe("real battery capture (SE10K + BYD LVS 16.0)", () => {
	const buf = bufferFromCapture(capture as { blocks: Record<string, { start: number; hex: string }> });
	const model = new SolaredgeModel();

	function value(id: string): unknown {
		return model[id].readRegister!(buf);
	}

	it("identifies the battery correctly", () => {
		expect(value("battery.manufacturer_name")).to.equal("48V_BYD");
		expect(value("battery.model")).to.equal("BYD Premium LVS 16.0");
		expect(value("battery.firmware_version")).to.equal("48V DCDC 2.3.3");
	});

	it("decodes energy and state of charge as floatsw", () => {
		expect(value("battery.rated_energy")).to.equal(16000);
		expect(value("battery.max_energy")).to.equal(16000);
		// 16000 Wh * 91 % state of health = 14560 Wh usable
		expect(value("battery.SOH")).to.equal(91);
		expect(value("battery.available_energy")).to.equal(14560);
		expect(value("battery.SOE")).to.equal(10);
	});

	it("decodes the status as 10, not 655360 (uint32sw)", () => {
		// raw registers [0x000A, 0x0000]: the previous uint32be decoding shifted
		// the real status into the high word and reported 10 << 16.
		expect(value("battery.status")).to.equal(10);
		expect(value("battery.status_internal")).to.equal(1);
	});

	it("decodes the 64 bit lifetime counters with reversed word order", () => {
		// raw export registers [0x0061, 0, 0, 0] and import [0x0161, 0, 0, 0].
		// The old uint64be decoding reported 2.73e16 and 9.94e16 Wh here.
		expect(value("battery.lifetime_export_energy_counter")).to.equal(97);
		expect(value("battery.lifetime_import_energy_counter")).to.equal(353);
	});

	it("decodes power limits and temperature plausibly", () => {
		expect(value("battery.charge_continues_power")).to.equal(5000);
		expect(value("battery.discharge_continues_power")).to.equal(5000);
		expect(value("battery.average_temperature")).to.equal(23);
	});
});
