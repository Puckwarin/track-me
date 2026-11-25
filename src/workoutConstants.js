export const TYPES = {
  walk: 'เดิน (Walk)', upper: 'Upper body', lower: 'Lower body', full: 'Full body',
  pilates: 'พิลาทิส (Pilates)', stretch: 'ยืดเหยียด (Stretching)', other: 'อื่น ๆ'
};

export const INTENSITY = [['light', 'เบา'], ['moderate', 'ปานกลาง'], ['vigorous', 'หนัก']];

export const SECTIONS = [
  ['warmup', 'วอร์มอัพ (Warm-up)', 'fa-fire'],
  ['main', 'ท่าหลัก (Main workout)', 'fa-dumbbell'],
  ['cooldown', 'คูลดาวน์ (Cool-down)', 'fa-snowflake']
];

const VALID_SECTIONS = new Set(['warmup', 'main', 'cooldown']);

export const repLabel = unit => (unit === 'sec' ? 'วินาที' : unit === 'min' ? 'นาที' : 'ครั้ง');

export const WORKOUT_FEELINGS = [
  { id: 'energized', icon: '⚡', label: 'สดชื่น มีพลัง' },
  { id: 'good', icon: '😊', label: 'กำลังดี' },
  { id: 'tired', icon: '😮‍💨', label: 'เหนื่อยตึง' },
  { id: 'exhausted', icon: '🥵', label: 'ล้ามาก' }
];

const LEGACY_FEELINGS = {
  great: '⚡ สดชื่น มีพลัง',
  okay: '😊 กำลังดี'
};

export const COMPLETION_STATUSES = [
  { id: 'complete', label: 'ทำครบ' },
  { id: 'partial', label: 'ทำบางส่วน' }
];

export const EFFORT_LEVELS = [
  { id: 'easy', rpe: 5, label: '4-5 ค่อนข้างสบาย' },
  { id: 'moderate', rpe: 6, label: '6 เริ่มเหนื่อยแต่ยังควบคุม' },
  { id: 'hard', rpe: 7, label: '7 หนักพอสมควร' },
  { id: 'very_hard', rpe: 9, label: '8-10 หนักมาก/ใกล้หมดแรง' }
];

export const WORKOUT_SYMPTOMS = [
  { id: 'normal', label: 'ปกติ' },
  { id: 'neck_shoulder_tight', label: 'คอหรือบ่าตึง' },
  { id: 'limb_fatigue', label: 'แขนหรือขาล้ามาก' },
  { id: 'pain_abnormal', label: 'ปวดหรือมีอาการผิดปกติ' }
];

export const NEXT_DAY_RECOVERIES = [
  { id: 'good', label: 'ฟื้นตัวดี' },
  { id: 'sore_mild', label: 'ยังล้าเล็กน้อย' },
  { id: 'sore_multi', label: 'ล้าหรือปวดหลายวัน' }
];

export function formatFeelingLabel(id) {
  const key = String(id || '').trim();
  if (!key) return '';
  const feeling = WORKOUT_FEELINGS.find(item => item.id === key);
  if (feeling) return `${feeling.icon} ${feeling.label}`;
  return LEGACY_FEELINGS[key] || '';
}

export function formatCompletionStatusLabel(id) {
  const key = String(id || '').trim();
  return COMPLETION_STATUSES.find(item => item.id === key)?.label || '';
}

export function formatEffortLabel(id) {
  const key = String(id || '').trim();
  return EFFORT_LEVELS.find(item => item.id === key)?.label || '';
}

export function effortLevelToSessionRpe(id) {
  const key = String(id || '').trim();
  return EFFORT_LEVELS.find(item => item.id === key)?.rpe ?? null;
}

export function formatWorkoutSymptomLabel(id) {
  const key = String(id || '').trim();
  return WORKOUT_SYMPTOMS.find(item => item.id === key)?.label || '';
}

export function formatRecoveryLabel(id) {
  const key = String(id || '').trim();
  return NEXT_DAY_RECOVERIES.find(item => item.id === key)?.label || '';
}

export function formatWorkoutEvaluationParts(workout = {}) {
  const completion = formatCompletionStatusLabel(workout.completionStatus);
  const effort = formatEffortLabel(workout.effortLevel);
  const symptom = formatWorkoutSymptomLabel(workout.postSymptom);
  const recovery = formatRecoveryLabel(workout.nextDayRecovery);
  const legacyFeeling = formatFeelingLabel(workout.feeling);
  const parts = [];
  if (completion) parts.push(completion);
  if (effort) parts.push(`ความเหนื่อย: ${effort}`);
  else if (workout.sessionRpe != null) parts.push(`RPE ${workout.sessionRpe}/10`);
  if (legacyFeeling) parts.push(legacyFeeling);
  if (symptom) parts.push(`อาการ: ${symptom}`);
  if (recovery) parts.push(`ฟื้นตัววันถัดไป: ${recovery}`);
  return parts;
}

export function formatIntensityLabel(id) {
  const hit = INTENSITY.find(([key]) => key === id);
  return hit ? hit[1] : '';
}

export function isMainWorkoutSection(section) {
  const normalized = VALID_SECTIONS.has(section) ? section : 'main';
  return normalized === 'main';
}

export function countMainCompletedSets(workout) {
  if (!workout || typeof workout !== 'object') return 0;
  if (Array.isArray(workout.performedSets) && workout.performedSets.length > 0) {
    return workout.performedSets.filter(s => s && s.completed !== false && isMainWorkoutSection(s.section)).length;
  }
  const explicitMain = Number(workout.mainCompletedSetCount);
  if (Number.isFinite(explicitMain) && explicitMain > 0) return Math.round(explicitMain);
  if (!Array.isArray(workout.performedSets)) {
    const legacyCount = Number(workout.completedSetCount);
    if (Number.isFinite(legacyCount) && legacyCount > 0) return Math.round(legacyCount);
  }
  return 0;
}

export function computeWorkoutTotalMinutes(workout) {
  if (!workout || typeof workout !== 'object') return 0;
  const dur = Number(workout.durationMin);
  if (Number.isFinite(dur) && dur > 0) return Math.round(dur);

  let derivedMin = 0;
  if (Array.isArray(workout.performedSets) && workout.performedSets.length > 0) {
    for (const s of workout.performedSets) {
      if (!s || s.completed === false) continue;
      const reps = Number(s.reps);
      if (!Number.isFinite(reps) || reps <= 0) continue;
      if (s.repUnit === 'min') derivedMin += reps;
      else if (s.repUnit === 'sec') derivedMin += reps / 60;
    }
  } else if (workout.sections && typeof workout.sections === 'object') {
    for (const [sec] of SECTIONS) {
      for (const r of (workout.sections[sec] || [])) {
        if (!r) continue;
        const sets = Math.max(1, Number(r.sets) || 1);
        const reps = Number(r.reps);
        if (!Number.isFinite(reps) || reps <= 0) continue;
        if (r.repUnit === 'min') derivedMin += sets * reps;
        else if (r.repUnit === 'sec') derivedMin += (sets * reps) / 60;
      }
    }
  }

  if (derivedMin <= 0) return 0;
  return derivedMin >= 1 ? Math.round(derivedMin) : Math.round(derivedMin * 10) / 10;
}

export function buildWorkoutNotesText(workout) {
  const refl = String(workout?.reflectionNote || '').trim();
  const note = String(workout?.note || '').trim();
  if (!refl) return note;
  if (!note) return refl;
  if (note.includes(refl)) return note;
  return `${refl} · ${note}`;
}

export function summarizeSessionNextStep(exerciseFeedback = []) {
  if (!Array.isArray(exerciseFeedback) || !exerciseFeedback.length) return '';
  const increases = exerciseFeedback.filter(item => item.nextAction === 'increase').length;
  const deloads = exerciseFeedback.filter(item => item.nextAction === 'deload').length;
  if (deloads > 0 && deloads >= increases) return `แนะนำพักฟื้น/ลดโหลดใน ${deloads} ท่า`;
  if (increases > 0) return `พร้อมเพิ่มความท้าทายใน ${increases} ท่า`;
  return 'รักษาระดับปัจจุบันในรอบถัดไป';
}

export function summarizeWorkoutCollection(workouts = []) {
  const done = (workouts || []).filter(w => w && w.status !== 'planned');
  const byType = {};
  const byIntensity = { light: 0, moderate: 0, vigorous: 0 };
  const byFeeling = {};
  const byCompletion = {};
  const byEffort = {};
  const bySymptom = {};
  const byRecovery = {};
  const rpeValues = [];
  let totalMinutes = 0;
  let totalKcal = 0;
  let totalMainSets = 0;

  for (const w of done) {
    if (w.type) byType[w.type] = (byType[w.type] || 0) + 1;
    if (w.intensity && Object.hasOwn(byIntensity, w.intensity)) {
      byIntensity[w.intensity] += 1;
    }
    const feelingLabel = formatFeelingLabel(w.feeling);
    if (feelingLabel) byFeeling[feelingLabel] = (byFeeling[feelingLabel] || 0) + 1;
    const compLabel = formatCompletionStatusLabel(w.completionStatus);
    if (compLabel) byCompletion[compLabel] = (byCompletion[compLabel] || 0) + 1;
    const effLabel = formatEffortLabel(w.effortLevel);
    if (effLabel) byEffort[effLabel] = (byEffort[effLabel] || 0) + 1;
    const symLabel = formatWorkoutSymptomLabel(w.postSymptom);
    if (symLabel) bySymptom[symLabel] = (bySymptom[symLabel] || 0) + 1;
    const recLabel = formatRecoveryLabel(w.nextDayRecovery);
    if (recLabel) byRecovery[recLabel] = (byRecovery[recLabel] || 0) + 1;

    const rawRpe = w.sessionRpe != null ? Number(w.sessionRpe) : effortLevelToSessionRpe(w.effortLevel);
    if (Number.isFinite(rawRpe) && rawRpe >= 1 && rawRpe <= 10) rpeValues.push(rawRpe);
    totalMinutes += computeWorkoutTotalMinutes(w);
    totalKcal += Number(w.estKcal ?? w.caloriesBurn) || 0;
    totalMainSets += countMainCompletedSets(w);
  }

  const avgSessionRpe = rpeValues.length
    ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
    : null;

  return {
    count: done.length,
    totalMinutes: Math.round(totalMinutes * 10) / 10,
    totalKcal: Math.round(totalKcal),
    totalMainSets,
    byType,
    byIntensity,
    byFeeling,
    byCompletion,
    byEffort,
    bySymptom,
    byRecovery,
    rpeValues,
    avgSessionRpe
  };
}

export function formatIntensityBreakdown(byIntensity = {}) {
  return INTENSITY
    .map(([key, label]) => (byIntensity[key] ? `${label} ${byIntensity[key]}` : ''))
    .filter(Boolean)
    .join(' · ');
}

export function buildWorkoutCsvRows(workouts = []) {
  const header = [
    'วันที่', 'ชื่อโปรแกรม', 'ประเภท', 'กลุ่มกล้ามเนื้อ', 'นาทีรวม', 'ระดับความหนัก',
    'เผาผลาญ(kcal)', 'ทำจริงท่าหลัก(เซต)', 'ความรู้สึกหลังฝึก', 'ความเหนื่อยรวม(Session RPE)',
    'โน้ตเซสชัน', 'ช่วง', 'ท่า', 'น้ำหนัก(kg)', 'ต่อข้าง', 'เซต', 'จำนวน', 'หน่วย',
    'โน้ตท่า', 'RPE ท่า', 'เหลืออีก(RIR)', 'คำแนะนำรอบถัดไป',
    'สถานะการฝึก', 'ความเหนื่อย', 'อาการระหว่าง/หลังฝึก', 'การฟื้นตัววันถัดไป', 'วันที่บันทึกฟื้นตัว'
  ];

  const sorted = (workouts || [])
    .filter(w => w && w.status !== 'planned')
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const rows = [header];
  for (const w of sorted) {
    const totalMin = computeWorkoutTotalMinutes(w);
    const intensityText = formatIntensityLabel(w.intensity);
    const estKcal = w.estKcal ?? w.caloriesBurn ?? '';
    const mainSets = countMainCompletedSets(w);
    const feelingText = formatFeelingLabel(w.feeling);
    const sessionRpeText = w.sessionRpe != null ? w.sessionRpe : (effortLevelToSessionRpe(w.effortLevel) ?? '');
    const sessionNote = buildWorkoutNotesText(w);
    const fbList = Array.isArray(w.exerciseFeedback) ? w.exerciseFeedback : [];
    const evalCols = [
      formatCompletionStatusLabel(w.completionStatus),
      formatEffortLabel(w.effortLevel),
      formatWorkoutSymptomLabel(w.postSymptom),
      formatRecoveryLabel(w.nextDayRecovery),
      w.nextDayRecoveryDate || ''
    ];

    const sessionCols = [
      w.date || '',
      w.title || '',
      TYPES[w.type] || w.typeLabel || w.type || '',
      w.muscleGroup || '',
      totalMin || '',
      intensityText,
      estKcal,
      mainSets || '',
      feelingText,
      sessionRpeText,
      sessionNote
    ];

    let emittedExercise = false;
    for (const [secKey, secTitle] of SECTIONS) {
      const list = Array.isArray(w.sections?.[secKey]) ? w.sections[secKey] : [];
      for (const r of list) {
        if (!r?.name) continue;
        emittedExercise = true;
        const normName = String(r.name || '').trim().toLowerCase();
        const fb = secKey === 'main'
          ? fbList.find(item => String(item?.name || '').trim().toLowerCase() === normName && (!item.section || item.section === 'main'))
          : null;
        rows.push([
          ...sessionCols,
          secTitle.split(' ')[0],
          r.name,
          r.weightKg ?? '',
          r.perSide ? 'ใช่' : '',
          r.sets ?? '',
          r.reps ?? '',
          repLabel(r.repUnit),
          r.note || '',
          fb?.rpe ?? '',
          fb?.rir ?? '',
          fb?.nextLabel || '',
          ...evalCols
        ]);
      }
    }

    if (!emittedExercise) {
      rows.push([...sessionCols, '', '', '', '', '', '', '', '', '', '', '', ...evalCols]);
    }
  }

  return rows;
}
