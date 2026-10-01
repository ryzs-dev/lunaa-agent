"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParcelDailyService = void 0;
const axios_1 = __importDefault(require("axios"));
const malaysia_postcodes_1 = require("malaysia-postcodes");
// Must match the pickup address the parcel-daily service books orders from.
const PICKUP_ORIGIN = { postcode: '14000', country: 'Malaysia' };
const COURIER_NAMES_TTL_MS = 24 * 60 * 60 * 1000;
class ParcelDailyService {
    constructor(parcelDailyServiceURL) {
        this.parcelDailyServiceURL = parcelDailyServiceURL;
        this.courierNames = null;
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
                    details: (_c = error.response) === null || _c === void 0 ? void 0 : _c.data,
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
    async getCourierNames() {
        var _a, _b, _c, _d, _e;
        if (this.courierNames && Date.now() - this.courierNames.at < COURIER_NAMES_TTL_MS) {
            return this.courierNames.names;
        }
        try {
            const response = await axios_1.default.get(`${this.parcelDailyServiceURL}/couriers`);
            const list = (_c = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.data) !== null && _c !== void 0 ? _c : [];
            const names = Object.fromEntries(list.map((c) => [c.label, c.name]));
            this.courierNames = { at: Date.now(), names };
            return names;
        }
        catch (_f) {
            return (_e = (_d = this.courierNames) === null || _d === void 0 ? void 0 : _d.names) !== null && _e !== void 0 ? _e : {};
        }
    }
    // Live prices for every courier Parcel Daily can use from our pickup address
    // to this destination. Couriers that don't serve the route are left out.
    async getQuotes(input) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const response = await axios_1.default.post(`${this.parcelDailyServiceURL}/check-rate`, {
            origin: PICKUP_ORIGIN.postcode,
            originCountry: PICKUP_ORIGIN.country,
            destination: input.postcode,
            destinationCountry: input.country,
            weight: input.weight,
            cod: (_a = input.cod) !== null && _a !== void 0 ? _a : 0,
        });
        const quote = (_d = (_c = (_b = response.data) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.success) !== null && _d !== void 0 ? _d : {};
        const names = await this.getCourierNames();
        const money = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n > 0 ? n : 0;
        };
        const couriers = Object.keys(quote)
            .filter((key) => key.endsWith('Price') && money(quote[key]) > 0)
            .map((key) => {
            var _a;
            const code = key.slice(0, -'Price'.length);
            return {
                code,
                name: (_a = names[code]) !== null && _a !== void 0 ? _a : code,
                price: money(quote[key]),
                postage: money(quote[`${code}Postage`]),
                codFee: money(quote[`${code}Cod`]),
            };
        })
            .sort((a, b) => a.price - b.price);
        return {
            couriers,
            destination: {
                state: (_h = (_f = (_e = quote.toPostcode) === null || _e === void 0 ? void 0 : _e.State) !== null && _f !== void 0 ? _f : (_g = quote.toPostcode) === null || _g === void 0 ? void 0 : _g.StateName) !== null && _h !== void 0 ? _h : null,
                city: (_k = (_j = quote.toPostcode) === null || _j === void 0 ? void 0 : _j.CityName) !== null && _k !== void 0 ? _k : null,
            },
        };
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
