import { describe, it, expect } from 'vitest';
import { buildDonutRing, buildMealDonutParts, mealSlicesToSegments } from './donutChart.js';

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

  it('renders loading ring exclusively without 0% or empty label when isLoading is true', () => {
    const html = buildDonutRing({ isLoading: true, loadingLabel: 'กำลังโหลด...' });
    expect(html).toContain('hx-ring--loading');
    expect(html).toContain('กำลังโหลด...');
    expect(html).not.toContain('0%');
    expect(html).not.toContain('ยังไม่มีข้อมูล');
    expect(html).not.toContain('hx-ring-bar');

    const parts = buildMealDonutParts({ slices: [], totalKcal: 0, targetKcal: 1800, hasData: false, isLoading: true });
    expect(parts.isLoading).toBe(true);
    expect(parts.ringHtml).toContain('กำลังโหลด...');
    expect(parts.ringHtml).not.toContain('0<small>%</small>');
    expect(parts.ringHtml).not.toContain('ยังไม่มีข้อมูล');

    const loadedEmpty = buildMealDonutParts({ slices: [], totalKcal: 0, targetKcal: 1800, hasData: false, isLoading: false });
    expect(loadedEmpty.isLoading).toBe(false);
    expect(loadedEmpty.isEmpty).toBe(true);
    expect(loadedEmpty.ringHtml).toContain('0<small>%</small>');
    expect(loadedEmpty.ringHtml).toContain('ยังไม่มีข้อมูล');
    expect(loadedEmpty.ringHtml).not.toContain('กำลังโหลด...');
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

  it('without a target, keeps the old behaviour: arc share = share of total eaten (ring always full)', () => {
    const segments = mealSlicesToSegments([
      { meal: 'มื้อเช้า', kcal: 300, protein: 20, count: 2, pct: 60, color: '#abc' },
      { meal: 'มื้อกลางวัน', kcal: 200, protein: 10, count: 1, pct: 40, color: '#def' }
    ]);
    expect(segments.reduce((sum, s) => sum + s.value, 0)).toBe(100);
  });

  it('with a target and total under goal, arc share is kcal/target — leaving the rest of the ring as plain track', () => {
    // target 1000 kcal: มื้อเช้า 300 (30%) + มื้อกลางวัน 100 (10%) + มื้อเย็น 100 (10%) = 50% of the ring, not 100%
    const segments = mealSlicesToSegments([
      { meal: 'มื้อเช้า', kcal: 300, protein: 10, count: 1, pct: 60, color: '#1' },
      { meal: 'มื้อกลางวัน', kcal: 100, protein: 5, count: 1, pct: 20, color: '#2' },
      { meal: 'มื้อเย็น', kcal: 100, protein: 5, count: 1, pct: 20, color: '#3' }
    ], 1000);
    expect(segments.map(s => s.value)).toEqual([30, 10, 10]);
    expect(segments.reduce((sum, s) => sum + s.value, 0)).toBe(50);
    // the real "share of eaten" percentage shown in the tooltip must stay unchanged, not the target-relative one
    expect(segments[0].tip).toContain('มื้อเช้า: 60%');
  });

  it('with a target and total over goal, scales every segment proportionally so they sum to exactly 100 (never overflows the ring)', () => {
    // target 1000 kcal but ate 1500 kcal total (150% of goal) split 1000/500 between two meals
    const segments = mealSlicesToSegments([
      { meal: 'มื้อเช้า', kcal: 1000, protein: 40, count: 1, pct: 67, color: '#1' },
      { meal: 'มื้อกลางวัน', kcal: 500, protein: 20, count: 1, pct: 33, color: '#2' }
    ], 1000);
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    expect(total).toBeCloseTo(100, 5);
    // original 2:1 ratio between the two meals must be preserved after scaling down
    expect(segments[0].value / segments[1].value).toBeCloseTo(2, 5);
    // the tooltip keeps the real (pre-scaling) numbers, not the visually-shrunk share
    expect(segments[0].tip).toContain('1,000 kcal');
    expect(segments[0].tip).toContain('มื้อเช้า: 67%');
  });

  it('treats a non-positive target the same as having no target at all', () => {
    const withZero = mealSlicesToSegments([{ meal: 'ม', kcal: 100, protein: 0, count: 1, pct: 100, color: '#1' }], 0);
    const withNegative = mealSlicesToSegments([{ meal: 'ม', kcal: 100, protein: 0, count: 1, pct: 100, color: '#1' }], -50);
    expect(withZero[0].value).toBe(100);
    expect(withNegative[0].value).toBe(100);
  });
});