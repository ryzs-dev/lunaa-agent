import express from 'express';
import { supabase } from '../modules/supabase';
import { disconnect, publicSettings, updateSettings } from '../modules/meta-ads/settings';
import { BACKFILL_DAYS, runSync } from '../modules/meta-ads/scheduler';
import {
  clearPending,
  defaultReturn,
  handleCallback,
  listAdAccounts,
  listDatasets,
  startUrl,
  takePendingToken,
} from '../modules/meta-ads/oauth';
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

// Continue with Facebook: the CRM sends the browser here, Meta sends it back
// to /oauth/callback, and that returns it to the CRM to pick an ad account.
metaAdsRouter.get('/oauth/start', (req, res) => {
  const returnTo = typeof req.query.return_to === 'string' ? req.query.return_to : defaultReturn();
  try {
    res.redirect(startUrl(returnTo));
  } catch (error: any) {
    const back = new URL(defaultReturn());
    back.searchParams.set('meta', 'error');
    back.searchParams.set('reason', error.message);
    res.redirect(back.toString());
  }
});

metaAdsRouter.get('/oauth/callback', async (req, res) => {
  res.redirect(await handleCallback(req.query));
});

metaAdsRouter.get('/oauth/accounts', async (_req, res) => {
  try {
    res.json({ success: true, ...(await listAdAccounts()) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.response?.data?.error?.message ?? error.message });
  }
});

metaAdsRouter.get('/oauth/datasets', async (req, res) => {
  try {
    const account = String(req.query.account ?? '');
    if (!/^act_\d+$/.test(account)) throw new Error('Pick an ad account');
    res.json({ success: true, datasets: await listDatasets(account) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.response?.data?.error?.message ?? error.message });
  }
});

// Finish signing in: save the chosen ad account (and dataset) with the token.
metaAdsRouter.post('/oauth/finish', async (req, res) => {
  try {
    const { ad_account_id, dataset_id } = req.body ?? {};
    if (typeof ad_account_id !== 'string' || !ad_account_id) throw new Error('Pick an ad account');
    const pending = await takePendingToken();
    const { settings, needsBackfill } = await updateSettings({
      ad_account_id,
      access_token: pending.token,
      via: 'facebook',
      by: pending.user,
      expires_at: pending.expiresAt,
      ...(typeof dataset_id === 'string' ? { dataset_id: dataset_id || null } : {}),
    });
    await clearPending();
    if (needsBackfill) runSync(BACKFILL_DAYS).catch((e) => console.error('[meta-ads] backfill failed:', e.message));
    res.json({ success: true, settings: await publicSettings() });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

metaAdsRouter.post('/oauth/cancel', async (_req, res) => {
  try {
    await clearPending();
    res.json({ success: true, settings: await publicSettings() });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
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
