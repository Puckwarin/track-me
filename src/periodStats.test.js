import { describe, expect, it } from 'vitest';
import { periodStats } from './period.js';

describe('menstrual cycle statistics', () => {
  it('calculates recent average cycle and duration and predicts the next start', () => {
    expect(periodStats([
      { start: '2026-01-01', end: '2026-01-05' },
      { start: '2026-01-29', end: '2026-02-02' },
      { start: '2026-02-26', end: null }
    ])).toEqual({
      lastStart: '2026-02-26',
      lastEnd: null,
      avgCycle: 28,
      avgDur: 5,
      next: '2026-03-26',
      count: 3
    });
  });

  it('ignores entries without a start date and returns null when no cycles exist', () => {
    expect(periodStats([{ end: '2026-01-05' }])).toBeNull();
    expect(periodStats([{ start: '2026-01-01' }])).toMatchObject({ avgCycle: null, avgDur: null, next: null });
  });
});
