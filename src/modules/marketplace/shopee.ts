import axios from 'axios';
import crypto from 'crypto';
import {
  Connection,
  MarketplaceError,
  MarketplaceOrder,
  PlatformClient,
  TokenSet,
} from './types';

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

type ShopeeResponse<T> = { error?: string; message?: string; response?: T } & Record<string, unknown>;

export class ShopeeClient implements PlatformClient {
  private get partnerId() {
    return Number(process.env.SHOPEE_PARTNER_ID);
  }
  private get partnerKey() {
    return process.env.SHOPEE_PARTNER_KEY ?? '';
  }
  get environment() {
    return process.env.SHOPEE_ENV === 'sandbox' ? 'sandbox' : 'live';
  }
  private get host() {
    return HOSTS[this.environment];
  }

  get configured() {
    return Number.isFinite(this.partnerId) && this.partnerId > 0 && !!this.partnerKey;
  }

  private sign(...parts: (string | number)[]) {
    return crypto.createHmac('sha256', this.partnerKey).update(parts.join('')).digest('hex');
  }

  private publicParams(path: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      partner_id: this.partnerId,
      timestamp,
      sign: this.sign(this.partnerId, path, timestamp),
    };
  }

  private shopParams(path: string, shopId: string, accessToken: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      partner_id: this.partnerId,
      timestamp,
      access_token: accessToken,
      shop_id: Number(shopId),
      sign: this.sign(this.partnerId, path, timestamp, accessToken, shopId),
    };
  }

  private unwrap<T>(data: ShopeeResponse<T>, action: string) {
    if (data.error) {
      throw new MarketplaceError(`Shopee ${action} failed: ${data.message || data.error}`, 502);
    }
    return data;
  }

  private async get<T>(path: string, shopId: string, accessToken: string, params: object) {
    const { data } = await axios.get<ShopeeResponse<T>>(`${this.host}${path}`, {
      params: { ...this.shopParams(path, shopId, accessToken), ...params },
      timeout: 20000,
      validateStatus: () => true,
    });
    return this.unwrap(data, path.split('/').pop() ?? path);
  }

  private tokens(data: Record<string, unknown>): TokenSet {
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token),
      accessExpiresAt: new Date(Date.now() + Number(data.expire_in ?? 14400) * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    };
  }

  authorizeUrl(redirectUrl: string) {
    const path = '/api/v2/shop/auth_partner';
    const params = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(this.publicParams(path)).map(([k, v]) => [k, String(v)])
      ),
      redirect: redirectUrl,
    });
    return `${this.host}${path}?${params}`;
  }

  async exchangeCode(query: Record<string, string>) {
    const { code, shop_id: shopId } = query;
    if (!code || !shopId) {
      throw new MarketplaceError('Shopee didn’t return a shop. Sign in with a shop account, not a main account.');
    }
    const path = '/api/v2/auth/token/get';
    const { data } = await axios.post<ShopeeResponse<never>>(
      `${this.host}${path}`,
      { code, shop_id: Number(shopId), partner_id: this.partnerId },
      { params: this.publicParams(path), timeout: 20000, validateStatus: () => true }
    );
    return { shopId: String(shopId), region: 'MY', tokens: this.tokens(this.unwrap(data, 'sign-in')) };
  }

  async refresh(connection: Connection) {
    const path = '/api/v2/auth/access_token/get';
    const { data } = await axios.post<ShopeeResponse<never>>(
      `${this.host}${path}`,
      {
        refresh_token: connection.refreshToken,
        shop_id: Number(connection.shopId),
        partner_id: this.partnerId,
      },
      { params: this.publicParams(path), timeout: 20000, validateStatus: () => true }
    );
    return this.tokens(this.unwrap(data, 'token refresh'));
  }

  async shopName(shopId: string, accessToken: string) {
    const data = await this.get<{ shop_name?: string }>(
      '/api/v2/shop/get_shop_info',
      shopId,
      accessToken,
      {}
    );
    return (data.shop_name as string | undefined) ?? data.response?.shop_name ?? null;
  }

  async ordersUpdatedSince(shopId: string, accessToken: string, since: Date) {
    const orderSns: string[] = [];
    const now = Math.floor(Date.now() / 1000);
    for (let from = Math.floor(since.getTime() / 1000); from < now; from += MAX_RANGE_SECONDS) {
      const to = Math.min(from + MAX_RANGE_SECONDS, now);
      let cursor = '';
      do {
        const data = await this.get<{
          order_list?: { order_sn: string }[];
          more?: boolean;
          next_cursor?: string;
        }>('/api/v2/order/get_order_list', shopId, accessToken, {
          time_range_field: 'update_time',
          time_from: from,
          time_to: to,
          page_size: 100,
          cursor,
        });
        orderSns.push(...(data.response?.order_list ?? []).map((o) => o.order_sn));
        cursor = data.response?.more ? (data.response.next_cursor ?? '') : '';
      } while (cursor);
    }

    const orders: MarketplaceOrder[] = [];
    for (let i = 0; i < orderSns.length; i += DETAIL_BATCH) {
      const data = await this.get<{ order_list?: ShopeeOrder[] }>(
        '/api/v2/order/get_order_detail',
        shopId,
        accessToken,
        {
          order_sn_list: orderSns.slice(i, i + DETAIL_BATCH).join(','),
          response_optional_fields: DETAIL_FIELDS,
        }
      );
      orders.push(...(data.response?.order_list ?? []).map((o) => toOrder(shopId, o)));
    }
    return orders;
  }
}

interface ShopeeOrder {
  order_sn: string;
  order_status: string;
  create_time: number;
  update_time?: number;
  currency?: string;
  total_amount?: number;
  buyer_username?: string;
  recipient_address?: {
    name?: string;
    phone?: string;
    full_address?: string;
  };
  item_list?: {
    item_name: string;
    item_sku?: string;
    model_name?: string;
    model_sku?: string;
    model_quantity_purchased: number;
    model_discounted_price?: number;
    model_original_price?: number;
  }[];
}

function toOrder(shopId: string, order: ShopeeOrder): MarketplaceOrder {
  return {
    platform: 'shopee',
    shopId,
    externalId: order.order_sn,
    orderNumber: order.order_sn,
    status: order.order_status.toLowerCase(),
    buyerName: order.recipient_address?.name || order.buyer_username || null,
    buyerPhone: order.recipient_address?.phone || null,
    shippingAddress: order.recipient_address?.full_address || null,
    totalAmount: Number(order.total_amount ?? 0),
    currency: order.currency ?? 'MYR',
    items: (order.item_list ?? []).map((item) => ({
      name: item.item_name,
      sku: item.model_sku || item.item_sku || null,
      variation: item.model_name || null,
      quantity: item.model_quantity_purchased,
      price: Number(item.model_discounted_price ?? item.model_original_price ?? 0),
    })),
    orderedAt: new Date(order.create_time * 1000),
    updatedAt: order.update_time ? new Date(order.update_time * 1000) : null,
    raw: order,
  };
}
