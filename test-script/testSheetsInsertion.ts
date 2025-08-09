// testSheetsInsertion.ts - Test actual Google Sheets insertion
// Run with: npx ts-node testSheetsInsertion.ts

import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

import {
  extractOrderFromMessage,
  appendOrderToSheet,
} from "../src/whatsappOrderBot";

async function testGoogleSheetsInsertion() {
  console.log("🧪 Testing Google Sheets Insertion\n");

  // Use the Chinese format message that parsed successfully
  const testMessage = `8/8/2025
total：198
汇款人名字：CHOW MEI LING
收件人名字：NICOLE CHOW
电话号码：0126675705
地址： C15-2-2, Bayan Villa, Jalan BS2/5, Taman Bukit Serdang, 43300 Seri Kembangan, Selangor.
2f1w30ml`;

  const context = {
    customerPhone: "60126675705",
    customerName: "NICOLE CHOW",
    groupName: "Test Integration",
    messageId: "test_" + Date.now(),
    timestamp: new Date().toISOString(),
  };

  console.log("📱 Message to process:");
  console.log(testMessage);
  console.log("\n📊 Environment check:");
  console.log(
    "GOOGLE_SHEET_ID:",
    process.env.GOOGLE_SHEET_ID ? "✅ Set" : "❌ Missing"
  );
  console.log(
    "GOOGLE_CREDENTIALS_JSON:",
    process.env.GOOGLE_CREDENTIALS_JSON ? "✅ Set" : "❌ Missing"
  );

  try {
    // Step 1: Extract order data
    console.log("\n🔍 Step 1: Extracting order data...");
    const orderData = extractOrderFromMessage(testMessage, context);

    if (!orderData) {
      console.log("❌ Failed to extract order data");
      return;
    }

    console.log("✅ Order data extracted:");
    console.log("   - Date:", orderData.orderDate);
    console.log("   - Customer:", orderData.customerName);
    console.log("   - Phone:", orderData.phoneNumber);
    console.log("   - Total:", orderData.totalPaid);
    console.log(
      "   - Products:",
      orderData.products
        .map((p: { quantity: any; name: any }) => `${p.quantity}x ${p.name}`)
        .join(", ")
    );
    console.log("   - Address:", orderData.address);
    console.log("   - City:", orderData.city);
    console.log("   - State:", orderData.state);

    // Step 2: Insert into Google Sheets
    console.log("\n📊 Step 2: Inserting into Google Sheets...");
    console.log("⚠️  This will add a real row to your 'Test' sheet!");
    console.log("   Sheet: Test");
    console.log("   Spreadsheet ID:", process.env.GOOGLE_SHEET_ID);

    const result = await appendOrderToSheet(orderData);

    if (result.success) {
      console.log(`✅ SUCCESS! Order inserted at row ${result.rowIndex}`);
      console.log("🎉 Check your Google Sheet to see the new row!");
    } else {
      console.log(`❌ FAILED to insert: ${result.error}`);
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error);

    if (error instanceof Error) {
      if (error.message.includes("credentials")) {
        console.log(
          "\n💡 Tip: Check your GOOGLE_CREDENTIALS_JSON environment variable"
        );
      } else if (error.message.includes("SHEET_ID")) {
        console.log(
          "\n💡 Tip: Check your GOOGLE_SHEET_ID environment variable"
        );
      } else if (error.message.includes("permission")) {
        console.log(
          "\n💡 Tip: Make sure your Google Service Account has access to the sheet"
        );
      }
    }
  }
}

// Run the test
testGoogleSheetsInsertion();
