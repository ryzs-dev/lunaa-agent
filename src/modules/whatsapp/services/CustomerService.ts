import { promises as fs } from "fs";
import path from "path";
import { Customer } from "../types";
import crypto from "crypto";

export class CustomerService {
  private customers: Map<string, Customer> = new Map();

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
          addresses: [],
          messages: [],
          isRepeatCustomer: true, // preloaded customers are considered repeat
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

  async upsertCustomer(parsed: Omit<Customer, "isRepeatCustomer" | "customerId">): Promise<Customer> {
    const phone = parsed.phoneNumber;
    let existing = this.customers.get(phone);

    if (existing) {
      existing.isRepeatCustomer = true;
      existing.messages.push(...parsed.messages);
      existing.addresses.push(...parsed.addresses);
      this.customers.set(phone, existing);
      return existing;
    }

    const newCustomer: Customer = {
      customerId: crypto.randomUUID(),
      ...parsed,
      isRepeatCustomer: false,
    };
    this.customers.set(phone, newCustomer);
    return newCustomer;
  }

  async listAll(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }
}
