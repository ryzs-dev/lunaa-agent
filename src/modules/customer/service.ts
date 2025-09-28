import { UUID } from "crypto";
import CustomerDatabase from "./database";
import { CustomerInput } from "./types";

class CustomerService {
    private customerDatabase: CustomerDatabase

    constructor() {
        this.customerDatabase = new CustomerDatabase();
    }

    protected normalizePhoneNumber(phoneNumber: string): string | null {
        const digits = phoneNumber.replace(/\D/g, ""); 

        if (!digits) return null;

        // Malaysia
        if (digits.startsWith("60")) {
            return digits; 
        }
        if (digits.startsWith("0")) {
            return `60${digits.substring(1)}`; 
        }

        // Singapore
        if (digits.startsWith("65")) {
            return digits; 
        }
        if (/^[89]\d{7}$/.test(digits)) {
            return `65${digits}`; 
        }

        return null;
    }

    async getAllCustomers(options: {
        limit?: number;
        offset?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: "asc" | "desc";
        }) {
        const limit = !options.limit || options.limit > 100 ? 20 : options.limit;
        const offset = options.offset ?? 0;
        const sortBy = options.sortBy ?? "created_at";
        const sortOrder = options.sortOrder ?? "desc";

        return this.customerDatabase.getAllCustomers({ limit, offset, search: options.search, sortBy, sortOrder });
    }

    async getCustomerByPhoneNumber(phoneNumber: string) {
        const normalizedPhoneNumber = this.normalizePhoneNumber(phoneNumber);
        if (!normalizedPhoneNumber) return null;
        return await this.customerDatabase.getCustomerByPhoneNumber(normalizedPhoneNumber);
    }

    async createCustomer(data: CustomerInput) {
        const phoneNumber = this.normalizePhoneNumber(data.phone_number);
        if (!phoneNumber) throw new Error("Invalid phone number");

        const customerData = {
            ...data,
            phone_number: phoneNumber,
        }
        return await this.customerDatabase.upsertCustomer(customerData);
    }

    async updateCustomer(id:UUID,updates: Partial<CustomerInput>) {
        if (updates.phone_number) {
            const phoneNumber = this.normalizePhoneNumber(updates.phone_number);
            if (!phoneNumber) throw new Error("Invalid phone number");
            updates.phone_number = phoneNumber;
        }
        return await this.customerDatabase.updateCustomer(id, updates);
    }

    async deleteCustomer(id: UUID){
        return await this.customerDatabase.deleteCustomer(id);
    }

}

export default CustomerService;