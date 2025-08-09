// test/whatsappBotTest.ts
import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { extractOrderFromMessage } from "../src/whatsappOrderBot";

/**
 * Test function to verify message parsing
 */
export function testWhatsAppOrderExtraction() {
  console.log("🧪 Testing WhatsApp order extraction...\n");

  const testMessage = `6/8/2025
total：256
THAN SIEW PHENG 
019-4419638 
6 Lorong Vila Indah 7,
14300 Nibong Tebal, 
Pulau Pinang.
1w1f1s1w30ml`;

  const context = {
    customerPhone: "60194419638",
    customerName: "THAN SIEW PHENG",
    groupName: "Test Group",
    messageId: "test_msg_123",
    timestamp: new Date().toISOString(),
  };

  const result = extractOrderFromMessage(testMessage, context);

  if (result) {
    console.log("✅ Extraction successful!");
    console.log("📋 Extracted data:");
    console.log(`   Order Date: ${result.orderDate}`);
    console.log(`   Customer: ${result.customerName}`);
    console.log(`   Phone: ${result.phoneNumber}`);
    console.log(`   Total Paid: RM${result.totalPaid}`);
    console.log(`   Products:`);
    result.products.forEach((product) => {
      console.log(
        `     - ${product.quantity}x ${product.name} ${product.type}`
      );
    });
    console.log(`   Address: ${result.address}`);
    console.log(`   City: ${result.city}`);
    console.log(`   Postcode: ${result.postcode}`);
    console.log(`   State: ${result.state}`);
    console.log(`   Remark: ${result.remark}`);
  } else {
    console.log("❌ Extraction failed!");
  }

  // Test Chinese format message
  console.log("\n🧪 Testing Chinese format message...\n");

  const chineseMessage = `8/8/2025
total：198
汇款人名字：CHOW MEI LING
收件人名字：NICOLE CHOW
电话号码：0126675705
地址： C15-2-2, Bayan Villa, Jalan BS2/5, Taman Bukit Serdang, 43300 Seri Kembangan, Selangor.
2f1w30ml`;

  const chineseContext = {
    customerPhone: "60126675705",
    customerName: "NICOLE CHOW",
    groupName: "Test Group",
    messageId: "test_msg_chinese",
    timestamp: new Date().toISOString(),
  };

  const chineseResult = extractOrderFromMessage(chineseMessage, chineseContext);

  if (chineseResult) {
    console.log("✅ Chinese format extraction successful!");
    console.log("📋 Extracted data:");
    console.log(`   Order Date: ${chineseResult.orderDate}`);
    console.log(`   Customer (Receiver): ${chineseResult.customerName}`);
    console.log(`   Phone: ${chineseResult.phoneNumber}`);
    console.log(`   Total Paid: RM${chineseResult.totalPaid}`);
    console.log(`   Products:`);
    chineseResult.products.forEach((product) => {
      console.log(
        `     - ${product.quantity}x ${product.name} ${product.type}`
      );
    });
    console.log(`   Address: ${chineseResult.address}`);
    console.log(`   City: ${chineseResult.city}`);
    console.log(`   Postcode: ${chineseResult.postcode}`);
    console.log(`   State: ${chineseResult.state}`);
    console.log(`   Remark: ${chineseResult.remark}`);
  } else {
    console.log("❌ Chinese format extraction failed!");
  }

  const edgeCase1 = `7/8/2025
total：150
AHMAD BIN ALI
012-3456789
123 Jalan Main,
50000 Kuala Lumpur.
2w1f`;

  const result2 = extractOrderFromMessage(edgeCase1, {
    customerPhone: "60123456789",
    customerName: "AHMAD BIN ALI",
  });

  console.log(
    "Edge Case 1 (no spray, no 30ml):",
    result2 ? "✅ Success" : "❌ Failed"
  );

  const edgeCase2 = `8/8/2025
total：300
LEE WEI MING
03-98765432
456 Taman Megah,
47500 Subang Jaya,
Selangor.
3w2f2s`;

  const result3 = extractOrderFromMessage(edgeCase2, {
    customerPhone: "60398765432",
    customerName: "LEE WEI MING",
  });

  console.log(
    "Edge Case 2 (landline, different state):",
    result3 ? "✅ Success" : "❌ Failed"
  );
}

/**
 * Test the Google Sheets row creation
 */
export function testSheetRowCreation() {
  console.log("\n🧪 Testing Google Sheets row creation...\n");

  // Mock headers based on your sheet structure
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

  const mockOrderData = {
    orderDate: "2025-08-06",
    customerName: "THAN SIEW PHENG",
    phoneNumber: "60194419638",
    totalPaid: 256,
    products: [
      { name: "wash", quantity: 1, type: "" },
      { name: "femlift_30ml", quantity: 1, type: "30ml" },
      { name: "spray", quantity: 1, type: "" },
      { name: "wash_30ml", quantity: 1, type: "30ml" },
    ],
    address: "6 Lorong Vila Indah 7,\n14300 Nibong Tebal,\nPulau Pinang.",
    city: "Nibong Tebal",
    postcode: "14300",
    state: "Penang",
    remark: "Order from WhatsApp (Group: Test Group)",
  };

  // Import and test the createSheetRowData function
  const { createSheetRowData } = require("../src/whatsappOrderBot");
  const rowData = createSheetRowData(mockOrderData, headers);

  console.log("✅ Sheet row creation test:");
  console.log("Headers count:", headers.length);
  console.log("Row data count:", rowData.length);
  console.log("\nMapped data:");

  headers.forEach((header, index) => {
    if (rowData[index] !== "") {
      console.log(`   ${header}: ${rowData[index]}`);
    }
  });
}

// Run tests if this file is executed directly
if (require.main === module) {
  testWhatsAppOrderExtraction();
  testSheetRowCreation();
}
