export interface ProductDB {
    id?: number;
    productCode: string;
    productName: string;
    productType?: string;
    size?: string;
    description?: string;
    basePrice: number;
    isActive?: boolean;
    category?: string;
    createdAt?: string;
    updatedAt?: string;
  }