import { supabase } from '../supabase';
import CustomerService from '../customer/service';
import AddressService from '../address/service';
import OrderService from '../orders/service';
import { GoogleSheetService } from '../google/service';
import { shipmentDescriptionFor } from '../orders/database';
import { CHAT_CHANNELS, OrderChannel } from '../orders/channels';
import { findPostcode } from 'malaysia-postcodes';

// An order staff logged in Converra (Log a sale, on WhatsApp, Messenger or Instagram).
// A Converra flow posts it here; from then on it is an ordinary CRM order: it gets
// its sheet row, Autopilot books the parcel and the tracking message goes out as usual.

type Product = { id: string; code: string | null; name: string | null };
export type IncomingItem = { name: string; quantity: number };

export type OrderIntakeResult = {
  status: number;
  body: {
    success: boolean;
    error?: string;
    order_number?: string;
    order_id?: string;
    duplicate?: boolean;
    warning?: string;
    dry_run?: boolean;
    would_save?: Record<string, unknown>;
  };
};

const customerService = new CustomerService();
const addressService = new AddressService();
const orderService = new OrderService();
let sheetService: GoogleSheetService | null = null;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function readItems(raw: unknown): IncomingItem[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => ({
      name: text((entry as { name?: unknown })?.name, 120),
      quantity: Math.floor(Number((entry as { quantity?: unknown })?.quantity)) || 1,
    }))
    .filter((item) => item.name && item.quantity > 0);
}

// "2a1b" typed as one item, the way staff write the order line today.
const CODE_LINE = /^(?:\d+[a-z]+(?:\d+ml)?)+$/i;

/**
 * Match what staff typed to the CRM's products: by product code or by product name,
 * whatever the capitals. Returns the names that match nothing.
 */
export function matchItems(items: IncomingItem[], products: Product[]) {
  const byKey = new Map<string, Product>();
  for (const product of products) {
    if (product.name) byKey.set(product.name.trim().toLowerCase(), product);
  }
  // Codes win over names when both exist.
  for (const product of products) {
    if (product.code) byKey.set(product.code.trim().toLowerCase(), product);
  }

  const quantities = new Map<string, number>();
  const unknown: string[] = [];
  const add = (product: Product, quantity: number) =>
    quantities.set(product.id, (quantities.get(product.id) ?? 0) + quantity);

  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    const direct = byKey.get(key) ?? byKey.get(key.replace(/\s+/g, ''));
    if (direct) {
      add(direct, item.quantity);
      continue;
    }
    const compact = key.replace(/\s+/g, '');
    if (CODE_LINE.test(compact)) {
      const parts = [...compact.matchAll(/(\d+)([a-z]+(?:\d+ml)?)/gi)];
      const found = parts.map((part) => ({ product: byKey.get(part[2].toLowerCase()), quantity: Number(part[1]) }));
      if (found.every((part) => part.product && part.quantity > 0)) {
        for (const part of found) add(part.product as Product, part.quantity * item.quantity);
        continue;
      }
    }
    unknown.push(item.name);
  }
  return {
    items: [...quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
    unknown,
  };
}

/** Postcode, city and state from an address as the customer wrote it. */
export function locateAddress(addressText: string) {
  const flat = addressText.replace(/\s*\n\s*/g, ', ').replace(/\s+/g, ' ').trim();
  // The postcode sits near the end; a house or lot number can also be five digits.
  const fiveDigit = (flat.match(/\b\d{5}\b/g) ?? []).reverse();
  for (const postcode of fiveDigit) {
    const result = findPostcode(postcode, true) as {
      found?: boolean;
      city?: string;
      state?: string;
      results?: { city?: string; state?: string }[];
    };
    if (result?.found) {
      return {
        full_address: flat,
        postcode,
        city: result.city ?? result.results?.[0]?.city ?? '',
        state: result.state ?? result.results?.[0]?.state ?? '',
        country: 'Malaysia',
      };
    }
  }
  const sixDigit = flat.match(/\b\d{6}\b/);
  if (sixDigit && /singapore|\bsg\b/i.test(flat)) {
    return { full_address: flat, postcode: sixDigit[0], city: 'Singapore', state: '', country: 'Singapore' };
  }
  return { full_address: flat, postcode: fiveDigit[0] ?? '', city: '', state: '', country: '' };
}

/** Today's date in Malaysia, the way order dates are stored. */
function todayInMalaysia(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function orderFromConverra(raw: unknown): Promise<OrderIntakeResult> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fail = (error: string, status = 422): OrderIntakeResult => ({ status, body: { success: false, error } });

  const channel = (CHAT_CHANNELS as readonly string[]).includes(String(body.channel))
    ? (body.channel as OrderChannel)
    : 'whatsapp';
  const name = text(body.name, 120);
  const phone = text(body.phone, 30).replace(/\D/g, '');
  const addressText = text(body.address, 500);
  const amount = Number(String(body.amount ?? '').replace(/[^0-9.]/g, ''));
  const payment = body.payment === 'cod' ? 'cod' : 'paid';
  const incoming = readItems(body.items);

  if (!phone) return fail("The order has no phone number. Add the customer's phone and log the sale again.");
  if (!addressText) return fail('The order has no delivery address. Add the address and log the sale again.');
  if (!incoming.length) return fail('The order has no items. Add what the customer bought and log the sale again.');

  const { data: products, error: productsError } = await supabase.from('products').select('id, code, name');
  if (productsError) throw productsError;
  const matched = matchItems(incoming, (products ?? []) as Product[]);
  if (matched.unknown.length) {
    const codes = (products ?? []).map((p: Product) => p.code).filter(Boolean).join(', ');
    return fail(`Not a product in the CRM: ${matched.unknown.join(', ')}. Use a product name or code (${codes}).`);
  }

  // A test from Converra: say what would be saved, save nothing.
  if (body.dry_run === true || body.dry_run === 'true') {
    return {
      status: 200,
      body: {
        success: true,
        dry_run: true,
        order_number: 'TEST',
        would_save: {
          channel,
          name,
          phone,
          address: locateAddress(addressText),
          items: matched.items,
          amount: Number.isFinite(amount) ? amount : 0,
          payment,
        },
      },
    };
  }

  const customer = await customerService.createCustomer({ name: name || undefined, phone_number: phone } as never);
  const orderDate = todayInMalaysia();
  const totalAmount = Number.isFinite(amount) ? amount : 0;
  const shipmentDescription = shipmentDescriptionFor(
    matched.items,
    new Map((products ?? []).map((p: Product) => [p.id, p]))
  );

  // The very same sale sent again (a retry from Converra).
  const saleId = text(body.sale_id, 64);
  const externalRef = saleId ? `converra:${saleId}` : null;
  if (externalRef) {
    const { data: sameSale, error: sameSaleError } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('external_ref', externalRef)
      .is('deleted_at', null)
      .limit(1);
    if (sameSaleError) throw sameSaleError;
    if (sameSale?.[0]) {
      return {
        status: 200,
        body: { success: true, duplicate: true, order_id: sameSale[0].id, order_number: sameSale[0].order_number },
      };
    }
  }

  // The same order already typed on the WhatsApp order line today.
  const existing = await orderService.findSimilarOrder({
    customer_id: customer.id,
    order_date: orderDate,
    total_amount: totalAmount,
    shipment_description: shipmentDescription,
  });
  if (existing) {
    return {
      status: 200,
      body: { success: true, duplicate: true, order_id: existing.id, order_number: existing.order_number },
    };
  }

  const addressFields = locateAddress(addressText);
  const address = await addressService.createAddress({ customer_id: customer.id, ...addressFields } as never);

  const remark = text(body.note, 500) || undefined;
  const order = await orderService.createOrder({
    customer_id: customer.id,
    address_id: address.id,
    order_date: orderDate as never,
    total_amount: totalAmount,
    order_items: matched.items as never,
    shipment_description: shipmentDescription,
    // Saved the way an order from the WhatsApp order line is saved, so reports read both alike.
    // Shipping reads "COD" here to collect the money on delivery.
    ...(payment === 'cod' ? { payment_method: 'COD' } : {}),
    remark,
    source: channel,
    ...(externalRef ? { external_ref: externalRef } : {}),
  } as never);

  // The order sheet staff work from, written the same way as an order from the WhatsApp order line.
  let warning: string | undefined;
  try {
    sheetService = sheetService ?? new GoogleSheetService();
    const sheetResult = await sheetService.createOrder({
      customer: { name: customer.name ?? name, phone_number: customer.phone_number ?? phone },
      order: {
        order_date: orderDate,
        order_items: matched.items.map((item) => ({ ...item })),
        shipment_description: shipmentDescription,
        total_amount: totalAmount,
        ...(payment === 'cod' ? { payment_method: 'COD' } : {}),
      },
      address: addressFields,
      remark,
    } as never);
    if (!sheetResult?.success) warning = 'Saved in the CRM, but the order sheet row was not written.';
  } catch (error) {
    console.error('[converra] Sheet row failed for order from Converra:', order?.id, error);
    warning = 'Saved in the CRM, but the order sheet row was not written.';
  }

  console.log('[converra] Order from Converra saved:', { order: order?.order_number, channel, sale: saleId });
  return {
    status: 200,
    body: { success: true, order_id: order?.id, order_number: order?.order_number, ...(warning ? { warning } : {}) },
  };
}
