"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMissingTable = void 0;
exports.listConnections = listConnections;
exports.getConnection = getConnection;
exports.saveConnection = saveConnection;
exports.updateTokens = updateTokens;
exports.recordSync = recordSync;
exports.deleteConnection = deleteConnection;
exports.upsertOrders = upsertOrders;
exports.listOrders = listOrders;
const supabase_1 = require("../supabase");
const date = (value) => (value ? new Date(value) : null);
function toConnection(row) {
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
const tokenColumns = (tokens) => {
    var _a, _b;
    return ({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        access_expires_at: tokens.accessExpiresAt.toISOString(),
        refresh_expires_at: (_b = (_a = tokens.refreshExpiresAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
    });
};
// Postgres "undefined table" and PostgREST "table not in schema cache".
const isMissingTable = (error) => (error === null || error === void 0 ? void 0 : error.code) === '42P01' || (error === null || error === void 0 ? void 0 : error.code) === 'PGRST205';
exports.isMissingTable = isMissingTable;
async function listConnections() {
    const { data, error } = await supabase_1.supabase
        .from('marketplace_connections')
        .select('*')
        .order('created_at');
    if (error)
        throw error;
    return (data !== null && data !== void 0 ? data : []).map(toConnection);
}
async function getConnection(platform, shopId) {
    const { data, error } = await supabase_1.supabase
        .from('marketplace_connections')
        .select('*')
        .eq('platform', platform)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (error)
        throw error;
    return data ? toConnection(data) : null;
}
async function saveConnection(platform, shopId, fields) {
    const { error } = await supabase_1.supabase.from('marketplace_connections').upsert(Object.assign(Object.assign({ platform, shop_id: shopId, shop_name: fields.shopName, region: fields.region }, tokenColumns(fields.tokens)), { last_sync_error: null, updated_at: new Date().toISOString() }), { onConflict: 'platform,shop_id' });
    if (error)
        throw error;
}
async function updateTokens(platform, shopId, tokens) {
    const { error } = await supabase_1.supabase
        .from('marketplace_connections')
        .update(Object.assign(Object.assign({}, tokenColumns(tokens)), { updated_at: new Date().toISOString() }))
        .eq('platform', platform)
        .eq('shop_id', shopId);
    if (error)
        throw error;
}
async function recordSync(platform, shopId, result) {
    var _a;
    const { error } = await supabase_1.supabase
        .from('marketplace_connections')
        .update(Object.assign(Object.assign({}, (result.syncedAt && { last_synced_at: result.syncedAt.toISOString() })), { last_sync_error: (_a = result.error) !== null && _a !== void 0 ? _a : null, updated_at: new Date().toISOString() }))
        .eq('platform', platform)
        .eq('shop_id', shopId);
    if (error)
        throw error;
}
async function deleteConnection(platform, shopId) {
    const { error } = await supabase_1.supabase
        .from('marketplace_connections')
        .delete()
        .eq('platform', platform)
        .eq('shop_id', shopId);
    if (error)
        throw error;
}
async function upsertOrders(orders) {
    const syncedAt = new Date().toISOString();
    for (let i = 0; i < orders.length; i += 200) {
        const { error } = await supabase_1.supabase.from('marketplace_orders').upsert(orders.slice(i, i + 200).map((order) => {
            var _a, _b;
            return ({
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
                platform_updated_at: (_b = (_a = order.updatedAt) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
                raw: order.raw,
                synced_at: syncedAt,
            });
        }), { onConflict: 'platform,external_id' });
        if (error)
            throw error;
    }
}
async function listOrders(options) {
    let query = supabase_1.supabase
        .from('marketplace_orders')
        .select('id, platform, shop_id, external_id, order_number, status, buyer_name, total_amount, currency, items, ordered_at, synced_at', { count: 'exact' })
        .eq('platform', options.platform)
        .order('ordered_at', { ascending: false })
        .range(options.offset, options.offset + options.limit - 1);
    if (options.shopId)
        query = query.eq('shop_id', options.shopId);
    const { data, error, count } = await query;
    if (error)
        throw error;
    return { orders: data !== null && data !== void 0 ? data : [], total: count !== null && count !== void 0 ? count : 0 };
}
