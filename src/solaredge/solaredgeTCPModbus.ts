// Solaredge MODBUS

import * as net from "net";
import { SolaredgeHoldingRegister, SolaredgeDataEntry, SolaredgeModel, SolaredgeWriteSingleCoil, SolaredgeWriteMultipleHoldingRegister } from "./solaredgeModel";
import { ConnectionSettings, withConnectionDefaults } from "./connectionPolicy";
import { buildPollPlan, PollBlock } from "./pollPlan";

/* eslint-disable @typescript-eslint/no-var-requires */
// create a tcp modbus client (jsmodbus ships no type definitions)
const modbus = require("jsmodbus");

/** A single modbus request did not answer within the configured timeout. */
export class RequestTimeoutError extends Error {
	constructor(block: string, timeoutMs: number) {
		super(`modbus request timeout after ${timeoutMs} ms in block ${block}`);
		this.name = "RequestTimeoutError";
	}
}

export class SolaredgeTCPModbus {
	log: ioBroker.Logger
	bufferSize = 0xFFFF
	buf: Buffer = Buffer.alloc(this.bufferSize * 2)

	/**
	 * One persistent connection, kept across poll cycles (issue #13).
	 * Previously every cycle opened and closed a new tcp session, which is
	 * both slower and prone to ECONNRESET on the inverter side.
	 */
	private socket: net.Socket | undefined
	private client: any

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

		const client = await this.ensureConnected(config)

		while (this.sendHoldingRegisterQueue.length > 0) {
			const item = this.sendHoldingRegisterQueue.pop()
			this.log.debug("request writeMultipleRegisters " + JSON.stringify(item))
			const response = await this.withTimeout(client.writeMultipleRegisters(item?.register, item?.value), "write", config.connection_timeout)
			this.log.debug("response writeMultipleRegisters " + JSON.stringify(response))
			await this.sleep(config.com_wait_pause)
		}

		for (const block of buildPollPlan(adapterConfig)) {
			try {
				await this.readHoldingRegisterBlock(client, block, config.connection_timeout)
			} catch (e) {
				// A timeout or a broken connection invalidates the whole session:
				// drop it so the next cycle reconnects, and let mainLoop apply
				// its throttled logging and backoff.
				if (e instanceof RequestTimeoutError) {
					this.close()
					throw e
				}
				// jsmodbus failures for a single block (e.g. a modbus exception
				// for an area this firmware does not implement) must not abort
				// the remaining blocks of the cycle.
				this.log.warn(`skipping block ${block.label}: ${e instanceof Error ? e.message : JSON.stringify(e)}`)
				continue
			}
			await this.sleep(config.com_wait_pause)
		}

		await this.updateSolaredgeData(this.buf)
	}

	debugBuffer(): void {
		this.log.debug("SolaredgeHoldingRegister debugBuffer " + JSON.stringify(this.buf))
	}

	/**
	 * Returns the existing client or opens a new connection. The socket is
	 * reused until it breaks or the adapter shuts down.
	 */
	private async ensureConnected(config: ConnectionSettings): Promise<any> {
		if (this.client && this.socket && !this.socket.destroyed) {
			return this.client
		}
		await this.openConnection(config)
		return this.client
	}

	private openConnection(config: ConnectionSettings): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const netSocket = new net.Socket()
			this.socket = netSocket
			this.client = new modbus.client.TCP(netSocket, config.unitId)

			let settled = false
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

			// If the peer drops the session later on, just forget the client.
			// The next poll cycle will reconnect; no unhandled rejection here.
			netSocket.on("error", (err: Error) => {
				this.log.debug(`socket error: ${err.message}`)
				if (!settled) {
					fail(err)
				} else {
					this.close()
				}
			})
			netSocket.on("close", () => {
				if (this.socket === netSocket) {
					this.socket = undefined
					this.client = undefined
				}
			})
			netSocket.on("timeout", () => {
				this.log.debug("socket idle timeout, closing connection")
				this.close()
			})

			netSocket.on("connect", () => {
				if (settled) return
				settled = true
				clearConnectionTimeout()
				this.lastConnectedTimestamp = Date.now()
				this.log.debug(`connected to ${config.hostname}:${config.port} (unit ${config.unitId})`)
				resolve()
			})

			// No socket idle timeout here on purpose: it would close the
			// persistent session between two poll cycles. The connect timer and
			// the per-request timeout in withTimeout() cover both hang cases.
			netSocket.connect({
				"host": config.hostname,
				"port": config.port,
			})
		})
	}

	/** Bounds a single modbus request; an unanswered request hangs otherwise. */
	private async withTimeout<T>(request: Promise<T>, label: string, timeoutMs: number): Promise<T> {
		let timer: NodeJS.Timeout | undefined = undefined
		try {
			return await Promise.race([
				request,
				new Promise<never>((_resolve, reject) => {
					timer = setTimeout(() => reject(new RequestTimeoutError(label, timeoutMs)), timeoutMs)
				}),
			])
		} finally {
			if (timer !== undefined) clearTimeout(timer)
		}
	}

	async readHoldingRegisterBlock(client: any, block: PollBlock, timeoutMs: number): Promise<void> {
		const response = await this.withTimeout<any>(client.readHoldingRegisters(block.start, block.length), block.label, timeoutMs)
		const b: Buffer = Buffer.from(response.response._body._valuesAsBuffer)
		b.copy(this.buf, block.start * 2)
		// proof of life for the watchdog, on every successful block
		this.lastConnectedTimestamp = Date.now()

		if (this.logRawRegisters) {
			// One copyable line per block: register range plus the exact bytes as
			// they arrived. Users can paste this into a bug report (issues #4/#5).
			this.log.info(`raw registers ${block.label} 0x${block.start.toString(16)}..0x${(block.start + block.length - 1).toString(16)} (${block.length} registers): ${b.toString("hex")}`)
		}
	}

	/**
	 * Closes the connection and forgets the client. Safe to call repeatedly.
	 * The next poll cycle transparently opens a fresh connection.
	 */
	close(): void {
		const socket = this.socket
		this.socket = undefined
		this.client = undefined
		if (socket) {
			socket.removeAllListeners()
			socket.destroy()
		}
	}

	/** Test/inspection helper: whether a persistent session is currently held. */
	isConnected(): boolean {
		return !!(this.socket && !this.socket.destroyed && this.client)
	}

}
