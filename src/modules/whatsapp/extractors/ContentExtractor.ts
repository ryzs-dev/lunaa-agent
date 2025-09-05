import { AddressExtractor } from "./AddressExtractor";
import { AmountExtractor } from "./AmountExtractor";
import { DateExtractor } from "./DateExtractor";
import { NameExtractor } from "./NameExtractor";
import { PaymentMethodExtractor } from "./PaymentMethodExtractor";
import { PhoneExtractor } from "./PhoneExtractor";
import { ProductExtractor } from "./ProductExtractor";
import { RepeatExtractor } from "./RepeatExtractor";
import { CustomerService } from "../services/CustomerService";

export class ContentExtractor {
  private amountExtractor = new AmountExtractor();
  private paymentMethodExtractor = new PaymentMethodExtractor();
  private dateExtractor = new DateExtractor();
  private nameExtractor = new NameExtractor();
  private phoneExtractor = new PhoneExtractor();
  private addressExtractor = new AddressExtractor(); 
  private productExtractor = new ProductExtractor();
  private repeatExtractor: RepeatExtractor;

  constructor(customerService?: CustomerService) {
    // inject dependency here
    this.repeatExtractor = new RepeatExtractor(customerService);
  }

  async extractAll(text: string) {
    const phoneNumber = this.phoneExtractor.extract(text);

    const repeatCustomer = phoneNumber
      ? await this.repeatExtractor.extract(phoneNumber, text)
      : false;

    return {
      total: this.amountExtractor.extract(text),
      paymentMethod: this.paymentMethodExtractor.extract(text),
      date: this.dateExtractor.extract(text),
      name: this.nameExtractor.extract(text),
      contact: phoneNumber,
      address: this.addressExtractor.extract(text),
      products: this.productExtractor.extract(text),
      isRepeatCustomer: repeatCustomer,
    };
  }
}
