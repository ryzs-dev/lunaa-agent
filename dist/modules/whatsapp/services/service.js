"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappService = void 0;
const service_1 = __importDefault(require("../../orders/service"));
const ContentExtractor_1 = require("../extractors/ContentExtractor");
const PhoneExtractor_1 = require("../extractors/PhoneExtractor");
const AddressService_1 = require("./AddressService");
const CustomerService_1 = require("./CustomerService");
class WhatsappService {
    constructor() {
        this.customerService = new CustomerService_1.CustomerService();
        this.customerService.init();
        this.phoneExtractor = new PhoneExtractor_1.PhoneExtractor(this.customerService);
        this.extractor = new ContentExtractor_1.ContentExtractor(this.phoneExtractor);
        this.addressService = new AddressService_1.AddressService();
        this.orderService = new service_1.default();
    }
    async handleMessageExtraction(msg) {
        var _a, _b, _c, _d, _e, _f, _g;
        console.log('✅ Customer service initialized');
        if (!((_a = msg.text) === null || _a === void 0 ? void 0 : _a.body)) {
            console.log('⚠️ No text body in message to extract');
            return;
        }
        const body = (_b = msg.text) === null || _b === void 0 ? void 0 : _b.body;
        const result = await this.extractor.extractAll(body);
        const customerData = {
            name: result.name || '',
            phone_number: result.contact || '',
            email: result.email || '',
            repeat_customer: result.repeatCustomer || 'new',
        };
        const contactData = {
            wa_id: result.contact || '',
            profile_name: result.name || '',
            phone_number: result.contact || '',
        };
        const addressData = {
            full_address: ((_c = result === null || result === void 0 ? void 0 : result.address) === null || _c === void 0 ? void 0 : _c.address) || '',
            postcode: ((_d = result === null || result === void 0 ? void 0 : result.address) === null || _d === void 0 ? void 0 : _d.postcode) || '',
            city: ((_e = result === null || result === void 0 ? void 0 : result.address) === null || _e === void 0 ? void 0 : _e.city) || '',
            state: (_f = result === null || result === void 0 ? void 0 : result.address) === null || _f === void 0 ? void 0 : _f.state,
            country: ((_g = result === null || result === void 0 ? void 0 : result.address) === null || _g === void 0 ? void 0 : _g.country) || '',
        };
        const orderData = {
            order_date: result.date || new Date().toISOString().split('T')[0],
            status: 'pending',
            total_amount: result.total || 0,
            payment_method: result.paymentMethod || '',
        };
        const orderItemsData = (result.products || []).map((p) => ({
            product_name: p.name,
            quantity: p.quantity,
        }));
        const customer = await this.customerService.upsertCustomer(customerData);
        const contact = await this.customerService.upsertContact({ waId: contactData.wa_id, profileName: contactData.profile_name }, customer.id);
        const address = await this.addressService.upsertAddress(customer.id, addressData);
        const order = await this.orderService.upsertOrder(customer.id, (address === null || address === void 0 ? void 0 : address.id) || null, orderData);
        await this.upsertOrderItems(order.id, orderItemsData);
    }
}
exports.WhatsappService = WhatsappService;
