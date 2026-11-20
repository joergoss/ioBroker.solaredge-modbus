import { extractValue, writeValue, extractBigUint64Sw, NOT_IMPLEMENTED_UINT64 } from "./common";
import { BATTERY_BASE_ADDRESSES, BATTERY_SPECS, METER_BASE_ADDRESSES, METER_SPECS, RegisterSpec } from "./deviceSpecs";

/**
 * Battery lifetime counters are 64 bit values in reversed register order and
 * may contain the SunSpec "not implemented" marker. Returning null keeps the
 * state empty instead of showing ~1.8e19 Wh (issue #4).
 */
function readBatteryEnergyCounter(tmd: Buffer, offset: number): number | null {
	const raw = extractBigUint64Sw(tmd, offset);
	if (raw === NOT_IMPLEMENTED_UINT64) {
		return null;
	}
	return Number(raw);
}
// import { round, signedToInteger } from "./solaredgeUtil";

/** Builds the readRegister closure for one table entry at a device base address. */
function makeSpecReader(spec: RegisterSpec, base: number): (tmd: Buffer) => SolaredgePropertyType {
	const offset = base + spec.offset;
	if (spec.notImplementedAsNull) {
		return (tmd: Buffer) => readBatteryEnergyCounter(tmd, offset);
	}
	if (spec.scaleFactorOffset !== undefined) {
		const scaleFactorOffset = base + spec.scaleFactorOffset;
		return (tmd: Buffer) =>
			(extractValue(spec.type, spec.len, tmd, offset) as number) *
			Math.pow(10, extractValue("int16be", 1, tmd, scaleFactorOffset) as number);
	}
	return (tmd: Buffer) => extractValue(spec.type, spec.len, tmd, offset);
}

function makeSpecEntry(spec: RegisterSpec, base: number, deviceLabel?: string): SolaredgeDataEntry {
	return {
		// "Battery 1 ..." / "Meter 1 ..." become the actual device number
		descr: deviceLabel ? spec.descr.replace(/Battery \d+/, deviceLabel).replace(/Meter \d+/, deviceLabel) : spec.descr,
		unit: spec.unit,
		role: "value",
		type: spec.type === "string" ? "string" : "number",
		readRegister: makeSpecReader(spec, base),
		value: 0,
	};
}

export interface SolaredgeDataEntry {
	descr: string,
	unit: string;
	role: ioBrokerRole;
	type: ioBroker.CommonType //'number' | 'string' | 'boolean' | 'array' | 'object' | 'mixed' | 'file'
	readRegister?: (SolaredgeModbusData: Buffer) => SolaredgePropertyType;
	writeRegister?: (twd: SolaredgeWriteData) => SolaredgeWriteMultipleHoldingRegister;
	writeCoil?: (twd: SolaredgeWriteData) => SolaredgeWriteSingleCoil
	value: SolaredgePropertyType;
	valueOld?: SolaredgePropertyType;
	states?: { [key: string]: string }
}

export type SolaredgePropertyType = number | string | boolean | null; // entspricht ioBroker.StateValue
export type SolaredgeHoldingRegister = Buffer

export interface SolaredgeWriteData  {
	value: SolaredgePropertyType,
}
export interface SolaredgeWriteMultipleHoldingRegister {
	register: number;
	value: Buffer | undefined
}

export interface SolaredgeWriteSingleCoil {
	register: number;
	value: number
}
export type ioBrokerRole = "state" | "value.current" | "value.voltage" | "value" | "value.temperature"

export class SolaredgeModbusData {
	hr : SolaredgeHoldingRegister;
	config: ioBroker.AdapterConfig;

	constructor(hr: SolaredgeHoldingRegister, config: ioBroker.AdapterConfig) {
		this.hr = hr;
		this.config = config;
	}
}


export class SolaredgeModel {
	[key: string]: SolaredgeDataEntry

	/**
	 * Power control block (0xF000). Verified against a real SE10K capture:
	 * rrcr_state 0, active_power_limit 100 (%), cosphi 1.0.
	 * cosphi needs word swap even though it sits outside the battery block.
	 */
	"powercontrol.rrcr_state":    SolaredgeDataEntry = {
		descr: "RRCR state (radio ripple control receiver)",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 0xF000) as number,
		value: 0,
	};

	"powercontrol.active_power_limit":    SolaredgeDataEntry = {
		descr: "Active power limit in percent of nominal power",
		unit:  "%",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 0xF001) as number,
		value: 0,
	};

	"powercontrol.cosphi":    SolaredgeDataEntry = {
		descr: "Configured cos phi",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("floatsw", 2, tmd, 0xF002) as number,
		value: 0,
	};

	constructor() {
		// Meters are created from one table per supported base address.
		METER_BASE_ADDRESSES.forEach((base, index) => {
			const meterNumber = index + 1;
			for (const spec of METER_SPECS) {
				this[`meter.${meterNumber}.${spec.name}`] = makeSpecEntry(spec, base, `Meter ${meterNumber}`);
			}
		});

		// Battery 1 keeps its historical ids without a number, so existing
		// installations, scripts and history adapters keep working unchanged.
		// Battery 2 is added as "battery.2.*".
		BATTERY_BASE_ADDRESSES.forEach((base, index) => {
			const batteryNumber = index + 1;
			for (const spec of BATTERY_SPECS) {
				const id = batteryNumber === 1 ? `battery.${spec.name}` : `battery.${batteryNumber}.${spec.name}`;
				this[id] = makeSpecEntry(spec, base, `Battery ${batteryNumber}`);
			}
		});
	}

 	"common.C_SunSpec_ID":    SolaredgeDataEntry = {
		descr: "Value = 'SunS' (0x53756e53). Uniquely identifies this as a SunSpec MODBUS Map",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) => extractValue("uint32be", 2, tmd, 0)  /* * tmd.scale.v */,
		value: 0,
	};

	"common.C_SunSpec_DID":    SolaredgeDataEntry = {
		descr: "Value = 0x0001. Uniquely identifies this as a SunSpec Common Model Block",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 2),
		value: 0,
	};

	"common.C_SunSpec_Length":    SolaredgeDataEntry = {
		descr: "65 = Length of block in 16-bit registers",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 3),
		value: 0,
	};

	"common.C_Manufacturer":    SolaredgeDataEntry = {
		descr: "Value Registered with SunSpec = 'SolarEdge'",
		unit:  "",
		role:  "value",
		type: "string",
		readRegister:  (tmd: Buffer) =>  extractValue("string", 16, tmd, 4),
		value: "",
	};

	"common.C_Model":    SolaredgeDataEntry = {
		descr: "SolarEdge Specific Value",
		unit:  "",
		role:  "value",
		type: "string",
		readRegister:  (tmd: Buffer) =>  extractValue("string", 16, tmd, 20),
		value: "",
	};

	"common.C_Version":    SolaredgeDataEntry = {
		descr: "SolarEdge Specific Value",
		unit:  "",
		role:  "value",
		type: "string",
		readRegister:  (tmd: Buffer) =>  extractValue("string", 8, tmd, 44),
		value: "",
	};



	"common.C_SerialNumber":    SolaredgeDataEntry = {
		descr: "SolarEdge Specific Value",
		unit:  "",
		role:  "value",
		type: "string",
		readRegister:  (tmd: Buffer) =>  extractValue("string", 8, tmd, 52),
		value: "",
	};

	"common.C_DeviceAddress":    SolaredgeDataEntry = {
		descr: "MODBUS Unit ID",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 68),
		value: 0,
	};

	"ac.C_SunSpec_DID":    SolaredgeDataEntry = {
		descr: "101 = single phase 102 = split phase 103 = three phase",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 69),
		value: 0,
		states: {
			"101": "single phase",
			"102": "split phase",
			"103": "three phase"
		}
	};


	// "ac.C_SunSpec_Length":    SolaredgeDataEntry = {
	// 	descr: "50 = Length of model block",
	// 	unit:  "",
	// 	role:  "value",
	// 	type: "number",
	// 	readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 70),
	// 	value: 0,
	// };

	"ac.I_AC_Current":    SolaredgeDataEntry = {
		descr: "AC Total Current value",
		unit:  "A",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 71) as number * Math.pow(10,extractValue("int16be", 1, tmd, 75) as number),
		value: 0,
	};

	"ac.I_AC_CurrentA":    SolaredgeDataEntry = {
		descr: "AC Phase A Current value",
		unit:  "A",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 72) as number * Math.pow(10,extractValue("int16be", 1, tmd, 75) as number),
		value: 0,
	};
	"ac.I_AC_CurrentB":    SolaredgeDataEntry = {
		descr: "AC Phase B Current value",
		unit:  "A",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 73) as number * Math.pow(10,extractValue("int16be", 1, tmd, 75) as number),
		value: 0,
	};
	"ac.I_AC_CurrentC":    SolaredgeDataEntry = {
		descr: "AC Phase C Current value",
		unit:  "A",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 74) as number * Math.pow(10,extractValue("int16be", 1, tmd, 75) as number),
		value: 0,
	};


	"ac.I_AC_VoltageAB":    SolaredgeDataEntry = {
		descr: "AC Voltage Phase AB value",
		unit:  "V",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 76) as number * Math.pow(10,extractValue("int16be", 1, tmd, 82) as number),
		value: 0,
	};

	"ac.I_AC_VoltageBC":    SolaredgeDataEntry = {
		descr: "AC Voltage Phase BC value",
		unit:  "V",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 77) as number * Math.pow(10,extractValue("int16be", 1, tmd, 82) as number),
		value: 0,
	};

	"ac.I_AC_VoltageCA":    SolaredgeDataEntry = {
		descr: "AC Voltage Phase CA value",
		unit:  "V",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 78) as number * Math.pow(10,extractValue("int16be", 1, tmd, 82) as number),
		value: 0,
	};

	"ac.I_AC_VoltageAN":    SolaredgeDataEntry = {
		descr: "AC Voltage Phase A to N value",
		unit:  "V",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 79) as number * Math.pow(10,extractValue("int16be", 1, tmd, 82) as number),
		value: 0,
	};

	"ac.I_AC_VoltageBN":    SolaredgeDataEntry = {
		descr: "AC Voltage Phase B to N value",
		unit:  "V",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  {
			// console.log("tmd", tmd)
			// console.log("tmd 79", tmd[79*2], tmd[79*2+1])
			// console.log("tmd 80", tmd[80*2], tmd[80*2+1])
			// console.log("tmd 81", tmd[81*2], tmd[81*2+1])
			// console.log("tmd 82", tmd[82*2], tmd[82*2+1])
			// console.log("scaling", extractValue("int16be", 1, tmd, 82))
			return extractValue("uint16be", 1, tmd, 80) as number * Math.pow(10,extractValue("int16be", 1, tmd, 82) as number)
		},
		value: 0,
	};

	"ac.I_AC_VoltageCN":    SolaredgeDataEntry = {
		descr: "AC Voltage Phase C to N value",
		unit:  "V",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 81) as number * Math.pow(10,extractValue("int16be", 1, tmd, 82) as number),
		value: 0,
	};


	"ac.I_AC_Power":    SolaredgeDataEntry = {
		descr: "AC Power value",
		unit:  "W",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("int16be", 1, tmd, 83) as number * Math.pow(10,extractValue("int16be", 1, tmd, 84) as number),
		value: 0,
	};

	"ac.I_AC_Frequency":    SolaredgeDataEntry = {
		descr: "AC Frequency value",
		unit:  "Hz",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 85) as number * Math.pow(10,extractValue("int16be", 1, tmd, 86) as number),
		value: 0,
	};

	"ac.I_AC_VA":    SolaredgeDataEntry = {
		descr: "Apparent Power",
		unit:  "VA",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("int16be", 1, tmd, 87) as number * Math.pow(10,extractValue("int16be", 1, tmd, 88) as number),
		value: 0,
	};

	"ac.I_AC_VAR":    SolaredgeDataEntry = {
		descr: "Reactive Power",
		unit:  "VAR",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("int16be", 1, tmd, 89) as number * Math.pow(10,extractValue("int16be", 1, tmd, 90) as number),
		value: 0,
	};

	"ac.I_AC_PF":    SolaredgeDataEntry = {
		descr: "Power Factor",
		unit:  "%",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("int16be", 1, tmd, 91) as number * Math.pow(10,extractValue("int16be", 1, tmd, 92) as number),
		value: 0,
	};

	"ac.I_AC_Energy_WH":    SolaredgeDataEntry = {
		descr: "AC Lifetime Energy production",
		unit:  "Wh",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 93) as number * Math.pow(10,extractValue("int16be", 1, tmd, 95) as number),
		value: 0,
	};



	"dc.I_DC_Current":    SolaredgeDataEntry = {
		descr: "DC Current value",
		unit:  "A",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 96) as number * Math.pow(10,extractValue("int16be", 1, tmd, 97) as number),
		value: 0,
	};

	"dc.I_DC_Voltage":    SolaredgeDataEntry = {
		descr: "DC Voltage value",
		unit:  "V",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 98) as number * Math.pow(10,extractValue("int16be", 1, tmd, 99) as number),
		value: 0,
	};

	"dc.I_DC_Power":    SolaredgeDataEntry = {
		descr: "DC Power value",
		unit:  "W",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("int16be", 1, tmd, 100) as number * Math.pow(10,extractValue("int16be", 1, tmd, 101) as number),
		value: 0,
	};


	"state.I_Temp_Sink":    SolaredgeDataEntry = {
		descr: "Heat Sink Temperature",
		unit:  "°C",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("int16be", 1, tmd, 103) as number * Math.pow(10,extractValue("int16be", 1, tmd, 106) as number),
		value: 0,
	};

	"state.I_Status":    SolaredgeDataEntry = {
		descr: "Operating State",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 107) as number,
		value: 0,
		states: {
			"1": "Off",
			"2": "Sleeping (auto-shutdown) – Night mode",
			"3": "Grid Monitoring/wake-up",
			"4": "Inverter is ON and producing power",
			"5": "Production (curtailed)",
			"6": "Shutting down",
			"7": "Fault",
			"8": "Maintenance/setup"
		}
	};

	"state.I_Status_Vendor":    SolaredgeDataEntry = {
		descr: "Vendor-defined operating state and error codes. For error description, meaning and troubleshooting, refer to the SolarEdge Installation Guide.",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 108) as number,
		value: 0,
	};



	/* ***************************************************************************************************** */




	"control.storage_control_mode":    SolaredgeDataEntry = {
		descr: "0-4",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 0xE004) as number,
		writeRegister: (wd: SolaredgeWriteData) => {
			const value = typeof wd.value == "number" ? wd.value : 0
			return { register: 0xE004, value: writeValue("uint16be", value) }
		},
		value: 0,
		states:  {
			"0": "Disabled",
			"1": "Maximize Self Consumption - meter required",
			"2": "Time of Use (Profile programming) - meter required",
			"3": "Backup Only",
			"4": "Remote Control"
		}
	};

	"control.storage_ac_charge_policy":    SolaredgeDataEntry = {
		descr: "0-3",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 0xE005) as number,
		writeRegister: (wd: SolaredgeWriteData) => {
			const value = typeof wd.value == "number" ? wd.value : 0
			return { register: 0xE005, value: writeValue("uint16be", value) }
		},
		value: 0,
		states: {
			"0": "Disable",
			"1": "Always allowed",
			"2": "Fixed Energy Limit (for US regulation)",
			"3": "Percent of Production (for US regulation)",
		}
	};


	"control.storage_ac_charge_limit":    SolaredgeDataEntry = {
		descr: "0-Max_Float",
		unit:  "KWh or %",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("floatsw", 2, tmd, 0xE006) as number,
		writeRegister: (wd: SolaredgeWriteData) => {
			const value = typeof wd.value == "number" ? wd.value : 0
			return { register: 0xE006, value: writeValue("floatsw", value) }
		},
		value: 0,
	};


	"control.storage_backup_reserved_setting":    SolaredgeDataEntry = {
		descr: "0-100",
		unit:  "%",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("floatsw", 2, tmd, 0xE008) as number,
		writeRegister: (wd: SolaredgeWriteData) => {
			const value = typeof wd.value == "number" ? wd.value : 0
			return { register: 0xE008, value: writeValue("floatsw", value) }
		},
		value: 0,
	};


	"control.storage_charge_discharge_default_mode":    SolaredgeDataEntry = {
		descr: "0-7",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 0xE00A) as number,
		writeRegister: (wd: SolaredgeWriteData) => {
			const value = typeof wd.value == "number" ? wd.value : 0
			return { register: 0xE00A, value: writeValue("uint16be", value) }
		},
		value: 0,
		states: {
			"0": "Off",
			"1": "Charge excess PV power only",
			"2": "Charge from PV first, before producing power to the AC",
			"3": "Charge from PV+AC according to the max battery power",
			"4": "Maximize export – discharge battery to meet max inverter AC limit",
			"5": "Discharge to meet loads consumption. Discharging to the grid is not allowed",
			"7": "Maximize self-consumption",
		}
	};

	"control.remote_control_command_timeout":    SolaredgeDataEntry = {
		descr: "0-86400(24h)",
		unit:  "s",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 0xE00B) as number,
		writeRegister: (wd: SolaredgeWriteData) => {
			const value = typeof wd.value == "number" ? wd.value : 0
			return { register: 0xE00B, value: writeValue("uint32be", value) }
		},
		value: 0,
	};

	"control.remote_control_command_mode":    SolaredgeDataEntry = {
		descr: "0-7",
		unit:  "",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("uint16be", 1, tmd, 0xE00D) as number,
		writeRegister: (wd: SolaredgeWriteData) => {
			const value = typeof wd.value == "number" ? wd.value : 0
			return { register: 0xE00D, value: writeValue("uint16be", value) }
		},
		value: 0,
		states: {
			"0": "Off",
			"1": "Charge excess PV power only",
			"2": "Charge from PV first, before producing power to the AC",
			"3": "Charge from PV+AC according to the max battery power",
			"4": "Maximize export – discharge battery to meet max inverter AC limit",
			"5": "Discharge to meet loads consumption. Discharging to the grid is not allowed",
			"7": "Maximize self-consumption",
		}

	};

	"control.remote_control_charge_limit":    SolaredgeDataEntry = {
		descr: "0- Battery Max Power",
		unit:  "W",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("floatsw", 2, tmd, 0xE00E) as number,
		writeRegister: (wd: SolaredgeWriteData) => {
			const value = typeof wd.value == "number" ? wd.value : 0
			return { register: 0xE00E, value: writeValue("floatsw", value) }
		},
		value: 0,
	};


	"control.remote_control_dicharge_limit":    SolaredgeDataEntry = {
		descr: "0- Battery Max Power",
		unit:  "W",
		role:  "value",
		type: "number",
		readRegister:  (tmd: Buffer) =>  extractValue("floatsw", 2, tmd, 0xE010) as number,
		writeRegister: (wd: SolaredgeWriteData) => {
			const value = typeof wd.value == "number" ? wd.value : 0
			return { register: 0xE010, value: writeValue("floatsw", value) }
		},
		value: 0,
	};


	// "meter.1.M_Import_VARh_Q1":    SolaredgeDataEntry = {
	// 	descr: "Quadrant 1: Total Imported Reactive Energy",
	// 	unit:  "VARh",
	// 	role:  "value",
	// 	type: "number",
	// 	readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 40260) as number * Math.pow(10,extractValue("int16be", 1, tmd, 40292) as number),
	// 	value: 0,
	// };

	// "meter.1.M_Import_VARh_Q1A":    SolaredgeDataEntry = {
	// 	descr: "Phase A - Quadrant 1: Imported Reactive Energy",
	// 	unit:  "VARh",
	// 	role:  "value",
	// 	type: "number",
	// 	readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 40262) as number * Math.pow(10,extractValue("int16be", 1, tmd, 40292) as number),
	// 	value: 0,
	// };
	// "meter.1.M_Import_VARh_Q1B":    SolaredgeDataEntry = {
	// 	descr: "Phase B - Quadrant 1: Imported Reactive Energy",
	// 	unit:  "VARh",
	// 	role:  "value",
	// 	type: "number",
	// 	readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 40264) as number * Math.pow(10,extractValue("int16be", 1, tmd, 40292) as number),
	// 	value: 0,
	// };
	// "meter.1.M_Import_VARh_Q1C":    SolaredgeDataEntry = {
	// 	descr: "Phase C - Quadrant 1: Imported Reactive Energy",
	// 	unit:  "VARh",
	// 	role:  "value",
	// 	type: "number",
	// 	readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 40266) as number * Math.pow(10,extractValue("int16be", 1, tmd, 40292) as number),
	// 	value: 0,
	// };

	// "meter.1.M_Import_VARh_Q2":    SolaredgeDataEntry = {
	// 	descr: "Quadrant 2: Total Imported Reactive Energy",
	// 	unit:  "VARh",
	// 	role:  "value",
	// 	type: "number",
	// 	readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 40268) as number * Math.pow(10,extractValue("int16be", 1, tmd, 40292) as number),
	// 	value: 0,
	// };
	// "meter.1.M_Import_VARh_Q2A":    SolaredgeDataEntry = {
	// 	descr: "Phase A - Quadrant 2: Imported Reactive Energy",
	// 	unit:  "VARh",
	// 	role:  "value",
	// 	type: "number",
	// 	readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 40270) as number * Math.pow(10,extractValue("int16be", 1, tmd, 40292) as number),
	// 	value: 0,
	// };
	// "meter.1.M_Import_VARh_Q2B":    SolaredgeDataEntry = {
	// 	descr: "Phase B - Quadrant 2: Imported Reactive Energy",
	// 	unit:  "VARh",
	// 	role:  "value",
	// 	type: "number",
	// 	readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 40272) as number * Math.pow(10,extractValue("int16be", 1, tmd, 40292) as number),
	// 	value: 0,
	// };
	// "meter.1.M_Import_VARh_Q2C":    SolaredgeDataEntry = {
	// 	descr: "Phase C - Quadrant 2: Imported Reactive Energy",
	// 	unit:  "VARh",
	// 	role:  "value",
	// 	type: "number",
	// 	readRegister:  (tmd: Buffer) =>  extractValue("uint32be", 2, tmd, 40274) as number * Math.pow(10,extractValue("int16be", 1, tmd, 40292) as number),
	// 	value: 0,
	// };

}
