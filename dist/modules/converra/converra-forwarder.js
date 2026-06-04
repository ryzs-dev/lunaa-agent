"use strict";
/**
 * Forwards normalized events from lunaa-agent to Converra's integration gateway.
 *
 * Converra endpoint:
 *   POST /api/v1/integrations/:business_id/events/lunaa-agent
 *   X-Bridge-Key: <CONVERRA_BRIDGE_API_KEY>
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.forwardToConverra = forwardToConverra;
function getConverraConfig() {
    var _a, _b, _c;
    const baseUrl = (_a = process.env.CONVERRA_API_URL) === null || _a === void 0 ? void 0 : _a.trim();
    const businessId = (_b = process.env.CONVERRA_BUSINESS_ID) === null || _b === void 0 ? void 0 : _b.trim();
    const apiKey = (_c = process.env.CONVERRA_BRIDGE_API_KEY) === null || _c === void 0 ? void 0 : _c.trim();
    if (!baseUrl || !businessId || !apiKey) {
        console.warn('[ConverraForwarder] Missing CONVERRA_API_URL, CONVERRA_BUSINESS_ID, or CONVERRA_BRIDGE_API_KEY — skipping forward');
        return null;
    }
    return { baseUrl, businessId, apiKey };
}
async function forwardToConverra(input) {
    var _a, _b;
    const config = getConverraConfig();
    if (!config) {
        return { success: false, error: 'Converra config missing' };
    }
    const { baseUrl, businessId, apiKey } = config;
    const body = {
        event_type: input.event_type,
        external_source: 'lunaa-agent',
        business_id: businessId,
        external_event_id: input.external_event_id,
        timestamp: input.timestamp,
        payload: input.payload,
    };
    try {
        const response = await fetch(`${baseUrl}/integrations/${businessId}/events/lunaa-agent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Bridge-Key': apiKey,
            },
            body: JSON.stringify(body),
        });
        const result = (await response.json());
        if (!response.ok) {
            console.error('[ConverraForwarder] Converra rejected event:', {
                status: response.status,
                result,
                event_type: input.event_type,
            });
            return { success: false, error: JSON.stringify(result) };
        }
        console.log('[ConverraForwarder] Forwarded to Converra:', {
            event_type: input.event_type,
            external_event_id: input.external_event_id,
            event_id: result.event_id,
            duplicate: (_a = result.duplicate) !== null && _a !== void 0 ? _a : false,
        });
        return {
            success: true,
            event_id: result.event_id,
            duplicate: (_b = result.duplicate) !== null && _b !== void 0 ? _b : false,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[ConverraForwarder] Failed to forward event:', message);
        return { success: false, error: message };
    }
}
