"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
const phone_1 = require("../shared/phone");
const supabase_1 = require("../supabase");
class DistributorService {
    constructor() {
        this.distributorDatabase = new database_1.default();
    }
    async getAllDistributors() {
        const [distributors, counts] = await Promise.all([
            this.distributorDatabase.getAllDistributors(),
            this.distributorDatabase.getOrderCounts(),
        ]);
        return distributors.map((distributor) => {
            var _a;
            return (Object.assign(Object.assign({}, distributor), { order_count: (_a = counts[distributor.phone_number]) !== null && _a !== void 0 ? _a : 0 }));
        });
    }
    async isDistributorPhone(phoneNumber) {
        if (!phoneNumber)
            return false;
        const normalized = (0, phone_1.normalizePhoneNumber)(phoneNumber);
        if (!normalized)
            return false;
        const distributor = await this.distributorDatabase.getDistributorByPhoneNumber(normalized);
        return Boolean(distributor);
    }
    async isDistributorCustomer(customerId) {
        if (!customerId)
            return false;
        const { data: customer, error } = await supabase_1.supabase
            .from('customers')
            .select('phone_number')
            .eq('id', customerId)
            .maybeSingle();
        if (error)
            throw error;
        return this.isDistributorPhone(customer === null || customer === void 0 ? void 0 : customer.phone_number);
    }
    async createDistributor(data) {
        var _a, _b;
        const phoneNumber = (0, phone_1.normalizePhoneNumber)(data.phone_number);
        if (!phoneNumber)
            throw new Error('Invalid phone number');
        const distributor = await this.distributorDatabase.upsertDistributor({
            name: ((_a = data.name) === null || _a === void 0 ? void 0 : _a.trim()) || undefined,
            notes: ((_b = data.notes) === null || _b === void 0 ? void 0 : _b.trim()) || undefined,
            phone_number: phoneNumber,
        });
        const movedOrders = await this.distributorDatabase.setOrdersDistributorFlag(phoneNumber, true);
        return { distributor, movedOrders };
    }
    async deleteDistributor(id) {
        const distributor = await this.distributorDatabase.getDistributorById(id);
        if (!distributor)
            return null;
        await this.distributorDatabase.deleteDistributor(id);
        const movedOrders = await this.distributorDatabase.setOrdersDistributorFlag(distributor.phone_number, false);
        return { distributor, movedOrders };
    }
}
exports.default = DistributorService;
