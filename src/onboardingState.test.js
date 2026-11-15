import { describe, expect, it } from 'vitest';
import {
  createOnboardingProgressStore,
  isNewAuthUser,
  runNotificationSetup,
  shouldShowOnboarding,
  validateOnboardingProfile
} from './onboardingState.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
}

const newUserMetadata = {
  creationTime: '2026-01-01T10:00:00.000Z',
  lastSignInTime: '2026-01-01T10:01:00.000Z'
};

describe('onboarding state', () => {
  it('identifies first sign-ins and bypasses existing accounts', () => {
    const progressStore = createOnboardingProgressStore(createMemoryStorage());
    expect(isNewAuthUser(newUserMetadata)).toBe(true);
    expect(isNewAuthUser({ ...newUserMetadata, lastSignInTime: '2026-01-01T10:10:00.000Z' })).toBe(false);
    expect(shouldShowOnboarding({ uid: 'new', metadata: newUserMetadata, profile: null, progressStore })).toBe(true);
    expect(shouldShowOnboarding({ uid: 'old', metadata: null, profile: null, progressStore })).toBe(false);
    expect(shouldShowOnboarding({ uid: 'profiled', metadata: newUserMetadata, profile: {}, progressStore })).toBe(false);
  });

  it('resumes partial progress, persists skipped steps, and does not repeat after completion', () => {
    const storage = createMemoryStorage();
    const progressStore = createOnboardingProgressStore(storage);
    progressStore.begin('user-1');
    expect(progressStore.setStep('user-1', 3)).toBe(true);

    const afterReload = createOnboardingProgressStore(storage);
    expect(afterReload.read('user-1').step).toBe(3);
    expect(shouldShowOnboarding({ uid: 'user-1', profile: {}, progressStore: afterReload })).toBe(true);
    expect(afterReload.setStep('user-1', 4)).toBe(true);
    expect(afterReload.read('user-1').step).toBe(4);
    expect(afterReload.complete('user-1')).toBe(true);
    expect(shouldShowOnboarding({ uid: 'user-1', metadata: newUserMetadata, progressStore: afterReload })).toBe(false);
  });

  it('allows profile setup to be skipped and validates completed profile values', () => {
    expect(validateOnboardingProfile({})).toEqual({ ok: true, profile: null });
    expect(validateOnboardingProfile({ sex: 'female', birthYear: '1995', heightCm: '165', weightKg: '60' }, 2026)).toEqual({
      ok: true,
      profile: { sex: 'female', birthYear: 1995, heightCm: 165, weightKg: 60, activity: 'light', adjust: 0 }
    });
    expect(validateOnboardingProfile({ sex: 'female', birthYear: '1995', heightCm: '', weightKg: '60' }, 2026).ok).toBe(false);
    expect(validateOnboardingProfile({ sex: 'male', birthYear: '1900', heightCm: '165', weightKg: '60' }, 2026).ok).toBe(false);
    expect(validateOnboardingProfile({ sex: 'male', birthYear: '1995', heightCm: '251', weightKg: '60' }, 2026).ok).toBe(false);
  });

  it('keeps notification denial optional and reports the reason', async () => {
    const result = await runNotificationSetup(() => Promise.reject(new Error('การแจ้งเตือนถูกบล็อก')));
    expect(result).toEqual({ ok: false, message: 'การแจ้งเตือนถูกบล็อก' });
    await expect(runNotificationSetup(async () => {})).resolves.toEqual({ ok: true });
  });
});
