"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmountExtractor = void 0;
class AmountExtractor {
    extract(text) {
        if (!text)
            return null;
        const patterns = [
            /total\s*[：:]\s*(?:rm)?\s*(\d+)/i,
            /total\s+(?:rm\s*)?(\d+)/i,
            /total.*?(\d+)/i,
            /^rm\s*(\d+)$/i,
            /(\d{2,4})\s*(ringgit|dollar|myr|sgd)/i,
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match)
                return parseInt(match[1]);
        }
        if (/^\d{2,4}$/.test(text)) {
            const amount = parseInt(text);
            if (amount >= 20 && amount <= 9999)
                return amount;
        }
        return null;
    }
}
exports.AmountExtractor = AmountExtractor;
