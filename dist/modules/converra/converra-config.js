"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAUTH_STATE_TTL_MS = void 0;
exports.rowHasDecision = rowHasDecision;
exports.resolveConverraConfig = resolveConverraConfig;
exports.syncSettingsFromRow = syncSettingsFromRow;
exports.parseSettingsPatch = parseSettingsPatch;
exports.customerMatchesSegmentFilter = customerMatchesSegmentFilter;
exports.validateOAuthState = validateOAuthState;
exports.buildAuthorizeUrl = buildAuthorizeUrl;
/**
 * Pure helpers for the Converra connection: which credentials to use, the sync settings,
 * OAuth state checks and the segment filter. No I/O here so it can be unit tested.
 *
 * Precedence (see converra-connect contract):
 *   1. A connection row that was connected or disconnected through the dashboard always wins.
 *      Connected → use its key. Disconnected → Converra is off, even if env keys exist.
 *   2. Only while no such row exists, the legacy env connection
 *      (CONVERRA_API_URL + CONVERRA_BUSINESS_ID + CONVERRA_BRIDGE_API_KEY) is used.
 * A row that only holds an unfinished OAuth state or saved settings does not count as a decision.
 */
const crypto_1 = require("crypto");
exports.OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const trimmed = (value) => (value === null || value === void 0 ? void 0 : value.trim()) || null;
/** True once a user has connected or disconnected Converra from the dashboard. */
function rowHasDecision(row) {
    return Boolean(row && (row.connected_at || row.disconnected_at));
}
function resolveConverraConfig(row, env = process.env) {
    var _a, _b, _c, _d;
    if (rowHasDecision(row)) {
        const r = row;
        const baseUrl = (_a = trimmed(r.api_base_url)) !== null && _a !== void 0 ? _a : trimmed(env.CONVERRA_API_URL);
        const businessId = trimmed(r.business_id);
        const apiKey = trimmed(r.access_key);
        if (r.disconnected_at || !baseUrl || !businessId || !apiKey)
            return null;
        return {
            source: 'oauth',
            baseUrl: baseUrl.replace(/\/+$/, ''),
            businessId,
            apiKey,
            workspaceName: (_b = r.workspace_name) !== null && _b !== void 0 ? _b : null,
            connectedBy: (_c = r.connected_by) !== null && _c !== void 0 ? _c : null,
            connectedAt: (_d = r.connected_at) !== null && _d !== void 0 ? _d : null,
        };
    }
    const baseUrl = trimmed(env.CONVERRA_API_URL);
    const businessId = trimmed(env.CONVERRA_BUSINESS_ID);
    const apiKey = trimmed(env.CONVERRA_BRIDGE_API_KEY);
    if (!baseUrl || !businessId || !apiKey)
        return null;
    return {
        source: 'env',
        baseUrl: baseUrl.replace(/\/+$/, ''),
        businessId,
        apiKey,
        workspaceName: null,
        connectedBy: null,
        connectedAt: null,
    };
}
function syncSettingsFromRow(row) {
    var _a, _b, _c, _d;
    return {
        autoSync: (_a = row === null || row === void 0 ? void 0 : row.auto_sync) !== null && _a !== void 0 ? _a : true,
        syncSegments: (_b = row === null || row === void 0 ? void 0 : row.sync_segments) !== null && _b !== void 0 ? _b : true,
        syncEmail: (_c = row === null || row === void 0 ? void 0 : row.sync_email) !== null && _c !== void 0 ? _c : true,
        segmentIds: (_d = row === null || row === void 0 ? void 0 : row.segment_ids) !== null && _d !== void 0 ? _d : null,
    };
}
/** Validates a PATCH /settings body; returns the column updates or an error message. */
function parseSettingsPatch(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'Expected a JSON object' };
    }
    const input = body;
    const columns = {};
    for (const [key, column] of [
        ['autoSync', 'auto_sync'],
        ['syncSegments', 'sync_segments'],
        ['syncEmail', 'sync_email'],
    ]) {
        if (input[key] === undefined)
            continue;
        if (typeof input[key] !== 'boolean')
            return { ok: false, error: `${key} must be true or false` };
        columns[column] = input[key];
    }
    if (input.segmentIds !== undefined) {
        if (input.segmentIds === null) {
            columns.segment_ids = null;
        }
        else if (Array.isArray(input.segmentIds) &&
            input.segmentIds.every((id) => typeof id === 'string' && id.trim())) {
            const ids = [...new Set(input.segmentIds.map((id) => id.trim()))];
            if (ids.length === 0)
                return { ok: false, error: 'Pick at least one segment, or sync all customers' };
            columns.segment_ids = ids;
        }
        else {
            return { ok: false, error: 'segmentIds must be null or a list of segment ids' };
        }
    }
    if (Object.keys(columns).length === 0)
        return { ok: false, error: 'Nothing to update' };
    return { ok: true, columns };
}
/** null = all customers; otherwise the customer must be in at least one selected segment. */
function customerMatchesSegmentFilter(customerSegmentIds, segmentIds) {
    if (segmentIds === null)
        return true;
    return customerSegmentIds.some((id) => segmentIds.includes(id));
}
function validateOAuthState(row, state, now = new Date()) {
    const expected = row === null || row === void 0 ? void 0 : row.oauth_state;
    if (!expected || !state) {
        return { ok: false, error: 'This connection link is no longer valid. Start the connection again.' };
    }
    const a = Buffer.from(expected);
    const b = Buffer.from(state);
    if (a.length !== b.length || !(0, crypto_1.timingSafeEqual)(a, b)) {
        return { ok: false, error: 'This connection link doesn’t match. Start the connection again.' };
    }
    const expiresAt = (row === null || row === void 0 ? void 0 : row.oauth_state_expires_at) ? new Date(row.oauth_state_expires_at).getTime() : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
        return { ok: false, error: 'The connection took too long and expired. Start the connection again.' };
    }
    return { ok: true };
}
function buildAuthorizeUrl(env, state) {
    const appUrl = trimmed(env.CONVERRA_APP_URL);
    const clientId = trimmed(env.CONVERRA_CLIENT_ID);
    const redirectUri = trimmed(env.CONVERRA_REDIRECT_URI);
    if (!appUrl || !clientId || !redirectUri) {
        return {
            ok: false,
            error: 'Converra connect isn’t set up on the server. Add CONVERRA_APP_URL, CONVERRA_CLIENT_ID, CONVERRA_CLIENT_SECRET and CONVERRA_REDIRECT_URI to lunaa-agent.',
        };
    }
    const url = new URL(`${appUrl.replace(/\/+$/, '')}/connect`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return { ok: true, url: url.toString() };
}
