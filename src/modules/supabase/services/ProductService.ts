import { supabase } from "..";
import { Product } from "../../whatsapp/types";


export class SupabaseProductService {
  async getProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("product_name");

    if (error) throw error;
    return data || [];
  }

  async getProductByCode(productCode: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("product_code", productCode)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async createProduct(
    productData: Omit<Product, "id" | "created_at" | "updated_at">
  ): Promise<Product> {
    const { data, error } = await supabase
      .from("products")
      .insert({
        ...productData,
        is_active: productData.isActive ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateProduct(
    productId: number,
    updates: Partial<Product>
  ): Promise<Product> {
    const { data, error } = await supabase
      .from("products")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", productId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteProduct(productId: number, hardDelete = false): Promise<void> {
    if (hardDelete) {
      const { error } = await supabase.from("products").delete().eq("id", productId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("products")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (error) throw error;
    }
  }
}
