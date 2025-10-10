"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSheetService = void 0;
const _1 = require(".");
const sheetMapper_1 = require("../../utils/sheetMapper");
const service_1 = __importDefault(require("../product/service"));
class GoogleSheetService {
    constructor() {
        this.sheetNames = [];
        this.productService = new service_1.default();
        this.spreadSheetId = process.env.GOOGLE_SHEET_ID || '';
        this.sheetNames = JSON.parse(process.env.SHEET_NAMES || '["Clean"]');
    }
    buildRowData(payload, headers) {
        return headers.map((header) => {
            const normalized = header.toLowerCase().trim();
            const resolver = sheetMapper_1.sheetFieldMap[normalized];
            if (resolver)
                return resolver(payload);
            if (payload.productQuantityMap) {
                const matchKey = Object.keys(payload.productQuantityMap).find((key) => key.toLowerCase().trim() === normalized);
                if (matchKey)
                    return payload.productQuantityMap[matchKey];
            }
            return '';
        });
    }
    async createOrder({ customer, order, address }) {
        var _a;
        try {
            const sheet = this.sheetNames[0];
            const [enrichedItems, headerResponse] = await Promise.all([
                Promise.all((order.order_items || []).map(async (item) => {
                    const product = await this.productService.getProductById(item.product_id);
                    return Object.assign(Object.assign({}, item), { product_name: (product === null || product === void 0 ? void 0 : product.name) || 'Unknown Product' });
                })),
                _1.googleClient.spreadsheets.values.get({
                    spreadsheetId: this.spreadSheetId,
                    range: `${sheet}!A:AE`,
                }),
            ]);
            order.order_items = enrichedItems;
            const productQuantityMap = {};
            for (const item of order.order_items) {
                if (item.product_name) {
                    productQuantityMap[item.product_name] = item.quantity;
                }
            }
            const headers = ((_a = headerResponse.data.values) === null || _a === void 0 ? void 0 : _a[0]) || [];
            const payload = { customer, order, address, productQuantityMap };
            const rowData = this.buildRowData(payload, headers);
            await _1.googleClient.spreadsheets.values.append({
                spreadsheetId: this.spreadSheetId,
                range: `${sheet}!A:AE`,
                valueInputOption: 'RAW',
                requestBody: { values: [rowData] },
            });
            return { success: true };
        }
        catch (error) {
            console.error('Failed to insert order into Google Sheets:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
exports.GoogleSheetService = GoogleSheetService;
