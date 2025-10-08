"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
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
        var _a, _b, _c;
        const limit = !options.limit || options.limit > 100 ? 20 : options.limit;
        const offset = (_a = options.offset) !== null && _a !== void 0 ? _a : 0;
        const sortBy = (_b = options.sortBy) !== null && _b !== void 0 ? _b : 'created_at';
        const sortOrder = (_c = options.sortOrder) !== null && _c !== void 0 ? _c : 'desc';
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
        const { customers, count } = await this.customerDatabase.getAllCustomers({
            limit,
            offset,
            search: options.search,
            sortBy,
            sortOrder,
            filterDate,
        });
        return {
            customers,
            pagination: {
                limit,
                offset,
                total: count !== null && count !== void 0 ? count : 0,
            },
        };
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
        console.log('Creating customer with data:', data);
        const phoneNumber = this.normalizePhoneNumber(data.phone_number);
        if (!phoneNumber)
            throw new Error('Invalid phone number');
        const customerData = Object.assign(Object.assign({}, data), { phone_number: phoneNumber });
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
}
exports.default = CustomerService;
