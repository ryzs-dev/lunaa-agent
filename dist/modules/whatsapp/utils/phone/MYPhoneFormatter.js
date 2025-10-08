"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MalaysiaPhoneFormatter = void 0;
class MalaysiaPhoneFormatter {
    normalize(phone) {
        if (!phone)
            return null;
        const digits = phone.replace(/\D/g, "");
        if (digits.startsWith("60"))
            return digits;
        if (digits.startsWith("0"))
            return "60" + digits.substring(1);
        if (digits.length >= 9 && digits.length <= 11 && /^[13-9]/.test(digits)) {
            return "60" + digits;
        }
        return null;
    }
    extract(text) {
        if (!text)
            return null;
        const patterns = [
            /\b(\+?60\s*1\d\s*\d{3,4}\s*\d{4})\b/g,
            /\b(01\d\s*\d{3,4}\s*\d{4})\b/g,
            /\b(\+?60\s*[3-9]\s*\d{3,4}\s*\d{4})\b/g,
            /\b(0[3-9]\s*\d{3,4}\s*\d{4})\b/g,
            /\b(\+?60\s*1\d-\d{3,4}-\d{4})\b/g,
            /\b(01\d-\d{3,4}-\d{4})\b/g,
            /\b(01\d-\d{7})\b/g,
            /\b(01\d-\d{4}-\d{3})\b/g,
            /\b(016-\d{7})\b/g,
            /\b(016-\d{4}-\d{3})\b/g,
        ];
        return this.matchPatterns(text, patterns);
    }
    matchPatterns(text, patterns) {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match === null || match === void 0 ? void 0 : match[0])
                return match[0].replace(/\s+/g, "");
        }
        return null;
    }
}
exports.MalaysiaPhoneFormatter = MalaysiaPhoneFormatter;
