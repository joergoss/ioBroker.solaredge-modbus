import { extractValue } from "./common";
import { BATTERY_BASE_ADDRESSES, METER_BASE_ADDRESSES } from "./deviceSpecs";

/**
 * Automatic detection of attached meters and batteries.
 *
 * The inverter answers reads for slots that are not populated too, so "the
 * request worked" proves nothing. The rules below are the same ones the leading
 * Home Assistant integration (solaredge-modbus-multi) uses, and each of them is
 * backed by a real capture from a reference system (realDeviceIdentification.json):
 *
 *   battery 1: BYD LVS 16.0, rated energy 16000 Wh, serial present  -> present
 *   battery 2: NaN rated energy and empty serial number             -> absent
 *   meter 1:   "SolarEdge" / "SE-MTR-3Y-400V-A", SunSpec DID 203    -> present
 *   meter 2/3: garbage strings and implausible SunSpec DID          -> absent
 */

export interface DeviceIdentity {
	/** 1 based slot number */
	slot: number;
	base: number;
	manufacturer: string;
	model: string;
	serialNumber: string;
	deviceAddress: number;
	/** battery only */
	ratedEnergy?: number;
	/** meter only: SunSpec model id of the meter block (201..204) */
	sunspecDid?: number;
}

export interface DetectionResult {
	present: boolean;
	reason: string;
	identity: DeviceIdentity;
}

/** Empty slots return control characters / 0x7F garbage instead of text. */
export function isPrintableText(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return false;
	}
	return /^[\x20-\x7E]+$/.test(trimmed);
}

export function readBatteryIdentity(tmd: Buffer, slot: number): DeviceIdentity {
	const base = BATTERY_BASE_ADDRESSES[slot - 1];
	return {
		slot,
		base,
		manufacturer: extractValue("string", 16, tmd, base) as string,
		model: extractValue("string", 16, tmd, base + 16) as string,
		serialNumber: extractValue("string", 16, tmd, base + 48) as string,
		deviceAddress: extractValue("uint16be", 1, tmd, base + 64) as number,
		ratedEnergy: extractValue("floatsw", 2, tmd, base + 66) as number,
	};
}

export function readMeterIdentity(tmd: Buffer, slot: number): DeviceIdentity {
	const base = METER_BASE_ADDRESSES[slot - 1];
	return {
		slot,
		base,
		manufacturer: extractValue("string", 16, tmd, base) as string,
		model: extractValue("string", 16, tmd, base + 16) as string,
		serialNumber: extractValue("string", 16, tmd, base + 48) as string,
		deviceAddress: extractValue("uint16be", 1, tmd, base + 64) as number,
		sunspecDid: extractValue("uint16be", 1, tmd, base + 65) as number,
	};
}

export function evaluateBattery(identity: DeviceIdentity, alreadySeenSerials: Set<string>): DetectionResult {
	const fail = (reason: string): DetectionResult => ({ present: false, reason, identity });
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

export function evaluateMeter(identity: DeviceIdentity): DetectionResult {
	const fail = (reason: string): DetectionResult => ({ present: false, reason, identity });
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
export const IDENTIFICATION_BLOCK_LENGTH = 68;
