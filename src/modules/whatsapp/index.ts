import { ContentExtractor } from "./extractors/ContentExtractor";
import { PhoneExtractor } from "./extractors/PhoneExtractor";
import { CustomerService } from "./services/CustomerService";

(async () => {
  const customerService = new CustomerService();
  await customerService.init(); // wait for JSON to load

  console.log('Customer service initialized');

  const phoneExtractor = new PhoneExtractor(customerService);

  const extractor = new ContentExtractor(phoneExtractor); 

  const message = `
5/9/25
Total: 185

Name: Amirul (Deliver by 9/9)

Contact: 0123456789

Address: No. 12, Jalan Merpati 5, Taman Bukit Indah, 81200 Johor Bahru, Johor

Items: 2w2f
  `;

  const result = await extractor.extractAll(message);
  console.log(result);

  if (result.contact) {
  try {
    await customerService.upsertCustomer({
      phoneNumber: result.contact,
      customerName: result.name || '',
      addresses: result.address ? [{
        addressLine1: result.address.address || '',
        postcode: result.address.postcode || '',
        state: result.address.state || '',
        country: result.address.country || ''
      }] : [],
      messages: [{
        messageId: Date.now().toString(),
        customerPhone: result.contact,
        content: message,
        timestamp: new Date(),
        customerId: result.contact
      }],
    });
  } catch (error) {
    console.error("Failed to upsert customer:", error);
  }
}

})();



