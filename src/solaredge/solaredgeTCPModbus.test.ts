/**
 * Tests for the persistent modbus connection (issue #13) against a minimal
 * in-process modbus TCP server. No inverter and no ioBroker needed.
 */

import { expect } from "chai";
import * as net from "net";
import { SolaredgeTCPModbus, RequestTimeoutError } from "./solaredgeTCPModbus";

type ServerMode = "normal" | "silent" | "exception";

/** Minimal modbus TCP responder for read holding registers (function 0x03). */
class TestModbusServer {
	server: net.Server;
	connections = 0;
	requests: Array<{ start: number; length: number }> = [];
	/** behaviour per start address, everything else answers normally */
	behaviour = new Map<number, ServerMode>();
	port = 0;

	constructor() {
		this.server = net.createServer((socket) => {
			this.connections++;
			let rx = Buffer.alloc(0);
			socket.on("data", (chunk) => {
				rx = Buffer.concat([rx, chunk]);
				while (rx.length >= 12) {
					const length = rx.readUInt16BE(4);
					const total = 6 + length;
					if (rx.length < total) return;
					const frame = rx.subarray(0, total);
					rx = rx.subarray(total);
					const tid = frame.readUInt16BE(0);
					const unit = frame.readUInt8(6);
					const start = frame.readUInt16BE(8);
					const count = frame.readUInt16BE(10);
					this.requests.push({ start, length: count });
					const mode = this.behaviour.get(start) ?? "normal";
					if (mode === "silent") {
						continue; // never answer -> client must time out
					}
					if (mode === "exception") {
						const pdu = Buffer.from([0x83, 0x02]); // illegal data address
						socket.write(this.frame(tid, unit, pdu));
						continue;
					}
					const data = Buffer.alloc(count * 2);
					for (let i = 0; i < count; i++) {
						data.writeUInt16BE((start + i) & 0xFFFF, i * 2);
					}
					socket.write(this.frame(tid, unit, Buffer.concat([Buffer.from([0x03, count * 2]), data])));
				}
			});
		});
	}

	private frame(tid: number, unit: number, pdu: Buffer): Buffer {
		const mbap = Buffer.alloc(7);
		mbap.writeUInt16BE(tid, 0);
		mbap.writeUInt16BE(0, 2);
		mbap.writeUInt16BE(pdu.length + 1, 4);
		mbap.writeUInt8(unit, 6);
		return Buffer.concat([mbap, pdu]);
	}

	async listen(): Promise<void> {
		await new Promise<void>(resolve => this.server.listen(0, "127.0.0.1", resolve));
		this.port = (this.server.address() as net.AddressInfo).port;
	}

	async close(): Promise<void> {
		await new Promise<void>(resolve => this.server.close(() => resolve()));
	}
}

function logger(): ioBroker.Logger {
	return { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined, silly: () => undefined } as unknown as ioBroker.Logger;
}

function config(port: number): ioBroker.AdapterConfig {
	return {
		hostname: "127.0.0.1",
		port,
		unitId: 1,
		com_wait_pause: 0,
		main_loop_pause: 0,
		connection_timeout: 400,
		log_raw_registers: false,
		meter_count: 1,
		battery_count: 1,
		max_register_block_size: 0,
	} as ioBroker.AdapterConfig;
}

describe("SolaredgeTCPModbus persistent connection (issue #13)", () => {
	let server: TestModbusServer;
	let adapter: SolaredgeTCPModbus;

	beforeEach(async () => {
		server = new TestModbusServer();
		await server.listen();
		adapter = new SolaredgeTCPModbus(logger());
	});

	afterEach(async () => {
		adapter.close();
		await server.close();
	});

	it("reuses one tcp session across several poll cycles", async () => {
		await adapter.readAndWrite(config(server.port));
		await adapter.readAndWrite(config(server.port));
		await adapter.readAndWrite(config(server.port));

		expect(server.connections, "a new session per cycle was the old behaviour").to.equal(1);
		expect(adapter.isConnected()).to.be.true;
		expect(adapter.lastConnectedTimestamp).to.be.greaterThan(0);
		// six default blocks per cycle
		expect(server.requests).to.have.length(18);
	});

	it("decodes values from the reused connection", async () => {
		await adapter.readAndWrite(config(server.port));
		// the test server returns register number as value, so I_AC_Power (83) = 83
		// and its scale factor (84) = 84 is huge; just check the model was filled
		expect(adapter.SolaredgeData["common.C_DeviceAddress"].value).to.equal(68);
	});

	it("skips a block that answers with a modbus exception and keeps the session", async () => {
		server.behaviour.set(0xE100, "exception"); // battery 1 block 1
		await adapter.readAndWrite(config(server.port));

		expect(adapter.isConnected(), "a block level exception must not kill the session").to.be.true;
		expect(server.connections).to.equal(1);
		// all other blocks were still read
		expect(server.requests.some(r => r.start === 0)).to.be.true;
		expect(server.requests.some(r => r.start === 40123)).to.be.true;
	});

	it("times out an unanswered request, drops the session and reconnects", async () => {
		server.behaviour.set(0, "silent"); // inverter block never answers

		let thrown: unknown;
		try {
			await adapter.readAndWrite(config(server.port));
		} catch (e) {
			thrown = e;
		}
		expect(thrown, "an unanswered request must not hang forever").to.be.instanceOf(RequestTimeoutError);
		expect(adapter.isConnected()).to.be.false;

		// device recovers: the next cycle must work on a fresh connection
		server.behaviour.set(0, "normal");
		await adapter.readAndWrite(config(server.port));
		expect(adapter.isConnected()).to.be.true;
		expect(server.connections).to.equal(2);
	});

	it("reconnects when the peer closes the session between cycles", async () => {
		await adapter.readAndWrite(config(server.port));
		expect(server.connections).to.equal(1);

		adapter.close(); // simulates a dropped session
		expect(adapter.isConnected()).to.be.false;

		await adapter.readAndWrite(config(server.port));
		expect(server.connections).to.equal(2);
		expect(adapter.isConnected()).to.be.true;
	});
});
