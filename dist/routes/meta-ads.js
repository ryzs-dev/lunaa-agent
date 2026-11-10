"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metaAdsRouter = void 0;
exports.campaignTotals = campaignTotals;
const express_1 = __importDefault(require("express"));
const supabase_1 = require("../modules/supabase");
const settings_1 = require("../modules/meta-ads/settings");
const scheduler_1 = require("../modules/meta-ads/scheduler");
const oauth_1 = require("../modules/meta-ads/oauth");
const pages_1 = require("../modules/meta-ads/pages");
const timezone_1 = require("../utils/timezone");
exports.metaAdsRouter = express_1.default.Router();
exports.metaAdsRouter.get('/settings', async (_req, res) => {
    try {
        res.json({ success: true, settings: await (0, settings_1.publicSettings)() });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
exports.metaAdsRouter.put('/settings', async (req, res) => {
    var _a;
    try {
        const { ad_account_id, access_token, dataset_id, send_conversions } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        const { settings, needsBackfill } = await (0, settings_1.updateSettings)({
            ad_account_id: typeof ad_account_id === 'string' ? ad_account_id : undefined,
            access_token: typeof access_token === 'string' ? access_token : undefined,
            dataset_id: dataset_id === null || typeof dataset_id === 'string' ? dataset_id : undefined,
            send_conversions: typeof send_conversions === 'boolean' ? send_conversions : undefined,
        });
        // A new connection pulls the last 90 days in the background.
        if (needsBackfill)
            (0, scheduler_1.runSync)(scheduler_1.BACKFILL_DAYS).catch((e) => console.error('[meta-ads] backfill failed:', e.message));
        res.json({ success: true, settings });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// Continue with Facebook: the CRM sends the browser here, Meta sends it back
// to /oauth/callback, and that returns it to the CRM to pick an ad account.
exports.metaAdsRouter.get('/oauth/start', (req, res) => {
    const returnTo = typeof req.query.return_to === 'string' ? req.query.return_to : (0, oauth_1.defaultReturn)();
    try {
        res.redirect((0, oauth_1.startUrl)(returnTo));
    }
    catch (error) {
        const back = new URL((0, oauth_1.defaultReturn)());
        back.searchParams.set('meta', 'error');
        back.searchParams.set('reason', error.message);
        res.redirect(back.toString());
    }
});
exports.metaAdsRouter.get('/oauth/callback', async (req, res) => {
    const result = await (0, oauth_1.handleCallback)(req.query);
    // Signing in again clears an old sync error; a first connection pulls 13 months.
    if (result.connected) {
        (result.backfill ? (0, scheduler_1.runSync)(scheduler_1.BACKFILL_DAYS) : (0, scheduler_1.runSync)()).catch((e) => console.error('[meta-ads] sync after sign-in failed:', e.message));
    }
    res.redirect(result.url);
});
exports.metaAdsRouter.get('/oauth/accounts', async (_req, res) => {
    var _a, _b, _c, _d;
    try {
        res.json(Object.assign({ success: true }, (await (0, oauth_1.listAdAccounts)())));
    }
    catch (error) {
        res.status(400).json({ success: false, message: (_d = (_c = (_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) !== null && _d !== void 0 ? _d : error.message });
    }
});
exports.metaAdsRouter.get('/oauth/datasets', async (req, res) => {
    var _a, _b, _c, _d, _e;
    try {
        const account = String((_a = req.query.account) !== null && _a !== void 0 ? _a : '');
        if (!/^act_\d+$/.test(account))
            throw new Error('Pick an ad account');
        res.json({ success: true, datasets: await (0, oauth_1.listDatasets)(account) });
    }
    catch (error) {
        res.status(400).json({ success: false, message: (_e = (_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message) !== null && _e !== void 0 ? _e : error.message });
    }
});
// Finish signing in: save the chosen ad account (and dataset) with the token.
exports.metaAdsRouter.post('/oauth/finish', async (req, res) => {
    var _a;
    try {
        const { ad_account_id, dataset_id } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        if (typeof ad_account_id !== 'string' || !ad_account_id)
            throw new Error('Pick an ad account');
        const pending = await (0, oauth_1.takePendingToken)();
        const { settings, needsBackfill } = await (0, settings_1.updateSettings)(Object.assign({ ad_account_id, access_token: pending.token, via: 'facebook', by: pending.user, expires_at: pending.expiresAt }, (typeof dataset_id === 'string' ? { dataset_id: dataset_id || null } : {})));
        await (0, oauth_1.clearPending)();
        if (needsBackfill)
            (0, scheduler_1.runSync)(scheduler_1.BACKFILL_DAYS).catch((e) => console.error('[meta-ads] backfill failed:', e.message));
        res.json({ success: true, settings: await (0, settings_1.publicSettings)() });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
exports.metaAdsRouter.post('/oauth/cancel', async (_req, res) => {
    try {
        await (0, oauth_1.clearPending)();
        res.json({ success: true, settings: await (0, settings_1.publicSettings)() });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
exports.metaAdsRouter.delete('/settings', async (_req, res) => {
    try {
        await (0, settings_1.disconnect)();
        res.json({ success: true, settings: await (0, settings_1.publicSettings)() });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
exports.metaAdsRouter.post('/sync', async (_req, res) => {
    try {
        const result = await (0, scheduler_1.runSync)();
        res.json({ success: true, result, settings: await (0, settings_1.publicSettings)() });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// Campaign totals for a month (or a single day), highest spend first.
exports.metaAdsRouter.get('/campaigns', async (req, res) => {
    try {
        let from;
        let to;
        if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
            from = to = req.query.date;
        }
        else {
            const month = (0, timezone_1.resolveMonthKey)(typeof req.query.month === 'string' ? req.query.month : undefined);
            from = `${month}-01`;
            const [y, m] = month.split('-').map(Number);
            to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        }
        res.json({ success: true, from, to, campaigns: await campaignTotals(from, to) });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// Every ad account the saved sign-in can open, to choose extra ones from.
exports.metaAdsRouter.get('/accounts/available', async (_req, res) => {
    var _a, _b, _c, _d;
    try {
        res.json(Object.assign({ success: true }, (await (0, oauth_1.listAdAccounts)())));
    }
    catch (error) {
        res.status(400).json({ success: false, message: (_d = (_c = (_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) !== null && _d !== void 0 ? _d : error.message });
    }
});
// Facebook pages the sign-in manages, and one page's insights for a period.
exports.metaAdsRouter.get('/pages', async (_req, res) => {
    var _a, _b, _c, _d;
    try {
        res.json({ success: true, pages: await (0, pages_1.listPages)() });
    }
    catch (error) {
        res.status(400).json({ success: false, message: (_d = (_c = (_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) !== null && _d !== void 0 ? _d : error.message });
    }
});
exports.metaAdsRouter.get('/pages/:id/report', async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
    try {
        const report = await (0, pages_1.pageReport)(req.params.id, String((_a = req.query.from) !== null && _a !== void 0 ? _a : ''), String((_b = req.query.to) !== null && _b !== void 0 ? _b : ''));
        res.json({ success: true, report });
    }
    catch (error) {
        res.status(400).json({ success: false, message: (_f = (_e = (_d = (_c = error === null || error === void 0 ? void 0 : error.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error) === null || _e === void 0 ? void 0 : _e.message) !== null && _f !== void 0 ? _f : error.message });
    }
});
// The extra ad accounts synced for the Ads page (the main one stays as is).
exports.metaAdsRouter.put('/accounts', async (req, res) => {
    var _a;
    try {
        const ids = (_a = req.body) === null || _a === void 0 ? void 0 : _a.extra;
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
            throw new Error('Send a list of ad account IDs');
        const { settings, added } = await (0, settings_1.setExtraAccounts)(ids);
        if (added.length) {
            (0, scheduler_1.runSync)(scheduler_1.BACKFILL_DAYS, added).catch((e) => console.error('[meta-ads] backfill failed:', e.message));
        }
        res.json({ success: true, settings });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// Switching to an account on the Ads page that isn't synced yet adds it.
exports.metaAdsRouter.post('/accounts/add', async (req, res) => {
    var _a;
    try {
        const id = (_a = req.body) === null || _a === void 0 ? void 0 : _a.id;
        if (typeof id !== 'string' || !id)
            throw new Error('Pick an ad account');
        const { settings, added } = await (0, settings_1.addExtraAccount)(id);
        if (added.length) {
            (0, scheduler_1.runSync)(scheduler_1.BACKFILL_DAYS, added).catch((e) => console.error('[meta-ads] backfill failed:', e.message));
        }
        res.json({ success: true, settings });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Everything the Ads page shows for a date range: totals, each day with the
// CRM's sales beside the spend, and each campaign. Days are Malaysia days.
exports.metaAdsRouter.get('/report', async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    try {
        const from = String((_a = req.query.from) !== null && _a !== void 0 ? _a : '');
        const to = String((_b = req.query.to) !== null && _b !== void 0 ? _b : '');
        if (!DAY.test(from) || !DAY.test(to) || from > to) {
            return res.status(400).json({ success: false, message: 'Pick a start and end date.' });
        }
        const span = (Date.parse(to) - Date.parse(from)) / 86400000;
        if (span > 400) {
            return res.status(400).json({ success: false, message: 'Pick at most about a year at a time.' });
        }
        const conn = await (0, settings_1.connection)();
        if (!conn)
            return res.status(400).json({ success: false, message: 'Connect Meta ads first.' });
        const tracked = (0, settings_1.trackedAccounts)(conn.row);
        // "all" adds up the accounts in the main account's currency.
        const wanted = String((_c = req.query.account) !== null && _c !== void 0 ? _c : 'all');
        const chosen = wanted === 'all'
            ? tracked.filter((a) => a.currency === conn.row.currency)
            : tracked.filter((a) => a.id === wanted);
        if (!chosen.length)
            return res.status(400).json({ success: false, message: 'That ad account isn’t connected.' });
        const ids = chosen.map((a) => a.id);
        const currency = chosen[0].currency;
        const [campaigns, insights, sales, first, last] = await Promise.all([
            campaignTotals(from, to, ids),
            supabase_1.supabase
                .from('meta_ad_insights')
                .select('date, spend, impressions, clicks, conversations, purchases, purchase_value')
                .in('ad_account_id', ids)
                .gte('date', from)
                .lte('date', to)
                .limit(20000),
            supabase_1.supabase.rpc('get_sales_by_day', { first_day: from, last_day: to }),
            supabase_1.supabase.from('meta_ad_insights').select('date').in('ad_account_id', ids).order('date').limit(1),
            supabase_1.supabase.from('meta_ad_insights').select('date').in('ad_account_id', ids).gt('spend', 0).order('date', { ascending: false }).limit(1),
        ]);
        if (insights.error)
            throw insights.error;
        if (sales.error)
            throw sales.error;
        const ads = new Map();
        for (const r of (_d = insights.data) !== null && _d !== void 0 ? _d : []) {
            const d = (_e = ads.get(r.date)) !== null && _e !== void 0 ? _e : { spend: 0, impressions: 0, clicks: 0, conversations: 0, purchases: 0, purchase_value: 0 };
            for (const k of Object.keys(d))
                d[k] += Number(r[k]) || 0;
            ads.set(r.date, d);
        }
        const round = (n) => Math.round(n * 100) / 100;
        const days = ((_f = sales.data) !== null && _f !== void 0 ? _f : []).map((s) => {
            var _a, _b, _c, _d, _e;
            const a = (_a = ads.get(s.day)) !== null && _a !== void 0 ? _a : {};
            return {
                date: s.day,
                spend: round((_b = a.spend) !== null && _b !== void 0 ? _b : 0),
                impressions: (_c = a.impressions) !== null && _c !== void 0 ? _c : 0,
                clicks: (_d = a.clicks) !== null && _d !== void 0 ? _d : 0,
                conversations: (_e = a.conversations) !== null && _e !== void 0 ? _e : 0,
                orders: Number(s.orders),
                revenue: Number(s.revenue),
                chat_orders: Number(s.chat_orders),
                chat_revenue: Number(s.chat_revenue),
                new_customers: Number(s.new_customers),
            };
        });
        const sum = (key) => days.reduce((t, d) => t + d[key], 0);
        const purchases = campaigns.reduce((t, c) => t + c.purchases, 0);
        const purchaseValue = campaigns.reduce((t, c) => t + c.purchase_value, 0);
        const totals = {
            spend: round(sum('spend')),
            impressions: sum('impressions'),
            clicks: sum('clicks'),
            conversations: sum('conversations'),
            purchases,
            purchase_value: round(purchaseValue),
            orders: sum('orders'),
            revenue: round(sum('revenue')),
            chat_orders: sum('chat_orders'),
            chat_revenue: round(sum('chat_revenue')),
            new_customers: sum('new_customers'),
        };
        res.json({
            success: true,
            from,
            to,
            account: wanted === 'all' ? 'all' : ids[0],
            accounts: chosen,
            currency,
            data_since: (_j = (_h = (_g = first.data) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.date) !== null && _j !== void 0 ? _j : null,
            last_spend_day: (_m = (_l = (_k = last.data) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.date) !== null && _m !== void 0 ? _m : null,
            totals,
            days,
            campaigns,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// Without `accounts`, the main account only (what the dashboard and the
// export show beside sales). Other accounts are for the Ads page.
async function campaignTotals(from, to, accounts) {
    var _a;
    let ids = accounts;
    if (!ids) {
        const conn = await (0, settings_1.connection)();
        ids = conn ? [conn.row.ad_account_id] : [];
    }
    if (!ids.length)
        return [];
    const { data, error } = await supabase_1.supabase
        .from('meta_ad_insights')
        .select('date, ad_account_id, campaign_id, campaign_name, spend, impressions, reach, clicks, conversations, purchases, purchase_value')
        .in('ad_account_id', ids)
        .gte('date', from)
        .lte('date', to)
        .limit(20000);
    if (error)
        throw error;
    const byCampaign = new Map();
    for (const r of data !== null && data !== void 0 ? data : []) {
        const c = (_a = byCampaign.get(r.campaign_id)) !== null && _a !== void 0 ? _a : {
            campaign_id: r.campaign_id,
            campaign_name: r.campaign_name,
            ad_account_id: r.ad_account_id,
            spend: 0,
            impressions: 0,
            reach: 0,
            clicks: 0,
            conversations: 0,
            purchases: 0,
            purchase_value: 0,
            first_day: null,
            last_day: null,
        };
        if (Number(r.spend) > 0) {
            if (!c.first_day || r.date < c.first_day)
                c.first_day = r.date;
            if (!c.last_day || r.date > c.last_day)
                c.last_day = r.date;
        }
        for (const key of ['spend', 'impressions', 'reach', 'clicks', 'conversations', 'purchases', 'purchase_value']) {
            c[key] += Number(r[key]) || 0;
        }
        byCampaign.set(r.campaign_id, c);
    }
    return [...byCampaign.values()]
        .map((c) => (Object.assign(Object.assign({}, c), { spend: Math.round(c.spend * 100) / 100, purchase_value: Math.round(c.purchase_value * 100) / 100, ctr: c.impressions ? Math.round((c.clicks / c.impressions) * 10000) / 100 : null, cost_per_conversation: c.conversations ? Math.round((c.spend / c.conversations) * 100) / 100 : null, roas: c.spend ? Math.round((c.purchase_value / c.spend) * 100) / 100 : null })))
        .filter((c) => c.spend > 0 || c.impressions > 0)
        .sort((a, b) => b.spend - a.spend);
}
