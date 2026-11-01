import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import { decryptSecret, encryptSecret } from './secret';

export const RECEIPT_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type ReceiptModel = (typeof RECEIPT_MODELS)[number];

// US$ per million tokens. Anything else (a fallback model the API switched to)
// is priced high so the monthly cap errs on the safe side.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};
const FALLBACK_PRICE = { input: 5, output: 25 };

export type Usage = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function costOf(usage: Usage) {
  const price = PRICES[usage.model] ?? FALLBACK_PRICE;
  const input =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * price.input + usage.output_tokens * price.output) / 1_000_000;
}

type Row = {
  enabled: boolean;
  api_key_encrypted: string | null;
  api_key_hint: string | null;
  model: ReceiptModel;
  monthly_cap_usd: number;
  updated_at: string;
  updated_by: string | null;
};

async function getRow(): Promise<Row> {
  const { data, error } = await supabase.from('receipt_settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return { ...data, monthly_cap_usd: Number(data.monthly_cap_usd) };
}

function monthStartMalaysia() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 8 * 60 * 60 * 1000).toISOString();
}

export async function monthUsage() {
  const { data, error } = await supabase
    .from('order_receipts')
    .select('cost_usd')
    .gte('checked_at', monthStartMalaysia())
    .not('cost_usd', 'is', null);
  if (error) throw error;
  const rows = data ?? [];
  return {
    receipts_read: rows.length,
    cost_usd: Math.round(rows.reduce((sum, r) => sum + Number(r.cost_usd), 0) * 10000) / 10000,
  };
}

// What reading needs right now: a key, the model, and room under the cap.
export async function readingConfig(): Promise<
  | { ready: true; apiKey: string; model: ReceiptModel }
  | { ready: false; reason: string }
> {
  const row = await getRow();
  if (!row.enabled) return { ready: false, reason: 'Receipt reading is switched off in Settings' };

  let apiKey = process.env.ANTHROPIC_API_KEY ?? null;
  if (row.api_key_encrypted) {
    try {
      apiKey = decryptSecret(row.api_key_encrypted);
    } catch {
      return { ready: false, reason: 'The saved Anthropic key can’t be read. Enter it again in Settings.' };
    }
  }
  if (!apiKey) return { ready: false, reason: 'No Anthropic key yet. Add one in Settings to check receipts.' };

  const usage = await monthUsage();
  if (usage.cost_usd >= row.monthly_cap_usd) {
    return {
      ready: false,
      reason: `This month’s US$${row.monthly_cap_usd.toFixed(2)} reading limit is reached. Reading resumes on the 1st.`,
    };
  }
  return { ready: true, apiKey, model: row.model };
}

export async function publicSettings() {
  const [row, usage] = await Promise.all([getRow(), monthUsage()]);
  return {
    enabled: row.enabled,
    has_key: Boolean(row.api_key_encrypted) || Boolean(process.env.ANTHROPIC_API_KEY),
    key_hint: row.api_key_hint ?? (process.env.ANTHROPIC_API_KEY ? 'Set on the server' : null),
    model: row.model,
    monthly_cap_usd: row.monthly_cap_usd,
    month: usage,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

export class SettingsError extends Error {}

export async function updateSettings(input: {
  enabled?: unknown;
  api_key?: unknown;
  clear_key?: unknown;
  model?: unknown;
  monthly_cap_usd?: unknown;
  updated_by?: unknown;
}) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: typeof input.updated_by === 'string' ? input.updated_by : null,
  };

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') throw new SettingsError('enabled must be true or false');
    patch.enabled = input.enabled;
  }
  if (input.model !== undefined) {
    if (!RECEIPT_MODELS.includes(input.model as ReceiptModel)) throw new SettingsError('Unknown model');
    patch.model = input.model;
  }
  if (input.monthly_cap_usd !== undefined) {
    const cap = Number(input.monthly_cap_usd);
    if (!Number.isFinite(cap) || cap < 0 || cap > 1000) {
      throw new SettingsError('Monthly limit must be between US$0 and US$1,000');
    }
    patch.monthly_cap_usd = cap;
  }
  if (input.clear_key === true) {
    patch.api_key_encrypted = null;
    patch.api_key_hint = null;
  } else if (input.api_key !== undefined) {
    const key = typeof input.api_key === 'string' ? input.api_key.trim() : '';
    if (!key.startsWith('sk-ant-')) throw new SettingsError('That doesn’t look like an Anthropic API key (sk-ant-…)');
    // Check the key with Anthropic before saving it. Looking up a model costs nothing.
    try {
      await new Anthropic({ apiKey: key, maxRetries: 0 }).models.retrieve('claude-opus-5-5');
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new SettingsError('Anthropic rejected that key. Check it and try again.');
      }
      throw new SettingsError('Couldn’t reach Anthropic to check the key. Try again shortly.');
    }
    patch.api_key_encrypted = encryptSecret(key);
    patch.api_key_hint = `${key.slice(0, 7)}…${key.slice(-4)}`;
  }

  const { error } = await supabase.from('receipt_settings').update(patch).eq('id', 1);
  if (error) throw error;
  return publicSettings();
}
