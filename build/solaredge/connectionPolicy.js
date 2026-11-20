"use strict";
/**
 * Connection handling helpers.
 *
 * Kept free of adapter and socket dependencies so the behaviour can be unit
 * tested without an inverter (see connectionPolicy.test.ts).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatError = exports.shouldLogConnectionError = exports.backoffDelayMs = exports.withConnectionDefaults = exports.validateConnectionConfig = exports.INVALID_CONFIG_RETRY_MS = exports.MAX_BACKOFF_MS = exports.CONNECTION_DEFAULTS = void 0;
/** Fallbacks for instances created before these settings had defaults. */
exports.CONNECTION_DEFAULTS = {
    port: 1502,
    unitId: 1,
    com_wait_pause: 200,
    main_loop_pause: 1000,
    connection_timeout: 5000,
};
/** Longest time between two polls while the connection keeps failing. */
exports.MAX_BACKOFF_MS = 60000;
/** How often an invalid configuration is re-checked (and reported). */
exports.INVALID_CONFIG_RETRY_MS = 30000;
/**
 * Returns a human readable problem description, or null if the configuration
 * is usable. A missing hostname used to reach net.Socket.connect() and produced
 * a cryptic ERR_MISSING_ARGS once per second (issue #2).
 */
function validateConnectionConfig(config) {
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
exports.validateConnectionConfig = validateConnectionConfig;
/** Applies the defaults for timing settings that an old instance may not have. */
function withConnectionDefaults(config) {
    var _a, _b, _c, _d, _e;
    return {
        hostname: config.hostname,
        port: (_a = config.port) !== null && _a !== void 0 ? _a : exports.CONNECTION_DEFAULTS.port,
        unitId: (_b = config.unitId) !== null && _b !== void 0 ? _b : exports.CONNECTION_DEFAULTS.unitId,
        com_wait_pause: (_c = config.com_wait_pause) !== null && _c !== void 0 ? _c : exports.CONNECTION_DEFAULTS.com_wait_pause,
        main_loop_pause: (_d = config.main_loop_pause) !== null && _d !== void 0 ? _d : exports.CONNECTION_DEFAULTS.main_loop_pause,
        connection_timeout: (_e = config.connection_timeout) !== null && _e !== void 0 ? _e : exports.CONNECTION_DEFAULTS.connection_timeout,
    };
}
exports.withConnectionDefaults = withConnectionDefaults;
/**
 * Delay before the next poll after a failure: base pause doubled per error,
 * capped at MAX_BACKOFF_MS. The inverter stops answering modbus requests while
 * it sleeps at night, so hammering it every second only produces log noise.
 */
function backoffDelayMs(basePauseMs, consecutiveErrors) {
    if (consecutiveErrors <= 0) {
        return basePauseMs;
    }
    const delay = basePauseMs * Math.pow(2, consecutiveErrors - 1);
    return Math.min(delay, exports.MAX_BACKOFF_MS);
}
exports.backoffDelayMs = backoffDelayMs;
/**
 * Log the first failure as an error, afterwards only every 30th one so the
 * reason stays discoverable without flooding the log every second.
 */
function shouldLogConnectionError(consecutiveErrors) {
    return consecutiveErrors === 1 || consecutiveErrors % 30 === 0;
}
exports.shouldLogConnectionError = shouldLogConnectionError;
/**
 * JSON.stringify(new Error("...")) returns "{}", which is why the old log lines
 * only showed "ERROR - {}" without any usable reason (issue #2).
 */
function formatError(error) {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    if (typeof error === "string") {
        return error;
    }
    try {
        return JSON.stringify(error);
    }
    catch (_a) {
        return String(error);
    }
}
exports.formatError = formatError;
//# sourceMappingURL=connectionPolicy.js.map