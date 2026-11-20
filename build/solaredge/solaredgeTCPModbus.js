"use strict";
// Solaredge MODBUS
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolaredgeTCPModbus = exports.RequestTimeoutError = void 0;
const net = __importStar(require("net"));
const solaredgeModel_1 = require("./solaredgeModel");
const connectionPolicy_1 = require("./connectionPolicy");
const pollPlan_1 = require("./pollPlan");
const common_1 = require("./common");
const deviceDetection_1 = require("./deviceDetection");
const deviceSpecs_1 = require("./deviceSpecs");
/* eslint-disable @typescript-eslint/no-require-imports */
// create a tcp modbus client (jsmodbus ships no type definitions)
const modbus = require("jsmodbus");
/** A single modbus request did not answer within the configured timeout. */
class RequestTimeoutError extends Error {
    constructor(block, timeoutMs) {
        super(`modbus request timeout after ${timeoutMs} ms in block ${block}`);
        this.name = "RequestTimeoutError";
    }
}
exports.RequestTimeoutError = RequestTimeoutError;
class SolaredgeTCPModbus {
    constructor(log) {
        this.bufferSize = 0xFFFF;
        this.buf = Buffer.alloc(this.bufferSize * 2);
        /** When enabled, every polled block is logged as raw hex for bug reports. */
        this.logRawRegisters = false;
        this.SolaredgeData = new solaredgeModel_1.SolaredgeModel();
        this.sendHoldingRegisterQueue = [];
        this.sendCoilQueue = [];
        this.lastConnectedTimestamp = 0;
        this.connectionErrorCounter = 0;
        this.log = log;
        this.log.debug("solaredgeTCPModbus constructor");
    }
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async updateSolaredgeData(hr) {
        const tmd = hr;
        for (const [name, value] of Object.entries(this.SolaredgeData)) {
            const v = value;
            if (typeof v.readRegister === "function") {
                v.valueOld = v.value;
                try {
                    v.value = v.readRegister(tmd);
                    // Never push Infinity/NaN or the SunSpec "not implemented" marker
                    // into ioBroker as if it were a measurement. Null also avoids the
                    // NaN !== NaN rewrite on every single cycle.
                    if (typeof v.value === "number" && (0, common_1.isUnavailableNumber)(v.value)) {
                        v.value = null;
                    }
                }
                catch (Exception) {
                    this.log.error("updateSolaredgeData ERROR '" + name + "'" + JSON.stringify(v) + " Exception: " + JSON.stringify(Exception));
                }
            }
        }
    }
    async readAndWrite(adapterConfig) {
        const config = (0, connectionPolicy_1.withConnectionDefaults)(adapterConfig);
        this.logRawRegisters = adapterConfig.log_raw_registers === true;
        const client = await this.ensureConnected(config);
        while (this.sendHoldingRegisterQueue.length > 0) {
            // FIFO, not pop(): queued control commands must keep their order,
            // otherwise e.g. a later limit is applied before an earlier mode.
            const item = this.sendHoldingRegisterQueue.shift();
            this.log.debug("request writeMultipleRegisters " + JSON.stringify(item));
            const response = await this.withTimeout(client.writeMultipleRegisters(item === null || item === void 0 ? void 0 : item.register, item === null || item === void 0 ? void 0 : item.value), "write", config.connection_timeout);
            this.log.debug("response writeMultipleRegisters " + JSON.stringify(response));
            await this.sleep(config.com_wait_pause);
        }
        const planOptions = { ...adapterConfig };
        const detected = this.detectedDevices;
        if (detected) {
            planOptions.meter_slots = detected.meters;
            planOptions.battery_slots = detected.batteries;
        }
        for (const block of (0, pollPlan_1.buildPollPlan)(planOptions)) {
            try {
                await this.readHoldingRegisterBlock(client, block, config.connection_timeout);
            }
            catch (e) {
                // A timeout or a broken connection invalidates the whole session:
                // drop it so the next cycle reconnects, and let mainLoop apply
                // its throttled logging and backoff.
                if (e instanceof RequestTimeoutError) {
                    this.close();
                    throw e;
                }
                // jsmodbus failures for a single block (e.g. a modbus exception
                // for an area this firmware does not implement) must not abort
                // the remaining blocks of the cycle.
                this.log.warn(`skipping block ${block.label}: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
                continue;
            }
            await this.sleep(config.com_wait_pause);
        }
        await this.updateSolaredgeData(this.buf);
    }
    /**
     * Reads the identification block of every possible slot and decides which
     * devices really exist. Only reads; never writes. Detection runs once at
     * startup - after changing the wiring, restart the instance.
     */
    async detectDevices(adapterConfig) {
        const config = (0, connectionPolicy_1.withConnectionDefaults)(adapterConfig);
        const client = await this.ensureConnected(config);
        const detected = { meters: [], batteries: [] };
        const batterySerials = new Set();
        for (let slot = 1; slot <= deviceSpecs_1.BATTERY_BASE_ADDRESSES.length; slot++) {
            const base = deviceSpecs_1.BATTERY_BASE_ADDRESSES[slot - 1];
            try {
                await this.readHoldingRegisterBlock(client, { start: base, length: deviceDetection_1.IDENTIFICATION_BLOCK_LENGTH, label: `detect-battery${slot}` }, config.connection_timeout);
                const identity = (0, deviceDetection_1.readBatteryIdentity)(this.buf, slot);
                const result = (0, deviceDetection_1.evaluateBattery)(identity, batterySerials);
                if (result.present) {
                    detected.batteries.push(slot);
                    batterySerials.add(identity.serialNumber.trim());
                    this.log.info(`battery ${slot} detected: ${result.reason}`);
                }
                else {
                    this.log.info(`no battery at slot ${slot}: ${result.reason}`);
                }
            }
            catch (e) {
                if (e instanceof RequestTimeoutError) {
                    this.close();
                    throw e;
                }
                this.log.info(`battery slot ${slot} not readable, treating as absent: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
            }
            await this.sleep(config.com_wait_pause);
        }
        for (let slot = 1; slot <= deviceSpecs_1.METER_BASE_ADDRESSES.length; slot++) {
            const base = deviceSpecs_1.METER_BASE_ADDRESSES[slot - 1];
            try {
                await this.readHoldingRegisterBlock(client, { start: base, length: deviceDetection_1.IDENTIFICATION_BLOCK_LENGTH, label: `detect-meter${slot}` }, config.connection_timeout);
                const identity = (0, deviceDetection_1.readMeterIdentity)(this.buf, slot);
                const result = (0, deviceDetection_1.evaluateMeter)(identity);
                if (result.present) {
                    detected.meters.push(slot);
                    this.log.info(`meter ${slot} detected: ${result.reason}`);
                }
                else {
                    this.log.info(`no meter at slot ${slot}: ${result.reason}`);
                }
            }
            catch (e) {
                if (e instanceof RequestTimeoutError) {
                    this.close();
                    throw e;
                }
                this.log.info(`meter slot ${slot} not readable, treating as absent: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
            }
            await this.sleep(config.com_wait_pause);
        }
        return detected;
    }
    debugBuffer() {
        this.log.debug("SolaredgeHoldingRegister debugBuffer " + JSON.stringify(this.buf));
    }
    /**
     * Returns the existing client or opens a new connection. The socket is
     * reused until it breaks or the adapter shuts down.
     */
    async ensureConnected(config) {
        if (this.client && this.socket && !this.socket.destroyed) {
            return this.client;
        }
        await this.openConnection(config);
        return this.client;
    }
    openConnection(config) {
        return new Promise((resolve, reject) => {
            const netSocket = new net.Socket();
            this.socket = netSocket;
            this.client = new modbus.client.TCP(netSocket, config.unitId);
            let settled = false;
            let timeoutRef = undefined;
            const clearConnectionTimeout = () => {
                const timer = timeoutRef;
                if (timer !== undefined) {
                    clearTimeout(timer);
                    timeoutRef = undefined;
                }
            };
            const fail = (reason) => {
                if (settled)
                    return;
                settled = true;
                clearConnectionTimeout();
                this.close();
                reject(reason);
            };
            timeoutRef = setTimeout(() => {
                fail(new Error(`Connection timeout after ${config.connection_timeout} ms (${config.hostname}:${config.port})`));
            }, config.connection_timeout);
            // If the peer drops the session later on, just forget the client.
            // The next poll cycle will reconnect; no unhandled rejection here.
            netSocket.on("error", (err) => {
                this.log.debug(`socket error: ${err.message}`);
                if (!settled) {
                    fail(err);
                }
                else {
                    this.close();
                }
            });
            netSocket.on("close", () => {
                if (this.socket === netSocket) {
                    this.socket = undefined;
                    this.client = undefined;
                }
            });
            netSocket.on("timeout", () => {
                this.log.debug("socket idle timeout, closing connection");
                this.close();
            });
            netSocket.on("connect", () => {
                if (settled)
                    return;
                settled = true;
                clearConnectionTimeout();
                this.lastConnectedTimestamp = Date.now();
                this.log.debug(`connected to ${config.hostname}:${config.port} (unit ${config.unitId})`);
                resolve();
            });
            // No socket idle timeout here on purpose: it would close the
            // persistent session between two poll cycles. The connect timer and
            // the per-request timeout in withTimeout() cover both hang cases.
            netSocket.connect({
                "host": config.hostname,
                "port": config.port,
            });
        });
    }
    /** Bounds a single modbus request; an unanswered request hangs otherwise. */
    async withTimeout(request, label, timeoutMs) {
        let timer = undefined;
        try {
            return await Promise.race([
                request,
                new Promise((_resolve, reject) => {
                    timer = setTimeout(() => reject(new RequestTimeoutError(label, timeoutMs)), timeoutMs);
                }),
            ]);
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
        }
    }
    async readHoldingRegisterBlock(client, block, timeoutMs) {
        const response = await this.withTimeout(client.readHoldingRegisters(block.start, block.length), block.label, timeoutMs);
        const b = Buffer.from(response.response._body._valuesAsBuffer);
        b.copy(this.buf, block.start * 2);
        // proof of life for the watchdog, on every successful block
        this.lastConnectedTimestamp = Date.now();
        if (this.logRawRegisters) {
            // One copyable line per block: register range plus the exact bytes as
            // they arrived. Users can paste this into a bug report (issues #4/#5).
            this.log.info(`raw registers ${block.label} 0x${block.start.toString(16)}..0x${(block.start + block.length - 1).toString(16)} (${block.length} registers): ${b.toString("hex")}`);
        }
    }
    /**
     * Closes the connection and forgets the client. Safe to call repeatedly.
     * The next poll cycle transparently opens a fresh connection.
     */
    close() {
        const socket = this.socket;
        this.socket = undefined;
        this.client = undefined;
        if (socket) {
            socket.removeAllListeners();
            socket.destroy();
        }
    }
    /** Test/inspection helper: whether a persistent session is currently held. */
    isConnected() {
        return !!(this.socket && !this.socket.destroyed && this.client);
    }
}
exports.SolaredgeTCPModbus = SolaredgeTCPModbus;
//# sourceMappingURL=solaredgeTCPModbus.js.map