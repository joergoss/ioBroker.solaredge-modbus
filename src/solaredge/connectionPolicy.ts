/**
 * Connection handling helpers.
 *
 * Kept free of adapter and socket dependencies so the behaviour can be unit
 * tested without an inverter (see connectionPolicy.test.ts).
 */

/** Fallbacks for instances created before these settings had defaults. */
export const CONNECTION_DEFAULTS = {
	port: 1502,
	unitId: 1,
	com_wait_pause: 200,
	main_loop_pause: 1000,
	connection_timeout: 5000,
} as const;

/** Longest time between two polls while the connection keeps failing. */
export const MAX_BACKOFF_MS = 60000;

/** How often an invalid configuration is re-checked (and reported). */
export const INVALID_CONFIG_RETRY_MS = 30000;

export interface ConnectionSettings {
	hostname: string;
	port: number;
	unitId: number;
	com_wait_pause: number;
	main_loop_pause: number;
	connection_timeout: number;
}

/**
 * Returns a human readable problem description, or null if the configuration
 * is usable. A missing hostname used to reach net.Socket.connect() and produced
 * a cryptic ERR_MISSING_ARGS once per second (issue #2).
 */
export function validateConnectionConfig(config: Partial<ioBroker.AdapterConfig>): string | null {
	if (typeof config.hostname !== "string" || config.hostname.trim().length === 0) {
		return "hostname is not configured";
	}
	if (typeof config.port !== "number" || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
		return `port must be an integer between 1 and 65535, got ${JSON.stringify(config.port)}`;
	}
	if (typeof config.unitId !== "number" || !Number.isInteger(config.unitId) || config.unitId < 0 || config.unitId > 255) {
		return `unitId must be an integer between 0 and 255, got ${JSON.stringify(config.unitId)}`;
	}
	return null;
}

/** Applies the defaults for timing settings that an old instance may not have. */
export function withConnectionDefaults(config: ioBroker.AdapterConfig): ConnectionSettings {
	return {
		hostname: config.hostname,
		port: config.port ?? CONNECTION_DEFAULTS.port,
		unitId: config.unitId ?? CONNECTION_DEFAULTS.unitId,
		com_wait_pause: config.com_wait_pause ?? CONNECTION_DEFAULTS.com_wait_pause,
		main_loop_pause: config.main_loop_pause ?? CONNECTION_DEFAULTS.main_loop_pause,
		connection_timeout: config.connection_timeout ?? CONNECTION_DEFAULTS.connection_timeout,
	};
}

/**
 * Delay before the next poll after a failure: base pause doubled per error,
 * capped at MAX_BACKOFF_MS. The inverter stops answering modbus requests while
 * it sleeps at night, so hammering it every second only produces log noise.
 */
export function backoffDelayMs(basePauseMs: number, consecutiveErrors: number): number {
	if (consecutiveErrors <= 0) {
		return basePauseMs;
	}
	const delay = basePauseMs * Math.pow(2, consecutiveErrors - 1);
	return Math.min(delay, MAX_BACKOFF_MS);
}

/**
 * Log the first failure as an error, afterwards only every 30th one so the
 * reason stays discoverable without flooding the log every second.
 */
export function shouldLogConnectionError(consecutiveErrors: number): boolean {
	return consecutiveErrors === 1 || consecutiveErrors % 30 === 0;
}

/**
 * JSON.stringify(new Error("...")) returns "{}", which is why the old log lines
 * only showed "ERROR - {}" without any usable reason (issue #2).
 */
export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}
	if (typeof error === "string") {
		return error;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}
