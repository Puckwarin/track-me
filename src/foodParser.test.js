import { describe, expect, it } from 'vitest';
import { guessFoodCategory, parseBulkFoodText } from './foodParser.js';

describe('food parser', () => {
  it('parses food lines, preserves gram quantities, and normalizes nutrients per gram', () => {
    const result = parseBulkFoodText('อกไก่ต้ม 200 กรัม 330 kcal / P62 / C0 / F7');
    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: 'อกไก่ต้ม',
      quantity: 200,
      portionUnit: 'g',
      calories: 330,
      unitNutrition: { calories: 1.65, protein: 0.31 }
    });
  });

  it('skips blank lines and reports malformed rows with their original line number', () => {
    const result = parseBulkFoodText('\nข้าวสวย 130 kcal / P2 / C28 / F0\nbad row');
    expect(result.items).toHaveLength(1);
    expect(result.errors[0].lineNumber).toBe(3);
  });

  it('categorizes common foods in Thai and English', () => {
    expect(guessFoodCategory('อกไก่ย่าง')).toBe('โปรตีน');
    expect(guessFoodCategory('Granola bar')).toBe('ซีเรียล/กราโนลา');
  });
});
