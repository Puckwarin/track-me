import { describe, expect, it } from 'vitest';
import { advanceRecurringDate, calculateExpenseBudgets, suggestExpenseCategory } from './expenseLogic.js';

const expenseCategories = ['อาหาร', 'เดินทาง', 'รถยนต์/ภาษี', 'อื่น ๆ'];
const incomeCategories = ['เงินเดือน', 'อื่น ๆ'];

describe('expense logic', () => {
  it('uses the latest matching learned rule only when its category fits the transaction type', () => {
    const rules = [
      { keyword: 'cafe', category: 'อาหาร' },
      { keyword: 'Cafe', category: 'เดินทาง' }
    ];
    expect(suggestExpenseCategory({ type: 'expense', merchant: 'Cafe Amazon' }, rules, expenseCategories, incomeCategories)).toBe('เดินทาง');
    expect(suggestExpenseCategory({ type: 'income', merchant: 'Cafe refund' }, rules, expenseCategories, incomeCategories)).toBe('โอนเข้า/คืนเงิน');
    expect(suggestExpenseCategory({ type: 'transfer', merchant: 'Cafe' }, rules, expenseCategories, incomeCategories)).toBeNull();
  });

  it('calculates monthly budget usage from expenses only and marks near/over budgets', () => {
    const records = [
      { type: 'expense', category: 'อาหาร', date: '2026-04-02', amount: 80 },
      { type: 'income', category: 'อาหาร', date: '2026-04-03', amount: 100 },
      { type: 'expense', category: 'อาหาร', date: '2026-03-30', amount: 100 },
      { type: 'expense', category: 'เดินทาง', date: '2026-04-04', amount: 120 }
    ];
    expect(calculateExpenseBudgets(records, { 'อาหาร': 100, 'เดินทาง': 100 }, '2026-04')).toEqual([
      { category: 'เดินทาง', amount: 100, spent: 120, remaining: 0, status: 'over' },
      { category: 'อาหาร', amount: 100, spent: 80, remaining: 20, status: 'near' }
    ]);
  });

  it('advances monthly schedules across short months without losing the scheduled day', () => {
    expect(advanceRecurringDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(advanceRecurringDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(advanceRecurringDate('2024-02-29', 'yearly', 29)).toBe('2025-02-28');
    expect(advanceRecurringDate('2026-02-30', 'monthly', 31)).toBeNull();
  });
});
