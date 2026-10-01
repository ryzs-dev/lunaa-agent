// Monthly order tabs are named like the ones staff have always created by
// hand: "Sep 26", "June 26", "July 26".
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'June',
  'July',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Put this in SHEET_NAMES to write to the current month's tab,
// e.g. SHEET_NAMES='["Clean","{month}","Test"]'.
export const MONTH_SHEET_TOKEN = '{month}';

const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

type YearMonth = { year: number; month: number };

function malaysiaYearMonth(date: Date): YearMonth {
  const local = new Date(date.getTime() + MALAYSIA_OFFSET_MS);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() };
}

function monthIndex({ year, month }: YearMonth): number {
  return year * 12 + month;
}

export function monthSheetName({ year, month }: YearMonth): string {
  return `${MONTH_LABELS[month]} ${String(year % 100).padStart(2, '0')}`;
}

export function parseMonthSheetName(title: string): YearMonth | null {
  const match = title.trim().match(/^([A-Za-z]+) (\d{2})$/);
  if (!match) return null;
  const month = MONTH_LABELS.findIndex(
    (label) => label.toLowerCase() === match[1].toLowerCase()
  );
  if (month < 0) return null;
  return { year: 2000 + Number(match[2]), month };
}

// Orders go to the tab for their order date, so a 30 Sep order that's
// processed after midnight still lands in "Sep 26". Dates outside the current
// or previous month are treated as typos and go to the current month.
export function orderSheetMonth(orderDate?: string | null, now = new Date()): YearMonth {
  const current = malaysiaYearMonth(now);
  const match = orderDate?.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (!match) return current;

  const ordered = { year: Number(match[1]), month: Number(match[2]) - 1 };
  const diff = monthIndex(current) - monthIndex(ordered);
  return diff === 0 || diff === 1 ? ordered : current;
}

export function resolveSheetNames(
  names: string[],
  orderDate?: string | null,
  now = new Date()
): string[] {
  const monthName = monthSheetName(orderSheetMonth(orderDate, now));
  return [
    ...new Set(names.map((name) => (name === MONTH_SHEET_TOKEN ? monthName : name))),
  ];
}

// The newest monthly tab before the one being created, used as its template.
export function pickTemplateSheet<T extends { title: string }>(
  sheets: T[],
  target: YearMonth
): T | undefined {
  return sheets
    .map((sheet) => ({ sheet, month: parseMonthSheetName(sheet.title) }))
    .filter(
      (item): item is { sheet: T; month: YearMonth } =>
        item.month !== null && monthIndex(item.month) < monthIndex(target)
    )
    .sort((a, b) => monthIndex(b.month) - monthIndex(a.month))[0]?.sheet;
}
