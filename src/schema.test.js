import { describe, expect, it } from 'vitest';
import { docIdFor, SANITIZERS } from './schema.js';

describe('schema sanitizers', () => {
  it('keeps only recognized food fields and rejects invalid values', () => {
    const result = SANITIZERS.food_records({
      date: '2026-04-10',
      name: 'ข้าว',
      calories: -5,
      protein: 12,
      unexpected: 'private value',
      createdAt: '2026-04-10T00:00:00.000Z'
    });

    expect(result).toMatchObject({ date: '2026-04-10', name: 'ข้าว', calories: 0, protein: 12 });
    expect(result).not.toHaveProperty('unexpected');
    expect(SANITIZERS.food_records({ date: '2026/02/30', name: 'ข้าว' })).toBeNull();
  });

  it('excludes push subscriptions from backups and preserves safe expense IDs', () => {
    expect(SANITIZERS.settings({ id: 'push', subscriptions: [{ endpoint: 'private' }] })).toBeNull();
    expect(docIdFor('expense_records', { id: 'expense_123' }, 'fallback')).toBe('expense_123');
    expect(docIdFor('expense_records', { id: '../invalid' }, 'fallback')).toBe('fallback');
  });

  it('sanitizes and preserves expense setting documents for backup and restore', () => {
    const budget = { id: 'expense_budget_food', kind: 'expense_budget', category: 'อาหาร', amount: 12000 };
    const rule = { id: 'expense_rule_cafe', kind: 'expense_rule', keyword: 'cafe', category: 'เครื่องดื่ม/คาเฟ่' };
    const recurring = {
      id: 'expense_recurring_r1', kind: 'expense_recurring', planId: 'r1', merchant: 'ค่าเช่า',
      category: 'บิล/ค่าใช้จ่ายประจำ', amount: 5000, frequency: 'monthly', nextDate: '2026-04-30', dayOfMonth: 30
    };
    expect(SANITIZERS.settings(budget)).toMatchObject({ kind: 'expense_budget', category: 'อาหาร', amount: 12000 });
    expect(docIdFor('settings', budget, 'fallback')).toBe(budget.id);
    expect(SANITIZERS.settings(rule)).toMatchObject({ kind: 'expense_rule', keyword: 'cafe' });
    expect(docIdFor('settings', rule, 'fallback')).toBe(rule.id);
    expect(SANITIZERS.settings(recurring)).toMatchObject({ kind: 'expense_recurring', planId: 'r1', frequency: 'monthly' });
    expect(docIdFor('settings', recurring, 'fallback')).toBe(recurring.id);
    expect(docIdFor('settings', { ...budget, id: 'expense_budget_../unsafe' }, null)).toBeNull();
    expect(docIdFor('settings', { kind: 'expense_budget', category: 'อาหาร', amount: 100 }, null)).toBeNull();
    expect(docIdFor('settings', { ...budget, id: 'expense_recurring_mismatch' }, null)).toBeNull();
    expect(SANITIZERS.settings({ ...recurring, nextDate: '2026-02-30' })).toBeNull();
    expect(SANITIZERS.expense_records({ date: '2026-04-10', amount: 80, source: 'recurring' })).toMatchObject({ source: 'recurring' });
  });

  it('sanitizes workout reflection/RPE/RIR feedback and planner recentDone', () => {
    const workout = SANITIZERS.workout_records({
      date: '2026-11-15',
      type: 'lower',
      status: 'done',
      feeling: 'energized',
      sessionRpe: 8,
      exerciseFeedback: [
        { name: 'Goblet Squat', section: 'main', rpe: 7, rir: 2, nextAction: 'maintain', nextLabel: 'คงน้ำหนัก' },
        { name: '', section: 'main', rpe: 7 }
      ]
    });
    expect(workout.feeling).toBe('energized');
    expect(workout.sessionRpe).toBe(8);
    expect(workout.exerciseFeedback).toHaveLength(1);
    expect(workout.exerciseFeedback[0]).toMatchObject({ name: 'Goblet Squat', rpe: 7, rir: 2, nextAction: 'maintain' });

    const invalidWorkout = SANITIZERS.workout_records({
      date: '2026-11-15',
      type: 'lower',
      feeling: 'unknown_value',
      sessionRpe: 99
    });
    expect(invalidWorkout.feeling).toBeUndefined();
    expect(invalidWorkout.sessionRpe).toBeUndefined();

    const planner = SANITIZERS.settings({
      id: 'planner',
      routines: [{ id: 'r1', title: 'ล้างจาน', icon: '🍽️', days: [0, 1], weekPattern: 'every' }],
      recentDone: [
        { id: 'r1', title: 'ล้างจาน', icon: '🍽️', date: '2026-11-15' },
        { id: 'bad', title: '', date: 'invalid-date' }
      ]
    });
    expect(planner.recentDone).toEqual([{ id: 'r1', title: 'ล้างจาน', icon: '🍽️', date: '2026-11-15' }]);
  });
});
