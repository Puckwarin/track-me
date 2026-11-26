import { describe, expect, it } from 'vitest';
import { validateFoodLog, validateFoodPreset } from './foodValidation.js';

describe('food validation', () => {
  it('rejects missing required fields, invalid gross weights, and non-positive quantities', () => {
    expect(validateFoodLog({ name: '', calories: null })).toMatch('ชื่อเมนู');
    expect(validateFoodLog({ name: 'ข้าว', calories: 100, grossMode: true, weighedGrams: 0, ediblePercent: 50 })).toMatch('น้ำหนัก');
    expect(validateFoodLog({ name: 'ข้าว', calories: 100, grossMode: false, quantity: 0 })).toMatch('มากกว่า 0');
    expect(validateFoodLog({ name: 'ข้าว', calories: 100, grossMode: false, quantity: 1 })).toBeNull();
  });

  it('validates edible fraction boundaries and scan confirmation', () => {
    const preset = { name: 'ข้าวโพด', unit: '1 ฝัก', calories: 100, ediblePercent: 100, gramsPerUnit: 200, confirmed: true };
    expect(validateFoodPreset(preset)).toBeNull();
    expect(validateFoodPreset({ ...preset, ediblePercent: 0 })).toMatch('1–100%');
    expect(validateFoodPreset({ ...preset, confirmed: false })).toMatch('ตรวจสอบกับฉลาก');
    expect(validateFoodPreset({ ...preset, protein: -2 })).toMatch('ตั้งแต่ 0');
    expect(validateFoodPreset({ ...preset, gramsPerUnit: -10 })).toMatch('มากกว่า 0');
  });

  it('rejects negative calories, non-finite quantity, and invalid calendar dates', () => {
    expect(validateFoodLog({ name: 'ข้าว', calories: -10, grossMode: false, quantity: 1 })).toMatch('แคลอรี่');
    expect(validateFoodLog({ name: 'ข้าว', calories: 100, grossMode: false, quantity: Number.NaN })).toMatch('มากกว่า 0');
    expect(validateFoodLog({ name: 'ข้าว', calories: 100, grossMode: false, quantity: 1, date: '2026-02-30' })).toMatch('วันที่');
    expect(validateFoodLog({ name: 'ข้าว', calories: 100, grossMode: false, quantity: 1, date: '2026-11-15' })).toBeNull();
  });
});
