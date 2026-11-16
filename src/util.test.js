import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsLocal,
  daysBetween,
  isValidCalendarDate,
  localDateStr,
  mondayOf,
  monthEndDate,
  shiftMonth
} from './util.js';

describe('local date and calendar utilities', () => {
  it('formats localDateStr from local calendar components without UTC day shift', () => {
    const earlyMorning = new Date(2026, 10, 16, 0, 30, 0);
    expect(localDateStr(earlyMorning)).toBe('2026-11-16');

    const newYearsMorning = new Date(2026, 0, 1, 0, 5, 0);
    expect(localDateStr(newYearsMorning)).toBe('2026-01-01');
  });

  it('adds days and calculates day deltas across month, year, and leap year boundaries', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');

    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1);
  });

  it('validates real calendar dates including leap years', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true);
    expect(isValidCalendarDate('2026-02-29')).toBe(false);
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
    expect(isValidCalendarDate('2026-04-31')).toBe(false);
    expect(isValidCalendarDate('2026-12-31')).toBe(true);
    expect(isValidCalendarDate('2026/01/01')).toBe(false);
  });

  it('adds months cleanly with month-end clamping, leap years, and year transitions', () => {
    expect(addMonthsLocal('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsLocal('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsLocal('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsLocal('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonthsLocal('2026-05-31', 1)).toBe('2026-06-30');
    expect(addMonthsLocal('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsLocal('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('computes Monday-based week start accurately across Sundays and year boundaries', () => {
    expect(mondayOf('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(mondayOf('2026-11-15')).toBe('2026-11-09'); // Sunday
    expect(mondayOf('2026-01-01')).toBe('2025-12-29'); // Thursday crossing year start
    expect(mondayOf('2025-12-31')).toBe('2025-12-29');
    expect(mondayOf('2024-02-29')).toBe('2024-02-26');
    expect(mondayOf('2024-03-03')).toBe('2024-02-26');
  });

  it('shifts months and computes month end dates accurately without UTC off-by-one', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-03', -1)).toBe('2026-02');
    expect(shiftMonth('2026-01', 14)).toBe('2027-03');

    expect(monthEndDate('2026-02')).toBe('2026-02-28');
    expect(monthEndDate('2024-02')).toBe('2024-02-29');
    expect(monthEndDate('2026-04')).toBe('2026-04-30');
    expect(monthEndDate('2026-12')).toBe('2026-12-31');
  });
});
