import { UUID } from "crypto";
import AddressDatabase from "./database";
import { AddressInput } from "./types";

class AddressService {
    private addressDatabase: AddressDatabase

    constructor() {
        this.addressDatabase = new AddressDatabase();
    }

    async getAllAddress() {
        return await this.addressDatabase.getAllAddresses();
    }

    async getAddressById(addressId: UUID) {
        return await this.addressDatabase.getAddressById(addressId);
    }

    async getAddressesByCustomerId(customerId: UUID) {
        return await this.addressDatabase.getAddressesByCustomerId(customerId);
    }

    async createAddress(addressData: AddressInput) {
        return await this.addressDatabase.upsertAddress(addressData);
    };

    async updateAddress(addressId: UUID, updates: Partial<AddressInput>) {
        return await this.addressDatabase.updateAddress(addressId, updates);
    }

    async deleteAddress(addressId: UUID) {
        return await this.addressDatabase.deleteAddress(addressId);
    }
}

export default AddressService;