"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NameExtractor = void 0;
class NameExtractor {
    extract(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        // 1. Try explicit "Name:" first
        for (const line of lines) {
            const match = line.match(/name[:：]?\s*(.+?)(?=\s*(contact[:：]|$))/i);
            if (match)
                return match[1].replace(/,$/, "").trim();
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
