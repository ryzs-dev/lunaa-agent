"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhoneExtractor = void 0;
class PhoneExtractor {
    constructor(customerService) {
        this.customerService = customerService;
    }
    extract(text) {
        if (!text)
            return null;
        // Regex for MY & SG numbers
        const phoneRegex = /\b(?:\+?60|0)(1\d{1,2}\d{6,8})\b|\b(?:\+?65|65)(\d{8})\b/g;
        const matches = Array.from(text.matchAll(phoneRegex));
        if (matches.length === 0)
            return null;
        let digits = matches[0][0].replace(/\D/g, "");
        // Normalize
        if (digits.startsWith("0"))
            digits = "60" + digits.slice(1);
        if (digits.startsWith("+"))
            digits = digits.slice(1);
        return digits;
    }
    async isRepeat(text) {
        const phone = this.extract(text);
        if (!phone)
            return false;
        return !!(await this.customerService.findByPhone(phone));
    }
}
exports.PhoneExtractor = PhoneExtractor;
