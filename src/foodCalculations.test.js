import { describe, expect, it } from 'vitest';
import {
  buildFoodRecordUpdatesFromLibrary,
  foodLogName,
  foodLogPortion,
  foodLogQuantity,
  foodQuantityFromInput,
  hasFoodLibraryDefinitionChanged,
  unitNutritionFor
} from './foodCalculations.js';

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

  it('updates matched food records cleanly when a custom library item is edited', () => {
    const prev = { id: 'cf1', name: 'อกไก่ต้ม', unit: 'ชิ้น', gramsPerUnit: 100, calories: 165, protein: 31, carbs: 0, fat: 3.6 };
    const next = { id: 'cf1', name: 'อกไก่ต้มสุก', unit: 'ชิ้น (120g)', gramsPerUnit: 120, calories: 198, protein: 36, carbs: 0, fat: 4.2, sugar: 0, sodium: 90 };
    expect(hasFoodLibraryDefinitionChanged(prev, prev)).toBe(false);
    expect(hasFoodLibraryDefinitionChanged(prev, next)).toBe(true);

    const byId = buildFoodRecordUpdatesFromLibrary({ id: 'rec1', customFoodId: 'cf1', name: 'อกไก่ต้ม', quantity: 1.5, portionUnit: 'ชิ้น' }, next, prev);
    expect(byId).toMatchObject({
      customFoodId: 'cf1',
      name: 'อกไก่ต้มสุก',
      quantity: 1.5,
      portionUnit: 'ชิ้น (120g)',
      gramsPerUnit: 120,
      calories: 297,
      protein: 54,
      sugar: 0,
      sodium: 135
    });

    const legacyItem = { id: 'rec2', name: 'อกไก่ต้ม', quantity: 2, portionUnit: 'ชิ้น' };
    const matchedLegacy = buildFoodRecordUpdatesFromLibrary(legacyItem, next, prev);
    expect(matchedLegacy).toMatchObject({ customFoodId: 'cf1', name: 'อกไก่ต้มสุก', calories: 396, protein: 72 });

    const unrelated = buildFoodRecordUpdatesFromLibrary({ id: 'rec3', name: 'ข้าวสวย', quantity: 1, portionUnit: 'ทัพพี' }, next, prev);
    expect(unrelated).toBeNull();
  });
});

