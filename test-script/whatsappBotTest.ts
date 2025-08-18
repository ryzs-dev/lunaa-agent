// test/whatsappBotTest.ts
import path from "path";
import dotenv from "dotenv";
import assert from "assert";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import {
  extractOrderFromMessage,
  createSheetRowData,
} from "../src/whatsappOrderBot";

function logExtracted(result: any) {
  console.log("📋 Extracted data:");
  console.log(`   Order Date: ${result.orderDate}`);
  console.log(`   Customer: ${result.customerName}`);
  console.log(`   Phone: ${result.phoneNumber}`);
  console.log(`   Total Paid: RM${result.totalPaid}`);
  console.log(`   Products:`);
  result.products.forEach((product: any) => {
    console.log(`     - ${product.quantity}x ${product.name} ${product.type}`);
  });
  console.log(`   Address: ${result.address}`);
  console.log(`   City: ${result.city}`);
  console.log(`   Postcode: ${result.postcode}`);
  console.log(`   State: ${result.state}`);
  console.log(`   Remark: ${result.remark}`);
}

export function testWhatsAppOrderExtraction() {
  console.log("🧪 Testing WhatsApp order extraction...\n");

  // === Test 1: Standard order ===
  const msg1 = `6/8/2025
total：256
THAN SIEW PHENG 
019-4419638 
6 Lorong Vila Indah 7,
14300 Nibong Tebal, 
Pulau Pinang.
1w1f1s1w30ml`;

  const result1 = extractOrderFromMessage(msg1, {
    customerPhone: "601126470411",
    customerName: "THAN SIEW PHENG",
  });

  assert(result1, "Extraction failed for Test 1");
  assert.strictEqual(result1?.postcode, "14300", "Postcode mismatch in Test 1");
  assert.strictEqual(result1?.state, "Penang", "State mismatch in Test 1");

  console.log("✅ Test 1 passed!");
  logExtracted(result1);

  // === Test 2: Chinese format ===
  const msg2 = `8/8/2025
total：198
汇款人名字：CHOW MEI LING
收件人名字：NICOLE CHOW
电话号码：0126675705
地址： C15-2-2, Bayan Villa, Jalan BS2/5, Taman Bukit Serdang, 43300 Seri Kembangan, Selangor.
2f1w30ml`;

  const result2 = extractOrderFromMessage(msg2, {
    customerPhone: "601126470411",
    customerName: "NICOLE CHOW",
  });

  assert(result2, "Extraction failed for Chinese format");
  assert.strictEqual(result2?.postcode, "43300");
  assert.strictEqual(result2?.city, "Seri Kembangan");

  console.log("✅ Test 2 (Chinese format) passed!");
  logExtracted(result2);

  // === Test 3: No commas in address ===
  const msg3 = `7/8/2025
total: 120
ALI BIN ABU
0139988777
No 12 Jalan Aman Taman Indah 43000 Kajang Selangor
1w`;

  const result3 = extractOrderFromMessage(msg3, {
    customerPhone: "601126470411",
    customerName: "ALI BIN ABU",
  });

  assert(result3, "Extraction failed for no-comma address");
  assert.strictEqual(result3?.postcode, "43000");
  assert.strictEqual(result3?.city, "Kajang");

  console.log("✅ Test 3 (no commas) passed!");
  logExtracted(result3);

  // === Test 4: Landline number ===
  const msg4 = `8/8/2025
total：300
LEE WEI MING
03-98765432
456 Taman Megah,
47500 Subang Jaya,
Selangor.
3w2f2s`;

  const result4 = extractOrderFromMessage(msg4, {
    customerPhone: "601126470411",
    customerName: "LEE WEI MING",
  });

  assert(result4, "Extraction failed for landline");
  assert.strictEqual(result4?.postcode, "47500");
  assert.strictEqual(result4?.city, "Subang Jaya");

  console.log("✅ Test 4 (landline) passed!");
  logExtracted(result4);
}

export function testSheetRowCreation() {
  console.log("\n🧪 Testing Google Sheets row creation...\n");

  const headers = [
    "No",
    "Order Date",
    "fbname",
    "Name",
    "Payment method",
    "wash",
    "Femlift 30ml",
    "Femlift 10ml",
    "Wash 30ml",
    "Spray",
    "remark",
    "package (rm)",
    "Postage (rm)",
    "Website/shopee charges (rm)",
    "TOTAL PAID (rm)",
    "shipment description",
    "address",
    "city",
    "postcode",
    "state",
    "phone number",
    "tracking number",
    "courires company",
    "new/repeat",
    "cash sale receipt",
    "Agent by / under",
    "sql system",
    "currency",
    "status",
  ];

  const mockOrder = {
    orderDate: "2025-08-06",
    customerName: "THAN SIEW PHENG",
    phoneNumber: "601126470411",
    totalPaid: 256,
    products: [
      { name: "wash", quantity: 1, type: "" },
      { name: "femlift_30ml", quantity: 1, type: "30ml" },
      { name: "spray", quantity: 1, type: "" },
      { name: "wash_30ml", quantity: 1, type: "30ml" },
    ],
    address: "6 Lorong Vila Indah 7, 14300 Nibong Tebal, Pulau Pinang.",
    city: "Nibong Tebal",
    postcode: "14300",
    state: "Penang",
    remark: "Order from WhatsApp",
  };

  const rowData = createSheetRowData(mockOrder, headers);

  assert.strictEqual(rowData.length, headers.length, "Row length mismatch");
  assert.strictEqual(rowData[1], mockOrder.orderDate);
  assert.strictEqual(rowData[3], mockOrder.customerName);
  assert.strictEqual(rowData[14], mockOrder.totalPaid);

  console.log("✅ Sheet row creation passed!");
  console.log("📋 Row preview:");
  headers.forEach((header, i) => {
    if (rowData[i]) {
      console.log(`   ${header}: ${rowData[i]}`);
    }
  });
}

// Run tests if executed directly
if (require.main === module) {
  testWhatsAppOrderExtraction();
  testSheetRowCreation();
}
