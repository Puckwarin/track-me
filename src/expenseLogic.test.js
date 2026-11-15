import { describe, expect, it } from 'vitest';
import { GROUPS } from './categories.js';
import {
  advanceRecurringDate,
  calculateExpenseBudgets,
  detectRecurringExpenses,
  estimateMonthlyRecurringTotal,
  suggestExpenseCategory
} from './expenseLogic.js';

const expenseCategories = ['อาหาร', 'เครื่องดื่ม/คาเฟ่', 'เดินทาง', 'รถยนต์/ภาษี', 'บิล/ค่าใช้จ่ายประจำ', 'ค่าโทรศัพท์', 'อื่น ๆ'];
const incomeCategories = ['เงินเดือน', 'อื่น ๆ'];

describe('expense logic', () => {
  it('places expense first in the Care tab navigation group', () => {
    expect(GROUPS.care[0]).toBe('expense');
  });

  it('uses the latest matching learned rule only when its category fits the transaction type', () => {
    const rules = [
      { keyword: 'cafe', category: 'อาหาร' },
      { keyword: 'Cafe', category: 'เดินทาง' }
    ];
    expect(suggestExpenseCategory({ type: 'expense', merchant: 'Cafe Amazon' }, rules, expenseCategories, incomeCategories)).toBe('เดินทาง');
    expect(suggestExpenseCategory({ type: 'income', merchant: 'Cafe refund' }, rules, expenseCategories, incomeCategories)).toBe('โอนเข้า/คืนเงิน');
    expect(suggestExpenseCategory({ type: 'transfer', merchant: 'Cafe' }, rules, expenseCategories, incomeCategories)).toBeNull();
  });

  it('suggests category automatically from historical expense records when no explicit rule exists', () => {
    const history = [
      { type: 'expense', merchant: 'ป้าแดงข้าวแกง', category: 'อาหาร', date: '2026-09-10' },
      { type: 'expense', merchant: 'ป้าแดงข้าวแกง', category: 'อาหาร', date: '2026-09-12' },
      { type: 'expense', merchant: 'ป้าแดงข้าวแกง', category: 'อื่น ๆ', date: '2026-09-15' }
    ];
    expect(suggestExpenseCategory({ type: 'expense', merchant: 'ป้าแดงข้าวแกง' }, [], expenseCategories, incomeCategories, history)).toBe('อาหาร');
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

  it('detects monthly repeating expenses across >= 2 months while excluding planned items and noisy daily shops', () => {
    const records = [
      // Recurring fixed subscription across 3 months
      { type: 'expense', merchant: 'Netflix', category: 'บิล/ค่าใช้จ่ายประจำ', date: '2026-08-15', amount: 419 },
      { type: 'expense', merchant: 'Netflix', category: 'บิล/ค่าใช้จ่ายประจำ', date: '2026-09-15', amount: 419 },
      { type: 'expense', merchant: 'Netflix', category: 'บิล/ค่าใช้จ่ายประจำ', date: '2026-10-15', amount: 419 },
      // Variable monthly utility bill across 2 months
      { type: 'expense', merchant: 'การไฟฟ้านครหลวง', category: 'บิล/ค่าใช้จ่ายประจำ', date: '2026-09-20', amount: 900 },
      { type: 'expense', merchant: 'การไฟฟ้านครหลวง', category: 'บิล/ค่าใช้จ่ายประจำ', date: '2026-10-20', amount: 1100 },
      // Already configured recurring plan -> should be excluded
      { type: 'expense', merchant: 'ค่าเช่าห้อง', category: 'บิล/ค่าใช้จ่ายประจำ', date: '2026-09-01', amount: 6500 },
      { type: 'expense', merchant: 'ค่าเช่าห้อง', category: 'บิล/ค่าใช้จ่ายประจำ', date: '2026-10-01', amount: 6500 },
      // Frequent irregular convenience store purchases -> should be excluded
      { type: 'expense', merchant: '7-Eleven', category: 'อาหาร', date: '2026-09-02', amount: 45 },
      { type: 'expense', merchant: '7-Eleven', category: 'อาหาร', date: '2026-09-05', amount: 220 },
      { type: 'expense', merchant: '7-Eleven', category: 'อาหาร', date: '2026-09-10', amount: 65 },
      { type: 'expense', merchant: '7-Eleven', category: 'อาหาร', date: '2026-10-03', amount: 30 },
      { type: 'expense', merchant: '7-Eleven', category: 'อาหาร', date: '2026-10-11', amount: 480 }
    ];
    const existingPlans = [{ merchant: 'ค่าเช่าห้อง', amount: 6500, frequency: 'monthly' }];

    const detected = detectRecurringExpenses(records, existingPlans);
    expect(detected.map(d => d.merchant)).toEqual(['Netflix', 'การไฟฟ้านครหลวง']);
    expect(detected[0]).toMatchObject({
      merchant: 'Netflix',
      avgAmount: 419,
      monthsCount: 3,
      predictedNextDate: '2026-11-15',
      isVariable: false
    });
    expect(detected[1]).toMatchObject({
      merchant: 'การไฟฟ้านครหลวง',
      avgAmount: 1000,
      minAmount: 900,
      maxAmount: 1100,
      monthsCount: 2,
      isVariable: true
    });

    const summary = estimateMonthlyRecurringTotal(
      [{ amount: 6500, frequency: 'monthly' }, { amount: 12000, frequency: 'yearly' }],
      detected
    );
    expect(summary).toEqual({
      plannedMonthly: 7500,
      detectedMonthly: 1419,
      totalMonthly: 8919
    });
  });
});
