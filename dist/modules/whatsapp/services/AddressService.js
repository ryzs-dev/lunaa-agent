"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressService = void 0;
const AddressService_1 = require("../../supabase/services/AddressService");
const supabase_1 = require("../../supabase");
class AddressService {
    constructor() {
        this.supabaseAddressService = new AddressService_1.AddressService(supabase_1.supabase);
    }
    async handleExtractedAddress(customerId, extracted) {
        if (!extracted.address) {
            console.log("⚠️ No address extracted, skipping...");
            return null;
        }
        // Clean/normalize data if needed
        const normalized = {
            customerId: String(customerId) || "",
            addressLine1: extracted.address || "",
            addressLine2: extracted.addressLine2 || "",
            city: extracted.city || "",
            postcode: extracted.postcode || "",
            state: extracted.state || "",
            country: extracted.country || "Malaysia",
        };
        return await this.supabaseAddressService.createAddress(normalized);
    }
}
exports.AddressService = AddressService;
