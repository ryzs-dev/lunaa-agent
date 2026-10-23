"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.converraEventRouter = void 0;
const express_1 = require("express");
const converra_forwarder_1 = require("./converra-forwarder");
/**
 * Receives inbound events from external systems (parcel-daily, lunaa-extractor)
 * and forwards them to Converra.
 *
 * POST /api/converra/events/ingest
 *
 * Body (from parcel-daily or lunaa-extractor):
 * {
 *   event_type: "order.created" | "whatsapp.message.received" | ...,
 *   external_event_id: "unique-id",
 *   business_id: "optional — ignored, the connected Converra workspace is used",
 *   timestamp: "ISO 8601",
 *   payload: { ... }
 * }
 */
exports.converraEventRouter = (0, express_1.Router)();
exports.converraEventRouter.post('/ingest', async (req, res) => {
    var _a, _b;
    const body = req.body;
    const eventType = typeof body.event_type === 'string' ? body.event_type.trim() : null;
    if (!eventType) {
        return res.status(400).json({
            success: false,
            error: 'event_type is required',
        });
    }
    const externalEventId = typeof body.external_event_id === 'string' && body.external_event_id.trim()
        ? body.external_event_id.trim()
        : `lunaa-agent:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const timestamp = typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString();
    const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? body.payload
        : body.data && typeof body.data === 'object'
            ? body.data
            : {};
    const result = await (0, converra_forwarder_1.forwardToConverra)({
        event_type: eventType,
        external_event_id: externalEventId,
        timestamp,
        payload,
    });
    if (!result.success) {
        return res.status(502).json({
            success: false,
            error: (_a = result.error) !== null && _a !== void 0 ? _a : 'Failed to forward to Converra',
        });
    }
    return res.status(200).json({
        success: true,
        event_id: result.event_id,
        duplicate: (_b = result.duplicate) !== null && _b !== void 0 ? _b : false,
        event_type: eventType,
        external_event_id: externalEventId,
    });
});
