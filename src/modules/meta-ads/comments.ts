import { graphGet } from './graph';
import { PostComment, cached, pageToken, postsWithComments, userToken } from './pages';

// Ads and their comments for the Ads page: a campaign's ads (Campaigns tab →
// a campaign → its ads → an ad's comments), and every comment on the
// account's ads in a period, grouped by the ad's post (Comments tab).

export type CampaignAd = {
  ad_id: string;
  name: string;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversations: number;
  thumbnail: string | null;
  // The ad's post, "<page id>_<post id>"; comments live on it.
  post_id: string | null;
  page_id: string | null;
  permalink: string | null;
  comments: number;
};

export type AdCommentGroup = {
  post_id: string;
  page_id: string;
  ads: string[];
  campaigns: string[];
  thumbnail: string | null;
  permalink: string | null;
  total: number;
  comments: PostComment[];
};

const CONVERSATION = 'onsite_conversion.messaging_conversation_started_7d';

function check(accountId: string, from: string, to: string) {
  if (!/^act_\d+$/.test(accountId)) throw new Error('Unknown ad account');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error('Send from and to as YYYY-MM-DD');
  }
}

// Ad-level numbers for the period, optionally for one campaign.
async function adInsights(token: string, accountId: string, from: string, to: string, campaignId?: string) {
  const filtering: any[] = [{ field: 'impressions', operator: 'GREATER_THAN', value: 0 }];
  if (campaignId) filtering.push({ field: 'campaign.id', operator: 'EQUAL', value: campaignId });
  const rows: any[] = [];
  let page: any = await graphGet(`${accountId}/insights`, token, {
    level: 'ad',
    fields: 'ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since: from, until: to }),
    filtering: JSON.stringify(filtering),
    limit: 500,
  });
  for (;;) {
    rows.push(...(page.data ?? []));
    if (!page.paging?.next) break;
    page = await graphGet(page.paging.next, token);
  }
  return rows;
}

// Each ad's status, thumbnail and post, 50 ads per request.
async function adCreatives(token: string, adIds: string[]) {
  const out = new Map<string, { status: string | null; thumbnail: string | null; post_id: string | null }>();
  for (let i = 0; i < adIds.length; i += 50) {
    const res: any = await graphGet('', token, {
      ids: adIds.slice(i, i + 50).join(','),
      fields: 'effective_status,creative{effective_object_story_id,thumbnail_url}',
    });
    for (const [id, ad] of Object.entries<any>(res)) {
      out.set(id, {
        status: ad.effective_status ?? null,
        thumbnail: ad.creative?.thumbnail_url ?? null,
        post_id: ad.creative?.effective_object_story_id ?? null,
      });
    }
  }
  return out;
}

// Post ids grouped by page, keeping only pages the sign-in has a token for.
async function byPage(postIds: string[]) {
  const groups = new Map<string, { token: string; posts: string[] }>();
  for (const id of new Set(postIds)) {
    const pageId = id.split('_')[0];
    let g = groups.get(pageId);
    if (!g) {
      const token = await pageToken(pageId);
      if (!token) continue;
      g = { token, posts: [] };
      groups.set(pageId, g);
    }
    g.posts.push(id);
  }
  return groups;
}

export async function campaignAds(accountId: string, campaignId: string, from: string, to: string): Promise<CampaignAd[]> {
  check(accountId, from, to);
  if (!/^\d+$/.test(campaignId)) throw new Error('Unknown campaign');
  const token = await userToken();
  return cached(`campaign-ads:${accountId}:${campaignId}:${from}:${to}`, async () => {
    const rows = await adInsights(token, accountId, from, to, campaignId);
    const creatives = await adCreatives(
      token,
      rows.map((r) => r.ad_id)
    );
    const counts = new Map<string, { permalink: string | null; total: number }>();
    const pages = await byPage([...creatives.values()].map((c) => c.post_id).filter((p): p is string => Boolean(p)));
    for (const g of pages.values()) {
      for (const [id, post] of await postsWithComments(g.token, g.posts, 0)) counts.set(id, post);
    }
    return rows
      .map((r): CampaignAd => {
        const c = creatives.get(r.ad_id);
        const post = c?.post_id ? counts.get(c.post_id) : undefined;
        return {
          ad_id: r.ad_id,
          name: r.ad_name,
          status: c?.status ?? null,
          spend: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          conversations: Number(r.actions?.find((a: any) => a.action_type === CONVERSATION)?.value ?? 0),
          thumbnail: c?.thumbnail ?? null,
          post_id: c?.post_id ?? null,
          page_id: c?.post_id?.split('_')[0] ?? null,
          permalink: post?.permalink ?? null,
          comments: post?.total ?? 0,
        };
      })
      .sort((a, b) => b.spend - a.spend);
  });
}

export async function adComments(accountId: string, from: string, to: string): Promise<AdCommentGroup[]> {
  check(accountId, from, to);
  const token = await userToken();
  return cached(`comments:${accountId}:${from}:${to}`, async () => {
    const rows = await adInsights(token, accountId, from, to);
    if (!rows.length) return [];
    const creatives = await adCreatives(
      token,
      rows.map((r) => r.ad_id)
    );

    // Ads share posts: one group per post, naming every ad and campaign on it.
    const groups = new Map<string, AdCommentGroup>();
    for (const r of rows) {
      const c = creatives.get(r.ad_id);
      if (!c?.post_id) continue;
      const g =
        groups.get(c.post_id) ??
        ({
          post_id: c.post_id,
          page_id: c.post_id.split('_')[0],
          ads: [],
          campaigns: [],
          thumbnail: c.thumbnail,
          permalink: null,
          total: 0,
          comments: [],
        } as AdCommentGroup);
      if (!g.ads.includes(r.ad_name)) g.ads.push(r.ad_name);
      if (r.campaign_name && !g.campaigns.includes(r.campaign_name)) g.campaigns.push(r.campaign_name);
      groups.set(c.post_id, g);
    }

    const since = Date.parse(`${from}T00:00:00+08:00`);
    const until = Date.parse(`${to}T00:00:00+08:00`) + 86400000;
    const pages = await byPage([...groups.keys()]);
    for (const p of pages.values()) {
      for (const [id, post] of await postsWithComments(p.token, p.posts, 25)) {
        const g = groups.get(id);
        if (!g) continue;
        g.permalink = post.permalink;
        g.thumbnail = g.thumbnail ?? post.picture;
        g.total = post.total;
        g.comments = post.comments.filter((c) => {
          const t = Date.parse(c.created_time);
          return t >= since && t < until;
        });
      }
    }
    // Ads with comments in the period, the latest comment first.
    return [...groups.values()]
      .filter((g) => g.comments.length > 0)
      .sort((a, b) => b.comments[0].created_time.localeCompare(a.comments[0].created_time));
  });
}
