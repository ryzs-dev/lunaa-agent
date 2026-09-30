"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sheetFieldMap = void 0;
exports.normalizeHeader = normalizeHeader;
exports.quoteSheetName = quoteSheetName;
exports.nextSheetRowNumber = nextSheetRowNumber;
exports.extraGridRowsNeeded = extraGridRowsNeeded;
exports.sheetRowWriteRange = sheetRowWriteRange;
exports.buildSheetRow = buildSheetRow;
exports.normalizePhoneDigits = normalizePhoneDigits;
exports.sheetRowAlreadyExists = sheetRowAlreadyExists;
exports.isGridLimitError = isGridLimitError;
const HEADER_ALIASES = {
    'fb name': 'fbname',
    fb_name: 'fbname',
    remarks: 'remark',
    bloom: 'blossom',
    'couriers company': 'courier',
};
function normalizeHeader(header) {
    var _a;
    const normalized = header.toLowerCase().trim().replace(/\s+/g, ' ');
    return (_a = HEADER_ALIASES[normalized]) !== null && _a !== void 0 ? _a : normalized;
}
function quoteSheetName(sheetName) {
    return `'${sheetName.replace(/'/g, "''")}'`;
}
function nextSheetRowNumber(existingRows) {
    return existingRows.length + 1;
}
function extraGridRowsNeeded(currentRowCount, nextRowNumber, buffer = 100) {
    if (nextRowNumber <= currentRowCount)
        return 0;
    return Math.max(buffer, nextRowNumber - currentRowCount);
}
function sheetRowWriteRange(sheetName, existingRows) {
    return `${quoteSheetName(sheetName)}!A${nextSheetRowNumber(existingRows)}`;
}
function buildSheetRow(payload, headers) {
    return headers.map((header) => {
        const normalized = normalizeHeader(header);
        const resolver = exports.sheetFieldMap[normalized];
        if (resolver) {
            const value = resolver(payload);
            return value === undefined || value === null ? '' : value;
        }
        if (payload.productQuantityMap) {
            const matchKey = Object.keys(payload.productQuantityMap).find((key) => normalizeHeader(key) === normalized);
            if (matchKey) {
                const quantity = payload.productQuantityMap[matchKey];
                return quantity === undefined || quantity === null ? '' : quantity;
            }
        }
        return '';
    });
}
function normalizePhoneDigits(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.startsWith('60') && digits.length >= 11)
        return digits.slice(2);
    if (digits.startsWith('0'))
        return digits.slice(1);
    return digits;
}
function sheetRowAlreadyExists(rows, payload) {
    var _a;
    if (rows.length < 2)
        return false;
    const headers = (rows[0] || []).map((header) => String(header !== null && header !== void 0 ? header : ''));
    const phoneIdx = headers.findIndex((header) => normalizeHeader(header) === 'phone number');
    const dateIdx = headers.findIndex((header) => normalizeHeader(header) === 'order date');
    const totalIdx = headers.findIndex((header) => normalizeHeader(header) === 'total paid (rm)');
    const shipIdx = headers.findIndex((header) => normalizeHeader(header) === 'shipment description');
    const phone = normalizePhoneDigits(payload.customer.phone_number);
    const date = String(payload.order.order_date || '').slice(0, 10);
    const total = String((_a = payload.order.total_amount) !== null && _a !== void 0 ? _a : '');
    const shipment = String(payload.order.shipment_description || '')
        .replace(/\s+/g, '')
        .toLowerCase();
    return rows.slice(1).some((row) => {
        var _a, _b, _c, _d;
        const cells = row;
        const rowPhone = phoneIdx >= 0 ? normalizePhoneDigits(String((_a = cells[phoneIdx]) !== null && _a !== void 0 ? _a : '')) : '';
        const rowDate = dateIdx >= 0 ? String((_b = cells[dateIdx]) !== null && _b !== void 0 ? _b : '').slice(0, 10) : '';
        const rowTotal = totalIdx >= 0 ? String((_c = cells[totalIdx]) !== null && _c !== void 0 ? _c : '') : '';
        const rowShip = shipIdx >= 0
            ? String((_d = cells[shipIdx]) !== null && _d !== void 0 ? _d : '').replace(/\s+/g, '').toLowerCase()
            : '';
        return (phone &&
            phone === rowPhone &&
            date === rowDate &&
            total === rowTotal &&
            shipment === rowShip);
    });
}
function isGridLimitError(error) {
    const message = error instanceof Error
        ? error.message
        : String((error === null || error === void 0 ? void 0 : error.message) || error);
    return message.toLowerCase().includes('exceeds grid limits');
}
exports.sheetFieldMap = {
    'order date': ({ order }) => order.order_date || '',
    fbname: () => '',
    name: ({ customer }) => customer.name || '',
    'payment method': ({ order }) => order.payment_method || '',
    'total paid (rm)': ({ order }) => order.total_amount || '',
    'shipment description': ({ order }) => order.shipment_description || '',
    address: ({ address }) => address.full_address || '',
    city: ({ address }) => address.city || '',
    postcode: ({ address }) => address.postcode || '',
    state: ({ address }) => address.state || '',
    'phone number': ({ customer }) => customer.phone_number || '',
    email: ({ customer }) => customer.email || '',
    'new/repeat': () => '',
    'agent by / under': () => 'WhatsApp Bot',
    currency: ({ customer }) => { var _a; return ((_a = customer.phone_number) === null || _a === void 0 ? void 0 : _a.startsWith('65')) ? 'SGD' : 'MYR'; },
    status: () => 'Pending',
    remark: ({ remark }) => remark || '',
};
