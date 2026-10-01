"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSheetService = void 0;
const path_1 = __importDefault(require("path"));
const _1 = require(".");
const sheetMapper_1 = require("../../utils/sheetMapper");
const monthlySheet_1 = require("../../utils/monthlySheet");
const service_1 = __importDefault(require("../product/service"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env.local') });
class GoogleSheetService {
    constructor() {
        this.sheetNames = [];
        this.writeLock = Promise.resolve();
        this.productService = new service_1.default();
        this.spreadSheetId = process.env.GOOGLE_SHEET_ID || '';
        this.sheetNames = JSON.parse(process.env.SHEET_NAMES || '["Clean"]');
    }
    enqueueWrite(work) {
        const run = this.writeLock.then(work, work);
        this.writeLock = run.then(() => undefined, () => undefined);
        return run;
    }
    async getSheetMeta(sheetName) {
        var _a, _b, _c, _d, _e;
        const meta = await _1.googleClient.spreadsheets.get({
            spreadsheetId: this.spreadSheetId,
            fields: 'sheets(properties(sheetId,title,gridProperties(rowCount)))',
        });
        const sheet = (_a = meta.data.sheets) === null || _a === void 0 ? void 0 : _a.find((item) => { var _a; return ((_a = item.properties) === null || _a === void 0 ? void 0 : _a.title) === sheetName; });
        return {
            sheetId: (_b = sheet === null || sheet === void 0 ? void 0 : sheet.properties) === null || _b === void 0 ? void 0 : _b.sheetId,
            rowCount: (_e = (_d = (_c = sheet === null || sheet === void 0 ? void 0 : sheet.properties) === null || _c === void 0 ? void 0 : _c.gridProperties) === null || _d === void 0 ? void 0 : _d.rowCount) !== null && _e !== void 0 ? _e : 0,
        };
    }
    // Copies the latest monthly tab (columns, widths, header styling, frozen
    // rows) and clears everything below the header.
    async ensureMonthSheet(sheetName, orderDate) {
        var _a, _b, _c, _d, _e;
        const meta = await _1.googleClient.spreadsheets.get({
            spreadsheetId: this.spreadSheetId,
            fields: 'sheets(properties(sheetId,title))',
        });
        const tabs = ((_a = meta.data.sheets) !== null && _a !== void 0 ? _a : []).map((sheet) => {
            var _a, _b, _c;
            return ({
                sheetId: (_a = sheet.properties) === null || _a === void 0 ? void 0 : _a.sheetId,
                title: (_c = (_b = sheet.properties) === null || _b === void 0 ? void 0 : _b.title) !== null && _c !== void 0 ? _c : '',
            });
        });
        if (tabs.some((tab) => tab.title === sheetName))
            return;
        const template = (0, monthlySheet_1.pickTemplateSheet)(tabs, (0, monthlySheet_1.orderSheetMonth)(orderDate));
        if ((template === null || template === void 0 ? void 0 : template.sheetId) == null) {
            throw new Error(`No monthly tab to copy for "${sheetName}"`);
        }
        try {
            const duplicated = await _1.googleClient.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadSheetId,
                requestBody: {
                    requests: [
                        {
                            duplicateSheet: {
                                sourceSheetId: template.sheetId,
                                insertSheetIndex: 0,
                                newSheetName: sheetName,
                            },
                        },
                    ],
                },
            });
            const newSheetId = (_e = (_d = (_c = (_b = duplicated.data.replies) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.duplicateSheet) === null || _d === void 0 ? void 0 : _d.properties) === null || _e === void 0 ? void 0 : _e.sheetId;
            await _1.googleClient.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadSheetId,
                requestBody: {
                    requests: [
                        {
                            updateCells: {
                                range: { sheetId: newSheetId, startRowIndex: 1 },
                                fields: 'userEnteredValue,note',
                            },
                        },
                        {
                            updateSheetProperties: {
                                properties: {
                                    sheetId: newSheetId,
                                    gridProperties: { rowCount: 1000 },
                                },
                                fields: 'gridProperties.rowCount',
                            },
                        },
                    ],
                },
            });
            console.log(`Created sheet "${sheetName}" from "${template.title}"`);
        }
        catch (error) {
            if (String(error).includes('already exists'))
                return;
            throw error;
        }
    }
    async appendSheetRows(sheetId, length) {
        await _1.googleClient.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadSheetId,
            requestBody: {
                requests: [
                    {
                        appendDimension: {
                            sheetId,
                            dimension: 'ROWS',
                            length,
                        },
                    },
                ],
            },
        });
    }
    async ensureSheetRows(sheetName, nextRowNumber, forceExtra = 0) {
        const { sheetId, rowCount } = await this.getSheetMeta(sheetName);
        if (sheetId == null) {
            throw new Error(`Sheet "${sheetName}" not found`);
        }
        const extraRows = Math.max((0, sheetMapper_1.extraGridRowsNeeded)(rowCount, nextRowNumber), forceExtra);
        if (extraRows === 0)
            return;
        await this.appendSheetRows(sheetId, extraRows);
    }
    async writeSheetRow(sheet, payload) {
        const headerResponse = await _1.googleClient.spreadsheets.values.get({
            spreadsheetId: this.spreadSheetId,
            range: `${(0, sheetMapper_1.quoteSheetName)(sheet)}!A:CZ`,
        });
        const rows = headerResponse.data.values || [];
        const headers = (rows[0] || []).map((header) => String(header !== null && header !== void 0 ? header : ''));
        if (!headers.length) {
            throw new Error(`Sheet "${sheet}" has no header row`);
        }
        if ((0, sheetMapper_1.sheetRowAlreadyExists)(rows, payload)) {
            console.log(`Sheet ${sheet} already has this order, skipping`);
            return;
        }
        const rowData = (0, sheetMapper_1.buildSheetRow)(payload, headers);
        const nextRow = rows.length + 1;
        await this.ensureSheetRows(sheet, nextRow);
        try {
            await _1.googleClient.spreadsheets.values.update({
                spreadsheetId: this.spreadSheetId,
                range: (0, sheetMapper_1.sheetRowWriteRange)(sheet, rows),
                valueInputOption: 'RAW',
                requestBody: { values: [rowData] },
            });
        }
        catch (error) {
            if (!(0, sheetMapper_1.isGridLimitError)(error))
                throw error;
            await this.ensureSheetRows(sheet, nextRow, 200);
            await _1.googleClient.spreadsheets.values.update({
                spreadsheetId: this.spreadSheetId,
                range: (0, sheetMapper_1.sheetRowWriteRange)(sheet, rows),
                valueInputOption: 'RAW',
                requestBody: { values: [rowData] },
            });
        }
    }
    async createOrder({ customer, order, address, remark }) {
        try {
            const sheets = (0, monthlySheet_1.resolveSheetNames)(this.sheetNames, order.order_date);
            const monthSheet = (0, monthlySheet_1.monthSheetName)((0, monthlySheet_1.orderSheetMonth)(order.order_date));
            const [enrichedItems] = await Promise.all([
                Promise.all((order.order_items || []).map(async (item) => {
                    const product = await this.productService.getProductById(item.product_id);
                    return Object.assign(Object.assign({}, item), { product_name: (product === null || product === void 0 ? void 0 : product.name) || 'Unknown Product' });
                })),
            ]);
            order.order_items = enrichedItems;
            const productQuantityMap = {};
            for (const item of order.order_items) {
                if (item.product_name) {
                    productQuantityMap[item.product_name] = item.quantity;
                }
            }
            const payload = {
                customer,
                order,
                address,
                productQuantityMap,
                remark,
            };
            const failures = [];
            for (const sheet of sheets) {
                try {
                    await this.enqueueWrite(async () => {
                        let lastError;
                        for (let attempt = 1; attempt <= 3; attempt += 1) {
                            try {
                                if (sheet === monthSheet) {
                                    await this.ensureMonthSheet(sheet, order.order_date);
                                }
                                await this.writeSheetRow(sheet, payload);
                                return;
                            }
                            catch (error) {
                                lastError = error;
                                console.error(`Sheet write attempt ${attempt} failed for ${sheet}:`, error);
                                if (attempt < 3) {
                                    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
                                }
                            }
                        }
                        throw lastError;
                    });
                }
                catch (sheetError) {
                    const message = sheetError instanceof Error
                        ? sheetError.message
                        : String(sheetError);
                    console.error(`Failed to write order to sheet ${sheet}:`, sheetError);
                    failures.push(`${sheet}: ${message}`);
                }
            }
            if (failures.length) {
                return { success: false, error: failures.join('; ') };
            }
            return { success: true };
        }
        catch (error) {
            console.error('Failed to insert order into Google Sheets:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    async getSheetData(sheetName) {
        console.log(`📋 Fetching data from sheet: ${sheetName}`);
        try {
            const response = await _1.googleClient.spreadsheets.values.get({
                spreadsheetId: this.spreadSheetId,
                range: `${(0, sheetMapper_1.quoteSheetName)(sheetName)}!A:CZ`,
            });
            const rows = response.data.values || [];
            console.log(`✅ Fetched ${rows.length} rows from ${sheetName}`);
            return rows;
        }
        catch (error) {
            console.error(`❌ Error fetching sheet data:`, error);
            throw error;
        }
    }
}
exports.GoogleSheetService = GoogleSheetService;
