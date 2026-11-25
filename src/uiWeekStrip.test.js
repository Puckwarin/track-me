import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindChartInspector, buildWeekStripRange, centerStripPill, weekNavBarHtml } from './ui.js';

describe('shared week strip and today navigator helpers', () => {
  it('builds a multi-week scrollable strip with today comfortably in the middle zone', () => {
    const today = '2026-11-18'; // Wednesday
    const days = buildWeekStripRange(today, today);
    expect(days).toHaveLength(42);
    expect(days[0].date).toBe('2026-10-26');
    expect(days[days.length - 1].date).toBe('2026-12-06');

    const todayIdx = days.findIndex(d => d.date === today);
    expect(todayIdx).toBe(23);
    expect(days[todayIdx]).toMatchObject({ date: today, dow: 'พ', dayNum: 18, isToday: true });
    // At least 3 full days on both sides of today within a 7-pill viewport, with plenty of scroll range before & after
    expect(todayIdx).toBeGreaterThanOrEqual(21);
    expect(days.length - 1 - todayIdx).toBeGreaterThanOrEqual(14);
  });

  it('expands range smoothly when focusDate lies before or after the default 6-week window', () => {
    const earlier = buildWeekStripRange('2026-11-18', '2026-10-01');
    expect(earlier[0].date).toBe('2026-09-28');
    expect(earlier.some(d => d.date === '2026-10-01')).toBe(true);

    const later = buildWeekStripRange('2026-11-18', '2026-12-25');
    expect(later[later.length - 1].date).toBe('2026-12-27');
    expect(later.some(d => d.date === '2026-12-25')).toBe(true);
  });

  it('renders unified "วันนี้" navigation markup with consistent labels and is-current state', () => {
    const activeTodayHtml = weekNavBarHtml({
      isToday: true,
      prevAttrs: 'id="w-wk-prev"',
      todayAttrs: 'id="w-wk-now"',
      nextAttrs: 'id="w-wk-next"'
    });
    expect(activeTodayHtml).toContain('pl-week-nav');
    expect(activeTodayHtml).toContain('id="w-wk-now" class="pl-week-nav-label is-current" aria-label="กลับไปวันนี้" title="กลับไปวันนี้">วันนี้</button>');
    expect(activeTodayHtml).not.toContain('สัปดาห์นี้');

    const otherDayHtml = weekNavBarHtml({
      isToday: false,
      prevAttrs: 'data-pl-week-shift="-1"',
      todayAttrs: 'data-pl-week-today',
      nextAttrs: 'data-pl-week-shift="1"'
    });
    expect(otherDayHtml).toContain('data-pl-week-today class="pl-week-nav-label " aria-label="กลับไปวันนี้" title="กลับไปวันนี้">วันนี้</button>');
    expect(otherDayHtml).toContain('data-pl-week-shift="-1"');
    expect(otherDayHtml).toContain('data-pl-week-shift="1"');

    const noArrowsHtml = weekNavBarHtml({
      isToday: true,
      todayAttrs: 'id="w-wk-now"',
      showArrows: false
    });
    expect(noArrowsHtml).toContain('id="w-wk-now"');
    expect(noArrowsHtml).toContain('>วันนี้</button>');
    expect(noArrowsHtml).not.toContain('<svg');
  });

  it('calculates centered horizontal scrollLeft cleanly without touching vertical scroll', () => {
    const origRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = fn => fn();
    try {
      let scrolledTo = null;
      const stripEl = {
        isConnected: true,
        scrollLeft: 0,
        getBoundingClientRect: () => ({ left: 100, width: 350 }),
        querySelector: () => ({
          getBoundingClientRect: () => ({ left: 1200, width: 46 })
        }),
        scrollTo: opts => { scrolledTo = opts; }
      };

      centerStripPill(stripEl, '.is-active', { behavior: 'auto' });
      // expected: 0 + (1200 - 100) - (350 - 46)/2 = 1100 - 152 = 948
      expect(stripEl.scrollLeft).toBe(948);

      stripEl.scrollLeft = 100;
      centerStripPill(stripEl, '.is-active', { behavior: 'smooth' });
      expect(scrolledTo).toEqual({ left: 1048, behavior: 'smooth' });
    } finally {
      globalThis.requestAnimationFrame = origRaf;
    }
  });

  describe('bindChartInspector floating tooltips across all chart types', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('shows floating tooltip on mouseover for generic non-donut SVG targets and hides on mouseout', () => {
      const makeClassList = initial => {
        const set = new Set(initial);
        return {
          add: (...cls) => cls.forEach(c => set.add(c)),
          remove: (...cls) => cls.forEach(c => set.delete(c)),
          contains: c => set.has(c)
        };
      };
      const makeNode = (cls = []) => ({
        isConnected: true,
        className: cls.join(' '),
        classList: makeClassList(cls),
        dataset: {},
        style: {},
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        getBoundingClientRect: () => ({ left: 40, right: 60, top: 80, bottom: 120, width: 20, height: 40 })
      });

      const floatingNodes = [];
      vi.stubGlobal('window', {
        innerWidth: 1024,
        innerHeight: 768,
        addEventListener: () => {}
      });
      vi.stubGlobal('document', {
        documentElement: { clientWidth: 1024, clientHeight: 768 },
        body: { appendChild: node => floatingNodes.push(node) },
        createElement: () => makeNode(),
        addEventListener: () => {}
      });

      const readoutEl = makeNode(['tm-chart-readout']);
      const barTarget = {
        ...makeNode(),
        dataset: { chartTip: '25 พ.ย.: 1,850 kcal', chartSub: 'ใกล้เคียงเป้า', chartColor: '#1F4A74' },
        closest: sel => (sel === '[data-chart-tip]' ? barTarget : null)
      };
      const emptyBg = {
        closest: () => null
      };
      const listeners = new Map();
      const container = {
        dataset: {},
        contains: node => node === barTarget || node === emptyBg,
        querySelector: sel => (sel === '[data-chart-readout]' ? readoutEl : null),
        querySelectorAll: sel => (sel === '[data-chart-tip]' ? [barTarget] : []),
        addEventListener: (ev, fn) => listeners.set(ev, fn)
      };

      bindChartInspector(container, { hint: 'แตะแท่งกราฟ' });
      listeners.get('mouseover')({ target: barTarget, clientX: 120, clientY: 160 });

      const tipEl = floatingNodes.at(-1);
      expect(tipEl).toBeTruthy();
      expect(tipEl.classList.contains('hidden')).toBe(false);
      expect(tipEl.innerHTML).toContain('25 พ.ย.: 1,850 kcal');
      expect(tipEl.innerHTML).toContain('ใกล้เคียงเป้า');

      listeners.get('mouseout')({ target: barTarget, relatedTarget: emptyBg });
      expect(tipEl.classList.contains('hidden')).toBe(true);
    });
  });
});
