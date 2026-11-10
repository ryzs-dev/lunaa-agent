"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cached = cached;
exports.userToken = userToken;
exports.pagesWithTokens = pagesWithTokens;
exports.listPages = listPages;
exports.pageReport = pageReport;
const graph_1 = require("./graph");
const settings_1 = require("./settings");
const METRICS = {
    page_media_view: 'views',
    page_total_media_view_unique: 'viewers',
    page_post_engagements: 'engagements',
    page_views_total: 'visits',
    page_daily_follows_unique: 'follows',
    page_daily_unfollows_unique: 'unfollows',
    page_video_views: 'video_views',
};
const TTL_MS = 10 * 60 * 1000;
const cache = new Map();
async function cached(key, load) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS)
        return hit.value;
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    return value;
}
async function userToken() {
    const conn = await (0, settings_1.connection)();
    if (!conn)
        throw new Error('Sign in with Facebook first');
    return conn.token;
}
async function pagesWithTokens(token) {
    var _a, _b;
    const out = [];
    let page = await (0, graph_1.graphGet)('me/accounts', token, {
        fields: 'name,id,access_token,followers_count,fan_count,link,picture{url}',
        limit: 100,
    });
    for (;;) {
        out.push(...((_a = page.data) !== null && _a !== void 0 ? _a : []));
        if (!((_b = page.paging) === null || _b === void 0 ? void 0 : _b.next))
            break;
        page = await (0, graph_1.graphGet)(page.paging.next, token);
    }
    return out;
}
const toPage = (p) => {
    var _a, _b, _c, _d, _e, _f;
    return ({
        id: p.id,
        name: p.name,
        followers: (_b = (_a = p.followers_count) !== null && _a !== void 0 ? _a : p.fan_count) !== null && _b !== void 0 ? _b : null,
        picture: (_e = (_d = (_c = p.picture) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.url) !== null && _e !== void 0 ? _e : null,
        link: (_f = p.link) !== null && _f !== void 0 ? _f : null,
    });
};
const missingPermission = (e) => {
    var _a, _b, _c;
    const err = (_b = (_a = e === null || e === void 0 ? void 0 : e.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error;
    return (err === null || err === void 0 ? void 0 : err.code) === 10 || (err === null || err === void 0 ? void 0 : err.code) === 200 || /permission/i.test((_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : '');
};
async function listPages() {
    const token = await userToken();
    return cached(`pages:${token.slice(-12)}`, async () => {
        try {
            // Lunaa's own page first.
            return (await pagesWithTokens(token))
                .map(toPage)
                .sort((a, b) => Number(/lunaa/i.test(b.name)) - Number(/lunaa/i.test(a.name)) || a.name.localeCompare(b.name));
        }
        catch (e) {
            if (missingPermission(e)) {
                throw new Error('The Facebook sign-in didn’t allow page access. Sign in with Facebook again and tick the page.');
            }
            throw e;
        }
    });
}
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
async function pageReport(pageId, from, to) {
    if (!/^\d+$/.test(pageId))
        throw new Error('Unknown page');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
        throw new Error('Send from and to as YYYY-MM-DD');
    }
    const token = await userToken();
    return cached(`report:${pageId}:${from}:${to}`, async () => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        const raw = (await pagesWithTokens(token)).find((p) => p.id === pageId);
        if (!raw)
            throw new Error('This Facebook sign-in can’t see that page');
        const pageToken = raw.access_token;
        // Daily values, at most 90 days per request. Meta stamps each value with
        // the end of its day, so the day itself is end_time minus one.
        const byDate = new Map();
        const start = Date.parse(`${from}T00:00:00Z`);
        const end = Date.parse(`${to}T00:00:00Z`) + DAY;
        for (let s = start; s < end; s += 90 * DAY) {
            const e = Math.min(end, s + 90 * DAY);
            const res = await (0, graph_1.graphGet)(`${pageId}/insights`, pageToken, {
                metric: Object.keys(METRICS).join(','),
                period: 'day',
                since: iso(s),
                until: iso(e),
            });
            for (const series of (_a = res.data) !== null && _a !== void 0 ? _a : []) {
                const field = METRICS[series.name];
                if (!field)
                    continue;
                for (const v of (_b = series.values) !== null && _b !== void 0 ? _b : []) {
                    const date = iso(Date.parse(v.end_time) - DAY);
                    if (date < from || date > to)
                        continue;
                    const day = (_c = byDate.get(date)) !== null && _c !== void 0 ? _c : { date, views: 0, viewers: 0, engagements: 0, visits: 0, follows: 0, unfollows: 0, video_views: 0 };
                    day[field] = typeof v.value === 'number' ? v.value : 0;
                    byDate.set(date, day);
                }
            }
        }
        const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
        const sum = (k) => days.reduce((n, d) => n + d[k], 0);
        // Posts published in the period, newest first.
        const posts = [];
        let page = await (0, graph_1.graphGet)(`${pageId}/posts`, pageToken, {
            fields: 'message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
            since: Math.floor(start / 1000),
            until: Math.floor(end / 1000),
            limit: 50,
        });
        for (let pages = 0; pages < 6; pages++) {
            for (const p of (_d = page.data) !== null && _d !== void 0 ? _d : []) {
                posts.push({
                    id: p.id,
                    message: (_e = p.message) !== null && _e !== void 0 ? _e : null,
                    created_time: p.created_time,
                    permalink: (_f = p.permalink_url) !== null && _f !== void 0 ? _f : null,
                    picture: (_g = p.full_picture) !== null && _g !== void 0 ? _g : null,
                    reactions: (_k = (_j = (_h = p.reactions) === null || _h === void 0 ? void 0 : _h.summary) === null || _j === void 0 ? void 0 : _j.total_count) !== null && _k !== void 0 ? _k : 0,
                    comments: (_o = (_m = (_l = p.comments) === null || _l === void 0 ? void 0 : _l.summary) === null || _m === void 0 ? void 0 : _m.total_count) !== null && _o !== void 0 ? _o : 0,
                    shares: (_q = (_p = p.shares) === null || _p === void 0 ? void 0 : _p.count) !== null && _q !== void 0 ? _q : 0,
                });
            }
            if (!((_r = page.paging) === null || _r === void 0 ? void 0 : _r.next))
                break;
            page = await (0, graph_1.graphGet)(page.paging.next, pageToken);
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
