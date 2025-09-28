import { UUID } from "crypto";

export interface OrderInput {
    customer_id: UUID;
    order_date: Date
    status: "unpaid" | "paid" | "refunded"
    total_amount: number;
    payment_method: string;
    order_items: OrderItemsInput[];
}

export interface OrderItemsInput {
    product_id: UUID;
    quantity: number;
}

