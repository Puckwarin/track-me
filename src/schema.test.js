import { describe, expect, it, vi } from 'vitest';
import { COLLECTIONS } from './firebase.js';
import { docIdFor, SANITIZERS } from './schema.js';
import { localDateStr } from './util.js';

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
      routines: [
        { id: 'r1', title: 'ล้างจาน', icon: '🍽️', days: [0, 1], weekPattern: 'every' },
        { id: 'r2', title: 'ไปพบสัตวแพทย์', icon: '🐶', weekPattern: 'once', date: '2026-11-20', days: [] }
      ],
      recentDone: [
        { id: 'r1', title: 'ล้างจาน', icon: '🍽️', date: '2026-11-15' },
        { id: 'bad', title: '', date: 'invalid-date' }
      ]
    });
    expect(planner.routines[1]).toMatchObject({ id: 'r2', weekPattern: 'once', date: '2026-11-20' });
    expect(planner.recentDone).toEqual([{ id: 'r1', title: 'ล้างจาน', icon: '🍽️', date: '2026-11-15' }]);
  });

  it('sanitizes Zepp sleep/steps, dog symptom logs, assistant notes, and user feedback', () => {
    const zeppBody = SANITIZERS.body_records({
      date: '2026-11-10',
      sleepHours: 7.5,
      sleepMinutes: 450,
      deepSleepMin: 110,
      lightSleepMin: 280,
      remSleepMin: 60,
      bedTime: '23:20',
      wakeTime: '06:50',
      steps: 8420,
      distanceKm: 5.64,
      activeKcal: 285,
      source: 'zepp_csv'
    });
    expect(zeppBody).toMatchObject({
      date: '2026-11-10',
      sleepHours: 7.5,
      sleepMinutes: 450,
      steps: 8420,
      distanceKm: 5.64,
      source: 'zepp_csv'
    });
    expect(SANITIZERS.body_records({ date: '2026-11-10', sleepHours: 30 })).not.toHaveProperty('sleepHours');
    expect(SANITIZERS.body_records({ date: '2026-02-30', sleepHours: 7 })).toBeNull();

    const petSymptom = SANITIZERS.pet_care_records({
      petId: 'dog1',
      recordKind: 'symptom',
      type: 'อาการน้องหมา',
      date: '2026-11-10',
      value: 38.9,
      symptoms: { appetite: 2, energy: 1, vomit: 0, extraBad: 9 },
      done: true
    });
    expect(petSymptom).toMatchObject({
      recordKind: 'symptom',
      value: 38.9,
      symptoms: { appetite: 2, energy: 1, vomit: 0 }
    });
    expect(petSymptom.symptoms).not.toHaveProperty('extraBad');

    const noteDoc = {
      id: 'note_abc',
      kind: 'assistant_note',
      name: 'วัคซีนรอบหน้า',
      category: 'น้องหมา',
      note: 'พามูมู่ฉีดเข็มกระตุ้นเดือนหน้า',
      date: '2026-11-10',
      source: 'assistant'
    };
    expect(SANITIZERS.settings(noteDoc)).toMatchObject({ kind: 'assistant_note', name: 'วัคซีนรอบหน้า' });
    expect(docIdFor('settings', noteDoc, null)).toBe('note_abc');

    const fbDoc = {
      id: 'feedback_xyz',
      kind: 'user_feedback',
      category: 'feature',
      value: 5,
      note: 'อยากได้นำเข้า Zepp CSV แล้วได้ใช้จริง',
      type: 'น้ำหนัก',
      date: '2026-11-10',
      status: 'new'
    };
    expect(SANITIZERS.settings(fbDoc)).toMatchObject({ kind: 'user_feedback', category: 'feature', value: 5 });
    expect(docIdFor('settings', fbDoc, null)).toBe('feedback_xyz');
  });

  it('keeps firebase COLLECTIONS aligned with schema SANITIZERS including expense_records', () => {
    expect(COLLECTIONS).toContain('expense_records');
    expect(new Set(COLLECTIONS)).toEqual(new Set(Object.keys(SANITIZERS)));
  });

  it('uses local calendar date rather than UTC date when note/feedback date is omitted', () => {
    vi.useFakeTimers();
    try {
      // 00:30 Asia/Bangkok (+07:00) is 17:30 previous UTC day
      vi.setSystemTime(new Date('2026-11-15T17:30:00.000Z'));
      const expectedLocal = localDateStr();
      expect(SANITIZERS.settings({ kind: 'assistant_note', note: 'test note' }).date).toBe(expectedLocal);
      expect(SANITIZERS.settings({ kind: 'user_feedback', note: 'test feedback' }).date).toBe(expectedLocal);
    } finally {
      vi.useRealTimers();
    }
  });
});
