import { describe, expect, it } from 'vitest';
import {
  formatPlannerToast,
  getFrequentRecentRoutines,
  inferRoutineEmoji,
  matchingDayPreset,
  moveRoutineOccurrence,
  routineAppliesToDate,
  skipRoutineOccurrence,
  validateRoutineDraft
} from './planner.js';

describe('planner routine emoji and frequent-recent helpers', () => {
  it('infers matching emojis for Thai/English chores and preserves custom non-default icons', () => {
    expect(inferRoutineEmoji('ล้างจานตอนเย็น')).toBe('🍽️');
    expect(inferRoutineEmoji('แปรงฟันก่อนนอน', '✨')).toBe('🪥');
    expect(inferRoutineEmoji('ออกกำลังกาย Lower Body')).toBe('💪');
    expect(inferRoutineEmoji('กิจกรรมพิเศษ', '🌿')).toBe('🌿');
    expect(inferRoutineEmoji('บันทึกบัญชีประจำวัน')).toBe('💸');
    expect(inferRoutineEmoji('งานทั่วไปไม่มีคีย์เวิร์ด')).toBe('✅');
  });

  it('ranks up to 10 unique activities by usage frequency first, then most recent date', () => {
    const routines = [
      { id: 'r1', title: 'ล้างจาน', icon: '✨' },
      { id: 'r2', title: 'ดื่มน้ำ 2 ลิตร', icon: '💧' },
      { id: 'r3', title: 'อ่านหนังสือ', icon: '✨' },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, title: `งานที่ ${i + 1}`, icon: '✨' }))
    ];

    const planner = {
      routines,
      recentDone: [
        { id: 'r1', title: 'ล้างจาน', icon: '✨', date: '2026-11-15' },
        { id: 'r2', title: 'ดื่มน้ำ 2 ลิตร', icon: '💧', date: '2026-11-15' },
        { id: 'r1-dup', title: 'ล้างจาน', icon: '🍽️', date: '2026-11-14' }
      ],
      doneMap: {
        '2026-11-12': ['r2'],
        '2026-11-11': ['r2'],
        '2026-11-13': ['r3', 'x0', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9']
      }
    };

    const result = getFrequentRecentRoutines(planner, 10);
    expect(result).toHaveLength(10);
    // r2 ('ดื่มน้ำ 2 ลิตร') was done on 3 distinct dates (Nov 11, 12, 15) vs r1 on 2 dates
    expect(result[0]).toMatchObject({ title: 'ดื่มน้ำ 2 ลิตร', icon: '💧', count: 3, date: '2026-11-15' });
    expect(result[1]).toMatchObject({ title: 'ล้างจาน', icon: '🍽️', count: 2, date: '2026-11-15' });
    const titles = result.map(item => item.title.toLowerCase());
    expect(new Set(titles).size).toBe(10);
  });

  it('matches non-repeating (once) routines only on their specific date', () => {
    const onceRoutine = {
      id: 'once-1',
      title: 'ตรวจสุขภาพ',
      weekPattern: 'once',
      date: '2026-11-15',
      days: []
    };
    expect(routineAppliesToDate(onceRoutine, '2026-11-15')).toBe(true);
    expect(routineAppliesToDate(onceRoutine, '2026-11-16')).toBe(false);
    expect(routineAppliesToDate(onceRoutine, '2026-11-22')).toBe(false);

    const brokenOnce = { id: 'once-2', title: 'ไม่มีวันที่', weekPattern: 'once', date: 'bad-date' };
    expect(routineAppliesToDate(brokenOnce, '2026-11-15')).toBe(false);
  });

  it('identifies day presets accurately so individual weekday toggles can hide cleanly', () => {
    expect(matchingDayPreset(new Set([0, 1, 2, 3, 4, 5, 6]))).toBe('all');
    expect(matchingDayPreset(new Set([0, 1, 2, 3, 4]))).toBe('wd');
    expect(matchingDayPreset(new Set([5, 6]))).toBe('we');
    expect(matchingDayPreset(new Set([0, 2, 4, 6]))).toBe('mwfs');
    expect(matchingDayPreset(new Set([1, 3, 5]))).toBe('tts');
    expect(matchingDayPreset(new Set([0, 3]))).toBe('custom');
  });

  it('matches weekStart-scoped routines only within their selected week', () => {
    const weekScoped = {
      id: 'wk-1',
      title: 'ซักผ้า',
      days: [0, 3], // จันทร์, พฤหัสบดี
      weekStart: '2026-11-16'
    };
    expect(routineAppliesToDate(weekScoped, '2026-11-16')).toBe(true); // จันทร์สัปดาห์นั้น
    expect(routineAppliesToDate(weekScoped, '2026-11-19')).toBe(true); // พฤหัสบดีสัปดาห์นั้น
    expect(routineAppliesToDate(weekScoped, '2026-11-17')).toBe(false); // อังคารสัปดาห์นั้น
    expect(routineAppliesToDate(weekScoped, '2026-11-23')).toBe(false); // จันทร์สัปดาห์ถัดไป
    expect(routineAppliesToDate(weekScoped, '2026-11-09')).toBe(false); // จันทร์สัปดาห์ก่อนหน้า
  });

  it('builds consistent Thai feedback messages and validates routine drafts', () => {
    expect(formatPlannerToast('select-day', { dateStr: '2026-11-24' })).toContain('เลือกวันอ');
    expect(formatPlannerToast('week-shift', { weekMonday: '2026-11-23', delta: 1 })).toContain('เลื่อนดูสัปดาห์');
    expect(formatPlannerToast('today')).toBe('กลับมาที่วันปัจจุบันแล้ว');
    expect(formatPlannerToast('toggle', { kind: 'routine', title: 'ล้างจาน', checked: true })).toContain('เช็ก "ล้างจาน" เสร็จแล้ว');
    expect(formatPlannerToast('toggle', { kind: 'routine', title: 'ล้างจาน', checked: false })).toContain('ยังไม่ทำ');
    expect(formatPlannerToast('move', { title: 'ซักผ้า', dateStr: '2026-11-25' })).toContain('ย้าย "ซักผ้า"');
    expect(formatPlannerToast('skip', { title: 'ล้างจาน', dateStr: '2026-11-24', scopedToWeek: false })).toContain('นำ "ล้างจาน" ออกจาก');

    expect(validateRoutineDraft('   ', [0, 1]).ok).toBe(false);
    expect(validateRoutineDraft('อ่านหนังสือ', []).ok).toBe(false);
    expect(validateRoutineDraft(' อ่านหนังสือ ', [3, 1, 3, 9])).toEqual({
      ok: true,
      title: 'อ่านหนังสือ',
      days: [1, 3]
    });
  });

  it('moves and skips recurring routine occurrences without corrupting other weeks', () => {
    const planner = {
      routines: [{ id: 'r1', title: 'ล้างจาน', days: [0, 2], weekPattern: 'every' }],
      doneMap: { '2026-11-23': ['r1'] },
      moves: [],
      skips: [],
      recentDone: [{ id: 'r1', title: 'ล้างจาน', date: '2026-11-23' }]
    };

    const moved = moveRoutineOccurrence(planner, {
      routineId: 'r1',
      fromDate: '2026-11-23',
      toDate: '2026-11-24'
    });
    expect(moved.ok).toBe(true);
    expect(moved.planner.moves).toEqual([{ routineId: 'r1', from: '2026-11-23', to: '2026-11-24' }]);
    expect(moved.planner.doneMap['2026-11-23']).toBeUndefined();
    expect(moved.planner.doneMap['2026-11-24']).toEqual(['r1']);

    const skipped = skipRoutineOccurrence(moved.planner, {
      routineId: 'r1',
      dateStr: '2026-11-24'
    });
    expect(skipped.ok).toBe(true);
    expect(skipped.planner.moves).toEqual([]);
    expect(skipped.planner.skips).toEqual([{ routineId: 'r1', date: '2026-11-23' }]);
    expect(skipped.planner.doneMap['2026-11-24']).toBeUndefined();
  });
});
