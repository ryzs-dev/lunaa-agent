"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.oauthConfigured = void 0;
exports.defaultReturn = defaultReturn;
exports.startUrl = startUrl;
exports.handleCallback = handleCallback;
exports.listAdAccounts = listAdAccounts;
exports.listDatasets = listDatasets;
exports.takePendingToken = takePendingToken;
exports.clearPending = clearPending;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const supabase_1 = require("../supabase");
const secret_1 = require("../receipts/secret");
const graph_1 = require("./graph");
const settings_1 = require("./settings");
// "Continue with Facebook": Lunaa signs in with their own Meta app and the CRM
// keeps the token. There's no picking step: signing in again keeps the main ad
// account (the Ads page has its own account dropdown), and a first connection
// takes the account with the most spend. With a Facebook Login for Business
// configuration (META_LOGIN_CONFIG_ID) set to issue system-user tokens, the
// token never expires; without one, it's a 60-day user token.
const SCOPES = ['ads_read', 'business_management', 'pages_show_list', 'pages_read_engagement', 'read_insights'];
const STATE_TTL_MS = 15 * 60 * 1000;
const PENDING_TTL_MS = 30 * 60 * 1000;
const appId = () => { var _a; return (_a = process.env.META_APP_ID) !== null && _a !== void 0 ? _a : ''; };
const appSecret = () => { var _a; return (_a = process.env.META_APP_SECRET) !== null && _a !== void 0 ? _a : ''; };
const configId = () => { var _a; return (_a = process.env.META_LOGIN_CONFIG_ID) !== null && _a !== void 0 ? _a : ''; };
const redirectUri = () => { var _a; return (_a = process.env.META_OAUTH_REDIRECT_URI) !== null && _a !== void 0 ? _a : 'https://agent.lunaawomencare.com/api/meta-ads/oauth/callback'; };
const oauthConfigured = () => Boolean(appId() && appSecret());
exports.oauthConfigured = oauthConfigured;
// Only send people back to the CRM itself (or a local copy while developing).
function allowedReturn(url) {
    var _a;
    const allowed = ((_a = process.env.CRM_URLS) !== null && _a !== void 0 ? _a : 'https://crm.lunaawomencare.com')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
    try {
        const parsed = new URL(url);
        return (allowed.some((a) => new URL(a).origin === parsed.origin) ||
            (process.env.NODE_ENV !== 'production' && parsed.hostname === 'localhost'));
    }
    catch (_b) {
        return false;
    }
}
function signingKey() {
    const raw = process.env.RECEIPTS_SECRET;
    if (!raw)
        throw new Error('RECEIPTS_SECRET is not set on the server');
    return Buffer.from(raw, 'base64');
}
function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = crypto_1.default.createHmac('sha256', signingKey()).update(body).digest('base64url');
    return `${body}.${mac}`;
}
function verify(state) {
    const [body, mac] = state.split('.');
    const expected = crypto_1.default.createHmac('sha256', signingKey()).update(body !== null && body !== void 0 ? body : '').digest('base64url');
    if (!mac || mac.length !== expected.length || !crypto_1.default.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
        throw new Error('The sign-in link was tampered with. Try again.');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (Date.now() - payload.t > STATE_TTL_MS)
        throw new Error('The sign-in took too long. Try again.');
    return payload;
}
function defaultReturn() {
    var _a;
    const first = ((_a = process.env.CRM_URLS) !== null && _a !== void 0 ? _a : 'https://crm.lunaawomencare.com').split(',')[0].trim();
    return `${first}/integrations/meta-ads`;
}
function startUrl(returnTo) {
    if (!(0, exports.oauthConfigured)())
        throw new Error('Sign-in with Facebook isn’t set up on the server yet');
    const back = allowedReturn(returnTo) ? returnTo : defaultReturn();
    const params = new URLSearchParams({
        client_id: appId(),
        redirect_uri: redirectUri(),
        response_type: 'code',
        state: sign({ t: Date.now(), r: back, n: crypto_1.default.randomBytes(8).toString('hex') }),
    });
    if (configId())
        params.set('config_id', configId());
    else
        params.set('scope', SCOPES.join(','));
    return `https://www.facebook.com/v25.0/dialog/oauth?${params}`;
}
function withParams(url, params) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params))
        u.searchParams.set(k, v);
    return u.toString();
}
// Meta sends the browser here after sign-in. Whatever happens, the browser
// goes back to the CRM with ?meta=connected or ?meta=error&reason=….
async function handleCallback(query) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    let back = defaultReturn();
    try {
        const state = verify(String((_a = query.state) !== null && _a !== void 0 ? _a : ''));
        back = state.r;
        if (query.error) {
            return {
                url: withParams(back, { meta: 'error', reason: String(query.error_description || 'Sign-in was cancelled') }),
                connected: false,
                backfill: false,
            };
        }
        const { data: shortLived } = await axios_1.default.get(`${graph_1.GRAPH}/oauth/access_token`, {
            params: { client_id: appId(), client_secret: appSecret(), redirect_uri: redirectUri(), code: String((_b = query.code) !== null && _b !== void 0 ? _b : '') },
            timeout: 30000,
        });
        let token = shortLived.access_token;
        // A user token lasts an hour; swap it for the 60-day one. System-user
        // tokens from a login configuration don't need this.
        if (!configId()) {
            const { data: longLived } = await axios_1.default.get(`${graph_1.GRAPH}/oauth/access_token`, {
                params: { grant_type: 'fb_exchange_token', client_id: appId(), client_secret: appSecret(), fb_exchange_token: token },
                timeout: 30000,
            });
            token = longLived.access_token;
        }
        const debug = await (0, graph_1.graphGet)('debug_token', `${appId()}|${appSecret()}`, { input_token: token });
        const expiresAt = Number((_d = (_c = debug === null || debug === void 0 ? void 0 : debug.data) === null || _c === void 0 ? void 0 : _c.expires_at) !== null && _d !== void 0 ? _d : 0);
        const me = await (0, graph_1.graphGet)('me', token, { fields: 'name' }).catch(() => ({ name: null }));
        const name = (_e = me === null || me === void 0 ? void 0 : me.name) !== null && _e !== void 0 ? _e : 'This Facebook account';
        const accounts = await fetchAccounts(token);
        const row = await (0, settings_1.getRow)();
        let main = (_f = row.ad_account_id) !== null && _f !== void 0 ? _f : null;
        if (main && !accounts.some((a) => a.id === main)) {
            throw new Error(`${name} can’t see the ${(_g = row.account_name) !== null && _g !== void 0 ? _g : main} ad account (${main}). Sign in with someone who can, ` +
                `or give ${name} access first: Business settings → Accounts → Ad accounts → ${(_h = row.account_name) !== null && _h !== void 0 ? _h : main} → Assign people.`);
        }
        if (!main)
            main = await busiestAccount(token, accounts);
        if (!main)
            throw new Error(`${name} can’t see any ad accounts. Sign in with someone who has access in Business settings.`);
        // Orders go to the ad account's dataset; take it when there's exactly one.
        let datasetId;
        if (!row.dataset_id) {
            const pixels = await listDatasets(main, token).catch(() => []);
            if (pixels.length === 1)
                datasetId = pixels[0].id;
        }
        const { needsBackfill } = await (0, settings_1.updateSettings)(Object.assign({ ad_account_id: main, access_token: token, via: 'facebook', by: (_j = me === null || me === void 0 ? void 0 : me.name) !== null && _j !== void 0 ? _j : null, expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null }, (datasetId ? { dataset_id: datasetId } : {})));
        await clearPending();
        return { url: withParams(back, { meta: 'connected' }), connected: true, backfill: needsBackfill };
    }
    catch (error) {
        const reason = (error === null || error === void 0 ? void 0 : error.response) ? (0, graph_1.graphError)(error) : (_k = error === null || error === void 0 ? void 0 : error.message) !== null && _k !== void 0 ? _k : 'Sign-in failed';
        console.error('[meta-ads] sign-in failed:', reason);
        return { url: withParams(back, { meta: 'error', reason }), connected: false, backfill: false };
    }
}
// The token to list accounts with: the one just signed in, or the saved one.
async function tokenForPicking() {
    const row = await (0, settings_1.getRow)();
    if (row.pending_token_encrypted && row.pending_at && Date.now() - new Date(row.pending_at).getTime() < PENDING_TTL_MS) {
        return { token: (0, secret_1.decryptSecret)(row.pending_token_encrypted), pending: true, row };
    }
    if (row.token_encrypted)
        return { token: (0, secret_1.decryptSecret)(row.token_encrypted), pending: false, row };
    throw new Error('Sign in with Facebook first');
}
async function fetchAccounts(token) {
    var _a, _b;
    const accounts = [];
    let page = await (0, graph_1.graphGet)('me/adaccounts', token, {
        fields: 'name,account_id,currency,timezone_name,account_status,business{name}',
        limit: 200,
    });
    for (;;) {
        accounts.push(...((_a = page.data) !== null && _a !== void 0 ? _a : []));
        if (!((_b = page.paging) === null || _b === void 0 ? void 0 : _b.next))
            break;
        page = await (0, graph_1.graphGet)(page.paging.next, token);
    }
    const owners = await accountBusinesses(token);
    return accounts.map((a) => {
        var _a, _b, _c;
        return ({
            id: a.id,
            name: a.name,
            currency: a.currency,
            timezone: a.timezone_name,
            business: (_c = (_a = owners.get(a.id)) !== null && _a !== void 0 ? _a : (_b = a.business) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : null,
            active: a.account_status === 1,
        });
    });
}
// Which business portfolio each ad account sits in, owned or as a client
// account, for the portfolios the sign-in belongs to. Best effort: without
// business_management it's just empty.
async function accountBusinesses(token) {
    var _a, _b, _c;
    const owners = new Map();
    try {
        const businesses = await (0, graph_1.graphGet)('me/businesses', token, { fields: 'name', limit: 100 });
        for (const b of (_a = businesses.data) !== null && _a !== void 0 ? _a : []) {
            for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
                let page = await (0, graph_1.graphGet)(`${b.id}/${edge}`, token, { fields: 'id', limit: 200 }).catch(() => null);
                while (page) {
                    for (const a of (_b = page.data) !== null && _b !== void 0 ? _b : [])
                        if (!owners.has(a.id))
                            owners.set(a.id, b.name);
                    page = ((_c = page.paging) === null || _c === void 0 ? void 0 : _c.next) ? await (0, graph_1.graphGet)(page.paging.next, token).catch(() => null) : null;
                }
            }
        }
    }
    catch (_d) { }
    return owners;
}
// The active account that spent the most in the last 30 days (the first one if none spent).
async function busiestAccount(token, accounts) {
    var _a, _b, _c, _d;
    const active = accounts.filter((a) => a.active);
    let best = null;
    for (const account of active) {
        const insights = await (0, graph_1.graphGet)(`${account.id}/insights`, token, { date_preset: 'last_30d', fields: 'spend' }).catch(() => null);
        const spend = Number((_c = (_b = (_a = insights === null || insights === void 0 ? void 0 : insights.data) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.spend) !== null && _c !== void 0 ? _c : 0);
        if (!best || spend > best.spend)
            best = { id: account.id, spend };
    }
    return (_d = best === null || best === void 0 ? void 0 : best.id) !== null && _d !== void 0 ? _d : null;
}
async function listAdAccounts() {
    var _a, _b;
    const { token, row } = await tokenForPicking();
    return { user: (_b = (_a = row.pending_user) !== null && _a !== void 0 ? _a : row.connected_by) !== null && _b !== void 0 ? _b : null, accounts: await fetchAccounts(token) };
}
async function listDatasets(adAccountId, withToken) {
    var _a;
    const token = withToken !== null && withToken !== void 0 ? withToken : (await tokenForPicking()).token;
    const page = await (0, graph_1.graphGet)(`${adAccountId}/adspixels`, token, { fields: 'name,id', limit: 100 });
    return ((_a = page.data) !== null && _a !== void 0 ? _a : []).map((d) => ({ id: d.id, name: d.name }));
}
async function takePendingToken() {
    const row = await (0, settings_1.getRow)();
    if (!row.pending_token_encrypted || !row.pending_at || Date.now() - new Date(row.pending_at).getTime() >= PENDING_TTL_MS) {
        throw new Error('The Facebook sign-in has expired. Sign in again.');
    }
    return {
        token: (0, secret_1.decryptSecret)(row.pending_token_encrypted),
        expiresAt: row.pending_token_expires_at,
        user: row.pending_user,
    };
}
async function clearPending() {
    const { error } = await supabase_1.supabase
        .from('meta_ads_settings')
        .update({ pending_token_encrypted: null, pending_token_expires_at: null, pending_user: null, pending_at: null })
        .eq('id', 1);
    if (error)
        throw error;
}
