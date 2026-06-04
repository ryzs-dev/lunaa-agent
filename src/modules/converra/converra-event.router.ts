import { Router, Request, Response } from 'express';
import { forwardToConverra } from './converra-forwarder';

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
 *   business_id: "optional — overridden by CONVERRA_BUSINESS_ID",
 *   timestamp: "ISO 8601",
 *   payload: { ... }
 * }
 */
export const converraEventRouter = Router();

converraEventRouter.post('/ingest', async (req: Request, res: Response) => {
  const body = req.body as {
    event_type?: unknown;
    external_event_id?: unknown;
    timestamp?: unknown;
    payload?: unknown;
    // legacy parcel-daily shape
    external_source?: unknown;
    data?: unknown;
  };

  const eventType =
    typeof body.event_type === 'string' ? body.event_type.trim() : null;

  if (!eventType) {
    return res.status(400).json({
      success: false,
      error: 'event_type is required',
    });
  }

  const externalEventId =
    typeof body.external_event_id === 'string' && body.external_event_id.trim()
      ? body.external_event_id.trim()
      : `lunaa-agent:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  const timestamp =
    typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString();

  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : body.data && typeof body.data === 'object'
        ? (body.data as Record<string, unknown>)
        : {};

  const result = await forwardToConverra({
    event_type: eventType,
    external_event_id: externalEventId,
    business_id: process.env.CONVERRA_BUSINESS_ID?.trim() ?? '',
    timestamp,
    payload,
  });

  if (!result.success) {
    return res.status(502).json({
      success: false,
      error: result.error ?? 'Failed to forward to Converra',
    });
  }

  return res.status(200).json({
    success: true,
    event_id: result.event_id,
    duplicate: result.duplicate ?? false,
    event_type: eventType,
    external_event_id: externalEventId,
  });
});
