import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findExerciseImage } from './exerciseMedia.js';

describe('exerciseMedia persistent cache', () => {
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

  it('caches resolved exercise image in trackme_eximg_v1 and skips refetch on subsequent normalized match', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify([
      { name: 'Barbell Squat', images: ['Barbell_Squat/0.jpg'] },
      { name: 'Dumbbell Goblet Squat', images: ['Dumbbell_Goblet_Squat/0.jpg'] }
    ])));
    globalThis.fetch = fetchSpy;

    const first = await findExerciseImage('Barbell Squat');
    expect(first).toEqual({
      name: 'Barbell Squat',
      url: 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg'
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Subsequent call with normalized-equivalent name reads from localStorage cache without calling fetch again
    const second = await findExerciseImage('  barbell-squat! ');
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('trackme_eximg_v1'))['barbell squat']).toMatchObject(first);
  });
});
