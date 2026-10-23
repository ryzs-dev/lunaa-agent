"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConnectionRow = loadConnectionRow;
exports.saveConnectionRow = saveConnectionRow;
exports.getConverraConfig = getConverraConfig;
exports.getConverraSyncSettings = getConverraSyncSettings;
exports.getConverraContext = getConverraContext;
exports.isConverraSyncConfigured = isConverraSyncConfigured;
/**
 * Stored Converra connection (single row in public.converra_connection, service role only)
 * and the resolver everything that talks to Converra goes through.
 */
const supabase_1 = require("../supabase");
const converra_config_1 = require("./converra-config");
const TABLE = 'converra_connection';
const ROW_ID = 1;
const CACHE_TTL_MS = 10000;
let cache = null;
function isMissingTable(error) {
    return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205'));
}
/**
 * Loads the connection row (cached for a few seconds — the customer hook calls this per write).
 * Returns null when there is no row, or when the migration hasn't run yet (env fallback keeps working).
 */
async function loadConnectionRow(options = {}) {
    var _a;
    if (!options.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS)
        return cache.row;
    const { data, error } = await supabase_1.supabase.from(TABLE).select('*').eq('id', ROW_ID).maybeSingle();
    if (error) {
        if (isMissingTable(error)) {
            cache = { row: null, at: Date.now() };
            return null;
        }
        throw new Error(`Failed to load Converra connection: ${error.message}`);
    }
    cache = { row: (_a = data) !== null && _a !== void 0 ? _a : null, at: Date.now() };
    return cache.row;
}
/** Upserts columns on the single connection row and returns the updated row. */
async function saveConnectionRow(columns) {
    const { data, error } = await supabase_1.supabase
        .from(TABLE)
        .upsert(Object.assign(Object.assign({}, columns), { id: ROW_ID, updated_at: new Date().toISOString() }), { onConflict: 'id' })
        .select('*')
        .single();
    cache = null;
    if (error) {
        if (isMissingTable(error)) {
            throw new Error('The converra_connection table is missing — run the Supabase migration first.');
        }
        throw new Error(`Failed to save Converra connection: ${error.message}`);
    }
    cache = { row: data, at: Date.now() };
    return data;
}
async function getConverraConfig() {
    return (0, converra_config_1.resolveConverraConfig)(await loadConnectionRow());
}
async function getConverraSyncSettings() {
    return (0, converra_config_1.syncSettingsFromRow)(await loadConnectionRow());
}
async function getConverraContext(options = {}) {
    const row = await loadConnectionRow(options);
    return { row, config: (0, converra_config_1.resolveConverraConfig)(row), settings: (0, converra_config_1.syncSettingsFromRow)(row) };
}
async function isConverraSyncConfigured() {
    return (await getConverraConfig()) !== null;
}
