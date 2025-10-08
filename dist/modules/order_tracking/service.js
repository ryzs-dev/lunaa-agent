"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
class OrderTrackingService {
    constructor() {
        this.orderTrackingDatabase = new database_1.default();
    }
    async addTrackingEntry(entryData, orderId) {
        return await this.orderTrackingDatabase.addTrackingEntry(entryData, orderId);
    }
    async getTrackingEntryById(entryId) {
        return await this.orderTrackingDatabase.getTrackingEntryById(entryId);
    }
    async getTrackingEntriesByOrderId(orderId) {
        return await this.orderTrackingDatabase.getTrackingEntriesByOrderId(orderId);
    }
    async updateTrackingEntry(entryId, updates) {
        return await this.orderTrackingDatabase.updateTrackingEntry(entryId, updates);
    }
    async deleteTrackingEntry(entryId) {
        return await this.orderTrackingDatabase.deleteTrackingEntry(entryId);
    }
}
exports.default = OrderTrackingService;
