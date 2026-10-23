"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSyncRun = toSyncRun;
exports.getCurrentSyncRun = getCurrentSyncRun;
exports.listSyncRuns = listSyncRuns;
exports.getLastFinishedSyncRun = getLastFinishedSyncRun;
exports.runFullCustomerSync = runFullCustomerSync;
exports.startFullCustomerSync = startFullCustomerSync;
/**
 * Full sync of Lunaa customers into Converra contacts (backfill / "Sync now" / after connecting).
 * Safe to re-run: Converra upserts by phone, merges tags, and never overrides a newer opt-out.
 *
 * Each dashboard-started run is recorded in public.converra_sync_runs (running → succeeded/failed).
 * Only one run at a time per lunaa-agent process (in-memory guard).
 */
const supabase_1 = require("../supabase");
const converra_forwarder_1 = require("./converra-forwarder");
const converra_connection_1 = require("./converra-connection");
const converra_config_1 = require("./converra-config");
const converra_contact_sync_1 = require("./converra-contact-sync");
const PAGE_SIZE = 500;
const RUNS_TABLE = 'converra_sync_runs';
function toSyncRun(row) {
    var _a, _b, _c, _d, _e;
    return {
        id: row.id,
        trigger: row.trigger,
        startedBy: row.started_by,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        total: (_a = row.total) !== null && _a !== void 0 ? _a : 0,
        created: (_b = row.created) !== null && _b !== void 0 ? _b : 0,
        updated: (_c = row.updated) !== null && _c !== void 0 ? _c : 0,
        failed: (_d = row.failed) !== null && _d !== void 0 ? _d : 0,
        withoutPhone: (_e = row.without_phone) !== null && _e !== void 0 ? _e : 0,
        error: row.error,
    };
}
// In-memory: the run this process is executing right now.
let currentRun = null;
let staleRunsChecked = false;
function getCurrentSyncRun() {
    return currentRun;
}
/** Runs left "running" by a previous process (restart/crash) can never finish — mark them failed. */
async function failStaleRuns() {
    if (staleRunsChecked)
        return;
    let query = supabase_1.supabase
        .from(RUNS_TABLE)
        .update({ status: 'failed', finished_at: new Date().toISOString(), error: 'Interrupted — lunaa-agent restarted' })
        .eq('status', 'running');
    if (currentRun && currentRun.id !== 'pending')
        query = query.neq('id', currentRun.id);
    const { error } = await query;
    if (!error)
        staleRunsChecked = true;
}
async function listSyncRuns(limit = 20) {
    await failStaleRuns();
    const { data, error } = await supabase_1.supabase
        .from(RUNS_TABLE)
        .select('*')
        .order('started_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 100));
    if (error)
        throw new Error(`Failed to load sync history: ${error.message}`);
    return (data !== null && data !== void 0 ? data : []).map(toSyncRun);
}
async function getLastFinishedSyncRun() {
    await failStaleRuns();
    const { data, error } = await supabase_1.supabase
        .from(RUNS_TABLE)
        .select('*')
        .neq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error)
        throw new Error(`Failed to load the last sync: ${error.message}`);
    return data ? toSyncRun(data) : null;
}
/** customer id → segments ({ id, name }) */
async function loadSegmentsByCustomer() {
    var _a, _b, _c;
    const byCustomer = new Map();
    for (let from = 0;; from += 1000) {
        const { data, error } = await supabase_1.supabase
            .from('segment_members')
            .select('user_id, segment_id, segments(name)')
            .order('id', { ascending: true })
            .range(from, from + 999);
        if (error)
            throw new Error(`Failed to load segment members: ${error.message}`);
        if (!data || data.length === 0)
            break;
        for (const row of data) {
            if (!row.user_id || !row.segment_id)
                continue;
            const list = (_a = byCustomer.get(row.user_id)) !== null && _a !== void 0 ? _a : [];
            list.push({ id: String(row.segment_id), name: (_c = (_b = row.segments) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : '' });
            byCustomer.set(row.user_id, list);
        }
        if (data.length < 1000)
            break;
    }
    return byCustomer;
}
async function runFullCustomerSync(options = {}) {
    var _a, _b, _c, _d, _e, _f, _g;
    const dryRun = (_a = options.dryRun) !== null && _a !== void 0 ? _a : false;
    const log = (_b = options.log) !== null && _b !== void 0 ? _b : (() => undefined);
    let { config, settings } = options;
    if (!config || !settings) {
        const context = await (0, converra_connection_1.getConverraContext)({ fresh: true });
        config = (_c = config !== null && config !== void 0 ? config : context.config) !== null && _c !== void 0 ? _c : undefined;
        settings = settings !== null && settings !== void 0 ? settings : context.settings;
    }
    if (!dryRun && !config) {
        throw new Error('Converra is not connected. Connect it from Integrations → Converra.');
    }
    const segments = await loadSegmentsByCustomer();
    const runId = new Date().toISOString();
    const summary = {
        dryRun,
        total: 0,
        withoutPhone: 0,
        skippedBySegment: 0,
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
            var _a;
            const customerSegments = (_a = segments.get(c.id)) !== null && _a !== void 0 ? _a : [];
            if (!(0, converra_config_1.customerMatchesSegmentFilter)(customerSegments.map((s) => s.id), settings.segmentIds)) {
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
            const result = await (0, converra_forwarder_1.forwardToConverra)({
                event_type: 'customer.batch_upserted',
                external_event_id: `backfill:${runId}:${page}`,
                timestamp: new Date().toISOString(),
                payload: {
                    customers: rows.map((c) => {
                        var _a;
                        return (0, converra_contact_sync_1.toConverraContact)(c, ((_a = segments.get(c.id)) !== null && _a !== void 0 ? _a : []).map((s) => s.name).filter(Boolean), settings);
                    }),
                },
            }, config);
            if (!result.success)
                throw new Error(`Converra rejected page ${page}: ${result.error}`);
            const counts = (_d = result.response) !== null && _d !== void 0 ? _d : {};
            summary.created += Number((_e = counts.created) !== null && _e !== void 0 ? _e : 0);
            summary.updated += Number((_f = counts.updated) !== null && _f !== void 0 ? _f : 0);
            const pageFailures = Array.isArray(counts.failed) ? counts.failed : [];
            summary.failed += pageFailures.length;
            for (const failure of pageFailures.slice(0, 5))
                log(`page ${page} failure: ${JSON.stringify(failure)}`);
        }
        log(`page ${page}: ${rows.length} customers${dryRun ? ' (dry run)' : ''}`);
        (_g = options.onProgress) === null || _g === void 0 ? void 0 : _g.call(options, Object.assign({}, summary));
        if (data.length < PAGE_SIZE)
            break;
    }
    return summary;
}
function countsFrom(summary) {
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
async function startFullCustomerSync(options) {
    if (currentRun)
        return null;
    const { config, settings } = await (0, converra_connection_1.getConverraContext)({ fresh: true });
    if (!config)
        throw new Error('Converra is not connected');
    if (currentRun)
        return null;
    // Claim the in-memory slot before the first await on the database.
    const placeholder = {
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
        const { data, error } = await supabase_1.supabase
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
        if (error)
            throw new Error(`Failed to record the sync run: ${error.message}`);
        currentRun = toSyncRun(data);
    }
    catch (err) {
        currentRun = null;
        throw err;
    }
    const run = currentRun;
    const finish = async (columns) => {
        const { data, error } = await supabase_1.supabase
            .from(RUNS_TABLE)
            .update(Object.assign(Object.assign({}, columns), { finished_at: new Date().toISOString() }))
            .eq('id', run.id)
            .select('*')
            .single();
        if (error)
            console.error('[ConverraFullSync] Failed to record the result:', error.message);
        currentRun = null;
        return data ? toSyncRun(data) : null;
    };
    void runFullCustomerSync({
        config,
        settings,
        log: (message) => console.log('[ConverraFullSync]', message),
        onProgress: (summary) => {
            if ((currentRun === null || currentRun === void 0 ? void 0 : currentRun.id) === run.id) {
                currentRun = Object.assign(Object.assign({}, currentRun), { total: summary.total, created: summary.created, updated: summary.updated, failed: summary.failed, withoutPhone: summary.withoutPhone });
            }
        },
    })
        .then((summary) => finish(Object.assign({ status: 'succeeded' }, countsFrom(summary))))
        .catch((err) => {
        const progress = (currentRun === null || currentRun === void 0 ? void 0 : currentRun.id) === run.id ? currentRun : run;
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
