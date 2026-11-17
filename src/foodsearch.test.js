import { beforeEach, describe, expect, it, vi } from 'vitest';
import { barcodeOff, searchOff, searchUsda, usdaCacheKey } from './foodsearch.js';

describe('foodsearch persistent cache (USDA English-normalized + Open Food Facts)', () => {
  beforeEach(() => {
    if (!globalThis.localStorage) {
      const store = new Map();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: k => store.get(k) ?? null,
          setItem: (k, v) => store.set(k, String(v)),
          removeItem: k => store.delete(k),
          clear: () => store.clear()
        }
      });
    }
    localStorage.clear();
  });

  it('normalizes USDA cache keys via translateThaiFoodQuery and caches USDA hits for 7 days', async () => {
    expect(usdaCacheKey('อกไก่')).toBe('usda|chicken breast');
    expect(usdaCacheKey('  อกไก่   ')).toBe('usda|chicken breast');
    expect(usdaCacheKey('Chicken Breast')).toBe('usda|chicken breast');

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      foods: [{
        fdcId: 171477,
        description: 'Chicken, broiler or fryers, breast, meat only, cooked, roasted',
        foodNutrients: [
          { nutrientNumber: '208', value: 165 },
          { nutrientNumber: '203', value: 31 },
          { nutrientNumber: '205', value: 0 },
          { nutrientNumber: '204', value: 3.6 }
        ]
      }]
    })));
    globalThis.fetch = fetchSpy;

    const first = await searchUsda('อกไก่');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ source: 'usda', per100: { calories: 165, protein: 31 } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Same food in English hits the exact translated USDA cache key without fetching
    const second = await searchUsda('Chicken Breast');
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('caches Open Food Facts search and barcode lookups in trackme_foodsearch_v1', async () => {
    const fetchSpy = vi.fn(async url => {
      if (String(url).includes('/api/v2/product/8851234567890.json')) {
        return new Response(JSON.stringify({
          status: 1,
          product: {
            code: '8851234567890',
            product_name: 'นมอัลมอนด์',
            brands: 'Blue Diamond',
            nutriments: { 'energy-kcal_100g': 25, proteins_100g: 1, carbohydrates_100g: 1.5, fat_100g: 2 }
          }
        }));
      }
      return new Response(JSON.stringify({
        hits: [{
          code: '111',
          product_name: 'กราโนล่า',
          brands: 'Diamond Grains',
          nutriments: { 'energy-kcal_100g': 420, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 14 }
        }]
      }));
    });
    globalThis.fetch = fetchSpy;

    const offFirst = await searchOff('กราโนล่า');
    expect(offFirst).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const offSecond = await searchOff('  กราโนล่า ');
    expect(offSecond).toEqual(offFirst);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const barcodeFirst = await barcodeOff('8851234567890');
    expect(barcodeFirst).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const barcodeSecond = await barcodeOff('8851234567890');
    expect(barcodeSecond).toEqual(barcodeFirst);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
