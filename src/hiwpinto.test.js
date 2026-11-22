import { describe, expect, it } from 'vitest';
import { parseHiwpintoExport } from './hiwpinto.js';

describe('Hiwpinto rice calculation', () => {
  it('adds only the Riceberry amount not already estimated in restaurant carbs', () => {
    const result = parseHiwpintoExport({
      source: 'hiwpinto',
      days: [{
        date: '2026-11-23',
        items: [{
          name: 'เมนูทดลอง (ข้าวไรซ์เบอร์รี่)',
          nutrition: { calories: 230, protein: 20, carbs: 33, fat: 3 }
        }]
      }]
    }, new Date(2026, 10, 22));

    const [entry] = result.entries;
    expect(entry).toMatchObject({
      includedRice: true,
      calories: 271,
      protein: 20.9,
      carbs: 41.4,
      fat: 3.3
    });
    expect(entry.record.hiwpinto).toMatchObject({
      shopCalories: 230,
      shopProtein: 20,
      shopCarbs: 33,
      shopFat: 3,
      riceProfile: 'riceberry',
      riceGrams: 180
    });
    expect(entry.record.hiwpinto).not.toHaveProperty('baseRiceGrams');
    expect(entry.record.hiwpinto).not.toHaveProperty('originalRiceGrams');
    expect(entry.warning).toContain('ซอส ผัก');
  });

  it('preserves restaurant nutrition without NaN when reported carbs are zero', () => {
    const result = parseHiwpintoExport({
      source: 'hiwpinto',
      days: [{
        date: '2026-11-23',
        items: [{
          name: 'เมนูทดลอง (ข้าวกล้อง)',
          nutrition: { calories: 200, protein: 10, carbs: 0, fat: 5 }
        }]
      }]
    }, new Date(2026, 10, 22));

    const [entry] = result.entries;
    expect(entry.record).toMatchObject({ calories: 200, protein: 10, carbs: 0, fat: 5 });
    expect(entry.warning).toContain('ประมาณน้ำหนักข้าวไม่ได้');
  });
});
