import { describe, expect, it } from 'vitest';
import { gramsInUnit, normalizedStoredPreset } from './foodConstants.js';

describe('food catalog compatibility', () => {
  it('recovers unit weights from historical portion descriptions', () => {
    expect(gramsInUnit('1 serving · 150 กรัม')).toBe(150);
    expect(normalizedStoredPreset({ name: 'อาหารที่บันทึกไว้', unit: '120 g' }).gramsPerUnit).toBe(120);
  });
});
