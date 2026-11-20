/**
 * Table driven register definitions for SolarEdge meters and batteries.
 *
 * Generated from the previous hand written model entries, so the decoding of
 * meter 1 and battery 1 is unchanged. The same table is instantiated per
 * device base address, which adds meter 2/3 and battery 2 without copying
 * dozens of nearly identical definitions.
 *
 * All offsets are relative to the base address of the device. Register types
 * follow extractValue() in common.ts; the battery block uses reversed word
 * order for multi register values ("floatsw" / "uint64sw").
 */

export interface RegisterSpec {
	/** state id suffix, e.g. "M_AC_Power" */
	name: string;
	descr: string;
	unit: string;
	/** extractValue() register type */
	type: string;
	/** length in 16 bit registers */
	len: number;
	/** register offset relative to the device base address */
	offset: number;
	/** relative offset of the signed SunSpec scale factor register, if any */
	scaleFactorOffset?: number;
	/** return null for the SunSpec "not implemented" marker (battery counters) */
	notImplementedAsNull?: boolean;
	/** optional value to text mapping shown by ioBroker (numeric value is kept) */
	states?: { [key: string]: string };
}

/**
 * SolarEdge battery status, from the maintained solaredge-modbus-multi mapping.
 * Note that 6 is "Preserve Charge" and 7 is "Idle" - older references swap or
 * omit these. 10 is "Power Saving", which is what a real BYD system reports at
 * night (verified against the live capture).
 */
export const BATTERY_STATUS_STATES: { [key: string]: string } = {
	"0": "Off",
	"1": "Standby",
	"2": "Initializing",
	"3": "Charge",
	"4": "Discharge",
	"5": "Fault",
	"6": "Preserve Charge",
	"7": "Idle",
	"10": "Power Saving",
};

/** Meter 1/2/3 base addresses (protocol addresses, as polled). */
export const METER_BASE_ADDRESSES = [40123, 40123 + 0xae, 40123 + 0x15c];

/** Battery 1/2 base addresses. */
export const BATTERY_BASE_ADDRESSES = [0xE100, 0xE100 + 0x100];

export const METER_SPECS: RegisterSpec[] = [
	{ name: "C_Manufacturer", descr: "Meter manufacturer", unit: "", type: "string", len: 32, offset: 0 },
	{ name: "C_Model", descr: "Meter model", unit: "", type: "string", len: 32, offset: 16 },
	{ name: "M_AC_Current", descr: "AC Current (sum of active phases)", unit: "A", type: "int16be", len: 1, offset: 67, scaleFactorOffset: 71 },
	{ name: "M_AC_Current_A", descr: "Phase A AC Current", unit: "A", type: "int16be", len: 1, offset: 68, scaleFactorOffset: 71 },
	{ name: "M_AC_Current_B", descr: "Phase B AC Current", unit: "A", type: "int16be", len: 1, offset: 69, scaleFactorOffset: 71 },
	{ name: "M_AC_Current_C", descr: "Phase C AC Current", unit: "A", type: "int16be", len: 1, offset: 70, scaleFactorOffset: 71 },
	{ name: "M_AC_Voltage_L_N", descr: "Line to Neutral AC Voltage (average of active phases)", unit: "V", type: "int16be", len: 1, offset: 72, scaleFactorOffset: 80 },
	{ name: "M_AC_Voltage_A_N", descr: "Phase A to Neutral AC Voltage", unit: "V", type: "int16be", len: 1, offset: 73, scaleFactorOffset: 80 },
	{ name: "M_AC_Voltage_B_N", descr: "Phase B to Neutral AC Voltage", unit: "V", type: "int16be", len: 1, offset: 74, scaleFactorOffset: 80 },
	{ name: "M_AC_Voltage_C_N", descr: "Phase C to Neutral AC Voltage", unit: "V", type: "int16be", len: 1, offset: 75, scaleFactorOffset: 80 },
	{ name: "M_AC_Voltage_L_L", descr: "Line to Line AC Voltage (average of active phases)", unit: "V", type: "int16be", len: 1, offset: 76, scaleFactorOffset: 80 },
	{ name: "M_AC_Voltage_A_B", descr: "Phase A to Phase B AC Voltage", unit: "V", type: "int16be", len: 1, offset: 77, scaleFactorOffset: 80 },
	{ name: "M_AC_Voltage_B_C", descr: "Phase B to Phase C AC Voltage", unit: "V", type: "int16be", len: 1, offset: 78, scaleFactorOffset: 80 },
	{ name: "M_AC_Voltage_C_A", descr: "Phase C to Phase A AC Voltage", unit: "V", type: "int16be", len: 1, offset: 79, scaleFactorOffset: 80 },
	{ name: "M_AC_Freq", descr: "AC Frequency", unit: "Hz", type: "int16be", len: 1, offset: 81, scaleFactorOffset: 82 },
	{ name: "M_AC_Power", descr: "Total Real Power (sum of active phases)", unit: "W", type: "int16be", len: 1, offset: 83, scaleFactorOffset: 87 },
	{ name: "M_AC_Power_A", descr: "Phase A AC Real Power", unit: "W", type: "int16be", len: 1, offset: 84, scaleFactorOffset: 87 },
	{ name: "M_AC_Power_B", descr: "Phase B AC Real Power", unit: "W", type: "int16be", len: 1, offset: 85, scaleFactorOffset: 87 },
	{ name: "M_AC_Power_C", descr: "Phase C AC Real Power", unit: "W", type: "int16be", len: 1, offset: 86, scaleFactorOffset: 87 },
	{ name: "M_AC_VA", descr: "Total AC Apparent Power (sum of active phases)", unit: "VA", type: "int16be", len: 1, offset: 88, scaleFactorOffset: 92 },
	{ name: "M_AC_VA_A", descr: "Phase A AC Apparent Power", unit: "VA", type: "int16be", len: 1, offset: 89, scaleFactorOffset: 92 },
	{ name: "M_AC_VA_B", descr: "Phase B AC Apparent Power", unit: "VA", type: "int16be", len: 1, offset: 90, scaleFactorOffset: 92 },
	{ name: "M_AC_VA_C", descr: "Phase C AC Apparent Power", unit: "VA", type: "int16be", len: 1, offset: 91, scaleFactorOffset: 92 },
	{ name: "M_AC_VAR", descr: "Total AC Reactive Power (sum of active phases)", unit: "VAR", type: "int16be", len: 1, offset: 93, scaleFactorOffset: 97 },
	{ name: "M_AC_VAR_A", descr: "Phase A AC Reactive Power", unit: "VAR", type: "int16be", len: 1, offset: 94, scaleFactorOffset: 97 },
	{ name: "M_AC_VAR_B", descr: "Phase B AC Reactive Power", unit: "VAR", type: "int16be", len: 1, offset: 95, scaleFactorOffset: 97 },
	{ name: "M_AC_VAR_C", descr: "Phase C AC Reactive Power", unit: "VAR", type: "int16be", len: 1, offset: 96, scaleFactorOffset: 97 },
	{ name: "M_AC_PF", descr: "Average Power Factor (average of active phases)", unit: "%", type: "int16be", len: 1, offset: 98, scaleFactorOffset: 102 },
	{ name: "M_AC_PF_A", descr: "Phase A Power Factor", unit: "%", type: "int16be", len: 1, offset: 99, scaleFactorOffset: 102 },
	{ name: "M_AC_PF_B", descr: "Phase A Power Factor", unit: "%", type: "int16be", len: 1, offset: 100, scaleFactorOffset: 102 },
	{ name: "M_AC_PF_C", descr: "Phase A Power Factor", unit: "%", type: "int16be", len: 1, offset: 101, scaleFactorOffset: 102 },
	{ name: "M_Exported", descr: "Total Exported Real Energy", unit: "Wh", type: "uint32be", len: 2, offset: 103, scaleFactorOffset: 119 },
	{ name: "M_Exported_A", descr: "Phase A Exported Real Energy", unit: "Wh", type: "uint32be", len: 2, offset: 105, scaleFactorOffset: 119 },
	{ name: "M_Exported_B", descr: "Phase B Exported Real Energy", unit: "Wh", type: "uint32be", len: 2, offset: 107, scaleFactorOffset: 119 },
	{ name: "M_Exported_C", descr: "Phase C Exported Real Energy", unit: "Wh", type: "uint32be", len: 2, offset: 109, scaleFactorOffset: 119 },
	{ name: "M_Imported", descr: "Total Imported Real Energy", unit: "Wh", type: "uint32be", len: 2, offset: 111, scaleFactorOffset: 119 },
	{ name: "M_Imported_A", descr: "Phase A Imported Real Energy", unit: "Wh", type: "uint32be", len: 2, offset: 113, scaleFactorOffset: 119 },
	{ name: "M_Imported_B", descr: "Phase B Imported Real Energy", unit: "Wh", type: "uint32be", len: 2, offset: 115, scaleFactorOffset: 119 },
	{ name: "M_Imported_C", descr: "Phase C Imported Real Energy", unit: "Wh", type: "uint32be", len: 2, offset: 117, scaleFactorOffset: 119 },
	{ name: "M_Exported_VA", descr: "Total Exported Apparent Energy", unit: "VAh", type: "uint32be", len: 2, offset: 120, scaleFactorOffset: 136 },
	{ name: "M_Exported_VA_A", descr: "Phase A Exported Apparent Energy", unit: "VAh", type: "uint32be", len: 2, offset: 122, scaleFactorOffset: 136 },
	{ name: "M_Exported_VA_B", descr: "Phase B Exported Apparent Energy", unit: "VAh", type: "uint32be", len: 2, offset: 124, scaleFactorOffset: 136 },
	{ name: "M_Exported_VA_C", descr: "Phase C Exported Apparent Energy", unit: "VAh", type: "uint32be", len: 2, offset: 126, scaleFactorOffset: 136 },
	{ name: "M_Imported_VA", descr: "Total Imported Apparent Energy", unit: "VAh", type: "uint32be", len: 2, offset: 128, scaleFactorOffset: 136 },
	{ name: "M_Imported_VA_A", descr: "Phase A Imported Apparent Energy", unit: "VAh", type: "uint32be", len: 2, offset: 130, scaleFactorOffset: 136 },
	{ name: "M_Imported_VA_B", descr: "Phase B Imported Apparent Energy", unit: "VAh", type: "uint32be", len: 2, offset: 132, scaleFactorOffset: 136 },
	{ name: "M_Imported_VA_C", descr: "Phase C Imported Apparent Energy", unit: "VAh", type: "uint32be", len: 2, offset: 134, scaleFactorOffset: 136 },
	{ name: "M_Events", descr: "See M_EVENT_ flags. 0 = nts.", unit: "", type: "uint32be", len: 2, offset: 170 },
];

export const BATTERY_SPECS: RegisterSpec[] = [
	{ name: "manufacturer_name", descr: "Battery 1 Manufacturer Name", unit: "", type: "string", len: 16, offset: 0 },
	{ name: "model", descr: "Battery 1 Model", unit: "", type: "string", len: 16, offset: 16 },
	{ name: "firmware_version", descr: "Battery 1 Firmware Version", unit: "", type: "string", len: 16, offset: 32 },
	{ name: "serial_number", descr: "Battery 1 Serial Number", unit: "", type: "string", len: 16, offset: 48 },
	{ name: "device_id", descr: "Battery 1 Device ID", unit: "", type: "uint16be", len: 1, offset: 64 },
	{ name: "rated_energy", descr: "Battery 1 Rated Energy", unit: "Wh", type: "floatsw", len: 2, offset: 66 },
	{ name: "charge_continues_power", descr: "Battery 1 Max Charge Continues Power", unit: "W", type: "floatsw", len: 2, offset: 68 },
	{ name: "discharge_continues_power", descr: "Battery 1 Max Discharge Continues Power", unit: "W", type: "floatsw", len: 2, offset: 70 },
	{ name: "charge_peak_power", descr: "Battery 1 Max Charge Peak Power", unit: "W", type: "floatsw", len: 2, offset: 72 },
	{ name: "discharge_peak_power", descr: "Battery 1 Max Discharge Peak Power", unit: "W", type: "floatsw", len: 2, offset: 74 },
	{ name: "average_temperature", descr: "Battery 1 Average Temperature", unit: "°C", type: "floatsw", len: 2, offset: 108 },
	{ name: "max_temperature", descr: "Battery 1 Max Temperature", unit: "°C", type: "floatsw", len: 2, offset: 110 },
	{ name: "instantaneous_voltage", descr: "Battery 1 Instantaneous Voltage", unit: "V", type: "floatsw", len: 2, offset: 112 },
	{ name: "instantaneous_current", descr: "Battery 1 Instantaneous Current", unit: "A", type: "floatsw", len: 2, offset: 114 },
	{ name: "instantaneous_power", descr: "Battery 1 Instantaneous Power", unit: "W", type: "floatsw", len: 2, offset: 116 },
	// Note: on BYD and LG batteries SolarEdge does not provide reliable lifetime
	// counters at all (see issue #10). Decoding is correct, the source is not.
	{ name: "lifetime_export_energy_counter", descr: "Battery 1 Lifetime Export Energy Counter (unreliable on BYD/LG, see README)", unit: "Wh", type: "uint64sw", len: 4, offset: 118, notImplementedAsNull: true },
	{ name: "lifetime_import_energy_counter", descr: "Battery 1 Lifetime Import Energy Counter (unreliable on BYD/LG, see README)", unit: "Wh", type: "uint64sw", len: 4, offset: 122, notImplementedAsNull: true },
	{ name: "max_energy", descr: "Battery 1 Max Energy", unit: "Wh", type: "floatsw", len: 2, offset: 126 },
	{ name: "available_energy", descr: "Battery 1 Available Energy", unit: "Wh", type: "floatsw", len: 2, offset: 128 },
	{ name: "SOH", descr: "Battery 1 State of Health (SOH)", unit: "", type: "floatsw", len: 2, offset: 130 },
	{ name: "SOE", descr: "Battery 1 State of Energy (SOE)", unit: "", type: "floatsw", len: 2, offset: 132 },
	// Verified against a real capture: raw registers [0x000A, 0x0000] are status
	// 10, not 655360 - the battery block needs word swap here too (issue #4).
	{ name: "status", descr: "Battery 1 Status", unit: "", type: "uint32sw", len: 2, offset: 134, states: BATTERY_STATUS_STATES },
	{ name: "status_internal", descr: "Battery 1 Status Internal", unit: "", type: "uint32sw", len: 2, offset: 136 },
];
