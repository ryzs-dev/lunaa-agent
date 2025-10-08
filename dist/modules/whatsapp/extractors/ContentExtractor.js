"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentExtractor = void 0;
const AddressExtractor_1 = require("./AddressExtractor");
const AmountExtractor_1 = require("./AmountExtractor");
const DateExtractor_1 = require("./DateExtractor");
const EmailExtractor_1 = require("./EmailExtractor");
const NameExtractor_1 = require("./NameExtractor");
const PaymentMethodExtractor_1 = require("./PaymentMethodExtractor");
const ProductExtractor_1 = require("./ProductExtractor");
class ContentExtractor {
    constructor(phoneExtractor) {
        this.amountExtractor = new AmountExtractor_1.AmountExtractor();
        this.paymentMethodExtractor = new PaymentMethodExtractor_1.PaymentMethodExtractor();
        this.dateExtractor = new DateExtractor_1.DateExtractor();
        this.nameExtractor = new NameExtractor_1.NameExtractor();
        this.addressExtractor = new AddressExtractor_1.AddressExtractor();
        this.productExtractor = new ProductExtractor_1.ProductExtractor();
        this.emailExtractor = new EmailExtractor_1.EmailExtractor();
        this.phoneExtractor = phoneExtractor;
    }
    async extractAll(text) {
        const phoneNumber = this.phoneExtractor.extract(text);
        const isRepeat = phoneNumber ? await this.phoneExtractor.isRepeat(text) : false;
        return {
            total: this.amountExtractor.extract(text),
            paymentMethod: this.paymentMethodExtractor.extract(text),
            date: this.dateExtractor.extract(text),
            name: this.nameExtractor.extract(text),
            email: this.emailExtractor.extract(text),
            contact: phoneNumber,
            address: this.addressExtractor.extract(text),
            products: this.productExtractor.extract(text),
            repeatCustomer: isRepeat ? "repeat" : "new",
        };
    }
}
exports.ContentExtractor = ContentExtractor;
