"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressService = void 0;
class AddressService {
    constructor(supabase) {
        this.supabase = supabase;
    }
    /**
     * Create an address for a customer
     */
    async createAddress(addressData) {
        var _a, _b, _c, _d, _e;
        try {
            if (!addressData.addressLine1) {
                return null; // No address provided
            }
            console.log(`📝 Creating address for customer ${addressData.customerId}`);
            const { data: newAddress, error } = await this.supabase
                .from("addresses")
                .insert({
                customer_id: addressData.customerId,
                address_line_1: addressData.addressLine1,
                address_line_2: (_a = addressData.addressLine2) !== null && _a !== void 0 ? _a : null,
                city: (_b = addressData.city) !== null && _b !== void 0 ? _b : null,
                postcode: (_c = addressData.postcode) !== null && _c !== void 0 ? _c : null,
                state: (_d = addressData.state) !== null && _d !== void 0 ? _d : null,
                country: (_e = addressData.country) !== null && _e !== void 0 ? _e : "Malaysia",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
                .select("*")
                .single();
            if (error) {
                console.error("❌ Failed to create address:", error);
                throw error;
            }
            console.log(`✅ Created address (ID: ${newAddress.address_id})`);
            return this.mapToAddress(newAddress);
        }
        catch (error) {
            console.error("❌ Error in createAddress:", error);
            throw error;
        }
    }
    /**
     * Update an existing address by addressId
     */
    async updateAddress(addressId, updates) {
        try {
            const { data, error } = await this.supabase
                .from("addresses")
                .update({
                address_line_1: updates.addressLine1,
                address_line_2: updates.addressLine2,
                city: updates.city,
                state: updates.state,
                postcode: updates.postcode,
                country: updates.country,
                updated_at: new Date().toISOString(),
            })
                .eq("address_id", addressId)
                .select("*")
                .single();
            if (error) {
                console.error("❌ Failed to update address:", error);
                throw error;
            }
            return this.mapToAddress(data);
        }
        catch (error) {
            console.error("❌ Error in updateAddress:", error);
            throw error;
        }
    }
    /**
     * Get all addresses for a customer
     */
    async getCustomerAddresses(customerId) {
        var _a;
        try {
            const { data, error } = await this.supabase
                .from("addresses")
                .select("*")
                .eq("customer_id", customerId)
                .order("created_at", { ascending: false });
            if (error) {
                console.error("❌ Failed to get customer addresses:", error);
                throw error;
            }
            return (_a = data === null || data === void 0 ? void 0 : data.map(this.mapToAddress)) !== null && _a !== void 0 ? _a : [];
        }
        catch (error) {
            console.error("❌ Error in getCustomerAddresses:", error);
            return [];
        }
    }
    /**
     * Delete an address
     */
    async deleteAddress(addressId) {
        try {
            const { error } = await this.supabase
                .from("addresses")
                .delete()
                .eq("address_id", addressId);
            if (error) {
                console.error("❌ Failed to delete address:", error);
                throw error;
            }
            console.log(`🗑️ Deleted address ${addressId}`);
            return true;
        }
        catch (error) {
            console.error("❌ Error in deleteAddress:", error);
            return false;
        }
    }
    /**
     * Helper: map DB row to Address interface
     */
    mapToAddress(row) {
        return {
            addressId: row.address_id,
            customerId: row.customer_id,
            addressLine1: row.address_line_1,
            addressLine2: row.address_line_2,
            city: row.city,
            state: row.state,
            postcode: row.postcode,
            country: row.country,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
exports.AddressService = AddressService;
