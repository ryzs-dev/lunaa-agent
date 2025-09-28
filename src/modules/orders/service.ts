import { UUID } from "crypto";
import OrderDatabase from "./database";
import { OrderInput } from "./types";

class OrderService {
    private orderDatabase: OrderDatabase

    constructor() {
        this.orderDatabase = new OrderDatabase();
    }

    async getAllOrders() {
        return await this.orderDatabase.getAllOrders();
    }

    async getOrderById(orderId: UUID) {
        return await this.orderDatabase.getOrderById(orderId);
    }

    async getOrdersByCustomerId(customerId: UUID) {
        return await this.orderDatabase.getOrdersByCustomerId(customerId);
    }

    async createOrder(orderData: OrderInput) {
        return await this.orderDatabase.upsertOrder(orderData);
    };

    async updateOrder(orderId: UUID, updates: Partial<OrderInput>) {
        return await this.orderDatabase.updateOrder(orderId, updates);
    }

    async deleteOrder(orderId: UUID) {
        return await this.orderDatabase.deleteOrder(orderId);
    }
}

export default OrderService;