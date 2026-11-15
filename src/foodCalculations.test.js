import { describe, expect, it } from 'vitest';
import { foodLogName, foodLogPortion, foodLogQuantity, foodQuantityFromInput, unitNutritionFor } from './foodCalculations.js';

describe('food log calculations', () => {
  it('keeps legacy records readable when quantity is encoded in the name', () => {
    const item = { name: 'ข้าวสวย × 2.5', calories: 325, protein: 6.75 };
    expect(foodLogQuantity(item)).toBe(2.5);
    expect(foodLogName(item.name)).toBe('ข้าวสวย');
    expect(unitNutritionFor(item).calories).toBe(130);
  });

  it('prefers stored edible grams and falls back to historical portion metadata', () => {
    expect(foodLogPortion({ weighedGrams: 200, edibleFraction: 0.75, edibleGrams: 150 })).toContain('150 g ที่กินได้');
    expect(foodLogPortion({ name: 'กล้วย', quantity: 2, portionUnit: '1 ลูก', gramsPerUnit: 100 })).toBe('200 g');
    expect(foodLogPortion({ name: 'ขนม', quantity: 2, portionUnit: 'ชิ้น' })).toBe('2 ชิ้น');
  });

  it('converts likely gram input back to units without changing small unit counts', () => {
    const base = { unit: '1 ชิ้น', gramsPerUnit: 50 };
    expect(foodQuantityFromInput(100, base)).toBe(2);
    expect(foodQuantityFromInput(1, base)).toBe(1);
  });
});
