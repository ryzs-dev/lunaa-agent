import { randomBytes } from 'crypto';
import { Router, Request, Response } from 'express';
import { supabase } from '../supabase';
import { callConverraConnection, forwardToConverra } from './converra-forwarder';
import { getConverraContext, saveConnectionRow } from './converra-connection';
import {
  buildAuthorizeUrl,
  ConverraConfig,
  OAUTH_STATE_TTL_MS,
  parseSettingsPatch,
  syncSettingsFromRow,
  validateOAuthState,
} from './converra-config';
import {
  getCurrentSyncRun,
  getLastFinishedSyncRun,
  listSyncRuns,
  startFullCustomerSync,
} from './converra-full-sync';
import { currentUserEmail, requireDashboardUser } from './converra-auth.middleware';

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
export const converraStatusRouter = Router();
converraStatusRouter.use(requireDashboardUser);

type Health = { ok: boolean; error: string | null; checkedAt: string };

const CHECK_TTL_MS = 60_000;
let lastCheck: { key: string; health: Health; workspaceName: string | null } | null = null;

function errorMessage(body: Record<string, unknown>, fallback: string): string {
  const error = body.error ?? body.message;
  return typeof error === 'string' && error ? error : fallback;
}

/** Older Converra servers without GET /connection: an unknown event type is acknowledged and ignored. */
async function checkWithEvent(config: ConverraConfig): Promise<Health> {
  const result = await forwardToConverra(
    {
      event_type: 'connection.check',
      external_event_id: `connection-check:${Date.now()}`,
      timestamp: new Date().toISOString(),
      payload: {},
    },
    config,
  );
  return {
    ok: result.success,
    error: result.success ? null : result.error ?? 'Converra did not accept the connection check',
    checkedAt: new Date().toISOString(),
  };
}

async function checkConnection(config: ConverraConfig): Promise<{ health: Health; workspaceName: string | null }> {
  const key = `${config.baseUrl}|${config.businessId}|${config.apiKey.slice(0, 12)}`;
  if (lastCheck?.key === key && Date.now() - new Date(lastCheck.health.checkedAt).getTime() < CHECK_TTL_MS) {
    return lastCheck;
  }

  let health: Health;
  let workspaceName: string | null = null;
  try {
    const result = await callConverraConnection(config, 'GET');
    if (result.status === 404 && config.source === 'env') {
      health = await checkWithEvent(config);
    } else {
      const data = (result.body.data ?? {}) as { workspace_name?: string | null };
      workspaceName = result.ok ? data.workspace_name ?? null : null;
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
  } catch (err) {
    health = {
      ok: false,
      error: `Couldn’t reach Converra: ${err instanceof Error ? err.message : String(err)}`,
      checkedAt: new Date().toISOString(),
    };
  }

  lastCheck = { key, health, workspaceName };
  return lastCheck;
}

function hostOf(url: string | null | undefined): string | null {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

async function buildStatus(options: { fresh?: boolean } = {}) {
  const { config, settings } = await getConverraContext(options);
  const check = config ? await checkConnection(config) : null;
  const current = getCurrentSyncRun();
  let last = null;
  try {
    last = await getLastFinishedSyncRun();
  } catch (err) {
    console.error('[ConverraStatus]', err instanceof Error ? err.message : err);
  }

  return {
    connected: Boolean(config),
    source: config?.source ?? null,
    workspaceName: config ? config.workspaceName ?? check?.workspaceName ?? null : null,
    businessId: config?.businessId ?? null,
    host: config ? hostOf(config.baseUrl) : null,
    connectedBy: config?.connectedBy ?? null,
    connectedAt: config?.connectedAt ?? null,
    connection: check?.health ?? null,
    settings,
    sync: { running: Boolean(current), current, last },
  };
}

function sendError(res: Response, status: number, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (status >= 500) console.error('[ConverraRouter]', message);
  return res.status(status).json({ success: false, error: message });
}

converraStatusRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: await buildStatus() });
  } catch (err) {
    return sendError(res, 500, err);
  }
});

converraStatusRouter.post('/connect/start', async (_req: Request, res: Response) => {
  const state = randomBytes(32).toString('base64url');
  const authorize = buildAuthorizeUrl(process.env, state);
  if (!authorize.ok) return sendError(res, 500, authorize.error);
  if (!process.env.CONVERRA_CLIENT_SECRET?.trim()) {
    return sendError(res, 500, 'CONVERRA_CLIENT_SECRET is missing on lunaa-agent');
  }

  try {
    await saveConnectionRow({
      oauth_state: state,
      oauth_state_expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
    });
    return res.json({ success: true, data: { authorizeUrl: authorize.url } });
  } catch (err) {
    return sendError(res, 500, err);
  }
});

type TokenResponse = {
  access_key?: string;
  business_id?: string;
  workspace_name?: string | null;
  api_base_url?: string | null;
  connection_id?: string;
  connected_by?: { name?: string | null; email?: string | null } | null;
};

const TOKEN_ERRORS: Record<string, string> = {
  invalid_grant: 'The approval code expired or was already used. Start the connection again.',
  invalid_client: 'Converra didn’t recognise Lunaa’s client credentials. Check CONVERRA_CLIENT_ID and CONVERRA_CLIENT_SECRET.',
};

converraStatusRouter.post('/connect/callback', async (req: Request, res: Response) => {
  const { code, state } = (req.body ?? {}) as { code?: unknown; state?: unknown };
  if (typeof code !== 'string' || !code.trim() || typeof state !== 'string' || !state.trim()) {
    return sendError(res, 400, 'code and state are required');
  }

  const apiUrl = process.env.CONVERRA_API_URL?.trim()?.replace(/\/+$/, '');
  const clientId = process.env.CONVERRA_CLIENT_ID?.trim();
  const clientSecret = process.env.CONVERRA_CLIENT_SECRET?.trim();
  const redirectUri = process.env.CONVERRA_REDIRECT_URI?.trim();
  if (!apiUrl || !clientId || !clientSecret || !redirectUri) {
    return sendError(
      res,
      500,
      'Converra connect isn’t set up on the server (CONVERRA_API_URL, CONVERRA_CLIENT_ID, CONVERRA_CLIENT_SECRET, CONVERRA_REDIRECT_URI).',
    );
  }

  try {
    const { row } = await getConverraContext({ fresh: true });
    const check = validateOAuthState(row, state.trim());
    if (!check.ok) return sendError(res, 400, check.error);

    // Single use: clear the state before talking to Converra.
    await saveConnectionRow({ oauth_state: null, oauth_state_expires_at: null });

    let body: { success?: boolean; data?: TokenResponse; error?: string; message?: string };
    let status: number;
    try {
      const response = await fetch(`${apiUrl}/integrations/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: code.trim(), redirect_uri: redirectUri }),
        signal: AbortSignal.timeout(15_000),
      });
      status = response.status;
      body = (await response.json().catch(() => ({}))) as typeof body;
    } catch (err) {
      return sendError(res, 502, `Couldn’t reach Converra: ${err instanceof Error ? err.message : String(err)}`);
    }

    const token = body.data;
    if (status >= 300 || !body.success || !token?.access_key || !token.business_id) {
      const code = typeof body.error === 'string' ? body.error : '';
      return sendError(
        res,
        status >= 500 ? 502 : 400,
        TOKEN_ERRORS[code] ?? `Converra refused the connection${code ? `: ${code}` : ''}`,
      );
    }

    const startedBy = currentUserEmail(res);
    await saveConnectionRow({
      business_id: token.business_id,
      workspace_name: token.workspace_name ?? null,
      access_key: token.access_key,
      api_base_url: token.api_base_url?.trim() || apiUrl,
      connected_by: startedBy ?? token.connected_by?.email ?? null,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
    });
    lastCheck = null;

    try {
      await startFullCustomerSync({ trigger: 'connect', startedBy });
    } catch (err) {
      console.error('[ConverraRouter] Connected, but the first sync didn’t start:', err);
    }

    return res.json({ success: true, data: await buildStatus({ fresh: true }) });
  } catch (err) {
    return sendError(res, 500, err);
  }
});

converraStatusRouter.post('/disconnect', async (_req: Request, res: Response) => {
  try {
    const { config } = await getConverraContext({ fresh: true });
    // Env keys can't be revoked from here (Converra answers 400) — only stored connections.
    if (config?.source === 'oauth') {
      try {
        const result = await callConverraConnection(config, 'DELETE');
        if (!result.ok) console.warn('[ConverraRouter] Converra did not revoke the key:', result.status, result.body);
      } catch (err) {
        console.warn('[ConverraRouter] Couldn’t reach Converra to revoke the key:', err);
      }
    }

    await saveConnectionRow({
      access_key: null,
      disconnected_at: new Date().toISOString(),
      oauth_state: null,
      oauth_state_expires_at: null,
    });
    lastCheck = null;
    return res.json({ success: true, data: await buildStatus({ fresh: true }) });
  } catch (err) {
    return sendError(res, 500, err);
  }
});

converraStatusRouter.patch('/settings', async (req: Request, res: Response) => {
  const parsed = parseSettingsPatch(req.body);
  if (!parsed.ok) return sendError(res, 400, parsed.error);
  try {
    const row = await saveConnectionRow(parsed.columns);
    return res.json({ success: true, data: syncSettingsFromRow(row) });
  } catch (err) {
    return sendError(res, 500, err);
  }
});

converraStatusRouter.get('/segments', async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('segments')
    .select('id, name, segment_members(count)')
    .order('name', { ascending: true });
  if (error) return sendError(res, 500, `Failed to load segments: ${error.message}`);

  return res.json({
    success: true,
    data: (data ?? []).map((segment) => {
      const members = (segment as { segment_members?: Array<{ count?: number }> }).segment_members;
      return {
        id: String(segment.id),
        name: segment.name ?? 'Untitled segment',
        customerCount: Array.isArray(members) ? Number(members[0]?.count ?? 0) : undefined,
      };
    }),
  });
});

converraStatusRouter.post('/sync', async (_req: Request, res: Response) => {
  try {
    const { config } = await getConverraContext({ fresh: true });
    if (!config) return sendError(res, 400, 'Converra is not connected');

    const run = await startFullCustomerSync({ trigger: 'manual', startedBy: currentUserEmail(res) });
    if (!run) {
      return res.status(409).json({ success: false, error: 'A sync is already running', data: getCurrentSyncRun() });
    }
    return res.status(202).json({ success: true, data: run });
  } catch (err) {
    return sendError(res, 500, err);
  }
});

converraStatusRouter.get('/sync-runs', async (req: Request, res: Response) => {
  const limit = Number.parseInt(String(req.query.limit ?? '20'), 10);
  try {
    const runs = await listSyncRuns(Number.isFinite(limit) ? limit : 20);
    // The in-memory run has live counts; the stored row only gets them at the end.
    const current = getCurrentSyncRun();
    return res.json({
      success: true,
      data: current ? runs.map((run) => (run.id === current.id ? current : run)) : runs,
    });
  } catch (err) {
    return sendError(res, 500, err);
  }
});
