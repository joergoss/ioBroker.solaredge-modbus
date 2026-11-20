// Solaredge MODBUS

import * as net from "net";
import { SolaredgeHoldingRegister, SolaredgeDataEntry, SolaredgeModel, SolaredgeWriteSingleCoil, SolaredgeWriteMultipleHoldingRegister } from "./solaredgeModel";
import { ConnectionSettings, withConnectionDefaults } from "./connectionPolicy";
import { buildPollPlan } from "./pollPlan";

/* eslint-disable @typescript-eslint/no-var-requires */
// create a tcp modbus client (jsmodbus ships no type definitions)
const modbus = require("jsmodbus");

export class SolaredgeTCPModbus {
	log: ioBroker.Logger
	bufferSize = 0xFFFF
	buf: Buffer = Buffer.alloc(this.bufferSize * 2)

	/** Currently open socket, so onUnload can really close it (issue #2). */
	private socket: net.Socket | undefined

	/** When enabled, every polled block is logged as raw hex for bug reports. */
	private logRawRegisters = false

	SolaredgeData = new SolaredgeModel();
	sendHoldingRegisterQueue: Array<SolaredgeWriteMultipleHoldingRegister> = []
	sendCoilQueue: Array<SolaredgeWriteSingleCoil> = []

	lastConnectedTimestamp = 0
	connectionErrorCounter = 0

	constructor(log: ioBroker.Logger) {
		this.log = log
		this.log.debug("solaredgeTCPModbus constructor")

	}

	private async sleep(ms:number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	async updateSolaredgeData(hr: SolaredgeHoldingRegister): Promise<void> {
		const tmd = hr as Buffer;

		for (const [name, value] of Object.entries(this.SolaredgeData)) {
			const v = value as SolaredgeDataEntry;

			if (typeof v.readRegister === "function") {
				v.valueOld = v.value;
				try {
					v.value = v.readRegister(tmd)
				} catch (Exception) {
					this.log.error("updateSolaredgeData ERROR '" + name + "'" + JSON.stringify(v) +  " Exception: " +JSON.stringify(Exception))
				}
			}
		}
	}

	async readAndWrite(adapterConfig: ioBroker.AdapterConfig): Promise<void> {
		const config = withConnectionDefaults(adapterConfig)
		this.logRawRegisters = adapterConfig.log_raw_registers === true

		await this.connect(config, async (client) => {

			while (this.sendHoldingRegisterQueue.length > 0) {
				const item = this.sendHoldingRegisterQueue.pop()
				this.log.debug("request writeSingleRegister " + JSON.stringify(item))
				const response = await client.writeMultipleRegisters(item?.register, item?.value)
				this.log.debug("response writeSingleRegister " + JSON.stringify(response))
				await this.sleep(config.com_wait_pause)
			}

			// Which devices are polled, and how large each request may be, is
			// defined by the poll plan (meter_count / battery_count /
			// max_register_block_size).
			for (const block of buildPollPlan(adapterConfig)) {
				await this.readHoldingRegisterBlock(client, block.start, block.length, block.label)
				await this.sleep(config.com_wait_pause)
			}

			await this.updateSolaredgeData(this.buf)
		})
	}

	debugBuffer(): void {
		this.log.debug("SolaredgeHoldingRegister debugBuffer " + JSON.stringify(this.buf))
	}

	async readHoldingRegisterBlock(client : any, start: number, length: number, label = ""): Promise<void> {

		const block = await client.readHoldingRegisters(start, length)
		const b: Buffer = Buffer.from(block.response._body._valuesAsBuffer)
		b.copy(this.buf, start * 2)

		if (this.logRawRegisters) {
			// One copyable line per block: register range plus the exact bytes as
			// they arrived. Users can paste this into a bug report (issues #4/#5).
			this.log.info(`raw registers ${label} 0x${start.toString(16)}..0x${(start + length - 1).toString(16)} (${length} registers): ${b.toString("hex")}`)
		}
	}

	/**
	 * Closes an open connection. Safe to call repeatedly and from onUnload.
	 * Previously sockets were left half open on errors and timeouts, which
	 * accumulated over the poll cycles (issue #2).
	 */
	close(): void {
		if (this.socket) {
			this.socket.removeAllListeners()
			this.socket.destroy()
			this.socket = undefined
		}
	}

	async connect(config: ConnectionSettings, callback: (client: any) => Promise<void>): Promise<any> {
		return new Promise<any>((resolve, reject) => {
			// A socket can report "error", "timeout" and "close" for the same
			// failure. Settle the promise exactly once and always clean up.
			let settled = false
			const netSocket = new net.Socket()
			this.socket = netSocket

			let timeoutRef: NodeJS.Timeout | undefined = undefined

			const clearConnectionTimeout = (): void => {
				const timer = timeoutRef
				if (timer !== undefined) {
					clearTimeout(timer)
					timeoutRef = undefined
				}
			}

			const fail = (reason: unknown): void => {
				if (settled) return
				settled = true
				clearConnectionTimeout()
				this.close()
				reject(reason)
			}

			timeoutRef = setTimeout(() => {
				fail(new Error(`Connection timeout after ${config.connection_timeout} ms (${config.hostname}:${config.port})`))
			}, config.connection_timeout)

			try {
				// create a modbus client
				const client = new modbus.client.TCP(netSocket, config.unitId);

				netSocket.on("connect", async () => {
					try {
						this.lastConnectedTimestamp = Date.now()
						clearConnectionTimeout()

						await callback(client)

						if (settled) return
						settled = true
						clearConnectionTimeout()
						this.close()
						resolve(this.SolaredgeData);
					}
					catch (Exception) {
						fail(Exception);
					}
				});

				netSocket.on("timeout", () => {
					fail(new Error(`Socket timeout after ${config.connection_timeout} ms (${config.hostname}:${config.port})`))
				})

				netSocket.on("error", (err: Error) => {
					fail(err);
				})

				netSocket.on("close", () => {
					// Also fires when the inverter drops the connection mid cycle.
					// Ignored once the promise is already settled.
					fail(new Error("Connection closed before the poll cycle finished"));
				})

				// "timeout" is not a connect() option: set it on the socket so
				// inactivity raises the "timeout" event handled above.
				netSocket.setTimeout(config.connection_timeout)
				netSocket.connect({
					"host": config.hostname,
					"port": config.port,
				})

			} catch (Exception) {
				fail(Exception);
			}

		})

	}



}
