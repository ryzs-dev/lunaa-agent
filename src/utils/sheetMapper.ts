import { ExtractedData } from '../modules/google/types';

type Resolver = ({ customer, address, order, remark }: ExtractedData) => any;

const HEADER_ALIASES: Record<string, string> = {
  'fb name': 'fbname',
  fb_name: 'fbname',
  remarks: 'remark',
  bloom: 'blossom',
  'couriers company': 'courier',
};

export function normalizeHeader(header: string): string {
  const normalized = header.toLowerCase().trim().replace(/\s+/g, ' ');
  return HEADER_ALIASES[normalized] ?? normalized;
}

export function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

export function nextSheetRowNumber(existingRows: unknown[][]): number {
  return existingRows.length + 1;
}

export function extraGridRowsNeeded(
  currentRowCount: number,
  nextRowNumber: number,
  buffer = 100
): number {
  if (nextRowNumber <= currentRowCount) return 0;
  return Math.max(buffer, nextRowNumber - currentRowCount);
}

export function sheetRowWriteRange(
  sheetName: string,
  existingRows: unknown[][]
): string {
  return `${quoteSheetName(sheetName)}!A${nextSheetRowNumber(existingRows)}`;
}

export function buildSheetRow(
  payload: ExtractedData,
  headers: string[]
): Array<string | number> {
  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    const resolver = sheetFieldMap[normalized];

    if (resolver) {
      const value = resolver(payload);
      return value === undefined || value === null ? '' : value;
    }

    if (payload.productQuantityMap) {
      const matchKey = Object.keys(payload.productQuantityMap).find(
        (key) => normalizeHeader(key) === normalized
      );
      if (matchKey) {
        const quantity = payload.productQuantityMap[matchKey];
        return quantity === undefined || quantity === null ? '' : quantity;
      }
    }

    return '';
  });
}

export function normalizePhoneDigits(phone?: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('60') && digits.length >= 11) return digits.slice(2);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function sheetRowAlreadyExists(
  rows: unknown[][],
  payload: ExtractedData
): boolean {
  return findSheetRowIndex(rows, payload) >= 0;
}

// Index in rows (0 is the header) of the row written for this order, or -1.
export function findSheetRowIndex(
  rows: unknown[][],
  payload: ExtractedData
): number {
  if (rows.length < 2) return -1;

  const headers = (rows[0] || []).map((header) => String(header ?? ''));
  const phoneIdx = headers.findIndex(
    (header) => normalizeHeader(header) === 'phone number'
  );
  const dateIdx = headers.findIndex(
    (header) => normalizeHeader(header) === 'order date'
  );
  const totalIdx = headers.findIndex(
    (header) => normalizeHeader(header) === 'total paid (rm)'
  );
  const shipIdx = headers.findIndex(
    (header) => normalizeHeader(header) === 'shipment description'
  );

  const phone = normalizePhoneDigits(payload.customer.phone_number);
  const date = String(payload.order.order_date || '').slice(0, 10);
  const total = String(payload.order.total_amount ?? '');
  const shipment = String(payload.order.shipment_description || '')
    .replace(/\s+/g, '')
    .toLowerCase();

  const index = rows.slice(1).findIndex((row) => {
    const cells = row as unknown[];
    const rowPhone =
      phoneIdx >= 0 ? normalizePhoneDigits(String(cells[phoneIdx] ?? '')) : '';
    const rowDate =
      dateIdx >= 0 ? String(cells[dateIdx] ?? '').slice(0, 10) : '';
    const rowTotal = totalIdx >= 0 ? String(cells[totalIdx] ?? '') : '';
    const rowShip =
      shipIdx >= 0
        ? String(cells[shipIdx] ?? '').replace(/\s+/g, '').toLowerCase()
        : '';

    return (
      phone &&
      phone === rowPhone &&
      date === rowDate &&
      total === rowTotal &&
      shipment === rowShip
    );
  });
  return index < 0 ? -1 : index + 1;
}

// Columns the bot never overwrites on a correction: staff fill or change these.
const STAFF_COLUMNS = new Set(['fbname', 'new/repeat', 'status', 'agent by / under']);

// The corrected row: the bot's own columns and both orders' product columns
// are rewritten, anything staff typed elsewhere in the row is kept.
export function mergeSheetRow(
  existing: unknown[],
  headers: string[],
  next: ExtractedData,
  previousProductNames: string[]
): Array<string | number> {
  const fresh = buildSheetRow(next, headers);
  const products = new Set(
    [...previousProductNames, ...Object.keys(next.productQuantityMap ?? {})].map(normalizeHeader)
  );
  return headers.map((header, index) => {
    const normalized = normalizeHeader(header);
    const owned =
      (sheetFieldMap[normalized] && !STAFF_COLUMNS.has(normalized)) || products.has(normalized);
    if (owned) return fresh[index];
    const cell = existing[index];
    return cell === undefined || cell === null ? '' : (cell as string | number);
  });
}

export function isGridLimitError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: string })?.message || error);
  return message.toLowerCase().includes('exceeds grid limits');
}

export const sheetFieldMap: Record<string, Resolver> = {
  'order date': ({ order }) => order.order_date || '',
  fbname: () => '',
  name: ({ customer }) => customer.name || '',
  'payment method': ({ order }) => order.payment_method || '',
  'total paid (rm)': ({ order }) => order.total_amount || '',
  'shipment description': ({ order }) => order.shipment_description || '',
  address: ({ address }) => address.full_address || '',
  city: ({ address }) => address.city || '',
  postcode: ({ address }) => address.postcode || '',
  state: ({ address }) => address.state || '',
  'phone number': ({ customer }) => customer.phone_number || '',
  email: ({ customer }) => customer.email || '',
  'new/repeat': () => '',
  'agent by / under': () => 'WhatsApp Bot',
  currency: ({ customer }) =>
    customer.phone_number?.startsWith('65') ? 'SGD' : 'MYR',
  status: () => 'Pending',
  remark: ({ remark }) => remark || '',
};
