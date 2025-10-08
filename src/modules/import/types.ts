// types.ts

export interface CustomerPayload {
  name: string;
  phone_number: string;
  email?: string | undefined;
  fb_name?: string | undefined;
  repeat_customer: 'new' | 'returning';
}

export interface AddressPayload {
  full_address: string;
  postcode?: string | '';
  city?: string | '';
  state?: string | '';
  country: string | '';
}

export interface OrderItemPayload {
  product: { name: string };
  quantity: number;
}

export interface OrderPayload {
  order_date: Date;
  total_amount: number;
  payment_method: string;
  status: string;
  currency: string;
  order_items: OrderItemPayload[];
}

export interface TrackingPayload {
  tracking_number: string;
  courier?: string | '';
  status: string;
}

export interface ImportPayload {
  customer: CustomerPayload;
  address: AddressPayload;
  order: OrderPayload;
  tracking?: TrackingPayload | undefined;
}
