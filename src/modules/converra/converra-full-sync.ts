/**
 * Full sync of Lunaa customers into Converra contacts (backfill / "Sync now").
 * Safe to re-run: Converra upserts by phone, merges tags, and never overrides a newer opt-out.
 */
import { supabase } from '../supabase';
import { forwardToConverra } from './converra-forwarder';
import {
  isConverraSyncConfigured,
  LunaaCustomerRow,
  toConverraContact,
} from './converra-contact-sync';

const PAGE_SIZE = 500;

export interface FullSyncSummary {
  dryRun: boolean;
  total: number;
  withoutPhone: number;
  segmentsMapped: number;
  created: number;
  updated: number;
  failed: number;
}

export interface FullSyncState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  summary: FullSyncSummary | null;
}

// In-memory: resets when lunaa-agent restarts.
let lastSync: FullSyncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  error: null,
  summary: null,
};

export function getFullSyncState(): FullSyncState {
  return lastSync;
}

async function loadSegmentNamesByCustomer(): Promise<Map<string, string[]>> {
  const byCustomer = new Map<string, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('segment_members')
      .select('user_id, segments(name)')
      .range(from, from + 999);
    if (error) throw new Error(`Failed to load segment members: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as Array<{ user_id: string; segments?: { name?: string } | null }>) {
      const name = row.segments?.name;
      if (!name) continue;
      byCustomer.set(row.user_id, [...(byCustomer.get(row.user_id) ?? []), name]);
    }
    if (data.length < 1000) break;
  }
  return byCustomer;
}

export async function runFullCustomerSync(
  options: { dryRun?: boolean; log?: (message: string) => void } = {},
): Promise<FullSyncSummary> {
  const dryRun = options.dryRun ?? false;
  const log = options.log ?? (() => undefined);
  if (!dryRun && !isConverraSyncConfigured()) {
    throw new Error('CONVERRA_API_URL, CONVERRA_BUSINESS_ID and CONVERRA_BRIDGE_API_KEY are required');
  }

  const segments = await loadSegmentNamesByCustomer();
  const runId = new Date().toISOString();
  const summary: FullSyncSummary = {
    dryRun,
    total: 0,
    withoutPhone: 0,
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
      if (!c.phone_number) summary.withoutPhone += 1;
      return Boolean(c.phone_number);
    });
    summary.total += rows.length;

    if (!dryRun && rows.length > 0) {
      const result = await forwardToConverra({
        event_type: 'customer.batch_upserted',
        external_event_id: `backfill:${runId}:${page}`,
        business_id: process.env.CONVERRA_BUSINESS_ID!.trim(),
        timestamp: new Date().toISOString(),
        payload: { customers: rows.map((c) => toConverraContact(c, segments.get(c.id) ?? [])) },
      });
      if (!result.success) throw new Error(`Converra rejected page ${page}: ${result.error}`);
      const counts = result.response ?? {};
      summary.created += Number(counts.created ?? 0);
      summary.updated += Number(counts.updated ?? 0);
      const pageFailures = Array.isArray(counts.failed) ? counts.failed : [];
      summary.failed += pageFailures.length;
      for (const failure of pageFailures.slice(0, 5)) log(`page ${page} failure: ${JSON.stringify(failure)}`);
    }

    log(`page ${page}: ${rows.length} customers${dryRun ? ' (dry run)' : ''}`);
    if (data.length < PAGE_SIZE) break;
  }

  return summary;
}

/** Starts a background full sync; returns false when one is already running. */
export function startFullCustomerSync(): boolean {
  if (lastSync.running) return false;

  lastSync = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    summary: lastSync.summary,
  };

  void runFullCustomerSync({ log: (message) => console.log('[ConverraFullSync]', message) })
    .then((summary) => {
      lastSync = { ...lastSync, running: false, finishedAt: new Date().toISOString(), summary };
    })
    .catch((err) => {
      lastSync = {
        ...lastSync,
        running: false,
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    });

  return true;
}
