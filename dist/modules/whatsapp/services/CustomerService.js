"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerService = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const CustomerService_1 = require("../../supabase/services/CustomerService");
const supabase_1 = require("../../supabase");
class CustomerService {
    constructor() {
        this.customers = new Map();
        this.supabaseCustomerService = new CustomerService_1.CustomerService(supabase_1.supabase);
    }
    async saveToFile() {
        try {
            console.log('Saving customers to JSON File...');
            const filePath = path_1.default.resolve(__dirname, '../constants/phone_numbers.json');
            const data = Array.from(this.customers.values()).map((c) => ({
                name: c.customerName,
                number: c.phoneNumber,
                isRepeatCustomer: c.isRepeatCustomer,
            }));
            await fs_1.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
            console.log('Customers saved to JSON');
        }
        catch (err) {
            console.error('Failed to save customers:', err);
        }
    }
    async init() {
        try {
            const filePath = path_1.default.resolve(__dirname, '../constants/phone_numbers.json');
            const raw = await fs_1.promises.readFile(filePath, 'utf-8');
            const json = JSON.parse(raw);
            json.forEach((entry) => {
                this.customers.set(entry.number, {
                    customerId: crypto_1.default.randomUUID(),
                    phoneNumber: entry.number,
                    customerName: entry.name,
                    isRepeatCustomer: 'repeat', // preloaded customers are considered repeat
                });
            });
            console.log(`Loaded ${this.customers.size} customers from JSON`);
        }
        catch (err) {
            console.error('Failed to load phone_numbers.json:', err);
        }
    }
    async findByPhone(phoneNumber) {
        return this.customers.get(phoneNumber);
    }
    async upsertCustomer(parsed) {
        const phone = parsed.phoneNumber;
        let existing = this.customers.get(phone);
        if (existing) {
            existing.isRepeatCustomer = 'repeat';
            this.customers.set(phone, existing);
            await this.saveToFile();
            try {
                await this.supabaseCustomerService.upsert(existing);
            }
            catch (error) {
                throw new Error('Failed to upsert customer to Supabase: ' + error.message);
            }
            return existing;
        }
        const newCustomer = Object.assign(Object.assign({ customerId: crypto_1.default.randomUUID() }, parsed), { isRepeatCustomer: 'new' });
        this.customers.set(phone, newCustomer);
        await this.saveToFile();
        try {
            await this.supabaseCustomerService.upsert(newCustomer);
        }
        catch (error) {
            throw new Error('Failed to upsert customer to Supabase: ' + error.message);
        }
        return newCustomer;
    }
    async listAll() {
        return Array.from(this.customers.values());
    }
}
exports.CustomerService = CustomerService;
