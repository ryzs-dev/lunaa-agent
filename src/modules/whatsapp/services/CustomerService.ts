import { Customer } from "../types"

export class CustomerService {
  existsByPhone(phone: string): boolean | PromiseLike<boolean> {
      throw new Error("Method not implemented.")
  }
  private customers: Map<string, Customer> = new Map() // in-memory store for now

  async upsertCustomer(parsed: Omit<Customer, "isRepeatCustomer" | "customerId">): Promise<Customer> {
    const phone = parsed.phoneNumber
    let existing = this.customers.get(phone)

    if (existing) {
      existing.isRepeatCustomer = true
      existing.messages.push(...parsed.messages)
      existing.addresses.push(...parsed.addresses)
      this.customers.set(phone, existing)
      return existing
    }

    const newCustomer: Customer = {
      customerId: crypto.randomUUID(),
      ...parsed,
      isRepeatCustomer: false,
    }
    this.customers.set(phone, newCustomer)
    return newCustomer
  }

  async findByPhone(phoneNumber: string): Promise<Customer | undefined> {
    return this.customers.get(phoneNumber)
  }

  async listAll(): Promise<Customer[]> {
    return Array.from(this.customers.values())
  }
}
