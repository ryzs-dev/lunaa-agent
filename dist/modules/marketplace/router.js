"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketplaceRouter = void 0;
exports.startMarketplaceSync = startMarketplaceSync;
const express_1 = __importDefault(require("express"));
const node_cron_1 = __importDefault(require("node-cron"));
const supabase_1 = require("../supabase");
const service = __importStar(require("./service"));
const sheet_sync_1 = require("./sheet-sync");
const store = __importStar(require("./store"));
const types_1 = require("./types");
exports.marketplaceRouter = express_1.default.Router();
const RETURN_COOKIE = 'mp_return';
const ALLOWED_RETURN = [
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
    /^https:\/\/([a-z0-9-]+\.)*lunaawomencare\.com$/,
    /^http:\/\/localhost:\d+$/,
];
const callbackUrl = (platform) => `${(process.env.PUBLIC_API_URL || 'https://agent.lunaawomencare.com').replace(/\/$/, '')}/api/marketplaces/${platform}/callback`;
function returnOrigin(req) {
    var _a, _b;
    const cookie = (_b = (_a = req.headers.cookie) === null || _a === void 0 ? void 0 : _a.split(';').map((part) => part.trim().split('=')).find(([name]) => name === RETURN_COOKIE)) === null || _b === void 0 ? void 0 : _b[1];
    const origin = cookie ? decodeURIComponent(cookie) : '';
    return ALLOWED_RETURN.some((pattern) => pattern.test(origin)) ? origin : null;
}
function sendError(res, error) {
    if (error instanceof types_1.MarketplaceError) {
        return res.status(error.status).json({ error: error.message });
    }
    if (store.isMissingTable(error)) {
        return res.status(503).json({ error: 'Marketplace tables haven’t been created yet.', setupRequired: true });
    }
    console.error('Marketplace error:', error);
    return res.status(500).json({ error: error.message || 'Something went wrong' });
}
function platformParam(req) {
    const { platform } = req.params;
    if (!(0, types_1.isPlatform)(platform))
        throw new types_1.MarketplaceError('Unknown marketplace', 404);
    return platform;
}
// GET / - Which marketplaces have app keys, and the shops connected to each.
exports.marketplaceRouter.get('/', async (_req, res) => {
    try {
        const connections = await store.listConnections();
        return res.json({
            platforms: service.platformStatus(),
            setupRequired: false,
            connections: connections.map((c) => ({
                platform: c.platform,
                shopId: c.shopId,
                shopName: c.shopName,
                region: c.region,
                connectedAt: c.createdAt,
                lastSyncedAt: c.lastSyncedAt,
                lastSyncError: c.lastSyncError,
                expiresAt: c.refreshExpiresAt,
            })),
        });
    }
    catch (error) {
        if (store.isMissingTable(error)) {
            return res.json({ platforms: service.platformStatus(), setupRequired: true, connections: [] });
        }
        return sendError(res, error);
    }
});
// GET /sheet-sync - Orders read from the order sheet (orange = Shopee, dark blue = Lazada).
exports.marketplaceRouter.get('/sheet-sync', async (_req, res) => {
    try {
        const counts = {};
        for (const platform of ['shopee', 'lazada']) {
            const { count, error } = await supabase_1.supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .eq('source', platform)
                .is('deleted_at', null);
            if (error)
                throw error;
            counts[platform] = count !== null && count !== void 0 ? count : 0;
        }
        return res.json(Object.assign(Object.assign({}, (0, sheet_sync_1.sheetSyncStatus)()), { tabs: (0, sheet_sync_1.recentTabs)(), counts }));
    }
    catch (error) {
        return sendError(res, error);
    }
});
// POST /sheet-sync - Re-read the current and previous month's tabs now.
// Body { tabs: ["Jan 26", ...] } reads specific tabs, e.g. to backfill older months.
exports.marketplaceRouter.post('/sheet-sync', async (req, res) => {
    var _a;
    try {
        const tabs = Array.isArray((_a = req.body) === null || _a === void 0 ? void 0 : _a.tabs)
            ? req.body.tabs.filter((tab) => typeof tab === 'string' && tab.trim())
            : undefined;
        return res.json(await (0, sheet_sync_1.syncSheetTabs)((tabs === null || tabs === void 0 ? void 0 : tabs.length) ? tabs : undefined));
    }
    catch (error) {
        return sendError(res, error);
    }
});
// GET /:platform/connect?return=<dashboard origin> - Sends the merchant to the marketplace sign-in.
exports.marketplaceRouter.get('/:platform/connect', (req, res) => {
    var _a;
    try {
        const platform = platformParam(req);
        const origin = String((_a = req.query.return) !== null && _a !== void 0 ? _a : '');
        if (!ALLOWED_RETURN.some((pattern) => pattern.test(origin))) {
            throw new types_1.MarketplaceError('Invalid return address');
        }
        const url = service.client(platform).authorizeUrl(callbackUrl(platform));
        res.setHeader('Set-Cookie', `${RETURN_COOKIE}=${encodeURIComponent(origin)}; Path=/api/marketplaces; Max-Age=900; HttpOnly; Secure; SameSite=Lax`);
        return res.redirect(url);
    }
    catch (error) {
        return sendError(res, error);
    }
});
// GET /:platform/callback - The marketplace redirects here after the merchant approves.
exports.marketplaceRouter.get('/:platform/callback', async (req, res) => {
    const origin = returnOrigin(req);
    const platform = req.params.platform;
    const back = (params) => {
        var _a;
        if (!origin)
            return res.status(200).send((_a = params.error) !== null && _a !== void 0 ? _a : 'Shop connected. You can close this tab.');
        return res.redirect(`${origin}/integrations/${platform}?${new URLSearchParams(params)}`);
    };
    try {
        if (!(0, types_1.isPlatform)(platform))
            throw new types_1.MarketplaceError('Unknown marketplace', 404);
        const query = Object.fromEntries(Object.entries(req.query).map(([key, value]) => [key, String(value)]));
        const { shopId } = await service.connect(platform, query, callbackUrl(platform));
        service.syncShop(platform, shopId).catch((error) => console.error(`First ${platform} sync failed:`, error.message));
        return back({ connected: shopId });
    }
    catch (error) {
        console.error(`${platform} sign-in failed:`, error);
        const message = store.isMissingTable(error)
            ? 'Marketplace tables haven’t been created yet.'
            : error.message || 'Sign-in failed';
        return back({ error: message });
    }
});
// POST /:platform/:shopId/sync - Pull orders updated since the last sync.
exports.marketplaceRouter.post('/:platform/:shopId/sync', async (req, res) => {
    try {
        const result = await service.syncShop(platformParam(req), req.params.shopId);
        return res.json(result);
    }
    catch (error) {
        return sendError(res, error);
    }
});
// DELETE /:platform/:shopId - Forget the shop's tokens. Pulled orders are kept.
exports.marketplaceRouter.delete('/:platform/:shopId', async (req, res) => {
    try {
        await store.deleteConnection(platformParam(req), req.params.shopId);
        return res.status(204).end();
    }
    catch (error) {
        return sendError(res, error);
    }
});
// GET /:platform/orders?shopId=&limit=&offset=
exports.marketplaceRouter.get('/:platform/orders', async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        const result = await store.listOrders({
            platform: platformParam(req),
            shopId: req.query.shopId ? String(req.query.shopId) : undefined,
            limit,
            offset,
        });
        return res.json(result);
    }
    catch (error) {
        return sendError(res, error);
    }
});
function startMarketplaceSync() {
    node_cron_1.default.schedule('*/30 * * * *', () => {
        service.syncAll().catch((error) => console.error('Marketplace sync failed:', error));
    });
    node_cron_1.default.schedule('*/15 * * * *', () => {
        (0, sheet_sync_1.syncSheetTabs)().catch((error) => console.error('Order sheet sync failed:', error.message));
    });
}
