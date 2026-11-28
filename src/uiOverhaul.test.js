import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { barChartSvg, getChartPalette, lineChartSvg, sparklineSvg } from './chartPrimitives.js';
import { iconSvg } from './icons.js';
import { ensureFocusedElementAboveBottomNav, measureBottomNavClearance } from './ui.js';

const readSrc = relPath => readFileSync(resolve(process.cwd(), relPath), 'utf8');

describe('UI Overhaul Phases 1–3: Tokens, Scoped Period, Charts & Structural Contracts', () => {
  it('defines high-contrast .tm-btn-danger token and .tm-btn-danger-soft in design-tokens.css', () => {
    const tokens = readSrc('src/design-tokens.css');
    expect(tokens).toContain('--color-danger-solid: #B91C3C;');
    expect(tokens).toContain('--color-danger-solid-hover: #9F1239;');
    expect(tokens).toContain('.tm-btn-danger { background: var(--color-danger-solid); color: var(--color-ink-inverse); }');
    expect(tokens).toContain('.tm-btn-danger-soft {');
  });

  it('fixes .bell-badge with px dimensions, halo shadow, and multi-digit pill support', () => {
    const css = readSrc('src/style.css');
    expect(css).toContain('min-width: 20px;');
    expect(css).toContain('height: 20px;');
    expect(css).toContain('font-variant-numeric: tabular-nums;');
    expect(css).toContain('.bell-badge.is-multi');

    const appSrc = readSrc('src/app.js');
    expect(appSrc).toContain("badge.classList.toggle('is-multi', n > 9);");
    expect(appSrc).toContain("btnBell?.setAttribute('aria-label', n > 0 ? `แจ้งเตือน (${n} รายการ)` : 'แจ้งเตือน');");
  });

  it('scopes pastel pink tokens strictly under #tab-period without leaking blue heading colors', () => {
    const css = readSrc('src/style.css');
    expect(css).toContain('#tab-period {');
    expect(css).toContain('--period-surface:');
    expect(css).toContain('--period-fill:');
    expect(css).toContain('#tab-period .card {');
    expect(css).toContain('#tab-period .card h2 :is(i, svg)');
    expect(css).toContain('#tab-period .period-table-head');
    expect(css).toContain('#tab-period .period-selected-bar');
    expect(css).toContain('#tab-period .period-legend-period');

    const periodSrc = readSrc('src/period.js');
    expect(periodSrc).toContain('period-weekdays');
    expect(periodSrc).toContain('period-table-head');
    expect(periodSrc).toContain('period-legend-period');
    expect(periodSrc).toContain('period-legend-pred');
    expect(periodSrc).toContain('period-legend-dot');
    expect(periodSrc).toContain('period-selected-bar');
    expect(periodSrc).toContain('class="btn btn-pink');
    expect(periodSrc).toContain('period-end-chip');
  });

  it('registers Phosphor arrow-left, minus, and pause icons for active workout controls', () => {
    for (const key of ['arrow-left', 'minus', 'pause']) {
      const svg = iconSvg(key, { size: 15 });
      expect(svg).toContain('viewBox="0 0 256 256"');
      expect(svg).toContain('<path');
    }
  });

  it('builds accessible token-driven SVG charts via chartPrimitives.js and eliminates legacy hardcoded hexes', () => {
    const palette = getChartPalette();
    expect(palette.brandDark).toBe('#194971');

    const line = lineChartSvg({
      data: [{ label: 'ต.ค.', val: 54.2 }, { label: 'พ.ย.', val: 53.8 }],
      valueKey: 'val',
      unit: 'กก.',
      decimals: 1,
      ariaLabel: 'กราฟน้ำหนัก'
    });
    expect(line).toContain('role="img"');
    expect(line).toContain('aria-label="กราฟน้ำหนัก"');
    expect(line).toContain('data-chart-tip="ต.ค.: 54.2 กก."');

    const bar = barChartSvg({
      data: [{ label: 'จ', cal: 1750 }, { label: 'อ', cal: 0 }],
      valueKey: 'cal',
      unit: 'kcal',
      targetValue: 1800,
      targetLabel: 'เป้า 1,800',
      ariaLabel: 'กราฟแคลอรี่'
    });
    expect(bar).toContain('role="img"');
    expect(bar).toContain('aria-label="กราฟแคลอรี่"');
    expect(bar).toContain('data-chart-tip="จ: 1,750 kcal"');
    expect(bar).toContain('เป้า 1,800');

    const spark = sparklineSvg({
      points: [{ value: 92, label: 'ม.ค.' }, { value: 88, label: 'ก.พ.' }],
      ariaLabel: 'แนวโน้มผลตรวจ'
    });
    expect(spark).toContain('role="img"');
    expect(spark).toContain('aria-label="แนวโน้มผลตรวจ"');
    expect(spark).toContain('data-chart-tip="ม.ค."');

    expect(lineChartSvg({ data: [], valueKey: 'val', emptyText: 'ไม่มีข้อมูล' })).toContain('ไม่มีข้อมูล');
    expect(barChartSvg({ data: [{ label: 'จ', cal: 0 }], valueKey: 'cal', emptyText: 'ว่าง' })).toContain('ว่าง');

    for (const file of ['src/dashboard.js', 'src/weekly.js', 'src/body.js', 'src/care.js', 'src/lab.js']) {
      const src = readSrc(file);
      expect(src).not.toContain('#1F4A74');
      expect(src).not.toContain('#647F9C');
      expect(src).not.toContain('#4A6685');
      expect(src).not.toContain('#E4E8F3');
    }
  });

  it('separates single-period vs multi-month architecture in dashboard.js and unifies 5 categories + live badge in weekly.js', () => {
    const dashboardSrc = readSrc('src/dashboard.js');
    expect(dashboardSrc).toContain('let root, dashboardData = null, loading = false, activeMonthCount = 6;');
    expect(dashboardSrc).toContain('aggregateMonthlyOverview');
    expect(dashboardSrc).toContain('ส่วนที่ 1 · สรุปช่วงเวลาเดียว');
    expect(dashboardSrc).toContain('ส่วนที่ 2 · แนวโน้มระยะยาวข้ามเดือน');
    expect(dashboardSrc).toContain('class="db-section"');
    expect(dashboardSrc).toContain('class="db-metrics"');
    expect(dashboardSrc).toContain('loadingState(');

    const css = readSrc('src/style.css');
    expect(css).toContain('.db-section {');
    expect(css).toContain('.db-section-head {');

    const weeklySrc = readSrc('src/weekly.js');
    expect(weeklySrc).toContain('summarizeFinanceRange');
    expect(weeklySrc).toContain('summarizePeriodMetrics');
    expect(weeklySrc).toContain('ประจำเดือน & อาการ');
    expect(weeklySrc).toContain('ณ ปัจจุบัน');
    expect(weeklySrc).toContain('ข้อสังเกต');
    expect(weeklySrc).not.toContain('สรุปรายเดือน</h3>');

    const summarySrc = readSrc('src/summary.js');
    expect(summarySrc).toContain('summarizeFinanceRange');
  });

  it('uses .tm-badge instead of span.chip for non-interactive status pills in chatWidget.js', () => {
    const chatSrc = readSrc('src/chatWidget.js');
    expect(chatSrc).not.toMatch(/<span[^>]*class="[^"]*\bchip\b/);
    expect(chatSrc).toContain('<span class="tm-badge tm-badge-info');
  });

  it('keeps package.json, package-lock.json, and src/version.js synced at v6.4.0', () => {
    const pkg = JSON.parse(readSrc('package.json'));
    const lock = JSON.parse(readSrc('package-lock.json'));
    const versionSrc = readSrc('src/version.js');
    expect(pkg.version).toBe('6.4.0');
    expect(lock.version).toBe('6.4.0');
    expect(lock.packages?.['']?.version).toBe('6.4.0');
    expect(versionSrc).toContain("'6.4.0'");
  });

  it('measures mobile bottom-nav overhang including .nav-plus and scrolls obscured focused inputs clear', () => {
    const fakePlus = { getBoundingClientRect: () => ({ top: 730, bottom: 786, height: 56 }) };
    const fakeInner = { getBoundingClientRect: () => ({ top: 758, bottom: 826, height: 68 }) };
    const fakeBottomNav = {
      getBoundingClientRect: () => ({ top: 758, bottom: 844, height: 86 }),
      querySelector: sel => (sel === '.nav-plus' ? fakePlus : sel === '.bottom-nav-inner' ? fakeInner : null)
    };
    const fakeHeader = { getBoundingClientRect: () => ({ top: 0, bottom: 60, height: 60 }) };
    const visibleStyle = () => ({ display: 'block', visibility: 'visible' });

    // 844 - 730 = 114px overhang + 8px halo buffer = 122px
    expect(measureBottomNavClearance({
      bottomNav: fakeBottomNav,
      header: fakeHeader,
      viewportHeight: 844,
      getStyle: visibleStyle
    })).toBe(122);

    // Hidden on desktop -> 0 clearance
    expect(measureBottomNavClearance({
      bottomNav: fakeBottomNav,
      header: fakeHeader,
      viewportHeight: 844,
      getStyle: () => ({ display: 'none', visibility: 'visible' })
    })).toBe(0);

    const scrollBy = vi.fn();
    const obscuredInput = {
      tagName: 'SELECT',
      getAttribute: () => null,
      closest: () => null,
      getBoundingClientRect: () => ({ top: 710, bottom: 754, height: 44 })
    };
    const scrolled = ensureFocusedElementAboveBottomNav(obscuredInput, {
      bottomNav: fakeBottomNav,
      header: fakeHeader,
      win: { innerHeight: 844, scrollBy },
      getStyle: visibleStyle
    });
    expect(scrolled).toBe(true);
    // safeBottom = 844 - 122 - 16 = 706; 754 - 706 = 48px
    expect(scrollBy).toHaveBeenCalledWith({ top: 48, behavior: 'smooth' });

    const css = readSrc('src/style.css');
    expect(css).toContain('--bottom-clearance:');
    expect(css).toContain('--mobile-nav-clearance:');
    expect(css).toContain('scroll-padding-bottom: calc(var(--mobile-nav-clearance) + 1.5rem);');
    expect(css).toContain('scroll-margin-bottom: calc(var(--mobile-nav-clearance) + 1.5rem);');
    expect(css).toContain('font-size: 16px;');
  });

  it('tracks state.loaded.todayFood, separates home ring loading/empty states, moves push status out of #home-head, and groups upper workout form', () => {
    const appSrc = readSrc('src/app.js');
    expect(appSrc).toContain('todayFood: false');
    expect(appSrc).toContain('state.loaded.todayFood = true');
    expect(appSrc).toContain('measureBottomNavClearance');
    expect(appSrc).toContain('ensureFocusedElementAboveBottomNav');

    const homeSrc = readSrc('src/home.js');
    expect(homeSrc).toContain('const isFoodLoading = !foodLoaded && foods.length === 0;');
    expect(homeSrc).toContain('isLoading: isFoodLoading');
    expect(homeSrc).toContain('<section id="home-head" class="hx-head"></section>');
    expect(homeSrc).toContain('<div id="home-push-slot" class="hx-push-foot"></div>');
    expect(homeSrc).toMatch(/<section id="home-head" class="hx-head"><\/section>\s*<div id="home-widgets"[\s\S]*?<\/div>\s*<div id="home-push-slot" class="hx-push-foot"><\/div>/);

    const homeCss = readSrc('src/home.css');
    expect(homeCss).toContain('.hx-push-foot');
    expect(homeCss).toContain('.hx-push.is-blocked { background: transparent;');

    const workoutSrc = readSrc('src/workout.js');
    expect(workoutSrc).toContain('id="w-form-core"');
    expect(workoutSrc).toContain('<details id="w-meta-more" class="tm-details');
    expect(workoutSrc).toContain('syncWorkoutMetaDetails');
  });
});
