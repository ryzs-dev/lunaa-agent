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
        const limit = (_a = options.limit) !== null && _a !== void 0 ? _a : 10;
        const offset = (_b = options.offset) !== null && _b !== void 0 ? _b : 0;
        return this.orderDatabase.getAllOrders({
            limit,
            offset,
            status: (_c = options.status) !== null && _c !== void 0 ? _c : 'all',
            search: options.search,
            sortBy: (_d = options.sortBy) !== null && _d !== void 0 ? _d : 'created_at',
            sortOrder: (_e = options.sortOrder) !== null && _e !== void 0 ? _e : 'desc',
            dateFrom: options.dateFrom,
            dateTo: options.dateTo,
            tracking: options.tracking,
        });
    }
    async getOrderById(orderId) {
        return this.orderDatabase.getOrderById(orderId);
    }
    async getOrdersByCustomerId(customerId) {
        return this.orderDatabase.getOrdersByCustomerId(customerId);
    }
    async createOrder(orderData) {
        return this.orderDatabase.upsertOrder(orderData);
    }
    async updateOrder(orderId, updates) {
        return this.orderDatabase.updateOrder(orderId, updates);
    }
    async deleteOrder(orderId) {
        return this.orderDatabase.deleteOrder(orderId);
    }
    async bulkDeleteOrders(orderIds) {
        return this.orderDatabase.bulkDeleteOrders(orderIds);
    }
    async updateLineItems(orderId, payload) {
        return this.orderDatabase.updateLineItems(orderId, payload);
    }
}
exports.default = OrderService;
