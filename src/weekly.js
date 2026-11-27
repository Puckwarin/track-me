import { state } from './state.js';
import { getFoodRecordsInRange } from './foodService.js';
import { isPreviewMode } from './preview.js';
import { $, esc, fmtDate, localDateStr, addDays, daysBetween, round1, addMonthsLocal, mondayOf, shiftMonth, monthEndDate } from './util.js';
import { getTargets } from './profile.js';
import { TYPES } from './workoutConstants.js';
import { collectReminders, trackedSources } from './reminders.js';
import { iconSvg } from './icons.js';
import { bindChartInspector, emptyState, loadingState } from './ui.js';
import { summarizeFinanceRange, summarizePeriodMetrics } from './overviewLogic.js';
import { barChartSvg, getChartPalette } from './chartPrimitives.js';

let root;
let weekStart = mondayOf(localDateStr());
let selectedMonth = localDateStr().slice(0, 7);
let summaryMode = 'weekly';
let seq = 0;

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const fmtMoney = n => Math.round(n || 0).toLocaleString();
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function renderLoadingSkeleton(message) {
  const body = $('#wk-body', root);
  if (!body) return;
  body.innerHTML = `<div class="card lg:col-span-3" role="status" aria-live="polite">${loadingState({ label: message })}</div>`;
}

function inventoryAndReminderSummary(today) {
  const products = state.trackedProducts || [];
  const lowCount = products.filter(p => p.quantity != null && p.lowAt != null && Number(p.quantity) <= Number(p.lowAt)).length;
  const expiringCount = products.filter(p => {
    const exp = p.expiryDate || (p.openedDate && p.paoMonths ? addMonthsLocal(p.openedDate, Number(p.paoMonths)) : p.paoExpiry);
    return exp && daysBetween(today, exp) <= 30;
  }).length;
  const active = collectReminders();
  const overdueCount = active.filter(r => r.date && r.date < today).length;
  return { total: products.length, lowCount, expiringCount, activeCount: active.length, overdueCount, scheduledTotal: trackedSources().length };
}

function buildFoodInsights({ foodError, loggedCount, totalDays, periodLabel, avgP, targetProtein, over, under, periodMetrics, compareEnd, today, weightCompareLabel }) {
  const tips = [];
  if (foodError) tips.push('ไม่สามารถดึงข้อมูลอาหารจากเซิร์ฟเวอร์ได้ในขณะนี้ (แสดงเฉพาะข้อมูลส่วนอื่นในเครื่อง)');
  else if (!loggedCount) tips.push(`${periodLabel}ยังไม่มีบันทึกอาหาร`);
  else {
    const minLoggedThreshold = Math.max(3, Math.round(totalDays * 0.65));
    if (loggedCount < minLoggedThreshold && compareEnd < today) {
      tips.push(`บันทึกอาหาร ${loggedCount}/${totalDays} วัน — ยิ่งบันทึกครบ สรุปยิ่งแม่น`);
    }
    if (avgP !== null && avgP < targetProtein * 0.8) {
      tips.push(`โปรตีนเฉลี่ย ${Math.round(avgP)} g ต่ำกว่าเป้า ${targetProtein} g`);
    }
    if (over >= Math.max(3, Math.round(totalDays * 0.35))) {
      tips.push(`เกินเป้าแคลอรี่ ${over} วัน — ลองวางแผนมื้อล่วงหน้า`);
    }
    if (under >= Math.max(3, Math.round(totalDays * 0.35))) {
      tips.push(`ต่ำกว่าเป้ามาก ${under} วัน — กินน้อยเกินไปต่อเนื่องอาจเหนื่อยง่าย`);
    }
  }

  const wSum = periodMetrics.workouts.summary;
  const ws = periodMetrics.workouts.list;
  if (ws.length === 0 && compareEnd < today) tips.push(`${periodLabel}ไม่ได้ออกกำลังกายตามที่บันทึก`);
  if (ws.length >= (totalDays > 10 ? 8 : 3)) tips.push(`ออกกำลังกาย ${ws.length} ครั้ง เยี่ยมมาก`);
  if ((wSum.avgSessionRpe != null && wSum.avgSessionRpe >= 8.5) || ws.some(w => w.feeling === 'exhausted' || w.effortLevel === 'very_hard' || w.nextDayRecovery === 'sore_multi')) {
    tips.push('ความเหนื่อยสะสมจากการออกกำลังกายค่อนข้างสูง ลองจัดวันพักฟื้นหรือลดความหนักสลับกัน');
  }

  const wDelta = periodMetrics.weight.delta;
  if (wDelta !== null && Math.abs(wDelta) >= 1) {
    tips.push(`น้ำหนักเฉลี่ย${wDelta > 0 ? 'เพิ่ม' : 'ลด'} ${Math.abs(wDelta)} กก. ${weightCompareLabel} (ความผันผวนรายวันเป็นเรื่องปกติ ดูแนวโน้มหลายสัปดาห์)`);
  }
  if (periodMetrics.sleep.avg !== null && periodMetrics.sleep.avg < 6) {
    tips.push(`${periodLabel}นอนเฉลี่ย ${periodMetrics.sleep.avg} ชม./คืน — ลองพักผ่อนให้ใกล้เคียง 7–8 ชม. จะช่วยการฟื้นตัวและความอยากอาหารได้`);
  }
  return tips;
}

function renderUnifiedPeriodBody({
  mode,
  foodError,
  loggedCount,
  totalDays,
  avgCal,
  avgP,
  over,
  under,
  targets,
  chartHtml,
  metrics,
  fin,
  invRem,
  tips,
  weightCompareLabel,
  periodNoun
}) {
  const palette = getChartPalette();
  const stat = (label, val, sub = '') => `
    <div class="bg-[#F4F9FE] border border-slate-200/90 rounded-xl p-3">
      <p class="text-xs text-slate-600">${label}</p>
      <p class="text-lg font-bold text-slate-800 tabular-nums">${val}</p>
      ${sub ? `<p class="text-[11px] text-slate-500 tabular-nums">${sub}</p>` : ''}
    </div>`;

  const { weight, sleep, steps, workouts, symptomDays, periodCount } = metrics;
  const wSum = workouts.summary;
  const foodHeading = mode === 'monthly' ? 'อาหาร & โภชนาการรายเดือน' : 'อาหาร & โภชนาการรายสัปดาห์';
  const financeHeading = mode === 'monthly' ? 'การเงินเดือนนี้' : 'การเงินสัปดาห์นี้';

  $('#wk-body', root).innerHTML = `
    <div class="card space-y-3 lg:col-span-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('food', { size: 17, className: 'text-brand' })}<span>${foodHeading}</span></h3>
        ${foodError ? '<span class="tm-badge tm-badge-warning">โหลดบันทึกอาหารไม่สำเร็จ</span>' : ''}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${stat('วันที่บันทึกอาหาร', `${loggedCount}/${totalDays} วัน`)}
        ${stat('พลังงานเฉลี่ย/วัน', avgCal === null ? '—' : `${Math.round(avgCal).toLocaleString()} kcal`, `เป้า ${targets.kcal.toLocaleString()} kcal`)}
        ${stat('โปรตีนเฉลี่ย/วัน', avgP === null ? '—' : `${round1(avgP)} g`, `เป้า ${targets.protein} g`)}
        ${stat('เกิน / ต่ำกว่าเป้า', loggedCount ? `${over} / ${under} วัน` : '—', 'เกิน >110% · ต่ำ <80%')}
      </div>
      ${chartHtml}
    </div>

    <div class="space-y-4">
      <div class="card space-y-2.5">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('body', { size: 17, className: 'text-brand' })}<span>น้ำหนัก · การนอน · ก้าวเดิน</span></h3>
        ${weight.avg === null
          ? `<p class="text-xs text-slate-500">ไม่มีการชั่งน้ำหนักใน${periodNoun}</p>`
          : `<p class="text-lg font-bold tabular-nums">${weight.avg} กก. <span class="text-xs font-normal text-slate-500">เฉลี่ย (${weight.count} ครั้ง)</span></p>
             ${weight.count > 1 ? `<p class="text-xs text-slate-600 tabular-nums">ต้นช่วง ${weight.first} → ปลาย ${weight.last} กก.</p>` : ''}
             <p class="text-xs tabular-nums ${weight.delta === null ? 'text-slate-500' : weight.delta > 0 ? 'text-rose-600' : 'text-emerald-700'}">${weight.delta === null ? 'ไม่มีข้อมูลช่วงก่อนให้เทียบ' : `${weightCompareLabel} ${weight.delta > 0 ? '+' : ''}${weight.delta} กก.`}</p>`}
        ${(sleep.avg !== null || steps.avg !== null) ? `<div class="border-t border-slate-100 pt-2 text-xs text-slate-600 space-y-1 tabular-nums">
          ${sleep.avg !== null ? `<p>นอนเฉลี่ย <b>${sleep.avg}</b> ชม./คืน (${sleep.count} คืน)</p>` : ''}
          ${steps.avg !== null ? `<p>ก้าวเดินเฉลี่ย <b>${steps.avg.toLocaleString()}</b> ก้าว/วัน (รวม ${steps.total.toLocaleString()})</p>` : ''}
        </div>` : ''}
      </div>

      <div class="card space-y-2">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('workout', { size: 17, className: 'text-brand' })}<span>ออกกำลังกาย</span></h3>
        ${wSum.count
          ? `<p class="text-lg font-bold tabular-nums">${wSum.count} ครั้ง <span class="text-xs font-normal text-slate-500">${wSum.totalMinutes ? `· ${wSum.totalMinutes} นาที รวม` : ''}${wSum.totalKcal ? ` · ~${wSum.totalKcal} kcal` : ''}</span></p>
             ${Object.entries(wSum.byType).map(([t, n]) => `<p class="text-xs text-slate-600 tabular-nums">${esc(TYPES[t] || t)}: ${n} ครั้ง</p>`).join('')}
             ${workouts.intensityText ? `<p class="text-xs text-slate-600 tabular-nums">ความหนัก: ${esc(workouts.intensityText)}</p>` : ''}
             ${workouts.evalText ? `<p class="text-xs text-brand-dark tabular-nums">${esc(workouts.evalText)}</p>` : ''}`
          : `<p class="text-xs text-slate-500">ยังไม่มีบันทึกออกกำลังกายใน${periodNoun}</p>`}
      </div>

      <div class="card space-y-2">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('period', { size: 17, className: 'text-pink-500' })}<span>ประจำเดือน & อาการ</span></h3>
        <div class="text-xs text-slate-600 space-y-1 tabular-nums">
          <p>รอบประจำเดือนในช่วงนี้: <b>${periodCount}</b> รอบ</p>
          <p>วันที่มีบันทึกอาการ: <b>${symptomDays}</b> วัน</p>
        </div>
      </div>

      <div class="card space-y-2">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('expense', { size: 17, className: 'text-brand' })}<span>${financeHeading}</span></h3>
        ${fin.count
          ? `<p class="text-sm tabular-nums">รับ <b class="text-emerald-700">฿${fmtMoney(fin.income)}</b> · จ่าย <b class="text-rose-600">฿${fmtMoney(fin.expense)}</b></p>
             <p class="text-xs text-slate-600 tabular-nums">สุทธิ: <b class="${fin.net < 0 ? 'text-rose-600' : 'text-emerald-700'}">${fin.net >= 0 ? '+' : ''}฿${fmtMoney(fin.net)}</b> (${fin.count} รายการ)</p>
             ${fin.topCats.length ? `<p class="text-[11px] text-slate-500 tabular-nums">ใช้จ่ายหลัก: ${fin.topCats.map(([c, v]) => `${esc(c)} ฿${fmtMoney(v)}`).join(' · ')}</p>` : ''}`
          : `<p class="text-xs text-slate-500">ไม่มีรายการรายรับ-รายจ่ายใน${periodNoun}</p>`}
      </div>

      <div class="card space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('inventory', { size: 17, className: 'text-brand' })}<span>สต๊อก & แจ้งเตือน</span></h3>
          <span class="tm-badge tm-badge-info">ณ ปัจจุบัน</span>
        </div>
        <p class="text-xs text-slate-600 tabular-nums">สต๊อกทั้งหมด <b>${invRem.total}</b> · ใกล้หมด <b>${invRem.lowCount}</b> · ใกล้หมดอายุ <b>${invRem.expiringCount}</b></p>
        <p class="text-xs text-slate-600 tabular-nums">แจ้งเตือนถึงกำหนด <b>${invRem.activeCount}</b> รายการ${invRem.overdueCount ? ` (<span class="font-semibold" style="color:${palette.errorFg}">เลยกำหนด ${invRem.overdueCount}</span>)` : ''} · ทั้งหมด ${invRem.scheduledTotal} กำหนดการ</p>
      </div>
    </div>

    <div class="card lg:col-span-3">
      <h3 class="font-bold text-slate-800 mb-2">ข้อสังเกต</h3>
      ${tips.length
        ? `<ul class="list-disc pl-5 text-sm text-slate-700 space-y-1">${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`
        : '<p class="text-sm text-slate-600">ทุกอย่างอยู่ในเกณฑ์ที่ตั้งไว้</p>'}
      <p class="text-[11px] text-slate-500 mt-2">สรุปจากข้อมูลที่บันทึกเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์</p>
    </div>`;
  bindChartInspector($('#wk-food-chart', root), { hint: 'แตะแท่งกราฟเพื่อดูแคลอรี่แต่ละวัน' });
}

export function mountWeekly(el) {
  root = el;
  root.innerHTML = `
  <div class="space-y-4">
    <div class="card !py-3.5 !px-4 sm:!px-5 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <button id="wk-prev" type="button" class="btn btn-ghost !px-3 min-w-[44px] min-h-[44px]" aria-label="ช่วงก่อน">${iconSvg('chevron-left', { size: 16 })}</button>
        <div class="min-w-0">
          <h3 id="wk-title" class="font-bold text-slate-800 inline-flex items-center gap-1.5 text-base">${iconSvg('weekly', { size: 17, className: 'text-brand' })}<span>สรุปช่วงเวลา</span></h3>
          <p id="wk-range" class="text-xs sm:text-sm text-slate-600 tabular-nums"></p>
        </div>
        <button id="wk-next" type="button" class="btn btn-ghost !px-3 min-w-[44px] min-h-[44px]" aria-label="ช่วงถัดไป">${iconSvg('chevron-right', { size: 16 })}</button>
      </div>
      <div class="tm-seg tm-seg--2 shrink-0" role="tablist" aria-label="ช่วงสรุปข้อมูล">
        <button id="sum-week" type="button" role="tab" aria-selected="true" class="tm-seg-btn is-active">รายสัปดาห์</button>
        <button id="sum-month" type="button" role="tab" aria-selected="false" class="tm-seg-btn">รายเดือน</button>
      </div>
    </div>
    <div id="wk-body" class="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6"></div>
  </div>`;
  $('#wk-prev', root).addEventListener('click', () => {
    if (summaryMode === 'monthly') {
      selectedMonth = shiftMonth(selectedMonth, -1);
      void renderWeekly();
    } else {
      weekStart = addDays(weekStart, -7);
      void renderWeekly();
    }
  });
  $('#wk-next', root).addEventListener('click', () => {
    if (summaryMode === 'monthly') {
      selectedMonth = shiftMonth(selectedMonth, 1);
      void renderWeekly();
    } else {
      weekStart = addDays(weekStart, 7);
      void renderWeekly();
    }
  });
  $('#sum-week', root).onclick = () => { summaryMode = 'weekly'; void renderWeekly(); };
  $('#sum-month', root).onclick = () => { summaryMode = 'monthly'; void renderWeekly(); };
  window.addEventListener('trackme:overview-refresh', () => { if (root?.isConnected) void renderWeekly(); });
  void renderWeekly();
}

export function resetWeeklyToToday() {
  const today = localDateStr();
  weekStart = mondayOf(today);
  selectedMonth = today.slice(0, 7);
}

export async function renderWeekly() {
  if (!root || (!state.uid && !isPreviewMode())) return;
  const weekBtn = $('#sum-week', root);
  const monthBtn = $('#sum-month', root);
  weekBtn.className = `tm-seg-btn ${summaryMode === 'weekly' ? 'is-active' : ''}`;
  monthBtn.className = `tm-seg-btn ${summaryMode === 'monthly' ? 'is-active' : ''}`;
  weekBtn.setAttribute('aria-selected', String(summaryMode === 'weekly'));
  monthBtn.setAttribute('aria-selected', String(summaryMode === 'monthly'));
  $('#wk-prev', root).setAttribute('aria-label', summaryMode === 'monthly' ? 'เดือนก่อน' : 'สัปดาห์ก่อน');
  $('#wk-next', root).setAttribute('aria-label', summaryMode === 'monthly' ? 'เดือนถัดไป' : 'สัปดาห์ถัดไป');
  if (summaryMode === 'monthly') return renderMonthly();

  const my = ++seq;
  const end = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = localDateStr();
  $('#wk-range', root).textContent = `${fmtDate(weekStart)} – ${fmtDate(end)}${weekStart === mondayOf(today) ? ' (สัปดาห์นี้)' : ''}`;
  $('#wk-next', root).disabled = weekStart >= mondayOf(today);
  renderLoadingSkeleton('กำลังโหลดสรุปรายสัปดาห์...');

  let food = [];
  let foodError = false;
  try {
    food = (await getFoodRecordsInRange(state.uid, weekStart, end)).docs.map(d => d.data());
  } catch {
    foodError = true;
  }
  if (my !== seq) return;

  const T = getTargets();
  const byDay = Object.fromEntries(days.map(d => [d, { cal: 0, p: 0, n: 0 }]));
  food.forEach(f => {
    const x = byDay[f.date];
    if (x) {
      x.cal += num(f.calories);
      x.p += num(f.protein);
      x.n += 1;
    }
  });
  const logged = days.filter(d => byDay[d].n > 0 && d <= today);
  const avgCal = avg(logged.map(d => byDay[d].cal));
  const avgP = avg(logged.map(d => byDay[d].p));
  const over = logged.filter(d => byDay[d].cal > T.kcal * 1.1).length;
  const under = logged.filter(d => byDay[d].cal < T.kcal * 0.8).length;

  const dowShort = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  const chartRows = days.map((d, i) => ({
    date: d,
    label: dowShort[i],
    cal: Math.round(byDay[d].cal),
    protein: Math.round(byDay[d].p)
  }));
  const chartHtml = logged.length
    ? `<div id="wk-food-chart">${barChartSvg({
        data: chartRows,
        labelKey: 'label',
        valueKey: 'cal',
        unit: 'kcal',
        width: 340,
        height: 155,
        padL: 34,
        padR: 16,
        padT: 14,
        padB: 26,
        showYAxis: false,
        targetValue: T.kcal,
        targetLabel: `เป้า ${T.kcal.toLocaleString()}`,
        ariaLabel: 'กราฟพลังงานรายวันตลอดสัปดาห์',
        barColorFn: (row, _i, palette) => (row.cal > T.kcal * 1.1 ? palette.warning : palette.brandDark),
        tipFormatter: row => `${fmtDate(row.date)}: ${row.cal.toLocaleString()} kcal`,
        subFormatter: row => (row.cal
          ? (row.cal > T.kcal * 1.1 ? 'เกินเป้า' : row.cal < T.kcal * 0.8 ? 'ต่ำกว่าเป้า' : 'ใกล้เคียงเป้า')
          : 'ไม่มีบันทึก')
      })}</div>`
    : emptyState({
        icon: 'food',
        title: foodError ? 'โหลดบันทึกอาหารไม่สำเร็จในขณะนี้' : 'สัปดาห์นี้ยังไม่มีบันทึกอาหาร',
        description: foodError ? 'แสดงข้อมูลส่วนอื่นที่มีอยู่ในเครื่องให้ตามปกติ' : ''
      });

  const metrics = summarizePeriodMetrics({
    start: weekStart,
    end,
    prevStart: addDays(weekStart, -7),
    prevEnd: addDays(weekStart, -1),
    body: state.body,
    workouts: state.workouts,
    symptoms: state.symptoms,
    period: state.period
  });
  const fin = summarizeFinanceRange(state.expenses, weekStart, end);
  const invRem = inventoryAndReminderSummary(today);
  const tips = buildFoodInsights({
    foodError,
    loggedCount: logged.length,
    totalDays: 7,
    periodLabel: 'สัปดาห์นี้',
    avgP,
    targetProtein: T.protein,
    over,
    under,
    periodMetrics: metrics,
    compareEnd: end,
    today,
    weightCompareLabel: 'เทียบสัปดาห์ก่อน'
  });

  renderUnifiedPeriodBody({
    mode: 'weekly',
    foodError,
    loggedCount: logged.length,
    totalDays: 7,
    avgCal,
    avgP,
    over,
    under,
    targets: T,
    chartHtml,
    metrics,
    fin,
    invRem,
    tips,
    weightCompareLabel: 'เทียบสัปดาห์ก่อน',
    periodNoun: 'สัปดาห์นี้'
  });
}

async function renderMonthly() {
  const my = ++seq;
  const [y, m] = selectedMonth.split('-').map(Number);
  const start = `${selectedMonth}-01`;
  const end = monthEndDate(selectedMonth);
  const prevYm = shiftMonth(selectedMonth, -1);
  const prevStart = `${prevYm}-01`;
  const prevEnd = monthEndDate(prevYm);
  const today = localDateStr();
  $('#wk-range', root).textContent = new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  $('#wk-next', root).disabled = selectedMonth >= today.slice(0, 7);
  renderLoadingSkeleton('กำลังโหลดสรุปรายเดือน...');

  let food = [];
  let foodError = false;
  try {
    food = (await getFoodRecordsInRange(state.uid, start, end)).docs.map(d => d.data());
  } catch {
    foodError = true;
  }
  if (my !== seq) return;

  const T = getTargets();
  const daysInMonth = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${selectedMonth}-${String(i + 1).padStart(2, '0')}`);
  const byDay = Object.fromEntries(daysInMonth.map(d => [d, { cal: 0, p: 0, n: 0 }]));
  food.forEach(f => {
    const x = byDay[f.date];
    if (x) {
      x.cal += num(f.calories);
      x.p += num(f.protein);
      x.n += 1;
    }
  });
  const logged = daysInMonth.filter(d => byDay[d].n > 0 && d <= today);
  const avgCal = avg(logged.map(d => byDay[d].cal));
  const avgP = avg(logged.map(d => byDay[d].p));
  const over = logged.filter(d => byDay[d].cal > T.kcal * 1.1).length;
  const under = logged.filter(d => byDay[d].cal < T.kcal * 0.8).length;

  const chartRows = daysInMonth.map((d, i) => ({
    date: d,
    dayNum: i + 1,
    label: String(i + 1),
    cal: Math.round(byDay[d].cal),
    protein: Math.round(byDay[d].p)
  }));
  const chartHtml = logged.length
    ? `<div id="wk-food-chart">${barChartSvg({
        data: chartRows,
        labelKey: 'label',
        valueKey: 'cal',
        unit: 'kcal',
        width: 680,
        height: 170,
        padL: 26,
        padR: 16,
        padT: 14,
        padB: 26,
        showYAxis: false,
        targetValue: T.kcal,
        targetLabel: `เป้า ${T.kcal.toLocaleString()}`,
        ariaLabel: 'กราฟแคลอรี่รายเดือน',
        xLabelFilter: (_row, i, total) => i % 5 === 0 || i === total - 1,
        tipFormatter: row => `${fmtDate(row.date)}: ${row.cal.toLocaleString()} kcal`,
        subFormatter: row => (row.cal ? `โปรตีน ${row.protein} g` : 'ไม่มีบันทึก')
      })}</div>`
    : emptyState({
        icon: 'food',
        title: foodError ? 'โหลดบันทึกอาหารเดือนนี้ไม่สำเร็จ' : 'เดือนนี้ยังไม่มีบันทึกอาหาร',
        description: foodError ? 'แสดงข้อมูลส่วนอื่นที่มีอยู่ในเครื่องให้ตามปกติ' : ''
      });

  const metrics = summarizePeriodMetrics({
    start,
    end,
    prevStart,
    prevEnd,
    body: state.body,
    workouts: state.workouts,
    symptoms: state.symptoms,
    period: state.period
  });
  const fin = summarizeFinanceRange(state.expenses, start, end);
  const invRem = inventoryAndReminderSummary(today);
  const tips = buildFoodInsights({
    foodError,
    loggedCount: logged.length,
    totalDays: daysInMonth.length,
    periodLabel: 'เดือนนี้',
    avgP,
    targetProtein: T.protein,
    over,
    under,
    periodMetrics: metrics,
    compareEnd: end,
    today,
    weightCompareLabel: 'เทียบเดือนก่อน'
  });

  renderUnifiedPeriodBody({
    mode: 'monthly',
    foodError,
    loggedCount: logged.length,
    totalDays: daysInMonth.length,
    avgCal,
    avgP,
    over,
    under,
    targets: T,
    chartHtml,
    metrics,
    fin,
    invRem,
    tips,
    weightCompareLabel: 'เทียบเดือนก่อน',
    periodNoun: 'เดือนนี้'
  });
}
