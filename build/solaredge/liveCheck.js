"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const solaredgeTCPModbus_1 = require("./solaredgeTCPModbus");
async function main() {
    var _a;
    const host = process.argv[2];
    const cycles = Number(process.argv[3] || 5);
    const port = Number(process.argv[4] || 1502);
    if (!host) {
        throw new Error("usage: ts-node liveCheck.ts <host> [cycles] [port]");
    }
    const log = {
        debug: () => undefined,
        info: (msg) => console.log("info:", msg),
        warn: (msg) => console.log("warn:", msg),
        error: (msg) => console.log("error:", msg),
    };
    const modbus = new solaredgeTCPModbus_1.SolaredgeTCPModbus(log);
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
    };
    // run auto detection first, exactly like a freshly configured instance
    try {
        const detected = await modbus.detectDevices(config);
        modbus.detectedDevices = detected;
        console.log(`detected: meters [${detected.meters.join(",")}], batteries [${detected.batteries.join(",")}]\n`);
    }
    catch (e) {
        console.log("detection failed:", e.message);
    }
    let failures = 0;
    for (let cycle = 1; cycle <= cycles; cycle++) {
        const t0 = Date.now();
        try {
            await modbus.readAndWrite(config);
            console.log(`cycle ${cycle}: ok in ${Date.now() - t0} ms, session held: ${modbus.isConnected()}`);
        }
        catch (e) {
            failures++;
            console.log(`cycle ${cycle}: FAILED ${e.message}, session held: ${modbus.isConnected()}`);
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
        console.log(`${id}\t${entry === null || entry === void 0 ? void 0 : entry.value}\t${(_a = entry === null || entry === void 0 ? void 0 : entry.unit) !== null && _a !== void 0 ? _a : ""}`);
    }
    modbus.close();
    console.log(`\n${cycles} cycles, ${failures} failures`);
    process.exit(failures > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
//# sourceMappingURL=liveCheck.js.map