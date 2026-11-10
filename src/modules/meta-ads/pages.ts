import { graphGet } from './graph';
import { connection } from './settings';

// Facebook page insights for the Ads page's "Facebook page" view. Read live
// from Meta with the signed-in person's page token (the login asks for
// pages_show_list, pages_read_engagement and read_insights), cached briefly.

export type FacebookPage = {
  id: string;
  name: string;
  followers: number | null;
  picture: string | null;
  link: string | null;
};

export type PageDay = {
  date: string;
  views: number;
  viewers: number;
  engagements: number;
  visits: number;
  follows: number;
  unfollows: number;
  video_views: number;
};

export type PagePost = {
  id: string;
  message: string | null;
  created_time: string;
  permalink: string | null;
  picture: string | null;
  reactions: number;
  comments: number;
  shares: number;
};

export type PageReport = {
  page: FacebookPage;
  from: string;
  to: string;
  days: PageDay[];
  totals: Omit<PageDay, 'date' | 'viewers'>;
  posts: PagePost[];
};

const METRICS: Record<string, keyof Omit<PageDay, 'date'>> = {
  page_media_view: 'views',
  page_total_media_view_unique: 'viewers',
  page_post_engagements: 'engagements',
  page_views_total: 'visits',
  page_daily_follows_unique: 'follows',
  page_daily_unfollows_unique: 'unfollows',
  page_video_views: 'video_views',
};

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: any }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function userToken() {
  const conn = await connection();
  if (!conn) throw new Error('Sign in with Facebook first');
  return conn.token;
}

async function pagesWithTokens(token: string) {
  const out: any[] = [];
  let page: any = await graphGet('me/accounts', token, {
    fields: 'name,id,access_token,followers_count,fan_count,link,picture{url}',
    limit: 100,
  });
  for (;;) {
    out.push(...(page.data ?? []));
    if (!page.paging?.next) break;
    page = await graphGet(page.paging.next, token);
  }
  return out;
}

const toPage = (p: any): FacebookPage => ({
  id: p.id,
  name: p.name,
  followers: p.followers_count ?? p.fan_count ?? null,
  picture: p.picture?.data?.url ?? null,
  link: p.link ?? null,
});

const missingPermission = (e: any) => {
  const err = e?.response?.data?.error;
  return err?.code === 10 || err?.code === 200 || /permission/i.test(err?.message ?? '');
};

export async function listPages(): Promise<FacebookPage[]> {
  const token = await userToken();
  return cached(`pages:${token.slice(-12)}`, async () => {
    try {
      // Lunaa's own page first.
      return (await pagesWithTokens(token))
        .map(toPage)
        .sort((a, b) => Number(/lunaa/i.test(b.name)) - Number(/lunaa/i.test(a.name)) || a.name.localeCompare(b.name));
    } catch (e: any) {
      if (missingPermission(e)) {
        throw new Error('The Facebook sign-in didn’t allow page access. Sign in with Facebook again and tick the page.');
      }
      throw e;
    }
  });
}

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function pageReport(pageId: string, from: string, to: string): Promise<PageReport> {
  if (!/^\d+$/.test(pageId)) throw new Error('Unknown page');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error('Send from and to as YYYY-MM-DD');
  }
  const token = await userToken();
  return cached(`report:${pageId}:${from}:${to}`, async () => {
    const raw = (await pagesWithTokens(token)).find((p) => p.id === pageId);
    if (!raw) throw new Error('This Facebook sign-in can’t see that page');
    const pageToken: string = raw.access_token;

    // Daily values, at most 90 days per request. Meta stamps each value with
    // the end of its day, so the day itself is end_time minus one.
    const byDate = new Map<string, PageDay>();
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`) + DAY;
    for (let s = start; s < end; s += 90 * DAY) {
      const e = Math.min(end, s + 90 * DAY);
      const res: any = await graphGet(`${pageId}/insights`, pageToken, {
        metric: Object.keys(METRICS).join(','),
        period: 'day',
        since: iso(s),
        until: iso(e),
      });
      for (const series of res.data ?? []) {
        const field = METRICS[series.name];
        if (!field) continue;
        for (const v of series.values ?? []) {
          const date = iso(Date.parse(v.end_time) - DAY);
          if (date < from || date > to) continue;
          const day =
            byDate.get(date) ??
            ({ date, views: 0, viewers: 0, engagements: 0, visits: 0, follows: 0, unfollows: 0, video_views: 0 } as PageDay);
          day[field] = typeof v.value === 'number' ? v.value : 0;
          byDate.set(date, day);
        }
      }
    }
    const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const sum = (k: keyof Omit<PageDay, 'date'>) => days.reduce((n, d) => n + d[k], 0);

    // Posts published in the period, newest first.
    const posts: PagePost[] = [];
    let page: any = await graphGet(`${pageId}/posts`, pageToken, {
      fields:
        'message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
      since: Math.floor(start / 1000),
      until: Math.floor(end / 1000),
      limit: 50,
    });
    for (let pages = 0; pages < 6; pages++) {
      for (const p of page.data ?? []) {
        posts.push({
          id: p.id,
          message: p.message ?? null,
          created_time: p.created_time,
          permalink: p.permalink_url ?? null,
          picture: p.full_picture ?? null,
          reactions: p.reactions?.summary?.total_count ?? 0,
          comments: p.comments?.summary?.total_count ?? 0,
          shares: p.shares?.count ?? 0,
        });
      }
      if (!page.paging?.next) break;
      page = await graphGet(page.paging.next, pageToken);
    }

    return {
      page: toPage(raw),
      from,
      to,
      days,
      totals: {
        views: sum('views'),
        engagements: sum('engagements'),
        visits: sum('visits'),
        follows: sum('follows'),
        unfollows: sum('unfollows'),
        video_views: sum('video_views'),
      },
      posts,
    };
  });
}
