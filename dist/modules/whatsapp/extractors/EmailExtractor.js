"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailExtractor = void 0;
class EmailExtractor {
    extract(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        // 1. Try explicit "email:" format
        for (const line of lines) {
            const match = line.match(/email[:：]?\s*([\w\.-]+@[\w\.-]+\.\w+)/i);
            if (match) {
                return match[1].trim();
            }
        }
        // 2. Fallback: regex match for any valid email in the text
        const emailRegex = /[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/;
        for (const line of lines) {
            const match = line.match(emailRegex);
            if (match) {
                return match[0].trim();
            }
        }
        return null;
    }
}
exports.EmailExtractor = EmailExtractor;
