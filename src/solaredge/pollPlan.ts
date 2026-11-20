import { BATTERY_BASE_ADDRESSES, METER_BASE_ADDRESSES } from "./deviceSpecs";

/**
 * One modbus read request: "length" registers starting at protocol address
 * "start". The label is only used for diagnostics.
 */
export interface PollBlock {
	start: number;
	length: number;
	label: string;
}

export interface PollPlanOptions {
	/** how many meters are installed, 1..3 (default 1) */
	meter_count?: number;
	/** how many batteries are installed, 0..2 (default 1) */
	battery_count?: number;
	/**
	 * Split every request into chunks of at most this many registers.
	 * 0 or undefined keeps the historical block layout. Useful when a firmware
	 * answers long requests with stale or inconsistent values (issue #5).
	 */
	max_register_block_size?: number;
	/**
	 * Also poll the power control block at 0xF000 (rrcr_state,
	 * active_power_limit, cosphi). Off by default so older firmware that does
	 * not implement the block cannot break the whole poll cycle.
	 */
	read_power_control?: boolean;
	/**
	 * Explicit 1 based slot lists from auto detection. When set they take
	 * precedence over meter_count/battery_count. Slots may be sparse (a system
	 * could have only battery 2), which counts alone cannot express.
	 */
	meter_slots?: number[];
	battery_slots?: number[];
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
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
export function buildPollPlan(options: PollPlanOptions = {}): PollBlock[] {
	const meterCount = clampInt(options.meter_count, 1, 1, METER_BASE_ADDRESSES.length);
	const batteryCount = clampInt(options.battery_count, 1, 0, BATTERY_BASE_ADDRESSES.length);
	const meterSlots = options.meter_slots ?? Array.from({ length: meterCount }, (_v, i) => i + 1);
	const batterySlots = options.battery_slots ?? Array.from({ length: batteryCount }, (_v, i) => i + 1);

	const blocks: PollBlock[] = [
		{ start: 0, length: 111, label: "inverter" },
		{ start: 0xE004, length: 0xE012 - 0xE004, label: "control" },
	];

	if (options.read_power_control === true) {
		blocks.push({ start: 0xF000, length: 4, label: "powercontrol" });
	}

	for (const slot of batterySlots) {
		const base = BATTERY_BASE_ADDRESSES[slot - 1];
		if (base === undefined) continue;
		blocks.push(
			{ start: base, length: 0xE16C - 0xE100, label: `battery${slot}.block1` },
			{ start: base + (0xE16C - 0xE100), length: 0xE19A - 0xE16C, label: `battery${slot}.block2` },
		);
	}

	for (const slot of meterSlots) {
		const base = METER_BASE_ADDRESSES[slot - 1];
		if (base === undefined) continue;
		blocks.push(
			{ start: base, length: 40226 - 40123, label: `meter${slot}.block1` },
			{ start: base + (40227 - 40123), length: 40294 - 40227, label: `meter${slot}.block2` },
		);
	}

	const maxSize = clampInt(options.max_register_block_size, 0, 0, 125);
	if (maxSize === 0) {
		return blocks;
	}

	const split: PollBlock[] = [];
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
