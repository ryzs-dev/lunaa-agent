"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildShipmentFromOrder = buildShipmentFromOrder;
const country_1 = require("../../utils/country");
function hasExistingTracking(tracking) {
    var _a;
    if (!tracking)
        return false;
    if (Array.isArray(tracking)) {
        return tracking.some((t) => { var _a; return Boolean((_a = t === null || t === void 0 ? void 0 : t.tracking_number) === null || _a === void 0 ? void 0 : _a.trim()); });
    }
    return Boolean((_a = tracking.tracking_number) === null || _a === void 0 ? void 0 : _a.trim());
}
// Parcel Daily courier codes. Whether a courier serves a given route is checked
// against its live quote when the shipment is booked.
const ALLOWED_SERVICE_PROVIDERS = new Set([
    'spx',
    'spxpromo',
    'dhl',
    'jnt',
    'jntcargo',
    'kex',
    'lex',
    'poslaju',
    'flash',
    'ninjavan',
    'citylink',
    'best',
    'bestcargo',
    'lineclear',
    'teleport',
    'redly',
    'aramex',
    'sfexd',
    'sfeconomy',
]);
const LEGACY_SERVICE_PROVIDERS = { sf_express: 'sfexd' };
function buildShipmentFromOrder(order, options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    if (hasExistingTracking(order.order_tracking)) {
        return { error: 'Order already has a tracking number' };
    }
    const phone = (_b = (_a = order.customers) === null || _a === void 0 ? void 0 : _a.phone_number) === null || _b === void 0 ? void 0 : _b.trim();
    const fullAddress = (_d = (_c = order.addresses) === null || _c === void 0 ? void 0 : _c.full_address) === null || _d === void 0 ? void 0 : _d.trim();
    const postcode = (_f = (_e = order.addresses) === null || _e === void 0 ? void 0 : _e.postcode) === null || _f === void 0 ? void 0 : _f.trim();
    if (!phone) {
        return { error: 'Missing customer phone number' };
    }
    if (!fullAddress || !postcode) {
        return { error: 'Missing delivery address or postcode' };
    }
    // The courier gets the phone with its country code stripped, so the code has
    // to follow the phone even when a Singapore customer ships to Malaysia.
    const phoneIsSingapore = (0, country_1.countryFromPhone)(phone) === 'SG';
    const addressCountry = (_h = (_g = order.addresses) === null || _g === void 0 ? void 0 : _g.country) === null || _h === void 0 ? void 0 : _h.trim();
    const isSingapore = addressCountry
        ? addressCountry === 'Singapore'
        : phoneIsSingapore;
    const requested = (_j = options === null || options === void 0 ? void 0 : options.serviceProvider) === null || _j === void 0 ? void 0 : _j.trim().toLowerCase();
    const serviceProvider = requested
        ? (_k = LEGACY_SERVICE_PROVIDERS[requested]) !== null && _k !== void 0 ? _k : requested
        : 'spx';
    if (!ALLOWED_SERVICE_PROVIDERS.has(serviceProvider)) {
        return { error: `Unsupported courier "${options === null || options === void 0 ? void 0 : options.serviceProvider}"` };
    }
    const shipment = {
        serviceProvider,
        clientAddress: {
            fullName: ((_m = (_l = order.customers) === null || _l === void 0 ? void 0 : _l.name) === null || _m === void 0 ? void 0 : _m.trim()) || 'Customer',
            countryCode: phoneIsSingapore ? '+65' : '+60',
            phone,
            email: ((_p = (_o = order.customers) === null || _o === void 0 ? void 0 : _o.email) === null || _p === void 0 ? void 0 : _p.trim()) || 'noreply@lunaa.local',
            line1: fullAddress,
            line2: '',
            city: ((_r = (_q = order.addresses) === null || _q === void 0 ? void 0 : _q.city) === null || _r === void 0 ? void 0 : _r.trim()) || '',
            postcode,
            state: ((_t = (_s = order.addresses) === null || _s === void 0 ? void 0 : _s.state) === null || _t === void 0 ? void 0 : _t.trim()) || '',
            country: isSingapore ? 'Singapore' : 'Malaysia',
        },
        // 0 means use the parcel weight saved in Parcel Daily settings.
        kg: 0,
        price: 0,
        content: ((_u = order.shipment_description) === null || _u === void 0 ? void 0 : _u.trim()) || 'Feminine Products',
        content_value: Number(order.total_amount) || 0,
        isDropoff: (options === null || options === void 0 ? void 0 : options.isDropoff) === true,
    };
    return { shipment };
}
