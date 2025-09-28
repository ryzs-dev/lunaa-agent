import { UUID } from "crypto";
import { supabase } from "../supabase";
import { AddressInput } from "./types";

class AddressDatabase {
    async getAllAddresses(){
        const { data: addresses, error } = await supabase.from("addresses").select("*");
        if (error) throw error;
        return addresses;
    }

    async getAddressById(addressId:UUID) {
        const { data: address, error } = await supabase.from("addresses").select("*").eq("id", addressId).single();
        if (error) throw error;
        return address;
    }

    async getAddressesByCustomerId(customerId:UUID){
        const { data: addresses, error } = await supabase.from("addresses").select("*").eq("customer_id", customerId);
        if (error) throw error;
        return addresses;
    }

    async getAddressesByOrderId(orderId:UUID){
        const { data: addresses, error } = await supabase.from("orders").select("*, addresses(*)").eq("id", orderId);
        if (error) throw error;
        return addresses;
    }

    async upsertAddress(addressData: AddressInput) {
        const { data:address, error } = await supabase.from("addresses").upsert([addressData]).select("*").single();
        if (error) throw error;
        return address;
    }

    async deleteAddress(addressId:UUID){
        const { data: address, error } = await supabase.from("addresses").delete().eq("id", addressId).single();
        if (error) throw error;
        return address;
    }

    async updateAddress(addressId:UUID, updates: Partial<AddressInput>){
        const { data: address, error } = await supabase.from("addresses").update(updates).eq("id", addressId).select("*").single();
        if (error) throw error;
        return address;
    }
}

export default AddressDatabase;