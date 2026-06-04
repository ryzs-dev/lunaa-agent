"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.converraCommandRouter = void 0;
const express_1 = require("express");
/**
 * Receives action commands emitted by Converra workflows (via webhook_call nodes)
 * and routes them to the appropriate downstream system.
 *
 * POST /api/converra/commands
 *
 * Body (from Converra webhook_call node):
 * {
 *   "type": "send_whatsapp_message" | "update_contact",
 *   "business_id": "...",
 *   "execution_id": "...",
 *   "payload": {
 *     "phone": "601126470411",
 *     "message": "Your order has shipped!"
 *   }
 * }
 */
exports.converraCommandRouter = (0, express_1.Router)();
function getExtractorUrl() {
    var _a, _b;
    return ((_b = (_a = process.env.LUNAA_EXTRACTOR_URL) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : 'http://localhost:4001');
}
async function routeSendWhatsappMessage(payload) {
    const extractorUrl = getExtractorUrl();
    if (!payload.phone || !payload.message) {
        return { success: false, error: 'phone and message are required' };
    }
    try {
        const response = await fetch(`${extractorUrl}/api/commands/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: payload.phone, text: payload.message }),
        });
        const result = (await response.json());
        if (!response.ok) {
            return { success: false, error: JSON.stringify(result) };
        }
        console.log('[ConverraCommands] WhatsApp message dispatched via extractor:', {
            phone: payload.phone,
            status: response.status,
        });
        return { success: true };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ConverraCommands] Failed to dispatch to extractor:', msg);
        return { success: false, error: msg };
    }
}
async function routeUpdateContact(businessId, payload) {
    console.log('[ConverraCommands] update_contact command received (stub):', {
        business_id: businessId,
        payload,
    });
    return { success: true };
}
exports.converraCommandRouter.post('/', async (req, res) => {
    const body = req.body;
    const commandType = typeof body.type === 'string' ? body.type.trim() : null;
    const businessId = typeof body.business_id === 'string' ? body.business_id.trim() : null;
    const payload = body.payload &&
        typeof body.payload === 'object' &&
        !Array.isArray(body.payload)
        ? body.payload
        : {};
    if (!commandType) {
        return res
            .status(400)
            .json({ success: false, error: 'type is required' });
    }
    console.log('[ConverraCommands] Received Converra command:', {
        type: commandType,
        business_id: businessId,
        execution_id: body.execution_id,
    });
    let result;
    switch (commandType) {
        case 'send_whatsapp_message':
            result = await routeSendWhatsappMessage(payload);
            break;
        case 'update_contact':
            result = await routeUpdateContact(businessId !== null && businessId !== void 0 ? businessId : '', payload);
            break;
        default:
            console.warn('[ConverraCommands] Unknown command type:', commandType);
            result = { success: true };
    }
    if (!result.success) {
        return res.status(502).json({ success: false, error: result.error });
    }
    return res.status(200).json({
        success: true,
        type: commandType,
        routed: true,
    });
});
