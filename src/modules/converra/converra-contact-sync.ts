/**
 * Syncs Lunaa customers into Converra as WhatsApp contacts.
 *
 * Event types sent to Converra's bridge (see converra-forwarder.ts):
 *   customer.upserted        — one customer, fired after create/update
 *   customer.batch_upserted  — up to 500 customers (backfill script)
 *
 * Segment names become Converra tags, so Converra broadcasts can target Lunaa segments.
 * Marketing consent is only sent when the customer row has the consent columns
 * (marketing_opt_in_status / _at / _source); otherwise Converra keeps what it knows.
 */
import { forwardToConverra } from './converra-forwarder';
import { supabase } from '../supabase';

export interface LunaaCustomerRow {
  id: string;
  name?: string | null;
  fb_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  repeat_customer?: string | null;
  updated_at?: string | null;
  marketing_opt_in_status?: string | null;
  marketing_opt_in_at?: string | null;
  marketing_opt_in_source?: string | null;
}

export function isConverraSyncConfigured(): boolean {
  return Boolean(
    process.env.CONVERRA_API_URL?.trim() &&
      process.env.CONVERRA_BUSINESS_ID?.trim() &&
      process.env.CONVERRA_BRIDGE_API_KEY?.trim(),
  );
}

export function toConverraContact(
  customer: LunaaCustomerRow,
  segmentNames: string[] = [],
): Record<string, unknown> {
  const tags = [...segmentNames];
  if (customer.repeat_customer === 'returning') tags.push('returning-customer');

  return {
    id: customer.id,
    phone_number: customer.phone_number,
    name: customer.name || customer.fb_name || null,
    email: customer.email || null,
    tags,
    ...(customer.marketing_opt_in_status
      ? {
          marketing_opt_in: customer.marketing_opt_in_status,
          marketing_opt_in_at: customer.marketing_opt_in_at ?? null,
          marketing_opt_in_source: customer.marketing_opt_in_source || 'lunaa_crm',
        }
      : {}),
  };
}

async function loadSegmentNames(customerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('segment_members')
    .select('segments(name)')
    .eq('user_id', customerId);
  if (error || !data) return [];

  return data
    .map((row) => (row as { segments?: { name?: string } | null }).segments?.name)
    .filter((name): name is string => Boolean(name));
}

/** Fire-and-forget: never blocks or fails the caller's customer write. */
export function syncCustomerToConverra(customer: LunaaCustomerRow | null | undefined): void {
  if (!customer?.id || !customer.phone_number || !isConverraSyncConfigured()) return;

  void (async () => {
    try {
      const segmentNames = await loadSegmentNames(customer.id);
      await forwardToConverra({
        event_type: 'customer.upserted',
        external_event_id: `customer:${customer.id}:${customer.updated_at ?? Date.now()}`,
        business_id: process.env.CONVERRA_BUSINESS_ID!.trim(),
        timestamp: new Date().toISOString(),
        payload: toConverraContact(customer, segmentNames),
      });
    } catch (err) {
      console.error('[ConverraContactSync] Failed to sync customer:', customer.id, err);
    }
  })();
}
