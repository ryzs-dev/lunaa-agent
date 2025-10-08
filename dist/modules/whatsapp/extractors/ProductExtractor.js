"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductExtractor = void 0;
const products_json_1 = __importDefault(require("../constants/products.json"));
const sizes_json_1 = __importDefault(require("../constants/sizes.json"));
class ProductExtractor {
    extract(text) {
        if (!text)
            return [];
        // last non-empty line
        const lines = text.trim().split(/\r?\n/);
        const lastLine = lines.reverse().find((line) => line.trim().length > 0);
        if (!lastLine)
            return [];
        const cleaned = lastLine.replace(/\s+/g, "").toLowerCase();
        const regex = /(\d+)([a-z])(\d+ml)?/gi;
        const orders = [];
        let match;
        while ((match = regex.exec(cleaned)) !== null) {
            const [, qty, code, size] = match;
            const quantity = parseInt(qty, 10);
            // lookup product by code
            const product = products_json_1.default.find((p) => p.code === code.toLowerCase());
            if (!product)
                continue;
            let name = product.name;
            // append size if available
            if (size) {
                const sizeObj = sizes_json_1.default.find((s) => s.code === size.toLowerCase());
                if (sizeObj) {
                    name = `${product.name} ${sizeObj.name}`;
                }
            }
            orders.push({ name, quantity });
        }
        return orders;
    }
}
exports.ProductExtractor = ProductExtractor;
