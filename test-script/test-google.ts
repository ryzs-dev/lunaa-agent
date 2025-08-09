// Create this as test-google.js to test your connection
import dotenv from "dotenv";
import path from "path";
import { google } from "googleapis";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

async function testGoogleConnection() {
  console.log("🔍 Testing Google Sheets connection...");

  try {
    // Parse credentials
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
    console.log("✅ Credentials parsed successfully");
    console.log(`📧 Service account email: ${credentials.client_email}`);
    console.log(`🆔 Project ID: ${credentials.project_id}`);

    // Initialize auth
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    console.log("✅ Google Sheets client initialized");

    // Test with your actual sheet
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    console.log(`📊 Testing with sheet ID: ${spreadsheetId}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Test!A1:D10", // Small range for testing
    });

    const rows = response.data.values || [];
    console.log(`✅ SUCCESS! Fetched ${rows.length} rows from Google Sheets`);
    console.log("📋 First few rows:", rows.slice(0, 3));

    return true;
  } catch (error: any) {
    console.error("❌ Google Sheets connection failed:", error.message);

    if (error.message.includes("invalid_grant")) {
      console.log("🔧 Possible solutions:");
      console.log("1. Make sure your service account key is not expired");
      console.log("2. Check if your system clock is synchronized");
      console.log("3. Regenerate the service account key");
    } else if (error.code === 403) {
      console.log("🔧 Permission issue:");
      console.log(
        "1. Make sure the service account has access to the Google Sheet"
      );
      console.log("3. Make sure Google Sheets API is enabled");
    }

    return false;
  }
}

testGoogleConnection();
