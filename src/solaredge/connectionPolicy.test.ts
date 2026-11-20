/**
 * Unit tests for the connection handling rules introduced for issue #2.
 * Everything here runs without an inverter or an ioBroker database.
 */

import { expect } from "chai";
import {
	CONNECTION_DEFAULTS,
	INVALID_CONFIG_RETRY_MS,
	MAX_BACKOFF_MS,
	backoffDelayMs,
	formatError,
	shouldLogConnectionError,
	validateConnectionConfig,
	withConnectionDefaults,
} from "./connectionPolicy";

describe("connectionPolicy", () => {

	describe("validateConnectionConfig", () => {
		const valid = { hostname: "192.168.1.10", port: 1502, unitId: 1 };

		it("accepts a complete configuration", () => {
			expect(validateConnectionConfig(valid)).to.be.null;
		});

		it("rejects a missing hostname instead of calling connect with undefined", () => {
			// this used to produce ERR_MISSING_ARGS once per second
			expect(validateConnectionConfig({ ...valid, hostname: undefined as unknown as string })).to.match(/hostname/);
			expect(validateConnectionConfig({ ...valid, hostname: "" })).to.match(/hostname/);
			expect(validateConnectionConfig({ ...valid, hostname: "   " })).to.match(/hostname/);
		});

		it("rejects out of range ports", () => {
			expect(validateConnectionConfig({ ...valid, port: 0 })).to.match(/port/);
			expect(validateConnectionConfig({ ...valid, port: 65536 })).to.match(/port/);
			expect(validateConnectionConfig({ ...valid, port: 1502.5 })).to.match(/port/);
			expect(validateConnectionConfig({ ...valid, port: undefined as unknown as number })).to.match(/port/);
		});

		it("rejects out of range unit ids", () => {
			expect(validateConnectionConfig({ ...valid, unitId: -1 })).to.match(/unitId/);
			expect(validateConnectionConfig({ ...valid, unitId: 256 })).to.match(/unitId/);
		});
	});

	describe("withConnectionDefaults", () => {
		it("fills timing values for instances created before the defaults existed", () => {
			const settings = withConnectionDefaults({ hostname: "host" } as ioBroker.AdapterConfig);
			expect(settings.port).to.equal(1502);
			expect(settings.unitId).to.equal(1);
			expect(settings.com_wait_pause).to.equal(CONNECTION_DEFAULTS.com_wait_pause);
			expect(settings.main_loop_pause).to.equal(CONNECTION_DEFAULTS.main_loop_pause);
			expect(settings.connection_timeout).to.equal(5000);
		});

		it("keeps explicitly configured values", () => {
			const settings = withConnectionDefaults({
				hostname: "host", port: 502, unitId: 3,
				com_wait_pause: 50, main_loop_pause: 2000, connection_timeout: 1000,
			} as ioBroker.AdapterConfig);
			expect(settings.port).to.equal(502);
			expect(settings.unitId).to.equal(3);
			expect(settings.connection_timeout).to.equal(1000);
		});
	});

	describe("backoffDelayMs", () => {
		it("uses the configured pause while there is no error", () => {
			expect(backoffDelayMs(1000, 0)).to.equal(1000);
		});

		it("doubles the pause per consecutive error", () => {
			expect(backoffDelayMs(1000, 1)).to.equal(1000);
			expect(backoffDelayMs(1000, 2)).to.equal(2000);
			expect(backoffDelayMs(1000, 3)).to.equal(4000);
		});

		it("caps the delay so recovery does not take forever", () => {
			expect(backoffDelayMs(1000, 20)).to.equal(MAX_BACKOFF_MS);
			expect(MAX_BACKOFF_MS).to.be.greaterThan(INVALID_CONFIG_RETRY_MS);
		});
	});

	describe("shouldLogConnectionError", () => {
		it("reports the first failure and then only occasionally", () => {
			expect(shouldLogConnectionError(1)).to.be.true;
			expect(shouldLogConnectionError(2)).to.be.false;
			expect(shouldLogConnectionError(29)).to.be.false;
			expect(shouldLogConnectionError(30)).to.be.true;
		});
	});

	describe("formatError", () => {
		it("keeps the message of an Error instead of stringifying it to {}", () => {
			expect(formatError(new Error("Connection timeout"))).to.equal("Error: Connection timeout");
		});

		it("handles plain strings and error like objects from node", () => {
			expect(formatError("ERROR: Connection timeout")).to.equal("ERROR: Connection timeout");
			expect(formatError({ code: "ERR_MISSING_ARGS" })).to.equal('{"code":"ERR_MISSING_ARGS"}');
		});
	});
});
