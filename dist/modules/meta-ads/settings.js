"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRow = getRow;
exports.connection = connection;
exports.publicSettings = publicSettings;
exports.updateSettings = updateSettings;
exports.disconnect = disconnect;
exports.markSync = markSync;
const supabase_1 = require("../supabase");
const secret_1 = require("../receipts/secret");
const graph_1 = require("./graph");
async function getRow() {
    const { data, error } = await supabase_1.supabase.from('meta_ads_settings').select('*').eq('id', 1).single();
    if (error)
        throw error;
    return data;
}
async function saveRow(patch) {
    const { error } = await supabase_1.supabase
        .from('meta_ads_settings')
        .update(Object.assign(Object.assign({}, patch), { updated_at: new Date().toISOString() }))
        .eq('id', 1);
    if (error)
        throw error;
}
// Ready to call Meta: an account and a token that still decrypts.
async function connection() {
    const row = await getRow();
    if (!row.ad_account_id || !row.token_encrypted)
        return null;
    return { row, token: (0, secret_1.decryptSecret)(row.token_encrypted) };
}
async function publicSettings() {
    var _a, _b, _c;
    const row = await getRow();
    const { count: sent } = await supabase_1.supabase
        .from('meta_conversion_events')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', new Date(Date.now() - 7 * 86400000).toISOString());
    const { data: failed } = await supabase_1.supabase
        .from('meta_conversion_events')
        .select('error, sent_at')
        .eq('status', 'failed')
        .order('sent_at', { ascending: false })
        .limit(1);
    return {
        connected: Boolean(row.ad_account_id && row.token_encrypted),
        ad_account_id: row.ad_account_id,
        account_name: row.account_name,
        currency: row.currency,
        timezone: row.timezone,
        token_hint: row.token_hint,
        dataset_id: row.dataset_id,
        send_conversions: row.send_conversions,
        connected_at: row.connected_at,
        last_sync_at: row.last_sync_at,
        last_sync_error: row.last_sync_error,
        conversions_sent_7d: sent !== null && sent !== void 0 ? sent : 0,
        last_conversion_error: (_b = (_a = failed === null || failed === void 0 ? void 0 : failed[0]) === null || _a === void 0 ? void 0 : _a.error) !== null && _b !== void 0 ? _b : null,
        // Continue with Facebook needs Lunaa's Meta app ID and secret on the server.
        login_available: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
        connected_via: row.connected_via,
        connected_by: row.connected_by,
        token_expires_at: row.token_expires_at,
        // Signed in with Facebook but no ad account picked yet (within 30 minutes).
        pending_user: row.pending_token_encrypted && row.pending_at && Date.now() - new Date(row.pending_at).getTime() < 30 * 60 * 1000
            ? (_c = row.pending_user) !== null && _c !== void 0 ? _c : 'your Facebook account'
            : null,
    };
}
// Checks every new value against Meta before saving, so a wrong ID or a token
// without access fails here with Meta's own reason, not later in a sync.
async function updateSettings(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const row = await getRow();
    const patch = {};
    const token = ((_a = input.access_token) === null || _a === void 0 ? void 0 : _a.trim())
        || (row.token_encrypted ? (0, secret_1.decryptSecret)(row.token_encrypted) : '');
    const accountId = input.ad_account_id !== undefined
        ? (0, graph_1.normaliseAccountId)(input.ad_account_id)
        : (_b = row.ad_account_id) !== null && _b !== void 0 ? _b : '';
    if (!token)
        throw new Error('Paste an access token');
    if (!accountId)
        throw new Error('Enter the ad account ID');
    const accountChanged = accountId !== row.ad_account_id;
    if (((_c = input.access_token) === null || _c === void 0 ? void 0 : _c.trim()) || accountChanged) {
        try {
            const account = await (0, graph_1.graphGet)(accountId, token, { fields: 'name,currency,timezone_name,account_status' });
            patch.ad_account_id = accountId;
            patch.account_name = (_d = account.name) !== null && _d !== void 0 ? _d : null;
            patch.currency = (_e = account.currency) !== null && _e !== void 0 ? _e : null;
            patch.timezone = (_f = account.timezone_name) !== null && _f !== void 0 ? _f : null;
        }
        catch (error) {
            throw new Error(`Meta refused the ad account: ${(0, graph_1.graphError)(error)}`);
        }
        if ((_g = input.access_token) === null || _g === void 0 ? void 0 : _g.trim()) {
            patch.token_encrypted = (0, secret_1.encryptSecret)(token);
            patch.token_hint = `…${token.slice(-4)}`;
            patch.connected_via = (_h = input.via) !== null && _h !== void 0 ? _h : 'token';
            patch.connected_by = (_j = input.by) !== null && _j !== void 0 ? _j : null;
            patch.token_expires_at = (_k = input.expires_at) !== null && _k !== void 0 ? _k : null;
        }
        if (!row.connected_at || accountChanged) {
            patch.connected_at = new Date().toISOString();
            patch.last_sync_at = null;
            patch.last_sync_error = null;
        }
    }
    if (input.dataset_id !== undefined) {
        const datasetId = ((_l = input.dataset_id) === null || _l === void 0 ? void 0 : _l.replace(/\D/g, '')) || null;
        if (datasetId && datasetId !== row.dataset_id) {
            try {
                await (0, graph_1.graphGet)(datasetId, token, { fields: 'name' });
            }
            catch (error) {
                throw new Error(`Meta refused the dataset: ${(0, graph_1.graphError)(error)}`);
            }
        }
        patch.dataset_id = datasetId;
    }
    if (input.send_conversions !== undefined) {
        const datasetId = patch.dataset_id !== undefined ? patch.dataset_id : row.dataset_id;
        if (input.send_conversions && !datasetId)
            throw new Error('Add the dataset ID before sending orders to Meta');
        patch.send_conversions = input.send_conversions;
        // Only orders placed after switching on are sent; nothing older is replayed.
        if (input.send_conversions && !row.send_conversions)
            patch.conversions_since = new Date().toISOString();
    }
    await saveRow(patch);
    return { settings: await publicSettings(), needsBackfill: Boolean(patch.connected_at) };
}
async function disconnect() {
    await saveRow({
        ad_account_id: null,
        account_name: null,
        currency: null,
        timezone: null,
        token_encrypted: null,
        token_hint: null,
        send_conversions: false,
        connected_via: null,
        connected_by: null,
        token_expires_at: null,
        connected_at: null,
        last_sync_at: null,
        last_sync_error: null,
    });
    const { error } = await supabase_1.supabase.from('meta_ad_insights').delete().gte('date', '1970-01-01');
    if (error)
        throw error;
}
async function markSync(result) {
    var _a;
    await saveRow({
        last_sync_at: new Date().toISOString(),
        last_sync_error: (_a = result.error) !== null && _a !== void 0 ? _a : null,
    });
}
