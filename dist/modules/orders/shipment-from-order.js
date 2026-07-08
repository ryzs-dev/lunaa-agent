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
function buildShipmentFromOrder(order, options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
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
    const shipment = {
        serviceProvider: 'spx',
        clientAddress: {
            fullName: ((_j = (_h = order.customers) === null || _h === void 0 ? void 0 : _h.name) === null || _j === void 0 ? void 0 : _j.trim()) || 'Customer',
            countryCode: isSingapore ? '+65' : '+60',
            phone,
            email: ((_l = (_k = order.customers) === null || _k === void 0 ? void 0 : _k.email) === null || _l === void 0 ? void 0 : _l.trim()) || 'noreply@lunaa.local',
            line1: fullAddress,
            line2: '',
            city: ((_o = (_m = order.addresses) === null || _m === void 0 ? void 0 : _m.city) === null || _o === void 0 ? void 0 : _o.trim()) || '',
            postcode,
            state: ((_q = (_p = order.addresses) === null || _p === void 0 ? void 0 : _p.state) === null || _q === void 0 ? void 0 : _q.trim()) || '',
            country: isSingapore ? 'Singapore' : 'Malaysia',
        },
        kg: 0.5,
        price: 0,
        content: ((_r = order.shipment_description) === null || _r === void 0 ? void 0 : _r.trim()) || 'Feminine Products',
        content_value: Number(order.total_amount) || 0,
        isDropoff: (options === null || options === void 0 ? void 0 : options.isDropoff) === true,
    };
    return { shipment };
}
