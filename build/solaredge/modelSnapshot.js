"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeterministicBuffer = createDeterministicBuffer;
exports.decodeAll = decodeAll;
/**
 * Decodes every model entry for a deterministic pseudo random buffer.
 *
 * Used to prove that the table driven meter/battery definitions decode exactly
 * like the previous hand written ones. The captured output is committed as
 * legacyModelSnapshot.json and checked by solaredgeModel.test.ts, so any later
 * change to offsets, register types or scale factors is caught without an
 * inverter.
 *
 * Regenerate deliberately with: npx ts-node src/solaredge/modelSnapshot.ts <out.json>
 */
const fs = __importStar(require("fs"));
const solaredgeModel_1 = require("./solaredgeModel");
function createDeterministicBuffer() {
    // Fixed seed: same bytes on every run, no hardware involved.
    let seed = 20261120;
    const buf = Buffer.alloc(0xFFFF * 2);
    for (let i = 0; i < buf.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        buf[i] = seed % 256;
    }
    return buf;
}
function decodeAll(buffer) {
    const model = new solaredgeModel_1.SolaredgeModel();
    const result = {};
    for (const [key, entry] of Object.entries(model)) {
        try {
            result[key] = entry.readRegister ? entry.readRegister(buffer) : "<no readRegister>";
        }
        catch (e) {
            result[key] = `<error: ${e.message}>`;
        }
    }
    return result;
}
function main() {
    const target = process.argv[2];
    if (!target) {
        throw new Error("usage: ts-node modelSnapshot.ts <output.json>");
    }
    const result = decodeAll(createDeterministicBuffer());
    fs.writeFileSync(target, JSON.stringify(result, null, 1) + "\n");
    console.log(`wrote ${Object.keys(result).length} entries to ${target}`);
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=modelSnapshot.js.map