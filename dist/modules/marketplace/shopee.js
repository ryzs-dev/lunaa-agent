"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopeeClient = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const types_1 = require("./types");
const HOSTS = {
    live: 'https://partner.shopeemobile.com',
    sandbox: 'https://openplatform.sandbox.test-stable.shopee.sg',
};
// get_order_list rejects time ranges longer than 15 days.
const MAX_RANGE_SECONDS = 15 * 24 * 60 * 60;
const DETAIL_BATCH = 50;
const REFRESH_TOKEN_DAYS = 30;
const DETAIL_FIELDS = [
    'buyer_username',
    'recipient_address',
    'item_list',
    'total_amount',
    'pay_time',
    'shipping_carrier',
].join(',');
class ShopeeClient {
    get partnerId() {
        return Number(process.env.SHOPEE_PARTNER_ID);
    }
    get partnerKey() {
        var _a;
        return (_a = process.env.SHOPEE_PARTNER_KEY) !== null && _a !== void 0 ? _a : '';
    }
    get environment() {
        return process.env.SHOPEE_ENV === 'sandbox' ? 'sandbox' : 'live';
    }
    get host() {
        return HOSTS[this.environment];
    }
    get configured() {
        return Number.isFinite(this.partnerId) && this.partnerId > 0 && !!this.partnerKey;
    }
    sign(...parts) {
        return crypto_1.default.createHmac('sha256', this.partnerKey).update(parts.join('')).digest('hex');
    }
    publicParams(path) {
        const timestamp = Math.floor(Date.now() / 1000);
        return {
            partner_id: this.partnerId,
            timestamp,
            sign: this.sign(this.partnerId, path, timestamp),
        };
    }
    shopParams(path, shopId, accessToken) {
        const timestamp = Math.floor(Date.now() / 1000);
        return {
            partner_id: this.partnerId,
            timestamp,
            access_token: accessToken,
            shop_id: Number(shopId),
            sign: this.sign(this.partnerId, path, timestamp, accessToken, shopId),
        };
    }
    unwrap(data, action) {
        if (data.error) {
            throw new types_1.MarketplaceError(`Shopee ${action} failed: ${data.message || data.error}`, 502);
        }
        return data;
    }
    async get(path, shopId, accessToken, params) {
        var _a;
        const { data } = await axios_1.default.get(`${this.host}${path}`, {
            params: Object.assign(Object.assign({}, this.shopParams(path, shopId, accessToken)), params),
            timeout: 20000,
            validateStatus: () => true,
        });
        return this.unwrap(data, (_a = path.split('/').pop()) !== null && _a !== void 0 ? _a : path);
    }
    tokens(data) {
        var _a;
        return {
            accessToken: String(data.access_token),
            refreshToken: String(data.refresh_token),
            accessExpiresAt: new Date(Date.now() + Number((_a = data.expire_in) !== null && _a !== void 0 ? _a : 14400) * 1000),
            refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
        };
    }
    authorizeUrl(redirectUrl) {
        const path = '/api/v2/shop/auth_partner';
        const params = new URLSearchParams(Object.assign(Object.assign({}, Object.fromEntries(Object.entries(this.publicParams(path)).map(([k, v]) => [k, String(v)]))), { redirect: redirectUrl }));
        return `${this.host}${path}?${params}`;
    }
    async exchangeCode(query) {
        const { code, shop_id: shopId } = query;
        if (!code || !shopId) {
            throw new types_1.MarketplaceError('Shopee didn’t return a shop. Sign in with a shop account, not a main account.');
        }
        const path = '/api/v2/auth/token/get';
        const { data } = await axios_1.default.post(`${this.host}${path}`, { code, shop_id: Number(shopId), partner_id: this.partnerId }, { params: this.publicParams(path), timeout: 20000, validateStatus: () => true });
        return { shopId: String(shopId), region: 'MY', tokens: this.tokens(this.unwrap(data, 'sign-in')) };
    }
    async refresh(connection) {
        const path = '/api/v2/auth/access_token/get';
        const { data } = await axios_1.default.post(`${this.host}${path}`, {
            refresh_token: connection.refreshToken,
            shop_id: Number(connection.shopId),
            partner_id: this.partnerId,
        }, { params: this.publicParams(path), timeout: 20000, validateStatus: () => true });
        return this.tokens(this.unwrap(data, 'token refresh'));
    }
    async shopName(shopId, accessToken) {
        var _a, _b, _c;
        const data = await this.get('/api/v2/shop/get_shop_info', shopId, accessToken, {});
        return (_c = (_a = data.shop_name) !== null && _a !== void 0 ? _a : (_b = data.response) === null || _b === void 0 ? void 0 : _b.shop_name) !== null && _c !== void 0 ? _c : null;
    }
    async ordersUpdatedSince(shopId, accessToken, since) {
        var _a, _b, _c, _d, _e, _f;
        const orderSns = [];
        const now = Math.floor(Date.now() / 1000);
        for (let from = Math.floor(since.getTime() / 1000); from < now; from += MAX_RANGE_SECONDS) {
            const to = Math.min(from + MAX_RANGE_SECONDS, now);
            let cursor = '';
            do {
                const data = await this.get('/api/v2/order/get_order_list', shopId, accessToken, {
                    time_range_field: 'update_time',
                    time_from: from,
                    time_to: to,
                    page_size: 100,
                    cursor,
                });
                orderSns.push(...((_b = (_a = data.response) === null || _a === void 0 ? void 0 : _a.order_list) !== null && _b !== void 0 ? _b : []).map((o) => o.order_sn));
                cursor = ((_c = data.response) === null || _c === void 0 ? void 0 : _c.more) ? ((_d = data.response.next_cursor) !== null && _d !== void 0 ? _d : '') : '';
            } while (cursor);
        }
        const orders = [];
        for (let i = 0; i < orderSns.length; i += DETAIL_BATCH) {
            const data = await this.get('/api/v2/order/get_order_detail', shopId, accessToken, {
                order_sn_list: orderSns.slice(i, i + DETAIL_BATCH).join(','),
                response_optional_fields: DETAIL_FIELDS,
            });
            orders.push(...((_f = (_e = data.response) === null || _e === void 0 ? void 0 : _e.order_list) !== null && _f !== void 0 ? _f : []).map((o) => toOrder(shopId, o)));
        }
        return orders;
    }
}
exports.ShopeeClient = ShopeeClient;
function toOrder(shopId, order) {
    var _a, _b, _c, _d, _e, _f;
    return {
        platform: 'shopee',
        shopId,
        externalId: order.order_sn,
        orderNumber: order.order_sn,
        status: order.order_status.toLowerCase(),
        buyerName: ((_a = order.recipient_address) === null || _a === void 0 ? void 0 : _a.name) || order.buyer_username || null,
        buyerPhone: ((_b = order.recipient_address) === null || _b === void 0 ? void 0 : _b.phone) || null,
        shippingAddress: ((_c = order.recipient_address) === null || _c === void 0 ? void 0 : _c.full_address) || null,
        totalAmount: Number((_d = order.total_amount) !== null && _d !== void 0 ? _d : 0),
        currency: (_e = order.currency) !== null && _e !== void 0 ? _e : 'MYR',
        items: ((_f = order.item_list) !== null && _f !== void 0 ? _f : []).map((item) => {
            var _a, _b;
            return ({
                name: item.item_name,
                sku: item.model_sku || item.item_sku || null,
                variation: item.model_name || null,
                quantity: item.model_quantity_purchased,
                price: Number((_b = (_a = item.model_discounted_price) !== null && _a !== void 0 ? _a : item.model_original_price) !== null && _b !== void 0 ? _b : 0),
            });
        }),
        orderedAt: new Date(order.create_time * 1000),
        updatedAt: order.update_time ? new Date(order.update_time * 1000) : null,
        raw: order,
    };
}
