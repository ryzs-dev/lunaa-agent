"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
class OrderService {
    constructor(supabase) {
        this.supabase = supabase;
    }
    /**
     * Extract order items from raw input (string, JSON, etc.)
     */
    extractItems(raw) {
        // implement your parsing logic here
        // example if raw is already structured:
        return raw.products.map((p) => {
            var _a;
            return ({
                productId: p.productId,
                name: p.name,
                quantity: p.quantity,
                type: p.type,
                isActive: (_a = p.isActive) !== null && _a !== void 0 ? _a : true,
            });
        });
    }
    /**
     * Upsert order into Supabase
     */
    async upsertOrder(order) {
        const { data, error } = await this.supabase
            .from("orders")
            .upsert({
            order_id: order.orderId,
            order_date: order.orderDate,
            customer_id: order.customer.customerId,
            total_paid: order.totalPaid,
            remark: order.remark,
            payment_method: order.paymentMethod,
            receipt_number: order.receiptNumber,
            currency: order.currency,
        });
        if (error)
            throw error;
        // Now handle items (child table)
        for (const item of order.items) {
            const { error: itemError } = await this.supabase
                .from("order_items")
                .upsert({
                order_id: order.orderId,
                product_id: item.productId,
                name: item.name,
                quantity: item.quantity,
                type: item.type,
                is_active: item.isActive,
            });
            if (itemError)
                throw itemError;
        }
    }
}
exports.OrderService = OrderService;
