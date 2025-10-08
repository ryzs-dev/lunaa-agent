"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportService = void 0;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const fs_1 = __importDefault(require("fs"));
const service_1 = __importDefault(require("../customer/service"));
const service_2 = __importDefault(require("../address/service"));
const service_3 = __importDefault(require("../orders/service"));
const service_4 = __importDefault(require("../product/service"));
const service_5 = __importDefault(require("../order_tracking/service"));
const customerService = new service_1.default();
const addressService = new service_2.default();
const orderService = new service_3.default();
const productService = new service_4.default();
const orderTrackingService = new service_5.default();
class ImportService {
    constructor(importServiceUrl) {
        this.importServiceUrl = importServiceUrl;
        this.getProducts = async () => {
            const products = await productService.getAllProducts();
            return products;
        };
    }
    async mapProductNamesToIds(items) {
        const products = await this.getProducts();
        return items.map((item) => {
            const product = products.find((p) => p.name.toLowerCase() === item.product.name.toLowerCase());
            return {
                product_id: product ? product.id : null,
                quantity: item.quantity,
            };
        });
    }
    /**
     * Send CSV file to import microservice and get parsed payload
     */
    async fetchImportPayload(filePath) {
        // Ensure the file exists
        if (!fs_1.default.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        const formData = new form_data_1.default();
        formData.append('file', fs_1.default.createReadStream(filePath));
        const res = await axios_1.default.post(`${this.importServiceUrl}/import/file`, formData, {
            headers: formData.getHeaders(),
            maxBodyLength: Infinity, // for large files
            maxContentLength: Infinity,
        });
        // import microservice should return { success: true, data: [...] }
        return res.data.data || [];
    }
    /**
     * Persist payloads to CRM database
     */
    async savePayloadToDatabase(payload) {
        var _a, _b;
        const result = {
            success: 0,
            failed: 0,
            errors: [],
        };
        try {
            // 1. create/find customer
            const customer = await customerService.createCustomer(payload.customer);
            // 2. create address
            const address = await addressService.createAddress(Object.assign(Object.assign({}, payload.address), { postcode: payload.address.postcode || '', city: payload.address.city || '', state: payload.address.state || '', customer_id: customer.id }));
            // 3. create order
            const order = await orderService.createOrder(Object.assign(Object.assign({ customer_id: customer.id }, payload.order), { status: payload.order.status || 'unpaid', order_items: await this.mapProductNamesToIds(payload.order.order_items), address_id: address.id, created_at: '' }));
            // 4. create order_tracking
            if (payload.tracking && payload.tracking.courier) {
                await orderTrackingService.addTrackingEntry(Object.assign(Object.assign({}, payload.tracking), { courier: payload.tracking.courier || '', status: payload.tracking.status || 'pending' }), order.id);
            }
            // mark as success
            result.success += 1;
        }
        catch (err) {
            // clean error message
            const customerName = ((_a = payload.customer) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown';
            const phone = ((_b = payload.customer) === null || _b === void 0 ? void 0 : _b.phone_number) || 'Unknown';
            const message = err.message || err.toString();
            console.error(`Failed (phone: ${phone}): ${message}`);
            // record failure
            result.failed += 1;
            result.errors.push({
                customer: payload.customer,
                error: message,
            });
        }
        return result;
    }
    /**
     * End-to-end CSV processing
     */
    async importCsv(filePath) {
        try {
            const payloads = await this.fetchImportPayload(filePath);
            for (const payload of payloads) {
                await this.savePayloadToDatabase(payload);
            }
            // Optionally, remove temp file after processing
            fs_1.default.unlink(filePath, (err) => {
                if (err)
                    console.error('Failed to delete temp file:', err);
            });
            return payloads.length;
        }
        catch (err) {
            console.error('Failed to import CSV:', err.message);
            throw err;
        }
    }
}
exports.ImportService = ImportService;
