import { GoogleService } from "../services/GoogleService";
import { Customer } from "../types";


export class CustomerService {
  private google: GoogleService;
  private sheetName: string;

  constructor(sheetName: string) {
    this.google = GoogleService.getInstance();
    this.sheetName = sheetName;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const rows = await this.google.readRange(this.sheetName, "A:C");
    // A: ID, B: Phone, C: Name (example)
    for (const row of rows) {
      if (row[1] === phone) {
        return {
          id: row[0],
          phone: row[1],
          name: row[2],
        };
      }
    }
    return null;
  }

  async addCustomer(customer: Customer): Promise<void> {
    await this.google.appendRow([customer.id, customer.phone, customer.name, customer.address ?? ""]);
  }
}
