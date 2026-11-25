export const BODY_MEASUREMENT_KEYS = ['weight', 'bust', 'waist', 'hip', 'arm', 'thigh'];

export const resolvedSleepHours = r => (typeof r?.sleepHours === 'number'
  ? r.sleepHours
  : (typeof r?.sleepMinutes === 'number' ? Math.round((r.sleepMinutes / 60) * 100) / 100 : null));

export const sortBodyDesc = items => (items || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

export function bodyLatest(items) {
  const desc = sortBodyDesc(items);
  const out = {};
  BODY_MEASUREMENT_KEYS.forEach(k => {
    const f = desc.find(i => typeof i?.[k] === 'number');
    if (f) out[k] = { v: f[k], d: f.date };
  });
  const sRec = desc.find(i => resolvedSleepHours(i) !== null);
  if (sRec) out.sleepHours = { v: resolvedSleepHours(sRec), d: sRec.date };
  const stepRec = desc.find(i => typeof i?.steps === 'number');
  if (stepRec) out.steps = { v: stepRec.steps, d: stepRec.date };
  return out;
}
