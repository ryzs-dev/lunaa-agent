"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleService = void 0;
const googleapis_1 = require("googleapis");
class GoogleService {
    constructor() {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        const auth = new googleapis_1.google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        this.sheetsClient = googleapis_1.google.sheets({ version: "v4", auth });
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
        this.sheetName = process.env.SHEET_NAMES;
    }
    // Singleton — ensures only one instance of GoogleService is created
    static getInstance() {
        if (!GoogleService.instance) {
            GoogleService.instance = new GoogleService();
        }
        return GoogleService.instance;
    }
    getSheets() {
        return this.sheetsClient;
    }
    // Example convenience method
    async readRange(sheetName, range) {
        const response = await this.sheetsClient.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!${range}`,
        });
        return response.data.values || [];
    }
    async appendRow(sheetName, range, values) {
        await this.sheetsClient.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!${range}`,
            valueInputOption: "RAW",
            requestBody: { values: [values] },
        });
    }
}
exports.GoogleService = GoogleService;
