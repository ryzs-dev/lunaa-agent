"use strict";
/**
 * Forwards normalized events from lunaa-agent to Converra's integration gateway.
 *
 * Converra endpoint:
 *   POST /api/v1/integrations/:business_id/events/lunaa-agent
 *   X-Bridge-Key: <access key of the stored connection, or legacy CONVERRA_BRIDGE_API_KEY>
 *
 * Credentials come from the connection resolver (converra-connection.ts).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.forwardToConverra = forwardToConverra;
exports.callConverraConnection = callConverraConnection;
const converra_connection_1 = require("./converra-connection");
async function forwardToConverra(input, 
/** Pin the connection for multi-request jobs (full sync); resolved per call otherwise. */
configOverride) {
    var _a, _b;
    let config;
    try {
        config = configOverride !== null && configOverride !== void 0 ? configOverride : (await (0, converra_connection_1.getConverraConfig)());
    }
    catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (!config) {
        return { success: false, error: 'Converra is not connected' };
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
        const result = (await response.json().catch(() => ({})));
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
            response: result,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[ConverraForwarder] Failed to forward event:', message);
        return { success: false, error: message };
    }
}
/**
 * Calls Converra's connection endpoint for this business with the bridge key
 * (GET = who/what is connected, DELETE = revoke the key).
 */
async function callConverraConnection(config, method) {
    const response = await fetch(`${config.baseUrl}/integrations/${config.businessId}/connection`, {
        method,
        headers: { 'X-Bridge-Key': config.apiKey },
        signal: AbortSignal.timeout(10000),
    });
    const body = (await response.json().catch(() => ({})));
    return { ok: response.ok, status: response.status, body };
}
