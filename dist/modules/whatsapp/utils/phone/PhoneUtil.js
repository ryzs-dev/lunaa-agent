"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhoneUtil = void 0;
// src/utils/phone/PhoneUtil.ts
const SGPhoneFormatter_1 = require("./SGPhoneFormatter");
const MYPhoneFormatter_1 = require("./MYPhoneFormatter");
class PhoneUtil {
    static normalize(phone) {
        for (const f of this.formatters) {
            const result = f.normalize(phone);
            if (result)
                return result;
        }
        return phone.replace(/\D/g, ""); // fallback
    }
    static extract(text) {
        for (const f of this.formatters) {
            const result = f.extract(text);
            if (result)
                return result;
        }
        return null;
    }
}
exports.PhoneUtil = PhoneUtil;
PhoneUtil.formatters = [
    new SGPhoneFormatter_1.SingaporePhoneFormatter(),
    new MYPhoneFormatter_1.MalaysiaPhoneFormatter(),
];
