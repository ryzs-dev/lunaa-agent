/**
 * Stored Converra connection (single row in public.converra_connection, service role only)
 * and the resolver everything that talks to Converra goes through.
 */
import { supabase } from '../supabase';
import {
  ConverraConfig,
  ConverraConnectionRow,
  ConverraSyncSettings,
  resolveConverraConfig,
  syncSettingsFromRow,
} from './converra-config';

const TABLE = 'converra_connection';
const ROW_ID = 1;
const CACHE_TTL_MS = 10_000;

let cache: { row: ConverraConnectionRow | null; at: number } | null = null;

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205'));
}

/**
 * Loads the connection row (cached for a few seconds — the customer hook calls this per write).
 * Returns null when there is no row, or when the migration hasn't run yet (env fallback keeps working).
 */
export async function loadConnectionRow(options: { fresh?: boolean } = {}): Promise<ConverraConnectionRow | null> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.row;

  const { data, error } = await supabase.from(TABLE).select('*').eq('id', ROW_ID).maybeSingle();
  if (error) {
    if (isMissingTable(error)) {
      cache = { row: null, at: Date.now() };
      return null;
    }
    throw new Error(`Failed to load Converra connection: ${error.message}`);
  }
  cache = { row: (data as ConverraConnectionRow | null) ?? null, at: Date.now() };
  return cache.row;
}

/** Upserts columns on the single connection row and returns the updated row. */
export async function saveConnectionRow(
  columns: Partial<ConverraConnectionRow>,
): Promise<ConverraConnectionRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ ...columns, id: ROW_ID, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('*')
    .single();
  cache = null;
  if (error) {
    if (isMissingTable(error)) {
      throw new Error('The converra_connection table is missing — run the Supabase migration first.');
    }
    throw new Error(`Failed to save Converra connection: ${error.message}`);
  }
  cache = { row: data as ConverraConnectionRow, at: Date.now() };
  return data as ConverraConnectionRow;
}

export async function getConverraConfig(): Promise<ConverraConfig | null> {
  return resolveConverraConfig(await loadConnectionRow());
}

export async function getConverraSyncSettings(): Promise<ConverraSyncSettings> {
  return syncSettingsFromRow(await loadConnectionRow());
}

export async function getConverraContext(
  options: { fresh?: boolean } = {},
): Promise<{ row: ConverraConnectionRow | null; config: ConverraConfig | null; settings: ConverraSyncSettings }> {
  const row = await loadConnectionRow(options);
  return { row, config: resolveConverraConfig(row), settings: syncSettingsFromRow(row) };
}

export async function isConverraSyncConfigured(): Promise<boolean> {
  return (await getConverraConfig()) !== null;
}
