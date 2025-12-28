import {UUID} from 'crypto';

export interface OrderInput {
    created_at: string | number | Date;
    address_id?: UUID;
    customer_id: UUID;
    order_date: Date;
    status?: 'unpaid' | 'paid' | 'refunded';
    currency?: string;
    total_amount: number;
    payment_method?: string;
    order_items: OrderItemsInput[];
    remark?: string;
    shipment_description?: string;
}

export interface OrderItemsInput {
    product_id: UUID;
    quantity: number;
}

export interface UpdateLineItemsInput {
    line_items: {
        product_id: UUID;
        quantity: number;
    }[]
    total_amount: number;
}
