"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adComments = adComments;
const graph_1 = require("./graph");
const pages_1 = require("./pages");
const DAY = 86400000;
function friendly(e) {
    var _a, _b, _c;
    const err = (_b = (_a = e === null || e === void 0 ? void 0 : e.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error;
    if ((err === null || err === void 0 ? void 0 : err.code) === 10 || /pages_read_user_content/i.test((_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : '')) {
        throw new Error('Facebook hasn’t allowed reading comments yet. Sign in with Facebook again (Integrations → Meta ads) and allow page comments.');
    }
    throw e;
}
async function pool(items, size, fn) {
    const out = [];
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
        while (i < items.length) {
            const item = items[i++];
            out.push(await fn(item));
        }
    }));
    return out;
}
async function adComments(accountId, from, to) {
    if (!/^act_\d+$/.test(accountId))
        throw new Error('Unknown ad account');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
        throw new Error('Send from and to as YYYY-MM-DD');
    }
    const token = await (0, pages_1.userToken)();
    return (0, pages_1.cached)(`comments:${accountId}:${from}:${to}`, async () => {
        var _a, _b, _c, _d, _e, _f;
        // Ads that showed in the period.
        const shown = [];
        let page = await (0, graph_1.graphGet)(`${accountId}/insights`, token, {
            level: 'ad',
            fields: 'ad_id,ad_name,campaign_name,impressions',
            time_range: JSON.stringify({ since: from, until: to }),
            filtering: JSON.stringify([{ field: 'impressions', operator: 'GREATER_THAN', value: 0 }]),
            limit: 500,
        });
        for (;;) {
            shown.push(...((_a = page.data) !== null && _a !== void 0 ? _a : []));
            if (!((_b = page.paging) === null || _b === void 0 ? void 0 : _b.next))
                break;
            page = await (0, graph_1.graphGet)(page.paging.next, token);
        }
        if (!shown.length)
            return [];
        // Each ad's page post.
        const posts = new Map();
        for (let i = 0; i < shown.length; i += 50) {
            const chunk = shown.slice(i, i + 50);
            const res = await (0, graph_1.graphGet)('', token, {
                ids: chunk.map((a) => a.ad_id).join(','),
                fields: 'creative{effective_object_story_id}',
            });
            for (const ad of chunk) {
                const story = (_d = (_c = res[ad.ad_id]) === null || _c === void 0 ? void 0 : _c.creative) === null || _d === void 0 ? void 0 : _d.effective_object_story_id;
                if (!story)
                    continue;
                const entry = (_e = posts.get(story)) !== null && _e !== void 0 ? _e : { ads: [], campaign: (_f = ad.campaign_name) !== null && _f !== void 0 ? _f : null };
                if (!entry.ads.includes(ad.ad_name))
                    entry.ads.push(ad.ad_name);
                posts.set(story, entry);
            }
        }
        // Page tokens for the pages the sign-in manages; posts on other pages are skipped.
        const pageTokens = new Map();
        for (const p of await (0, pages_1.pagesWithTokens)(token))
            pageTokens.set(p.id, p.access_token);
        const since = Date.parse(`${from}T00:00:00+08:00`);
        const until = Date.parse(`${to}T00:00:00+08:00`) + DAY;
        let denied = null;
        const lists = await pool([...posts.entries()], 8, async ([postId, info]) => {
            var _a, _b, _c;
            const pageToken = pageTokens.get(postId.split('_')[0]);
            if (!pageToken)
                return [];
            try {
                const res = await (0, graph_1.graphGet)(`${postId}/comments`, pageToken, {
                    fields: 'id,message,from{name},created_time,comment_count,like_count,permalink_url',
                    order: 'reverse_chronological',
                    limit: 50,
                });
                const post = await (0, graph_1.graphGet)(postId, pageToken, { fields: 'permalink_url' }).catch(() => null);
                return ((_a = res.data) !== null && _a !== void 0 ? _a : [])
                    .filter((c) => {
                    const t = Date.parse(c.created_time);
                    return t >= since && t < until && c.message;
                })
                    .map((c) => {
                    var _a, _b, _c, _d, _e, _f;
                    return ({
                        id: c.id,
                        message: c.message,
                        from: (_b = (_a = c.from) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null,
                        created_time: c.created_time,
                        replies: (_c = c.comment_count) !== null && _c !== void 0 ? _c : 0,
                        likes: (_d = c.like_count) !== null && _d !== void 0 ? _d : 0,
                        permalink: (_e = c.permalink_url) !== null && _e !== void 0 ? _e : null,
                        post_id: postId,
                        post_permalink: (_f = post === null || post === void 0 ? void 0 : post.permalink_url) !== null && _f !== void 0 ? _f : null,
                        ads: info.ads,
                        campaign: info.campaign,
                    });
                });
            }
            catch (e) {
                const err = (_c = (_b = e === null || e === void 0 ? void 0 : e.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error;
                if ((err === null || err === void 0 ? void 0 : err.code) === 10)
                    denied = e;
                return [];
            }
        });
        const comments = lists.flat().sort((a, b) => b.created_time.localeCompare(a.created_time));
        if (!comments.length && denied)
            friendly(denied);
        return comments;
    });
}
