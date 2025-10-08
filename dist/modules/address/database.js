"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../supabase");
class AddressDatabase {
    async getAllAddresses() {
        const { data: addresses, error } = await supabase_1.supabase.from("addresses").select("*");
        if (error)
            throw error;
        return addresses;
    }
    async getAddressById(addressId) {
        const { data: address, error } = await supabase_1.supabase.from("addresses").select("*").eq("id", addressId).single();
        if (error)
            throw error;
        return address;
    }
    async getAddressesByCustomerId(customerId) {
        const { data: addresses, error } = await supabase_1.supabase.from("addresses").select("*").eq("customer_id", customerId);
        if (error)
            throw error;
        return addresses;
    }
    async getAddressesByOrderId(orderId) {
        const { data: addresses, error } = await supabase_1.supabase.from("orders").select("*, addresses(*)").eq("id", orderId);
        if (error)
            throw error;
        return addresses;
    }
    async upsertAddress(addressData) {
        const { data: address, error } = await supabase_1.supabase.from("addresses").upsert([addressData]).select("*").single();
        if (error)
            throw error;
        return address;
    }
    async deleteAddress(addressId) {
        const { data: address, error } = await supabase_1.supabase.from("addresses").delete().eq("id", addressId).single();
        if (error)
            throw error;
        return address;
    }
    async updateAddress(addressId, updates) {
        const { data: address, error } = await supabase_1.supabase.from("addresses").update(updates).eq("id", addressId).select("*").single();
        if (error)
            throw error;
        return address;
    }
}
exports.default = AddressDatabase;
