"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("./database"));
class AddressService {
    constructor() {
        this.addressDatabase = new database_1.default();
    }
    async getAllAddress() {
        return await this.addressDatabase.getAllAddresses();
    }
    async getAddressById(addressId) {
        return await this.addressDatabase.getAddressById(addressId);
    }
    async getAddressesByCustomerId(customerId) {
        return await this.addressDatabase.getAddressesByCustomerId(customerId);
    }
    async createAddress(addressData) {
        return await this.addressDatabase.upsertAddress(addressData);
    }
    ;
    async updateAddress(addressId, updates) {
        return await this.addressDatabase.updateAddress(addressId, updates);
    }
    async deleteAddress(addressId) {
        return await this.addressDatabase.deleteAddress(addressId);
    }
}
exports.default = AddressService;
