"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isConverraSyncConfigured = void 0;
exports.toConverraContact = toConverraContact;
exports.syncCustomerToConverra = syncCustomerToConverra;
/**
 * Syncs Lunaa customers into Converra as WhatsApp contacts.
 *
 * Event types sent to Converra's bridge (see converra-forwarder.ts):
 *   customer.upserted        — one customer, fired after create/update (when auto-sync is on)
 *   customer.batch_upserted  — up to 500 customers (full sync)
 *
 * Sync settings (Integrations → Converra → Sync settings):
 *   syncSegments — segment names become Converra tags, so broadcasts can target Lunaa segments
 *   syncEmail    — whether the email address is sent
 *   segmentIds   — only customers in these segments sync (null = all customers)
 * Marketing consent is only sent when the customer row has the consent columns
 * (marketing_opt_in_status / _at / _source); otherwise Converra keeps what it knows.
 */
const converra_forwarder_1 = require("./converra-forwarder");
const converra_connection_1 = require("./converra-connection");
const converra_config_1 = require("./converra-config");
const supabase_1 = require("../supabase");
var converra_connection_2 = require("./converra-connection");
Object.defineProperty(exports, "isConverraSyncConfigured", { enumerable: true, get: function () { return converra_connection_2.isConverraSyncConfigured; } });
function toConverraContact(customer, segmentNames = [], options = {}) {
    var _a, _b, _c;
    const syncSegments = (_a = options.syncSegments) !== null && _a !== void 0 ? _a : true;
    const syncEmail = (_b = options.syncEmail) !== null && _b !== void 0 ? _b : true;
    const tags = syncSegments ? [...segmentNames] : [];
    if (customer.repeat_customer === 'returning')
        tags.push('returning-customer');
    return Object.assign(Object.assign(Object.assign({ id: customer.id, phone_number: customer.phone_number, name: customer.name || customer.fb_name || null }, (syncEmail ? { email: customer.email || null } : {})), { tags }), (customer.marketing_opt_in_status
        ? {
            marketing_opt_in: customer.marketing_opt_in_status,
            marketing_opt_in_at: (_c = customer.marketing_opt_in_at) !== null && _c !== void 0 ? _c : null,
            marketing_opt_in_source: customer.marketing_opt_in_source || 'lunaa_crm',
        }
        : {}));
}
async function loadCustomerSegments(customerId) {
    const { data, error } = await supabase_1.supabase
        .from('segment_members')
        .select('segment_id, segments(name)')
        .eq('user_id', customerId);
    if (error || !data)
        return [];
    return data
        .filter((row) => row.segment_id)
        .map((row) => { var _a, _b; return ({ id: String(row.segment_id), name: (_b = (_a = row.segments) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '' }); });
}
/** Fire-and-forget: never blocks or fails the caller's customer write. */
function syncCustomerToConverra(customer) {
    if (!(customer === null || customer === void 0 ? void 0 : customer.id) || !customer.phone_number)
        return;
    void (async () => {
        var _a;
        try {
            const { config, settings } = await (0, converra_connection_1.getConverraContext)();
            if (!config || !settings.autoSync)
                return;
            const segments = await loadCustomerSegments(customer.id);
            if (!(0, converra_config_1.customerMatchesSegmentFilter)(segments.map((s) => s.id), settings.segmentIds))
                return;
            await (0, converra_forwarder_1.forwardToConverra)({
                event_type: 'customer.upserted',
                external_event_id: `customer:${customer.id}:${(_a = customer.updated_at) !== null && _a !== void 0 ? _a : Date.now()}`,
                timestamp: new Date().toISOString(),
                payload: toConverraContact(customer, segments.map((s) => s.name).filter(Boolean), settings),
            }, config);
        }
        catch (err) {
            console.error('[ConverraContactSync] Failed to sync customer:', customer.id, err);
        }
    })();
}
