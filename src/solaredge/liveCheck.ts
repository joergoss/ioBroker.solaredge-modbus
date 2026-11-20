/**
 * Developer tool: runs the real connection class against a real inverter,
 * without ioBroker. Only reads; never writes to the device.
 *
 * IMPORTANT: stop any other modbus client (including a running adapter
 * instance) first - the inverter serves only one tcp session.
 *
 * usage: npx ts-node src/solaredge/liveCheck.ts <host> [cycles] [port]
 */
// pulls in the global AdapterConfig augmentation when run standalone via ts-node
import type {} from "../lib/adapter-config";
import { SolaredgeTCPModbus } from "./solaredgeTCPModbus";

async function main(): Promise<void> {
	const host = process.argv[2];
	const cycles = Number(process.argv[3] || 5);
	const port = Number(process.argv[4] || 1502);
	if (!host) {
		throw new Error("usage: ts-node liveCheck.ts <host> [cycles] [port]");
	}

	const log = {
		debug: () => undefined,
		info: (msg: string) => console.log("info:", msg),
		warn: (msg: string) => console.log("warn:", msg),
		error: (msg: string) => console.log("error:", msg),
	} as unknown as ioBroker.Logger;

	const modbus = new SolaredgeTCPModbus(log);
	const config = {
		hostname: host,
		port,
		unitId: 1,
		com_wait_pause: 200,
		main_loop_pause: 1000,
		connection_timeout: 5000,
		log_raw_registers: false,
		meter_count: 1,
		battery_count: 1,
		max_register_block_size: 0,
		read_power_control: true,
	} as ioBroker.AdapterConfig;

	// run auto detection first, exactly like a freshly configured instance
	try {
		const detected = await modbus.detectDevices(config);
		modbus.detectedDevices = detected;
		console.log(`detected: meters [${detected.meters.join(",")}], batteries [${detected.batteries.join(",")}]\n`);
	} catch (e) {
		console.log("detection failed:", (e as Error).message);
	}

	let failures = 0;
	for (let cycle = 1; cycle <= cycles; cycle++) {
		const t0 = Date.now();
		try {
			await modbus.readAndWrite(config);
			console.log(`cycle ${cycle}: ok in ${Date.now() - t0} ms, session held: ${modbus.isConnected()}`);
		} catch (e) {
			failures++;
			console.log(`cycle ${cycle}: FAILED ${(e as Error).message}, session held: ${modbus.isConnected()}`);
		}
		await new Promise(r => setTimeout(r, 1000));
	}

	console.log("\n--- decoded values from the last cycle ---");
	for (const id of [
		"common.C_Manufacturer", "common.C_Model",
		"ac.I_AC_Power", "ac.I_AC_Energy_WH", "state.I_Status",
		"battery.model", "battery.SOE", "battery.SOH", "battery.status",
		"battery.lifetime_export_energy_counter", "battery.lifetime_import_energy_counter",
		"powercontrol.rrcr_state", "powercontrol.active_power_limit", "powercontrol.cosphi",
	]) {
		const entry = modbus.SolaredgeData[id];
		console.log(`${id}\t${entry?.value}\t${entry?.unit ?? ""}`);
	}

	modbus.close();
	console.log(`\n${cycles} cycles, ${failures} failures`);
	process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
