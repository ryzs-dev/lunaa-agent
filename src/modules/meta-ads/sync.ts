import { supabase } from '../supabase';
import { connection, markSync } from './settings';
import { graphError, graphGet } from './graph';

type Action = { action_type: string; value: string };

const CONVERSATION_TYPES = ['onsite_conversion.messaging_conversation_started_7d'];
// Meta reports a purchase under several names depending on where it came from;
// omni_purchase already totals them when present.
const PURCHASE_TYPES = [
  'omni_purchase',
  'purchase',
  'offline_conversion.purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_conversion.purchase',
];

function pick(actions: Action[] | undefined, types: string[]) {
  for (const type of types) {
    const hit = actions?.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

function ymd(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

function chunks(since: string, until: string, size: number) {
  const out: { since: string; until: string }[] = [];
  let start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (start <= end) {
    const stop = new Date(Math.min(start.getTime() + (size - 1) * 86400000, end.getTime()));
    out.push({ since: start.toISOString().slice(0, 10), until: stop.toISOString().slice(0, 10) });
    start = new Date(stop.getTime() + 86400000);
  }
  return out;
}

// Pulls campaign numbers per day for the last `days` days (the ad account's
// own calendar) and replaces what was stored for those days. Meta keeps
// revising recent days as late conversions come in, so recent days are re-read.
export async function syncInsights(days: number) {
  const conn = await connection();
  if (!conn) return { skipped: true as const };

  const tz = conn.row.timezone || 'Asia/Kuala_Lumpur';
  const until = ymd(new Date(), tz);
  const since = ymd(new Date(Date.now() - (days - 1) * 86400000), tz);

  try {
    const rows: Record<string, any>[] = [];
    // Long ranges go in 90-day pieces; Meta times out on a year of daily rows.
    for (const range of chunks(since, until, 90)) {
    let page: any = await graphGet(`${conn.row.ad_account_id}/insights`, conn.token, {
      level: 'campaign',
      time_increment: 1,
      time_range: JSON.stringify(range),
      fields: 'campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values',
      limit: 500,
    });
    for (;;) {
      for (const r of page.data ?? []) {
        rows.push({
          date: r.date_start,
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name ?? null,
          spend: Number(r.spend) || 0,
          impressions: Number(r.impressions) || 0,
          reach: Number(r.reach) || 0,
          clicks: Number(r.clicks) || 0,
          conversations: pick(r.actions, CONVERSATION_TYPES),
          purchases: pick(r.actions, PURCHASE_TYPES),
          purchase_value: pick(r.action_values, PURCHASE_TYPES),
          synced_at: new Date().toISOString(),
        });
      }
      if (!page.paging?.next) break;
      page = await graphGet(page.paging.next, conn.token);
    }
    }

    const { error: delError } = await supabase
      .from('meta_ad_insights')
      .delete()
      .gte('date', since)
      .lte('date', until);
    if (delError) throw delError;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('meta_ad_insights').insert(rows.slice(i, i + 500));
      if (error) throw error;
    }

    await markSync({});
    return { since, until, rows: rows.length };
  } catch (error: any) {
    const message = error?.response ? graphError(error) : error?.message ?? String(error);
    await markSync({ error: message });
    throw new Error(message);
  }
}
