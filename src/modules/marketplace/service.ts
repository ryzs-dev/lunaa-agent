import { LazadaClient } from './lazada';
import { ShopeeClient } from './shopee';
import * as store from './store';
import { Connection, MarketplaceError, Platform, PlatformClient } from './types';

const clients: Record<Platform, PlatformClient> = {
  shopee: new ShopeeClient(),
  lazada: new LazadaClient(),
};

const FIRST_SYNC_DAYS = 30;
// Re-read a little before the last sync so orders updated mid-sync aren't missed.
const SYNC_OVERLAP_MS = 60 * 60 * 1000;
const REFRESH_BEFORE_MS = 10 * 60 * 1000;

export function client(platform: Platform) {
  const c = clients[platform];
  if (!c.configured) {
    throw new MarketplaceError(
      `${platform === 'shopee' ? 'Shopee' : 'Lazada'} app keys aren’t set on the server yet.`,
      503
    );
  }
  return c;
}

export function platformStatus() {
  return Object.fromEntries(
    (Object.keys(clients) as Platform[]).map((p) => [
      p,
      { configured: clients[p].configured, environment: clients[p].environment },
    ])
  );
}

export async function connect(platform: Platform, query: Record<string, string>, redirectUrl: string) {
  const c = client(platform);
  const { shopId, region, tokens } = await c.exchangeCode(query, redirectUrl);
  const shopName = await c.shopName(shopId, tokens.accessToken).catch(() => null);
  await store.saveConnection(platform, shopId, { shopName, region, tokens });
  return { shopId, shopName };
}

async function freshToken(connection: Connection) {
  if (connection.accessExpiresAt.getTime() - Date.now() > REFRESH_BEFORE_MS) {
    return connection.accessToken;
  }
  if (connection.refreshExpiresAt && connection.refreshExpiresAt.getTime() < Date.now()) {
    throw new MarketplaceError('The shop’s sign-in has expired. Reconnect it from Integrations.', 401);
  }
  const tokens = await client(connection.platform).refresh(connection);
  await store.updateTokens(connection.platform, connection.shopId, tokens);
  return tokens.accessToken;
}

const running = new Map<string, Promise<{ orders: number }>>();

export function syncShop(platform: Platform, shopId: string) {
  const key = `${platform}:${shopId}`;
  const existing = running.get(key);
  if (existing) return existing;

  const job = (async () => {
    const connection = await store.getConnection(platform, shopId);
    if (!connection) throw new MarketplaceError('Shop not connected', 404);
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
    } catch (error) {
      const message = (error as Error).message || 'Sync failed';
      await store.recordSync(platform, shopId, { error: message }).catch(() => undefined);
      throw error;
    }
  })().finally(() => running.delete(key));

  running.set(key, job);
  return job;
}

export async function syncAll() {
  let connections: Connection[];
  try {
    connections = await store.listConnections();
  } catch (error) {
    if (store.isMissingTable(error as { code?: string })) return;
    throw error;
  }
  for (const connection of connections) {
    if (!clients[connection.platform].configured) continue;
    await syncShop(connection.platform, connection.shopId).catch((error) =>
      console.error(`Marketplace sync failed for ${connection.platform}:${connection.shopId}`, error.message)
    );
  }
}
