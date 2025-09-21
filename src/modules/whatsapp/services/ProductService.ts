import { SupabaseProductService } from "../../supabase/services/ProductService";
import { Product } from "../types";

export class WhatsAppProductService {
  private supabaseService: SupabaseProductService;

  constructor() {
    this.supabaseService = new SupabaseProductService();
  }

  async listActiveProducts(): Promise<Product[]> {
    return await this.supabaseService.getProducts();
  }

  async findProductByCode(code: string): Promise<Product | null> {
    return await this.supabaseService.getProductByCode(code);
  }

  async addProduct(productData: Omit<Product, "id" | "created_at" | "updated_at">): Promise<Product> {
    return await this.supabaseService.createProduct(productData);
  }

  async modifyProduct(productId: number, updates: Partial<Product>): Promise<Product> {
    return await this.supabaseService.updateProduct(productId, updates);
  }

  async removeProduct(productId: number, hardDelete = false): Promise<void> {
    return await this.supabaseService.deleteProduct(productId, hardDelete);
  }
}
