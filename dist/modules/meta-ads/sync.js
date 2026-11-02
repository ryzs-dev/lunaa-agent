"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncInsights = syncInsights;
const supabase_1 = require("../supabase");
const settings_1 = require("./settings");
const graph_1 = require("./graph");
const CONVERSATION_TYPES = ['onsite_conversion.messaging_conversation_started_7d'];
// Meta reports a purchase under several names depending on where it came from;
// omni_purchase already totals them when present.
const PURCHASE_TYPES = [
    'omni_purchase',
    'purchase',
    'offline_conversion.purchase',
    'offsite_conversion.fb_pixel_purchase',
    'onsite_conversion.purchase',
];
function pick(actions, types) {
    for (const type of types) {
        const hit = actions === null || actions === void 0 ? void 0 : actions.find((a) => a.action_type === type);
        if (hit)
            return Number(hit.value) || 0;
    }
    return 0;
}
function ymd(date, timeZone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}
// Pulls campaign numbers per day for the last `days` days (the ad account's
// own calendar) and replaces what was stored for those days. Meta keeps
// revising recent days as late conversions come in, so recent days are re-read.
async function syncInsights(days) {
    var _a, _b, _c, _d;
    const conn = await (0, settings_1.connection)();
    if (!conn)
        return { skipped: true };
    const tz = conn.row.timezone || 'Asia/Kuala_Lumpur';
    const until = ymd(new Date(), tz);
    const since = ymd(new Date(Date.now() - (days - 1) * 86400000), tz);
    try {
        const rows = [];
        let page = await (0, graph_1.graphGet)(`${conn.row.ad_account_id}/insights`, conn.token, {
            level: 'campaign',
            time_increment: 1,
            time_range: JSON.stringify({ since, until }),
            fields: 'campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values',
            limit: 500,
        });
        for (;;) {
            for (const r of (_a = page.data) !== null && _a !== void 0 ? _a : []) {
                rows.push({
                    date: r.date_start,
                    campaign_id: r.campaign_id,
                    campaign_name: (_b = r.campaign_name) !== null && _b !== void 0 ? _b : null,
                    spend: Number(r.spend) || 0,
                    impressions: Number(r.impressions) || 0,
                    reach: Number(r.reach) || 0,
                    clicks: Number(r.clicks) || 0,
                    conversations: pick(r.actions, CONVERSATION_TYPES),
                    purchases: pick(r.actions, PURCHASE_TYPES),
                    purchase_value: pick(r.action_values, PURCHASE_TYPES),
                    synced_at: new Date().toISOString(),
                });
            }
            if (!((_c = page.paging) === null || _c === void 0 ? void 0 : _c.next))
                break;
            page = await (0, graph_1.graphGet)(page.paging.next, conn.token);
        }
        const { error: delError } = await supabase_1.supabase
            .from('meta_ad_insights')
            .delete()
            .gte('date', since)
            .lte('date', until);
        if (delError)
            throw delError;
        for (let i = 0; i < rows.length; i += 500) {
            const { error } = await supabase_1.supabase.from('meta_ad_insights').insert(rows.slice(i, i + 500));
            if (error)
                throw error;
        }
        await (0, settings_1.markSync)({});
        return { since, until, rows: rows.length };
    }
    catch (error) {
        const message = (error === null || error === void 0 ? void 0 : error.response) ? (0, graph_1.graphError)(error) : (_d = error === null || error === void 0 ? void 0 : error.message) !== null && _d !== void 0 ? _d : String(error);
        await (0, settings_1.markSync)({ error: message });
        throw new Error(message);
    }
}
