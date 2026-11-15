export const ONBOARDING_STEP_COUNT = 5;

const STORAGE_KEY = 'trackme:onboarding:v1:';
const VALID_STEPS = new Set(Array.from({ length: ONBOARDING_STEP_COUNT }, (_, index) => index + 1));
const VALID_ACTIVITIES = new Set(['sedentary', 'light', 'moderate', 'active', 'very']);
const VALID_GOALS = new Set([-500, -300, 0, 300]);

export function isNewAuthUser(metadata) {
  const createdAt = Date.parse(metadata?.creationTime || '');
  const lastSignInAt = Date.parse(metadata?.lastSignInTime || '');
  return Number.isFinite(createdAt)
    && Number.isFinite(lastSignInAt)
    && Math.abs(lastSignInAt - createdAt) <= 5 * 60 * 1000;
}

export function createOnboardingProgressStore(storage) {
  const memory = new Map();
  const keyFor = uid => STORAGE_KEY + uid;

  function read(uid) {
    if (!uid) return null;
    const key = keyFor(uid);
    try {
      const progress = JSON.parse(storage.getItem(key) || 'null');
      if (progress?.version === 1
        && ['in_progress', 'completed'].includes(progress.status)
        && VALID_STEPS.has(progress.step)) {
        memory.set(key, progress);
        return progress;
      }
    } catch (error) {
      // Fall back to the in-memory copy if local storage is unavailable or invalid.
    }
    return memory.get(key) || null;
  }

  function write(uid, progress) {
    if (!uid) return false;
    const key = keyFor(uid);
    memory.set(key, progress);
    try {
      storage.setItem(key, JSON.stringify(progress));
      return true;
    } catch (error) {
      return false;
    }
  }

  return {
    read,
    begin(uid) {
      const current = read(uid);
      if (current) return true;
      return write(uid, { version: 1, status: 'in_progress', step: 1 });
    },
    setStep(uid, step) {
      if (!VALID_STEPS.has(step)) return false;
      const current = read(uid);
      if (current?.status === 'completed') return false;
      return write(uid, { version: 1, status: 'in_progress', step });
    },
    complete(uid) {
      return write(uid, { version: 1, status: 'completed', step: ONBOARDING_STEP_COUNT });
    }
  };
}

export function shouldShowOnboarding({ uid, metadata, profile, progressStore }) {
  if (!uid || !progressStore) return false;
  const progress = progressStore.read(uid);
  if (progress?.status === 'completed') return false;
  if (progress?.status === 'in_progress') return true;
  return !profile && isNewAuthUser(metadata);
}

export function validateOnboardingProfile(fields, currentYear = new Date().getFullYear()) {
  const required = ['sex', 'birthYear', 'heightCm', 'weightKg'];
  const hasAnyRequiredField = required.some(key => String(fields?.[key] ?? '').trim() !== '');
  if (!hasAnyRequiredField) return { ok: true, profile: null };
  if (required.some(key => String(fields?.[key] ?? '').trim() === '')) {
    return { ok: false, error: 'กรอกเพศ ปีเกิด ส่วนสูง และน้ำหนักให้ครบ หรือข้ามขั้นตอนนี้' };
  }

  const birthYear = Number(fields.birthYear);
  const heightCm = Number(fields.heightCm);
  const weightKg = Number(fields.weightKg);
  const activity = String(fields.activity || 'light');
  const adjust = Number(fields.adjust ?? 0);

  if (!['female', 'male'].includes(fields.sex)) {
    return { ok: false, error: 'เลือกเพศสำหรับคำนวณให้ถูกต้อง' };
  }
  if (!Number.isInteger(birthYear) || birthYear < currentYear - 100 || birthYear > currentYear - 10) {
    return { ok: false, error: 'ตรวจสอบปีเกิดอีกครั้ง (อายุที่รองรับ 10–100 ปี)' };
  }
  if (!Number.isFinite(heightCm) || heightCm < 50 || heightCm > 250) {
    return { ok: false, error: 'ส่วนสูงต้องอยู่ระหว่าง 50–250 ซม.' };
  }
  if (!Number.isFinite(weightKg) || weightKg < 15 || weightKg > 500) {
    return { ok: false, error: 'น้ำหนักต้องอยู่ระหว่าง 15–500 กก.' };
  }
  if (!VALID_ACTIVITIES.has(activity)) {
    return { ok: false, error: 'เลือกระดับกิจกรรมให้ถูกต้อง' };
  }
  if (!Number.isFinite(adjust) || !VALID_GOALS.has(adjust)) {
    return { ok: false, error: 'เลือกเป้าหมายให้ถูกต้อง' };
  }

  return {
    ok: true,
    profile: { sex: fields.sex, birthYear, heightCm, weightKg, activity, adjust }
  };
}

export async function runNotificationSetup(enable) {
  try {
    await enable();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
