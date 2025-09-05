import { AddressExtractor } from "./AddressExtractor";
import { AmountExtractor } from "./AmountExtractor";
import { DateExtractor } from "./DateExtractor";
import { NameExtractor } from "./NameExtractor";
import { PaymentMethodExtractor } from "./PaymentMethodExtractor";
import { PhoneExtractor } from "./PhoneExtractor";
import { ProductExtractor } from "./ProductExtractor";

export class ContentExtractor {
  private amountExtractor = new AmountExtractor();
  private paymentMethodExtractor = new PaymentMethodExtractor();
  private dateExtractor = new DateExtractor();
  private nameExtractor = new NameExtractor();
  private phoneExtractor: PhoneExtractor;
  private addressExtractor = new AddressExtractor();
  private productExtractor = new ProductExtractor();

  constructor(phoneExtractor: PhoneExtractor) {
    this.phoneExtractor = phoneExtractor
  }

  async extractAll(text: string) {
    const phoneNumber = this.phoneExtractor.extract(text);
    const isRepeat = phoneNumber ? await this.phoneExtractor.isRepeat(text) : false;

    return {
      total: this.amountExtractor.extract(text),
      paymentMethod: this.paymentMethodExtractor.extract(text),
      date: this.dateExtractor.extract(text),
      name: this.nameExtractor.extract(text),
      contact: phoneNumber,
      address: this.addressExtractor.extract(text),
      products: this.productExtractor.extract(text),
      repeatCustomer: isRepeat,
    };
  }
}
