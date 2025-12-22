"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
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
    async updateOrder(orderId, updates) {
        return await this.orderDatabase.updateOrder(orderId, updates);
    }
    async deleteOrder(orderId) {
        return await this.orderDatabase.deleteOrder(orderId);
    }
    async bulkDeleteOrders(orderIds) {
        return await this.orderDatabase.bulkDeleteOrders(orderIds);
    }
}
exports.default = OrderService;
