"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanCustomerName = cleanCustomerName;
// Staff often type "Name : Jenny" or "Name :Jenny", so separators and stray
// punctuation can end up in front of the captured name.
const LEADING_PUNCTUATION = /^[\s:：;；,，.。\-–—=]+/;
const TRAILING_PUNCTUATION = /[\s,，;；]+$/;
function cleanCustomerName(value) {
    return value
        .replace(LEADING_PUNCTUATION, '')
        .replace(TRAILING_PUNCTUATION, '')
        .replace(/\s+/g, ' ')
        .trim();
}
