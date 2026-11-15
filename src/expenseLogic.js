export function normalizeExpenseKeyword(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ').slice(0, 80);
}

export function suggestExpenseCategory(item, rules, expenseCategories, incomeCategories) {
  if (item.type === 'transfer') return null;
  const text = normalizeExpenseKeyword(`${item.merchant || ''} ${item.note || ''}`);
  const categories = item.type === 'income' ? incomeCategories : expenseCategories;
  const hit = [...(rules || [])].reverse().find(rule => {
    const keyword = normalizeExpenseKeyword(rule?.keyword);
    return keyword && text.includes(keyword) && categories.includes(rule.category);
  });
  if (hit) return hit.category;
  if (item.type === 'expense' && /dlt|กรมการขนส่ง|ภาษีรถ/i.test(text)) return 'รถยนต์/ภาษี';
  if (item.type === 'expense' && /เอไอเอส|ais|เติมเงินมือถือ|ค่าโทรศัพท์/i.test(text)) return 'ค่าโทรศัพท์';
  if (item.type === 'income' && /เงินเดือน|payroll/i.test(text)) return 'เงินเดือน';
  return item.type === 'income' ? 'โอนเข้า/คืนเงิน' : 'อื่น ๆ';
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
