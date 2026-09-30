import path from 'path';
import { googleClient } from '.';
import {
  buildSheetRow,
  extraGridRowsNeeded,
  isGridLimitError,
  quoteSheetName,
  sheetRowAlreadyExists,
  sheetRowWriteRange,
} from '../../utils/sheetMapper';
import ProductService from '../product/service';
import { ExtractedData } from './types';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

export class GoogleSheetService {
  private productService: ProductService;
  private spreadSheetId: string;
  private sheetNames = [];

  private writeLock: Promise<void> = Promise.resolve();

  constructor() {
    this.productService = new ProductService();
    this.spreadSheetId = process.env.GOOGLE_SHEET_ID || '';
    this.sheetNames = JSON.parse(process.env.SHEET_NAMES || '["Clean"]');
  }

  private enqueueWrite<T>(work: () => Promise<T>): Promise<T> {
    const run = this.writeLock.then(work, work);
    this.writeLock = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async getSheetMeta(sheetName: string) {
    const meta = await googleClient.spreadsheets.get({
      spreadsheetId: this.spreadSheetId,
      fields:
        'sheets(properties(sheetId,title,gridProperties(rowCount)))',
    });

    const sheet = meta.data.sheets?.find(
      (item) => item.properties?.title === sheetName
    );

    return {
      sheetId: sheet?.properties?.sheetId,
      rowCount: sheet?.properties?.gridProperties?.rowCount ?? 0,
    };
  }

  private async appendSheetRows(sheetId: number, length: number) {
    await googleClient.spreadsheets.batchUpdate({
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

  private async ensureSheetRows(
    sheetName: string,
    nextRowNumber: number,
    forceExtra = 0
  ) {
    const { sheetId, rowCount } = await this.getSheetMeta(sheetName);
    if (sheetId == null) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    const extraRows = Math.max(
      extraGridRowsNeeded(rowCount, nextRowNumber),
      forceExtra
    );
    if (extraRows === 0) return;

    await this.appendSheetRows(sheetId, extraRows);
  }

  private async writeSheetRow(sheet: string, payload: ExtractedData) {
    const headerResponse = await googleClient.spreadsheets.values.get({
      spreadsheetId: this.spreadSheetId,
      range: `${quoteSheetName(sheet)}!A:CZ`,
    });

    const rows = headerResponse.data.values || [];
    const headers = (rows[0] || []).map((header) => String(header ?? ''));
    if (!headers.length) {
      throw new Error(`Sheet "${sheet}" has no header row`);
    }

    if (sheetRowAlreadyExists(rows, payload)) {
      console.log(`Sheet ${sheet} already has this order, skipping`);
      return;
    }

    const rowData = buildSheetRow(payload, headers);
    const nextRow = rows.length + 1;
    await this.ensureSheetRows(sheet, nextRow);

    try {
      await googleClient.spreadsheets.values.update({
        spreadsheetId: this.spreadSheetId,
        range: sheetRowWriteRange(sheet, rows),
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] },
      });
    } catch (error) {
      if (!isGridLimitError(error)) throw error;

      await this.ensureSheetRows(sheet, nextRow, 200);
      await googleClient.spreadsheets.values.update({
        spreadsheetId: this.spreadSheetId,
        range: sheetRowWriteRange(sheet, rows),
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] },
      });
    }
  }

  async createOrder({ customer, order, address, remark }: ExtractedData) {
    try {
      const sheets = this.sheetNames;

      const [enrichedItems] = await Promise.all([
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
      ]);

      order.order_items = enrichedItems;

      const productQuantityMap: Record<string, number> = {};
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
      const failures: string[] = [];

      for (const sheet of sheets) {
        try {
          await this.enqueueWrite(async () => {
            let lastError: unknown;
            for (let attempt = 1; attempt <= 3; attempt += 1) {
              try {
                await this.writeSheetRow(sheet, payload);
                return;
              } catch (error) {
                lastError = error;
                console.error(
                  `Sheet write attempt ${attempt} failed for ${sheet}:`,
                  error
                );
                if (attempt < 3) {
                  await new Promise((resolve) =>
                    setTimeout(resolve, attempt * 500)
                  );
                }
              }
            }
            throw lastError;
          });
        } catch (sheetError) {
          const message =
            sheetError instanceof Error
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
        range: `${quoteSheetName(sheetName)}!A:CZ`,
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
