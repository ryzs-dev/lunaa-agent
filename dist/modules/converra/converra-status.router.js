"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.converraStatusRouter = void 0;
const crypto_1 = require("crypto");
const express_1 = require("express");
const supabase_1 = require("../supabase");
const converra_forwarder_1 = require("./converra-forwarder");
const converra_connection_1 = require("./converra-connection");
const converra_config_1 = require("./converra-config");
const converra_full_sync_1 = require("./converra-full-sync");
const converra_auth_middleware_1 = require("./converra-auth.middleware");
/**
 * Converra integration for the back office (Integrations → Converra). All routes need a
 * signed-in dashboard user (Supabase bearer token). /events and /commands are mounted
 * separately in index.ts and keep their own auth.
 *
 * GET   /status            connection, health, settings, current/last sync
 * POST  /connect/start     → { authorizeUrl } for Converra's consent screen
 * POST  /connect/callback  { code, state } → exchange the code, store the key, start a full sync
 * POST  /disconnect        revoke the key at Converra (best-effort) and forget it
 * PATCH /settings          { autoSync?, syncSegments?, syncEmail?, segmentIds? }
 * GET   /segments          Lunaa segments for the picker
 * POST  /sync              start a full customer sync
 * GET   /sync-runs?limit=  sync history, newest first
 */
exports.converraStatusRouter = (0, express_1.Router)();
exports.converraStatusRouter.use(converra_auth_middleware_1.requireDashboardUser);
const CHECK_TTL_MS = 60000;
let lastCheck = null;
function errorMessage(body, fallback) {
    var _a;
    const error = (_a = body.error) !== null && _a !== void 0 ? _a : body.message;
    return typeof error === 'string' && error ? error : fallback;
}
/** Older Converra servers without GET /connection: an unknown event type is acknowledged and ignored. */
async function checkWithEvent(config) {
    var _a;
    const result = await (0, converra_forwarder_1.forwardToConverra)({
        event_type: 'connection.check',
        external_event_id: `connection-check:${Date.now()}`,
        timestamp: new Date().toISOString(),
        payload: {},
    }, config);
    return {
        ok: result.success,
        error: result.success ? null : (_a = result.error) !== null && _a !== void 0 ? _a : 'Converra did not accept the connection check',
        checkedAt: new Date().toISOString(),
    };
}
async function checkConnection(config) {
    var _a, _b;
    const key = `${config.baseUrl}|${config.businessId}|${config.apiKey.slice(0, 12)}`;
    if ((lastCheck === null || lastCheck === void 0 ? void 0 : lastCheck.key) === key && Date.now() - new Date(lastCheck.health.checkedAt).getTime() < CHECK_TTL_MS) {
        return lastCheck;
    }
    let health;
    let workspaceName = null;
    try {
        const result = await (0, converra_forwarder_1.callConverraConnection)(config, 'GET');
        if (result.status === 404 && config.source === 'env') {
            health = await checkWithEvent(config);
        }
        else {
            const data = ((_a = result.body.data) !== null && _a !== void 0 ? _a : {});
            workspaceName = result.ok ? (_b = data.workspace_name) !== null && _b !== void 0 ? _b : null : null;
            health = {
                ok: result.ok,
                error: result.ok
                    ? null
                    : result.status === 401 || result.status === 403
                        ? 'Converra no longer accepts this connection — reconnect to fix it'
                        : errorMessage(result.body, `Converra answered ${result.status}`),
                checkedAt: new Date().toISOString(),
            };
        }
    }
    catch (err) {
        health = {
            ok: false,
            error: `Couldn’t reach Converra: ${err instanceof Error ? err.message : String(err)}`,
            checkedAt: new Date().toISOString(),
        };
    }
    lastCheck = { key, health, workspaceName };
    return lastCheck;
}
function hostOf(url) {
    try {
        return url ? new URL(url).host : null;
    }
    catch (_a) {
        return null;
    }
}
async function buildStatus(options = {}) {
    var _a, _b, _c, _d, _e, _f, _g;
    const { config, settings } = await (0, converra_connection_1.getConverraContext)(options);
    const check = config ? await checkConnection(config) : null;
    const current = (0, converra_full_sync_1.getCurrentSyncRun)();
    let last = null;
    try {
        last = await (0, converra_full_sync_1.getLastFinishedSyncRun)();
    }
    catch (err) {
        console.error('[ConverraStatus]', err instanceof Error ? err.message : err);
    }
    return {
        connected: Boolean(config),
        source: (_a = config === null || config === void 0 ? void 0 : config.source) !== null && _a !== void 0 ? _a : null,
        workspaceName: config ? (_c = (_b = config.workspaceName) !== null && _b !== void 0 ? _b : check === null || check === void 0 ? void 0 : check.workspaceName) !== null && _c !== void 0 ? _c : null : null,
        businessId: (_d = config === null || config === void 0 ? void 0 : config.businessId) !== null && _d !== void 0 ? _d : null,
        host: config ? hostOf(config.baseUrl) : null,
        connectedBy: (_e = config === null || config === void 0 ? void 0 : config.connectedBy) !== null && _e !== void 0 ? _e : null,
        connectedAt: (_f = config === null || config === void 0 ? void 0 : config.connectedAt) !== null && _f !== void 0 ? _f : null,
        connection: (_g = check === null || check === void 0 ? void 0 : check.health) !== null && _g !== void 0 ? _g : null,
        settings,
        sync: { running: Boolean(current), current, last },
    };
}
function sendError(res, status, error) {
    const message = error instanceof Error ? error.message : String(error);
    if (status >= 500)
        console.error('[ConverraRouter]', message);
    return res.status(status).json({ success: false, error: message });
}
exports.converraStatusRouter.get('/status', async (_req, res) => {
    try {
        return res.json({ success: true, data: await buildStatus() });
    }
    catch (err) {
        return sendError(res, 500, err);
    }
});
exports.converraStatusRouter.post('/connect/start', async (_req, res) => {
    var _a;
    const state = (0, crypto_1.randomBytes)(32).toString('base64url');
    const authorize = (0, converra_config_1.buildAuthorizeUrl)(process.env, state);
    if (!authorize.ok)
        return sendError(res, 500, authorize.error);
    if (!((_a = process.env.CONVERRA_CLIENT_SECRET) === null || _a === void 0 ? void 0 : _a.trim())) {
        return sendError(res, 500, 'CONVERRA_CLIENT_SECRET is missing on lunaa-agent');
    }
    try {
        await (0, converra_connection_1.saveConnectionRow)({
            oauth_state: state,
            oauth_state_expires_at: new Date(Date.now() + converra_config_1.OAUTH_STATE_TTL_MS).toISOString(),
        });
        return res.json({ success: true, data: { authorizeUrl: authorize.url } });
    }
    catch (err) {
        return sendError(res, 500, err);
    }
});
const TOKEN_ERRORS = {
    invalid_grant: 'The approval code expired or was already used. Start the connection again.',
    invalid_client: 'Converra didn’t recognise Lunaa’s client credentials. Check CONVERRA_CLIENT_ID and CONVERRA_CLIENT_SECRET.',
};
exports.converraStatusRouter.post('/connect/callback', async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const { code, state } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
    if (typeof code !== 'string' || !code.trim() || typeof state !== 'string' || !state.trim()) {
        return sendError(res, 400, 'code and state are required');
    }
    const apiUrl = (_c = (_b = process.env.CONVERRA_API_URL) === null || _b === void 0 ? void 0 : _b.trim()) === null || _c === void 0 ? void 0 : _c.replace(/\/+$/, '');
    const clientId = (_d = process.env.CONVERRA_CLIENT_ID) === null || _d === void 0 ? void 0 : _d.trim();
    const clientSecret = (_e = process.env.CONVERRA_CLIENT_SECRET) === null || _e === void 0 ? void 0 : _e.trim();
    const redirectUri = (_f = process.env.CONVERRA_REDIRECT_URI) === null || _f === void 0 ? void 0 : _f.trim();
    if (!apiUrl || !clientId || !clientSecret || !redirectUri) {
        return sendError(res, 500, 'Converra connect isn’t set up on the server (CONVERRA_API_URL, CONVERRA_CLIENT_ID, CONVERRA_CLIENT_SECRET, CONVERRA_REDIRECT_URI).');
    }
    try {
        const { row } = await (0, converra_connection_1.getConverraContext)({ fresh: true });
        const check = (0, converra_config_1.validateOAuthState)(row, state.trim());
        if (!check.ok)
            return sendError(res, 400, check.error);
        // Single use: clear the state before talking to Converra.
        await (0, converra_connection_1.saveConnectionRow)({ oauth_state: null, oauth_state_expires_at: null });
        let body;
        let status;
        try {
            const response = await fetch(`${apiUrl}/integrations/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: code.trim(), redirect_uri: redirectUri }),
                signal: AbortSignal.timeout(15000),
            });
            status = response.status;
            body = (await response.json().catch(() => ({})));
        }
        catch (err) {
            return sendError(res, 502, `Couldn’t reach Converra: ${err instanceof Error ? err.message : String(err)}`);
        }
        const token = body.data;
        if (status >= 300 || !body.success || !(token === null || token === void 0 ? void 0 : token.access_key) || !token.business_id) {
            const code = typeof body.error === 'string' ? body.error : '';
            return sendError(res, status >= 500 ? 502 : 400, (_g = TOKEN_ERRORS[code]) !== null && _g !== void 0 ? _g : `Converra refused the connection${code ? `: ${code}` : ''}`);
        }
        const startedBy = (0, converra_auth_middleware_1.currentUserEmail)(res);
        await (0, converra_connection_1.saveConnectionRow)({
            business_id: token.business_id,
            workspace_name: (_h = token.workspace_name) !== null && _h !== void 0 ? _h : null,
            access_key: token.access_key,
            api_base_url: ((_j = token.api_base_url) === null || _j === void 0 ? void 0 : _j.trim()) || apiUrl,
            connected_by: (_l = startedBy !== null && startedBy !== void 0 ? startedBy : (_k = token.connected_by) === null || _k === void 0 ? void 0 : _k.email) !== null && _l !== void 0 ? _l : null,
            connected_at: new Date().toISOString(),
            disconnected_at: null,
        });
        lastCheck = null;
        try {
            await (0, converra_full_sync_1.startFullCustomerSync)({ trigger: 'connect', startedBy });
        }
        catch (err) {
            console.error('[ConverraRouter] Connected, but the first sync didn’t start:', err);
        }
        return res.json({ success: true, data: await buildStatus({ fresh: true }) });
    }
    catch (err) {
        return sendError(res, 500, err);
    }
});
exports.converraStatusRouter.post('/disconnect', async (_req, res) => {
    try {
        const { config } = await (0, converra_connection_1.getConverraContext)({ fresh: true });
        // Env keys can't be revoked from here (Converra answers 400) — only stored connections.
        if ((config === null || config === void 0 ? void 0 : config.source) === 'oauth') {
            try {
                const result = await (0, converra_forwarder_1.callConverraConnection)(config, 'DELETE');
                if (!result.ok)
                    console.warn('[ConverraRouter] Converra did not revoke the key:', result.status, result.body);
            }
            catch (err) {
                console.warn('[ConverraRouter] Couldn’t reach Converra to revoke the key:', err);
            }
        }
        await (0, converra_connection_1.saveConnectionRow)({
            access_key: null,
            disconnected_at: new Date().toISOString(),
            oauth_state: null,
            oauth_state_expires_at: null,
        });
        lastCheck = null;
        return res.json({ success: true, data: await buildStatus({ fresh: true }) });
    }
    catch (err) {
        return sendError(res, 500, err);
    }
});
exports.converraStatusRouter.patch('/settings', async (req, res) => {
    const parsed = (0, converra_config_1.parseSettingsPatch)(req.body);
    if (!parsed.ok)
        return sendError(res, 400, parsed.error);
    try {
        const row = await (0, converra_connection_1.saveConnectionRow)(parsed.columns);
        return res.json({ success: true, data: (0, converra_config_1.syncSettingsFromRow)(row) });
    }
    catch (err) {
        return sendError(res, 500, err);
    }
});
exports.converraStatusRouter.get('/segments', async (_req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('segments')
        .select('id, name, segment_members(count)')
        .order('name', { ascending: true });
    if (error)
        return sendError(res, 500, `Failed to load segments: ${error.message}`);
    return res.json({
        success: true,
        data: (data !== null && data !== void 0 ? data : []).map((segment) => {
            var _a, _b, _c;
            const members = segment.segment_members;
            return {
                id: String(segment.id),
                name: (_a = segment.name) !== null && _a !== void 0 ? _a : 'Untitled segment',
                customerCount: Array.isArray(members) ? Number((_c = (_b = members[0]) === null || _b === void 0 ? void 0 : _b.count) !== null && _c !== void 0 ? _c : 0) : undefined,
            };
        }),
    });
});
exports.converraStatusRouter.post('/sync', async (_req, res) => {
    try {
        const { config } = await (0, converra_connection_1.getConverraContext)({ fresh: true });
        if (!config)
            return sendError(res, 400, 'Converra is not connected');
        const run = await (0, converra_full_sync_1.startFullCustomerSync)({ trigger: 'manual', startedBy: (0, converra_auth_middleware_1.currentUserEmail)(res) });
        if (!run) {
            return res.status(409).json({ success: false, error: 'A sync is already running', data: (0, converra_full_sync_1.getCurrentSyncRun)() });
        }
        return res.status(202).json({ success: true, data: run });
    }
    catch (err) {
        return sendError(res, 500, err);
    }
});
exports.converraStatusRouter.get('/sync-runs', async (req, res) => {
    var _a;
    const limit = Number.parseInt(String((_a = req.query.limit) !== null && _a !== void 0 ? _a : '20'), 10);
    try {
        const runs = await (0, converra_full_sync_1.listSyncRuns)(Number.isFinite(limit) ? limit : 20);
        // The in-memory run has live counts; the stored row only gets them at the end.
        const current = (0, converra_full_sync_1.getCurrentSyncRun)();
        return res.json({
            success: true,
            data: current ? runs.map((run) => (run.id === current.id ? current : run)) : runs,
        });
    }
    catch (err) {
        return sendError(res, 500, err);
    }
});
