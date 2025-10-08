"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppProductService = void 0;
const ProductService_1 = require("../../supabase/services/ProductService");
class WhatsAppProductService {
    constructor() {
        this.supabaseService = new ProductService_1.SupabaseProductService();
    }
    async listActiveProducts() {
        return await this.supabaseService.getProducts();
    }
    async findProductByCode(code) {
        return await this.supabaseService.getProductByCode(code);
    }
    async addProduct(productData) {
        return await this.supabaseService.createProduct(productData);
    }
    async modifyProduct(productId, updates) {
        return await this.supabaseService.updateProduct(productId, updates);
    }
    async removeProduct(productId, hardDelete = false) {
        return await this.supabaseService.deleteProduct(productId, hardDelete);
    }
}
exports.WhatsAppProductService = WhatsAppProductService;
