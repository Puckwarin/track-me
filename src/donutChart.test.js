import { describe, it, expect } from 'vitest';
import { buildDonutRing, mealSlicesToSegments } from './donutChart.js';

describe('buildDonutRing', () => {
  it('renders an empty dashed ring with a fallback label when there is no data', () => {
    const html = buildDonutRing({ isEmpty: true, emptyLabel: 'ยังไม่มีข้อมูล' });
    expect(html).toContain('stroke-dasharray="4 6"');
    expect(html).toContain('ยังไม่มีข้อมูล');
    expect(html).not.toContain('hx-ring-bar');
  });

  it('renders an empty ring when segments is an empty array, even if isEmpty is not set', () => {
    const html = buildDonutRing({ segments: [] });
    expect(html).not.toContain('hx-ring-bar');
  });

  it('draws one arc per segment with cumulative dashoffset and keeps thickness/size markup identical to the home ring', () => {
    const html = buildDonutRing({
      segments: [
        { value: 25, color: '#111' },
        { value: 75, color: '#222' }
      ],
      centerValue: '100',
      centerSmall: '%',
      centerLabel: 'kcal'
    });
    expect(html).toContain('viewBox="0 0 120 120"');
    expect((html.match(/class="hx-ring-bar/g) || []).length).toBe(2);
    // first segment starts at 0, second starts after the first 25%
    expect(html).toMatch(/stroke-dashoffset="0\.00"/);
    const circumference = 2 * Math.PI * 52;
    const expectedOffset = (-(25 / 100) * circumference).toFixed(2);
    expect(html).toContain(`stroke-dashoffset="${expectedOffset}"`);
    expect(html).toContain('<small>%</small>');
  });

  it('only marks segments focusable/tappable when interactive is true', () => {
    const base = { segments: [{ value: 50, color: '#111', label: 'มื้อเช้า' }] };
    expect(buildDonutRing(base)).not.toContain('tabindex="0"');
    expect(buildDonutRing({ ...base, interactive: true })).toContain('tabindex="0"');
  });

  it('clamps out-of-range segment values instead of producing invalid geometry', () => {
    const html = buildDonutRing({ segments: [{ value: 150 }, { value: -20 }] });
    const circumference = (2 * Math.PI * 52).toFixed(2);
    expect(html).toContain(`stroke-dasharray="${circumference} ${circumference}"`);
    expect(html).toContain(`stroke-dasharray="0.00 ${circumference}"`);
  });
});

describe('mealSlicesToSegments', () => {
  it('skips meals with zero calories and carries protein/count into the tooltip text', () => {
    const segments = mealSlicesToSegments([
      { meal: 'มื้อเช้า', kcal: 300, protein: 20, count: 2, pct: 60, color: '#abc' },
      { meal: 'มื้อกลางวัน', kcal: 0, protein: 0, count: 0, pct: 0, color: '#def' }
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].value).toBe(60);
    expect(segments[0].tip).toContain('โปรตีน 20 g');
    expect(segments[0].sub).toBe('2 รายการ');
  });
});