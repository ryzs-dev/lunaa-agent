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
// "Continue with Facebook": Lunaa signs in with their own Meta app, picks an
// ad account, and the CRM keeps the token. With a Facebook Login for Business
// configuration (META_LOGIN_CONFIG_ID) set to issue system-user tokens, the
// token never expires; without one, it's a 60-day user token.
const SCOPES = ['ads_read', 'business_management'];
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
// goes back to the CRM with ?meta=choose or ?meta=error&reason=….
async function handleCallback(query) {
    var _a, _b, _c, _d, _e, _f;
    let back = defaultReturn();
    try {
        const state = verify(String((_a = query.state) !== null && _a !== void 0 ? _a : ''));
        back = state.r;
        if (query.error) {
            return withParams(back, { meta: 'error', reason: String(query.error_description || 'Sign-in was cancelled') });
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
        const { error } = await supabase_1.supabase
            .from('meta_ads_settings')
            .update({
            pending_token_encrypted: (0, secret_1.encryptSecret)(token),
            pending_token_expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
            pending_user: (_e = me === null || me === void 0 ? void 0 : me.name) !== null && _e !== void 0 ? _e : null,
            pending_at: new Date().toISOString(),
        })
            .eq('id', 1);
        if (error)
            throw error;
        return withParams(back, { meta: 'choose' });
    }
    catch (error) {
        const reason = (error === null || error === void 0 ? void 0 : error.response) ? (0, graph_1.graphError)(error) : (_f = error === null || error === void 0 ? void 0 : error.message) !== null && _f !== void 0 ? _f : 'Sign-in failed';
        console.error('[meta-ads] sign-in failed:', reason);
        return withParams(back, { meta: 'error', reason });
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
async function listAdAccounts() {
    var _a, _b, _c, _d;
    const { token, row } = await tokenForPicking();
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
    return {
        user: (_d = (_c = row.pending_user) !== null && _c !== void 0 ? _c : row.connected_by) !== null && _d !== void 0 ? _d : null,
        accounts: accounts.map((a) => {
            var _a, _b;
            return ({
                id: a.id,
                name: a.name,
                currency: a.currency,
                timezone: a.timezone_name,
                business: (_b = (_a = a.business) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null,
                active: a.account_status === 1,
            });
        }),
    };
}
async function listDatasets(adAccountId) {
    var _a;
    const { token } = await tokenForPicking();
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
