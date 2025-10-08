import { SupabaseClient } from "@supabase/supabase-js"
import { Address } from "../../whatsapp/types"

export class AddressService {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  /**
   * Create an address for a customer
   */
  async createAddress(addressData: {
    customerId: string
    addressLine1: string
    addressLine2?: string
    city?: string
    postcode?: string
    state?: string
    country?: string
  }): Promise<Address | null> {
    try {
      if (!addressData.addressLine1) {
        return null // No address provided
      }

      console.log(`📝 Creating address for customer ${addressData.customerId}`)

      const { data: newAddress, error } = await this.supabase
        .from("addresses")
        .insert({
          customer_id: addressData.customerId,
          address_line_1: addressData.addressLine1,
          address_line_2: addressData.addressLine2 ?? null,
          city: addressData.city ?? null,
          postcode: addressData.postcode ?? null,
          state: addressData.state ?? null,
          country: addressData.country ?? "Malaysia",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single()

      if (error) {
        console.error("❌ Failed to create address:", error)
        throw error
      }

      console.log(`✅ Created address (ID: ${newAddress.address_id})`)
      return this.mapToAddress(newAddress)
    } catch (error) {
      console.error("❌ Error in createAddress:", error)
      throw error
    }
  }

  /**
   * Update an existing address by addressId
   */
  async updateAddress(addressId: string, updates: Partial<Address>): Promise<Address | null> {
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
        .single()

      if (error) {
        console.error("❌ Failed to update address:", error)
        throw error
      }

      return this.mapToAddress(data)
    } catch (error) {
      console.error("❌ Error in updateAddress:", error)
      throw error
    }
  }

  /**
   * Get all addresses for a customer
   */
  async getCustomerAddresses(customerId: string): Promise<Address[]> {
    try {
      const { data, error } = await this.supabase
        .from("addresses")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("❌ Failed to get customer addresses:", error)
        throw error
      }

      return data?.map(this.mapToAddress) ?? []
    } catch (error) {
      console.error("❌ Error in getCustomerAddresses:", error)
      return []
    }
  }

  /**
   * Delete an address
   */
  async deleteAddress(addressId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("addresses")
        .delete()
        .eq("address_id", addressId)

      if (error) {
        console.error("❌ Failed to delete address:", error)
        throw error
      }

      console.log(`🗑️ Deleted address ${addressId}`)
      return true
    } catch (error) {
      console.error("❌ Error in deleteAddress:", error)
      return false
    }
  }

  /**
   * Helper: map DB row to Address interface
   */
  private mapToAddress(row: any): Address {
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
    }
  }
}
