"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShippingRulesError = void 0;
exports.getShippingRules = getShippingRules;
exports.updateShippingRules = updateShippingRules;
exports.isCodOrder = isCodOrder;
exports.bookShipment = bookShipment;
const supabase_1 = require("../supabase");
const service_1 = require("../parcel-daily/service");
const shipment_from_order_1 = require("../orders/shipment-from-order");
const PARCEL_DAILY_API_URL = process.env.PARCEL_DAILY_API_URL || 'http://localhost:4002/api/parceldaily';
const parcelDaily = new service_1.ParcelDailyService(PARCEL_DAILY_API_URL);
class ShippingRulesError extends Error {
}
exports.ShippingRulesError = ShippingRulesError;
async function getShippingRules() {
    const { data, error } = await supabase_1.supabase.from('shipping_rules').select('*').eq('id', 1).single();
    if (error)
        throw error;
    return data;
}
async function updateShippingRules(input) {
    const patch = {
        updated_at: new Date().toISOString(),
        updated_by: typeof input.updated_by === 'string' ? input.updated_by : null,
    };
    for (const field of ['fallback_courier', 'cod_courier']) {
        if (input[field] === undefined)
            continue;
        const value = input[field];
        if (value !== null && (typeof value !== 'string' || !(0, shipment_from_order_1.isBookableCourier)(value))) {
            throw new ShippingRulesError(`Unknown courier "${String(value)}"`);
        }
        patch[field] = value;
    }
    if (input.detect_cod !== undefined) {
        if (typeof input.detect_cod !== 'boolean')
            throw new ShippingRulesError('detect_cod must be true or false');
        patch.detect_cod = input.detect_cod;
    }
    const { error } = await supabase_1.supabase.from('shipping_rules').update(patch).eq('id', 1);
    if (error)
        throw error;
    return getShippingRules();
}
// Staff write "COD" after the customer's name; a payment method of COD counts too.
function isCodOrder(order) {
    var _a, _b, _c;
    return /\bcod\b/i.test((_a = order.payment_method) !== null && _a !== void 0 ? _a : '') || /\bcod\b/i.test((_c = (_b = order.customers) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : '');
}
/**
 * Books one order with Parcel Daily using the shipping rules:
 * COD orders go to the COD courier and collect the order total; everything
 * else uses `courier` (a person's choice) or the Parcel Daily default. If that
 * booking fails, it is tried once more with the fallback courier.
 */
async function bookShipment(order, options = {}) {
    var _a;
    const [rules, defaults] = await Promise.all([
        getShippingRules(),
        parcelDaily
            .getSettings()
            .then((r) => { var _a, _b; return ((_b = (_a = r === null || r === void 0 ? void 0 : r.data) === null || _a === void 0 ? void 0 : _a.defaults) !== null && _b !== void 0 ? _b : {}); })
            .catch(() => ({})),
    ]);
    const cod = rules.detect_cod && isCodOrder(order) ? Number(order.total_amount) || 0 : 0;
    const primary = (cod > 0 && rules.cod_courier) || options.courier || defaults.courier || 'spx';
    const isDropoff = (_a = options.isDropoff) !== null && _a !== void 0 ? _a : defaults.isDropoff === true;
    const attempt = async (courier) => {
        var _a, _b;
        const built = (0, shipment_from_order_1.buildShipmentFromOrder)(order, { serviceProvider: courier, isDropoff, cod });
        if (built.error || !built.shipment) {
            return { ok: false, error: (_a = built.error) !== null && _a !== void 0 ? _a : 'Could not build the shipment', fatal: true };
        }
        const result = await parcelDaily.createShipment(built.shipment, order.id);
        if ((result === null || result === void 0 ? void 0 : result.success) === false) {
            return {
                ok: false,
                error: typeof result.message === 'string' ? result.message : 'Parcel Daily shipment failed',
                fatal: false,
                data: result,
            };
        }
        return { ok: true, data: (_b = result === null || result === void 0 ? void 0 : result.data) !== null && _b !== void 0 ? _b : result };
    };
    const first = await attempt(primary);
    if (first.ok)
        return { success: true, courier: primary, usedFallback: false, cod, data: first.data };
    // Address or order problems fail the same way with any courier, so only a
    // courier-side failure moves on to the fallback.
    const fallback = rules.fallback_courier;
    if (first.fatal || !fallback || fallback === primary) {
        return { success: false, courier: primary, error: first.error, data: 'data' in first ? first.data : undefined };
    }
    const second = await attempt(fallback);
    if (second.ok) {
        return {
            success: true,
            courier: fallback,
            usedFallback: true,
            cod,
            note: `${primary} failed (${first.error}); booked with ${fallback}`,
            data: second.data,
        };
    }
    return {
        success: false,
        courier: fallback,
        error: `${primary}: ${first.error}; ${fallback}: ${second.error}`,
        data: 'data' in second ? second.data : undefined,
    };
}
