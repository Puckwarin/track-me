import { state } from './state.js';
import { getFoodRecordsInRange } from './foodService.js';
import { isPreviewMode } from './preview.js';
import { $, esc, fmtDateTime, localDateStr, monthEndDate, toast } from './util.js';
import { getTargets } from './profile.js';
import {
  aggregateMonthlyOverview, buildMonthKeys, compactFoodForOverview, readOverviewCache, writeOverviewCache
} from './overviewLogic.js';
import { iconSvg } from './icons.js';
import { bindChartInspector } from './ui.js';

let root = null;
let rangeMonths = 6;
let seq = 0;
let cachedRangeKey = '';
let cachedFood = [];
let cachedUpdatedAt = 0;
let cachedFromStorage = false;
let lastFoodError = '';
let isLoading = false;

const fmtMoney = n => Math.round(n || 0).toLocaleString('th-TH');

function renderBarChart(months, valueKey, {
  color = '#8b5cf6',
  emptyText = 'ยังไม่มีข้อมูลในช่วงเวลานี้',
  targetValue = null,
  targetLabel = '',
  formatTooltip = (m, v) => `${m.label}: ${v}`
} = {}) {
  const vals = months.map(m => m[valueKey]);
  const numericVals = vals.filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (!numericVals.length) {
    return `<p class="text-xs text-slate-500 py-8 text-center">${esc(emptyText)}</p>`;
  }
};

  const W = 440, H = 165, padX = 28, padTop = 20, padBottom = 26;
  const maxVal = Math.max(...numericVals, targetValue || 0, 1);
  const bw = (W - padX * 2) / months.length;
  const yPos = v => H - padBottom - (Math.max(0, v) / maxVal) * (H - padTop - padBottom);

  const targetLine = targetValue && targetValue > 0
    ? `<line x1="${padX}" x2="${W - padX}" y1="${yPos(targetValue)}" y2="${yPos(targetValue)}" stroke="#ec4899" stroke-dasharray="4 3" stroke-width="1.2"/>
       <text x="${W - padX}" y="${Math.max(11, yPos(targetValue) - 4)}" font-size="9" text-anchor="end" fill="#ec4899">${esc(targetLabel)}</text>`
    : '';

  const bars = months.map((m, i) => {
    const v = typeof m[valueKey] === 'number' ? m[valueKey] : 0;
    const barW = Math.max(8, Math.min(28, bw - 8));
    const x = padX + i * bw + (bw - barW) / 2;
    const y = yPos(v);
    const h = Math.max(0, H - padBottom - y);
    const showLabel = months.length <= 6 || i % 2 === 0 || i === months.length - 1;
    const tipText = formatTooltip(m, v);
    return `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${v > 0 ? color : '#e2e8f0'}"></rect>
      <rect x="${padX + i * bw}" y="${padTop}" width="${bw}" height="${H - padTop - padBottom}" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(tipText)}" data-chart-color="${v > 0 ? color : '#94a3b8'}" aria-label="${esc(tipText)}"><title>${esc(tipText)}</title></rect>
      ${showLabel ? `<text x="${x + barW / 2}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#64748b">${esc(m.label)}</text>` : ''}
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="${esc(emptyText)}">${bars}${targetLine}</svg>`;
}

function monthLabel(ms) {
  const [y, m] = ms.split('-');
  const d = new Date(+y, +m - 1, 1);
  return d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}
function monthRange(count) {
  const today = new Date();
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export function mountDashboard(el) {
  root = el;
  root.innerHTML = `
  <div class="db-page">
    <header class="db-header">
      <div class="db-heading">
        <div class="db-eyebrow">TRACK ME · YOUR WELLNESS AT A GLANCE</div>
        <h2>ภาพรวมสุขภาพและไลฟ์สไตล์</h2>
        <p>ติดตามแนวโน้มของคุณในที่เดียว แล้วค่อย ๆ ปรับในแบบที่เหมาะกับตัวเอง</p>
      </div>
      <div class="db-controls">
        <div class="db-range tm-seg tm-seg--3 db-overview-only" role="group" aria-label="ช่วงเวลาสรุปข้อมูล">
          <button type="button" id="db-range-3" class="tm-seg-btn" aria-pressed="false">3 เดือน</button>
          <button type="button" id="db-range-6" class="tm-seg-btn" aria-pressed="true">6 เดือน</button>
          <button type="button" id="db-range-12" class="tm-seg-btn" aria-pressed="false">12 เดือน</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="tm-seg tm-seg--3" role="tablist" aria-label="สลับมุมมองภาพรวม">
            <button type="button" role="tab" id="db-view-overview" data-page-go="overview" aria-pressed="true" aria-selected="true" class="tm-seg-btn is-active">ภาพรวม</button>
            <button type="button" role="tab" id="db-view-weekly" data-page-go="weekly" aria-pressed="false" aria-selected="false" class="tm-seg-btn">สรุป</button>
            <button type="button" role="tab" data-page-go="report" class="tm-seg-btn">${iconSvg('report', { size: 14 })}<span>รายงาน</span></button>
          </div>
          <button type="button" id="db-refresh" class="db-refresh db-overview-only">${iconSvg('rotate-right', { size: 14 })}<span>รีเฟรช</span></button>
        </div>
      </div>
    </header>
    <section class="db-welcome db-overview-only" aria-label="คำแนะนำการใช้งานแดชบอร์ด">
      <div>
        <span class="db-welcome-kicker">บันทึกเล็ก ๆ สร้างความเปลี่ยนแปลงได้</span>
        <h3>กลับมาดูแลตัวเองกันต่อ</h3>
        <p>ข้อมูลจะค่อย ๆ ชัดขึ้นเมื่อคุณบันทึกอย่างสม่ำเสมอ</p>
      </div>
      <span class="db-welcome-mark" aria-hidden="true">${iconSvg('brand', { size: 24 })}</span>
    </section>
    <div id="db-content" class="db-content" aria-live="polite"><p class="db-loading">กำลังรวบรวมข้อมูล…</p></div>
    <div id="db-weekly" class="hidden lg:col-span-3 grid grid-cols-1 md:gap-6 lg:grid-cols-3 gap-4 lg:gap-8" aria-live="polite"></div>
  </div>`;

  const dots = points.map(p => {
    const tip = `${p.m.label}: เฉลี่ย ${p.v} กก.`;
    const sub = `ล่าสุด ${p.m.weightLatest} กก.`;
    return `<g>
      <circle cx="${xAt(p.i)}" cy="${yAt(p.v)}" r="4" fill="#3b82f6" stroke="#ffffff" stroke-width="1.5"></circle>
      <circle cx="${xAt(p.i)}" cy="${yAt(p.v)}" r="12" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(tip)}" data-chart-sub="${esc(sub)}" data-chart-color="#3b82f6" aria-label="${esc(tip)}"><title>${esc(`${tip} (${sub})`)}</title></circle>
      <text x="${xAt(p.i)}" y="${Math.max(12, yAt(p.v) - 8)}" font-size="9" text-anchor="middle" fill="#1e40af">${p.v}</text>
    </g>`;
  }).join('');

  loadAndRender(monthCount);
}

export function resetDashboardToToday() {
  if (root) loadAndRender(6);
}

  const preview = isPreviewMode();
  const storageHit = preview ? null : readOverviewCache(state.uid, rangeMonths, { today });
  if (!forceRefresh && storageHit) {
    cachedFood = storageHit.food;
    cachedUpdatedAt = storageHit.updatedAt;
    cachedFromStorage = true;
    cachedRangeKey = key;
    lastFoodError = '';
    if (storageHit.fresh) {
      renderView();
      return;
    }
    renderView();
  }

export function renderDashboard() {
  if (root && !loading) void loadAndRender(6);
}

async function loadAndRender(monthCount) {
  if (loading || (!state.uid && !isPreviewMode())) return;
  loading = true;
  const btn = $('#db-refresh', root);
  if (btn) { btn.disabled = true; btn.innerHTML = `${iconSvg('fa-spinner fa-spin', { size: 14 })}<span>กำลังโหลด…</span>`; }
  $('#db-content', root).innerHTML = '<p class="db-loading">กำลังรวบรวมข้อมูล…</p>';
  try {
    const snap = await getFoodRecordsInRange(state.uid, start, end);
    if (mySeq !== seq) return;
    const foodRows = compactFoodForOverview(snap.docs.map(d => d.data()));
    cachedFood = foodRows;
    cachedRangeKey = key;
    cachedUpdatedAt = Date.now();
    cachedFromStorage = false;
    if (!preview) {
      const summarySnapshot = aggregateMonthlyOverview({
        monthsCount: rangeMonths,
        today,
        food: foodRows,
        workouts: state.workouts || [],
        body: state.body || [],
        expenses: state.expenses || []
      });
      writeOverviewCache(state.uid, rangeMonths, {
        today,
        food: foodRows,
        overviewSummary: summarySnapshot,
        now: cachedUpdatedAt
      });
    }
  } catch (err) {
    if (mySeq !== seq) return;
    if (storageHit) {
      cachedFood = storageHit.food;
      cachedUpdatedAt = storageHit.updatedAt;
      cachedFromStorage = true;
      cachedRangeKey = key;
      lastFoodError = 'โหลดข้อมูลล่าสุดไม่สำเร็จ กำลังแสดงยอดสรุปจากแคชในเครื่อง';
    } else {
      lastFoodError = 'โหลดข้อมูลแคลอรี่ย้อนหลังบางส่วนไม่สำเร็จ (แสดงเฉพาะข้อมูลที่มีในแคช)';
    }
    if (forceRefresh) toast('รีเฟรชข้อมูลอาหารไม่สำเร็จ: ' + (err?.message || 'ตรวจสอบการเชื่อมต่อ'), 'err');
  } finally {
    loading = false;
    if (btn) { btn.disabled = false; btn.innerHTML = `${iconSvg('rotate-right', { size: 14 })}<span>รีเฟรช</span>`; }
  }
}

async function loadData(monthCount) {
  const months = monthRange(monthCount);
  const from = months[0] + '-01';
  const to = localDateStr();

  const rangeQuery = name => isPreviewMode()
    ? Promise.resolve(getPreviewRecordsInRange(name, from, to))
    : getDocs(query(userCol(state.uid, name), where('date', '>=', from), where('date', '<=', to)))
        .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
        .catch(() => []);

  const [food, workouts] = await Promise.all([rangeQuery('food_records'), rangeQuery('workout_records')]);
  const body = state.body.filter(b => b.date >= from && b.date <= to);
  const expenses = (state.expenses || []).filter(e => (e.date || '') >= from && (e.date || '') <= to);

  const byMonth = {};
  for (const ms of months) byMonth[ms] = { weight: [], kcal: 0, kcalDays: 0, workoutCount: 0, workoutMin: 0, expenseTotal: 0, incomeTotal: 0 };

  for (const b of body) {
    if (typeof b.weight !== 'number') continue;
    const ms = (b.date || '').slice(0, 7);
    if (byMonth[ms]) byMonth[ms].weight.push(b.weight);
  }
  for (const f of food) {
    const ms = (f.date || '').slice(0, 7);
    if (!byMonth[ms]) continue;
    byMonth[ms].kcal += f.calories || 0;
    byMonth[ms].kcalDays += 1;
  }
  for (const w of workouts) {
    if (w.status === 'planned') continue;
    const ms = (w.date || '').slice(0, 7);
    if (!byMonth[ms]) continue;
    byMonth[ms].workoutCount += 1;
    byMonth[ms].workoutMin += w.durationMin || 0;
  }
  for (const e of expenses) {
    const ms = (e.date || '').slice(0, 7);
    if (!byMonth[ms]) continue;
    const amt = toNum(e.amount) || 0;
    if (e.type === 'income') byMonth[ms].incomeTotal += amt;
    else if (e.type !== 'transfer') byMonth[ms].expenseTotal += amt;
  }

  return months.map(ms => {
    const d = byMonth[ms];
    const weights = d.weight;
    const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : null;
    const lastWeight = weights.length ? weights[weights.length - 1] : null;
    return {
      month: ms,
      label: monthLabel(ms),
      weight: lastWeight,
      avgWeight: avgWeight ? round1(avgWeight) : null,
      avgKcal: d.kcalDays ? Math.round(d.kcal / d.kcalDays) : null,
      workoutCount: d.workoutCount,
      workoutMin: d.workoutMin,
      expenseTotal: Math.round(d.expenseTotal),
      incomeTotal: Math.round(d.incomeTotal),
      net: Math.round(d.incomeTotal - d.expenseTotal)
    };
  });
}

function lineChart(data, valueKey, color, unit, decimals = 0, palette = getDashboardPalette()) {
  const pts = data.filter(d => d[valueKey] != null);
  if (pts.length < 1) return '<p class="text-xs text-slate-400">ยังไม่มีข้อมูล</p>';
  const W = 340, H = 170, P = 36;
  const vals = pts.map(d => d[valueKey]);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1) { min = Math.max(0, min - 0.5); max += 0.5; }
  const n = data.length;
  const x = i => P + (n <= 1 ? (W - 2 * P) / 2 : (i / (n - 1)) * (W - 2 * P));
  const y = v => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const fmtV = v => decimals === 0 ? Math.round(v).toLocaleString() : v.toFixed(decimals);
  const idxMap = data.map((d, i) => d[valueKey] != null ? i : null).filter(i => i !== null);
  const line = idxMap.map(dataIdx => {
    const val = data[dataIdx][valueKey];
    return `${x(dataIdx).toFixed(1)},${y(val).toFixed(1)}`;
  }).join(' ');
  const dots = idxMap.map(dataIdx => {
    const d = data[dataIdx];
    const cx = x(dataIdx).toFixed(1);
    const cy = y(d[valueKey]).toFixed(1);
    const valStr = `${fmtV(d[valueKey])} ${unit}`;
    return `<g>
      <circle cx="${cx}" cy="${cy}" r="3.6" fill="${color}"></circle>
      <circle cx="${cx}" cy="${cy}" r="11" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(d.label)}: ${esc(valStr)}" data-chart-color="${color}" aria-label="${esc(d.label)} ${esc(valStr)}"><title>${esc(d.label)}: ${esc(valStr)}</title></g>
    </g>`;
  }).join('');
  const labels = data.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" font-size="9.5" fill="${palette.muted}" text-anchor="middle">${esc(d.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>
    ${dots}
    <text x="4" y="${y(max) + 4}" font-size="9.5" fill="${palette.axis}">${esc(fmtV(max))}</text>
    <text x="4" y="${y(min) + 4}" font-size="9.5" fill="${palette.axis}">${esc(fmtV(min))}</text>
    ${labels}
  </svg>`;
}

function barChart(data, valueKey, color, unit, decimals = 0, palette = getDashboardPalette()) {
  const pts = data.filter(d => d[valueKey] != null && d[valueKey] > 0);
  if (pts.length < 1) return '<p class="text-xs text-slate-400">ยังไม่มีข้อมูล</p>';
  const W = 340, H = 170, P = 36;
  const max = Math.max(...data.map(d => d[valueKey] || 0)) || 1;
  const n = data.length;
  const bw = (W - 2 * P) / n - 6;
  const x = i => P + (n <= 1 ? (W - 2 * P) / 2 - bw / 2 : (i / (n - 1)) * (W - 2 * P) - bw / 2);
  const y = v => H - P - (v / max) * (H - 2 * P);
  const fmtV = v => decimals === 0 ? Math.round(v).toLocaleString() : v.toFixed(decimals);
  const bars = data.map((d, i) => {
    const v = d[valueKey] || 0;
    const valStr = `${fmtV(v)} ${unit}`;
    const bx = x(i).toFixed(1);
    const bh = v > 0 ? H - P - y(v) : 0;
    return `<g>
      ${v > 0 ? `<rect x="${bx}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${color}" opacity="0.88"></rect>` : ''}
      <rect x="${bx}" y="12" width="${Math.max(bw, 16).toFixed(1)}" height="${H - P - 12}" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(d.label)}: ${v > 0 ? esc(valStr) : 'ไม่มีข้อมูล'}" data-chart-color="${v > 0 ? color : palette.muted}" aria-label="${esc(d.label)} ${esc(valStr)}"><title>${esc(d.label)}: ${esc(valStr)}</title></rect>
    </g>`;
  }).join('');
  const labels = data.map((d, i) => `<text x="${(x(i) + bw / 2).toFixed(1)}" y="${H - 6}" font-size="9.5" fill="${palette.muted}" text-anchor="middle">${esc(d.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">
    ${bars}
    <text x="4" y="${y(max) + 4}" font-size="9.5" fill="${palette.axis}">${esc(fmtV(max))}</text>
    <text x="4" y="${y(0)}" font-size="9.5" fill="${palette.muted}">0</text>
    ${labels}
  </svg>`;
}

  $('#ov-table-body', root).innerHTML = months.slice().reverse().map(m => `
    <tr>
      <td class="p-2.5 font-medium text-slate-800 whitespace-nowrap">${esc(m.label)}</td>
      <td class="p-2.5 text-right whitespace-nowrap tabular-nums">${m.weightLatest !== null ? `${m.weightLatest} กก.` : '—'}</td>
      <td class="p-2.5 text-right whitespace-nowrap tabular-nums">${m.calAvgPerLoggedDay !== null ? `${m.calAvgPerLoggedDay.toLocaleString()} (${m.foodDays}ว.)` : '—'}</td>
      <td class="p-2.5 text-right whitespace-nowrap tabular-nums">${m.workoutCount ? `${m.workoutCount} ครั้ง` : '—'}</td>
      <td class="p-2.5 text-right whitespace-nowrap tabular-nums">${m.expenseTotal ? `฿${fmtMoney(m.expenseTotal)}` : '—'}</td>
    </tr>`).join('');
  $('#ov-charts', root).querySelectorAll('.card').forEach(card => {
    bindChartInspector(card, { hint: 'แตะจุดหรือแท่งกราฟเพื่อดูข้อมูลรายเดือน' });
  });
}

export function mountOverview(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-3 space-y-6">
    <div class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('overview', { size: 19, className: 'text-brand' })}<span>แดชบอร์ดภาพรวมรายเดือน</span></h2>
          <p class="text-xs text-slate-600">เปรียบเทียบน้ำหนัก แคลอรี่ การออกกำลังกาย และค่าใช้จ่ายย้อนหลังในหน้าเดียว</p>
          <div class="flex flex-wrap gap-2 mt-2">
            <button type="button" id="ov-go-weekly" class="chip bg-sky-soft text-blue-700 whitespace-nowrap">${iconSvg('weekly', { size: 14 })} สรุปรายสัปดาห์</button>
            <button type="button" id="ov-go-report" class="chip bg-lav-soft text-brand-dark whitespace-nowrap">${iconSvg('report', { size: 14 })} รายงานสุขภาพ</button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" data-ov-range="3" class="chip whitespace-nowrap">3 เดือน</button>
          <button type="button" data-ov-range="6" class="chip whitespace-nowrap">6 เดือน</button>
          <button type="button" data-ov-range="12" class="chip whitespace-nowrap">12 เดือน</button>
          <button type="button" id="ov-refresh" class="btn btn-soft text-xs whitespace-nowrap">${iconSvg('rotate-right', { size: 14 })} รีเฟรช</button>
        </div>
      </div>
      <p id="ov-cache-info" class="hidden text-[11px] text-slate-500"></p>
      <p id="ov-notice" class="hidden text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2"></p>
      <div id="ov-kpis" class="grid grid-cols-2 lg:grid-cols-4 gap-3"></div>
    </div>

    <section role="tabpanel" id="db-panel-health" aria-labelledby="db-tab-health" data-db-panel="health" class="db-chart-panel" ${activeSection!=='health'?'hidden':''}>
      <div class="db-chart-card"><h3>${iconSvg('body', { size: 16, className: 'text-brand shrink-0' })}<span>น้ำหนัก (กก.)</span></h3>${lineChart(d, 'weight', palette.weight, 'กก.', 1, palette)}</div>
    </section>
    <section role="tabpanel" id="db-panel-nutrition" aria-labelledby="db-tab-nutrition" data-db-panel="nutrition" class="db-chart-panel" ${activeSection!=='nutrition'?'hidden':''}>
      <div class="db-chart-card"><h3>${iconSvg('flame', { size: 16, className: 'text-orange-500 shrink-0' })}<span>แคลอรี่เฉลี่ย/วัน (kcal)</span></h3>${lineChart(d, 'avgKcal', palette.kcal, 'kcal', 0, palette)}</div>
    </section>
    <section role="tabpanel" id="db-panel-activity" aria-labelledby="db-tab-activity" data-db-panel="activity" class="db-chart-panel" ${activeSection!=='activity'?'hidden':''}>
      <div class="db-chart-card"><h3>${iconSvg('workout', { size: 16, className: 'text-emerald-600 shrink-0' })}<span>จำนวนครั้งออกกำลังกาย</span></h3>${barChart(d, 'workoutCount', palette.workout, 'ครั้ง', 0, palette)}</div>
    </section>
    <section role="tabpanel" id="db-panel-finance" aria-labelledby="db-tab-finance" data-db-panel="finance" class="db-chart-panel space-y-4" ${activeSection!=='finance'?'hidden':''}>
      <div class="db-chart-card"><h3>${iconSvg('expense', { size: 16, className: 'text-rose-500 shrink-0' })}<span>ค่าใช้จ่ายรายเดือน (บาท)</span></h3>${barChart(d, 'expenseTotal', palette.expense, 'บาท', 0, palette)}</div>
      <details class="card space-y-3">
        <summary class="cursor-pointer list-none font-bold text-slate-800 text-sm flex items-center gap-2">${iconSvg('table', { size: 15, className: 'text-slate-600 shrink-0' })}<span>ตารางเปรียบเทียบรายเดือน <span class="ml-1 text-xs font-normal text-slate-500">แตะเพื่อดูรายละเอียด</span></span></summary>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-lav-soft/50">
            <tr>
              <th class="p-2">เดือน</th>
              <th class="p-2 text-right">น้ำหนัก</th>
              <th class="p-2 text-right">kcal/วัน</th>
              <th class="p-2 text-right">ออกกำลัง (ครั้ง)</th>
              <th class="p-2 text-right">ออกกำลัง (นาที)</th>
              <th class="p-2 text-right">รายจ่าย</th>
              <th class="p-2 text-right">รายรับ</th>
              <th class="p-2 text-right">สุทธิ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${d.map(r => `<tr class="hover:bg-slate-50">
              <td class="p-2 font-medium">${esc(r.label)}</td>
              <td class="p-2 text-right">${r.weight != null ? r.weight + ' กก.' : '-'}</td>
              <td class="p-2 text-right">${r.avgKcal != null ? r.avgKcal + ' kcal' : '-'}</td>
              <td class="p-2 text-right">${r.workoutCount || '-'}</td>
              <td class="p-2 text-right">${r.workoutMin || '-'}</td>
              <td class="p-2 text-right text-rose-600">${r.expenseTotal ? r.expenseTotal.toLocaleString() : '-'}</td>
              <td class="p-2 text-right text-emerald-700">${r.incomeTotal ? r.incomeTotal.toLocaleString() : '-'}</td>
              <td class="p-2 text-right font-semibold ${r.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${r.net !== 0 || r.expenseTotal || r.incomeTotal ? (r.net >= 0 ? '+' : '') + r.net.toLocaleString() : '-'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      </details>
    </section>`;
  $('#db-content', root).querySelectorAll('.db-chart-card').forEach(card => {
    bindChartInspector(card, { hint: 'แตะจุดหรือแท่งกราฟเพื่อดูข้อมูลรายเดือน' });
  });

  $('#ov-go-weekly', root).addEventListener('click', () => window.dispatchEvent(new CustomEvent('trackme:goto', { detail: { tab: 'weekly' } })));
  $('#ov-go-report', root).addEventListener('click', () => window.dispatchEvent(new CustomEvent('trackme:goto', { detail: { tab: 'report' } })));
  $('#ov-refresh', root).addEventListener('click', () => {
    void loadFoodForRange(true);
  });

  renderView();
}

export function renderOverview({ refreshFood = false } = {}) {
  if (!root || !state.uid) return;
  renderView();
  const panel = $('#tab-overview');
  const isVisible = panel && !panel.classList.contains('hidden');
  if (isVisible || refreshFood) {
    void loadFoodForRange(refreshFood);
  }
}

export function resetOverviewState() {
  cachedRangeKey = '';
  cachedFood = [];
  cachedUpdatedAt = 0;
  cachedFromStorage = false;
  lastFoodError = '';
  isLoading = false;
  seq++;
}
