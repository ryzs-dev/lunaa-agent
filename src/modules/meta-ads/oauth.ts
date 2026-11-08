import axios from 'axios';
import crypto from 'crypto';
import { supabase } from '../supabase';
import { decryptSecret } from '../receipts/secret';
import { GRAPH, graphError, graphGet } from './graph';
import { getRow, updateSettings } from './settings';

// "Continue with Facebook": Lunaa signs in with their own Meta app and the CRM
// keeps the token. There's no picking step: signing in again keeps the main ad
// account (the Ads page has its own account dropdown), and a first connection
// takes the account with the most spend. With a Facebook Login for Business
// configuration (META_LOGIN_CONFIG_ID) set to issue system-user tokens, the
// token never expires; without one, it's a 60-day user token.

const SCOPES = ['ads_read', 'business_management'];
const STATE_TTL_MS = 15 * 60 * 1000;
const PENDING_TTL_MS = 30 * 60 * 1000;

const appId = () => process.env.META_APP_ID ?? '';
const appSecret = () => process.env.META_APP_SECRET ?? '';
const configId = () => process.env.META_LOGIN_CONFIG_ID ?? '';
const redirectUri = () =>
  process.env.META_OAUTH_REDIRECT_URI ?? 'https://agent.lunaawomencare.com/api/meta-ads/oauth/callback';

export const oauthConfigured = () => Boolean(appId() && appSecret());

// Only send people back to the CRM itself (or a local copy while developing).
function allowedReturn(url: string) {
  const allowed = (process.env.CRM_URLS ?? 'https://crm.lunaawomencare.com')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  try {
    const parsed = new URL(url);
    return (
      allowed.some((a) => new URL(a).origin === parsed.origin) ||
      (process.env.NODE_ENV !== 'production' && parsed.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

function signingKey() {
  const raw = process.env.RECEIPTS_SECRET;
  if (!raw) throw new Error('RECEIPTS_SECRET is not set on the server');
  return Buffer.from(raw, 'base64');
}

function sign(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(state: string): { t: number; r: string; n: string } {
  const [body, mac] = state.split('.');
  const expected = crypto.createHmac('sha256', signingKey()).update(body ?? '').digest('base64url');
  if (!mac || mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    throw new Error('The sign-in link was tampered with. Try again.');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (Date.now() - payload.t > STATE_TTL_MS) throw new Error('The sign-in took too long. Try again.');
  return payload;
}

export function defaultReturn() {
  const first = (process.env.CRM_URLS ?? 'https://crm.lunaawomencare.com').split(',')[0].trim();
  return `${first}/integrations/meta-ads`;
}

export function startUrl(returnTo: string) {
  if (!oauthConfigured()) throw new Error('Sign-in with Facebook isn’t set up on the server yet');
  const back = allowedReturn(returnTo) ? returnTo : defaultReturn();
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    state: sign({ t: Date.now(), r: back, n: crypto.randomBytes(8).toString('hex') }),
  });
  if (configId()) params.set('config_id', configId());
  else params.set('scope', SCOPES.join(','));
  return `https://www.facebook.com/v25.0/dialog/oauth?${params}`;
}

function withParams(url: string, params: Record<string, string>) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

// Meta sends the browser here after sign-in. Whatever happens, the browser
// goes back to the CRM with ?meta=connected or ?meta=error&reason=….
export async function handleCallback(
  query: Record<string, any>
): Promise<{ url: string; connected: boolean; backfill: boolean }> {
  let back = defaultReturn();
  try {
    const state = verify(String(query.state ?? ''));
    back = state.r;
    if (query.error) {
      return {
        url: withParams(back, { meta: 'error', reason: String(query.error_description || 'Sign-in was cancelled') }),
        connected: false,
        backfill: false,
      };
    }

    const { data: shortLived } = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: { client_id: appId(), client_secret: appSecret(), redirect_uri: redirectUri(), code: String(query.code ?? '') },
      timeout: 30000,
    });
    let token: string = shortLived.access_token;

    // A user token lasts an hour; swap it for the 60-day one. System-user
    // tokens from a login configuration don't need this.
    if (!configId()) {
      const { data: longLived } = await axios.get(`${GRAPH}/oauth/access_token`, {
        params: { grant_type: 'fb_exchange_token', client_id: appId(), client_secret: appSecret(), fb_exchange_token: token },
        timeout: 30000,
      });
      token = longLived.access_token;
    }

    const debug = await graphGet('debug_token', `${appId()}|${appSecret()}`, { input_token: token });
    const expiresAt = Number(debug?.data?.expires_at ?? 0);
    const me = await graphGet('me', token, { fields: 'name' }).catch(() => ({ name: null }));

    const name: string = me?.name ?? 'This Facebook account';
    const accounts = await fetchAccounts(token);
    const row: any = await getRow();
    let main: string | null = row.ad_account_id ?? null;
    if (main && !accounts.some((a) => a.id === main)) {
      throw new Error(
        `${name} can’t see the ${row.account_name ?? main} ad account (${main}). Sign in with someone who can, ` +
          `or give ${name} access first: Business settings → Accounts → Ad accounts → ${row.account_name ?? main} → Assign people.`
      );
    }
    if (!main) main = await busiestAccount(token, accounts);
    if (!main) throw new Error(`${name} can’t see any ad accounts. Sign in with someone who has access in Business settings.`);

    // Orders go to the ad account's dataset; take it when there's exactly one.
    let datasetId: string | undefined;
    if (!row.dataset_id) {
      const pixels = await listDatasets(main, token).catch(() => []);
      if (pixels.length === 1) datasetId = pixels[0].id;
    }

    const { needsBackfill } = await updateSettings({
      ad_account_id: main,
      access_token: token,
      via: 'facebook',
      by: me?.name ?? null,
      expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      ...(datasetId ? { dataset_id: datasetId } : {}),
    });
    await clearPending();
    return { url: withParams(back, { meta: 'connected' }), connected: true, backfill: needsBackfill };
  } catch (error: any) {
    const reason = error?.response ? graphError(error) : error?.message ?? 'Sign-in failed';
    console.error('[meta-ads] sign-in failed:', reason);
    return { url: withParams(back, { meta: 'error', reason }), connected: false, backfill: false };
  }
}

// The token to list accounts with: the one just signed in, or the saved one.
async function tokenForPicking() {
  const row: any = await getRow();
  if (row.pending_token_encrypted && row.pending_at && Date.now() - new Date(row.pending_at).getTime() < PENDING_TTL_MS) {
    return { token: decryptSecret(row.pending_token_encrypted), pending: true, row };
  }
  if (row.token_encrypted) return { token: decryptSecret(row.token_encrypted), pending: false, row };
  throw new Error('Sign in with Facebook first');
}

type AdAccount = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  business: string | null;
  active: boolean;
};

async function fetchAccounts(token: string): Promise<AdAccount[]> {
  const accounts: any[] = [];
  let page: any = await graphGet('me/adaccounts', token, {
    fields: 'name,account_id,currency,timezone_name,account_status,business{name}',
    limit: 200,
  });
  for (;;) {
    accounts.push(...(page.data ?? []));
    if (!page.paging?.next) break;
    page = await graphGet(page.paging.next, token);
  }
  return accounts.map((a) => ({
    id: a.id as string,
    name: a.name as string,
    currency: a.currency as string,
    timezone: a.timezone_name as string,
    business: a.business?.name ?? null,
    active: a.account_status === 1,
  }));
}

// The active account that spent the most in the last 30 days (the first one if none spent).
async function busiestAccount(token: string, accounts: AdAccount[]) {
  const active = accounts.filter((a) => a.active);
  let best: { id: string; spend: number } | null = null;
  for (const account of active) {
    const insights: any = await graphGet(`${account.id}/insights`, token, { date_preset: 'last_30d', fields: 'spend' }).catch(
      () => null
    );
    const spend = Number(insights?.data?.[0]?.spend ?? 0);
    if (!best || spend > best.spend) best = { id: account.id, spend };
  }
  return best?.id ?? null;
}

export async function listAdAccounts() {
  const { token, row } = await tokenForPicking();
  return { user: row.pending_user ?? row.connected_by ?? null, accounts: await fetchAccounts(token) };
}

export async function listDatasets(adAccountId: string, withToken?: string) {
  const token = withToken ?? (await tokenForPicking()).token;
  const page: any = await graphGet(`${adAccountId}/adspixels`, token, { fields: 'name,id', limit: 100 });
  return (page.data ?? []).map((d: any) => ({ id: d.id as string, name: d.name as string }));
}

export async function takePendingToken() {
  const row: any = await getRow();
  if (!row.pending_token_encrypted || !row.pending_at || Date.now() - new Date(row.pending_at).getTime() >= PENDING_TTL_MS) {
    throw new Error('The Facebook sign-in has expired. Sign in again.');
  }
  return {
    token: decryptSecret(row.pending_token_encrypted),
    expiresAt: row.pending_token_expires_at as string | null,
    user: row.pending_user as string | null,
  };
}

export async function clearPending() {
  const { error } = await supabase
    .from('meta_ads_settings')
    .update({ pending_token_encrypted: null, pending_token_expires_at: null, pending_user: null, pending_at: null })
    .eq('id', 1);
  if (error) throw error;
}
