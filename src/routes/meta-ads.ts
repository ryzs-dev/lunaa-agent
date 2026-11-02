import express from 'express';
import { supabase } from '../modules/supabase';
import { disconnect, publicSettings, updateSettings } from '../modules/meta-ads/settings';
import { BACKFILL_DAYS, runSync } from '../modules/meta-ads/scheduler';
import { resolveMonthKey } from '../utils/timezone';

export const metaAdsRouter = express.Router();

metaAdsRouter.get('/settings', async (_req, res) => {
  try {
    res.json({ success: true, settings: await publicSettings() });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

metaAdsRouter.put('/settings', async (req, res) => {
  try {
    const { ad_account_id, access_token, dataset_id, send_conversions } = req.body ?? {};
    const { settings, needsBackfill } = await updateSettings({
      ad_account_id: typeof ad_account_id === 'string' ? ad_account_id : undefined,
      access_token: typeof access_token === 'string' ? access_token : undefined,
      dataset_id: dataset_id === null || typeof dataset_id === 'string' ? dataset_id : undefined,
      send_conversions: typeof send_conversions === 'boolean' ? send_conversions : undefined,
    });
    // A new connection pulls the last 90 days in the background.
    if (needsBackfill) runSync(BACKFILL_DAYS).catch((e) => console.error('[meta-ads] backfill failed:', e.message));
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

metaAdsRouter.delete('/settings', async (_req, res) => {
  try {
    await disconnect();
    res.json({ success: true, settings: await publicSettings() });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

metaAdsRouter.post('/sync', async (_req, res) => {
  try {
    const result = await runSync();
    res.json({ success: true, result, settings: await publicSettings() });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Campaign totals for a month (or a single day), highest spend first.
metaAdsRouter.get('/campaigns', async (req, res) => {
  try {
    let from: string;
    let to: string;
    if (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      from = to = req.query.date;
    } else {
      const month = resolveMonthKey(typeof req.query.month === 'string' ? req.query.month : undefined);
      from = `${month}-01`;
      const [y, m] = month.split('-').map(Number);
      to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    }
    res.json({ success: true, from, to, campaigns: await campaignTotals(from, to) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export async function campaignTotals(from: string, to: string) {
  const { data, error } = await supabase
    .from('meta_ad_insights')
    .select('campaign_id, campaign_name, spend, impressions, reach, clicks, conversations, purchases, purchase_value')
    .gte('date', from)
    .lte('date', to)
    .limit(10000);
  if (error) throw error;

  const byCampaign = new Map<string, any>();
  for (const r of data ?? []) {
    const c = byCampaign.get(r.campaign_id) ?? {
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      conversations: 0,
      purchases: 0,
      purchase_value: 0,
    };
    for (const key of ['spend', 'impressions', 'reach', 'clicks', 'conversations', 'purchases', 'purchase_value']) {
      c[key] += Number((r as any)[key]) || 0;
    }
    byCampaign.set(r.campaign_id, c);
  }
  return [...byCampaign.values()]
    .map((c) => ({
      ...c,
      spend: Math.round(c.spend * 100) / 100,
      cost_per_conversation: c.conversations ? Math.round((c.spend / c.conversations) * 100) / 100 : null,
      roas: c.spend ? Math.round((c.purchase_value / c.spend) * 100) / 100 : null,
    }))
    .sort((a, b) => b.spend - a.spend);
}
