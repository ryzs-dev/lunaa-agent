import { promises as fs } from "fs";
import path from "path";
import { Customer } from "../types";
import crypto from "crypto";

import { CustomerService as SupabaseCustomerService } from "../../supabase/services/CustomerService";
import { supabase } from "../../supabase";


export class CustomerService {
  private customers: Map<string, Customer> = new Map();
  private supabaseCustomerService: SupabaseCustomerService;

  constructor() {
    
    this.supabaseCustomerService = new SupabaseCustomerService(supabase);
  }

  private async saveToFile(): Promise<void> {
  try {
    console.log("Saving customers to JSON File...");
    const filePath = path.resolve(__dirname, "../constants/phone_numbers.json");
    const data = Array.from(this.customers.values()).map(c => ({
      name: c.customerName,
      number: c.phoneNumber,
      isRepeatCustomer: c.isRepeatCustomer,
    }));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    console.log("Customers saved to JSON");
  } catch (err) {
    console.error("Failed to save customers:", err);
  }
}


  async init(): Promise<void> {
    try {
      const filePath = path.resolve(__dirname, "../constants/phone_numbers.json");
      const raw = await fs.readFile(filePath, "utf-8");
      const json = JSON.parse(raw);

      json.forEach((entry: { number: string; name: string }) => {
        this.customers.set(entry.number, {
          customerId: crypto.randomUUID(),
          phoneNumber: entry.number,
          customerName: entry.name,
          isRepeatCustomer: 'repeat', // preloaded customers are considered repeat
        });
      });

      console.log(`Loaded ${this.customers.size} customers from JSON`);
    } catch (err) {
      console.error("Failed to load phone_numbers.json:", err);
    }
  }

  async findByPhone(phoneNumber: string): Promise<Customer | undefined> {
    return this.customers.get(phoneNumber);
  }

  async upsertCustomer(parsed: Omit<Customer, "addresses" | "messages" | "isRepeatCustomer" | "customerId">): Promise<Customer> {
  const phone = parsed.phoneNumber;
  let existing = this.customers.get(phone);

  if (existing) {
    existing.isRepeatCustomer = 'repeat';
    this.customers.set(phone, existing);
    await this.saveToFile(); 

    try {
      await this.supabaseCustomerService.upsert(existing)
    } catch (error) {
      throw new Error("Failed to upsert customer to Supabase: " + (error as Error).message);  
    }
 
    return existing;
  }

  type NewCustomerCreateInput = Omit<Customer, "addresses" | "messages">;


  const newCustomer: NewCustomerCreateInput = {
    customerId: crypto.randomUUID(),
    ...parsed,
    isRepeatCustomer: 'new',
  };
  this.customers.set(phone, newCustomer);
  await this.saveToFile(); 


  try {
      await this.supabaseCustomerService.upsert(newCustomer)
    } catch (error) {
      throw new Error("Failed to upsert customer to Supabase: " + (error as Error).message);  
    }

  return newCustomer;
}


  async listAll(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }
}
