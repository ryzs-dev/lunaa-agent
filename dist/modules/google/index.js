"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleClient = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const googleapis_1 = require("googleapis");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env.local') });
// Initialize Google Sheets API using credentials from environment
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
console.log('Google Sheets Integrated');
const auth = new googleapis_1.google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
exports.googleClient = googleapis_1.google.sheets({ version: 'v4', auth });
