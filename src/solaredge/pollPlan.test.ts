import { expect } from "chai";
import { buildPollPlan } from "./pollPlan";

describe("buildPollPlan", () => {

	it("reproduces the historical six blocks with default options", () => {
		// Exactly what readAndWrite() used to hardcode before the poll plan
		// existed - this is the backwards compatibility guarantee.
		expect(buildPollPlan()).to.deep.equal([
			{ start: 0, length: 111, label: "inverter" },
			{ start: 0xE004, length: 0xE012 - 0xE004, label: "control" },
			{ start: 0xE100, length: 0xE16C - 0xE100, label: "battery1.block1" },
			{ start: 0xE16C, length: 0xE19A - 0xE16C, label: "battery1.block2" },
			{ start: 40123, length: 40226 - 40123, label: "meter1.block1" },
			{ start: 40227, length: 40294 - 40227, label: "meter1.block2" },
		]);
	});

	it("skips battery blocks entirely when no battery is installed", () => {
		const plan = buildPollPlan({ battery_count: 0 });
		expect(plan.filter(b => b.label.startsWith("battery"))).to.have.length(0);
		expect(plan).to.have.length(4);
	});

	it("adds meter 2 and 3 at the documented base addresses", () => {
		const plan = buildPollPlan({ meter_count: 3 });
		const meter2 = plan.filter(b => b.label.startsWith("meter2"));
		const meter3 = plan.filter(b => b.label.startsWith("meter3"));
		// SolarEdge meter offsets are 0xae and 0x15c, not a fixed 0x80 stride
		expect(meter2[0].start).to.equal(40123 + 0xae);
		expect(meter3[0].start).to.equal(40123 + 0x15c);
		expect(plan).to.have.length(10);
	});

	it("adds battery 2 one full 0x100 block above battery 1", () => {
		const plan = buildPollPlan({ battery_count: 2 });
		const battery2 = plan.filter(b => b.label.startsWith("battery2"));
		expect(battery2).to.have.length(2);
		expect(battery2[0].start).to.equal(0xE200);
		expect(battery2[1].start).to.equal(0xE200 + (0xE16C - 0xE100));
	});

	it("splits long requests without gaps or overlaps", () => {
		const max = 40;
		const plan = buildPollPlan({ max_register_block_size: max, meter_count: 3, battery_count: 2 });

		for (const block of plan) {
			expect(block.length).to.be.at.most(max);
			expect(block.length).to.be.greaterThan(0);
		}

		// every original block must be covered contiguously by its parts
		const original = buildPollPlan({ meter_count: 3, battery_count: 2 });
		for (const block of original) {
			const parts = plan.filter(p => p.label.startsWith(block.label + "#"));
			expect(parts.length, block.label).to.be.greaterThan(0);
			let cursor = block.start;
			for (const part of parts) {
				expect(part.start).to.equal(cursor);
				cursor += part.length;
			}
			expect(cursor).to.equal(block.start + block.length);
		}
	});

	it("keeps short blocks intact when splitting", () => {
		const plan = buildPollPlan({ max_register_block_size: 125 });
		// nothing is longer than 125 registers, so only the labels gain a part suffix
		expect(plan.map(b => b.start)).to.deep.equal(buildPollPlan().map(b => b.start));
	});

	it("clamps implausible values instead of producing an invalid plan", () => {
		expect(buildPollPlan({ meter_count: 99, battery_count: 99 })).to.have.length(12);
		expect(buildPollPlan({ meter_count: -5, battery_count: -5 })).to.have.length(4);
	});
});
