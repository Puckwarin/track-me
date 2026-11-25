import { describe, expect, it } from 'vitest';
import {
  buildWorkoutCsvRows,
  buildWorkoutNotesText,
  computeWorkoutTotalMinutes,
  countMainCompletedSets,
  effortLevelToSessionRpe,
  formatCompletionStatusLabel,
  formatEffortLabel,
  formatFeelingLabel,
  formatIntensityBreakdown,
  formatIntensityLabel,
  formatRecoveryLabel,
  formatWorkoutEvaluationParts,
  formatWorkoutSymptomLabel,
  isMainWorkoutSection,
  summarizeWorkoutCollection
} from './workoutConstants.js';

describe('workoutConstants helpers', () => {
  it('identifies main section and counts completed sets for main exercises only', () => {
    expect(isMainWorkoutSection('main')).toBe(true);
    expect(isMainWorkoutSection(undefined)).toBe(true);
    expect(isMainWorkoutSection('warmup')).toBe(false);
    expect(isMainWorkoutSection('cooldown')).toBe(false);

    expect(countMainCompletedSets({
      completedSetCount: 5,
      performedSets: [
        { name: 'March', section: 'warmup', completed: true },
        { name: 'Squat', section: 'main', completed: true },
        { name: 'Squat', section: 'main', completed: true },
        { name: 'Lunge', section: 'main', completed: false },
        { name: 'Stretch', section: 'cooldown', completed: true }
      ]
    })).toBe(2);

    // Legacy record without performedSets array falls back safely to completedSetCount
    expect(countMainCompletedSets({ completedSetCount: 6 })).toBe(6);
    expect(countMainCompletedSets({ performedSets: [] })).toBe(0);
  });

  it('computes total minutes from durationMin or timed performedSets/sections', () => {
    expect(computeWorkoutTotalMinutes({ durationMin: 35 })).toBe(35);
    expect(computeWorkoutTotalMinutes({
      durationMin: null,
      performedSets: [
        { repUnit: 'sec', reps: 60, completed: true },
        { repUnit: 'min', reps: 10, completed: true },
        { repUnit: 'reps', reps: 12, completed: true }
      ]
    })).toBe(11);
    expect(computeWorkoutTotalMinutes({
      sections: {
        warmup: [{ sets: 1, reps: 90, repUnit: 'sec' }],
        main: [{ sets: 2, reps: 5, repUnit: 'min' }],
        cooldown: []
      }
    })).toBe(12);
    expect(computeWorkoutTotalMinutes({})).toBe(0);
  });

  it('formats intensity, feeling, notes, and aggregates collection summaries', () => {
    expect(formatIntensityLabel('light')).toBe('เบา');
    expect(formatIntensityLabel('moderate')).toBe('ปานกลาง');
    expect(formatIntensityLabel('vigorous')).toBe('หนัก');
    expect(formatIntensityLabel('unknown')).toBe('');
    expect(formatFeelingLabel('energized')).toContain('สดชื่น');
    expect(formatFeelingLabel('great')).toContain('สดชื่น');

    expect(buildWorkoutNotesText({
      reflectionNote: 'แรงดี',
      note: 'โฟกัสช้า'
    })).toBe('แรงดี · โฟกัสช้า');
    expect(buildWorkoutNotesText({
      reflectionNote: 'แรงดี',
      note: 'โฟกัสช้า · แรงดี'
    })).toBe('โฟกัสช้า · แรงดี');

    const sum = summarizeWorkoutCollection([
      {
        status: 'done',
        type: 'lower',
        intensity: 'moderate',
        durationMin: 30,
        estKcal: 150,
        feeling: 'good',
        sessionRpe: 7,
        performedSets: [
          { section: 'warmup', completed: true },
          { section: 'main', completed: true },
          { section: 'main', completed: true }
        ]
      },
      {
        status: 'done',
        type: 'walk',
        intensity: 'vigorous',
        durationMin: 20,
        caloriesBurn: 110,
        feeling: 'energized',
        sessionRpe: 9
      },
      {
        status: 'planned',
        type: 'pilates',
        intensity: 'light',
        durationMin: 25
      }
    ]);

    expect(sum.count).toBe(2);
    expect(sum.totalMinutes).toBe(50);
    expect(sum.totalKcal).toBe(260);
    expect(sum.totalMainSets).toBe(2);
    expect(sum.avgSessionRpe).toBe(8);
    expect(formatIntensityBreakdown(sum.byIntensity)).toBe('ปานกลาง 1 · หนัก 1');
  });

  it('builds complete workout CSV rows with intensity, evaluation fields, and 0-exercise sessions', () => {
    const csvRows = buildWorkoutCsvRows([
      {
        date: '2026-11-20',
        title: 'Day A',
        type: 'lower',
        muscleGroup: 'Legs',
        durationMin: 35,
        intensity: 'moderate',
        estKcal: 165,
        feeling: 'good',
        sessionRpe: 7,
        note: 'คุมฟอร์มดี',
        performedSets: [
          { section: 'warmup', completed: true },
          { section: 'main', completed: true },
          { section: 'main', completed: true }
        ],
        exerciseFeedback: [
          { name: 'March in Place', section: 'warmup', rpe: 5 },
          { name: 'Goblet Squat', section: 'main', rpe: 7, rir: 2, nextLabel: 'คงน้ำหนักและเซตเดิม' }
        ],
        sections: {
          warmup: [{ name: 'March in Place', sets: 1, reps: 60, repUnit: 'sec' }],
          main: [{ name: 'Goblet Squat', weightKg: 4, sets: 2, reps: 12, repUnit: 'reps' }],
          cooldown: []
        }
      },
      {
        date: '2026-11-21',
        title: 'เดินเร็ว',
        type: 'walk',
        durationMin: 30,
        intensity: 'light',
        feeling: 'energized',
        sessionRpe: 6,
        status: 'done'
      },
      {
        date: '2026-11-22',
        status: 'planned',
        type: 'pilates',
        durationMin: 20
      }
    ]);

    // Header + 2 exercises (Day A) + 1 exercise-less walk (planned skipped)
    expect(csvRows).toHaveLength(4);
    expect(csvRows[0]).toContain('ระดับความหนัก');
    expect(csvRows[0]).toContain('ความเหนื่อยรวม(Session RPE)');
    expect(csvRows[0]).toContain('ทำจริงท่าหลัก(เซต)');

    // Warmup row should NOT attach exercise feedback
    expect(csvRows[1][12]).toBe('March in Place');
    expect(csvRows[1][19]).toBe('');

    // Main row attaches intensity, mainSets=2, RPE=7, RIR=2, nextLabel
    expect(csvRows[2][5]).toBe('ปานกลาง');
    expect(csvRows[2][7]).toBe(2);
    expect(csvRows[2][19]).toBe(7);
    expect(csvRows[2][20]).toBe(2);
    expect(csvRows[2][21]).toBe('คงน้ำหนักและเซตเดิม');

    // Exercise-less workout still exported with its evaluation & intensity
    expect(csvRows[3][0]).toBe('2026-11-21');
    expect(csvRows[3][4]).toBe(30);
    expect(csvRows[3][5]).toBe('เบา');
    expect(csvRows[3][9]).toBe(6);
  });

  it('formats new evaluation & next-day recovery fields, derives sessionRpe fallback, and appends CSV cols 22..26', () => {
    expect(formatCompletionStatusLabel('complete')).toBe('ทำครบ');
    expect(formatCompletionStatusLabel('partial')).toBe('ทำบางส่วน');
    expect(formatEffortLabel('moderate')).toBe('6 เริ่มเหนื่อยแต่ยังควบคุม');
    expect(effortLevelToSessionRpe('easy')).toBe(5);
    expect(effortLevelToSessionRpe('very_hard')).toBe(9);
    expect(effortLevelToSessionRpe('missing')).toBeNull();
    expect(formatWorkoutSymptomLabel('neck_shoulder_tight')).toBe('คอหรือบ่าตึง');
    expect(formatRecoveryLabel('sore_multi')).toBe('ล้าหรือปวดหลายวัน');

    expect(formatWorkoutEvaluationParts({
      completionStatus: 'complete',
      effortLevel: 'hard',
      postSymptom: 'normal',
      nextDayRecovery: 'good'
    })).toEqual([
      'ทำครบ',
      'ความเหนื่อย: 7 หนักพอสมควร',
      'อาการ: ปกติ',
      'ฟื้นตัววันถัดไป: ฟื้นตัวดี'
    ]);

    const sum = summarizeWorkoutCollection([
      {
        status: 'done',
        type: 'lower',
        completionStatus: 'complete',
        effortLevel: 'hard',
        postSymptom: 'normal',
        nextDayRecovery: 'good',
        durationMin: 30
      },
      {
        status: 'done',
        type: 'upper',
        completionStatus: 'partial',
        effortLevel: 'very_hard',
        postSymptom: 'neck_shoulder_tight',
        nextDayRecovery: 'sore_mild',
        durationMin: 25
      }
    ]);

    expect(sum.byCompletion).toEqual({ ทำครบ: 1, ทำบางส่วน: 1 });
    expect(sum.byEffort).toEqual({
      '7 หนักพอสมควร': 1,
      '8-10 หนักมาก/ใกล้หมดแรง': 1
    });
    expect(sum.bySymptom).toEqual({ ปกติ: 1, คอหรือบ่าตึง: 1 });
    expect(sum.byRecovery).toEqual({ ฟื้นตัวดี: 1, ยังล้าเล็กน้อย: 1 });
    expect(sum.avgSessionRpe).toBe(8);

    const rows = buildWorkoutCsvRows([
      {
        date: '2026-11-23',
        title: 'Day B',
        type: 'upper',
        status: 'done',
        completionStatus: 'partial',
        effortLevel: 'moderate',
        postSymptom: 'limb_fatigue',
        nextDayRecovery: 'sore_mild',
        nextDayRecoveryDate: '2026-11-24'
      }
    ]);
    expect(rows[0].slice(22, 27)).toEqual([
      'สถานะการฝึก',
      'ความเหนื่อย',
      'อาการระหว่าง/หลังฝึก',
      'การฟื้นตัววันถัดไป',
      'วันที่บันทึกฟื้นตัว'
    ]);
    expect(rows[1][9]).toBe(6);
    expect(rows[1].slice(22, 27)).toEqual([
      'ทำบางส่วน',
      '6 เริ่มเหนื่อยแต่ยังควบคุม',
      'แขนหรือขาล้ามาก',
      'ยังล้าเล็กน้อย',
      '2026-11-24'
    ]);
  });
});
