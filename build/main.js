"use strict";
/*
 * Created with @iobroker/create-adapter v2.0.2
 */
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
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const solaredgeTCPModbus_1 = require("./solaredge/solaredgeTCPModbus");
const solaredgeUtil_1 = require("./solaredge/solaredgeUtil");
const connectionPolicy_1 = require("./solaredge/connectionPolicy");
class SolaredgeModbus extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: "solaredge-modbus",
        });
        this.mainLoopRunning = true;
        this.consecutiveErrors = 0;
        this.configProblem = null;
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        this.solaredge = new solaredgeTCPModbus_1.SolaredgeTCPModbus(this.log);
        this.initObjects();
        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        this.subscribeStates("control.*");
        this.startWatchDog();
        this.mainLoop();
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        var _a;
        try {
            this.mainLoopRunning = false;
            if (this.watchDogInterval) {
                clearInterval(this.watchDogInterval);
                this.watchDogInterval = undefined;
            }
            // Wake the main loop up instead of letting it sleep into the next
            // adapter incarnation - that caused "DB closed" errors after restarts.
            if (this.mainLoopSleepTimeout) {
                clearTimeout(this.mainLoopSleepTimeout);
                this.mainLoopSleepTimeout = undefined;
            }
            if (this.mainLoopSleepResolve) {
                this.mainLoopSleepResolve();
                this.mainLoopSleepResolve = undefined;
            }
            (_a = this.solaredge) === null || _a === void 0 ? void 0 : _a.close();
            callback();
        }
        catch (e) {
            callback();
        }
    }
    async initObjects() {
        await this.initConnectionInfoObject();
        if (this.solaredge) {
            for (const [key, value] of Object.entries(this.solaredge.SolaredgeData)) {
                const v = value;
                await this.setObjectNotExistsAsync(key, {
                    type: "state",
                    common: {
                        name: v.descr,
                        type: v.type,
                        role: "state",
                        read: true,
                        write: v.writeRegister ? true : false,
                        unit: v.unit,
                        states: v.states
                    },
                    native: {},
                });
            }
        }
    }
    async mainLoop() {
        this.log.debug("mainloop: start");
        while (this.mainLoopRunning) {
            const configProblem = (0, connectionPolicy_1.validateConnectionConfig)(this.config);
            if (configProblem) {
                this.reportConfigProblem(configProblem);
                await this.sleep(connectionPolicy_1.INVALID_CONFIG_RETRY_MS);
                continue;
            }
            if (this.configProblem) {
                this.log.info("configuration is valid now, starting to poll the inverter");
                this.configProblem = null;
            }
            let delay = (0, connectionPolicy_1.withConnectionDefaults)(this.config).main_loop_pause;
            try {
                await this.updateStates();
                if (this.consecutiveErrors > 0) {
                    this.log.info(`connection to ${this.config.hostname} restored after ${this.consecutiveErrors} failed poll cycle(s)`);
                }
                this.consecutiveErrors = 0;
            }
            catch (e) {
                this.consecutiveErrors++;
                if (this.solaredge) {
                    this.solaredge.lastConnectedTimestamp = 0;
                }
                const reason = (0, connectionPolicy_1.formatError)(e);
                if ((0, connectionPolicy_1.shouldLogConnectionError)(this.consecutiveErrors)) {
                    this.log.error(`poll cycle failed (${this.consecutiveErrors} in a row): ${reason}`);
                }
                else {
                    this.log.debug(`poll cycle failed (${this.consecutiveErrors} in a row): ${reason}`);
                }
                delay = (0, connectionPolicy_1.backoffDelayMs)(delay, this.consecutiveErrors);
            }
            this.log.debug("sleep: " + delay);
            await this.sleep(delay);
        }
        this.log.debug("mainloop: end");
    }
    /** Reports a broken configuration once per change instead of once per second. */
    reportConfigProblem(problem) {
        if (this.configProblem === problem) {
            return;
        }
        this.configProblem = problem;
        this.log.error(`invalid adapter configuration: ${problem}. Please check the instance settings - no connection attempt is made.`);
        void this.setInfoConnectionState(false);
    }
    async startWatchDog() {
        this.watchDogInterval = setInterval(async () => {
            if (!this.mainLoopRunning) {
                return;
            }
            if (this.solaredge) {
                const timeDiff = (Date.now() - this.solaredge.lastConnectedTimestamp);
                if (this.solaredge.lastConnectedTimestamp == 0 || timeDiff > 10000) {
                    this.solaredge.connectionErrorCounter++;
                    if ((0, connectionPolicy_1.shouldLogConnectionError)(this.solaredge.connectionErrorCounter)) {
                        this.log.warn("connection lost ! connectionErrorCounter:" + this.solaredge.connectionErrorCounter);
                    }
                    await this.setInfoConnectionState(false);
                    if (this.solaredge.connectionErrorCounter > 10) {
                        this.restart();
                    }
                }
                else {
                    this.solaredge.connectionErrorCounter = 0;
                    await this.setInfoConnectionState(true);
                }
            }
            else {
                this.log.warn("connection lost ! - this.solaredge == null");
                await this.setInfoConnectionState(false);
                this.restart();
            }
        }, 5000);
    }
    async sleep(ms) {
        return new Promise(resolve => {
            this.mainLoopSleepResolve = resolve;
            this.mainLoopSleepTimeout = setTimeout(() => {
                this.mainLoopSleepTimeout = undefined;
                this.mainLoopSleepResolve = undefined;
                resolve();
            }, ms);
        });
    }
    async updateStates() {
        if (!this.solaredge) {
            return;
        }
        // Errors are handled (and throttled) by mainLoop, so they carry a real
        // message instead of "ERROR - {}".
        await this.solaredge.readAndWrite(this.config);
        for (const [key, value] of Object.entries(this.solaredge.SolaredgeData)) {
            const v = value;
            if (v.value !== v.valueOld) {
                this.log.debug("setState: " + key + " : " + v.value);
                await this.setStateAsync(key, {
                    val: v.value,
                    ack: true
                });
            }
        }
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        var _a, _b;
        try {
            if (state) {
                // The state was changed
                this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                const v = (_a = this.solaredge) === null || _a === void 0 ? void 0 : _a.SolaredgeData[(0, solaredgeUtil_1.splitIdFromAdapter)(id)];
                this.log.debug("onStateChange" + JSON.stringify(v));
                if (v && v.writeRegister && state.ack == false) {
                    const queueEntry = v.writeRegister({
                        value: state.val,
                    });
                    (_b = this.solaredge) === null || _b === void 0 ? void 0 : _b.sendHoldingRegisterQueue.push(queueEntry);
                }
            }
            else {
                // The state was deleted
                this.log.debug(`state ${id} deleted`);
            }
        }
        catch (Exception) {
            this.log.error("onStateChange" + JSON.stringify(Exception));
        }
    }
    async initConnectionInfoObject() {
        await this.setObjectNotExistsAsync("info.connection", {
            _id: "info.connection",
            type: "state",
            common: {
                role: "indicator.connected",
                name: "If communication with circuit works",
                type: "boolean",
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });
    }
    /** Writes info.connection only on changes, not on every watchdog tick. */
    async setInfoConnectionState(state) {
        if (this.infoConnectionState === state) {
            return;
        }
        this.infoConnectionState = state;
        await this.setStateAsync("info.connection", state, true);
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new SolaredgeModbus(options);
}
else {
    // otherwise start the instance directly
    (() => new SolaredgeModbus())();
}
//# sourceMappingURL=main.js.map