"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseProductService = void 0;
const __1 = require("..");
class SupabaseProductService {
    async getProducts() {
        const { data, error } = await __1.supabase
            .from("products")
            .select("*")
            .eq("is_active", true)
            .order("product_name");
        if (error)
            throw error;
        return data || [];
    }
    async getProductByCode(productCode) {
        const { data, error } = await __1.supabase
            .from("products")
            .select("*")
            .eq("product_code", productCode)
            .eq("is_active", true)
            .maybeSingle();
        if (error)
            throw error;
        return data;
    }
    async createProduct(productData) {
        var _a;
        const { data, error } = await __1.supabase
            .from("products")
            .insert(Object.assign(Object.assign({}, productData), { is_active: (_a = productData.isActive) !== null && _a !== void 0 ? _a : true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateProduct(productId, updates) {
        const { data, error } = await __1.supabase
            .from("products")
            .update(Object.assign(Object.assign({}, updates), { updated_at: new Date().toISOString() }))
            .eq("id", productId)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async deleteProduct(productId, hardDelete = false) {
        if (hardDelete) {
            const { error } = await __1.supabase.from("products").delete().eq("id", productId);
            if (error)
                throw error;
        }
        else {
            const { error } = await __1.supabase
                .from("products")
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq("id", productId);
            if (error)
                throw error;
        }
    }
}
exports.SupabaseProductService = SupabaseProductService;
