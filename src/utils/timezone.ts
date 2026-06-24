export const APP_TIMEZONE = 'Asia/Kuala_Lumpur';

export function getCurrentMonthKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;

  return `${year}-${month}`;
}

export function resolveMonthKey(month?: string | null): string {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    return month;
  }

  return getCurrentMonthKey();
}
