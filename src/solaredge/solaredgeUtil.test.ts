import { expect } from "chai";
import { roleForUnit } from "./solaredgeUtil";
import { isUnavailableNumber, SUNSPEC_NOT_IMPLEMENTED_FLOAT32 } from "./common";

describe("roleForUnit", () => {
	it("maps physical units to meaningful ioBroker roles", () => {
		expect(roleForUnit("W")).to.equal("value.power");
		expect(roleForUnit("Wh")).to.equal("value.energy");
		expect(roleForUnit("V")).to.equal("value.voltage");
		expect(roleForUnit("A")).to.equal("value.current");
		expect(roleForUnit("°C")).to.equal("value.temperature");
		expect(roleForUnit("Hz")).to.equal("value.frequency");
	});

	it("keeps a generic role for unitless values", () => {
		expect(roleForUnit("")).to.equal("value");
		expect(roleForUnit("%")).to.equal("value");
	});
});

describe("isUnavailableNumber", () => {
	it("rejects non finite numbers and the SunSpec not-implemented float", () => {
		expect(isUnavailableNumber(Infinity)).to.be.true;
		expect(isUnavailableNumber(-Infinity)).to.be.true;
		expect(isUnavailableNumber(NaN)).to.be.true;
		expect(isUnavailableNumber(SUNSPEC_NOT_IMPLEMENTED_FLOAT32)).to.be.true;
	});

	it("accepts real measurements including zero and negatives", () => {
		expect(isUnavailableNumber(0)).to.be.false;
		expect(isUnavailableNumber(-55)).to.be.false;
		expect(isUnavailableNumber(44753188)).to.be.false;
	});
});
