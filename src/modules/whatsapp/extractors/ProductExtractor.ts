import { IExtractor } from "./IExtractor";
import products from "../constants/products.json";
import sizes from "../constants/sizes.json";
import { ProductOrder } from "../types";

export class ProductExtractor implements IExtractor<ProductOrder[]> {
  extract(text: string): ProductOrder[] {
    if (!text) return [];

    // last non-empty line
    const lines = text.trim().split(/\r?\n/);
    const lastLine = lines.reverse().find((line) => line.trim().length > 0);
    if (!lastLine) return [];

    const cleaned = lastLine.replace(/\s+/g, "").toLowerCase();
    const regex = /(\d+)([a-z])(\d+ml)?/gi;

    const orders: ProductOrder[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(cleaned)) !== null) {
      const [, qty, code, size] = match;
      const quantity = parseInt(qty, 10);

      // lookup product by code
      const product = products.find((p) => p.code === code.toLowerCase());
      if (!product) continue;

      let name = product.name;

      // append size if available
      if (size) {
        const sizeObj = sizes.find((s) => s.code === size.toLowerCase());
        if (sizeObj) {
          name = `${product.name} ${sizeObj.name}`;
        }
      }

      orders.push({ name, quantity });
    }

    return orders;
  }
}
