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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
const supabase_1 = require("../supabase");
class OrderService {
    constructor() {
        this.orderDatabase = new database_1.default();
    }
    async getAllOrders(options) {
        var _a, _b, _c, _d, _e;
        const sortBy = (_a = options.sortBy) !== null && _a !== void 0 ? _a : 'created_at';
        const sortOrder = (_b = options.sortOrder) !== null && _b !== void 0 ? _b : 'desc';
        let createdAtFilter;
        if (options.dateFrom && options.dateTo) {
            createdAtFilter = { gte: options.dateFrom, lt: options.dateTo };
        }
        const { orders, count } = await this.orderDatabase.getAllOrders({
            limit: options.limit,
            offset: (_c = options.offset) !== null && _c !== void 0 ? _c : 0,
            search: options.search,
            sortBy,
            sortOrder,
            createdAt: createdAtFilter,
        });
        return {
            orders,
            pagination: {
                limit: (_d = options.limit) !== null && _d !== void 0 ? _d : count,
                offset: (_e = options.offset) !== null && _e !== void 0 ? _e : 0,
                total: count !== null && count !== void 0 ? count : 0,
            },
        };
    }
    async getOrderById(orderId) {
        return await this.orderDatabase.getOrderById(orderId);
    }
    async getOrdersByCustomerId(customerId) {
        return await this.orderDatabase.getOrdersByCustomerId(customerId);
    }
    async createOrder(orderData) {
        return await this.orderDatabase.upsertOrder(orderData);
    }
    /**
     * Update order with full reconciliation of line items
     */
    async updateOrder(orderId, updates) {
        const { order_items: newItems } = updates, orderData = __rest(updates, ["order_items"]);
        // 1️⃣ Update order metadata first
        const updatedOrder = await this.orderDatabase.updateOrder(orderId, orderData);
        if (!newItems)
            return updatedOrder; // no line item updates
        // 2️⃣ Fetch current items
        const currentOrder = await this.orderDatabase.getOrderById(orderId);
        const oldItems = currentOrder.order_items || [];
        // 3️⃣ Map old items for quick lookup
        const oldItemsMap = new Map();
        oldItems.forEach((item) => {
            oldItemsMap.set(item.product_id, {
                id: item.id,
                quantity: item.quantity,
            });
        });
        const incomingProductIds = new Set();
        const itemsToUpsert = [];
        // 4️⃣ Prepare upserts: update existing or insert new
        newItems.forEach((item) => {
            var _a;
            incomingProductIds.add(item.product_id);
            if (oldItemsMap.has(item.product_id)) {
                // existing → update quantity
                itemsToUpsert.push({
                    id: (_a = oldItemsMap.get(item.product_id)) === null || _a === void 0 ? void 0 : _a.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    order_id: orderId,
                });
            }
            else {
                // new → insert
                itemsToUpsert.push({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    order_id: orderId,
                });
            }
        });
        // 5️⃣ Identify items to delete
        const itemsToDelete = oldItems
            .filter((i) => !incomingProductIds.has(i.product_id))
            .map((i) => i.id);
        // 6️⃣ Apply changes
        if (itemsToUpsert.length > 0) {
            const cleanedOrderData = Object.fromEntries(Object.entries(orderData).filter(([, value]) => value !== undefined));
            await this.orderDatabase.upsertOrder(Object.assign(Object.assign({}, cleanedOrderData), { order_items: itemsToUpsert }));
        }
        if (itemsToDelete.length > 0) {
            await this.orderDatabase.bulkDeleteOrders(itemsToDelete);
        }
        // 7️⃣ Return the final updated order
        return await this.orderDatabase.getOrderById(orderId);
    }
    async deleteOrder(orderId) {
        return await this.orderDatabase.deleteOrder(orderId);
    }
    async bulkDeleteOrders(orderIds) {
        return await this.orderDatabase.bulkDeleteOrders(orderIds);
    }
    async updateLineItems(orderId, payload) {
        const { line_items, total_amount } = payload;
        if (!line_items || !line_items.length) {
            throw new Error('Line items cannot be empty');
        }
        // 1️⃣ Validate quantities
        line_items.forEach(item => {
            if (item.quantity <= 0) {
                throw new Error(`Quantity for product ${item.product_id} must be > 0`);
            }
        });
        // 2️⃣ Validate products exist
        const productIds = line_items.map(item => item.product_id);
        const { data: products, error: productError } = await supabase_1.supabase
            .from('products')
            .select('id')
            .in('id', productIds);
        if (productError)
            throw productError;
        if (products.length !== productIds.length) {
            throw new Error('One or more products do not exist');
        }
        // 3️⃣ Call DB layer to replace all line items
        return await this.orderDatabase.updateLineItems(orderId, {
            line_items,
            total_amount,
        });
    }
}
exports.default = OrderService;
