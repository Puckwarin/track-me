import { getDocs, query, where } from 'firebase/firestore';
import { userCol } from './firebase.js';
import { state } from './state.js';
import { getPreviewRecordsInRange, isPreviewMode } from './preview.js';
import { $, esc, localDateStr, round1 } from './util.js';
import { iconSvg } from './icons.js';
import { bindChartInspector, detailsToggleHtml, emptyState, errorState, loadingState } from './ui.js';
import { formatIntensityBreakdown } from './workoutConstants.js';
import { aggregateMonthlyOverview, buildMonthKeys } from './overviewLogic.js';
import { barChartSvg, getChartPalette, lineChartSvg } from './chartPrimitives.js';

let root, dashboardData = null, loading = false, activeMonthCount = 6;

function syncRangeButtons(count) {
  if (!root) return;
  [3, 6, 12].forEach(r => {
    const b = $('#db-range-' + r, root);
    if (!b) return;
    const on = r === count;
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-active', on);
  });
}

export function mountDashboard(el) {
  root = el;
  activeMonthCount = 6;
  root.innerHTML = `
  <div class="db-page lg:col-span-3">
    <header class="db-header">
      <div class="db-heading">
        <div class="db-eyebrow">TRACK ME · HISTORY &amp; REPORTS</div>
        <h2>ประวัติ &amp; รายงาน</h2>
        <p>แยกมุมมองสรุปช่วงเวลาเฉพาะสัปดาห์/เดือน ออกจากแนวโน้มระยะยาวข้ามเดือน และส่งออกรายงานได้ในที่เดียว</p>
      </div>
      <div class="db-controls">
        <div class="tm-seg tm-seg--2" role="tablist" aria-label="สลับมุมมองประวัติและรายงาน">
          <button type="button" role="tab" id="db-view-overview" data-page-go="overview" aria-pressed="true" aria-selected="true" class="tm-seg-btn is-active">ภาพรวม &amp; สรุป</button>
          <button type="button" role="tab" id="db-view-report" data-page-go="report" aria-pressed="false" aria-selected="false" class="tm-seg-btn">${iconSvg('report', { size: 14 })}<span>รายงาน (PDF / CSV)</span></button>
        </div>
        <button type="button" id="db-refresh" class="db-refresh">${iconSvg('rotate-right', { size: 14 })}<span>รีเฟรช</span></button>
      </div>
    </header>

    <section id="db-section-1" class="db-section" aria-labelledby="db-period-title">
      <div class="db-section-head">
        <div class="min-w-0 space-y-0.5">
          <div class="db-section-kicker">ส่วนที่ 1 · สรุปช่วงเวลาเดียว</div>
          <h3 id="db-period-title" class="font-bold text-slate-800 inline-flex items-center gap-1.5 text-base">${iconSvg('weekly', { size: 18, className: 'text-brand' })}<span>สรุปรายสัปดาห์ / รายเดือน</span></h3>
          <p class="text-xs text-slate-500">เลือกดูข้อมูลทีละสัปดาห์หรือทีละเดือน พร้อมสถานะสต๊อกและแจ้งเตือน ณ ปัจจุบัน</p>
        </div>
      </div>
      <div id="db-weekly" class="space-y-4" aria-live="polite"></div>
    </section>

    <section id="db-section-2" class="db-section" aria-labelledby="db-longterm-title">
      <div class="db-section-head">
        <div class="min-w-0 space-y-0.5">
          <div class="db-section-kicker">ส่วนที่ 2 · แนวโน้มระยะยาวข้ามเดือน</div>
          <h3 id="db-longterm-title" class="font-bold text-slate-800 inline-flex items-center gap-1.5 text-base">${iconSvg('overview', { size: 18, className: 'text-brand' })}<span>แนวโน้มระยะยาวรายเดือน</span></h3>
          <p class="text-xs text-slate-500">เปรียบเทียบพัฒนาการต่อเนื่อง 3 / 6 / 12 เดือนด้านน้ำหนัก แคลอรี่/วัน ออกกำลังกาย และการเงิน</p>
        </div>
        <div class="db-range tm-seg tm-seg--3 shrink-0" role="group" aria-label="ช่วงเวลาแนวโน้มระยะยาว">
          <button type="button" id="db-range-3" class="tm-seg-btn" aria-pressed="false">3 เดือน</button>
          <button type="button" id="db-range-6" class="tm-seg-btn is-active" aria-pressed="true">6 เดือน</button>
          <button type="button" id="db-range-12" class="tm-seg-btn" aria-pressed="false">12 เดือน</button>
        </div>
      </div>
      <div id="db-content" class="db-content" aria-live="polite">${loadingState({ label: 'กำลังรวบรวมข้อมูล…' })}</div>
    </section>
  </div>`;

  const setRange = n => {
    activeMonthCount = [3, 6, 12].includes(Number(n)) ? Number(n) : 6;
    syncRangeButtons(activeMonthCount);
    void loadAndRender(activeMonthCount);
  };
  $('#db-range-3', root).addEventListener('click', () => setRange(3));
  $('#db-range-6', root).addEventListener('click', () => setRange(6));
  $('#db-range-12', root).addEventListener('click', () => setRange(12));
  $('#db-refresh', root).addEventListener('click', () => {
    void loadAndRender(activeMonthCount);
    window.dispatchEvent(new Event('trackme:overview-refresh'));
  });

  window.addEventListener('trackme:theme', () => {
    if (root?.isConnected && dashboardData) render(activeMonthCount);
  });

  syncRangeButtons(activeMonthCount);
  void loadAndRender(activeMonthCount);
}

export function resetDashboardToToday() {
  activeMonthCount = 6;
  if (root) {
    syncRangeButtons(activeMonthCount);
    void loadAndRender(activeMonthCount);
  }
}

export function resetDashboardState() {
  dashboardData = null;
  activeMonthCount = 6;
}

export function renderDashboard() {
  if (root && !loading) {
    syncRangeButtons(activeMonthCount);
    void loadAndRender(activeMonthCount);
  }
}

async function loadAndRender(monthCount) {
  if (loading || (!state.uid && !isPreviewMode())) return;
  loading = true;
  const btn = $('#db-refresh', root);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `${iconSvg('fa-spinner fa-spin', { size: 14 })}<span>กำลังโหลด…</span>`;
  }
  $('#db-content', root).innerHTML = loadingState({ label: 'กำลังรวบรวมข้อมูล…' });
  try {
    dashboardData = await loadData(monthCount);
    render(monthCount);
  } catch (e) {
    $('#db-content', root).innerHTML = `<div class="card">${errorState({ message: `โหลดข้อมูลไม่สำเร็จ: ${e.message}` })}</div>`;
  } finally {
    loading = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${iconSvg('rotate-right', { size: 14 })}<span>รีเฟรช</span>`;
    }
  }
}

async function loadData(monthCount) {
  const today = localDateStr();
  const months = buildMonthKeys(monthCount, today);
  const from = `${months[0]}-01`;
  const to = today;

  const rangeQuery = name => isPreviewMode()
    ? Promise.resolve(getPreviewRecordsInRange(name, from, to))
    : getDocs(query(userCol(state.uid, name), where('date', '>=', from), where('date', '<=', to)))
        .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
        .catch(() => []);

  const [food, workouts] = await Promise.all([rangeQuery('food_records'), rangeQuery('workout_records')]);
  const body = (state.body || []).filter(b => b.date >= from && b.date <= to);
  const expenses = (state.expenses || []).filter(e => (e.date || '') >= from && (e.date || '') <= to);

  return aggregateMonthlyOverview({
    monthsCount: monthCount,
    today,
    food,
    workouts,
    body,
    expenses
  });
}

function render(monthCount) {
  if (!root || !dashboardData) return;
  const d = Array.isArray(dashboardData) ? dashboardData : (dashboardData.months || []);
  const summary = Array.isArray(dashboardData) ? null : dashboardData.summary;

  const weightPts = d.filter(r => r.weight != null);
  const firstW = weightPts[0]?.weight ?? null;
  const lastW = summary?.latestWeight ?? weightPts[weightPts.length - 1]?.weight ?? null;
  const weightTrend = summary?.weightChange ?? ((lastW != null && firstW != null && weightPts.length >= 2) ? round1(lastW - firstW) : null);
  const weightMeta = lastW != null
    ? `${lastW} กก.${weightTrend != null ? ` (${weightTrend > 0 ? '+' : ''}${weightTrend} กก.)` : ''}`
    : '';

  const kcalPts = d.filter(r => r.avgKcal != null);
  const avgKcalOverall = summary?.avgCalPerDay ?? (kcalPts.length
    ? Math.round(kcalPts.reduce((s, r) => s + r.avgKcal, 0) / kcalPts.length)
    : null);
  const kcalMeta = avgKcalOverall != null ? `เฉลี่ย ${avgKcalOverall.toLocaleString()} kcal/วัน` : '';

  const totalWorkout = d.reduce((a, r) => a + (r.workoutCount || 0), 0);
  const totalWorkoutMin = d.reduce((a, r) => a + (r.workoutMin || r.workoutMinutes || 0), 0);
  const overallIntensityTotals = { light: 0, moderate: 0, vigorous: 0 };
  let overallRpeSum = 0;
  let overallRpeCount = 0;
  d.forEach(r => {
    overallRpeSum += r.workoutRpeSum || 0;
    overallRpeCount += r.workoutRpeCount || 0;
    if (r.workoutIntensity) {
      overallIntensityTotals.light += r.workoutIntensity.light || 0;
      overallIntensityTotals.moderate += r.workoutIntensity.moderate || 0;
      overallIntensityTotals.vigorous += r.workoutIntensity.vigorous || 0;
    }
  });
  const overallIntensityText = formatIntensityBreakdown(overallIntensityTotals);
  const overallAvgRpe = overallRpeCount ? round1(overallRpeSum / overallRpeCount) : null;
  const workoutMeta = totalWorkout
    ? [
        `รวม ${totalWorkout} ครั้ง · ${totalWorkoutMin.toLocaleString()} น.`,
        overallIntensityText,
        overallAvgRpe != null ? `RPE เฉลี่ย ${overallAvgRpe}` : ''
      ].filter(Boolean).join(' · ')
    : '';

  const totalExpense = d.reduce((a, r) => a + (r.expenseTotal || 0), 0);
  const totalIncome = d.reduce((a, r) => a + (r.incomeTotal || 0), 0);
  const net = totalIncome - totalExpense;
  const financeMeta = (totalExpense || totalIncome)
    ? `จ่าย ${totalExpense.toLocaleString()} · สุทธิ ${net >= 0 ? '+' : ''}${net.toLocaleString()} บ.`
    : '';

  const hasAnyData = d.some(r =>
    r.weight != null || r.avgKcal != null || r.workoutCount > 0 || r.expenseTotal > 0 || r.incomeTotal > 0
  );
  if (!hasAnyData) {
    $('#db-content', root).innerHTML = `<div class="card">${emptyState({
      icon: 'overview',
      title: `ยังไม่มีข้อมูลในช่วง ${monthCount} เดือนล่าสุด`,
      description: 'เริ่มบันทึกน้ำหนัก อาหาร ออกกำลังกาย หรือรายรับ-รายจ่าย เพื่อดูกราฟแนวโน้มระยะยาวที่นี่'
    })}</div>`;
    return;
  }

  const palette = getChartPalette();

  const chartHead = (iconName, iconClass, title, meta) => `
    <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <h4 class="flex items-center gap-2 font-bold text-sm text-slate-800 m-0">${iconSvg(iconName, { size: 16, className: iconClass })}<span>${esc(title)}</span></h4>
      ${meta ? `<span class="text-xs font-medium text-slate-500 tabular-nums">${esc(meta)}</span>` : ''}
    </div>`;

  const weightSub = weightTrend != null
    ? `เปลี่ยนแปลง ${weightTrend > 0 ? '+' : ''}${weightTrend} กก. (${weightPts.length} เดือน)`
    : weightPts.length ? `บันทึกแล้ว ${weightPts.length} เดือน` : 'ยังไม่มีข้อมูลน้ำหนัก';
  const kcalSub = kcalPts.length
    ? `จาก ${kcalPts.length} เดือนที่มีบันทึกอาหาร`
    : 'ยังไม่มีข้อมูลอาหาร';
  const workoutSub = totalWorkout
    ? `${totalWorkoutMin.toLocaleString()} นาที${overallAvgRpe != null ? ` · RPE ${overallAvgRpe}` : ''}`
    : 'ยังไม่มีบันทึกออกกำลังกาย';
  const financeVal = (totalExpense || totalIncome)
    ? `${net >= 0 ? '+' : ''}฿${Math.round(net).toLocaleString()}`
    : '—';
  const financeSub = (totalExpense || totalIncome)
    ? `รับ ฿${Math.round(totalIncome).toLocaleString()} · จ่าย ฿${Math.round(totalExpense).toLocaleString()}`
    : 'ยังไม่มีรายการการเงิน';

  $('#db-content', root).innerHTML = `
    <div class="db-metrics" aria-label="ตัวเลขสรุปรวม ${monthCount} เดือน">
      <div class="db-stat">
        <span class="db-stat-label">น้ำหนักล่าสุด</span>
        <span class="db-stat-value">${lastW != null ? `${lastW} กก.` : '—'}</span>
        <span class="db-stat-note">${esc(weightSub)}</span>
      </div>
      <div class="db-stat">
        <span class="db-stat-label">แคลอรี่เฉลี่ย/วัน</span>
        <span class="db-stat-value">${avgKcalOverall != null ? `${avgKcalOverall.toLocaleString()} kcal` : '—'}</span>
        <span class="db-stat-note">${esc(kcalSub)}</span>
      </div>
      <div class="db-stat">
        <span class="db-stat-label">ออกกำลังกายรวม</span>
        <span class="db-stat-value">${totalWorkout ? `${totalWorkout} ครั้ง` : '—'}</span>
        <span class="db-stat-note">${esc(workoutSub)}</span>
      </div>
      <div class="db-stat">
        <span class="db-stat-label">การเงินสุทธิ (${monthCount} ด.)</span>
        <span class="db-stat-value ${net < 0 ? 'text-rose-700' : ''}">${esc(financeVal)}</span>
        <span class="db-stat-note">${esc(financeSub)}</span>
      </div>
    </div>

    <div class="db-charts-grid" aria-label="กราฟแนวโน้ม ${monthCount} เดือน">
      <article class="db-chart-card">${chartHead('body', 'text-brand shrink-0', 'น้ำหนัก (กก.)', weightMeta)}${lineChartSvg({
        data: d,
        labelKey: 'label',
        valueKey: 'weight',
        color: palette.brandDark,
        unit: 'กก.',
        decimals: 1,
        ariaLabel: `กราฟแนวโน้มน้ำหนัก ${monthCount} เดือน`,
        emptyText: 'ยังไม่มีข้อมูลน้ำหนักในช่วงนี้'
      })}</article>
      <article class="db-chart-card">${chartHead('flame', 'text-brand shrink-0', 'แคลอรี่เฉลี่ย/วันที่บันทึก (kcal)', kcalMeta)}${lineChartSvg({
        data: d,
        labelKey: 'label',
        valueKey: 'avgKcal',
        color: palette.brandStrong,
        unit: 'kcal',
        decimals: 0,
        ariaLabel: `กราฟแนวโน้มแคลอรี่เฉลี่ยต่อวัน ${monthCount} เดือน`,
        emptyText: 'ยังไม่มีข้อมูลอาหารในช่วงนี้'
      })}</article>
      <article class="db-chart-card">${chartHead('workout', 'text-brand shrink-0', 'จำนวนครั้งออกกำลังกาย', workoutMeta)}${barChartSvg({
        data: d,
        labelKey: 'label',
        valueKey: 'workoutCount',
        color: palette.brandDark,
        unit: 'ครั้ง',
        decimals: 0,
        ariaLabel: `กราฟจำนวนครั้งออกกำลังกายรายเดือน ${monthCount} เดือน`,
        emptyText: 'ยังไม่มีบันทึกออกกำลังกายในช่วงนี้'
      })}</article>
      <article class="db-chart-card">${chartHead('expense', 'text-rose-500 shrink-0', 'ค่าใช้จ่ายรายเดือน (บาท)', financeMeta)}${barChartSvg({
        data: d,
        labelKey: 'label',
        valueKey: 'expenseTotal',
        color: palette.error,
        unit: 'บาท',
        decimals: 0,
        ariaLabel: `กราฟค่าใช้จ่ายรายเดือน ${monthCount} เดือน`,
        emptyText: 'ยังไม่มีรายการรายจ่ายในช่วงนี้'
      })}</article>
    </div>

    <details class="tm-details card space-y-3" open>
      <summary class="tm-details-summary cursor-pointer list-none font-bold text-slate-800 text-sm">
        <span class="inline-flex items-center gap-2 min-w-0">${iconSvg('table', { size: 15, className: 'text-slate-600 shrink-0' })}<span>ตารางเปรียบเทียบรายเดือน (${monthCount} เดือน)</span></span>
        ${detailsToggleHtml()}
      </summary>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-white border border-slate-100">
            <tr>
              <th class="p-2">เดือน</th>
              <th class="p-2 text-right">น้ำหนัก</th>
              <th class="p-2 text-right">kcal/วัน</th>
              <th class="p-2 text-right">ออกกำลัง (ครั้ง)</th>
              <th class="p-2 text-right">ออกกำลัง (นาที)</th>
              <th class="p-2 text-right">ความหนัก / RPE</th>
              <th class="p-2 text-right">รายจ่าย</th>
              <th class="p-2 text-right">รายรับ</th>
              <th class="p-2 text-right">สุทธิ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 tabular-nums">
            ${d.map(r => `<tr class="hover:bg-slate-50">
              <td class="p-2 font-medium">${esc(r.label)}</td>
              <td class="p-2 text-right">${r.weight != null ? r.weight + ' กก.' : '-'}</td>
              <td class="p-2 text-right">${r.avgKcal != null ? r.avgKcal.toLocaleString() + ' kcal' : '-'}</td>
              <td class="p-2 text-right">${r.workoutCount || '-'}</td>
              <td class="p-2 text-right">${r.workoutMin || r.workoutMinutes || '-'}</td>
              <td class="p-2 text-right">${esc([r.workoutIntensityText, r.workoutAvgRpe != null ? `RPE ${r.workoutAvgRpe}` : ''].filter(Boolean).join(' · ') || '-')}</td>
              <td class="p-2 text-right text-rose-600">${r.expenseTotal ? r.expenseTotal.toLocaleString() : '-'}</td>
              <td class="p-2 text-right text-emerald-700">${r.incomeTotal ? r.incomeTotal.toLocaleString() : '-'}</td>
              <td class="p-2 text-right font-semibold ${r.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${r.net !== 0 || r.expenseTotal || r.incomeTotal ? (r.net >= 0 ? '+' : '') + r.net.toLocaleString() : '-'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>`;
  $('#db-content', root).querySelectorAll('.db-chart-card').forEach(card => {
    bindChartInspector(card, { hint: 'แตะจุดหรือแท่งกราฟเพื่อดูข้อมูลรายเดือน' });
  });
}
