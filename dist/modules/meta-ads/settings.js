"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRow = getRow;
exports.trackedAccounts = trackedAccounts;
exports.connection = connection;
exports.publicSettings = publicSettings;
exports.updateSettings = updateSettings;
exports.disconnect = disconnect;
exports.markSync = markSync;
exports.setExtraAccounts = setExtraAccounts;
exports.markAccountsSynced = markAccountsSynced;
exports.addExtraAccount = addExtraAccount;
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
// The main account first, then the extra ones shown on the Ads page.
function trackedAccounts(row) {
    var _a;
    if (!row.ad_account_id)
        return [];
    const main = {
        id: row.ad_account_id,
        name: row.account_name,
        currency: row.currency,
        timezone: row.timezone,
        synced_at: row.last_sync_at,
    };
    return [main, ...((_a = row.extra_accounts) !== null && _a !== void 0 ? _a : []).filter((a) => a.id !== row.ad_account_id)];
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
        accounts: trackedAccounts(row),
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
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
        if (accountChanged) {
            // The new main account can't also be an extra one.
            patch.extra_accounts = ((_l = row.extra_accounts) !== null && _l !== void 0 ? _l : []).filter((a) => a.id !== accountId);
        }
        if (!row.connected_at || accountChanged) {
            patch.connected_at = new Date().toISOString();
            patch.last_sync_at = null;
            patch.last_sync_error = null;
        }
    }
    if (input.dataset_id !== undefined) {
        const datasetId = ((_m = input.dataset_id) === null || _m === void 0 ? void 0 : _m.replace(/\D/g, '')) || null;
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
    if (accountChanged && row.ad_account_id && !((_o = row.extra_accounts) !== null && _o !== void 0 ? _o : []).some((a) => a.id === row.ad_account_id)) {
        await deleteAccountRows([row.ad_account_id]);
    }
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
        extra_accounts: [],
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
async function deleteAccountRows(ids) {
    if (!ids.length)
        return;
    const { error } = await supabase_1.supabase.from('meta_ad_insights').delete().in('ad_account_id', ids);
    if (error)
        throw error;
}
// Sets which other ad accounts are synced for the Ads page. Each one is checked
// with the saved sign-in first; dropping one deletes its stored numbers.
async function setExtraAccounts(ids) {
    var _a, _b, _c, _d;
    const conn = await connection();
    if (!conn)
        throw new Error('Connect Meta ads first');
    const { row, token } = conn;
    const wanted = [...new Set(ids.map((id) => (0, graph_1.normaliseAccountId)(id)).filter((id) => id && id !== row.ad_account_id))];
    if (wanted.length > 30)
        throw new Error('Too many ad accounts');
    const current = new Map(((_a = row.extra_accounts) !== null && _a !== void 0 ? _a : []).map((a) => [a.id, a]));
    const next = [];
    for (const id of wanted) {
        const known = current.get(id);
        if (known) {
            next.push(known);
            continue;
        }
        try {
            const a = await (0, graph_1.graphGet)(id, token, { fields: 'name,currency,timezone_name' });
            next.push({ id, name: (_b = a.name) !== null && _b !== void 0 ? _b : null, currency: (_c = a.currency) !== null && _c !== void 0 ? _c : null, timezone: (_d = a.timezone_name) !== null && _d !== void 0 ? _d : null, synced_at: null });
        }
        catch (error) {
            throw new Error(`Meta refused ad account ${id}: ${(0, graph_1.graphError)(error)}`);
        }
    }
    await saveRow({ extra_accounts: next });
    await deleteAccountRows([...current.keys()].filter((id) => !wanted.includes(id)));
    return { settings: await publicSettings(), added: next.filter((a) => !current.has(a.id)).map((a) => a.id) };
}
// Records when extra accounts were pulled, so the Ads page knows when they're ready.
async function markAccountsSynced(ids) {
    var _a;
    const row = await getRow();
    const now = new Date().toISOString();
    const extras = ((_a = row.extra_accounts) !== null && _a !== void 0 ? _a : []).map((a) => (ids.includes(a.id) ? Object.assign(Object.assign({}, a), { synced_at: now }) : a));
    await saveRow({ extra_accounts: extras });
}
// Adds one account to the synced ones (if it isn't already).
async function addExtraAccount(id) {
    var _a, _b;
    const row = await getRow();
    const accountId = (0, graph_1.normaliseAccountId)(id);
    if (accountId === row.ad_account_id || ((_a = row.extra_accounts) !== null && _a !== void 0 ? _a : []).some((a) => a.id === accountId)) {
        return { settings: await publicSettings(), added: [] };
    }
    return setExtraAccounts([...((_b = row.extra_accounts) !== null && _b !== void 0 ? _b : []).map((a) => a.id), accountId]);
}
