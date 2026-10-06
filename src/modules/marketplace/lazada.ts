import axios from 'axios';
import crypto from 'crypto';
import {
  Connection,
  MarketplaceError,
  MarketplaceOrder,
  MarketplaceOrderItem,
  PlatformClient,
  TokenSet,
} from './types';

const AUTH_HOST = 'https://auth.lazada.com';
const API_HOST = 'https://api.lazada.com.my/rest';
const PAGE_SIZE = 100;
const ITEMS_BATCH = 50;

type LazadaResponse<T> = { code?: string; message?: string; data?: T } & Record<string, unknown>;

export class LazadaClient implements PlatformClient {
  private get appKey() {
    return process.env.LAZADA_APP_KEY ?? '';
  }
  private get appSecret() {
    return process.env.LAZADA_APP_SECRET ?? '';
  }
  readonly environment = 'live';

  get configured() {
    return !!this.appKey && !!this.appSecret;
  }

  // Sorted key+value pairs prefixed with the API path, HMAC-SHA256, upper-case hex.
  private signed(path: string, params: Record<string, string | number>) {
    const all: Record<string, string> = {
      app_key: this.appKey,
      timestamp: String(Date.now()),
      sign_method: 'sha256',
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    };
    const base = path + Object.keys(all).sort().map((key) => key + all[key]).join('');
    const sign = crypto.createHmac('sha256', this.appSecret).update(base).digest('hex').toUpperCase();
    return { ...all, sign };
  }

  private async call<T>(host: string, path: string, params: Record<string, string | number>) {
    const { data } = await axios.get<LazadaResponse<T>>(`${host}${path}`, {
      params: this.signed(path, params),
      timeout: 20000,
      validateStatus: () => true,
    });
    if (data.code !== '0') {
      throw new MarketplaceError(`Lazada ${path} failed: ${data.message || data.code}`, 502);
    }
    return data;
  }

  private tokens(data: Record<string, unknown>): TokenSet {
    const refreshIn = Number(data.refresh_expires_in ?? 0);
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token),
      accessExpiresAt: new Date(Date.now() + Number(data.expires_in ?? 0) * 1000),
      refreshExpiresAt: refreshIn > 0 ? new Date(Date.now() + refreshIn * 1000) : null,
    };
  }

  authorizeUrl(redirectUrl: string) {
    const params = new URLSearchParams({
      response_type: 'code',
      force_auth: 'true',
      redirect_uri: redirectUrl,
      client_id: this.appKey,
      country: 'my',
    });
    return `${AUTH_HOST}/oauth/authorize?${params}`;
  }

  async exchangeCode(query: Record<string, string>) {
    if (!query.code) throw new MarketplaceError('Lazada didn’t return a sign-in code.');
    const data = await this.call<never>(`${AUTH_HOST}/rest`, '/auth/token/create', {
      code: query.code,
    });
    const users = (data.country_user_info as { country: string; seller_id: string }[]) ?? [];
    const seller = users.find((u) => u.country === 'my') ?? users[0];
    if (!seller) throw new MarketplaceError('This Lazada account has no seller shop.');
    return {
      shopId: String(seller.seller_id),
      region: seller.country.toUpperCase(),
      tokens: this.tokens(data),
    };
  }

  async refresh(connection: Connection) {
    const data = await this.call<never>(`${AUTH_HOST}/rest`, '/auth/token/refresh', {
      refresh_token: connection.refreshToken,
    });
    return this.tokens(data);
  }

  async shopName(_shopId: string, accessToken: string) {
    const data = await this.call<{ name?: string }>(API_HOST, '/seller/get', {
      access_token: accessToken,
    });
    return data.data?.name ?? null;
  }

  async ordersUpdatedSince(shopId: string, accessToken: string, since: Date) {
    const orders: LazadaOrder[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const data = await this.call<{ orders?: LazadaOrder[]; countTotal?: number }>(
        API_HOST,
        '/orders/get',
        {
          access_token: accessToken,
          update_after: since.toISOString(),
          sort_by: 'updated_at',
          sort_direction: 'ASC',
          offset,
          limit: PAGE_SIZE,
        }
      );
      const page = data.data?.orders ?? [];
      orders.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const itemsByOrder = new Map<string, LazadaItem[]>();
    for (let i = 0; i < orders.length; i += ITEMS_BATCH) {
      const ids = orders.slice(i, i + ITEMS_BATCH).map((o) => o.order_id);
      const data = await this.call<{ order_id: number | string; order_items: LazadaItem[] }[]>(
        API_HOST,
        '/orders/items/get',
        { access_token: accessToken, order_ids: `[${ids.join(',')}]` }
      );
      for (const entry of data.data ?? []) {
        itemsByOrder.set(String(entry.order_id), entry.order_items ?? []);
      }
    }

    return orders.map((order) => toOrder(shopId, order, itemsByOrder.get(String(order.order_id)) ?? []));
  }
}

interface LazadaOrder {
  order_id: number | string;
  order_number: number | string;
  created_at: string;
  updated_at?: string;
  price: string;
  statuses?: string[];
  customer_first_name?: string;
  address_shipping?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    address1?: string;
    address2?: string;
    city?: string;
    post_code?: string;
  };
}

interface LazadaItem {
  name: string;
  sku?: string;
  variation?: string;
  paid_price?: string;
  item_price?: string;
  currency?: string;
}

// Lazada returns one row per unit, so identical rows are folded into a quantity.
function groupItems(items: LazadaItem[]): MarketplaceOrderItem[] {
  const grouped = new Map<string, MarketplaceOrderItem>();
  for (const item of items) {
    const key = `${item.sku ?? ''}|${item.name}|${item.variation ?? ''}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      grouped.set(key, {
        name: item.name,
        sku: item.sku || null,
        variation: item.variation || null,
        quantity: 1,
        price: Number(item.paid_price ?? item.item_price ?? 0),
      });
    }
  }
  return [...grouped.values()];
}

function toOrder(shopId: string, order: LazadaOrder, rawItems: LazadaItem[]): MarketplaceOrder {
  const address = order.address_shipping;
  const items = groupItems(rawItems);
  const paid = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return {
    platform: 'lazada',
    shopId,
    externalId: String(order.order_id),
    orderNumber: String(order.order_number),
    status: order.statuses?.[0] ?? 'unknown',
    buyerName:
      [address?.first_name, address?.last_name].filter(Boolean).join(' ') ||
      order.customer_first_name ||
      null,
    buyerPhone: address?.phone || null,
    shippingAddress:
      [address?.address1, address?.address2, address?.post_code, address?.city]
        .filter(Boolean)
        .join(', ') || null,
    totalAmount: Math.round((paid || Number(order.price) || 0) * 100) / 100,
    currency: rawItems[0]?.currency ?? 'MYR',
    items,
    orderedAt: new Date(order.created_at),
    updatedAt: order.updated_at ? new Date(order.updated_at) : null,
    raw: { order, items: rawItems },
  };
}
