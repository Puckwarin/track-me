import { describe, expect, it } from 'vitest';
import { calcBody, getTargets } from './profile.js';

describe('TDEE calculations', () => {
  it('calculates Mifflin-St Jeor BMR, activity-adjusted TDEE, and BMI', () => {
    const profile = {
      sex: 'male',
      birthYear: new Date().getFullYear() - 30,
      heightCm: 170,
      weightKg: 70,
      activity: 'sedentary'
    };

    expect(calcBody(profile)).toMatchObject({
      w: 70,
      h: 170,
      age: 30,
      bmr: 1617.5,
      tdee: 1941,
      bmi: 70 / (1.7 ** 2)
    });
    expect(getTargets(profile)).toMatchObject({ kcal: 1941, source: 'profile' });
  });

  it('uses the fallback target when required measurements or a plausible age are missing', () => {
    expect(calcBody({ heightCm: 170, weightKg: 70 })).toBeNull();
    expect(calcBody({ birthYear: new Date().getFullYear() - 9, heightCm: 170, weightKg: 70 })).toBeNull();
    expect(getTargets(null)).toMatchObject({ kcal: 2000, source: 'default' });
  });
});
