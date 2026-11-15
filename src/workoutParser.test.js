import { describe, expect, it } from 'vitest';
import { parseWorkoutText, safeHttpUrl } from './workoutParser.js';

describe('workout parser', () => {
  it('parses sections, duration, and exercise metrics from pasted text', () => {
    const result = parseWorkoutText(`30 minutes
Warm-up — Mobility
1. March in Place
30 seconds
Main Workout
1. Squat
3 x 12 reps
Cool-down
1. Quad Stretch`);

    expect(result.durationMin).toBe(30);
    expect(result.sectionNotes.warmup).toBe('Mobility');
    expect(result.sections.warmup[0]).toMatchObject({ name: 'March in Place', reps: 30, repUnit: 'sec' });
    expect(result.sections.main[0]).toMatchObject({ name: 'Squat', sets: 3, reps: 12 });
    expect(result.sections.cooldown[0].name).toBe('Quad Stretch');
    expect(result.totalExercises).toBe(3);
  });

  it('returns an empty result for blank input and rejects unsafe reference protocols', () => {
    expect(parseWorkoutText(' \n ').totalExercises).toBe(0);
    expect(safeHttpUrl('javascript:alert(1)')).toBe('');
    expect(safeHttpUrl('https://example.com')).toBe('https://example.com/');
  });
});
