/**
 * Syncs Lunaa customers into Converra as WhatsApp contacts.
 *
 * Event types sent to Converra's bridge (see converra-forwarder.ts):
 *   customer.upserted        — one customer, fired after create/update (when auto-sync is on)
 *   customer.batch_upserted  — up to 500 customers (full sync)
 *
 * Sync settings (Integrations → Converra → Sync settings):
 *   syncSegments — segment names become Converra tags, so broadcasts can target Lunaa segments
 *   syncEmail    — whether the email address is sent
 *   segmentIds   — only customers in these segments sync (null = all customers)
 * Marketing consent is only sent when the customer row has the consent columns
 * (marketing_opt_in_status / _at / _source); otherwise Converra keeps what it knows.
 */
import { forwardToConverra } from './converra-forwarder';
import { getConverraContext } from './converra-connection';
import { customerMatchesSegmentFilter } from './converra-config';
import { supabase } from '../supabase';

export { isConverraSyncConfigured } from './converra-connection';

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

export interface ContactOptions {
  syncSegments?: boolean;
  syncEmail?: boolean;
}

export interface CustomerSegment {
  id: string;
  name: string;
}

export function toConverraContact(
  customer: LunaaCustomerRow,
  segmentNames: string[] = [],
  options: ContactOptions = {},
): Record<string, unknown> {
  const syncSegments = options.syncSegments ?? true;
  const syncEmail = options.syncEmail ?? true;

  const tags = syncSegments ? [...segmentNames] : [];
  if (customer.repeat_customer === 'returning') tags.push('returning-customer');

  return {
    id: customer.id,
    phone_number: customer.phone_number,
    name: customer.name || customer.fb_name || null,
    // Omitted (not null) when email sync is off, so Converra keeps whatever it already has.
    ...(syncEmail ? { email: customer.email || null } : {}),
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

async function loadCustomerSegments(customerId: string): Promise<CustomerSegment[]> {
  const { data, error } = await supabase
    .from('segment_members')
    .select('segment_id, segments(name)')
    .eq('user_id', customerId);
  if (error || !data) return [];

  return (data as Array<{ segment_id: string; segments?: { name?: string } | null }>)
    .filter((row) => row.segment_id)
    .map((row) => ({ id: String(row.segment_id), name: row.segments?.name ?? '' }));
}

/** Fire-and-forget: never blocks or fails the caller's customer write. */
export function syncCustomerToConverra(customer: LunaaCustomerRow | null | undefined): void {
  if (!customer?.id || !customer.phone_number) return;

  void (async () => {
    try {
      const { config, settings } = await getConverraContext();
      if (!config || !settings.autoSync) return;

      const segments = await loadCustomerSegments(customer.id);
      if (!customerMatchesSegmentFilter(segments.map((s) => s.id), settings.segmentIds)) return;

      await forwardToConverra(
        {
          event_type: 'customer.upserted',
          external_event_id: `customer:${customer.id}:${customer.updated_at ?? Date.now()}`,
          timestamp: new Date().toISOString(),
          payload: toConverraContact(
            customer,
            segments.map((s) => s.name).filter(Boolean),
            settings,
          ),
        },
        config,
      );
    } catch (err) {
      console.error('[ConverraContactSync] Failed to sync customer:', customer.id, err);
    }
  })();
}
