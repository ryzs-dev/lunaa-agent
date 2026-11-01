"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsError = exports.RECEIPT_MODELS = void 0;
exports.costOf = costOf;
exports.monthUsage = monthUsage;
exports.readingConfig = readingConfig;
exports.publicSettings = publicSettings;
exports.updateSettings = updateSettings;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const supabase_1 = require("../supabase");
const secret_1 = require("./secret");
exports.RECEIPT_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
// US$ per million tokens. Anything else (a fallback model the API switched to)
// is priced high so the monthly cap errs on the safe side.
const PRICES = {
    'claude-opus-5-5': { input: 4, output: 20 },
    'claude-sonnet-5-5': { input: 2, output: 10 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};
const FALLBACK_PRICE = { input: 5, output: 25 };
function costOf(usage) {
    var _a, _b, _c;
    const price = (_a = PRICES[usage.model]) !== null && _a !== void 0 ? _a : FALLBACK_PRICE;
    const input = usage.input_tokens +
        ((_b = usage.cache_creation_input_tokens) !== null && _b !== void 0 ? _b : 0) * 1.25 +
        ((_c = usage.cache_read_input_tokens) !== null && _c !== void 0 ? _c : 0) * 0.1;
    return (input * price.input + usage.output_tokens * price.output) / 1000000;
}
async function getRow() {
    const { data, error } = await supabase_1.supabase.from('receipt_settings').select('*').eq('id', 1).single();
    if (error)
        throw error;
    return Object.assign(Object.assign({}, data), { monthly_cap_usd: Number(data.monthly_cap_usd) });
}
function monthStartMalaysia() {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 8 * 60 * 60 * 1000).toISOString();
}
async function monthUsage() {
    const { data, error } = await supabase_1.supabase
        .from('order_receipts')
        .select('cost_usd')
        .gte('checked_at', monthStartMalaysia())
        .not('cost_usd', 'is', null);
    if (error)
        throw error;
    const rows = data !== null && data !== void 0 ? data : [];
    return {
        receipts_read: rows.length,
        cost_usd: Math.round(rows.reduce((sum, r) => sum + Number(r.cost_usd), 0) * 10000) / 10000,
    };
}
// What reading needs right now: a key, the model, and room under the cap.
async function readingConfig() {
    var _a;
    const row = await getRow();
    if (!row.enabled)
        return { ready: false, reason: 'Receipt reading is switched off in Settings' };
    let apiKey = (_a = process.env.ANTHROPIC_API_KEY) !== null && _a !== void 0 ? _a : null;
    if (row.api_key_encrypted) {
        try {
            apiKey = (0, secret_1.decryptSecret)(row.api_key_encrypted);
        }
        catch (_b) {
            return { ready: false, reason: 'The saved Anthropic key can’t be read. Enter it again in Settings.' };
        }
    }
    if (!apiKey)
        return { ready: false, reason: 'No Anthropic key yet. Add one in Settings to check receipts.' };
    const usage = await monthUsage();
    if (usage.cost_usd >= row.monthly_cap_usd) {
        return {
            ready: false,
            reason: `This month’s US$${row.monthly_cap_usd.toFixed(2)} reading limit is reached. Reading resumes on the 1st.`,
        };
    }
    return { ready: true, apiKey, model: row.model };
}
async function publicSettings() {
    var _a;
    const [row, usage] = await Promise.all([getRow(), monthUsage()]);
    return {
        enabled: row.enabled,
        has_key: Boolean(row.api_key_encrypted) || Boolean(process.env.ANTHROPIC_API_KEY),
        key_hint: (_a = row.api_key_hint) !== null && _a !== void 0 ? _a : (process.env.ANTHROPIC_API_KEY ? 'Set on the server' : null),
        model: row.model,
        monthly_cap_usd: row.monthly_cap_usd,
        month: usage,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
    };
}
class SettingsError extends Error {
}
exports.SettingsError = SettingsError;
async function updateSettings(input) {
    const patch = {
        updated_at: new Date().toISOString(),
        updated_by: typeof input.updated_by === 'string' ? input.updated_by : null,
    };
    if (input.enabled !== undefined) {
        if (typeof input.enabled !== 'boolean')
            throw new SettingsError('enabled must be true or false');
        patch.enabled = input.enabled;
    }
    if (input.model !== undefined) {
        if (!exports.RECEIPT_MODELS.includes(input.model))
            throw new SettingsError('Unknown model');
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
    }
    else if (input.api_key !== undefined) {
        const key = typeof input.api_key === 'string' ? input.api_key.trim() : '';
        if (!key.startsWith('sk-ant-'))
            throw new SettingsError('That doesn’t look like an Anthropic API key (sk-ant-…)');
        // Check the key with Anthropic before saving it. Looking up a model costs nothing.
        try {
            await new sdk_1.default({ apiKey: key, maxRetries: 0 }).models.retrieve('claude-opus-5-5');
        }
        catch (error) {
            if (error instanceof sdk_1.default.AuthenticationError || error instanceof sdk_1.default.PermissionDeniedError) {
                throw new SettingsError('Anthropic rejected that key. Check it and try again.');
            }
            throw new SettingsError('Couldn’t reach Anthropic to check the key. Try again shortly.');
        }
        patch.api_key_encrypted = (0, secret_1.encryptSecret)(key);
        patch.api_key_hint = `${key.slice(0, 7)}…${key.slice(-4)}`;
    }
    const { error } = await supabase_1.supabase.from('receipt_settings').update(patch).eq('id', 1);
    if (error)
        throw error;
    return publicSettings();
}
