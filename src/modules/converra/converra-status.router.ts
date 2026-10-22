import { Router, Request, Response } from 'express';
import { forwardToConverra } from './converra-forwarder';
import { isConverraSyncConfigured } from './converra-contact-sync';
import { getFullSyncState, startFullCustomerSync } from './converra-full-sync';

/**
 * Converra integration status for the back office (Integrations → Converra).
 *
 * GET  /api/converra/status  — config + live connection check + last full sync
 * POST /api/converra/sync    — start a full customer sync in the background
 */
export const converraStatusRouter = Router();

const CHECK_TTL_MS = 60_000;
let lastCheck: { ok: boolean; error: string | null; checkedAt: string } | null = null;

/** Converra acknowledges and ignores unknown event types, so this only proves URL + key. */
async function checkConnection(): Promise<NonNullable<typeof lastCheck>> {
  if (lastCheck && Date.now() - new Date(lastCheck.checkedAt).getTime() < CHECK_TTL_MS) {
    return lastCheck;
  }

  const result = await forwardToConverra({
    event_type: 'connection.check',
    external_event_id: `connection-check:${Date.now()}`,
    business_id: process.env.CONVERRA_BUSINESS_ID?.trim() ?? '',
    timestamp: new Date().toISOString(),
    payload: {},
  });

  lastCheck = {
    ok: result.success,
    error: result.success ? null : result.error ?? 'Converra did not accept the connection check',
    checkedAt: new Date().toISOString(),
  };
  return lastCheck;
}

function converraHost(): string | null {
  try {
    return new URL(process.env.CONVERRA_API_URL?.trim() ?? '').host;
  } catch {
    return null;
  }
}

converraStatusRouter.get('/status', async (_req: Request, res: Response) => {
  const configured = isConverraSyncConfigured();
  return res.json({
    success: true,
    data: {
      configured,
      host: converraHost(),
      businessId: process.env.CONVERRA_BUSINESS_ID?.trim() || null,
      connection: configured ? await checkConnection() : null,
      sync: getFullSyncState(),
    },
  });
});

converraStatusRouter.post('/sync', (_req: Request, res: Response) => {
  if (!isConverraSyncConfigured()) {
    return res.status(400).json({ success: false, error: 'Converra is not configured on the server' });
  }

  const started = startFullCustomerSync();
  return res.status(started ? 202 : 409).json({
    success: started,
    ...(started ? {} : { error: 'A sync is already running' }),
    data: getFullSyncState(),
  });
});
