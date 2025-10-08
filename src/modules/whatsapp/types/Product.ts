export interface Product {
    id: string;
    name: string;
    price: number;
    stock?: number; // optional if you track inventory
    isActive?: boolean; // default true
  }
  