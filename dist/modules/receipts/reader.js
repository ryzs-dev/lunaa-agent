"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readReceipt = readReceipt;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const zod_1 = require("@anthropic-ai/sdk/helpers/beta/zod");
const v4_1 = require("zod/v4");
const ReceiptReading = v4_1.z.object({
    is_payment_receipt: v4_1.z.boolean(),
    amount: v4_1.z.number().nullable(),
    currency: v4_1.z.string().nullable(),
    paid_on: v4_1.z.string().nullable(),
    reference: v4_1.z.string().nullable(),
    bank: v4_1.z.string().nullable(),
    payer: v4_1.z.string().nullable(),
    note: v4_1.z.string().nullable(),
});
const SYSTEM = `You read payment receipts that a Malaysian shop's staff forward with customer orders: bank transfer and DuitNow confirmations, e-wallet screenshots (Touch 'n Go, GrabPay, Boost, ShopeePay), and similar.

Return what the receipt shows:
- is_payment_receipt: false if the image is not a payment confirmation (a product photo, a chat screenshot, an address).
- amount: the amount paid in this transaction, as a number (310.00 for "RM 310.00"). Never an account balance, a fee shown separately, or a running total.
- currency: the ISO code, usually MYR; SGD for Singapore payments.
- paid_on: the transaction date as YYYY-MM-DD.
- reference: the transaction or reference number exactly as printed.
- bank: the bank or wallet the payment was made from or through.
- payer: the name of the person who paid, if shown.
- note: one short sentence only if something is unclear or looks wrong (cropped amount, failed or pending status); otherwise null.

Use null for anything the receipt does not show. Do not guess.`;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
// The API's per-image limit; larger photos are left for a person to check.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const clients = new Map();
const clientFor = (apiKey) => {
    let client = clients.get(apiKey);
    if (!client) {
        client = new sdk_1.default({ apiKey });
        clients.clear(); // keep only the current key
        clients.set(apiKey, client);
    }
    return client;
};
async function readReceipt(file, mimeType, config) {
    var _a;
    const type = mimeType.split(';')[0].trim().toLowerCase();
    let source;
    if (IMAGE_TYPES.has(type)) {
        if (file.length > MAX_IMAGE_BYTES) {
            return { reading: null, note: 'Image too large to read automatically' };
        }
        source = {
            type: 'image',
            source: {
                type: 'base64',
                media_type: type,
                data: file.toString('base64'),
            },
        };
    }
    else if (type === 'application/pdf') {
        source = {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: file.toString('base64') },
        };
    }
    else {
        return { reading: null, note: `Can't read ${type} files` };
    }
    // Opus and Sonnet retry a declined request on a fallback model; Haiku has no
    // server-side fallback.
    const fallback = config.model === 'claude-haiku-5-5'
        ? {}
        : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
    const response = await clientFor(config.apiKey).beta.messages.parse(Object.assign(Object.assign({ model: config.model, max_tokens: 4000 }, fallback), { output_config: { effort: 'low', format: (0, zod_1.betaZodOutputFormat)(ReceiptReading) }, system: SYSTEM, messages: [
            {
                role: 'user',
                content: [source, { type: 'text', text: 'Read this receipt.' }],
            },
        ] }));
    const usage = {
        model: response.model,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
        cache_read_input_tokens: response.usage.cache_read_input_tokens,
    };
    if (response.stop_reason === 'refusal') {
        return { reading: null, note: 'The receipt could not be read', usage };
    }
    return { reading: (_a = response.parsed_output) !== null && _a !== void 0 ? _a : null, usage };
}
