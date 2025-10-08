"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepeatExtractor = void 0;
class RepeatExtractor {
    constructor(customerService) {
        this.customerService = customerService;
        console.log("CustomerService initialized in RepeatExtractor");
    }
    async isRepeat(phoneNumber) {
        if (!phoneNumber)
            return false;
        const customer = await this.customerService.findByPhone(phoneNumber);
        return customer !== undefined;
    }
}
exports.RepeatExtractor = RepeatExtractor;
