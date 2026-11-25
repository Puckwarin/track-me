import { describe, expect, it } from 'vitest';
import { findExistingExerciseImage, getNextDayRecoveryTargets } from './workout.js';

describe('workout exercise auto-link and next-day recovery helpers', () => {
  it('reuses imageUrl from newest saved workout, saved templates, or cache case-insensitively', () => {
    const workouts = [
      {
        date: '2026-11-10',
        sections: {
          main: [{ name: 'Goblet Squat', imageUrl: 'https://example.com/old-squat.jpg' }]
        }
      },
      {
        date: '2026-11-20',
        sections: {
          main: [{ name: 'Goblet Squat', imageUrl: 'https://example.com/new-squat.jpg' }]
        }
      }
    ];
    const templates = [
      {
        name: 'Day B',
        sections: {
          warmup: [{ name: 'Cat-Cow', imageUrl: 'https://example.com/cat-cow.jpg' }]
        }
      }
    ];
    const cachedLookup = name => (String(name).toLowerCase() === 'plank' ? { url: 'https://example.com/plank.gif' } : null);

    expect(findExistingExerciseImage('  goblet squat ', { workouts, templates, cachedLookup })).toBe('https://example.com/new-squat.jpg');
    expect(findExistingExerciseImage('CAT-COW', { workouts, templates, cachedLookup })).toBe('https://example.com/cat-cow.jpg');
    expect(findExistingExerciseImage('Plank', { workouts, templates, cachedLookup })).toBe('https://example.com/plank.gif');
    expect(findExistingExerciseImage('Unknown Move', { workouts, templates, cachedLookup })).toBe('');
    expect(findExistingExerciseImage('', { workouts, templates, cachedLookup })).toBe('');
  });

  it('returns completed workouts from the previous day when selectedDate <= today', () => {
    const workouts = [
      { id: 'w1', date: '2026-11-23', status: 'done', title: 'Leg Day' },
      { id: 'w2', date: '2026-11-23', status: 'planned', title: 'Planned Walk' },
      { id: 'w3', date: '2026-11-22', status: 'done', title: 'Older' }
    ];

    expect(getNextDayRecoveryTargets(workouts, '2026-11-24', '2026-11-24').map(w => w.id)).toEqual(['w1']);
    expect(getNextDayRecoveryTargets(workouts, '2026-11-25', '2026-11-24')).toEqual([]);
    expect(getNextDayRecoveryTargets(workouts, '2026-11-23', '2026-11-24').map(w => w.id)).toEqual(['w3']);
  });
});
