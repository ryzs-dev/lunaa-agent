import dotenv from 'dotenv';
import path from 'path';
import { google } from 'googleapis';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

// Initialize Google Sheets API using credentials from environment
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);

console.log('Google Sheets Integrated');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

export const googleClient = google.sheets({ version: 'v4', auth });
