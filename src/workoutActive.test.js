import { describe, expect, it } from 'vitest';
import {
  buildExerciseFeedbackSummary,
  countTotalSets,
  formatExercisePrescription,
  formatFeelingLabel,
  suggestNextProgression,
  summarizeSessionNextStep
} from './workoutActive.js';

describe('workoutActive helpers', () => {
  it('formats weight, sets, reps, and per-side labels clearly', () => {
    expect(formatExercisePrescription({
      name: 'Goblet Squat',
      weightKg: 2,
      sets: 2,
      reps: 10,
      repUnit: 'reps',
      perSide: false
    })).toEqual({
      count: 2,
      weightText: '2 kg',
      setRepText: '2 × 10 ครั้ง'
    });

    expect(formatExercisePrescription({
      name: 'Standing RDL',
      weightKg: 3,
      sets: 3,
      reps: 12,
      repUnit: 'reps',
      perSide: true
    })).toEqual({
      count: 3,
      weightText: '3 kg/ข้าง',
      setRepText: '3 × 12 ครั้ง'
    });

    expect(formatExercisePrescription({
      name: 'March in Place',
      sets: 1,
      reps: 60,
      repUnit: 'sec',
      perSide: false
    })).toEqual({
      count: 1,
      weightText: '',
      setRepText: '60 วินาที'
    });

    expect(formatExercisePrescription({
      name: 'Standing Quad Stretch',
      sets: 1,
      reps: 20,
      repUnit: 'sec',
      perSide: true
    })).toEqual({
      count: 1,
      weightText: '',
      setRepText: '20 วินาที/ข้าง'
    });
  });

  it('counts total sets safely across exercises with clamped bounds', () => {
    expect(countTotalSets([
      { sets: 1 },
      { sets: 3 },
      { sets: 0 },
      { sets: 40 }
    ])).toBe(35);
    expect(countTotalSets([])).toBe(0);
  });

  it('suggests next-session progression based on RPE, RIR, and set completion', () => {
    expect(suggestNextProgression({})).toBeNull();
    expect(suggestNextProgression({ rpe: 6, rir: 3, completedSets: 3, plannedSets: 3 })?.action).toBe('increase');
    expect(suggestNextProgression({ rpe: 9, rir: 0, completedSets: 3, plannedSets: 3 })?.action).toBe('deload');
    expect(suggestNextProgression({ rpe: 8, rir: 1, completedSets: 2, plannedSets: 3 })?.action).toBe('deload');
    expect(suggestNextProgression({ rpe: 8, rir: 2, completedSets: 3, plannedSets: 3 })?.action).toBe('maintain');
  });

  it('builds exercise feedback summary and summarizes session next step', () => {
    const rows = [
      { name: 'Goblet Squat', section: 'main', sets: 3 },
      { name: 'Dumbbell Row', section: 'main', sets: 3 },
      { name: 'Plank', section: 'main', sets: 2 }
    ];
    const summary = buildExerciseFeedbackSummary(
      rows,
      { 0: { rpe: 6, rir: 3 }, 1: { rpe: 8, rir: 2 } },
      { 0: 3, 1: 3 }
    );
    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({ name: 'Goblet Squat', rpe: 6, rir: 3, nextAction: 'increase' });
    expect(summary[1]).toMatchObject({ name: 'Dumbbell Row', rpe: 8, rir: 2, nextAction: 'maintain' });
    expect(summarizeSessionNextStep(summary)).toContain('1 ท่า');
    expect(formatFeelingLabel('good')).toContain('กำลังดี');
  });
});
