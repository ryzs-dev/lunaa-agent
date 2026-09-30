"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRY_NAMES = void 0;
exports.detectAddressCountry = detectAddressCountry;
exports.countryFromPhone = countryFromPhone;
exports.detectCustomerCountry = detectCustomerCountry;
const malaysia_postcodes_1 = require("malaysia-postcodes");
exports.COUNTRY_NAMES = {
    MY: 'Malaysia',
    SG: 'Singapore',
};
const MY_STATES = /\b(johor|kedah|kelantan|melaka|malacca|negeri sembilan|pahang|penang|pulau pinang|perak|perlis|sabah|sarawak|selangor|terengganu|kuala lumpur|putrajaya|labuan)\b/i;
const MY_STREET_WORDS = /\b(jalan|jln|taman|tmn|lorong|kampung|kg|persiaran|lebuh|pangsapuri)\b/i;
const SG_WORDS = /\b(singapore|s'pore)\b/i;
const SG_PREFIXED_POSTCODE = /\bS\s*\(?\d{6}\)?(?!\d)/i;
const SIX_DIGITS = /(?<!\d)\d{6}(?!\d)/;
function hasMalaysianPostcode(text) {
    return [...text.matchAll(/(?<!\d)\d{5}(?!\d)/g)].some((m) => { var _a; return (_a = (0, malaysia_postcodes_1.findPostcode)(m[0], true)) === null || _a === void 0 ? void 0 : _a.found; });
}
// Older import paths defaulted every address to "Malaysia", so the stored
// country is only a last resort after the address text and postcode, and a
// stored "Malaysia" on its own isn't trusted.
function detectAddressCountry(address) {
    var _a, _b, _c, _d, _e;
    const text = (_a = address.full_address) !== null && _a !== void 0 ? _a : '';
    if (SG_WORDS.test(text) || SG_PREFIXED_POSTCODE.test(text))
        return 'SG';
    if (hasMalaysianPostcode(text) || MY_STATES.test(text))
        return 'MY';
    if (SIX_DIGITS.test(text))
        return 'SG';
    const postcode = (_c = (_b = address.postcode) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : '';
    if (/^\d{6}$/.test(postcode))
        return 'SG';
    if (/^\d{5}$/.test(postcode))
        return 'MY';
    if (MY_STREET_WORDS.test(text))
        return 'MY';
    return /^(singapore|sg)$/i.test((_e = (_d = address.country) === null || _d === void 0 ? void 0 : _d.trim()) !== null && _e !== void 0 ? _e : '') ? 'SG' : null;
}
function countryFromPhone(phone) {
    var _a;
    const digits = (_a = phone === null || phone === void 0 ? void 0 : phone.replace(/\D/g, '')) !== null && _a !== void 0 ? _a : '';
    if (digits.startsWith('65'))
        return 'SG';
    if (digits.startsWith('60'))
        return 'MY';
    return null;
}
// Addresses are newest-first; the latest one with a recognisable country wins
// because that's where the customer is currently shipping to.
function detectCustomerCountry(phone, addresses) {
    for (const address of addresses) {
        const country = detectAddressCountry(address);
        if (country)
            return country;
    }
    return countryFromPhone(phone);
}
