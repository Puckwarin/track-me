import { describe, expect, it } from 'vitest';
import {
  buildFoodRecordUpdatesFromLibrary,
  calculateRiceAdjustment,
  defaultFoodInputMode,
  foodLogName,
  foodLogPortion,
  foodLogQuantity,
  foodQuantityFromInput,
  hasFoodLibraryDefinitionChanged,
  riceProfileFromName,
  unitNutritionFor
} from './foodCalculations.js';

describe('food log calculations', () => {
  it('estimates rice already included from restaurant carbs and adds only the remaining Riceberry portion', () => {
    const result = calculateRiceAdjustment({
      shopNutrition: { calories: 230, protein: 20, carbs: 33, fat: 3 },
      riceProfile: 'riceberry',
      targetRiceGrams: 180
    });

    expect(result.estimatedRiceGrams).toBeCloseTo(143.4783, 3);
    expect(result.additionalRiceGrams).toBeCloseTo(36.5217, 3);
    expect(result.nutrition.calories).toBeCloseTo(270.5391, 3);
    expect(result.nutrition.protein).toBeCloseTo(20.9496, 3);
    expect(result.nutrition.carbs).toBeCloseTo(41.4, 3);
    expect(result.nutrition.fat).toBeCloseTo(3.3287, 3);
  });

  it('subtracts side-dish carbs only when supplied and warns when estimated rice already exceeds target', () => {
    const withSideCarbs = calculateRiceAdjustment({
      shopNutrition: { calories: 200, protein: 10, carbs: 33, fat: 5 },
      riceProfile: 'riceberry',
      targetRiceGrams: 180,
      sideCarbs: 10
    });
    expect(withSideCarbs.estimatedRiceGrams).toBeCloseTo(100);
    expect(withSideCarbs.additionalRiceGrams).toBeCloseTo(80);

    const overTarget = calculateRiceAdjustment({
      shopNutrition: { calories: 200, protein: 10, carbs: 60, fat: 5 },
      riceProfile: 'brown',
      targetRiceGrams: 180
    });
    expect(overTarget.additionalRiceGrams).toBe(0);
    expect(overTarget.nutrition).toEqual({ calories: 200, protein: 10, carbs: 60, fat: 5 });
    expect(overTarget.warning).toContain('สูงกว่าเป้าหมาย');
  });

  it('keeps original nutrition when rice cannot be estimated and rejects invalid inputs safely', () => {
    const original = { calories: 200, protein: 10, carbs: 0, fat: 5 };
    const zeroCarbs = calculateRiceAdjustment({ shopNutrition: original, riceProfile: 'riceberry', targetRiceGrams: 180 });
    expect(zeroCarbs).toMatchObject({ valid: true, nutrition: original, estimatedRiceGrams: null, additionalRiceGrams: 0 });
    expect(zeroCarbs.warning).toContain('ประมาณน้ำหนักข้าวไม่ได้');
    expect(calculateRiceAdjustment({ shopNutrition: { ...original, carbs: null }, riceProfile: 'brown', targetRiceGrams: 180 }).valid).toBe(false);
    expect(calculateRiceAdjustment({ shopNutrition: { ...original, carbs: 10 }, riceProfile: 'brown', targetRiceGrams: 180, sideCarbs: 11 }).valid).toBe(false);
    expect(calculateRiceAdjustment({ shopNutrition: original, riceProfile: 'toString', targetRiceGrams: 180 }).valid).toBe(false);
  });

  it('recognizes Riceberry without changing legacy brown-rice name detection', () => {
    expect(riceProfileFromName('ข้าวไรซ์เบอร์รี่')).toBe('riceberry');
    expect(riceProfileFromName('ข้าวกล้อง')).toBe('brown');
    expect(riceProfileFromName('ข้าวสวย')).toBe('white');
  });

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
    expect(foodLogPortion({ name: 'ไข่ต้ม', quantity: 2, portionUnit: '1 ฟอง' })).toBe('×2 (1 ฟอง)');
  });

  it('converts gram-labeled foods without guessing by number size and keeps piece/egg units intact', () => {
    const rice = { name: 'ข้าวสวย', unit: '100 g', gramsPerUnit: 100, calories: 130 };
    expect(defaultFoodInputMode(rice)).toBe('grams');
    const q50 = foodQuantityFromInput(50, rice);
    const q100 = foodQuantityFromInput(100, rice);
    expect(q50).toBe(0.5);
    expect(q100).toBe(1);
    expect(foodLogPortion({ name: 'ข้าวสวย', quantity: q50, portionUnit: rice.unit, gramsPerUnit: rice.gramsPerUnit })).toBe('50 g');
    expect(foodLogPortion({ name: 'ข้าวสวย', quantity: q100, portionUnit: rice.unit, gramsPerUnit: rice.gramsPerUnit })).toBe('100 g');
    expect(foodQuantityFromInput(2, rice, 'unit')).toBe(2);

    const piece = { unit: '1 ชิ้น', gramsPerUnit: 50 };
    expect(defaultFoodInputMode(piece)).toBe('unit');
    expect(foodQuantityFromInput(1, piece)).toBe(1);
    expect(foodQuantityFromInput(100, piece, 'unit')).toBe(100);
    expect(foodQuantityFromInput(100, piece, 'grams')).toBe(2);

    const egg = { name: 'ไข่ต้ม', unit: '1 ฟอง' };
    expect(defaultFoodInputMode(egg)).toBe('unit');
    expect(foodQuantityFromInput(2, egg)).toBe(2);
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

