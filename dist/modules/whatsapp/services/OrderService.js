"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappOrderService = void 0;
const OrderService_1 = require("../../supabase/services/OrderService");
const supabase_1 = require("../../supabase");
class WhatsappOrderService {
    constructor() {
        this.supabaseOrderService = new OrderService_1.OrderService(supabase_1.supabase);
    }
    /**
     * Parse raw WhatsApp text into OrderItems
     */
    parseItems(rawText) {
        // TODO: implement parsing logic properly
        // Example (simple split)
        const lines = rawText.split("\n").filter(l => l.trim());
        return lines.map((line, idx) => {
            const [name, qtyStr] = line.split("x");
            return {
                productId: `temp-${idx}`,
                name: name.trim(),
                quantity: parseInt(qtyStr !== null && qtyStr !== void 0 ? qtyStr : "1", 10),
                isActive: true,
            };
        });
    }
    /**
     * Convert WhatsApp message → Order object
     */
    buildOrderFromMessage(message, meta) {
        var _a;
        const items = this.parseItems(message);
        return {
            orderId: meta.orderId,
            orderDate: new Date().toISOString(),
            customer: meta.customer,
            items,
            totalPaid: meta.totalPaid,
            remark: meta.remark,
            paymentMethod: meta.paymentMethod,
            shipment: meta.shipment,
            isRepeatCustomer: meta.isRepeatCustomer,
            receiptNumber: meta.receiptNumber,
            currency: (_a = meta.currency) !== null && _a !== void 0 ? _a : "RM",
        };
    }
    /**
     * Full pipeline: WhatsApp → Order → Supabase
     */
    async processWhatsappOrder(message, meta) {
        const order = this.buildOrderFromMessage(message, meta);
        await this.supabaseOrderService.upsertOrder(order);
        return order;
    }
}
exports.WhatsappOrderService = WhatsappOrderService;
