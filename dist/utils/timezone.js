"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_TIMEZONE = void 0;
exports.getCurrentMonthKey = getCurrentMonthKey;
exports.resolveMonthKey = resolveMonthKey;
exports.APP_TIMEZONE = 'Asia/Kuala_Lumpur';
function getCurrentMonthKey(date = new Date()) {
    var _a, _b;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: exports.APP_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(date);
    const year = (_a = parts.find((part) => part.type === 'year')) === null || _a === void 0 ? void 0 : _a.value;
    const month = (_b = parts.find((part) => part.type === 'month')) === null || _b === void 0 ? void 0 : _b.value;
    return `${year}-${month}`;
}
function resolveMonthKey(month) {
    if (month && /^\d{4}-\d{2}$/.test(month)) {
        return month;
    }
    return getCurrentMonthKey();
}
