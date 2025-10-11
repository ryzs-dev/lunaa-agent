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
    normalizePhoneNumber(phone) {
        let normalized = phone.trim();
        if (normalized.startsWith('60') || normalized.startsWith('65')) {
            normalized = normalized.slice(2);
        }
        return normalized;
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
        const postcode = (0, malaysia_postcodes_1.findPostcode)(shipmentData.clientAddress.postcode, true);
        const normalizedPhone = this.normalizePhoneNumber(shipmentData.clientAddress.phone);
        const payload = Object.assign(Object.assign({}, shipmentData), { clientAddress: Object.assign(Object.assign({}, shipmentData.clientAddress), { phone: normalizedPhone, state: postcode.found && postcode.state, city: postcode.found && postcode.city }) });
        try {
            const response = await axios_1.default.post(`${this.parcelDailyServiceURL}/create-order`, { payload, crmOrderId });
            return response.data;
        }
        catch (error) {
            throw new Error('Failed to create shipment');
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
}
exports.ParcelDailyService = ParcelDailyService;
