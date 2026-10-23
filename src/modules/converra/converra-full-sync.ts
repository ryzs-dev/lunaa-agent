/**
 * Full sync of Lunaa customers into Converra contacts (backfill / "Sync now" / after connecting).
 * Safe to re-run: Converra upserts by phone, merges tags, and never overrides a newer opt-out.
 *
 * Each dashboard-started run is recorded in public.converra_sync_runs (running → succeeded/failed).
 * Only one run at a time per lunaa-agent process (in-memory guard).
 */
import { supabase } from '../supabase';
import { forwardToConverra } from './converra-forwarder';
import { getConverraContext } from './converra-connection';
import { ConverraConfig, ConverraSyncSettings, customerMatchesSegmentFilter } from './converra-config';
import { LunaaCustomerRow, toConverraContact } from './converra-contact-sync';

const PAGE_SIZE = 500;
const RUNS_TABLE = 'converra_sync_runs';

export interface FullSyncSummary {
  dryRun: boolean;
  total: number;
  withoutPhone: number;
  /** Customers left out by the "only selected segments" filter. */
  skippedBySegment: number;
  segmentsMapped: number;
  created: number;
  updated: number;
  failed: number;
}

export type SyncTrigger = 'manual' | 'connect';
export type SyncStatus = 'running' | 'succeeded' | 'failed';

export interface SyncRun {
  id: string;
  trigger: SyncTrigger;
  startedBy: string | null;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  created: number;
  updated: number;
  failed: number;
  withoutPhone: number;
  error: string | null;
}

interface SyncRunRow {
  id: string;
  trigger: SyncTrigger;
  started_by: string | null;
  status: SyncStatus;
  started_at: string;
  finished_at: string | null;
  total: number | null;
  created: number | null;
  updated: number | null;
  failed: number | null;
  without_phone: number | null;
  error: string | null;
}

export function toSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    trigger: row.trigger,
    startedBy: row.started_by,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    total: row.total ?? 0,
    created: row.created ?? 0,
    updated: row.updated ?? 0,
    failed: row.failed ?? 0,
    withoutPhone: row.without_phone ?? 0,
    error: row.error,
  };
}

// In-memory: the run this process is executing right now.
let currentRun: SyncRun | null = null;
let staleRunsChecked = false;

export function getCurrentSyncRun(): SyncRun | null {
  return currentRun;
}

/** Runs left "running" by a previous process (restart/crash) can never finish — mark them failed. */
async function failStaleRuns(): Promise<void> {
  if (staleRunsChecked) return;
  let query = supabase
    .from(RUNS_TABLE)
    .update({ status: 'failed', finished_at: new Date().toISOString(), error: 'Interrupted — lunaa-agent restarted' })
    .eq('status', 'running');
  if (currentRun && currentRun.id !== 'pending') query = query.neq('id', currentRun.id);
  const { error } = await query;
  if (!error) staleRunsChecked = true;
}

export async function listSyncRuns(limit = 20): Promise<SyncRun[]> {
  await failStaleRuns();
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select('*')
    .order('started_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(`Failed to load sync history: ${error.message}`);
  return ((data ?? []) as SyncRunRow[]).map(toSyncRun);
}

export async function getLastFinishedSyncRun(): Promise<SyncRun | null> {
  await failStaleRuns();
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select('*')
    .neq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the last sync: ${error.message}`);
  return data ? toSyncRun(data as SyncRunRow) : null;
}

/** customer id → segments ({ id, name }) */
async function loadSegmentsByCustomer(): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const byCustomer = new Map<string, Array<{ id: string; name: string }>>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('segment_members')
      .select('user_id, segment_id, segments(name)')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Failed to load segment members: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as Array<{
      user_id: string;
      segment_id: string;
      segments?: { name?: string } | null;
    }>) {
      if (!row.user_id || !row.segment_id) continue;
      const list = byCustomer.get(row.user_id) ?? [];
      list.push({ id: String(row.segment_id), name: row.segments?.name ?? '' });
      byCustomer.set(row.user_id, list);
    }
    if (data.length < 1000) break;
  }
  return byCustomer;
}

export async function runFullCustomerSync(
  options: {
    dryRun?: boolean;
    log?: (message: string) => void;
    /** Called after each page with the running totals. */
    onProgress?: (summary: FullSyncSummary) => void;
    config?: ConverraConfig;
    settings?: ConverraSyncSettings;
  } = {},
): Promise<FullSyncSummary> {
  const dryRun = options.dryRun ?? false;
  const log = options.log ?? (() => undefined);

  let { config, settings } = options;
  if (!config || !settings) {
    const context = await getConverraContext({ fresh: true });
    config = config ?? context.config ?? undefined;
    settings = settings ?? context.settings;
  }
  if (!dryRun && !config) {
    throw new Error('Converra is not connected. Connect it from Integrations → Converra.');
  }

  const segments = await loadSegmentsByCustomer();
  const runId = new Date().toISOString();
  const summary: FullSyncSummary = {
    dryRun,
    total: 0,
    withoutPhone: 0,
    skippedBySegment: 0,
    segmentsMapped: segments.size,
    created: 0,
    updated: 0,
    failed: 0,
  };

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load customers: ${error.message}`);
    if (!data || data.length === 0) break;

    const rows = (data as LunaaCustomerRow[]).filter((c) => {
      const customerSegments = segments.get(c.id) ?? [];
      if (!customerMatchesSegmentFilter(customerSegments.map((s) => s.id), settings!.segmentIds)) {
        summary.skippedBySegment += 1;
        return false;
      }
      if (!c.phone_number) {
        summary.withoutPhone += 1;
        return false;
      }
      return true;
    });
    summary.total += rows.length;

    if (!dryRun && rows.length > 0) {
      const result = await forwardToConverra(
        {
          event_type: 'customer.batch_upserted',
          external_event_id: `backfill:${runId}:${page}`,
          timestamp: new Date().toISOString(),
          payload: {
            customers: rows.map((c) =>
              toConverraContact(
                c,
                (segments.get(c.id) ?? []).map((s) => s.name).filter(Boolean),
                settings,
              ),
            ),
          },
        },
        config,
      );
      if (!result.success) throw new Error(`Converra rejected page ${page}: ${result.error}`);
      const counts = result.response ?? {};
      summary.created += Number(counts.created ?? 0);
      summary.updated += Number(counts.updated ?? 0);
      const pageFailures = Array.isArray(counts.failed) ? counts.failed : [];
      summary.failed += pageFailures.length;
      for (const failure of pageFailures.slice(0, 5)) log(`page ${page} failure: ${JSON.stringify(failure)}`);
    }

    log(`page ${page}: ${rows.length} customers${dryRun ? ' (dry run)' : ''}`);
    options.onProgress?.({ ...summary });
    if (data.length < PAGE_SIZE) break;
  }

  return summary;
}

function countsFrom(summary: FullSyncSummary) {
  return {
    total: summary.total,
    created: summary.created,
    updated: summary.updated,
    failed: summary.failed,
    without_phone: summary.withoutPhone,
  };
}

/**
 * Starts a background full sync and records it in converra_sync_runs.
 * Returns null when a run is already in progress, throws when Converra isn't connected.
 */
export async function startFullCustomerSync(options: {
  trigger: SyncTrigger;
  startedBy: string | null;
}): Promise<SyncRun | null> {
  if (currentRun) return null;

  const { config, settings } = await getConverraContext({ fresh: true });
  if (!config) throw new Error('Converra is not connected');
  if (currentRun) return null;

  // Claim the in-memory slot before the first await on the database.
  const placeholder: SyncRun = {
    id: 'pending',
    trigger: options.trigger,
    startedBy: options.startedBy,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    total: 0,
    created: 0,
    updated: 0,
    failed: 0,
    withoutPhone: 0,
    error: null,
  };
  currentRun = placeholder;

  try {
    await failStaleRuns();
    const { data, error } = await supabase
      .from(RUNS_TABLE)
      .insert({
        trigger: options.trigger,
        started_by: options.startedBy,
        status: 'running',
        started_at: placeholder.startedAt,
        business_id: config.businessId,
      })
      .select('*')
      .single();
    if (error) throw new Error(`Failed to record the sync run: ${error.message}`);
    currentRun = toSyncRun(data as SyncRunRow);
  } catch (err) {
    currentRun = null;
    throw err;
  }

  const run = currentRun;
  const finish = async (columns: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from(RUNS_TABLE)
      .update({ ...columns, finished_at: new Date().toISOString() })
      .eq('id', run.id)
      .select('*')
      .single();
    if (error) console.error('[ConverraFullSync] Failed to record the result:', error.message);
    currentRun = null;
    return data ? toSyncRun(data as SyncRunRow) : null;
  };

  void runFullCustomerSync({
    config,
    settings,
    log: (message) => console.log('[ConverraFullSync]', message),
    onProgress: (summary) => {
      if (currentRun?.id === run.id) {
        currentRun = {
          ...currentRun,
          total: summary.total,
          created: summary.created,
          updated: summary.updated,
          failed: summary.failed,
          withoutPhone: summary.withoutPhone,
        };
      }
    },
  })
    .then((summary) => finish({ status: 'succeeded', ...countsFrom(summary) }))
    .catch((err) => {
      const progress = currentRun?.id === run.id ? currentRun : run;
      return finish({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        total: progress.total,
        created: progress.created,
        updated: progress.updated,
        failed: progress.failed,
        without_phone: progress.withoutPhone,
      });
    })
    .catch((err) => {
      console.error('[ConverraFullSync] Unexpected error:', err);
      currentRun = null;
    });

  return run;
}
