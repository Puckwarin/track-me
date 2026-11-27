import { beforeEach, describe, expect, it } from 'vitest';
import {
  OVERVIEW_CACHE_KEY,
  OVERVIEW_CACHE_TTL_MS,
  aggregateMonthlyOverview,
  buildMonthKeys,
  clearOverviewCacheForUid,
  readOverviewCache,
  summarizeFinanceRange,
  summarizePeriodMetrics,
  writeOverviewCache
} from './overviewLogic.js';

describe('overviewLogic monthly dashboard aggregation and localStorage cache', () => {
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

  it('builds month keys across year boundaries for 3, 6, and 12 months', () => {
    expect(buildMonthKeys(3, '2026-02-15')).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(buildMonthKeys(6, '2026-04-01')).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'
    ]);
    expect(buildMonthKeys(12, '2026-11-17')).toHaveLength(12);
    expect(buildMonthKeys(12, '2026-11-17')[0]).toBe('2025-12');
  });

  it('aggregates weight, logged-day average calories, completed workouts, and expenses vs income while excluding transfers', () => {
    const result = aggregateMonthlyOverview({
      monthsCount: 3,
      today: '2026-11-17',
      body: [
        { date: '2026-09-05', weight: 56.0 },
        { date: '2026-09-25', weight: 55.4 },
        { date: '2026-11-10', weight: 54.1 },
        { date: '2026-11-15', weight: 53.9 },
        { date: '2026-11-16', sleepHours: 7.5 } // sleep-only row without weight
      ],
      food: [
        { date: '2026-10-01', calories: 600, protein: 30 },
        { date: '2026-10-01', calories: 1000, protein: 50 }, // day 1 total: 1600 kcal, 80g
        { date: '2026-10-02', calories: 2000, protein: 100 } // day 2 total: 2000 kcal, 100g -> avg 1800 kcal
      ],
      workouts: [
        { date: '2026-10-10', status: 'done', durationMin: 45, estKcal: 300, intensity: 'moderate', sessionRpe: 7 },
        { date: '2026-10-12', status: 'planned', durationMin: 60, estKcal: 400 },
        {
          date: '2026-11-03',
          status: 'done',
          durationMin: null,
          estKcal: 210,
          intensity: 'light',
          effortLevel: 'easy',
          performedSets: [
            { section: 'warmup', repUnit: 'min', reps: 5, completed: true },
            { section: 'main', repUnit: 'min', reps: 25, completed: true }
          ]
        }
      ],
      expenses: [
        { date: '2026-11-01', type: 'income', amount: 30000, category: 'เงินเดือน' },
        { date: '2026-11-02', type: 'expense', amount: 450, category: 'อาหาร' },
        { date: '2026-11-04', type: 'transfer', amount: 12000, category: 'โอนย้ายบัญชี' },
        { date: '2026-11-05', type: 'expense', amount: 1550, category: 'ของใช้' }
      ]
    });

    expect(result.months).toHaveLength(3);
    expect(result.months[0]).toMatchObject({
      ym: '2026-09',
      weightAvg: 55.7,
      weightLatest: 55.4,
      foodDays: 0,
      calAvgPerLoggedDay: null,
      workoutCount: 0,
      expenseTotal: 0
    });
    expect(result.months[1]).toMatchObject({
      ym: '2026-10',
      weightAvg: null,
      foodDays: 2,
      calAvgPerLoggedDay: 1800,
      avgKcal: 1800,
      proteinAvgPerLoggedDay: 90,
      workoutCount: 1,
      workoutMinutes: 45,
      workoutAvgRpe: 7
    });
    expect(result.months[2]).toMatchObject({
      ym: '2026-11',
      weightAvg: 54,
      weightLatest: 53.9,
      workoutCount: 1,
      workoutMinutes: 30,
      expenseTotal: 2000,
      incomeTotal: 30000,
      netTotal: 28000,
      net: 28000,
      expenseCount: 3
    });

    expect(result.summary).toMatchObject({
      latestWeight: 53.9,
      weightChange: -1.5,
      avgCalPerDay: 1800,
      totalLoggedDays: 2,
      totalWorkouts: 2,
      totalWorkoutMinutes: 75,
      totalExpense: 2000,
      totalIncome: 30000
    });
  });

  it('summarizes finance ranges without counting transfers and aggregates period metrics consistently', () => {
    const fin = summarizeFinanceRange([
      { date: '2026-11-01', type: 'income', amount: 5000, category: 'เงินเดือน' },
      { date: '2026-11-02', type: 'expense', amount: 300, category: 'อาหาร' },
      { date: '2026-11-03', type: 'transfer', amount: 2500, category: 'โอนย้ายบัญชี' },
      { date: '2026-11-04', type: 'expense', amount: 200, category: 'เดินทาง' }
    ], '2026-11-01', '2026-11-07');

    expect(fin).toEqual({
      count: 3,
      income: 5000,
      expense: 500,
      net: 4500,
      topCats: [['อาหาร', 300], ['เดินทาง', 200]]
    });

    const metrics = summarizePeriodMetrics({
      start: '2026-11-09',
      end: '2026-11-15',
      prevStart: '2026-11-02',
      prevEnd: '2026-11-08',
      body: [
        { date: '2026-11-05', weight: 56.0 },
        { date: '2026-11-10', weight: 55.4, sleepHours: 7.5, steps: 8200 },
        { date: '2026-11-14', weight: 55.0, sleepMinutes: 420, steps: 9800 }
      ],
      workouts: [
        { date: '2026-11-11', status: 'done', durationMin: 40, estKcal: 250, type: 'strength' },
        { date: '2026-11-12', status: 'planned', durationMin: 30 }
      ],
      symptoms: [
        { date: '2026-11-10', symptoms: { fatigue: 2 } },
        { date: '2026-11-11', symptoms: { fatigue: 0 } }
      ],
      period: [
        { id: 'p1', start: '2026-11-08', end: '2026-11-11' }
      ]
    });

    expect(metrics.weight).toMatchObject({ count: 2, avg: 55.2, prevAvg: 56, delta: -0.8, first: 55.4, last: 55 });
    expect(metrics.sleep).toMatchObject({ count: 2, avg: 7.3 });
    expect(metrics.steps).toMatchObject({ count: 2, avg: 9000, total: 18000 });
    expect(metrics.workouts.summary.count).toBe(1);
    expect(metrics.symptomDays).toBe(1);
    expect(metrics.periodCount).toBe(1);
  });

  it('handles empty inputs safely', () => {
    const empty = aggregateMonthlyOverview({ monthsCount: 6, today: '2026-11-17' });
    expect(empty.months).toHaveLength(6);
    expect(empty.summary).toMatchObject({
      latestWeight: null,
      weightChange: null,
      avgCalPerDay: null,
      totalWorkouts: 0,
      totalExpense: 0
    });
  });

  it('persists compact overview food and summary per uid/range in localStorage, expires after TTL, and clears per uid', () => {
    const baseNow = 1_700_000_000_000;
    const summarySnapshot = aggregateMonthlyOverview({
      monthsCount: 6,
      today: '2026-11-17',
      food: [{ date: '2026-11-10', calories: 1500, protein: 70 }]
    });

    writeOverviewCache('u1', 6, {
      today: '2026-11-17',
      food: [{ id: 'ignored', date: '2026-11-10', calories: 1500, protein: 70, note: 'drop me' }],
      overviewSummary: summarySnapshot,
      now: baseNow
    });

    const hit = readOverviewCache('u1', 6, { today: '2026-11-17', now: baseNow + 60_000 });
    expect(hit?.fresh).toBe(true);
    expect(hit?.food).toEqual([{ date: '2026-11-10', calories: 1500, protein: 70 }]);
    expect(hit?.overviewSummary?.summary?.avgCalPerDay).toBe(1500);

    // Month window shift misses cache cleanly
    expect(readOverviewCache('u1', 6, { today: '2026-12-01', now: baseNow + 60_000 })).toBeNull();

    // Past TTL returns stale cache (`fresh: false`) so UI can still show offline fallback
    const stale = readOverviewCache('u1', 6, {
      today: '2026-11-17',
      now: baseNow + OVERVIEW_CACHE_TTL_MS + 1000
    });
    expect(stale?.fresh).toBe(false);
    expect(stale?.food).toHaveLength(1);

    // Evicts oldest entries beyond cap (6 entries) and clears only target uid
    for (let i = 0; i < 8; i++) {
      writeOverviewCache(`u_${i}`, 3, { today: '2026-11-17', food: [], now: baseNow + i });
    }
    const stored = JSON.parse(localStorage.getItem(OVERVIEW_CACHE_KEY));
    expect(Object.keys(stored).length).toBeLessThanOrEqual(6);

    clearOverviewCacheForUid('u_7');
    expect(readOverviewCache('u_7', 3, { today: '2026-11-17', now: baseNow + 100 })).toBeNull();
    expect(readOverviewCache('u_6', 3, { today: '2026-11-17', now: baseNow + 100 })).not.toBeNull();
  });
});
