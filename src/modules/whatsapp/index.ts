import { ContentExtractor } from "./extractors/ContentExtractor";
import { PhoneExtractor } from "./extractors/PhoneExtractor";
import { CustomerService } from "./services/CustomerService";

(async () => {
  const customerService = new CustomerService();
  await customerService.init(); // wait for JSON to load

  console.log('Customer service initialized');

  const phoneExtractor = new PhoneExtractor(customerService);

  const extractor = new ContentExtractor(phoneExtractor); // pass initialized service

  const message = `
    4/9/25，rpt
    total：216
    khong sieaw mei
    contact: 01126470411
    address: No8,Jalan Mawar Jaya 1-1 ,Taman Mawar Jaya,28300 Triang Pahang Malaysia
    2w2f2s1w30ml1f10ml10b1f30ml
  `;

  const result = await extractor.extractAll(message);
  console.log(result);
})();
