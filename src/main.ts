/*
 * Created with @iobroker/create-adapter v2.0.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import { SolaredgeDataEntry } from "./solaredge/solaredgeModel";
import { SolaredgeTCPModbus } from "./solaredge/solaredgeTCPModbus";
import { splitIdFromAdapter } from "./solaredge/solaredgeUtil";
import {
	INVALID_CONFIG_RETRY_MS,
	backoffDelayMs,
	formatError,
	shouldLogConnectionError,
	validateConnectionConfig,
	withConnectionDefaults,
} from "./solaredge/connectionPolicy";

class SolaredgeModbus extends utils.Adapter {

	solaredge : SolaredgeTCPModbus | undefined
	mainLoopRunning = true

	/** Handles kept so onUnload can really stop the adapter (issue #2). */
	private watchDogInterval?: NodeJS.Timeout
	private mainLoopSleepTimeout?: NodeJS.Timeout
	private mainLoopSleepResolve?: () => void

	private consecutiveErrors = 0
	private configProblem: string | null = null
	private infoConnectionState: boolean | undefined

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "solaredge-modbus",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		// Initialize your adapter here

		this.solaredge = new SolaredgeTCPModbus(this.log)

		this.initObjects();


		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		this.subscribeStates("control.*");

		this.startWatchDog();
		this.mainLoop();

	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 */
	private onUnload(callback: () => void): void {
		try {
			this.mainLoopRunning = false

			if (this.watchDogInterval) {
				clearInterval(this.watchDogInterval)
				this.watchDogInterval = undefined
			}
			// Wake the main loop up instead of letting it sleep into the next
			// adapter incarnation - that caused "DB closed" errors after restarts.
			if (this.mainLoopSleepTimeout) {
				clearTimeout(this.mainLoopSleepTimeout)
				this.mainLoopSleepTimeout = undefined
			}
			if (this.mainLoopSleepResolve) {
				this.mainLoopSleepResolve()
				this.mainLoopSleepResolve = undefined
			}

			this.solaredge?.close()

			callback();
		} catch (e) {
			callback();
		}
	}


	private async initObjects(): Promise<void> {

		await this.initConnectionInfoObject();

		if (this.solaredge) {
			for (const [key, value] of Object.entries(this.solaredge.SolaredgeData)) {
				if (!this.isDeviceConfigured(key)) {
					continue
				}
				const v = value as SolaredgeDataEntry
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

	/**
	 * Only create objects for devices that are actually configured. Nothing is
	 * ever deleted, so reducing a count later leaves existing objects in place.
	 * Battery 1 uses the historical unnumbered "battery.*" ids.
	 */
	private isDeviceConfigured(key: string): boolean {
		const meter = /^meter\.(\d+)\./.exec(key)
		if (meter) {
			return Number(meter[1]) <= (this.config.meter_count ?? 1)
		}
		if (key.startsWith("battery.2.")) {
			return (this.config.battery_count ?? 1) >= 2
		}
		if (key.startsWith("battery.")) {
			return (this.config.battery_count ?? 1) >= 1
		}
		return true
	}

	private async mainLoop(): Promise<void> {
		this.log.debug("mainloop: start")
		while(this.mainLoopRunning) {
			const configProblem = validateConnectionConfig(this.config)
			if (configProblem) {
				this.reportConfigProblem(configProblem)
				await this.sleep(INVALID_CONFIG_RETRY_MS)
				continue
			}
			if (this.configProblem) {
				this.log.info("configuration is valid now, starting to poll the inverter")
				this.configProblem = null
			}

			let delay = withConnectionDefaults(this.config).main_loop_pause
			try {
				await this.updateStates();
				if (this.consecutiveErrors > 0) {
					this.log.info(`connection to ${this.config.hostname} restored after ${this.consecutiveErrors} failed poll cycle(s)`)
				}
				this.consecutiveErrors = 0
			} catch (e) {
				this.consecutiveErrors++
				if (this.solaredge) {
					this.solaredge.lastConnectedTimestamp = 0
				}
				const reason = formatError(e)
				if (shouldLogConnectionError(this.consecutiveErrors)) {
					this.log.error(`poll cycle failed (${this.consecutiveErrors} in a row): ${reason}`)
				} else {
					this.log.debug(`poll cycle failed (${this.consecutiveErrors} in a row): ${reason}`)
				}
				delay = backoffDelayMs(delay, this.consecutiveErrors)
			}

			this.log.debug("sleep: " + delay)
			await this.sleep(delay)
		}
		this.log.debug("mainloop: end")
	}

	/** Reports a broken configuration once per change instead of once per second. */
	private reportConfigProblem(problem: string): void {
		if (this.configProblem === problem) {
			return
		}
		this.configProblem = problem
		this.log.error(`invalid adapter configuration: ${problem}. Please check the instance settings - no connection attempt is made.`)
		void this.setInfoConnectionState(false)
	}

	private async startWatchDog(): Promise<void> {
		this.watchDogInterval = setInterval( async ()=> {
			if (!this.mainLoopRunning) {
				return
			}
			if (this.solaredge) {
				const timeDiff = (Date.now() - this.solaredge.lastConnectedTimestamp)
				if (this.solaredge.lastConnectedTimestamp == 0 || timeDiff > 10000 ) {
					this.solaredge.connectionErrorCounter++
					if (shouldLogConnectionError(this.solaredge.connectionErrorCounter)) {
						this.log.warn("connection lost ! connectionErrorCounter:" + this.solaredge.connectionErrorCounter)
					}
					await this.setInfoConnectionState(false)
					if (this.solaredge.connectionErrorCounter > 10) {
						this.restart()
					}
				} else {
					this.solaredge.connectionErrorCounter = 0
					await this.setInfoConnectionState(true)
				}
			} else {
				this.log.warn("connection lost ! - this.solaredge == null")
				await this.setInfoConnectionState(false)
				this.restart()
			}
		}, 5000)
	}


	private async sleep(ms:number): Promise<void> {
		return new Promise(resolve => {
			this.mainLoopSleepResolve = resolve
			this.mainLoopSleepTimeout = setTimeout(() => {
				this.mainLoopSleepTimeout = undefined
				this.mainLoopSleepResolve = undefined
				resolve()
			}, ms)
		})
	}

	private async updateStates(): Promise<void> {
		if (!this.solaredge) {
			return
		}

		// Errors are handled (and throttled) by mainLoop, so they carry a real
		// message instead of "ERROR - {}".
		await this.solaredge.readAndWrite(this.config)

		for (const [key, value] of Object.entries(this.solaredge.SolaredgeData)) {
			const v = value as SolaredgeDataEntry;
			if (v.value !== v.valueOld) {
				this.log.debug("setState: " + key +" : " + v.value)

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
	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		try {
			if (state) {
				// The state was changed
				this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);


				const v = this.solaredge?.SolaredgeData[splitIdFromAdapter(id)];
				this.log.debug("onStateChange" + JSON.stringify(v))
				if (v && v.writeRegister && state.ack == false) {
					const queueEntry = v.writeRegister({
						value: state.val,
					});
					this.solaredge?.sendHoldingRegisterQueue.push(queueEntry);
				}

			} else {
				// The state was deleted
				this.log.debug(`state ${id} deleted`);
			}
		} catch (Exception) {
			this.log.error("onStateChange" + JSON.stringify(Exception))
		}
	}

	private async initConnectionInfoObject(): Promise<void> {
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
	private async setInfoConnectionState(state: boolean): Promise<void> {
		if (this.infoConnectionState === state) {
			return
		}
		this.infoConnectionState = state
		await this.setStateAsync("info.connection", state, true);
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new SolaredgeModbus(options);
} else {
	// otherwise start the instance directly
	(() => new SolaredgeModbus())();
}
