"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSheetData = fetchSheetData;
exports.updateSheetStatus = updateSheetStatus;
exports.updateSheetStatusByTracking = updateSheetStatusByTracking;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const googleapis_1 = require("googleapis");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env.local") });
// Initialize Google Sheets API using credentials from environment
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const auth = new googleapis_1.google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = googleapis_1.google.sheets({ version: "v4", auth });
/**
 * Fetch data from Google Sheets
 * @param sheetName - Name of the sheet tab
 * @param spreadsheetId - Google Sheets ID
 * @returns Array of rows (each row is an array of cell values)
 */
function fetchSheetData(sheetName, spreadsheetId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log(`📋 Fetching data from sheet: ${sheetName}`);
            const response = yield sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A:AC`, // Adjust range as needed
            });
            const rows = response.data.values || [];
            console.log(`✅ Fetched ${rows.length} rows from ${sheetName}`);
            return rows;
        }
        catch (error) {
            console.error(`❌ Error fetching sheet data:`, error);
            throw error;
        }
    });
}
/**
 * Update status in a specific cell
 * @param sheetName - Name of the sheet tab
 * @param spreadsheetId - Google Sheets ID
 * @param rowIndex - Row number (1-based)
 * @param columnIndex - Column index (0-based)
 * @param status - Status to update
 */
function updateSheetStatus(sheetName, spreadsheetId, rowIndex, columnIndex, status) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (columnIndex === -1) {
                console.log(`⚠️ Status column not found, skipping update for row ${rowIndex}`);
                return;
            }
            // Convert column index to letter (A, B, C, etc.)
            const range = `${sheetName}!AC${rowIndex}`;
            console.log(`📝 Updating ${range} with status: ${status}`);
            yield sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: "RAW",
                requestBody: {
                    values: [[status]],
                },
            });
            console.log(`✅ Updated ${range} successfully`);
        }
        catch (error) {
            console.error(`❌ Error updating sheet status:`, error);
            throw error;
        }
    });
}
/**
 * Alternative method: Update status by tracking number
 * This searches for the tracking number and updates the status column
 * @param sheetName - Name of the sheet tab
 * @param spreadsheetId - Google Sheets ID
 * @param trackingNumber - Tracking number to find
 * @param status - Status to update
 */
function updateSheetStatusByTracking(sheetName, spreadsheetId, trackingNumber, status) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            console.log(`🔍 Finding tracking number: ${trackingNumber}`);
            // First, get all data to find the row
            const rows = yield fetchSheetData(sheetName, spreadsheetId);
            if (rows.length === 0) {
                console.log(`❌ No data found in sheet ${sheetName}`);
                return;
            }
            const header = rows[0];
            const trackingCol = header.findIndex((col) => col.toLowerCase().includes("tracking number"));
            const statusCol = header.findIndex((col) => col.toLowerCase().includes("status"));
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
                if (((_a = rows[i][trackingCol]) === null || _a === void 0 ? void 0 : _a.toString().trim()) === trackingNumber.trim()) {
                    targetRow = i + 1; // +1 because sheets are 1-indexed
                    break;
                }
            }
            if (targetRow === -1) {
                console.log(`❌ Tracking number ${trackingNumber} not found`);
                return;
            }
            // Update the status
            yield updateSheetStatus(sheetName, spreadsheetId, targetRow, statusCol, status);
        }
        catch (error) {
            console.error(`❌ Error updating status by tracking number:`, error);
            throw error;
        }
    });
}
