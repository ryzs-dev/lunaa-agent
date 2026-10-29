"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhoneNumber = normalizePhoneNumber;
function normalizePhoneNumber(phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '');
    if (!digits)
        return null;
    // Malaysia
    if (digits.startsWith('60')) {
        return digits;
    }
    if (digits.startsWith('0')) {
        return `60${digits.substring(1)}`;
    }
    // Singapore
    if (digits.startsWith('65')) {
        return digits;
    }
    if (/^[89]\d{7}$/.test(digits)) {
        return `65${digits}`;
    }
    return null;
}
