"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
class ProductDatabase {
    async getAllProducts() {
        const { data: products, error } = await supabase_1.supabase.from("products").select("*");
        if (error)
            throw error;
        return products;
    }
    async getProductById(productId) {
        const { data: product, error } = await supabase_1.supabase.from("products").select("*").eq("id", productId).single();
        if (error)
            throw error;
        return product;
    }
    async upsertProduct(productData) {
        const { data: product, error } = await supabase_1.supabase.from("products").upsert([productData]).select("*").single();
        if (error)
            throw error;
        return product;
    }
    async deleteProduct(productId) {
        const { data: product, error } = await supabase_1.supabase.from("products").delete().eq("id", productId).single();
        if (error)
            throw error;
        return product;
    }
    async updateProduct(productId, updates) {
        const { data: product, error } = await supabase_1.supabase.from("products").update(updates).eq("id", productId).select("*").single();
        if (error)
            throw error;
        return product;
    }
}
exports.default = ProductDatabase;
