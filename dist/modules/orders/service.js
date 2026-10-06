"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
// Status counts join every order to its tracking and take ~3s, so they are
// served from memory and refreshed in the background once stale.
const SUMMARY_TTL_MS = 60000;
let summaryCache = null;
let summaryRefresh = null;
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
            location: options.location,
            source: options.source,
        });
    }
    async getOrderStatusSummary() {
        const cached = summaryCache;
        if (cached && Date.now() - cached.fetchedAt < SUMMARY_TTL_MS) {
            return cached.value;
        }
        if (!summaryRefresh) {
            summaryRefresh = this.orderDatabase
                .getOrderStatusSummary()
                .then((value) => {
                summaryCache = { value, fetchedAt: Date.now() };
                return value;
            })
                .finally(() => {
                summaryRefresh = null;
            });
        }
        if (cached) {
            summaryRefresh.catch((error) => console.error('Error refreshing order summary:', error));
            return cached.value;
        }
        return summaryRefresh;
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
    async findSimilarOrder(orderData) {
        return this.orderDatabase.findSimilarOrder(orderData);
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
