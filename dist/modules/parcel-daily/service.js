"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParcelDailyService = void 0;
const axios_1 = __importDefault(require("axios"));
const malaysia_postcodes_1 = require("malaysia-postcodes");
class ParcelDailyService {
    constructor(parcelDailyServiceURL) {
        this.parcelDailyServiceURL = parcelDailyServiceURL;
    }
    async getAccountInfo() {
        try {
            const response = await axios_1.default.get(`${this.parcelDailyServiceURL}/account-info`);
            return response.data;
        }
        catch (error) {
            throw new Error('Failed to fetch account info');
        }
    }
    async createShipment(shipmentData, crmOrderId) {
        var _a, _b, _c;
        const postcode = (0, malaysia_postcodes_1.findPostcode)(shipmentData.clientAddress.postcode, true);
        const normalizedPhone = this.normalizePhoneNumber(shipmentData.clientAddress.phone);
        const payload = Object.assign(Object.assign({}, shipmentData), { clientAddress: Object.assign(Object.assign({}, shipmentData.clientAddress), { phone: normalizedPhone, state: postcode.found && postcode.state, city: postcode.found && postcode.city }) });
        console.log("Creating Shipment");
        try {
            const response = await axios_1.default.post(`${this.parcelDailyServiceURL}/create-order`, { payload, crmOrderId });
            if (((_a = response.data) === null || _a === void 0 ? void 0 : _a.success) === false) {
                return response.data;
            }
            return response.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                return {
                    success: false,
                    status: ((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) || 500,
                    message: 'Parcel Daily request failed',
                    details: (_c = error.response) === null || _c === void 0 ? void 0 : _c.data
                };
            }
            return {
                success: false,
                status: 500,
                message: 'Unexpected error occurred.',
            };
        }
    }
    async createBulkShipments(shipments) {
        const enrichedShipments = shipments.map((shipment) => {
            const postcode = (0, malaysia_postcodes_1.findPostcode)(shipment.clientAddress.postcode, true);
            return Object.assign(Object.assign({}, shipment), { clientAddress: Object.assign(Object.assign({}, shipment.clientAddress), { state: postcode.found && postcode.state, city: postcode.found && postcode.city }) });
        });
        const normalizedPhones = enrichedShipments.map((shipment) => this.normalizePhoneNumber(shipment.clientAddress.phone));
        const payload = {
            shipments: enrichedShipments.map((shipment, index) => (Object.assign(Object.assign({}, shipment), { clientAddress: Object.assign(Object.assign({}, shipment.clientAddress), { phone: normalizedPhones[index] }) }))),
        };
        try {
            const response = await axios_1.default.post(`${this.parcelDailyServiceURL}/create-bulk-order`, payload);
            return response.data;
        }
        catch (error) {
            throw new Error('Failed to create bulk shipments');
        }
    }
    async getOrderStatus(orderId) {
        try {
            const response = await axios_1.default.get(`${this.parcelDailyServiceURL}/order/${orderId}`);
            return response.data;
        }
        catch (error) {
            throw new Error('Failed to fetch order status');
        }
    }
    normalizePhoneNumber(phone) {
        let normalized = phone.trim();
        if (normalized.startsWith('60') || normalized.startsWith('65')) {
            normalized = normalized.slice(2);
        }
        return normalized;
    }
}
exports.ParcelDailyService = ParcelDailyService;
