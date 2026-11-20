"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDENTIFICATION_BLOCK_LENGTH = void 0;
exports.isPrintableText = isPrintableText;
exports.readBatteryIdentity = readBatteryIdentity;
exports.readMeterIdentity = readMeterIdentity;
exports.evaluateBattery = evaluateBattery;
exports.evaluateMeter = evaluateMeter;
const common_1 = require("./common");
const deviceSpecs_1 = require("./deviceSpecs");
/** Empty slots return control characters / 0x7F garbage instead of text. */
function isPrintableText(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return false;
    }
    return /^[\x20-\x7E]+$/.test(trimmed);
}
function readBatteryIdentity(tmd, slot) {
    const base = deviceSpecs_1.BATTERY_BASE_ADDRESSES[slot - 1];
    return {
        slot,
        base,
        manufacturer: (0, common_1.extractValue)("string", 16, tmd, base),
        model: (0, common_1.extractValue)("string", 16, tmd, base + 16),
        serialNumber: (0, common_1.extractValue)("string", 16, tmd, base + 48),
        deviceAddress: (0, common_1.extractValue)("uint16be", 1, tmd, base + 64),
        ratedEnergy: (0, common_1.extractValue)("floatsw", 2, tmd, base + 66),
    };
}
function readMeterIdentity(tmd, slot) {
    const base = deviceSpecs_1.METER_BASE_ADDRESSES[slot - 1];
    return {
        slot,
        base,
        manufacturer: (0, common_1.extractValue)("string", 16, tmd, base),
        model: (0, common_1.extractValue)("string", 16, tmd, base + 16),
        serialNumber: (0, common_1.extractValue)("string", 16, tmd, base + 48),
        deviceAddress: (0, common_1.extractValue)("uint16be", 1, tmd, base + 64),
        sunspecDid: (0, common_1.extractValue)("uint16be", 1, tmd, base + 65),
    };
}
function evaluateBattery(identity, alreadySeenSerials) {
    const fail = (reason) => ({ present: false, reason, identity });
    if (identity.ratedEnergy === undefined || !Number.isFinite(identity.ratedEnergy) || identity.ratedEnergy <= 0) {
        return fail(`rated energy is NaN/not implemented or <= 0 (${identity.ratedEnergy})`);
    }
    if (!isPrintableText(identity.model)) {
        return fail("no usable model string");
    }
    const serial = identity.serialNumber.trim();
    if (serial.length === 0) {
        return fail("serial number is empty");
    }
    if (alreadySeenSerials.has(serial)) {
        return fail(`duplicate serial number ${serial} (slot mirrors another battery)`);
    }
    return { present: true, reason: `${identity.manufacturer.trim()} ${identity.model.trim()}, ${identity.ratedEnergy} Wh, serial ${serial}`, identity };
}
function evaluateMeter(identity) {
    const fail = (reason) => ({ present: false, reason, identity });
    // SunSpec meter models: 201 single phase, 202 split phase, 203 three phase
    if (identity.sunspecDid === undefined || ![201, 202, 203, 204].includes(identity.sunspecDid)) {
        return fail(`unexpected SunSpec meter DID ${identity.sunspecDid} (expected 201-204)`);
    }
    if (!isPrintableText(identity.manufacturer) || !isPrintableText(identity.model)) {
        return fail("identification strings are not printable text");
    }
    return { present: true, reason: `${identity.manufacturer.trim()} ${identity.model.trim()}, DID ${identity.sunspecDid}`, identity };
}
/** How many registers must be read to identify a device slot. */
exports.IDENTIFICATION_BLOCK_LENGTH = 68;
//# sourceMappingURL=deviceDetection.js.map