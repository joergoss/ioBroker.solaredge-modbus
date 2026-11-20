"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPollPlan = void 0;
const deviceSpecs_1 = require("./deviceSpecs");
function clampInt(value, fallback, min, max) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(value)));
}
/**
 * Builds the list of modbus requests for one poll cycle.
 *
 * With the default options the result is exactly the six blocks the adapter
 * has always read, so existing installations see no behavioural change.
 */
function buildPollPlan(options = {}) {
    const meterCount = clampInt(options.meter_count, 1, 1, deviceSpecs_1.METER_BASE_ADDRESSES.length);
    const batteryCount = clampInt(options.battery_count, 1, 0, deviceSpecs_1.BATTERY_BASE_ADDRESSES.length);
    const blocks = [
        { start: 0, length: 111, label: "inverter" },
        { start: 0xE004, length: 0xE012 - 0xE004, label: "control" },
    ];
    if (options.read_power_control === true) {
        blocks.push({ start: 0xF000, length: 4, label: "powercontrol" });
    }
    for (let battery = 0; battery < batteryCount; battery++) {
        const base = deviceSpecs_1.BATTERY_BASE_ADDRESSES[battery];
        blocks.push({ start: base, length: 0xE16C - 0xE100, label: `battery${battery + 1}.block1` }, { start: base + (0xE16C - 0xE100), length: 0xE19A - 0xE16C, label: `battery${battery + 1}.block2` });
    }
    for (let meter = 0; meter < meterCount; meter++) {
        const base = deviceSpecs_1.METER_BASE_ADDRESSES[meter];
        blocks.push({ start: base, length: 40226 - 40123, label: `meter${meter + 1}.block1` }, { start: base + (40227 - 40123), length: 40294 - 40227, label: `meter${meter + 1}.block2` });
    }
    const maxSize = clampInt(options.max_register_block_size, 0, 0, 125);
    if (maxSize === 0) {
        return blocks;
    }
    const split = [];
    for (const block of blocks) {
        let start = block.start;
        let remaining = block.length;
        let part = 1;
        while (remaining > 0) {
            const length = Math.min(remaining, maxSize);
            split.push({ start, length, label: `${block.label}#${part}` });
            start += length;
            remaining -= length;
            part++;
        }
    }
    return split;
}
exports.buildPollPlan = buildPollPlan;
//# sourceMappingURL=pollPlan.js.map