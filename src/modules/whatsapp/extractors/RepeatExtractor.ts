import { CustomerService } from "../services/CustomerService";

export class RepeatExtractor {
  private customerService: CustomerService;

  constructor(customerService: CustomerService) {
    this.customerService = customerService;
    console.log("CustomerService initialized in RepeatExtractor");
  }


  async isRepeat(phoneNumber: string): Promise<boolean> {
    if (!phoneNumber) return false;
    const customer = await this.customerService.findByPhone(phoneNumber);
    return customer !== undefined;
  }
}
