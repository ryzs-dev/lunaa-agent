"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LazadaClient = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const types_1 = require("./types");
const AUTH_HOST = 'https://auth.lazada.com';
const API_HOST = 'https://api.lazada.com.my/rest';
const PAGE_SIZE = 100;
const ITEMS_BATCH = 50;
class LazadaClient {
    constructor() {
        this.environment = 'live';
    }
    get appKey() {
        var _a;
        return (_a = process.env.LAZADA_APP_KEY) !== null && _a !== void 0 ? _a : '';
    }
    get appSecret() {
        var _a;
        return (_a = process.env.LAZADA_APP_SECRET) !== null && _a !== void 0 ? _a : '';
    }
    get configured() {
        return !!this.appKey && !!this.appSecret;
    }
    // Sorted key+value pairs prefixed with the API path, HMAC-SHA256, upper-case hex.
    signed(path, params) {
        const all = Object.assign({ app_key: this.appKey, timestamp: String(Date.now()), sign_method: 'sha256' }, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])));
        const base = path + Object.keys(all).sort().map((key) => key + all[key]).join('');
        const sign = crypto_1.default.createHmac('sha256', this.appSecret).update(base).digest('hex').toUpperCase();
        return Object.assign(Object.assign({}, all), { sign });
    }
    async call(host, path, params) {
        const { data } = await axios_1.default.get(`${host}${path}`, {
            params: this.signed(path, params),
            timeout: 20000,
            validateStatus: () => true,
        });
        if (data.code !== '0') {
            throw new types_1.MarketplaceError(`Lazada ${path} failed: ${data.message || data.code}`, 502);
        }
        return data;
    }
    tokens(data) {
        var _a, _b;
        const refreshIn = Number((_a = data.refresh_expires_in) !== null && _a !== void 0 ? _a : 0);
        return {
            accessToken: String(data.access_token),
            refreshToken: String(data.refresh_token),
            accessExpiresAt: new Date(Date.now() + Number((_b = data.expires_in) !== null && _b !== void 0 ? _b : 0) * 1000),
            refreshExpiresAt: refreshIn > 0 ? new Date(Date.now() + refreshIn * 1000) : null,
        };
    }
    authorizeUrl(redirectUrl) {
        const params = new URLSearchParams({
            response_type: 'code',
            force_auth: 'true',
            redirect_uri: redirectUrl,
            client_id: this.appKey,
            country: 'my',
        });
        return `${AUTH_HOST}/oauth/authorize?${params}`;
    }
    async exchangeCode(query) {
        var _a, _b;
        if (!query.code)
            throw new types_1.MarketplaceError('Lazada didn’t return a sign-in code.');
        const data = await this.call(`${AUTH_HOST}/rest`, '/auth/token/create', {
            code: query.code,
        });
        const users = (_a = data.country_user_info) !== null && _a !== void 0 ? _a : [];
        const seller = (_b = users.find((u) => u.country === 'my')) !== null && _b !== void 0 ? _b : users[0];
        if (!seller)
            throw new types_1.MarketplaceError('This Lazada account has no seller shop.');
        return {
            shopId: String(seller.seller_id),
            region: seller.country.toUpperCase(),
            tokens: this.tokens(data),
        };
    }
    async refresh(connection) {
        const data = await this.call(`${AUTH_HOST}/rest`, '/auth/token/refresh', {
            refresh_token: connection.refreshToken,
        });
        return this.tokens(data);
    }
    async shopName(_shopId, accessToken) {
        var _a, _b;
        const data = await this.call(API_HOST, '/seller/get', {
            access_token: accessToken,
        });
        return (_b = (_a = data.data) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null;
    }
    async ordersUpdatedSince(shopId, accessToken, since) {
        var _a, _b, _c, _d;
        const orders = [];
        for (let offset = 0;; offset += PAGE_SIZE) {
            const data = await this.call(API_HOST, '/orders/get', {
                access_token: accessToken,
                update_after: since.toISOString(),
                sort_by: 'updated_at',
                sort_direction: 'ASC',
                offset,
                limit: PAGE_SIZE,
            });
            const page = (_b = (_a = data.data) === null || _a === void 0 ? void 0 : _a.orders) !== null && _b !== void 0 ? _b : [];
            orders.push(...page);
            if (page.length < PAGE_SIZE)
                break;
        }
        const itemsByOrder = new Map();
        for (let i = 0; i < orders.length; i += ITEMS_BATCH) {
            const ids = orders.slice(i, i + ITEMS_BATCH).map((o) => o.order_id);
            const data = await this.call(API_HOST, '/orders/items/get', { access_token: accessToken, order_ids: `[${ids.join(',')}]` });
            for (const entry of (_c = data.data) !== null && _c !== void 0 ? _c : []) {
                itemsByOrder.set(String(entry.order_id), (_d = entry.order_items) !== null && _d !== void 0 ? _d : []);
            }
        }
        return orders.map((order) => { var _a; return toOrder(shopId, order, (_a = itemsByOrder.get(String(order.order_id))) !== null && _a !== void 0 ? _a : []); });
    }
}
exports.LazadaClient = LazadaClient;
// Lazada returns one row per unit, so identical rows are folded into a quantity.
function groupItems(items) {
    var _a, _b, _c, _d;
    const grouped = new Map();
    for (const item of items) {
        const key = `${(_a = item.sku) !== null && _a !== void 0 ? _a : ''}|${item.name}|${(_b = item.variation) !== null && _b !== void 0 ? _b : ''}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.quantity += 1;
        }
        else {
            grouped.set(key, {
                name: item.name,
                sku: item.sku || null,
                variation: item.variation || null,
                quantity: 1,
                price: Number((_d = (_c = item.paid_price) !== null && _c !== void 0 ? _c : item.item_price) !== null && _d !== void 0 ? _d : 0),
            });
        }
    }
    return [...grouped.values()];
}
function toOrder(shopId, order, rawItems) {
    var _a, _b, _c, _d;
    const address = order.address_shipping;
    const items = groupItems(rawItems);
    const paid = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return {
        platform: 'lazada',
        shopId,
        externalId: String(order.order_id),
        orderNumber: String(order.order_number),
        status: (_b = (_a = order.statuses) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : 'unknown',
        buyerName: [address === null || address === void 0 ? void 0 : address.first_name, address === null || address === void 0 ? void 0 : address.last_name].filter(Boolean).join(' ') ||
            order.customer_first_name ||
            null,
        buyerPhone: (address === null || address === void 0 ? void 0 : address.phone) || null,
        shippingAddress: [address === null || address === void 0 ? void 0 : address.address1, address === null || address === void 0 ? void 0 : address.address2, address === null || address === void 0 ? void 0 : address.post_code, address === null || address === void 0 ? void 0 : address.city]
            .filter(Boolean)
            .join(', ') || null,
        totalAmount: Math.round((paid || Number(order.price) || 0) * 100) / 100,
        currency: (_d = (_c = rawItems[0]) === null || _c === void 0 ? void 0 : _c.currency) !== null && _d !== void 0 ? _d : 'MYR',
        items,
        orderedAt: new Date(order.created_at),
        updatedAt: order.updated_at ? new Date(order.updated_at) : null,
        raw: { order, items: rawItems },
    };
}
