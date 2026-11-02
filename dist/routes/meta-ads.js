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
async function campaignTotals(from, to) {
    var _a;
    const { data, error } = await supabase_1.supabase
        .from('meta_ad_insights')
        .select('campaign_id, campaign_name, spend, impressions, reach, clicks, conversations, purchases, purchase_value')
        .gte('date', from)
        .lte('date', to)
        .limit(10000);
    if (error)
        throw error;
    const byCampaign = new Map();
    for (const r of data !== null && data !== void 0 ? data : []) {
        const c = (_a = byCampaign.get(r.campaign_id)) !== null && _a !== void 0 ? _a : {
            campaign_id: r.campaign_id,
            campaign_name: r.campaign_name,
            spend: 0,
            impressions: 0,
            reach: 0,
            clicks: 0,
            conversations: 0,
            purchases: 0,
            purchase_value: 0,
        };
        for (const key of ['spend', 'impressions', 'reach', 'clicks', 'conversations', 'purchases', 'purchase_value']) {
            c[key] += Number(r[key]) || 0;
        }
        byCampaign.set(r.campaign_id, c);
    }
    return [...byCampaign.values()]
        .map((c) => (Object.assign(Object.assign({}, c), { spend: Math.round(c.spend * 100) / 100, cost_per_conversation: c.conversations ? Math.round((c.spend / c.conversations) * 100) / 100 : null, roas: c.spend ? Math.round((c.purchase_value / c.spend) * 100) / 100 : null })))
        .sort((a, b) => b.spend - a.spend);
}
