"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
class ProductService {
    constructor() {
        this.productDatabase = new database_1.default();
    }
    async getAllProducts() {
        return await this.productDatabase.getAllProducts();
    }
    async getProductById(productId) {
        return await this.productDatabase.getProductById(productId);
    }
    async createProduct(productData) {
        return await this.productDatabase.upsertProduct(productData);
    }
    ;
    async updateProduct(productId, updates) {
        return await this.productDatabase.updateProduct(productId, updates);
    }
    async deleteProduct(productId) {
        return await this.productDatabase.deleteProduct(productId);
    }
}
exports.default = ProductService;
