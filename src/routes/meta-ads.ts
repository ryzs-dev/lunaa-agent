import express from 'express';
import { supabase } from '../modules/supabase';
import { addExtraAccount, connection, disconnect, publicSettings, setExtraAccounts, trackedAccounts, updateSettings } from '../modules/meta-ads/settings';
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
import { listPages, pageReport, postComments } from '../modules/meta-ads/pages';
import { adComments, adDetail, campaignAds, campaignName } from '../modules/meta-ads/comments';
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
  const result = await handleCallback(req.query);
  // Signing in again clears an old sync error; a first connection pulls 13 months.
  if (result.connected) {
    (result.backfill ? runSync(BACKFILL_DAYS) : runSync()).catch((e) =>
      console.error('[meta-ads] sync after sign-in failed:', e.message)
    );
  }
  res.redirect(result.url);
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

// Every ad account the saved sign-in can open, to choose extra ones from.
metaAdsRouter.get('/accounts/available', async (_req, res) => {
  try {
    res.json({ success: true, ...(await listAdAccounts()) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.response?.data?.error?.message ?? error.message });
  }
});

// Facebook pages the sign-in manages, and one page's insights for a period.
metaAdsRouter.get('/pages', async (_req, res) => {
  try {
    res.json({ success: true, pages: await listPages() });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.response?.data?.error?.message ?? error.message });
  }
});

metaAdsRouter.get('/pages/:id/report', async (req, res) => {
  try {
    const report = await pageReport(req.params.id, String(req.query.from ?? ''), String(req.query.to ?? ''));
    res.json({ success: true, report });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.response?.data?.error?.message ?? error.message });
  }
});

metaAdsRouter.get('/pages/:id/posts/:postId/comments', async (req, res) => {
  try {
    res.json({ success: true, comments: await postComments(req.params.id, req.params.postId) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.response?.data?.error?.message ?? error.message });
  }
});

// A campaign's ads in a period, with each ad's comment count.
metaAdsRouter.get('/campaigns/:id/ads', async (req, res) => {
  try {
    const ads = await campaignAds(
      String(req.query.account ?? ''),
      req.params.id,
      String(req.query.from ?? ''),
      String(req.query.to ?? '')
    );
    res.json({ success: true, campaign: await campaignName(req.params.id).catch(() => null), ads });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.response?.data?.error?.message ?? error.message });
  }
});

// One ad with its numbers and comments.
metaAdsRouter.get('/ads/:id', async (req, res) => {
  try {
    res.json({ success: true, ad: await adDetail(req.params.id, String(req.query.from ?? ''), String(req.query.to ?? '')) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.response?.data?.error?.message ?? error.message });
  }
});

// Comments on the ads an account ran in a period, newest first.
metaAdsRouter.get('/comments', async (req, res) => {
  try {
    const comments = await adComments(String(req.query.account ?? ''), String(req.query.from ?? ''), String(req.query.to ?? ''));
    res.json({ success: true, comments });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error?.response?.data?.error?.message ?? error.message });
  }
});

// The extra ad accounts synced for the Ads page (the main one stays as is).
metaAdsRouter.put('/accounts', async (req, res) => {
  try {
    const ids = req.body?.extra;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new Error('Send a list of ad account IDs');
    const { settings, added } = await setExtraAccounts(ids);
    if (added.length) {
      runSync(BACKFILL_DAYS, added).catch((e) => console.error('[meta-ads] backfill failed:', e.message));
    }
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Switching to an account on the Ads page that isn't synced yet adds it.
metaAdsRouter.post('/accounts/add', async (req, res) => {
  try {
    const id = req.body?.id;
    if (typeof id !== 'string' || !id) throw new Error('Pick an ad account');
    const { settings, added } = await addExtraAccount(id);
    if (added.length) {
      runSync(BACKFILL_DAYS, added).catch((e) => console.error('[meta-ads] backfill failed:', e.message));
    }
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Everything the Ads page shows for a date range: totals, each day with the
// CRM's sales beside the spend, and each campaign. Days are Malaysia days.
metaAdsRouter.get('/report', async (req, res) => {
  try {
    const from = String(req.query.from ?? '');
    const to = String(req.query.to ?? '');
    if (!DAY.test(from) || !DAY.test(to) || from > to) {
      return res.status(400).json({ success: false, message: 'Pick a start and end date.' });
    }
    const span = (Date.parse(to) - Date.parse(from)) / 86400000;
    if (span > 400) {
      return res.status(400).json({ success: false, message: 'Pick at most about a year at a time.' });
    }

    const conn = await connection();
    if (!conn) return res.status(400).json({ success: false, message: 'Connect Meta ads first.' });
    const tracked = trackedAccounts(conn.row);
    // "all" adds up the accounts in the main account's currency.
    const wanted = String(req.query.account ?? 'all');
    const chosen =
      wanted === 'all'
        ? tracked.filter((a) => a.currency === conn.row.currency)
        : tracked.filter((a) => a.id === wanted);
    if (!chosen.length) return res.status(400).json({ success: false, message: 'That ad account isn’t connected.' });
    const ids = chosen.map((a) => a.id);
    const currency = chosen[0].currency;

    const [campaigns, insights, sales, first, last] = await Promise.all([
      campaignTotals(from, to, ids),
      supabase
        .from('meta_ad_insights')
        .select('date, spend, impressions, clicks, conversations, purchases, purchase_value')
        .in('ad_account_id', ids)
        .gte('date', from)
        .lte('date', to)
        .limit(20000),
      supabase.rpc('get_sales_by_day', { first_day: from, last_day: to }),
      supabase.from('meta_ad_insights').select('date').in('ad_account_id', ids).order('date').limit(1),
      supabase.from('meta_ad_insights').select('date').in('ad_account_id', ids).gt('spend', 0).order('date', { ascending: false }).limit(1),
    ]);
    if (insights.error) throw insights.error;
    if (sales.error) throw sales.error;

    const ads = new Map<string, any>();
    for (const r of insights.data ?? []) {
      const d = ads.get(r.date) ?? { spend: 0, impressions: 0, clicks: 0, conversations: 0, purchases: 0, purchase_value: 0 };
      for (const k of Object.keys(d)) d[k] += Number((r as any)[k]) || 0;
      ads.set(r.date, d);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const days = (sales.data ?? []).map((s: any) => {
      const a = ads.get(s.day) ?? {};
      return {
        date: s.day,
        spend: round(a.spend ?? 0),
        impressions: a.impressions ?? 0,
        clicks: a.clicks ?? 0,
        conversations: a.conversations ?? 0,
        orders: Number(s.orders),
        revenue: Number(s.revenue),
        chat_orders: Number(s.chat_orders),
        chat_revenue: Number(s.chat_revenue),
        new_customers: Number(s.new_customers),
      };
    });

    const sum = (key: string) => days.reduce((t: number, d: any) => t + d[key], 0);
    const purchases = campaigns.reduce((t, c) => t + c.purchases, 0);
    const purchaseValue = campaigns.reduce((t, c) => t + c.purchase_value, 0);
    const totals = {
      spend: round(sum('spend')),
      impressions: sum('impressions'),
      clicks: sum('clicks'),
      conversations: sum('conversations'),
      purchases,
      purchase_value: round(purchaseValue),
      orders: sum('orders'),
      revenue: round(sum('revenue')),
      chat_orders: sum('chat_orders'),
      chat_revenue: round(sum('chat_revenue')),
      new_customers: sum('new_customers'),
    };

    res.json({
      success: true,
      from,
      to,
      account: wanted === 'all' ? 'all' : ids[0],
      accounts: chosen,
      currency,
      data_since: first.data?.[0]?.date ?? null,
      last_spend_day: last.data?.[0]?.date ?? null,
      totals,
      days,
      campaigns,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Without `accounts`, the main account only (what the dashboard and the
// export show beside sales). Other accounts are for the Ads page.
export async function campaignTotals(from: string, to: string, accounts?: string[]) {
  let ids = accounts;
  if (!ids) {
    const conn = await connection();
    ids = conn ? [conn.row.ad_account_id as string] : [];
  }
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('meta_ad_insights')
    .select('date, ad_account_id, campaign_id, campaign_name, spend, impressions, reach, clicks, conversations, purchases, purchase_value')
    .in('ad_account_id', ids)
    .gte('date', from)
    .lte('date', to)
    .limit(20000);
  if (error) throw error;

  const byCampaign = new Map<string, any>();
  for (const r of data ?? []) {
    const c = byCampaign.get(r.campaign_id) ?? {
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      ad_account_id: r.ad_account_id,
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      conversations: 0,
      purchases: 0,
      purchase_value: 0,
      first_day: null as string | null,
      last_day: null as string | null,
    };
    if (Number(r.spend) > 0) {
      if (!c.first_day || r.date < c.first_day) c.first_day = r.date;
      if (!c.last_day || r.date > c.last_day) c.last_day = r.date;
    }
    for (const key of ['spend', 'impressions', 'reach', 'clicks', 'conversations', 'purchases', 'purchase_value']) {
      c[key] += Number((r as any)[key]) || 0;
    }
    byCampaign.set(r.campaign_id, c);
  }
  return [...byCampaign.values()]
    .map((c) => ({
      ...c,
      spend: Math.round(c.spend * 100) / 100,
      purchase_value: Math.round(c.purchase_value * 100) / 100,
      ctr: c.impressions ? Math.round((c.clicks / c.impressions) * 10000) / 100 : null,
      cost_per_conversation: c.conversations ? Math.round((c.spend / c.conversations) * 100) / 100 : null,
      roas: c.spend ? Math.round((c.purchase_value / c.spend) * 100) / 100 : null,
    }))
    .filter((c) => c.spend > 0 || c.impressions > 0)
    .sort((a, b) => b.spend - a.spend);
}
