"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConverraSyncConfigured = isConverraSyncConfigured;
exports.toConverraContact = toConverraContact;
exports.syncCustomerToConverra = syncCustomerToConverra;
/**
 * Syncs Lunaa customers into Converra as WhatsApp contacts.
 *
 * Event types sent to Converra's bridge (see converra-forwarder.ts):
 *   customer.upserted        — one customer, fired after create/update
 *   customer.batch_upserted  — up to 500 customers (backfill script)
 *
 * Segment names become Converra tags, so Converra broadcasts can target Lunaa segments.
 * Marketing consent is only sent when the customer row has the consent columns
 * (marketing_opt_in_status / _at / _source); otherwise Converra keeps what it knows.
 */
const converra_forwarder_1 = require("./converra-forwarder");
const supabase_1 = require("../supabase");
function isConverraSyncConfigured() {
    var _a, _b, _c;
    return Boolean(((_a = process.env.CONVERRA_API_URL) === null || _a === void 0 ? void 0 : _a.trim()) &&
        ((_b = process.env.CONVERRA_BUSINESS_ID) === null || _b === void 0 ? void 0 : _b.trim()) &&
        ((_c = process.env.CONVERRA_BRIDGE_API_KEY) === null || _c === void 0 ? void 0 : _c.trim()));
}
function toConverraContact(customer, segmentNames = []) {
    var _a;
    const tags = [...segmentNames];
    if (customer.repeat_customer === 'returning')
        tags.push('returning-customer');
    return Object.assign({ id: customer.id, phone_number: customer.phone_number, name: customer.name || customer.fb_name || null, email: customer.email || null, tags }, (customer.marketing_opt_in_status
        ? {
            marketing_opt_in: customer.marketing_opt_in_status,
            marketing_opt_in_at: (_a = customer.marketing_opt_in_at) !== null && _a !== void 0 ? _a : null,
            marketing_opt_in_source: customer.marketing_opt_in_source || 'lunaa_crm',
        }
        : {}));
}
async function loadSegmentNames(customerId) {
    const { data, error } = await supabase_1.supabase
        .from('segment_members')
        .select('segments(name)')
        .eq('user_id', customerId);
    if (error || !data)
        return [];
    return data
        .map((row) => { var _a; return (_a = row.segments) === null || _a === void 0 ? void 0 : _a.name; })
        .filter((name) => Boolean(name));
}
/** Fire-and-forget: never blocks or fails the caller's customer write. */
function syncCustomerToConverra(customer) {
    if (!(customer === null || customer === void 0 ? void 0 : customer.id) || !customer.phone_number || !isConverraSyncConfigured())
        return;
    void (async () => {
        var _a;
        try {
            const segmentNames = await loadSegmentNames(customer.id);
            await (0, converra_forwarder_1.forwardToConverra)({
                event_type: 'customer.upserted',
                external_event_id: `customer:${customer.id}:${(_a = customer.updated_at) !== null && _a !== void 0 ? _a : Date.now()}`,
                business_id: process.env.CONVERRA_BUSINESS_ID.trim(),
                timestamp: new Date().toISOString(),
                payload: toConverraContact(customer, segmentNames),
            });
        }
        catch (err) {
            console.error('[ConverraContactSync] Failed to sync customer:', customer.id, err);
        }
    })();
}
