export interface ProductOrder {
  productId?: string;
  name: string;                 // e.g. "Femlift 30ml"
  quantity: number;             // how many
  type?: string;
}