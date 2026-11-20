"use strict";
// Solaredge MODBUS
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolaredgeTCPModbus = void 0;
const net = __importStar(require("net"));
const solaredgeModel_1 = require("./solaredgeModel");
const connectionPolicy_1 = require("./connectionPolicy");
/* eslint-disable @typescript-eslint/no-var-requires */
// create a tcp modbus client (jsmodbus ships no type definitions)
const modbus = require("jsmodbus");
class SolaredgeTCPModbus {
    constructor(log) {
        this.bufferSize = 0xFFFF;
        this.buf = Buffer.alloc(this.bufferSize * 2);
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
                }
                catch (Exception) {
                    this.log.error("updateSolaredgeData ERROR '" + name + "'" + JSON.stringify(v) + " Exception: " + JSON.stringify(Exception));
                }
            }
        }
    }
    async readAndWrite(adapterConfig) {
        const config = (0, connectionPolicy_1.withConnectionDefaults)(adapterConfig);
        await this.connect(config, async (client) => {
            while (this.sendHoldingRegisterQueue.length > 0) {
                const item = this.sendHoldingRegisterQueue.pop();
                this.log.debug("request writeSingleRegister " + JSON.stringify(item));
                const response = await client.writeMultipleRegisters(item === null || item === void 0 ? void 0 : item.register, item === null || item === void 0 ? void 0 : item.value);
                this.log.debug("response writeSingleRegister " + JSON.stringify(response));
                await this.sleep(config.com_wait_pause);
            }
            await this.readHoldingRegisterBlock(client, 0, 111); // sun-spec block
            await this.sleep(config.com_wait_pause);
            await this.readHoldingRegisterBlock(client, 0xE004, 0xE012 - 0xE004); // control block
            await this.sleep(config.com_wait_pause);
            await this.readHoldingRegisterBlock(client, 0xE100, 0xE16C - 0xE100); // battery1 block1
            await this.sleep(config.com_wait_pause);
            await this.readHoldingRegisterBlock(client, 0xE16C, 0xE19A - 0xE16C); // battery1 block2
            await this.sleep(config.com_wait_pause);
            await this.readHoldingRegisterBlock(client, 40123, 40226 - 40123); // meter 1 block1
            await this.sleep(config.com_wait_pause);
            await this.readHoldingRegisterBlock(client, 40227, 40294 - 40227); // meter 1 block2
            await this.sleep(config.com_wait_pause);
            await this.updateSolaredgeData(this.buf);
        });
    }
    debugBuffer() {
        this.log.debug("SolaredgeHoldingRegister debugBuffer " + JSON.stringify(this.buf));
    }
    async readHoldingRegisterBlock(client, start, end) {
        const block = await client.readHoldingRegisters(start, end);
        const b = Buffer.from(block.response._body._valuesAsBuffer);
        b.copy(this.buf, start * 2);
    }
    /**
     * Closes an open connection. Safe to call repeatedly and from onUnload.
     * Previously sockets were left half open on errors and timeouts, which
     * accumulated over the poll cycles (issue #2).
     */
    close() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = undefined;
        }
    }
    async connect(config, callback) {
        return new Promise((resolve, reject) => {
            // A socket can report "error", "timeout" and "close" for the same
            // failure. Settle the promise exactly once and always clean up.
            let settled = false;
            const netSocket = new net.Socket();
            this.socket = netSocket;
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
            try {
                // create a modbus client
                const client = new modbus.client.TCP(netSocket, config.unitId);
                netSocket.on("connect", async () => {
                    try {
                        this.lastConnectedTimestamp = Date.now();
                        clearConnectionTimeout();
                        await callback(client);
                        if (settled)
                            return;
                        settled = true;
                        clearConnectionTimeout();
                        this.close();
                        resolve(this.SolaredgeData);
                    }
                    catch (Exception) {
                        fail(Exception);
                    }
                });
                netSocket.on("timeout", () => {
                    fail(new Error(`Socket timeout after ${config.connection_timeout} ms (${config.hostname}:${config.port})`));
                });
                netSocket.on("error", (err) => {
                    fail(err);
                });
                netSocket.on("close", () => {
                    // Also fires when the inverter drops the connection mid cycle.
                    // Ignored once the promise is already settled.
                    fail(new Error("Connection closed before the poll cycle finished"));
                });
                // "timeout" is not a connect() option: set it on the socket so
                // inactivity raises the "timeout" event handled above.
                netSocket.setTimeout(config.connection_timeout);
                netSocket.connect({
                    "host": config.hostname,
                    "port": config.port,
                });
            }
            catch (Exception) {
                fail(Exception);
            }
        });
    }
}
exports.SolaredgeTCPModbus = SolaredgeTCPModbus;
//# sourceMappingURL=solaredgeTCPModbus.js.map