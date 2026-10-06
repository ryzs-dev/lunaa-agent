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
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = client;
exports.platformStatus = platformStatus;
exports.connect = connect;
exports.syncShop = syncShop;
exports.syncAll = syncAll;
const lazada_1 = require("./lazada");
const shopee_1 = require("./shopee");
const store = __importStar(require("./store"));
const types_1 = require("./types");
const clients = {
    shopee: new shopee_1.ShopeeClient(),
    lazada: new lazada_1.LazadaClient(),
};
const FIRST_SYNC_DAYS = 30;
// Re-read a little before the last sync so orders updated mid-sync aren't missed.
const SYNC_OVERLAP_MS = 60 * 60 * 1000;
const REFRESH_BEFORE_MS = 10 * 60 * 1000;
function client(platform) {
    const c = clients[platform];
    if (!c.configured) {
        throw new types_1.MarketplaceError(`${platform === 'shopee' ? 'Shopee' : 'Lazada'} app keys aren’t set on the server yet.`, 503);
    }
    return c;
}
function platformStatus() {
    return Object.fromEntries(Object.keys(clients).map((p) => [
        p,
        { configured: clients[p].configured, environment: clients[p].environment },
    ]));
}
async function connect(platform, query, redirectUrl) {
    const c = client(platform);
    const { shopId, region, tokens } = await c.exchangeCode(query, redirectUrl);
    const shopName = await c.shopName(shopId, tokens.accessToken).catch(() => null);
    await store.saveConnection(platform, shopId, { shopName, region, tokens });
    return { shopId, shopName };
}
async function freshToken(connection) {
    if (connection.accessExpiresAt.getTime() - Date.now() > REFRESH_BEFORE_MS) {
        return connection.accessToken;
    }
    if (connection.refreshExpiresAt && connection.refreshExpiresAt.getTime() < Date.now()) {
        throw new types_1.MarketplaceError('The shop’s sign-in has expired. Reconnect it from Integrations.', 401);
    }
    const tokens = await client(connection.platform).refresh(connection);
    await store.updateTokens(connection.platform, connection.shopId, tokens);
    return tokens.accessToken;
}
const running = new Map();
function syncShop(platform, shopId) {
    const key = `${platform}:${shopId}`;
    const existing = running.get(key);
    if (existing)
        return existing;
    const job = (async () => {
        const connection = await store.getConnection(platform, shopId);
        if (!connection)
            throw new types_1.MarketplaceError('Shop not connected', 404);
        const startedAt = new Date();
        try {
            const accessToken = await freshToken(connection);
            const since = connection.lastSyncedAt
                ? new Date(connection.lastSyncedAt.getTime() - SYNC_OVERLAP_MS)
                : new Date(Date.now() - FIRST_SYNC_DAYS * 24 * 60 * 60 * 1000);
            const orders = await client(platform).ordersUpdatedSince(shopId, accessToken, since);
            await store.upsertOrders(orders);
            await store.recordSync(platform, shopId, { syncedAt: startedAt, error: null });
            return { orders: orders.length };
        }
        catch (error) {
            const message = error.message || 'Sync failed';
            await store.recordSync(platform, shopId, { error: message }).catch(() => undefined);
            throw error;
        }
    })().finally(() => running.delete(key));
    running.set(key, job);
    return job;
}
async function syncAll() {
    let connections;
    try {
        connections = await store.listConnections();
    }
    catch (error) {
        if (store.isMissingTable(error))
            return;
        throw error;
    }
    for (const connection of connections) {
        if (!clients[connection.platform].configured)
            continue;
        await syncShop(connection.platform, connection.shopId).catch((error) => console.error(`Marketplace sync failed for ${connection.platform}:${connection.shopId}`, error.message));
    }
}
