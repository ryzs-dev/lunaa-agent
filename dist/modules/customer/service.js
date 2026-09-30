"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
const customerName_1 = require("../../utils/customerName");
const country_index_1 = require("./country-index");
const SORTABLE_CUSTOMER_FIELDS = [
    'created_at',
    'name',
    'total_amount_spent',
    'total_purchase_count',
    'last_order_date',
];
class CustomerService {
    constructor() {
        this.customerDatabase = new database_1.default();
    }
    normalizePhoneNumber(phoneNumber) {
        const digits = phoneNumber.replace(/\D/g, '');
        if (!digits)
            return null;
        // Malaysia
        if (digits.startsWith('60')) {
            return digits;
        }
        if (digits.startsWith('0')) {
            return `60${digits.substring(1)}`;
        }
        // Singapore
        if (digits.startsWith('65')) {
            return digits;
        }
        if (/^[89]\d{7}$/.test(digits)) {
            return `65${digits}`;
        }
        return null;
    }
    async getAllCustomers(options) {
        var _a, _b;
        const limit = !options.limit || options.limit > 100 ? 20 : options.limit;
        const offset = (_a = options.offset) !== null && _a !== void 0 ? _a : 0;
        const sortBy = options.sortBy && SORTABLE_CUSTOMER_FIELDS.includes(options.sortBy)
            ? options.sortBy
            : 'created_at';
        const sortOrder = (_b = options.sortOrder) !== null && _b !== void 0 ? _b : 'desc';
        let filterDate;
        if (options.filter && options.filter !== 'all') {
            const now = new Date();
            filterDate = new Date();
            switch (options.filter) {
                case 'today':
                    // Start of today (00:00:00)
                    filterDate.setHours(0, 0, 0, 0);
                    break;
                case 'week':
                    // Start of this week (Monday as first day)
                    const dayOfWeek = now.getDay(); // Sunday=0, Monday=1
                    const diffToMonday = (dayOfWeek + 6) % 7; // adjust so Monday is start
                    filterDate.setDate(now.getDate() - diffToMonday);
                    filterDate.setHours(0, 0, 0, 0);
                    break;
                case 'month':
                    // Start of this month
                    filterDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
            }
        }
        const countryIndex = await (0, country_index_1.getCountryIndex)();
        const { customers, count } = await this.customerDatabase.getAllCustomers({
            limit,
            offset,
            search: options.search,
            sortBy,
            sortOrder,
            filterDate,
            repeatCustomer: options.type && options.type !== 'all' ? options.type : undefined,
            countryFilter: options.country
                ? (0, country_index_1.countryOrFilter)(countryIndex, options.country)
                : undefined,
        });
        return {
            customers: (customers !== null && customers !== void 0 ? customers : []).map((customer) => (Object.assign(Object.assign({}, customer), { country: (0, country_index_1.customerCountry)(countryIndex, customer) }))),
            pagination: {
                limit,
                offset,
                total: count !== null && count !== void 0 ? count : 0,
            },
        };
    }
    async getCustomerSummary() {
        const [summary, countryIndex] = await Promise.all([
            this.customerDatabase.getCustomerSummary(),
            (0, country_index_1.getCountryIndex)(),
        ]);
        return Object.assign(Object.assign({}, summary), { countries: countryIndex.counts });
    }
    async getCustomerByPhoneNumber(phoneNumber) {
        const normalizedPhoneNumber = this.normalizePhoneNumber(phoneNumber);
        if (!normalizedPhoneNumber)
            return null;
        return await this.customerDatabase.getCustomerByPhoneNumber(normalizedPhoneNumber);
    }
    async getCustomerById(id) {
        var _a, _b;
        const result = await this.customerDatabase.getCustomerById(id);
        const total_purchases = ((_a = result === null || result === void 0 ? void 0 : result.orders) === null || _a === void 0 ? void 0 : _a.length) || 0;
        const amount_spent = ((_b = result === null || result === void 0 ? void 0 : result.orders) === null || _b === void 0 ? void 0 : _b.reduce((sum, o) => sum + (o.total_amount || 0), 0)) || 0;
        return Object.assign(Object.assign({}, result), { total_purchases,
            amount_spent });
    }
    async createCustomer(data) {
        const phoneNumber = this.normalizePhoneNumber(data.phone_number);
        if (!phoneNumber)
            throw new Error('Invalid phone number');
        const name = data.name ? (0, customerName_1.cleanCustomerName)(data.name) : data.name;
        const customerData = Object.assign(Object.assign(Object.assign({}, data), (data.name !== undefined && { name: name || data.name })), { phone_number: phoneNumber });
        return await this.customerDatabase.upsertCustomer(customerData);
    }
    async updateCustomer(id, updates) {
        if (updates.phone_number) {
            const phoneNumber = this.normalizePhoneNumber(updates.phone_number);
            if (!phoneNumber)
                throw new Error('Invalid phone number');
            updates.phone_number = phoneNumber;
        }
        return await this.customerDatabase.updateCustomer(id, updates);
    }
    async deleteCustomer(id) {
        return await this.customerDatabase.deleteCustomer(id);
    }
    async getAllCustomerIds(options) {
        let filterDate;
        if (options.filter && options.filter !== 'all') {
            const now = new Date();
            filterDate = new Date();
            switch (options.filter) {
                case 'today':
                    filterDate.setHours(0, 0, 0, 0);
                    break;
                case 'week':
                    const dayOfWeek = now.getDay();
                    const diffToMonday = (dayOfWeek + 6) % 7;
                    filterDate.setDate(now.getDate() - diffToMonday);
                    filterDate.setHours(0, 0, 0, 0);
                    break;
                case 'month':
                    filterDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
            }
        }
        return this.customerDatabase.getAllCustomerIds({
            search: options.search,
            filterDate,
            countryFilter: options.country
                ? (0, country_index_1.countryOrFilter)(await (0, country_index_1.getCountryIndex)(), options.country)
                : undefined,
        });
    }
}
exports.default = CustomerService;
