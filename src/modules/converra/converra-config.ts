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
import { timingSafeEqual } from 'crypto';

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface ConverraConnectionRow {
  id?: number;
  business_id: string | null;
  workspace_name: string | null;
  access_key: string | null;
  api_base_url: string | null;
  connected_by: string | null;
  connected_at: string | null;
  auto_sync: boolean | null;
  sync_segments: boolean | null;
  sync_email: boolean | null;
  segment_ids: string[] | null;
  oauth_state: string | null;
  oauth_state_expires_at: string | null;
  disconnected_at: string | null;
}

export type ConverraSource = 'oauth' | 'env';

export interface ConverraConfig {
  source: ConverraSource;
  baseUrl: string;
  businessId: string;
  apiKey: string;
  workspaceName: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
}

export interface ConverraSyncSettings {
  autoSync: boolean;
  syncSegments: boolean;
  syncEmail: boolean;
  /** null = all customers */
  segmentIds: string[] | null;
}

type Env = Record<string, string | undefined>;

const trimmed = (value: string | null | undefined) => value?.trim() || null;

/** True once a user has connected or disconnected Converra from the dashboard. */
export function rowHasDecision(row: ConverraConnectionRow | null | undefined): boolean {
  return Boolean(row && (row.connected_at || row.disconnected_at));
}

export function resolveConverraConfig(
  row: ConverraConnectionRow | null | undefined,
  env: Env = process.env,
): ConverraConfig | null {
  if (rowHasDecision(row)) {
    const r = row!;
    const baseUrl = trimmed(r.api_base_url) ?? trimmed(env.CONVERRA_API_URL);
    const businessId = trimmed(r.business_id);
    const apiKey = trimmed(r.access_key);
    if (r.disconnected_at || !baseUrl || !businessId || !apiKey) return null;
    return {
      source: 'oauth',
      baseUrl: baseUrl.replace(/\/+$/, ''),
      businessId,
      apiKey,
      workspaceName: r.workspace_name ?? null,
      connectedBy: r.connected_by ?? null,
      connectedAt: r.connected_at ?? null,
    };
  }

  const baseUrl = trimmed(env.CONVERRA_API_URL);
  const businessId = trimmed(env.CONVERRA_BUSINESS_ID);
  const apiKey = trimmed(env.CONVERRA_BRIDGE_API_KEY);
  if (!baseUrl || !businessId || !apiKey) return null;
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

export function syncSettingsFromRow(row: ConverraConnectionRow | null | undefined): ConverraSyncSettings {
  return {
    autoSync: row?.auto_sync ?? true,
    syncSegments: row?.sync_segments ?? true,
    syncEmail: row?.sync_email ?? true,
    segmentIds: row?.segment_ids ?? null,
  };
}

export type SettingsPatch = Partial<ConverraSyncSettings>;

/** Validates a PATCH /settings body; returns the column updates or an error message. */
export function parseSettingsPatch(
  body: unknown,
): { ok: true; columns: Partial<ConverraConnectionRow> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Expected a JSON object' };
  }
  const input = body as Record<string, unknown>;
  const columns: Partial<ConverraConnectionRow> = {};

  for (const [key, column] of [
    ['autoSync', 'auto_sync'],
    ['syncSegments', 'sync_segments'],
    ['syncEmail', 'sync_email'],
  ] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') return { ok: false, error: `${key} must be true or false` };
    columns[column] = input[key] as boolean;
  }

  if (input.segmentIds !== undefined) {
    if (input.segmentIds === null) {
      columns.segment_ids = null;
    } else if (
      Array.isArray(input.segmentIds) &&
      input.segmentIds.every((id) => typeof id === 'string' && id.trim())
    ) {
      const ids = [...new Set((input.segmentIds as string[]).map((id) => id.trim()))];
      if (ids.length === 0) return { ok: false, error: 'Pick at least one segment, or sync all customers' };
      columns.segment_ids = ids;
    } else {
      return { ok: false, error: 'segmentIds must be null or a list of segment ids' };
    }
  }

  if (Object.keys(columns).length === 0) return { ok: false, error: 'Nothing to update' };
  return { ok: true, columns };
}

/** null = all customers; otherwise the customer must be in at least one selected segment. */
export function customerMatchesSegmentFilter(
  customerSegmentIds: readonly string[],
  segmentIds: readonly string[] | null,
): boolean {
  if (segmentIds === null) return true;
  return customerSegmentIds.some((id) => segmentIds.includes(id));
}

export type OAuthStateCheck = { ok: true } | { ok: false; error: string };

export function validateOAuthState(
  row: Pick<ConverraConnectionRow, 'oauth_state' | 'oauth_state_expires_at'> | null | undefined,
  state: string,
  now: Date = new Date(),
): OAuthStateCheck {
  const expected = row?.oauth_state;
  if (!expected || !state) {
    return { ok: false, error: 'This connection link is no longer valid. Start the connection again.' };
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'This connection link doesn’t match. Start the connection again.' };
  }
  const expiresAt = row?.oauth_state_expires_at ? new Date(row.oauth_state_expires_at).getTime() : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    return { ok: false, error: 'The connection took too long and expired. Start the connection again.' };
  }
  return { ok: true };
}

export function buildAuthorizeUrl(
  env: Env,
  state: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const appUrl = trimmed(env.CONVERRA_APP_URL);
  const clientId = trimmed(env.CONVERRA_CLIENT_ID);
  const redirectUri = trimmed(env.CONVERRA_REDIRECT_URI);
  if (!appUrl || !clientId || !redirectUri) {
    return {
      ok: false,
      error:
        'Converra connect isn’t set up on the server. Add CONVERRA_APP_URL, CONVERRA_CLIENT_ID, CONVERRA_CLIENT_SECRET and CONVERRA_REDIRECT_URI to lunaa-agent.',
    };
  }
  const url = new URL(`${appUrl.replace(/\/+$/, '')}/connect`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return { ok: true, url: url.toString() };
}
