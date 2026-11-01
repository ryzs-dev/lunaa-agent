import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';

const ReceiptReading = z.object({
  is_payment_receipt: z.boolean(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  paid_on: z.string().nullable(),
  reference: z.string().nullable(),
  bank: z.string().nullable(),
  payer: z.string().nullable(),
  note: z.string().nullable(),
});

export type ReceiptReading = z.infer<typeof ReceiptReading>;

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

let client: Anthropic | null = null;

export function receiptReadingEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function readReceipt(
  file: Buffer,
  mimeType: string
): Promise<{ reading: ReceiptReading | null; note?: string }> {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  let source: Anthropic.Beta.BetaContentBlockParam;

  if (IMAGE_TYPES.has(type)) {
    if (file.length > MAX_IMAGE_BYTES) {
      return { reading: null, note: 'Image too large to read automatically' };
    }
    source = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: file.toString('base64'),
      },
    };
  } else if (type === 'application/pdf') {
    source = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: file.toString('base64') },
    };
  } else {
    return { reading: null, note: `Can't read ${type} files` };
  }

  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    // If the request is declined, the API retries it on a fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(ReceiptReading) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [source, { type: 'text', text: 'Read this receipt.' }],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    return { reading: null, note: 'The receipt could not be read' };
  }
  return { reading: response.parsed_output ?? null };
}
