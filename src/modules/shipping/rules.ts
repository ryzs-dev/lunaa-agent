import { UUID } from 'crypto';
import { supabase } from '../supabase';
import { ParcelDailyService } from '../parcel-daily/service';
import { buildShipmentFromOrder, isBookableCourier } from '../orders/shipment-from-order';

const PARCEL_DAILY_API_URL =
  process.env.PARCEL_DAILY_API_URL || 'http://localhost:4002/api/parceldaily';
const parcelDaily = new ParcelDailyService(PARCEL_DAILY_API_URL);

export interface ShippingRules {
  fallback_courier: string | null;
  cod_courier: string | null;
  detect_cod: boolean;
  updated_at: string;
  updated_by: string | null;
}

export class ShippingRulesError extends Error {}

export async function getShippingRules(): Promise<ShippingRules> {
  const { data, error } = await supabase.from('shipping_rules').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function updateShippingRules(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: typeof input.updated_by === 'string' ? input.updated_by : null,
  };
  for (const field of ['fallback_courier', 'cod_courier'] as const) {
    if (input[field] === undefined) continue;
    const value = input[field];
    if (value !== null && (typeof value !== 'string' || !isBookableCourier(value))) {
      throw new ShippingRulesError(`Unknown courier "${String(value)}"`);
    }
    patch[field] = value;
  }
  if (input.detect_cod !== undefined) {
    if (typeof input.detect_cod !== 'boolean') throw new ShippingRulesError('detect_cod must be true or false');
    patch.detect_cod = input.detect_cod;
  }
  const { error } = await supabase.from('shipping_rules').update(patch).eq('id', 1);
  if (error) throw error;
  return getShippingRules();
}

type OrderForBooking = {
  id: string;
  total_amount?: number | null;
  payment_method?: string | null;
  customers?: { name?: string | null } | null;
} & Record<string, unknown>;

// Staff write "COD" after the customer's name; a payment method of COD counts too.
export function isCodOrder(order: OrderForBooking) {
  return /\bcod\b/i.test(order.payment_method ?? '') || /\bcod\b/i.test(order.customers?.name ?? '');
}

export type BookingResult =
  | { success: true; courier: string; usedFallback: boolean; cod: number; note?: string; data: unknown }
  | { success: false; courier: string; error: string; data?: unknown };

/**
 * Books one order with Parcel Daily using the shipping rules:
 * COD orders go to the COD courier and collect the order total; everything
 * else uses `courier` (a person's choice) or the Parcel Daily default. If that
 * booking fails, it is tried once more with the fallback courier.
 */
export async function bookShipment(
  order: OrderForBooking,
  options: { courier?: string; isDropoff?: boolean } = {}
): Promise<BookingResult> {
  const [rules, defaults] = await Promise.all([
    getShippingRules(),
    parcelDaily
      .getSettings()
      .then((r) => (r?.data?.defaults ?? {}) as { courier?: string; isDropoff?: boolean })
      .catch(() => ({}) as { courier?: string; isDropoff?: boolean }),
  ]);

  const cod = rules.detect_cod && isCodOrder(order) ? Number(order.total_amount) || 0 : 0;
  const primary =
    (cod > 0 && rules.cod_courier) || options.courier || defaults.courier || 'spx';
  const isDropoff = options.isDropoff ?? defaults.isDropoff === true;

  const attempt = async (courier: string) => {
    const built = buildShipmentFromOrder(order as never, { serviceProvider: courier, isDropoff, cod });
    if (built.error || !built.shipment) {
      return { ok: false as const, error: built.error ?? 'Could not build the shipment', fatal: true };
    }
    const result = await parcelDaily.createShipment(built.shipment, order.id as UUID);
    if (result?.success === false) {
      return {
        ok: false as const,
        error: typeof result.message === 'string' ? result.message : 'Parcel Daily shipment failed',
        fatal: false,
        data: result,
      };
    }
    return { ok: true as const, data: result?.data ?? result };
  };

  const first = await attempt(primary);
  if (first.ok) return { success: true, courier: primary, usedFallback: false, cod, data: first.data };

  // Address or order problems fail the same way with any courier, so only a
  // courier-side failure moves on to the fallback.
  const fallback = rules.fallback_courier;
  if (first.fatal || !fallback || fallback === primary) {
    return { success: false, courier: primary, error: first.error, data: 'data' in first ? first.data : undefined };
  }

  const second = await attempt(fallback);
  if (second.ok) {
    return {
      success: true,
      courier: fallback,
      usedFallback: true,
      cod,
      note: `${primary} failed (${first.error}); booked with ${fallback}`,
      data: second.data,
    };
  }
  return {
    success: false,
    courier: fallback,
    error: `${primary}: ${first.error}; ${fallback}: ${second.error}`,
    data: 'data' in second ? second.data : undefined,
  };
}
