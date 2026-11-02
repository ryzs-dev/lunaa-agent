import { supabase } from '../supabase';
import { decryptSecret, encryptSecret } from '../receipts/secret';
import { graphError, graphGet, normaliseAccountId } from './graph';

export type MetaAdsRow = {
  ad_account_id: string | null;
  account_name: string | null;
  currency: string | null;
  timezone: string | null;
  token_encrypted: string | null;
  token_hint: string | null;
  dataset_id: string | null;
  send_conversions: boolean;
  conversions_since: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  connected_via: 'facebook' | 'token' | null;
  connected_by: string | null;
  token_expires_at: string | null;
  pending_token_encrypted?: string | null;
  pending_at?: string | null;
  pending_user?: string | null;
};

export async function getRow(): Promise<MetaAdsRow> {
  const { data, error } = await supabase.from('meta_ads_settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

async function saveRow(patch: Partial<MetaAdsRow>) {
  const { error } = await supabase
    .from('meta_ads_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
}

// Ready to call Meta: an account and a token that still decrypts.
export async function connection() {
  const row = await getRow();
  if (!row.ad_account_id || !row.token_encrypted) return null;
  return { row, token: decryptSecret(row.token_encrypted) };
}

export async function publicSettings() {
  const row = await getRow();
  const { count: sent } = await supabase
    .from('meta_conversion_events')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', new Date(Date.now() - 7 * 86400000).toISOString());
  const { data: failed } = await supabase
    .from('meta_conversion_events')
    .select('error, sent_at')
    .eq('status', 'failed')
    .order('sent_at', { ascending: false })
    .limit(1);

  return {
    connected: Boolean(row.ad_account_id && row.token_encrypted),
    ad_account_id: row.ad_account_id,
    account_name: row.account_name,
    currency: row.currency,
    timezone: row.timezone,
    token_hint: row.token_hint,
    dataset_id: row.dataset_id,
    send_conversions: row.send_conversions,
    connected_at: row.connected_at,
    last_sync_at: row.last_sync_at,
    last_sync_error: row.last_sync_error,
    conversions_sent_7d: sent ?? 0,
    last_conversion_error: failed?.[0]?.error ?? null,
    // Continue with Facebook needs Lunaa's Meta app ID and secret on the server.
    login_available: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    connected_via: row.connected_via,
    connected_by: row.connected_by,
    token_expires_at: row.token_expires_at,
    // Signed in with Facebook but no ad account picked yet (within 30 minutes).
    pending_user:
      row.pending_token_encrypted && row.pending_at && Date.now() - new Date(row.pending_at).getTime() < 30 * 60 * 1000
        ? row.pending_user ?? 'your Facebook account'
        : null,
  };
}

type Update = {
  ad_account_id?: string;
  access_token?: string;
  via?: 'facebook' | 'token';
  by?: string | null;
  expires_at?: string | null;
  dataset_id?: string | null;
  send_conversions?: boolean;
};

// Checks every new value against Meta before saving, so a wrong ID or a token
// without access fails here with Meta's own reason, not later in a sync.
export async function updateSettings(input: Update) {
  const row = await getRow();
  const patch: Partial<MetaAdsRow> = {};

  const token = input.access_token?.trim()
    || (row.token_encrypted ? decryptSecret(row.token_encrypted) : '');
  const accountId = input.ad_account_id !== undefined
    ? normaliseAccountId(input.ad_account_id)
    : row.ad_account_id ?? '';

  if (!token) throw new Error('Paste an access token');
  if (!accountId) throw new Error('Enter the ad account ID');

  const accountChanged = accountId !== row.ad_account_id;
  if (input.access_token?.trim() || accountChanged) {
    try {
      const account = await graphGet(accountId, token, { fields: 'name,currency,timezone_name,account_status' });
      patch.ad_account_id = accountId;
      patch.account_name = account.name ?? null;
      patch.currency = account.currency ?? null;
      patch.timezone = account.timezone_name ?? null;
    } catch (error) {
      throw new Error(`Meta refused the ad account: ${graphError(error)}`);
    }
    if (input.access_token?.trim()) {
      patch.token_encrypted = encryptSecret(token);
      patch.token_hint = `…${token.slice(-4)}`;
      patch.connected_via = input.via ?? 'token';
      patch.connected_by = input.by ?? null;
      patch.token_expires_at = input.expires_at ?? null;
    }
    if (!row.connected_at || accountChanged) {
      patch.connected_at = new Date().toISOString();
      patch.last_sync_at = null;
      patch.last_sync_error = null;
    }
  }

  if (input.dataset_id !== undefined) {
    const datasetId = input.dataset_id?.replace(/\D/g, '') || null;
    if (datasetId && datasetId !== row.dataset_id) {
      try {
        await graphGet(datasetId, token, { fields: 'name' });
      } catch (error) {
        throw new Error(`Meta refused the dataset: ${graphError(error)}`);
      }
    }
    patch.dataset_id = datasetId;
  }

  if (input.send_conversions !== undefined) {
    const datasetId = patch.dataset_id !== undefined ? patch.dataset_id : row.dataset_id;
    if (input.send_conversions && !datasetId) throw new Error('Add the dataset ID before sending orders to Meta');
    patch.send_conversions = input.send_conversions;
    // Only orders placed after switching on are sent; nothing older is replayed.
    if (input.send_conversions && !row.send_conversions) patch.conversions_since = new Date().toISOString();
  }

  await saveRow(patch);
  return { settings: await publicSettings(), needsBackfill: Boolean(patch.connected_at) };
}

export async function disconnect() {
  await saveRow({
    ad_account_id: null,
    account_name: null,
    currency: null,
    timezone: null,
    token_encrypted: null,
    token_hint: null,
    send_conversions: false,
    connected_via: null,
    connected_by: null,
    token_expires_at: null,
    connected_at: null,
    last_sync_at: null,
    last_sync_error: null,
  });
  const { error } = await supabase.from('meta_ad_insights').delete().gte('date', '1970-01-01');
  if (error) throw error;
}

export async function markSync(result: { error?: string | null }) {
  await saveRow({
    last_sync_at: new Date().toISOString(),
    last_sync_error: result.error ?? null,
  });
}
