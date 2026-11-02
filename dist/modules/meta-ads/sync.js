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
function chunks(since, until, size) {
    const out = [];
    let start = new Date(`${since}T00:00:00Z`);
    const end = new Date(`${until}T00:00:00Z`);
    while (start <= end) {
        const stop = new Date(Math.min(start.getTime() + (size - 1) * 86400000, end.getTime()));
        out.push({ since: start.toISOString().slice(0, 10), until: stop.toISOString().slice(0, 10) });
        start = new Date(stop.getTime() + 86400000);
    }
    return out;
}
// Pulls campaign numbers per day for the last `days` days (each ad account's
// own calendar) and replaces what was stored for those days. Meta keeps
// revising recent days as late conversions come in, so recent days are re-read.
// `only` limits it to some accounts, e.g. one just added.
async function syncInsights(days, only) {
    var _a, _b;
    const conn = await (0, settings_1.connection)();
    if (!conn)
        return { skipped: true };
    const accounts = (0, settings_1.trackedAccounts)(conn.row).filter((a) => !only || only.includes(a.id));
    const results = [];
    const failures = [];
    for (const account of accounts) {
        try {
            results.push(Object.assign({ account: account.id }, (await syncAccount(account, conn.token, days))));
        }
        catch (error) {
            const message = (error === null || error === void 0 ? void 0 : error.response) ? (0, graph_1.graphError)(error) : (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : String(error);
            failures.push(accounts.length > 1 ? `${(_b = account.name) !== null && _b !== void 0 ? _b : account.id}: ${message}` : message);
        }
    }
    // A partial sync (only some accounts) doesn't clear an error from the others.
    if (!only || failures.length)
        await (0, settings_1.markSync)({ error: failures.join(' · ') || null });
    if (failures.length)
        throw new Error(failures.join(' · '));
    return { accounts: results };
}
async function syncAccount(account, token, days) {
    var _a, _b, _c;
    const tz = account.timezone || 'Asia/Kuala_Lumpur';
    const until = ymd(new Date(), tz);
    const since = ymd(new Date(Date.now() - (days - 1) * 86400000), tz);
    const rows = [];
    // Long ranges go in 90-day pieces; Meta times out on a year of daily rows.
    for (const range of chunks(since, until, 90)) {
        let page = await (0, graph_1.graphGet)(`${account.id}/insights`, token, {
            level: 'campaign',
            time_increment: 1,
            time_range: JSON.stringify(range),
            fields: 'campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values',
            limit: 500,
        });
        for (;;) {
            for (const r of (_a = page.data) !== null && _a !== void 0 ? _a : []) {
                rows.push({
                    date: r.date_start,
                    ad_account_id: account.id,
                    currency: account.currency,
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
            page = await (0, graph_1.graphGet)(page.paging.next, token);
        }
    }
    const { error: delError } = await supabase_1.supabase
        .from('meta_ad_insights')
        .delete()
        .eq('ad_account_id', account.id)
        .gte('date', since)
        .lte('date', until);
    if (delError)
        throw delError;
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase_1.supabase.from('meta_ad_insights').insert(rows.slice(i, i + 500));
        if (error)
            throw error;
    }
    return { since, until, rows: rows.length };
}
