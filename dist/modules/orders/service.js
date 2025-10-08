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
        var _a, _b, _c;
        const limit = !options.limit || options.limit > 100 ? 20 : options.limit;
        const offset = (_a = options.offset) !== null && _a !== void 0 ? _a : 0;
        const sortBy = (_b = options.sortBy) !== null && _b !== void 0 ? _b : 'created_at';
        const sortOrder = (_c = options.sortOrder) !== null && _c !== void 0 ? _c : 'desc';
        const { orders, count } = await this.orderDatabase.getAllOrders({
            limit,
            offset,
            search: options.search,
            sortBy,
            sortOrder,
        });
        return {
            orders,
            pagination: {
                limit,
                offset,
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
