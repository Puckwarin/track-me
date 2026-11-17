import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeFoodImage,
  formatImageProgress,
  isLocalNutritionSufficient,
  lookupPer100g,
  lookupPer100gWithProvider,
  runImageBatch
} from './nutrition.js';

describe('image batch progress helpers', () => {
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

  it('formats uploaded count, active step, and percentage clearly', () => {
    expect(formatImageProgress('กำลังประมวลผล', { total: 10, activeIndex: 7, completed: 6, percent: 60 }))
      .toBe('อัปโหลด 10 รูป · กำลังประมวลผล 7/10 (60%)…');
    expect(formatImageProgress('กำลังวิเคราะห์', { total: 4, activeIndex: 4, completed: 4, percent: 100 }))
      .toBe('✓ ประมวลผลครบ 4/4 รูป (100%)');
  });

  it('processes multiple images with bounded concurrency, preserves order, and isolates failures', async () => {
    const files = [{ name: 'a.jpg' }, { name: 'b.jpg' }, { name: 'c.jpg' }];
    const progressEvents = [];
    const { results, errors } = await runImageBatch(
      files,
      async (file, idx) => {
        if (idx === 1) throw new Error('อ่านภาพไม่สำเร็จ');
        return { ok: true, idx };
      },
      info => progressEvents.push(info),
      { concurrency: 2 }
    );

    expect(results).toEqual([
      { index: 0, fileName: 'a.jpg', data: { ok: true, idx: 0 } },
      { index: 2, fileName: 'c.jpg', data: { ok: true, idx: 2 } }
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].fileName).toBe('b.jpg');
    expect(progressEvents[0]).toMatchObject({ total: 3, completed: 0, percent: 0 });
    expect(progressEvents[progressEvents.length - 1]).toMatchObject({ total: 3, completed: 3, percent: 100 });
  });

  it('reuses precheckedLocalLabel in analyzeFoodImage without API keys or duplicate OCR', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const file = { name: 'label.jpg' };

    const partial = await analyzeFoodImage(file, {
      precheckedLocalLabel: { basis: 'per_serving', calories: 140, protein: null, carbs: 20, fat: 3 }
    });
    expect(partial).toMatchObject({ kind: 'label', basis: 'per_serving', calories: 140, carbs: 20, fat: 3 });

    await expect(analyzeFoodImage(file, { precheckedLocalLabel: null })).rejects.toThrow('NO_KEY');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('evaluates local OCR sufficiency with >= 3 of 4 main nutrition fields', () => {
    expect(isLocalNutritionSufficient(null)).toBe(false);
    expect(isLocalNutritionSufficient({ calories: 120, protein: 5, carbs: null, fat: null })).toBe(false);
    expect(isLocalNutritionSufficient({ calories: 120, protein: 5, carbs: 20, fat: null, sugar: null, sodium: null })).toBe(true);
    expect(isLocalNutritionSufficient({ calories: 0, protein: 0, carbs: 10, fat: 0 })).toBe(true);
  });

  it('caches lookupPer100g persistently in localStorage with 30-day TTL and 300-item eviction', async () => {
    localStorage.setItem('gemini_key', 'test-gemini-key');
    const fetchSpy = vi.fn(async url => {
      if (String(url).endsWith('/models')) {
        return new Response(JSON.stringify({
          models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }]
        }));
      }
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({ name: 'กล้วยหอม', calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 }) }]
          }
        }]
      }));
    });
    globalThis.fetch = fetchSpy;

    const first = await lookupPer100g(' กล้วยหอม ');
    expect(first).toMatchObject({ name: 'กล้วยหอม', calories: 89, protein: 1.1 });
    const callsAfterFirst = fetchSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await lookupPer100gWithProvider('กล้วยหอม');
    expect(second).toEqual({
      result: { name: 'กล้วยหอม', calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
      provider: 'cache'
    });
    expect(fetchSpy).toHaveBeenCalledTimes(callsAfterFirst);

    // Expired (>30 days) entry should bypass cache and fetch again
    const stored = JSON.parse(localStorage.getItem('trackme_nutrition_v1'));
    stored['กล้วยหอม'].t = Date.now() - (31 * 864e5);
    // Populate 305 older items to verify 300-item cap eviction when saving new result
    for (let i = 0; i < 305; i++) {
      stored[`เมนูเก่า_${i}`] = { t: 1000 + i, v: { name: `เมนูเก่า_${i}`, calories: 100, protein: 1, carbs: 1, fat: 1 } };
    }
    localStorage.setItem('trackme_nutrition_v1', JSON.stringify(stored));

    await lookupPer100g('กล้วยหอม');
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    const trimmed = JSON.parse(localStorage.getItem('trackme_nutrition_v1'));
    expect(Object.keys(trimmed).length).toBeLessThanOrEqual(300);
    expect(trimmed['เมนูเก่า_0']).toBeUndefined();
    expect(trimmed['กล้วยหอม']).toBeDefined();
  });
});


