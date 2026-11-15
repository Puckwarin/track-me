import { describe, expect, it } from 'vitest';
import { parseSmartReminder } from './reminderParser.js';

describe('reminder parser', () => {
  it('parses a recurring interval deterministically from the supplied date', () => {
    const result = parseSmartReminder('เปลี่ยนไส้กรอง ทุก 3 เดือน', [], '2026-01-15');

    expect(result).toMatchObject({
      title: 'เปลี่ยนไส้กรอง',
      nextDate: '2026-04-15',
      repeatMonths: 3,
      rule: { kind: 'monthly', repeatMonths: 3 }
    });
  });

  it('returns null for empty input and uses the supplied date for a one-time reminder', () => {
    expect(parseSmartReminder('   ', [], '2026-01-15')).toBeNull();
    expect(parseSmartReminder('เปลี่ยนหลอดไฟ', [], '2026-01-15').nextDate).toBe('2026-01-15');
  });
});
