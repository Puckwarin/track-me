export function normalizeExpenseKeyword(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ').slice(0, 80);
}

export function suggestExpenseCategory(item, rules, expenseCategories, incomeCategories, historyRecords = []) {
  if (item.type === 'transfer') return null;
  const text = normalizeExpenseKeyword(`${item.merchant || ''} ${item.note || ''}`);
  const merchantKey = normalizeExpenseKeyword(item.merchant);
  const categories = item.type === 'income' ? incomeCategories : expenseCategories;
  const hit = [...(rules || [])].reverse().find(rule => {
    const keyword = normalizeExpenseKeyword(rule?.keyword);
    return keyword && text.includes(keyword) && categories.includes(rule.category);
  });
  if (hit) return hit.category;
  if (merchantKey.length >= 2 && Array.isArray(historyRecords) && historyRecords.length) {
    const scores = new Map();
    for (const record of historyRecords) {
      if (!record || record.type !== item.type || !categories.includes(record.category) || record.category === 'อื่น ๆ') continue;
      const pastMerchant = normalizeExpenseKeyword(record.merchant);
      if (!pastMerchant) continue;
      let weight = 0;
      if (pastMerchant === merchantKey) weight = 3;
      else if (pastMerchant.length >= 3 && merchantKey.includes(pastMerchant)) weight = 2;
      else if (merchantKey.length >= 3 && pastMerchant.includes(merchantKey)) weight = 1;
      if (!weight) continue;
      const prev = scores.get(record.category) || { score: 0, latestDate: '' };
      scores.set(record.category, {
        score: prev.score + weight,
        latestDate: String(record.date || '') > prev.latestDate ? String(record.date || '') : prev.latestDate
      });
    }
    const best = [...scores.entries()].sort((a, b) => b[1].score - a[1].score || b[1].latestDate.localeCompare(a[1].latestDate))[0];
    if (best) return best[0];
  }
  if (item.type === 'expense' && /dlt|กรมการขนส่ง|ภาษีรถ/i.test(text)) return 'รถยนต์/ภาษี';
  if (item.type === 'expense' && /เอไอเอส|ais|เติมเงินมือถือ|ค่าโทรศัพท์/i.test(text)) return 'ค่าโทรศัพท์';
  if (item.type === 'income' && /เงินเดือน|payroll/i.test(text)) return 'เงินเดือน';
  return item.type === 'income' ? 'โอนเข้า/คืนเงิน' : 'อื่น ๆ';
}

export function detectRecurringExpenses(records = [], existingPlans = []) {
  const existingKeys = (existingPlans || [])
    .map(plan => normalizeExpenseKeyword(plan?.merchant))
    .filter(Boolean);

  const groups = new Map();
  for (const record of records || []) {
    if (!record || record.type !== 'expense' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) continue;
    const amount = Number(record.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const key = normalizeExpenseKeyword(record.merchant);
    if (key.length < 2) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...record, amount });
  }

  const candidates = [];
  for (const [key, rows] of groups.entries()) {
    const alreadyPlanned = existingKeys.some(planKey =>
      planKey === key || (planKey.length >= 4 && (key.includes(planKey) || planKey.includes(key)))
    );
    if (alreadyPlanned) continue;

    const months = [...new Set(rows.map(r => r.date.slice(0, 7)))].sort();
    if (months.length < 2) continue;
    if (rows.length / months.length > 2.2) continue;

    const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sortedRows[sortedRows.length - 1];
    const amounts = sortedRows.map(r => r.amount).sort((a, b) => a - b);
    const minAmount = amounts[0];
    const maxAmount = amounts[amounts.length - 1];
    const medianAmount = amounts[Math.floor(amounts.length / 2)];

    const catCounts = new Map();
    for (const row of sortedRows) {
      const c = row.category || 'อื่น ๆ';
      catCounts.set(c, (catCounts.get(c) || 0) + 1);
    }
    const topCategory = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || latest.category || 'บิล/ค่าใช้จ่ายประจำ';
    const isBillCategory = topCategory === 'บิล/ค่าใช้จ่ายประจำ' || topCategory === 'ค่าโทรศัพท์';
    const maxAllowed = isBillCategory
      ? Math.max(medianAmount * 1.85, medianAmount + 500)
      : Math.max(medianAmount * 1.45, medianAmount + 150);
    if (maxAmount > maxAllowed) continue;

    const days = sortedRows.map(r => Number(r.date.slice(8, 10))).filter(d => Number.isInteger(d) && d >= 1 && d <= 31).sort((a, b) => a - b);
    const dayOfMonth = days.length ? days[Math.floor(days.length / 2)] : Number(latest.date.slice(8, 10));
    const avgAmount = Math.round((sortedRows.reduce((sum, r) => sum + r.amount, 0) / sortedRows.length) * 100) / 100;
    const predictedNextDate = advanceRecurringDate(latest.date, 'monthly', dayOfMonth) || latest.date;

    candidates.push({
      key,
      merchant: String(latest.merchant || '').trim(),
      category: topCategory,
      avgAmount,
      minAmount,
      maxAmount,
      lastAmount: latest.amount,
      monthsCount: months.length,
      months,
      lastDate: latest.date,
      dayOfMonth,
      predictedNextDate,
      isVariable: minAmount !== maxAmount
    });
  }

  return candidates.sort((a, b) => b.monthsCount - a.monthsCount || b.avgAmount - a.avgAmount);
}

export function estimateMonthlyRecurringTotal(plans = [], detected = []) {
  const plannedMonthly = (plans || []).reduce((sum, plan) => {
    const amount = Number(plan?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    return sum + (plan.frequency === 'yearly' ? amount / 12 : amount);
  }, 0);
  const detectedMonthly = (detected || []).reduce((sum, item) => {
    const amount = Number(item?.avgAmount);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  const round2 = value => Math.round(value * 100) / 100;
  return {
    plannedMonthly: round2(plannedMonthly),
    detectedMonthly: round2(detectedMonthly),
    totalMonthly: round2(plannedMonthly + detectedMonthly)
  };
}

export function calculateExpenseBudgets(records, budgets, month) {
  return Object.entries(budgets || {})
    .map(([category, rawAmount]) => {
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      const spent = (records || []).reduce((total, record) => {
        if (record.type !== 'expense' || record.category !== category || (record.date || '').slice(0, 7) !== month) return total;
        return total + (Number(record.amount) || 0);
      }, 0);
      const ratio = spent / amount;
      return {
        category,
        amount,
        spent,
        remaining: Math.max(0, amount - spent),
        status: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'within'
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.category.localeCompare(b.category, 'th'));
}

export function advanceRecurringDate(dateString, frequency, scheduledDay) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ''));
  if (!match || !['monthly', 'yearly'].includes(frequency)) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const current = new Date(`${dateString}T00:00:00Z`);
  if (current.getUTCFullYear() !== year || current.getUTCMonth() !== month || current.getUTCDate() !== day) return null;
  const preferredDay = Number.isInteger(scheduledDay) && scheduledDay >= 1 && scheduledDay <= 31 ? scheduledDay : day;
  const targetYear = year + (frequency === 'yearly' ? 1 : Math.floor((month + 1) / 12));
  const targetMonth = frequency === 'yearly' ? month : (month + 1) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(targetYear, targetMonth, Math.min(preferredDay, lastDay)));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`;
}

export function expenseSettingDocId(kind, value) {
  const normalized = normalizeExpenseKeyword(value);
  let first = 2166136261;
  let second = 2654435761;
  for (const char of normalized) {
    first = Math.imul(first ^ char.charCodeAt(0), 16777619) >>> 0;
    second = Math.imul(second ^ char.charCodeAt(0), 2246822519) >>> 0;
  }
  const prefix = kind === 'expense_budget' ? 'expense_budget_' : kind === 'expense_rule' ? 'expense_rule_' : 'expense_recurring_';
  return `${prefix}${first.toString(36)}_${second.toString(36)}`;
}
