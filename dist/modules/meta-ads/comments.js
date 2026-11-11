"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignAds = campaignAds;
exports.adComments = adComments;
exports.adDetail = adDetail;
exports.campaignName = campaignName;
const graph_1 = require("./graph");
const pages_1 = require("./pages");
const CONVERSATION = 'onsite_conversion.messaging_conversation_started_7d';
const action = (row, type) => { var _a, _b, _c; return Number((_c = (_b = (_a = row === null || row === void 0 ? void 0 : row.actions) === null || _a === void 0 ? void 0 : _a.find((a) => a.action_type === type)) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : 0); };
function check(accountId, from, to) {
    if (!/^act_\d+$/.test(accountId))
        throw new Error('Unknown ad account');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
        throw new Error('Send from and to as YYYY-MM-DD');
    }
}
// Ad-level numbers for the period, optionally for one campaign.
async function adInsights(token, accountId, from, to, campaignId) {
    var _a, _b;
    const filtering = [{ field: 'impressions', operator: 'GREATER_THAN', value: 0 }];
    if (campaignId)
        filtering.push({ field: 'campaign.id', operator: 'EQUAL', value: campaignId });
    const rows = [];
    let page = await (0, graph_1.graphGet)(`${accountId}/insights`, token, {
        level: 'ad',
        fields: 'ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,actions',
        time_range: JSON.stringify({ since: from, until: to }),
        filtering: JSON.stringify(filtering),
        limit: 500,
    });
    for (;;) {
        rows.push(...((_a = page.data) !== null && _a !== void 0 ? _a : []));
        if (!((_b = page.paging) === null || _b === void 0 ? void 0 : _b.next))
            break;
        page = await (0, graph_1.graphGet)(page.paging.next, token);
    }
    return rows;
}
// Each ad's status, thumbnail and post, 50 ads per request.
async function adCreatives(token, adIds) {
    var _a, _b, _c, _d, _e;
    const out = new Map();
    const chunks = [];
    for (let i = 0; i < adIds.length; i += 50)
        chunks.push(adIds.slice(i, i + 50));
    const results = await Promise.all(chunks.map((ids) => (0, graph_1.graphGet)('', token, { ids: ids.join(','), fields: 'effective_status,creative{effective_object_story_id,thumbnail_url}' })));
    for (const res of results) {
        for (const [id, ad] of Object.entries(res)) {
            out.set(id, {
                status: (_a = ad.effective_status) !== null && _a !== void 0 ? _a : null,
                thumbnail: (_c = (_b = ad.creative) === null || _b === void 0 ? void 0 : _b.thumbnail_url) !== null && _c !== void 0 ? _c : null,
                post_id: (_e = (_d = ad.creative) === null || _d === void 0 ? void 0 : _d.effective_object_story_id) !== null && _e !== void 0 ? _e : null,
            });
        }
    }
    return out;
}
// Post ids grouped by page, keeping only pages the sign-in has a token for.
async function byPage(postIds) {
    const groups = new Map();
    for (const id of new Set(postIds)) {
        const pageId = id.split('_')[0];
        let g = groups.get(pageId);
        if (!g) {
            const token = await (0, pages_1.pageToken)(pageId);
            if (!token)
                continue;
            g = { token, posts: [] };
            groups.set(pageId, g);
        }
        g.posts.push(id);
    }
    return groups;
}
async function campaignAds(accountId, campaignId, from, to) {
    check(accountId, from, to);
    if (!/^\d+$/.test(campaignId))
        throw new Error('Unknown campaign');
    const token = await (0, pages_1.userToken)();
    return (0, pages_1.cached)(`campaign-ads2:${accountId}:${campaignId}:${from}:${to}`, async () => {
        const rows = await adInsights(token, accountId, from, to, campaignId);
        const creatives = await adCreatives(token, rows.map((r) => r.ad_id));
        const counts = new Map();
        const pages = await byPage([...creatives.values()].map((c) => c.post_id).filter((p) => Boolean(p)));
        for (const g of pages.values()) {
            for (const [id, post] of await (0, pages_1.postsWithComments)(g.token, g.posts, 0))
                counts.set(id, post);
        }
        return rows
            .map((r) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
            const c = creatives.get(r.ad_id);
            const post = (c === null || c === void 0 ? void 0 : c.post_id) ? counts.get(c.post_id) : undefined;
            return {
                ad_id: r.ad_id,
                name: r.ad_name,
                status: (_a = c === null || c === void 0 ? void 0 : c.status) !== null && _a !== void 0 ? _a : null,
                spend: Number((_b = r.spend) !== null && _b !== void 0 ? _b : 0),
                impressions: Number((_c = r.impressions) !== null && _c !== void 0 ? _c : 0),
                clicks: Number((_d = r.clicks) !== null && _d !== void 0 ? _d : 0),
                conversations: Number((_g = (_f = (_e = r.actions) === null || _e === void 0 ? void 0 : _e.find((a) => a.action_type === CONVERSATION)) === null || _f === void 0 ? void 0 : _f.value) !== null && _g !== void 0 ? _g : 0),
                thumbnail: (_h = c === null || c === void 0 ? void 0 : c.thumbnail) !== null && _h !== void 0 ? _h : null,
                post_id: (_j = c === null || c === void 0 ? void 0 : c.post_id) !== null && _j !== void 0 ? _j : null,
                page_id: (_l = (_k = c === null || c === void 0 ? void 0 : c.post_id) === null || _k === void 0 ? void 0 : _k.split('_')[0]) !== null && _l !== void 0 ? _l : null,
                permalink: (_m = post === null || post === void 0 ? void 0 : post.permalink) !== null && _m !== void 0 ? _m : null,
                comments: (_o = post === null || post === void 0 ? void 0 : post.total) !== null && _o !== void 0 ? _o : 0,
                reactions: (_p = post === null || post === void 0 ? void 0 : post.reactions) !== null && _p !== void 0 ? _p : 0,
                shares: (_q = post === null || post === void 0 ? void 0 : post.shares) !== null && _q !== void 0 ? _q : 0,
            };
        })
            .sort((a, b) => b.spend - a.spend);
    });
}
async function adComments(accountId, from, to) {
    check(accountId, from, to);
    const token = await (0, pages_1.userToken)();
    return (0, pages_1.cached)(`comments:${accountId}:${from}:${to}`, async () => {
        var _a, _b;
        const rows = await adInsights(token, accountId, from, to);
        if (!rows.length)
            return [];
        const creatives = await adCreatives(token, rows.map((r) => r.ad_id));
        // Ads share posts: one group per post, naming every ad and campaign on it.
        const groups = new Map();
        for (const r of rows) {
            const c = creatives.get(r.ad_id);
            if (!(c === null || c === void 0 ? void 0 : c.post_id))
                continue;
            const g = (_a = groups.get(c.post_id)) !== null && _a !== void 0 ? _a : {
                post_id: c.post_id,
                page_id: c.post_id.split('_')[0],
                ads: [],
                ad_id: r.ad_id,
                campaigns: [],
                thumbnail: c.thumbnail,
                permalink: null,
                total: 0,
                comments: [],
            };
            if (!g.ads.includes(r.ad_name))
                g.ads.push(r.ad_name);
            if (r.campaign_name && !g.campaigns.includes(r.campaign_name))
                g.campaigns.push(r.campaign_name);
            groups.set(c.post_id, g);
        }
        const since = Date.parse(`${from}T00:00:00+08:00`);
        const until = Date.parse(`${to}T00:00:00+08:00`) + 86400000;
        const pages = await byPage([...groups.keys()]);
        for (const p of pages.values()) {
            for (const [id, post] of await (0, pages_1.postsWithComments)(p.token, p.posts, 25)) {
                const g = groups.get(id);
                if (!g)
                    continue;
                g.permalink = post.permalink;
                g.thumbnail = (_b = g.thumbnail) !== null && _b !== void 0 ? _b : post.picture;
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
// One ad: its numbers for the period and the latest 100 comments on its post.
async function adDetail(adId, from, to) {
    if (!/^\d+$/.test(adId))
        throw new Error('Unknown ad');
    check('act_0', from, to);
    const token = await (0, pages_1.userToken)();
    return (0, pages_1.cached)(`ad2:${adId}:${from}:${to}`, async () => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
        const [ad, insights] = await Promise.all([
            (0, graph_1.graphGet)(adId, token, {
                fields: 'name,effective_status,campaign{id,name},creative{effective_object_story_id,thumbnail_url}',
            }),
            (0, graph_1.graphGet)(`${adId}/insights`, token, {
                fields: 'spend,impressions,clicks,actions',
                time_range: JSON.stringify({ since: from, until: to }),
            }),
        ]);
        const row = (_b = (_a = insights.data) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : {};
        const postId = (_d = (_c = ad.creative) === null || _c === void 0 ? void 0 : _c.effective_object_story_id) !== null && _d !== void 0 ? _d : null;
        const pageId = (_e = postId === null || postId === void 0 ? void 0 : postId.split('_')[0]) !== null && _e !== void 0 ? _e : null;
        const pt = pageId ? await (0, pages_1.pageToken)(pageId) : null;
        const post = pt && postId ? (await (0, pages_1.postsWithComments)(pt, [postId], 100)).get(postId) : undefined;
        return {
            ad_id: adId,
            name: ad.name,
            status: (_f = ad.effective_status) !== null && _f !== void 0 ? _f : null,
            campaign: ad.campaign ? { id: ad.campaign.id, name: ad.campaign.name } : null,
            thumbnail: (_j = (_h = (_g = ad.creative) === null || _g === void 0 ? void 0 : _g.thumbnail_url) !== null && _h !== void 0 ? _h : post === null || post === void 0 ? void 0 : post.picture) !== null && _j !== void 0 ? _j : null,
            post_id: postId,
            page_id: pageId,
            permalink: (_k = post === null || post === void 0 ? void 0 : post.permalink) !== null && _k !== void 0 ? _k : null,
            spend: Number((_l = row.spend) !== null && _l !== void 0 ? _l : 0),
            impressions: Number((_m = row.impressions) !== null && _m !== void 0 ? _m : 0),
            clicks: Number((_o = row.clicks) !== null && _o !== void 0 ? _o : 0),
            conversations: Number((_r = (_q = (_p = row.actions) === null || _p === void 0 ? void 0 : _p.find((a) => a.action_type === CONVERSATION)) === null || _q === void 0 ? void 0 : _q.value) !== null && _r !== void 0 ? _r : 0),
            total_comments: (_s = post === null || post === void 0 ? void 0 : post.total) !== null && _s !== void 0 ? _s : 0,
            reactions: (_t = post === null || post === void 0 ? void 0 : post.reactions) !== null && _t !== void 0 ? _t : 0,
            shares: (_u = post === null || post === void 0 ? void 0 : post.shares) !== null && _u !== void 0 ? _u : 0,
            engagement: {
                total: action(row, 'post_engagement'),
                reactions: action(row, 'post_reaction'),
                comments: action(row, 'comment'),
                shares: action(row, 'post'),
                saves: action(row, 'onsite_conversion.post_save'),
            },
            comments: (_v = post === null || post === void 0 ? void 0 : post.comments) !== null && _v !== void 0 ? _v : [],
        };
    });
}
async function campaignName(campaignId) {
    if (!/^\d+$/.test(campaignId))
        throw new Error('Unknown campaign');
    const token = await (0, pages_1.userToken)();
    return (0, pages_1.cached)(`campaign-name:${campaignId}`, async () => {
        var _a;
        const c = await (0, graph_1.graphGet)(campaignId, token, { fields: 'name,effective_status' });
        return { id: campaignId, name: c.name, status: (_a = c.effective_status) !== null && _a !== void 0 ? _a : null };
    });
}
