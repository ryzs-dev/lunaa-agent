import { AddressService as SupabaseAddressService } from "../../supabase/services/AddressService";
import { supabase } from "../../supabase";


export class AddressService {
  private supabaseAddressService: SupabaseAddressService;

  constructor() {
    this.supabaseAddressService = new SupabaseAddressService(supabase);
  }

  async handleExtractedAddress(customerId: string, extracted: any) {
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
