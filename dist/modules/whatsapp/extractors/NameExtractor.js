"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NameExtractor = void 0;
const customerName_1 = require("../../../utils/customerName");
class NameExtractor {
    extract(text) {
        var _a;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        // 1. Try explicit "Name:" first
        for (const line of lines) {
            const match = line.match(/\bname\b\s*[:：;；]?\s*(.*?)(?=\s*contact[:：]|$)/i);
            const name = match ? (0, customerName_1.cleanCustomerName)((_a = match[1]) !== null && _a !== void 0 ? _a : "") : "";
            if (name)
                return name;
        }
        // 2. Fallback: pick the first line that looks like a name (letters, spaces)
        for (const line of lines) {
            if (/^[\p{L} \(\)]+$/u.test(line)) {
                return line.trim();
            }
        }
        return null;
    }
}
exports.NameExtractor = NameExtractor;
