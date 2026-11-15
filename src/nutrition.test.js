import { describe, expect, it } from 'vitest';
import { formatImageProgress, runImageBatch } from './nutrition.js';

describe('image batch progress helpers', () => {
  it('formats uploaded count, active step, and percentage clearly', () => {
    expect(formatImageProgress('กำลังประมวลผล', { total: 10, activeIndex: 7, completed: 6, percent: 60 }))
      .toBe('อัปโหลด 10 รูป · กำลังประมวลผล 7/10 (60%)…');
    expect(formatImageProgress('กำลังวิเคราะห์', { total: 4, activeIndex: 4, completed: 4, percent: 100 }))
      .toBe('✓ ประมวลผลครบ 4/4 รูป (100%)');
  });

  it('processes multiple images with bounded concurrency, preserves order, and isolates failures', async () => {
    const files = [{ name: 'a.jpg' }, { name: 'b.jpg' }, { name: 'c.jpg' }];
    const progressEvents = [];
    const { results, errors } = await runImageBatch(
      files,
      async (file, idx) => {
        if (idx === 1) throw new Error('อ่านภาพไม่สำเร็จ');
        return { ok: true, idx };
      },
      info => progressEvents.push(info),
      { concurrency: 2 }
    );

    expect(results).toEqual([
      { index: 0, fileName: 'a.jpg', data: { ok: true, idx: 0 } },
      { index: 2, fileName: 'c.jpg', data: { ok: true, idx: 2 } }
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].fileName).toBe('b.jpg');
    expect(progressEvents[0]).toMatchObject({ total: 3, completed: 0, percent: 0 });
    expect(progressEvents[progressEvents.length - 1]).toMatchObject({ total: 3, completed: 3, percent: 100 });
  });
});
