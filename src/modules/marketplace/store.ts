import { supabase } from '../supabase';
import { Connection, MarketplaceOrder, Platform, TokenSet } from './types';

const date = (value: string | null) => (value ? new Date(value) : null);

function toConnection(row: Record<string, any>): Connection {
  return {
    platform: row.platform,
    shopId: row.shop_id,
    shopName: row.shop_name,
    region: row.region,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    accessExpiresAt: new Date(row.access_expires_at),
    refreshExpiresAt: date(row.refresh_expires_at),
    lastSyncedAt: date(row.last_synced_at),
    lastSyncError: row.last_sync_error,
    createdAt: new Date(row.created_at),
  };
}

const tokenColumns = (tokens: TokenSet) => ({
  access_token: tokens.accessToken,
  refresh_token: tokens.refreshToken,
  access_expires_at: tokens.accessExpiresAt.toISOString(),
  refresh_expires_at: tokens.refreshExpiresAt?.toISOString() ?? null,
});

// Postgres "undefined table" and PostgREST "table not in schema cache".
export const isMissingTable = (error: { code?: string } | null) =>
  error?.code === '42P01' || error?.code === 'PGRST205';

export async function listConnections() {
  const { data, error } = await supabase
    .from('marketplace_connections')
    .select('*')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(toConnection);
}

export async function getConnection(platform: Platform, shopId: string) {
  const { data, error } = await supabase
    .from('marketplace_connections')
    .select('*')
    .eq('platform', platform)
    .eq('shop_id', shopId)
    .maybeSingle();
  if (error) throw error;
  return data ? toConnection(data) : null;
}

export async function saveConnection(
  platform: Platform,
  shopId: string,
  fields: { shopName: string | null; region: string | null; tokens: TokenSet }
) {
  const { error } = await supabase.from('marketplace_connections').upsert(
    {
      platform,
      shop_id: shopId,
      shop_name: fields.shopName,
      region: fields.region,
      ...tokenColumns(fields.tokens),
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'platform,shop_id' }
  );
  if (error) throw error;
}

export async function updateTokens(platform: Platform, shopId: string, tokens: TokenSet) {
  const { error } = await supabase
    .from('marketplace_connections')
    .update({ ...tokenColumns(tokens), updated_at: new Date().toISOString() })
    .eq('platform', platform)
    .eq('shop_id', shopId);
  if (error) throw error;
}

export async function recordSync(
  platform: Platform,
  shopId: string,
  result: { syncedAt?: Date; error?: string | null }
) {
  const { error } = await supabase
    .from('marketplace_connections')
    .update({
      ...(result.syncedAt && { last_synced_at: result.syncedAt.toISOString() }),
      last_sync_error: result.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('platform', platform)
    .eq('shop_id', shopId);
  if (error) throw error;
}

export async function deleteConnection(platform: Platform, shopId: string) {
  const { error } = await supabase
    .from('marketplace_connections')
    .delete()
    .eq('platform', platform)
    .eq('shop_id', shopId);
  if (error) throw error;
}

export async function upsertOrders(orders: MarketplaceOrder[]) {
  const syncedAt = new Date().toISOString();
  for (let i = 0; i < orders.length; i += 200) {
    const { error } = await supabase.from('marketplace_orders').upsert(
      orders.slice(i, i + 200).map((order) => ({
        platform: order.platform,
        shop_id: order.shopId,
        external_id: order.externalId,
        order_number: order.orderNumber,
        status: order.status,
        buyer_name: order.buyerName,
        buyer_phone: order.buyerPhone,
        shipping_address: order.shippingAddress,
        total_amount: order.totalAmount,
        currency: order.currency,
        items: order.items,
        ordered_at: order.orderedAt.toISOString(),
        platform_updated_at: order.updatedAt?.toISOString() ?? null,
        raw: order.raw,
        synced_at: syncedAt,
      })),
      { onConflict: 'platform,external_id' }
    );
    if (error) throw error;
  }
}

export async function listOrders(options: {
  platform: Platform;
  shopId?: string;
  limit: number;
  offset: number;
}) {
  let query = supabase
    .from('marketplace_orders')
    .select(
      'id, platform, shop_id, external_id, order_number, status, buyer_name, total_amount, currency, items, ordered_at, synced_at',
      { count: 'exact' }
    )
    .eq('platform', options.platform)
    .order('ordered_at', { ascending: false })
    .range(options.offset, options.offset + options.limit - 1);
  if (options.shopId) query = query.eq('shop_id', options.shopId);
  const { data, error, count } = await query;
  if (error) throw error;
  return { orders: data ?? [], total: count ?? 0 };
}
