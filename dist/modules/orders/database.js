"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderValidationError = exports.ORDER_STATUS_GROUPS = void 0;
exports.shipmentDescriptionFor = shipmentDescriptionFor;
const supabase_1 = require("../supabase");
const customer_search_1 = require("../shared/customer-search");
const customer_stats_1 = require("./customer-stats");
const order_number_1 = require("./order-number");
const validate_items_1 = require("./validate-items");
const EAST_MALAYSIA_STATES = ['Sabah', 'Sarawak', 'Labuan'];
const WEST_MALAYSIA_STATES = [
    'Johor',
    'Kedah',
    'Kelantan',
    'Melaka',
    'Negeri Sembilan',
    'Pahang',
    'Penang',
    'Pulau Pinang',
    'Perak',
    'Perlis',
    'Selangor',
    'Terengganu',
    'Kuala Lumpur',
    'Putrajaya',
];
// Courier and message statuses arrive with inconsistent spelling, so the
// dashboard filters on these groups rather than raw values.
exports.ORDER_STATUS_GROUPS = {
    awaiting_pickup: [
        'pending',
        'Pending',
        'Pending Pickup',
        'Shipment Data Received',
        'sent',
        'read',
    ],
    in_transit: [
        'In Transit',
        'Delivering',
        'shipped',
        'Parcel has been received',
        'Shipment collected',
        'Mainwaybill Pickup',
    ],
    delivered: [
        'Delivered',
        'delivered',
        'Successfully delivered',
        'Delivery Success',
        'special POD',
    ],
    problem: [
        'undelivered',
        'Returned',
        'RTO Success',
        'return success',
        'Return shipment was successfully delivered',
    ],
};
const SORTABLE_ORDER_FIELDS = [
    'created_at',
    'order_date',
    'total_amount',
    'order_number',
];
// Ordering with NULLS LAST on a non-null column skips its index and sorts
// every joined row, so only nullable columns get it.
const NULLABLE_SORT_FIELDS = ['order_date', 'total_amount'];
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;
// Accepts both "YYYY-MM-DD" (UTC midnight) and a Malaysia-midnight ISO
// timestamp, returning the Malaysia calendar date for either.
const EDITABLE_ORDER_FIELDS = [
    'customer_id',
    'address_id',
    'order_date',
    'status',
    'payment_method',
    'total_amount',
    'remark',
    'shipment_description',
];
class OrderValidationError extends Error {
}
exports.OrderValidationError = OrderValidationError;
// Same format staff type in WhatsApp orders, e.g. "1w1f1s1a": quantity then code.
// Codes that aren't products (free gifts like "a", "t", "sachet") only exist in the
// description, so they're carried over from the previous one.
function shipmentDescriptionFor(items, products, previous) {
    var _a;
    const productCodes = new Set([...products.values()].map((p) => { var _a; return (_a = p.code) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase(); }).filter(Boolean));
    const gifts = (_a = (previous !== null && previous !== void 0 ? previous : '')
        .replace(/\s+/g, '')
        .match(/\d+[a-z]+(?:\d+ml)?/gi)) === null || _a === void 0 ? void 0 : _a.filter((token) => !productCodes.has(token.replace(/^\d+/, '').toLowerCase()));
    return (items
        .map((item) => {
        var _a, _b;
        const code = (_b = (_a = products.get(item.product_id)) === null || _a === void 0 ? void 0 : _a.code) === null || _b === void 0 ? void 0 : _b.trim();
        return code ? `${item.quantity}${code}` : '';
    })
        .join('') + (gifts !== null && gifts !== void 0 ? gifts : []).join(''));
}
function toMalaysiaDate(date) {
    return new Date(date.getTime() + MALAYSIA_OFFSET_MS)
        .toISOString()
        .slice(0, 10);
}
class OrderDatabase {
    async getAllOrders({ limit, offset, search, sortBy, sortOrder, dateFrom, dateTo, status, tracking, location, source, }) {
        var _a;
        const applyLocation = location === 'east' || location === 'west';
        const statusValues = status && status !== 'all' && status !== 'needs_shipment'
            ? (_a = exports.ORDER_STATUS_GROUPS[status]) !== null && _a !== void 0 ? _a : [status]
            : null;
        const filtersOnTracking = Boolean(statusValues) ||
            status === 'needs_shipment' ||
            tracking === 'with' ||
            tracking === 'without';
        const filterSelect = [
            'id',
            applyLocation && 'addresses!inner(state)',
            filtersOnTracking &&
                `order_tracking${statusValues ? '!inner' : ''}(id, status)`,
        ]
            .filter(Boolean)
            .join(', ');
        const sortField = SORTABLE_ORDER_FIELDS.includes(sortBy)
            ? sortBy
            : 'created_at';
        // Only ids are paged here: embedding items/customer/tracking makes
        // Postgres build them for every row before sorting.
        let query = supabase_1.supabase
            .from('orders')
            .select(filterSelect, { count: 'exact' })
            .is('deleted_at', null)
            .order(sortField, Object.assign({ ascending: sortOrder === 'asc' }, (NULLABLE_SORT_FIELDS.includes(sortField) && { nullsFirst: false })))
            .order('id');
        if (search) {
            const term = (0, customer_search_1.sanitizeSearchTerm)(search);
            if (term) {
                const customerIds = await (0, customer_search_1.findCustomerIdsBySearch)(term);
                const orParts = [];
                if (!term.includes('@')) {
                    orParts.push(`order_number.ilike."%${term}%"`);
                    orParts.push(`buyer_name.ilike."%${term}%"`);
                }
                if (customerIds.length) {
                    orParts.push(`customer_id.in.(${customerIds.join(',')})`);
                }
                if (orParts.length) {
                    query = query.or(orParts.join(','));
                }
                else {
                    return {
                        orders: [],
                        pagination: {
                            pageIndex: offset / limit,
                            pageSize: limit,
                            total: 0,
                        },
                    };
                }
            }
        }
        if (source && source !== 'all') {
            query = query.eq('source', source);
        }
        if (dateFrom) {
            query = query.gte('order_date', toMalaysiaDate(dateFrom));
        }
        if (dateTo) {
            query = query.lte('order_date', toMalaysiaDate(dateTo));
        }
        if (tracking && tracking !== 'all') {
            if (tracking === 'with') {
                query = query.not('order_tracking', 'is', null);
            }
            else if (tracking === 'without') {
                query = query.is('order_tracking', null);
            }
        }
        if (status === 'needs_shipment') {
            query = query.is('order_tracking', null);
        }
        else if (statusValues) {
            query = query.in('order_tracking.status', statusValues);
        }
        if (applyLocation) {
            const states = location === 'east' ? EAST_MALAYSIA_STATES : WEST_MALAYSIA_STATES;
            query = query.or(states.map((state) => `state.eq."${state}"`).join(','), { referencedTable: 'addresses' });
        }
        // 📄 Pagination
        query = query.range(offset, offset + limit - 1);
        const { data: page, error, count } = await query;
        if (error)
            throw error;
        const ids = (page !== null && page !== void 0 ? page : []).map((row) => row.id);
        const { data, error: detailsError } = ids.length
            ? await supabase_1.supabase
                .from('orders')
                .select('*, order_items(*, products(name, code)), customers(*), addresses(*), order_tracking(*)')
                .in('id', ids)
            : { data: [], error: null };
        if (detailsError)
            throw detailsError;
        const position = new Map(ids.map((id, index) => [id, index]));
        const sorted = [...(data !== null && data !== void 0 ? data : [])].sort((a, b) => position.get(a.id) - position.get(b.id));
        const orders = sorted.map((_a) => {
            var { order_tracking: orderTracking } = _a, rest = __rest(_a, ["order_tracking"]);
            const trackingEntry = Array.isArray(orderTracking)
                ? orderTracking[orderTracking.length - 1]
                : orderTracking;
            return Object.assign(Object.assign({}, rest), { order_tracking: trackingEntry !== null && trackingEntry !== void 0 ? trackingEntry : null });
        });
        return {
            orders,
            pagination: {
                pageIndex: offset / limit,
                pageSize: limit,
                total: count !== null && count !== void 0 ? count : 0,
            },
        };
    }
    async getOrderStatusSummary() {
        const countOrders = async (group) => {
            let query;
            if (group === 'needs_shipment') {
                query = supabase_1.supabase
                    .from('orders')
                    .select('id, order_tracking(id)', { count: 'exact', head: true })
                    .is('order_tracking', null);
            }
            else if (group) {
                query = supabase_1.supabase
                    .from('orders')
                    .select('id, order_tracking!inner(status)', {
                    count: 'exact',
                    head: true,
                })
                    .in('order_tracking.status', exports.ORDER_STATUS_GROUPS[group]);
            }
            else {
                query = supabase_1.supabase
                    .from('orders')
                    .select('id', { count: 'exact', head: true });
            }
            const { count, error } = await query.is('deleted_at', null);
            if (error)
                throw error;
            return count !== null && count !== void 0 ? count : 0;
        };
        const groups = ['needs_shipment', ...Object.keys(exports.ORDER_STATUS_GROUPS)];
        const [all, ...counts] = await Promise.all([
            countOrders(),
            ...groups.map((group) => countOrders(group)),
        ]);
        return Object.assign({ all }, Object.fromEntries(groups.map((group, i) => [group, counts[i]])));
    }
    async getOrderById(orderId) {
        const { data: order, error } = await supabase_1.supabase
            .from('orders')
            .select('*, addresses(*), order_items(*, products(*)), customers(*), order_tracking(*)')
            .eq('id', orderId)
            .is('deleted_at', null)
            .single();
        if (error)
            throw error;
        return order;
    }
    async getOrdersByCustomerId(customerId) {
        const { data: orders, error } = await supabase_1.supabase
            .from('orders')
            .select('*, order_items(*), customers(*), order_tracking(*)')
            .eq('customer_id', customerId)
            .is('deleted_at', null);
        if (error)
            throw error;
        return orders;
    }
    async findSimilarOrder(orderData) {
        const date = String(orderData.order_date || '').slice(0, 10);
        if (!orderData.customer_id || !date)
            return null;
        const { data: orders, error } = await supabase_1.supabase
            .from('orders')
            .select('id, order_number, order_date, total_amount, shipment_description, address_id')
            .eq('customer_id', orderData.customer_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(10);
        if (error)
            throw error;
        return ((orders || []).find((order) => {
            const sameDate = String(order.order_date || '').slice(0, 10) === date;
            const sameTotal = Number(order.total_amount) === Number(orderData.total_amount);
            const sameShipment = String(order.shipment_description || '').replace(/\s+/g, '') ===
                String(orderData.shipment_description || '').replace(/\s+/g, '');
            return sameDate && sameTotal && sameShipment;
        }) || null);
    }
    async upsertOrder(orderData) {
        var _a, _b, _c, _d, _e;
        const validatedItems = (0, validate_items_1.validateOrderItems)(orderData.order_items);
        const { order_items: _orderItems } = orderData, order = __rest(orderData, ["order_items"]);
        const orderNumber = (_a = order.order_number) !== null && _a !== void 0 ? _a : (await (0, order_number_1.generateOrderNumber)());
        let shipmentDescription = (_b = order.shipment_description) === null || _b === void 0 ? void 0 : _b.trim();
        if (!shipmentDescription) {
            const { data: products, error: productsError } = await supabase_1.supabase
                .from('products')
                .select('id, code')
                .in('id', validatedItems.map((i) => i.product_id));
            if (productsError)
                throw productsError;
            shipmentDescription = shipmentDescriptionFor(validatedItems, new Map((products !== null && products !== void 0 ? products : []).map((p) => [p.id, p])));
        }
        const orderPayload = Object.assign(Object.assign({}, order), { shipment_description: shipmentDescription || undefined, order_number: orderNumber, order_date: (_c = order.order_date) !== null && _c !== void 0 ? _c : new Date().toISOString(), status: (_d = order.status) !== null && _d !== void 0 ? _d : 'unpaid', currency: (_e = order.currency) !== null && _e !== void 0 ? _e : 'MYR' });
        // 1️⃣ Upsert the order itself
        const { data: upsertedOrder, error: orderError } = await supabase_1.supabase
            .from('orders')
            .upsert([orderPayload])
            .select('*')
            .single();
        if (orderError)
            throw orderError;
        const orderId = upsertedOrder.id;
        // 2️⃣ Prepare the order items with order_id
        const itemsToUpsert = validatedItems.map((item) => (Object.assign(Object.assign({}, item), { order_id: orderId })));
        // 3️⃣ Upsert items — update quantity if same order_id + product_id exists
        const { error: itemsError } = await supabase_1.supabase
            .from('order_items')
            .upsert(itemsToUpsert, {
            onConflict: 'order_id,product_id', // tells Postgres what defines uniqueness
            ignoreDuplicates: false, // ensure conflict triggers update
        })
            .select('*');
        if (itemsError)
            throw itemsError;
        // 4️⃣ Fetch updated order with order items
        const { data: updatedOrder, error: fetchError } = await supabase_1.supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('id', orderId)
            .single();
        if (fetchError)
            throw fetchError;
        return updatedOrder;
    }
    async deleteOrder(orderId) {
        const { data: order, error: fetchError } = await supabase_1.supabase
            .from('orders')
            .select('id, customer_id, total_amount')
            .eq('id', orderId)
            .is('deleted_at', null)
            .single();
        if (fetchError)
            throw fetchError;
        const deletedAt = new Date().toISOString();
        const { data: deletedOrder, error } = await supabase_1.supabase
            .from('orders')
            .update({ deleted_at: deletedAt })
            .eq('id', orderId)
            .is('deleted_at', null)
            .select('*')
            .single();
        if (error)
            throw error;
        if (order.customer_id) {
            try {
                await (0, customer_stats_1.recalculateCustomerStats)(order.customer_id);
            }
            catch (statsError) {
                console.error('Failed to recalculate customer stats after delete:', statsError);
            }
        }
        return deletedOrder;
    }
    async bulkDeleteOrders(orderIds) {
        if (!orderIds.length)
            return [];
        const { data: orders, error: fetchError } = await supabase_1.supabase
            .from('orders')
            .select('id, customer_id')
            .in('id', orderIds)
            .is('deleted_at', null);
        if (fetchError)
            throw fetchError;
        if (!(orders === null || orders === void 0 ? void 0 : orders.length))
            return [];
        const deletedAt = new Date().toISOString();
        const { data: deletedOrders, error } = await supabase_1.supabase
            .from('orders')
            .update({ deleted_at: deletedAt })
            .in('id', orders.map((order) => order.id))
            .is('deleted_at', null)
            .select('*');
        if (error)
            throw error;
        const customerIds = [
            ...new Set(orders
                .map((order) => order.customer_id)
                .filter((customerId) => Boolean(customerId))),
        ];
        await Promise.all(customerIds.map(async (customerId) => {
            try {
                await (0, customer_stats_1.recalculateCustomerStats)(customerId);
            }
            catch (statsError) {
                console.error('Failed to recalculate customer stats after bulk delete:', statsError);
            }
        }));
        return deletedOrders !== null && deletedOrders !== void 0 ? deletedOrders : [];
    }
    async updateOrder(orderId, updates) {
        const { order_items } = updates, rest = __rest(updates, ["order_items"]);
        const orderFields = {};
        for (const field of EDITABLE_ORDER_FIELDS) {
            if (rest[field] !== undefined)
                orderFields[field] = rest[field];
        }
        if (orderFields.order_date) {
            const date = new Date(orderFields.order_date);
            if (Number.isNaN(date.getTime()))
                throw new OrderValidationError('Invalid order date');
            orderFields.order_date = toMalaysiaDate(date);
        }
        if (orderFields.total_amount !== undefined) {
            const total = Number(orderFields.total_amount);
            if (!Number.isFinite(total) || total < 0) {
                throw new OrderValidationError('Total must be zero or more');
            }
            orderFields.total_amount = Math.round(total * 100) / 100;
        }
        // Items are only touched when the caller sends them; other edits leave them alone.
        if (order_items !== undefined) {
            let items;
            try {
                items = (0, validate_items_1.validateOrderItems)(order_items);
            }
            catch (error) {
                throw new OrderValidationError(error.message);
            }
            const { data: oldItems, error: fetchError } = await supabase_1.supabase
                .from('order_items')
                .select('product_id, quantity')
                .eq('order_id', orderId);
            if (fetchError)
                throw fetchError;
            const itemsKey = (list) => list
                .map((i) => `${i.product_id}:${i.quantity}`)
                .sort()
                .join('|');
            const itemsChanged = itemsKey(oldItems !== null && oldItems !== void 0 ? oldItems : []) !== itemsKey(items);
            if (itemsChanged) {
                const { error: upsertError } = await supabase_1.supabase
                    .from('order_items')
                    .upsert(items.map((item) => (Object.assign(Object.assign({}, item), { order_id: orderId }))), { onConflict: 'order_id,product_id', ignoreDuplicates: false });
                if (upsertError)
                    throw upsertError;
                const keep = new Set(items.map((i) => i.product_id));
                const removed = (oldItems !== null && oldItems !== void 0 ? oldItems : []).filter((i) => !keep.has(i.product_id));
                if (removed.length) {
                    const { error: deleteError } = await supabase_1.supabase
                        .from('order_items')
                        .delete()
                        .eq('order_id', orderId)
                        .in('product_id', removed.map((i) => i.product_id));
                    if (deleteError)
                        throw deleteError;
                }
                const { data: products, error: productsError } = await supabase_1.supabase
                    .from('products')
                    .select('id, code, price');
                if (productsError)
                    throw productsError;
                const byId = new Map((products !== null && products !== void 0 ? products : []).map((p) => [p.id, p]));
                if (orderFields.shipment_description === undefined) {
                    const { data: current, error: currentError } = await supabase_1.supabase
                        .from('orders')
                        .select('shipment_description')
                        .eq('id', orderId)
                        .maybeSingle();
                    if (currentError)
                        throw currentError;
                    orderFields.shipment_description = shipmentDescriptionFor(items, byId, current === null || current === void 0 ? void 0 : current.shipment_description);
                }
                if (orderFields.total_amount === undefined) {
                    orderFields.total_amount = items.reduce((sum, item) => { var _a; return sum + (Number((_a = byId.get(item.product_id)) === null || _a === void 0 ? void 0 : _a.price) || 0) * item.quantity; }, 0);
                }
            }
        }
        if (Object.keys(orderFields).length) {
            const { error: orderError } = await supabase_1.supabase
                .from('orders')
                .update(orderFields)
                .eq('id', orderId);
            if (orderError)
                throw orderError;
        }
        const { data: updatedOrder, error: readError } = await supabase_1.supabase
            .from('orders')
            .select('*, order_items(*, products(*))')
            .eq('id', orderId)
            .maybeSingle();
        if (readError)
            throw readError;
        if (!updatedOrder)
            throw new OrderValidationError('Order not found');
        return updatedOrder;
    }
    async updateLineItems(orderId, payload) {
        if (!payload.line_items.length) {
            throw new OrderValidationError('Line items cannot be empty');
        }
        return this.updateOrder(orderId, {
            order_items: payload.line_items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
            })),
            total_amount: payload.total_amount,
            shipment_description: payload.shipment_description,
        });
    }
}
exports.default = OrderDatabase;
