import dotenv from "dotenv";
import path from "path";
import { google } from "googleapis";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Initialize Google Sheets API using credentials from environment
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

/**
 * Fetch data from Google Sheets
 * @param sheetName - Name of the sheet tab
 * @param spreadsheetId - Google Sheets ID
 * @returns Array of rows (each row is an array of cell values)
 */
export async function fetchSheetData(
  sheetName: string,
  spreadsheetId: string
): Promise<any[][]> {
  try {
    console.log(`📋 Fetching data from sheet: ${sheetName}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:AD`, // Adjust range as needed
    });

    const rows = response.data.values || [];
    console.log(`✅ Fetched ${rows.length} rows from ${sheetName}`);

    return rows;
  } catch (error) {
    console.error(`❌ Error fetching sheet data:`, error);
    throw error;
  }
}

/**
 * Update status in a specific cell
 * @param sheetName - Name of the sheet tab
 * @param spreadsheetId - Google Sheets ID
 * @param rowIndex - Row number (1-based)
 * @param columnIndex - Column index (0-based)
 * @param status - Status to update
 */
export async function updateSheetStatus(
  sheetName: string,
  spreadsheetId: string,
  rowIndex: number,
  columnIndex: number,
  status: string
): Promise<void> {
  try {
    if (columnIndex === -1) {
      console.log(
        `⚠️ Status column not found, skipping update for row ${rowIndex}`
      );
      return;
    }

    // Convert column index to letter (A, B, C, etc.)
    const range = `${sheetName}!AC${rowIndex}`;

    console.log(`📝 Updating ${range} with status: ${status}`);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: {
        values: [[status]],
      },
    });

    console.log(`✅ Updated ${range} successfully`);
  } catch (error) {
    console.error(`❌ Error updating sheet status:`, error);
    throw error;
  }
}

/**
 * Alternative method: Update status by tracking number
 * This searches for the tracking number and updates the status column
 * @param sheetName - Name of the sheet tab
 * @param spreadsheetId - Google Sheets ID
 * @param trackingNumber - Tracking number to find
 * @param status - Status to update
 */
export async function updateSheetStatusByTracking(
  sheetName: string,
  spreadsheetId: string,
  trackingNumber: string,
  status: string
): Promise<void> {
  try {
    console.log(`🔍 Finding tracking number: ${trackingNumber}`);

    // First, get all data to find the row
    const rows = await fetchSheetData(sheetName, spreadsheetId);

    if (rows.length === 0) {
      console.log(`❌ No data found in sheet ${sheetName}`);
      return;
    }

    const header = rows[0];
    const trackingCol = header.findIndex((col: string) =>
      col.toLowerCase().includes("tracking number")
    );
    const statusCol = header.findIndex((col: string) =>
      col.toLowerCase().includes("status")
    );

    if (trackingCol === -1) {
      console.log(`❌ Tracking number column not found`);
      return;
    }

    if (statusCol === -1) {
      console.log(`❌ Status column not found`);
      return;
    }

    // Find the row with matching tracking number
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][trackingCol]?.toString().trim() === trackingNumber.trim()) {
        targetRow = i + 1; // +1 because sheets are 1-indexed
        break;
      }
    }

    if (targetRow === -1) {
      console.log(`❌ Tracking number ${trackingNumber} not found`);
      return;
    }

    // Update the status
    await updateSheetStatus(
      sheetName,
      spreadsheetId,
      targetRow,
      statusCol,
      status
    );
  } catch (error) {
    console.error(`❌ Error updating status by tracking number:`, error);
    throw error;
  }
}
