"use strict";
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
exports.bufferFromCapture = void 0;
/**
 * Decodes a captured register dump with the current model.
 *
 * Companion to the "log_raw_registers" instance setting: a user pastes the hex
 * lines from the log, and this tool shows what the adapter makes of them -
 * without access to the inverter.
 *
 * Input format (JSON): { "blocks": { "<label>": { "start": <number>, "hex": "<hex>" } } }
 * usage: npx ts-node src/solaredge/decodeCapture.ts <capture.json> [filter]
 */
const fs = __importStar(require("fs"));
const solaredgeModel_1 = require("./solaredgeModel");
/** Copies captured blocks into a buffer at their absolute register addresses. */
function bufferFromCapture(capture) {
    const buf = Buffer.alloc(0xFFFF * 2);
    for (const block of Object.values(capture.blocks)) {
        if (block.error) {
            continue;
        }
        const data = Buffer.from(block.hex, "hex");
        data.copy(buf, block.start * 2);
    }
    return buf;
}
exports.bufferFromCapture = bufferFromCapture;
function main() {
    const file = process.argv[2];
    const filter = process.argv[3];
    if (!file) {
        throw new Error("usage: ts-node decodeCapture.ts <capture.json> [filter]");
    }
    const capture = JSON.parse(fs.readFileSync(file, "utf8"));
    const buf = bufferFromCapture(capture);
    const model = new solaredgeModel_1.SolaredgeModel();
    for (const [key, entry] of Object.entries(model)) {
        if (filter && !key.includes(filter)) {
            continue;
        }
        if (!entry.readRegister) {
            continue;
        }
        try {
            const value = entry.readRegister(buf);
            console.log(`${key}\t${value}\t${entry.unit}`);
        }
        catch (e) {
            console.log(`${key}\t<error: ${e.message}>`);
        }
    }
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=decodeCapture.js.map