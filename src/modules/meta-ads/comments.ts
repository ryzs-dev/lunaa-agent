import { graphGet } from './graph';
import { cached, pagesWithTokens, userToken } from './pages';

// Comments people left on the ads an ad account ran in a period: each ad's
// page post (ads share posts, so each post once), newest comments first.
// Needs pages_read_user_content on the Facebook sign-in.

export type AdComment = {
  id: string;
  message: string;
  from: string | null;
  created_time: string;
  replies: number;
  likes: number;
  permalink: string | null;
  post_id: string;
  post_permalink: string | null;
  ads: string[];
  campaign: string | null;
};

const DAY = 86400000;

function friendly(e: any): never {
  const err = e?.response?.data?.error;
  if (err?.code === 10 || /pages_read_user_content/i.test(err?.message ?? '')) {
    throw new Error(
      'Facebook hasn’t allowed reading comments yet. Sign in with Facebook again (Integrations → Meta ads) and allow page comments.'
    );
  }
  throw e;
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        out.push(await fn(item));
      }
    })
  );
  return out;
}

export async function adComments(accountId: string, from: string, to: string): Promise<AdComment[]> {
  if (!/^act_\d+$/.test(accountId)) throw new Error('Unknown ad account');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error('Send from and to as YYYY-MM-DD');
  }
  const token = await userToken();
  return cached(`comments:${accountId}:${from}:${to}`, async () => {
    // Ads that showed in the period.
    const shown: { ad_id: string; ad_name: string; campaign_name: string | null }[] = [];
    let page: any = await graphGet(`${accountId}/insights`, token, {
      level: 'ad',
      fields: 'ad_id,ad_name,campaign_name,impressions',
      time_range: JSON.stringify({ since: from, until: to }),
      filtering: JSON.stringify([{ field: 'impressions', operator: 'GREATER_THAN', value: 0 }]),
      limit: 500,
    });
    for (;;) {
      shown.push(...(page.data ?? []));
      if (!page.paging?.next) break;
      page = await graphGet(page.paging.next, token);
    }
    if (!shown.length) return [];

    // Each ad's page post.
    const posts = new Map<string, { ads: string[]; campaign: string | null }>();
    for (let i = 0; i < shown.length; i += 50) {
      const chunk = shown.slice(i, i + 50);
      const res: any = await graphGet('', token, {
        ids: chunk.map((a) => a.ad_id).join(','),
        fields: 'creative{effective_object_story_id}',
      });
      for (const ad of chunk) {
        const story = res[ad.ad_id]?.creative?.effective_object_story_id;
        if (!story) continue;
        const entry = posts.get(story) ?? { ads: [], campaign: ad.campaign_name ?? null };
        if (!entry.ads.includes(ad.ad_name)) entry.ads.push(ad.ad_name);
        posts.set(story, entry);
      }
    }

    // Page tokens for the pages the sign-in manages; posts on other pages are skipped.
    const pageTokens = new Map<string, string>();
    for (const p of await pagesWithTokens(token)) pageTokens.set(p.id, p.access_token);

    const since = Date.parse(`${from}T00:00:00+08:00`);
    const until = Date.parse(`${to}T00:00:00+08:00`) + DAY;
    let denied: any = null;
    const lists = await pool([...posts.entries()], 8, async ([postId, info]) => {
      const pageToken = pageTokens.get(postId.split('_')[0]);
      if (!pageToken) return [] as AdComment[];
      try {
        const res: any = await graphGet(`${postId}/comments`, pageToken, {
          fields: 'id,message,from{name},created_time,comment_count,like_count,permalink_url',
          order: 'reverse_chronological',
          limit: 50,
        });
        const post: any = await graphGet(postId, pageToken, { fields: 'permalink_url' }).catch(() => null);
        return (res.data ?? [])
          .filter((c: any) => {
            const t = Date.parse(c.created_time);
            return t >= since && t < until && c.message;
          })
          .map(
            (c: any): AdComment => ({
              id: c.id,
              message: c.message,
              from: c.from?.name ?? null,
              created_time: c.created_time,
              replies: c.comment_count ?? 0,
              likes: c.like_count ?? 0,
              permalink: c.permalink_url ?? null,
              post_id: postId,
              post_permalink: post?.permalink_url ?? null,
              ads: info.ads,
              campaign: info.campaign,
            })
          );
      } catch (e: any) {
        const err = e?.response?.data?.error;
        if (err?.code === 10) denied = e;
        return [] as AdComment[];
      }
    });
    const comments = lists.flat().sort((a, b) => b.created_time.localeCompare(a.created_time));
    if (!comments.length && denied) friendly(denied);
    return comments;
  });
}
