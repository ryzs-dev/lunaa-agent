import {
  monthSheetName,
  orderSheetMonth,
  parseMonthSheetName,
  pickTemplateSheet,
  resolveSheetNames,
} from './monthlySheet';

// 1 Oct 2026, 00:30 in Malaysia
const earlyOct = new Date('2026-09-30T16:30:00Z');

describe('monthly sheet names', () => {
  test('matches the existing tab naming', () => {
    expect(monthSheetName({ year: 2026, month: 9 })).toBe('Oct 26');
    expect(monthSheetName({ year: 2026, month: 5 })).toBe('June 26');
    expect(monthSheetName({ year: 2026, month: 6 })).toBe('July 26');
    expect(monthSheetName({ year: 2027, month: 0 })).toBe('Jan 27');
  });

  test('parses existing tab names and ignores others', () => {
    expect(parseMonthSheetName('Sep 26')).toEqual({ year: 2026, month: 8 });
    expect(parseMonthSheetName('July 26')).toEqual({ year: 2026, month: 6 });
    expect(parseMonthSheetName('May sheet 2')).toBeNull();
    expect(parseMonthSheetName('Test Aug 25')).toBeNull();
    expect(parseMonthSheetName('Clean')).toBeNull();
  });

  test('uses Malaysia time for the current month', () => {
    expect(resolveSheetNames(['Clean', '{month}', 'Test'], undefined, earlyOct)).toEqual([
      'Clean',
      'Oct 26',
      'Test',
    ]);
  });

  test('keeps late orders from last month in last month', () => {
    expect(monthSheetName(orderSheetMonth('2026-09-30', earlyOct))).toBe('Sep 26');
  });

  test('sends mistyped dates to the current month', () => {
    expect(monthSheetName(orderSheetMonth('2025-03-04', earlyOct))).toBe('Oct 26');
    expect(monthSheetName(orderSheetMonth('2026-12-01', earlyOct))).toBe('Oct 26');
    expect(monthSheetName(orderSheetMonth('not a date', earlyOct))).toBe('Oct 26');
  });

  test('copies the newest earlier monthly tab', () => {
    const tabs = [
      { title: 'Oct 26' },
      { title: 'Sep 26' },
      { title: 'May sheet 2' },
      { title: 'Dec 25' },
      { title: 'Test' },
    ];
    expect(pickTemplateSheet(tabs, { year: 2026, month: 10 })?.title).toBe('Oct 26');
    expect(pickTemplateSheet(tabs, { year: 2026, month: 9 })?.title).toBe('Sep 26');
    expect(pickTemplateSheet([{ title: 'Test' }], { year: 2026, month: 9 })).toBeUndefined();
  });
});
