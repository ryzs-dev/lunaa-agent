"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SingaporePhoneFormatter = void 0;
class SingaporePhoneFormatter {
    normalize(phone) {
        if (!phone)
            return null;
        const digits = phone.replace(/\D/g, "");
        if (digits.startsWith("65"))
            return digits;
        if (digits.length === 8 && /^[3689]/.test(digits)) {
            return "65" + digits;
        }
        return null;
    }
    extract(text) {
        if (!text)
            return null;
        const patterns = [
            /\b(\+?65\s*[689]\d{3}\s*\d{4})\b/g,
            /\b([689]\d{3}\s*\d{4})\b/g,
            /\b(\+?65\s*[689]\d{3}-\d{4})\b/g,
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
exports.SingaporePhoneFormatter = SingaporePhoneFormatter;
