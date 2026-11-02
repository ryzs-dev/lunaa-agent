import axios from 'axios';
import crypto from 'crypto';
import { supabase } from '../supabase';
import { decryptSecret, encryptSecret } from '../receipts/secret';
import { GRAPH, graphError, graphGet } from './graph';
import { getRow } from './settings';

// "Continue with Facebook": Lunaa signs in with their own Meta app, picks an
// ad account, and the CRM keeps the token. With a Facebook Login for Business
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
// goes back to the CRM with ?meta=choose or ?meta=error&reason=….
export async function handleCallback(query: Record<string, any>) {
  let back = defaultReturn();
  try {
    const state = verify(String(query.state ?? ''));
    back = state.r;
    if (query.error) {
      return withParams(back, { meta: 'error', reason: String(query.error_description || 'Sign-in was cancelled') });
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

    const { error } = await supabase
      .from('meta_ads_settings')
      .update({
        pending_token_encrypted: encryptSecret(token),
        pending_token_expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
        pending_user: me?.name ?? null,
        pending_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (error) throw error;

    return withParams(back, { meta: 'choose' });
  } catch (error: any) {
    const reason = error?.response ? graphError(error) : error?.message ?? 'Sign-in failed';
    console.error('[meta-ads] sign-in failed:', reason);
    return withParams(back, { meta: 'error', reason });
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

export async function listAdAccounts() {
  const { token, row } = await tokenForPicking();
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
  return {
    user: row.pending_user ?? row.connected_by ?? null,
    accounts: accounts.map((a) => ({
      id: a.id as string,
      name: a.name as string,
      currency: a.currency as string,
      timezone: a.timezone_name as string,
      business: a.business?.name ?? null,
      active: a.account_status === 1,
    })),
  };
}

export async function listDatasets(adAccountId: string) {
  const { token } = await tokenForPicking();
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
