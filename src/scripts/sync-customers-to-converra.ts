/**
 * Backfill / periodic full sync of Lunaa customers into Converra contacts.
 *
 *   npx ts-node src/scripts/sync-customers-to-converra.ts --dry-run
 *   npx ts-node src/scripts/sync-customers-to-converra.ts
 *
 * Requires CONVERRA_API_URL, CONVERRA_BUSINESS_ID, CONVERRA_BRIDGE_API_KEY (and Supabase env).
 * Safe to re-run: Converra upserts by phone, merges tags, and never overrides a newer opt-out.
 */
import { supabase } from '../modules/supabase';
import { forwardToConverra } from '../modules/converra/converra-forwarder';
import {
  isConverraSyncConfigured,
  LunaaCustomerRow,
  toConverraContact,
} from '../modules/converra/converra-contact-sync';

const PAGE_SIZE = 500;

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

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && !isConverraSyncConfigured()) {
    throw new Error('CONVERRA_API_URL, CONVERRA_BUSINESS_ID and CONVERRA_BRIDGE_API_KEY are required');
  }

  const segments = await loadSegmentNamesByCustomer();
  const runId = new Date().toISOString();
  let total = 0;
  let withoutPhone = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;

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
      if (!c.phone_number) withoutPhone += 1;
      return Boolean(c.phone_number);
    });
    total += rows.length;

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
      created += Number(counts.created ?? 0);
      updated += Number(counts.updated ?? 0);
      const pageFailures = Array.isArray(counts.failed) ? counts.failed : [];
      failed += pageFailures.length;
      for (const failure of pageFailures.slice(0, 5)) console.warn(`[sync] page ${page} failure:`, failure);
    }

    console.log(`[sync] page ${page}: ${rows.length} customers${dryRun ? ' (dry run)' : ''}`);
    if (data.length < PAGE_SIZE) break;
  }

  console.log(
    JSON.stringify({ dryRun, total, withoutPhone, segmentsMapped: segments.size, created, updated, failed }),
  );
}

main().catch((err) => {
  console.error('[sync] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
