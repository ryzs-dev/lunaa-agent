import { ContentExtractor } from "./extractors/ContentExtractor";
import { PhoneExtractor } from "./extractors/PhoneExtractor";
import { CustomerService } from "./services/CustomerService";
import { AddressService } from "./services/AddressService"; // 👈 new service

(async () => {
  const customerService = new CustomerService();
  await customerService.init(); // wait for JSON to load
  console.log("✅ Customer service initialized");

  const phoneExtractor = new PhoneExtractor(customerService);
  const extractor = new ContentExtractor(phoneExtractor);
  const addressService = new AddressService(); // 👈 init WhatsApp Address service

  const message = `
5/9/25
Total: 185

Name: Amirul (Deliver by 9/9)

Contact: 0123456789

Address: No. 12, Jalan Merpati 5, Taman Bukit Indah, 81200 Johor Bahru, Johor

Items: 2w2f
  `;

  // Step 1: Extract from message
  const result = await extractor.extractAll(message);
  console.log("📦 Extracted:", result);

  if (result.contact) {
    try {
      // Step 2: Upsert customer
      // const customer = await customerService.upsertCustomer({
      //   phoneNumber: result.contact,
      //   customerName: result.name || "",
      // });

      // console.log("✅ Customer upserted:", customer);

      // Step 3: Upsert address
      // if (result.address) {
      //   const newAddress = await addressService.handleExtractedAddress(
      //   customer.customerId, 
      //     {
      //       address: result.address,
      //       postcode: result.address.postcode,
      //       state: result.address.state,
      //       country: result.address.country
      //     }
      //   );

      //   if (newAddress) {
      //     console.log("✅ Address upserted:", newAddress);
      //   } else {
      //     console.log("⚠️ No address found in message");
      //   }
      // }

      if(result.products){
        console.log("🛒 Products extracted:", result.products);

      }
    } catch (error) {
      console.error("❌ Failed to upsert customer/address:", error);
    }
  }
})();
