import { describe, expect, it } from 'vitest';
import { getRecentCompletedRoutines, inferRoutineEmoji } from './planner.js';

describe('planner routine emoji and recent completed helpers', () => {
  it('infers matching emojis for Thai/English chores and preserves custom non-default icons', () => {
    expect(inferRoutineEmoji('ล้างจานตอนเย็น')).toBe('🍽️');
    expect(inferRoutineEmoji('แปรงฟันก่อนนอน', '✨')).toBe('🪥');
    expect(inferRoutineEmoji('ออกกำลังกาย Lower Body')).toBe('💪');
    expect(inferRoutineEmoji('กิจกรรมพิเศษ', '🌿')).toBe('🌿');
    expect(inferRoutineEmoji('บันทึกบัญชีประจำวัน')).toBe('💸');
    expect(inferRoutineEmoji('งานทั่วไปไม่มีคีย์เวิร์ด')).toBe('✅');
  });

  it('returns up to 10 unique latest completed routines from recentDone and doneMap', () => {
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
        '2026-11-13': ['r3', 'x0', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9']
      }
    };

    const result = getRecentCompletedRoutines(planner, 10);
    expect(result).toHaveLength(10);
    expect(result[0]).toMatchObject({ title: 'ล้างจาน', icon: '🍽️', date: '2026-11-15' });
    expect(result[1]).toMatchObject({ title: 'ดื่มน้ำ 2 ลิตร', icon: '💧', date: '2026-11-15' });
    const titles = result.map(item => item.title.toLowerCase());
    expect(new Set(titles).size).toBe(10);
  });
});
