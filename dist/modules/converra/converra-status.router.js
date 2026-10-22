"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.converraStatusRouter = void 0;
const express_1 = require("express");
const converra_forwarder_1 = require("./converra-forwarder");
const converra_contact_sync_1 = require("./converra-contact-sync");
const converra_full_sync_1 = require("./converra-full-sync");
/**
 * Converra integration status for the back office (Integrations → Converra).
 *
 * GET  /api/converra/status  — config + live connection check + last full sync
 * POST /api/converra/sync    — start a full customer sync in the background
 */
exports.converraStatusRouter = (0, express_1.Router)();
const CHECK_TTL_MS = 60000;
let lastCheck = null;
/** Converra acknowledges and ignores unknown event types, so this only proves URL + key. */
async function checkConnection() {
    var _a, _b, _c;
    if (lastCheck && Date.now() - new Date(lastCheck.checkedAt).getTime() < CHECK_TTL_MS) {
        return lastCheck;
    }
    const result = await (0, converra_forwarder_1.forwardToConverra)({
        event_type: 'connection.check',
        external_event_id: `connection-check:${Date.now()}`,
        business_id: (_b = (_a = process.env.CONVERRA_BUSINESS_ID) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '',
        timestamp: new Date().toISOString(),
        payload: {},
    });
    lastCheck = {
        ok: result.success,
        error: result.success ? null : (_c = result.error) !== null && _c !== void 0 ? _c : 'Converra did not accept the connection check',
        checkedAt: new Date().toISOString(),
    };
    return lastCheck;
}
function converraHost() {
    var _a, _b;
    try {
        return new URL((_b = (_a = process.env.CONVERRA_API_URL) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '').host;
    }
    catch (_c) {
        return null;
    }
}
exports.converraStatusRouter.get('/status', async (_req, res) => {
    var _a;
    const configured = (0, converra_contact_sync_1.isConverraSyncConfigured)();
    return res.json({
        success: true,
        data: {
            configured,
            host: converraHost(),
            businessId: ((_a = process.env.CONVERRA_BUSINESS_ID) === null || _a === void 0 ? void 0 : _a.trim()) || null,
            connection: configured ? await checkConnection() : null,
            sync: (0, converra_full_sync_1.getFullSyncState)(),
        },
    });
});
exports.converraStatusRouter.post('/sync', (_req, res) => {
    if (!(0, converra_contact_sync_1.isConverraSyncConfigured)()) {
        return res.status(400).json({ success: false, error: 'Converra is not configured on the server' });
    }
    const started = (0, converra_full_sync_1.startFullCustomerSync)();
    return res.status(started ? 202 : 409).json(Object.assign(Object.assign({ success: started }, (started ? {} : { error: 'A sync is already running' })), { data: (0, converra_full_sync_1.getFullSyncState)() }));
});
