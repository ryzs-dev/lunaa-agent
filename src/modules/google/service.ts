import path from 'path';
import { googleClient } from '.';
import { sheetFieldMap } from '../../utils/sheetMapper';
import ProductService from '../product/service';
import { ExtractedData } from './types';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

export class GoogleSheetService {
  private productService: ProductService;
  private spreadSheetId: string;
  private sheetNames = [];

  constructor() {
    this.productService = new ProductService();
    this.spreadSheetId = process.env.GOOGLE_SHEET_ID || '';
    this.sheetNames = JSON.parse(process.env.SHEET_NAMES || '["Clean"]');
  }

  private buildRowData(payload: ExtractedData, headers: string[]) {
    return headers.map((header) => {
      const normalized = header.toLowerCase().trim();
      const resolver = sheetFieldMap[normalized];

      if (resolver) return resolver(payload);

      if (payload.productQuantityMap) {
        const matchKey = Object.keys(payload.productQuantityMap).find(
          (key) => key.toLowerCase().trim() === normalized
        );
        if (matchKey) return payload.productQuantityMap[matchKey];
      }

      return '';
    });
  }

  async createOrder({ customer, order, address, remark }: ExtractedData) {
    try {
      const sheet = this.sheetNames[0];

      const [enrichedItems, headerResponse] = await Promise.all([
        Promise.all(
          (order.order_items || []).map(async (item: any) => {
            const product = await this.productService.getProductById(
              item.product_id
            );
            return {
              ...item,
              product_name: product?.name || 'Unknown Product',
            };
          })
        ),
        googleClient.spreadsheets.values.get({
          spreadsheetId: this.spreadSheetId,
          range: `${sheet}!A:AE`,
        }),
      ]);

      order.order_items = enrichedItems;

      const productQuantityMap: Record<string, number> = {};
      for (const item of order.order_items) {
        if (item.product_name) {
          productQuantityMap[item.product_name] = item.quantity;
        }
      }

      const headers = headerResponse.data.values?.[0] || [];
      const payload = { customer, order, address, productQuantityMap, remark };

      const rowData = this.buildRowData(payload, headers);

      await googleClient.spreadsheets.values.append({
        spreadsheetId: this.spreadSheetId,
        range: `${sheet}!A:AE`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] },
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to insert order into Google Sheets:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getSheetData(sheetName: string) {
    console.log(`📋 Fetching data from sheet: ${sheetName}`);
    try {
      const response = await googleClient.spreadsheets.values.get({
        spreadsheetId: this.spreadSheetId,
        range: `${sheetName}!A:AE`,
      });

      const rows = response.data.values || [];
      console.log(`✅ Fetched ${rows.length} rows from ${sheetName}`);

      return rows;
    } catch (error) {
      console.error(`❌ Error fetching sheet data:`, error);
      throw error;
    }
  }
}
