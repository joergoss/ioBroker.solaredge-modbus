"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolaredgeModel = exports.SolaredgeModbusData = void 0;
const common_1 = require("./common");
const deviceSpecs_1 = require("./deviceSpecs");
/**
 * Battery lifetime counters are 64 bit values in reversed register order and
 * may contain the SunSpec "not implemented" marker. Returning null keeps the
 * state empty instead of showing ~1.8e19 Wh (issue #4).
 */
function readBatteryEnergyCounter(tmd, offset) {
    const raw = (0, common_1.extractBigUint64Sw)(tmd, offset);
    if (raw === common_1.NOT_IMPLEMENTED_UINT64) {
        return null;
    }
    return Number(raw);
}
// import { round, signedToInteger } from "./solaredgeUtil";
/** Builds the readRegister closure for one table entry at a device base address. */
function makeSpecReader(spec, base) {
    const offset = base + spec.offset;
    if (spec.notImplementedAsNull) {
        return (tmd) => readBatteryEnergyCounter(tmd, offset);
    }
    if (spec.scaleFactorOffset !== undefined) {
        const scaleFactorOffset = base + spec.scaleFactorOffset;
        return (tmd) => (0, common_1.extractValue)(spec.type, spec.len, tmd, offset) *
            Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, scaleFactorOffset));
    }
    return (tmd) => (0, common_1.extractValue)(spec.type, spec.len, tmd, offset);
}
function makeSpecEntry(spec, base, deviceLabel) {
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
class SolaredgeModbusData {
    constructor(hr, config) {
        this.hr = hr;
        this.config = config;
    }
}
exports.SolaredgeModbusData = SolaredgeModbusData;
class SolaredgeModel {
    constructor() {
        this["common.C_SunSpec_ID"] = {
            descr: "Value = 'SunS' (0x53756e53). Uniquely identifies this as a SunSpec MODBUS Map",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint32be", 2, tmd, 0) /* * tmd.scale.v */,
            value: 0,
        };
        this["common.C_SunSpec_DID"] = {
            descr: "Value = 0x0001. Uniquely identifies this as a SunSpec Common Model Block",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 2),
            value: 0,
        };
        this["common.C_SunSpec_Length"] = {
            descr: "65 = Length of block in 16-bit registers",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 3),
            value: 0,
        };
        this["common.C_Manufacturer"] = {
            descr: "Value Registered with SunSpec = 'SolarEdge'",
            unit: "",
            role: "value",
            type: "string",
            readRegister: (tmd) => (0, common_1.extractValue)("string", 16, tmd, 4),
            value: "",
        };
        this["common.C_Model"] = {
            descr: "SolarEdge Specific Value",
            unit: "",
            role: "value",
            type: "string",
            readRegister: (tmd) => (0, common_1.extractValue)("string", 16, tmd, 20),
            value: "",
        };
        this["common.C_Version"] = {
            descr: "SolarEdge Specific Value",
            unit: "",
            role: "value",
            type: "string",
            readRegister: (tmd) => (0, common_1.extractValue)("string", 8, tmd, 44),
            value: "",
        };
        this["common.C_SerialNumber"] = {
            descr: "SolarEdge Specific Value",
            unit: "",
            role: "value",
            type: "string",
            readRegister: (tmd) => (0, common_1.extractValue)("string", 8, tmd, 52),
            value: "",
        };
        this["common.C_DeviceAddress"] = {
            descr: "MODBUS Unit ID",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 68),
            value: 0,
        };
        this["ac.C_SunSpec_DID"] = {
            descr: "101 = single phase 102 = split phase 103 = three phase",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 69),
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
        this["ac.I_AC_Current"] = {
            descr: "AC Total Current value",
            unit: "A",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 71) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 75)),
            value: 0,
        };
        this["ac.I_AC_CurrentA"] = {
            descr: "AC Phase A Current value",
            unit: "A",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 72) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 75)),
            value: 0,
        };
        this["ac.I_AC_CurrentB"] = {
            descr: "AC Phase B Current value",
            unit: "A",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 73) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 75)),
            value: 0,
        };
        this["ac.I_AC_CurrentC"] = {
            descr: "AC Phase C Current value",
            unit: "A",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 74) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 75)),
            value: 0,
        };
        this["ac.I_AC_VoltageAB"] = {
            descr: "AC Voltage Phase AB value",
            unit: "V",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 76) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 82)),
            value: 0,
        };
        this["ac.I_AC_VoltageBC"] = {
            descr: "AC Voltage Phase BC value",
            unit: "V",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 77) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 82)),
            value: 0,
        };
        this["ac.I_AC_VoltageCA"] = {
            descr: "AC Voltage Phase CA value",
            unit: "V",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 78) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 82)),
            value: 0,
        };
        this["ac.I_AC_VoltageAN"] = {
            descr: "AC Voltage Phase A to N value",
            unit: "V",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 79) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 82)),
            value: 0,
        };
        this["ac.I_AC_VoltageBN"] = {
            descr: "AC Voltage Phase B to N value",
            unit: "V",
            role: "value",
            type: "number",
            readRegister: (tmd) => {
                // console.log("tmd", tmd)
                // console.log("tmd 79", tmd[79*2], tmd[79*2+1])
                // console.log("tmd 80", tmd[80*2], tmd[80*2+1])
                // console.log("tmd 81", tmd[81*2], tmd[81*2+1])
                // console.log("tmd 82", tmd[82*2], tmd[82*2+1])
                // console.log("scaling", extractValue("int16be", 1, tmd, 82))
                return (0, common_1.extractValue)("uint16be", 1, tmd, 80) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 82));
            },
            value: 0,
        };
        this["ac.I_AC_VoltageCN"] = {
            descr: "AC Voltage Phase C to N value",
            unit: "V",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 81) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 82)),
            value: 0,
        };
        this["ac.I_AC_Power"] = {
            descr: "AC Power value",
            unit: "W",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("int16be", 1, tmd, 83) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 84)),
            value: 0,
        };
        this["ac.I_AC_Frequency"] = {
            descr: "AC Frequency value",
            unit: "Hz",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 85) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 86)),
            value: 0,
        };
        this["ac.I_AC_VA"] = {
            descr: "Apparent Power",
            unit: "VA",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("int16be", 1, tmd, 87) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 88)),
            value: 0,
        };
        this["ac.I_AC_VAR"] = {
            descr: "Reactive Power",
            unit: "VAR",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("int16be", 1, tmd, 89) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 90)),
            value: 0,
        };
        this["ac.I_AC_PF"] = {
            descr: "Power Factor",
            unit: "%",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("int16be", 1, tmd, 91) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 92)),
            value: 0,
        };
        this["ac.I_AC_Energy_WH"] = {
            descr: "AC Lifetime Energy production",
            unit: "Wh",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint32be", 2, tmd, 93) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 95)),
            value: 0,
        };
        this["dc.I_DC_Current"] = {
            descr: "DC Current value",
            unit: "A",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 96) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 97)),
            value: 0,
        };
        this["dc.I_DC_Voltage"] = {
            descr: "DC Voltage value",
            unit: "V",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 98) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 99)),
            value: 0,
        };
        this["dc.I_DC_Power"] = {
            descr: "DC Power value",
            unit: "W",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("int16be", 1, tmd, 100) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 101)),
            value: 0,
        };
        this["state.I_Temp_Sink"] = {
            descr: "Heat Sink Temperature",
            unit: "°C",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("int16be", 1, tmd, 103) * Math.pow(10, (0, common_1.extractValue)("int16be", 1, tmd, 106)),
            value: 0,
        };
        this["state.I_Status"] = {
            descr: "Operating State",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 107),
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
        this["state.I_Status_Vendor"] = {
            descr: "Vendor-defined operating state and error codes. For error description, meaning and troubleshooting, refer to the SolarEdge Installation Guide.",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 108),
            value: 0,
        };
        /* ***************************************************************************************************** */
        this["control.storage_control_mode"] = {
            descr: "0-4",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 0xE004),
            writeRegister: (wd) => {
                const value = typeof wd.value == "number" ? wd.value : 0;
                return { register: 0xE004, value: (0, common_1.writeValue)("uint16be", value) };
            },
            value: 0,
            states: {
                "0": "Disabled",
                "1": "Maximize Self Consumption - meter required",
                "2": "Time of Use (Profile programming) - meter required",
                "3": "Backup Only",
                "4": "Remote Control"
            }
        };
        this["control.storage_ac_charge_policy"] = {
            descr: "0-3",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 0xE005),
            writeRegister: (wd) => {
                const value = typeof wd.value == "number" ? wd.value : 0;
                return { register: 0xE005, value: (0, common_1.writeValue)("uint16be", value) };
            },
            value: 0,
            states: {
                "0": "Disable",
                "1": "Always allowed",
                "2": "Fixed Energy Limit (for US regulation)",
                "3": "Percent of Production (for US regulation)",
            }
        };
        this["control.storage_ac_charge_limit"] = {
            descr: "0-Max_Float",
            unit: "KWh or %",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("floatsw", 2, tmd, 0xE006),
            writeRegister: (wd) => {
                const value = typeof wd.value == "number" ? wd.value : 0;
                return { register: 0xE006, value: (0, common_1.writeValue)("floatsw", value) };
            },
            value: 0,
        };
        this["control.storage_backup_reserved_setting"] = {
            descr: "0-100",
            unit: "%",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("floatsw", 2, tmd, 0xE008),
            writeRegister: (wd) => {
                const value = typeof wd.value == "number" ? wd.value : 0;
                return { register: 0xE008, value: (0, common_1.writeValue)("floatsw", value) };
            },
            value: 0,
        };
        this["control.storage_charge_discharge_default_mode"] = {
            descr: "0-7",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 0xE00A),
            writeRegister: (wd) => {
                const value = typeof wd.value == "number" ? wd.value : 0;
                return { register: 0xE00A, value: (0, common_1.writeValue)("uint16be", value) };
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
        this["control.remote_control_command_timeout"] = {
            descr: "0-86400(24h)",
            unit: "s",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint32be", 2, tmd, 0xE00B),
            writeRegister: (wd) => {
                const value = typeof wd.value == "number" ? wd.value : 0;
                return { register: 0xE00B, value: (0, common_1.writeValue)("uint32be", value) };
            },
            value: 0,
        };
        this["control.remote_control_command_mode"] = {
            descr: "0-7",
            unit: "",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("uint16be", 1, tmd, 0xE00D),
            writeRegister: (wd) => {
                const value = typeof wd.value == "number" ? wd.value : 0;
                return { register: 0xE00D, value: (0, common_1.writeValue)("uint16be", value) };
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
        this["control.remote_control_charge_limit"] = {
            descr: "0- Battery Max Power",
            unit: "W",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("floatsw", 2, tmd, 0xE00E),
            writeRegister: (wd) => {
                const value = typeof wd.value == "number" ? wd.value : 0;
                return { register: 0xE00E, value: (0, common_1.writeValue)("floatsw", value) };
            },
            value: 0,
        };
        this["control.remote_control_dicharge_limit"] = {
            descr: "0- Battery Max Power",
            unit: "W",
            role: "value",
            type: "number",
            readRegister: (tmd) => (0, common_1.extractValue)("floatsw", 2, tmd, 0xE010),
            writeRegister: (wd) => {
                const value = typeof wd.value == "number" ? wd.value : 0;
                return { register: 0xE010, value: (0, common_1.writeValue)("floatsw", value) };
            },
            value: 0,
        };
        // Meters are created from one table per supported base address.
        deviceSpecs_1.METER_BASE_ADDRESSES.forEach((base, index) => {
            const meterNumber = index + 1;
            for (const spec of deviceSpecs_1.METER_SPECS) {
                this[`meter.${meterNumber}.${spec.name}`] = makeSpecEntry(spec, base, `Meter ${meterNumber}`);
            }
        });
        // Battery 1 keeps its historical ids without a number, so existing
        // installations, scripts and history adapters keep working unchanged.
        // Battery 2 is added as "battery.2.*".
        deviceSpecs_1.BATTERY_BASE_ADDRESSES.forEach((base, index) => {
            const batteryNumber = index + 1;
            for (const spec of deviceSpecs_1.BATTERY_SPECS) {
                const id = batteryNumber === 1 ? `battery.${spec.name}` : `battery.${batteryNumber}.${spec.name}`;
                this[id] = makeSpecEntry(spec, base, `Battery ${batteryNumber}`);
            }
        });
    }
}
exports.SolaredgeModel = SolaredgeModel;
//# sourceMappingURL=solaredgeModel.js.map