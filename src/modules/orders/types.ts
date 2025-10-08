import { UUID } from 'crypto';

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
}

export interface OrderItemsInput {
  product_id: UUID;
  quantity: number;
}
