"use strict";
// Utility functions shared by the adapter.
// Removed on audit: this file carried unused Victron-specific helpers (fault
// and alarm bitfields, charge states, LED states) that have no meaning for
// SolarEdge and were referenced by nothing.
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleForUnit = roleForUnit;
exports.splitIdFromAdapter = splitIdFromAdapter;
/**
 * Maps a unit to a meaningful ioBroker role, so power/energy values show up
 * correctly in dashboards and device managers instead of plain "state".
 */
function roleForUnit(unit) {
    switch (unit) {
        case "W": return "value.power";
        case "Wh": return "value.energy";
        case "V": return "value.voltage";
        case "A": return "value.current";
        case "°C": return "value.temperature";
        case "Hz": return "value.frequency";
        default: return "value";
    }
}
function splitIdFromAdapter(str) {
    const delimiter = ".";
    const start = 2;
    const tokens = str.split(delimiter).slice(start);
    return tokens.join(delimiter);
}
//# sourceMappingURL=solaredgeUtil.js.map