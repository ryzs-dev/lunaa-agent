import { UUID } from "crypto";
import { supabase } from "../supabase";
import { ProductInput } from "./types";

class ProductDatabase {
    async getAllProducts(){
        const { data: products, error } = await supabase.from("products").select("*");
        if (error) throw error;
        return products;
    }

    async getProductById(productId:UUID) {
        const { data: product, error } = await supabase.from("products").select("*").eq("id", productId).single();
        if (error) throw error;
        return product;
    }

    async upsertProduct(productData: ProductInput){

        const { data: product, error } = await supabase.from("products").upsert([productData]).select("*").single();
        if (error) throw error;

        return product;
    }

    async deleteProduct(productId:UUID){
        const { data: product, error } = await supabase.from("products").delete().eq("id", productId).single();
        if (error) throw error;
        return product;
    }

    async updateProduct(productId:UUID, updates: Partial<ProductInput>){
        const { data: product, error } = await supabase.from("products").update(updates).eq("id", productId).select("*").single();
        if (error) throw error;
        return product;
    }
}

export default ProductDatabase;