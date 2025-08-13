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
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncSheetsToD1 = syncSheetsToD1;
exports.syncNewOrdersOnly = syncNewOrdersOnly;
exports.validateSheetStructure = validateSheetStructure;
const supabaseOrders_1 = require("../database/supabaseOrders");
const googleSheet_1 = require("../googleSheet");
const database_1 = require("../types/database");
/**
 * Parse date string to GMT+8 date format (yyyy-mm-dd)
 * Returns null if the date is invalid
 */
function parseToGMT8DateOnly(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime()))
        return null;
    // Convert to GMT+8
    const gmt8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return gmt8.toISOString().slice(0, 10);
}
/**
 * Parse and clean cell value
 */
function parseValue(value, fieldType) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const str = value.toString().trim();
    switch (fieldType) {
        case "number":
            const num = parseFloat(str);
            return isNaN(num) ? null : num;
        case "integer":
            const int = parseInt(str);
            return isNaN(int) ? null : int;
        case "date":
            return parseToGMT8DateOnly(str); // assume already in yyyy-mm-dd and local time
        case "text":
        default:
            return str;
    }
}
/**
 * Map Google Sheets row to database order object
 */
function mapSheetRowToOrder(row, headers) {
    const order = {};
    headers.forEach((header, index) => {
        const normalizedHeader = header.toLowerCase().trim();
        const dbField = database_1.COLUMN_MAPPING[normalizedHeader];
        if (dbField && row[index] !== undefined) {
            let fieldType = "text";
            // Determine field type based on database schema
            if (dbField.includes("qty") || dbField === "customer_id") {
                fieldType = "integer";
            }
            else if (dbField.includes("price") ||
                dbField.includes("fee") ||
                dbField === "postage" ||
                dbField === "total_paid") {
                fieldType = "number";
            }
            else if (dbField === "order_date") {
                fieldType = "date";
            }
            order[dbField] = parseValue(row[index], fieldType);
        }
    });
    return order;
}
/**
 * Sync data from Google Sheets to D1 database
 */
function syncSheetsToD1() {
    return __awaiter(this, arguments, void 0, function* (sheetName = "Test") {
        var _a;
        console.log(`🔄 Starting sync from Google Sheets to D1...`);
        try {
            // Fetch data from Google Sheets
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const rows = yield (0, googleSheet_1.fetchSheetData)(sheetName, spreadsheetId);
            if (rows.length === 0) {
                console.log("❌ No data found in Google Sheets");
                return;
            }
            const headers = rows[0];
            // Check required columns
            const trackingCol = headers.findIndex((h) => h.toLowerCase().includes("tracking number"));
            if (trackingCol === -1) {
                console.log('❌ Required column "tracking number" not found');
                return;
            }
            const orders = [];
            let skippedCount = 0;
            // Process each row (skip header)
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const trackingNumber = (_a = row[trackingCol]) === null || _a === void 0 ? void 0 : _a.toString().trim();
                // Skip rows without tracking number
                if (!trackingNumber) {
                    skippedCount++;
                    continue;
                }
                // Map row to order object
                const order = mapSheetRowToOrder(row, headers);
                // Ensure tracking number is set
                order.tracking_number = trackingNumber;
                orders.push(order);
            }
            console.log(`📦 Mapped ${orders.length} orders, skipped ${skippedCount} rows without tracking numbers`);
            // Bulk insert orders
            if (orders.length > 0) {
                yield (0, supabaseOrders_1.bulkInsertOrders)(orders);
            }
            console.log(`✅ Sync completed successfully`);
        }
        catch (error) {
            console.error("❌ Sync failed:", error);
            throw error;
        }
    });
}
/**
 * Sync only new orders (not already in database)
 */
function syncNewOrdersOnly() {
    return __awaiter(this, arguments, void 0, function* (sheetName = "Test") {
        var _a;
        console.log(`🔄 Starting incremental sync (new orders only)...`);
        try {
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const rows = yield (0, googleSheet_1.fetchSheetData)(sheetName, spreadsheetId);
            if (rows.length === 0) {
                console.log("❌ No data found in Google Sheets");
                return;
            }
            const headers = rows[0];
            const trackingCol = headers.findIndex((h) => h.toLowerCase().includes("tracking number"));
            if (trackingCol === -1) {
                console.log('❌ Required column "tracking number" not found');
                return;
            }
            let newOrdersCount = 0;
            let existingOrdersCount = 0;
            let skippedCount = 0;
            // Process each row
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const trackingNumber = (_a = row[trackingCol]) === null || _a === void 0 ? void 0 : _a.toString().trim();
                if (!trackingNumber) {
                    skippedCount++;
                    continue;
                }
                // Check if order already exists
                const existingOrder = yield (0, supabaseOrders_1.getOrderByTracking)(trackingNumber);
                if (existingOrder) {
                    existingOrdersCount++;
                    console.log(`⏭️ Order ${trackingNumber} already exists, skipping`);
                    continue;
                }
                // Map and insert new order
                const order = mapSheetRowToOrder(row, headers);
                order.tracking_number = trackingNumber;
                try {
                    yield (0, supabaseOrders_1.insertOrder)(order);
                    newOrdersCount++;
                    console.log(`✅ Added new order: ${trackingNumber}`);
                }
                catch (error) {
                    console.error(`❌ Failed to add order ${trackingNumber}:`, error);
                }
            }
            console.log(`📊 Incremental sync summary:`);
            console.log(`   New orders added: ${newOrdersCount}`);
            console.log(`   Existing orders skipped: ${existingOrdersCount}`);
            console.log(`   Rows without tracking: ${skippedCount}`);
        }
        catch (error) {
            console.error("❌ Incremental sync failed:", error);
            throw error;
        }
    });
}
/**
 * Validate Google Sheets structure for D1 sync
 */
function validateSheetStructure() {
    return __awaiter(this, arguments, void 0, function* (sheetName = "Test") {
        try {
            console.log(`🔍 Validating sheet structure for D1 sync...`);
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const rows = yield (0, googleSheet_1.fetchSheetData)(sheetName, spreadsheetId);
            if (rows.length === 0) {
                console.log("❌ Sheet is empty");
                return false;
            }
            const headers = rows[0].map((h) => h.toLowerCase().trim());
            console.log(`📋 Found headers: ${headers.join(", ")}`);
            // Check for required columns
            const requiredColumns = ["tracking number"];
            const missingColumns = [];
            requiredColumns.forEach((col) => {
                if (!headers.some((h) => h.includes(col))) {
                    missingColumns.push(col);
                }
            });
            if (missingColumns.length > 0) {
                console.log(`❌ Missing required columns: ${missingColumns.join(", ")}`);
                return false;
            }
            // Check for recommended columns
            const recommendedColumns = [
                "order date",
                "customer id",
                "total paid",
                "status",
            ];
            const missingRecommended = [];
            recommendedColumns.forEach((col) => {
                if (!headers.some((h) => h.includes(col))) {
                    missingRecommended.push(col);
                }
            });
            if (missingRecommended.length > 0) {
                console.log(`⚠️ Missing recommended columns: ${missingRecommended.join(", ")}`);
            }
            console.log(`✅ Sheet structure validation passed`);
            return true;
        }
        catch (error) {
            console.error("❌ Sheet validation failed:", error);
            return false;
        }
    });
}
