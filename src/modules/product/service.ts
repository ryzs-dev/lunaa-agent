import { UUID } from "crypto";
import { ProductInput } from "./types";
import ProductDatabase from "./database";

class ProductService {
    private productDatabase: ProductDatabase

    constructor() {
        this.productDatabase = new ProductDatabase();
    }

    async getAllProducts() {
        return await this.productDatabase.getAllProducts();
    }

    async getProductById(productId: UUID) {
        return await this.productDatabase.getProductById(productId);
    }

    async createProduct(productData: ProductInput) {
        return await this.productDatabase.upsertProduct(productData);
    };

    async updateProduct(productId: UUID, updates: Partial<ProductInput>) {
        return await this.productDatabase.updateProduct(productId, updates);
    }

    async deleteProduct(productId: UUID) {
        return await this.productDatabase.deleteProduct(productId);
    }
}

export default ProductService;