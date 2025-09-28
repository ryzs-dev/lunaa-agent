import { UUID } from "crypto";
import OrderTrackingDatabase from "./database";
import { OrderTrackingInput } from "./types";

class OrderTrackingService {
    private orderTrackingDatabase: OrderTrackingDatabase

    constructor() {
        this.orderTrackingDatabase = new OrderTrackingDatabase();
    }

    async addTrackingEntry(entryData: OrderTrackingInput, orderId: UUID) {
        return await this.orderTrackingDatabase.addTrackingEntry(entryData, orderId);
    }

    async getTrackingEntryById(entryId: string) {
        return await this.orderTrackingDatabase.getTrackingEntryById(entryId);
    }

    async getTrackingEntriesByOrderId(orderId: string) {
        return await this.orderTrackingDatabase.getTrackingEntriesByOrderId(orderId);
    }

    async updateTrackingEntry(entryId: string, updates: Partial<OrderTrackingInput>) {
        return await this.orderTrackingDatabase.updateTrackingEntry(entryId, updates);
    }

    async deleteTrackingEntry(entryId: string) {
        return await this.orderTrackingDatabase.deleteTrackingEntry(entryId);
    }
}

export default OrderTrackingService;