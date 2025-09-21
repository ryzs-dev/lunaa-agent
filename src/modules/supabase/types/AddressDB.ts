export interface AddressDB {
    id?: number;
    customerId: number;
    address_line_1: string;
    address_line_2?: string;
    city?: string;
    postcode?: string;
    state?: string;
    country?: string;
    created_at?: string;
    updated_at?: string;
  }