"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFullSyncState = getFullSyncState;
exports.runFullCustomerSync = runFullCustomerSync;
exports.startFullCustomerSync = startFullCustomerSync;
/**
 * Full sync of Lunaa customers into Converra contacts (backfill / "Sync now").
 * Safe to re-run: Converra upserts by phone, merges tags, and never overrides a newer opt-out.
 */
const supabase_1 = require("../supabase");
const converra_forwarder_1 = require("./converra-forwarder");
const converra_contact_sync_1 = require("./converra-contact-sync");
const PAGE_SIZE = 500;
// In-memory: resets when lunaa-agent restarts.
let lastSync = {
    running: false,
    startedAt: null,
    finishedAt: null,
    error: null,
    summary: null,
};
function getFullSyncState() {
    return lastSync;
}
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
async function runFullCustomerSync(options = {}) {
    var _a, _b, _c, _d, _e;
    const dryRun = (_a = options.dryRun) !== null && _a !== void 0 ? _a : false;
    const log = (_b = options.log) !== null && _b !== void 0 ? _b : (() => undefined);
    if (!dryRun && !(0, converra_contact_sync_1.isConverraSyncConfigured)()) {
        throw new Error('CONVERRA_API_URL, CONVERRA_BUSINESS_ID and CONVERRA_BRIDGE_API_KEY are required');
    }
    const segments = await loadSegmentNamesByCustomer();
    const runId = new Date().toISOString();
    const summary = {
        dryRun,
        total: 0,
        withoutPhone: 0,
        segmentsMapped: segments.size,
        created: 0,
        updated: 0,
        failed: 0,
    };
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
                summary.withoutPhone += 1;
            return Boolean(c.phone_number);
        });
        summary.total += rows.length;
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
            const counts = (_c = result.response) !== null && _c !== void 0 ? _c : {};
            summary.created += Number((_d = counts.created) !== null && _d !== void 0 ? _d : 0);
            summary.updated += Number((_e = counts.updated) !== null && _e !== void 0 ? _e : 0);
            const pageFailures = Array.isArray(counts.failed) ? counts.failed : [];
            summary.failed += pageFailures.length;
            for (const failure of pageFailures.slice(0, 5))
                log(`page ${page} failure: ${JSON.stringify(failure)}`);
        }
        log(`page ${page}: ${rows.length} customers${dryRun ? ' (dry run)' : ''}`);
        if (data.length < PAGE_SIZE)
            break;
    }
    return summary;
}
/** Starts a background full sync; returns false when one is already running. */
function startFullCustomerSync() {
    if (lastSync.running)
        return false;
    lastSync = {
        running: true,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
        summary: lastSync.summary,
    };
    void runFullCustomerSync({ log: (message) => console.log('[ConverraFullSync]', message) })
        .then((summary) => {
        lastSync = Object.assign(Object.assign({}, lastSync), { running: false, finishedAt: new Date().toISOString(), summary });
    })
        .catch((err) => {
        lastSync = Object.assign(Object.assign({}, lastSync), { running: false, finishedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
    });
    return true;
}
