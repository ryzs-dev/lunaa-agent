export interface ExtractedData {
  customer: {
    name?: string;
    phone_number?: string;
    email?: string;
  };
  address: {
    full_address?: string;
    city?: string;
    postcode?: string;
    state?: string;
  };
  order: {
    order_date?: string;
    order_items?: {
      product_id: number;
      quantity: number;
      product_name?: string;
    }[];
    payment_method?: string;
    total_amount?: number;
    shipment_description?: string;
  };
  productQuantityMap?: Record<string, number>;
}
