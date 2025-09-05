import { google, sheets_v4 } from "googleapis";

export class GoogleService {
  private static instance: GoogleService;
  private sheetsClient: sheets_v4.Sheets;

  private spreadsheetId: string;
  private sheetName: string;

  private constructor() {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    this.sheetsClient = google.sheets({ version: "v4", auth });

    this.spreadsheetId = process.env.GOOGLE_SHEET_ID!;
    this.sheetName = process.env.SHEET_NAMES!;
  }

  // Singleton — ensures only one instance of GoogleService is created
  public static getInstance(): GoogleService {
    if (!GoogleService.instance) {
      GoogleService.instance = new GoogleService();
    }
    return GoogleService.instance;
  }

  public getSheets(): sheets_v4.Sheets {
    return this.sheetsClient;
  }

  // Example convenience method
   public async readRange(sheetName: string, range: string) {
    const response = await this.sheetsClient.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!${range}`,
    });
    return response.data.values || [];
  }

  public async appendRow(sheetName: string, range: string, values: any[]) {
    await this.sheetsClient.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!${range}`,
      valueInputOption: "RAW",
      requestBody: { values: [values] },
    });
  }
}
