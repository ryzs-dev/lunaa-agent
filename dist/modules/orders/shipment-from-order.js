"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildShipmentFromOrder = buildShipmentFromOrder;
function hasExistingTracking(tracking) {
    var _a;
    if (!tracking)
        return false;
    if (Array.isArray(tracking)) {
        return tracking.some((t) => { var _a; return Boolean((_a = t === null || t === void 0 ? void 0 : t.tracking_number) === null || _a === void 0 ? void 0 : _a.trim()); });
    }
    return Boolean((_a = tracking.tracking_number) === null || _a === void 0 ? void 0 : _a.trim());
}
const ALLOWED_SERVICE_PROVIDERS = new Set([
    'spx',
    'dhl',
    'jnt',
    'kex',
    'lex',
    'poslaju',
    'flash',
    'sf_express',
]);
function buildShipmentFromOrder(order, options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
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
    const isSingapore = ((_g = order.addresses) === null || _g === void 0 ? void 0 : _g.country) === 'Singapore' || phone.startsWith('+65');
    const requestedProvider = (_h = options === null || options === void 0 ? void 0 : options.serviceProvider) === null || _h === void 0 ? void 0 : _h.trim().toLowerCase();
    const serviceProvider = requestedProvider && ALLOWED_SERVICE_PROVIDERS.has(requestedProvider)
        ? requestedProvider
        : 'spx';
    const shipment = {
        serviceProvider,
        clientAddress: {
            fullName: ((_k = (_j = order.customers) === null || _j === void 0 ? void 0 : _j.name) === null || _k === void 0 ? void 0 : _k.trim()) || 'Customer',
            countryCode: isSingapore ? '+65' : '+60',
            phone,
            email: ((_m = (_l = order.customers) === null || _l === void 0 ? void 0 : _l.email) === null || _m === void 0 ? void 0 : _m.trim()) || 'noreply@lunaa.local',
            line1: fullAddress,
            line2: '',
            city: ((_p = (_o = order.addresses) === null || _o === void 0 ? void 0 : _o.city) === null || _p === void 0 ? void 0 : _p.trim()) || '',
            postcode,
            state: ((_r = (_q = order.addresses) === null || _q === void 0 ? void 0 : _q.state) === null || _r === void 0 ? void 0 : _r.trim()) || '',
            country: isSingapore ? 'Singapore' : 'Malaysia',
        },
        kg: 0.5,
        price: 0,
        content: ((_s = order.shipment_description) === null || _s === void 0 ? void 0 : _s.trim()) || 'Feminine Products',
        content_value: Number(order.total_amount) || 0,
        isDropoff: (options === null || options === void 0 ? void 0 : options.isDropoff) === true,
    };
    return { shipment };
}
