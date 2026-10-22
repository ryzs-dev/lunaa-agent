"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Backfill / periodic full sync of Lunaa customers into Converra contacts.
 *
 *   npx ts-node src/scripts/sync-customers-to-converra.ts --dry-run
 *   npx ts-node src/scripts/sync-customers-to-converra.ts
 *
 * Requires CONVERRA_API_URL, CONVERRA_BUSINESS_ID, CONVERRA_BRIDGE_API_KEY (and Supabase env).
 * Safe to re-run: Converra upserts by phone, merges tags, and never overrides a newer opt-out.
 */
const supabase_1 = require("../modules/supabase");
const converra_forwarder_1 = require("../modules/converra/converra-forwarder");
const converra_contact_sync_1 = require("../modules/converra/converra-contact-sync");
const PAGE_SIZE = 500;
async function loadSegmentNamesByCustomer() {
    var _a, _b;
    const byCustomer = new Map();
    for (let from = 0;; from += 1000) {
        const { data, error } = await supabase_1.supabase
            .from('segment_members')
            .select('user_id, segments(name)')
            .range(from, from + 999);
        if (error)
            throw new Error(`Failed to load segment members: ${error.message}`);
        if (!data || data.length === 0)
            break;
        for (const row of data) {
            const name = (_a = row.segments) === null || _a === void 0 ? void 0 : _a.name;
            if (!name)
                continue;
            byCustomer.set(row.user_id, [...((_b = byCustomer.get(row.user_id)) !== null && _b !== void 0 ? _b : []), name]);
        }
        if (data.length < 1000)
            break;
    }
    return byCustomer;
}
async function main() {
    var _a, _b, _c;
    const dryRun = process.argv.includes('--dry-run');
    if (!dryRun && !(0, converra_contact_sync_1.isConverraSyncConfigured)()) {
        throw new Error('CONVERRA_API_URL, CONVERRA_BUSINESS_ID and CONVERRA_BRIDGE_API_KEY are required');
    }
    const segments = await loadSegmentNamesByCustomer();
    const runId = new Date().toISOString();
    let total = 0;
    let withoutPhone = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    for (let page = 0;; page += 1) {
        const { data, error } = await supabase_1.supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error)
            throw new Error(`Failed to load customers: ${error.message}`);
        if (!data || data.length === 0)
            break;
        const rows = data.filter((c) => {
            if (!c.phone_number)
                withoutPhone += 1;
            return Boolean(c.phone_number);
        });
        total += rows.length;
        if (!dryRun && rows.length > 0) {
            const result = await (0, converra_forwarder_1.forwardToConverra)({
                event_type: 'customer.batch_upserted',
                external_event_id: `backfill:${runId}:${page}`,
                business_id: process.env.CONVERRA_BUSINESS_ID.trim(),
                timestamp: new Date().toISOString(),
                payload: { customers: rows.map((c) => { var _a; return (0, converra_contact_sync_1.toConverraContact)(c, (_a = segments.get(c.id)) !== null && _a !== void 0 ? _a : []); }) },
            });
            if (!result.success)
                throw new Error(`Converra rejected page ${page}: ${result.error}`);
            const counts = (_a = result.response) !== null && _a !== void 0 ? _a : {};
            created += Number((_b = counts.created) !== null && _b !== void 0 ? _b : 0);
            updated += Number((_c = counts.updated) !== null && _c !== void 0 ? _c : 0);
            const pageFailures = Array.isArray(counts.failed) ? counts.failed : [];
            failed += pageFailures.length;
            for (const failure of pageFailures.slice(0, 5))
                console.warn(`[sync] page ${page} failure:`, failure);
        }
        console.log(`[sync] page ${page}: ${rows.length} customers${dryRun ? ' (dry run)' : ''}`);
        if (data.length < PAGE_SIZE)
            break;
    }
    console.log(JSON.stringify({ dryRun, total, withoutPhone, segmentsMapped: segments.size, created, updated, failed }));
}
main().catch((err) => {
    console.error('[sync] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
