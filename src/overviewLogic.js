import { localDateStr, parseLocal, round1, shiftMonth } from './util.js';

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : (Number.isFinite(Number(v)) ? Number(v) : 0));

export function buildMonthKeys(monthsCount = 6, today = localDateStr()) {
  const count = [3, 6, 12].includes(Number(monthsCount)) ? Number(monthsCount) : 6;
  const currentYm = String(today || localDateStr()).slice(0, 7);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(shiftMonth(currentYm, -i));
  }
  return out;
}

export function formatShortMonthTh(ym) {
  try {
    return parseLocal(`${ym}-01`).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
  } catch {
    return ym;
  }
}

export function aggregateMonthlyOverview({
  monthsCount = 6,
  today = localDateStr(),
  food = [],
  workouts = [],
  body = [],
  expenses = []
} = {}) {
  const monthKeys = buildMonthKeys(monthsCount, today);
  const buckets = Object.fromEntries(monthKeys.map(ym => [ym, {
    ym,
    label: formatShortMonthTh(ym),
    weights: [],
    foodByDay: new Map(),
    workoutCount: 0,
    workoutMinutes: 0,
    workoutKcal: 0,
    expenseTotal: 0,
    incomeTotal: 0,
    expenseCount: 0
  }]));

  for (const row of body || []) {
    const ym = String(row?.date || '').slice(0, 7);
    const b = buckets[ym];
    if (!b || typeof row?.weight !== 'number' || !Number.isFinite(row.weight)) continue;
    b.weights.push({ date: String(row.date), weight: row.weight });
  }

  for (const row of food || []) {
    const date = String(row?.date || '');
    const ym = date.slice(0, 7);
    const b = buckets[ym];
    if (!b || !date) continue;
    const prev = b.foodByDay.get(date) || { cal: 0, protein: 0 };
    prev.cal += num(row.calories);
    prev.protein += num(row.protein);
    b.foodByDay.set(date, prev);
  }

  for (const row of workouts || []) {
    const ym = String(row?.date || '').slice(0, 7);
    const b = buckets[ym];
    if (!b || row?.status === 'planned') continue;
    b.workoutCount += 1;
    b.workoutMinutes += Math.max(0, Math.round(num(row.durationMin)));
    b.workoutKcal += Math.max(0, Math.round(num(row.estKcal)));
  }

  for (const row of expenses || []) {
    const ym = String(row?.date || '').slice(0, 7);
    const b = buckets[ym];
    if (!b) continue;
    const amount = Math.max(0, num(row.amount));
    if (row.type === 'income') {
      b.incomeTotal += amount;
    } else {
      b.expenseTotal += amount;
    }
    b.expenseCount += 1;
  }

  const months = monthKeys.map(ym => {
    const b = buckets[ym];
    const sortedWeights = b.weights.slice().sort((a, c) => a.date.localeCompare(c.date));
    const weightAvg = sortedWeights.length
      ? round1(sortedWeights.reduce((sum, x) => sum + x.weight, 0) / sortedWeights.length)
      : null;
    const weightLatest = sortedWeights.length ? round1(sortedWeights[sortedWeights.length - 1].weight) : null;

    const foodDaysList = [...b.foodByDay.values()];
    const foodDays = foodDaysList.length;
    const calAvgPerLoggedDay = foodDays
      ? Math.round(foodDaysList.reduce((sum, d) => sum + d.cal, 0) / foodDays)
      : null;
    const proteinAvgPerLoggedDay = foodDays
      ? round1(foodDaysList.reduce((sum, d) => sum + d.protein, 0) / foodDays)
      : null;

    const expenseTotal = Math.round(b.expenseTotal);
    const incomeTotal = Math.round(b.incomeTotal);

    return {
      ym,
      label: b.label,
      weightAvg,
      weightLatest,
      weightCount: sortedWeights.length,
      foodDays,
      calAvgPerLoggedDay,
      proteinAvgPerLoggedDay,
      workoutCount: b.workoutCount,
      workoutMinutes: b.workoutMinutes,
      workoutKcal: b.workoutKcal,
      expenseTotal,
      incomeTotal,
      netTotal: incomeTotal - expenseTotal,
      expenseCount: b.expenseCount
    };
  });

  const weightMonths = months.filter(m => m.weightLatest !== null);
  const firstWeight = weightMonths[0]?.weightLatest ?? null;
  const latestWeight = weightMonths[weightMonths.length - 1]?.weightLatest ?? null;
  const weightChange = firstWeight !== null && latestWeight !== null && weightMonths.length >= 2
    ? round1(latestWeight - firstWeight)
    : null;

  const calMonths = months.filter(m => m.calAvgPerLoggedDay !== null);
  const totalLoggedDays = months.reduce((s, m) => s + m.foodDays, 0);
  const weightedCalSum = months.reduce((s, m) => s + (m.calAvgPerLoggedDay || 0) * m.foodDays, 0);
  const avgCalPerDay = totalLoggedDays ? Math.round(weightedCalSum / totalLoggedDays) : null;

  return {
    months,
    summary: {
      startYm: monthKeys[0],
      endYm: monthKeys[monthKeys.length - 1],
      latestWeight,
      weightChange,
      avgCalPerDay,
      foodMonthCount: calMonths.length,
      totalLoggedDays,
      totalWorkouts: months.reduce((s, m) => s + m.workoutCount, 0),
      totalWorkoutMinutes: months.reduce((s, m) => s + m.workoutMinutes, 0),
      totalExpense: months.reduce((s, m) => s + m.expenseTotal, 0),
      totalIncome: months.reduce((s, m) => s + m.incomeTotal, 0)
    }
  };
}
