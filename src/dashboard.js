import { getDocs, query, where } from 'firebase/firestore';
import { userCol } from './firebase.js';
import { state } from './state.js';
import { getPreviewRecordsInRange, isPreviewMode } from './preview.js';
import { $, esc, localDateStr, toNum, round1 } from './util.js';
import { iconSvg } from './icons.js';
import { bindChartInspector } from './ui.js';
import { computeWorkoutTotalMinutes, effortLevelToSessionRpe, formatIntensityBreakdown } from './workoutConstants.js';

let root, dashboardData = null, loading = false;

function cssToken(name, fallback) {
  if (typeof getComputedStyle !== 'function' || !document?.documentElement) return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
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
  <div class="db-page lg:col-span-3">
    <header class="db-header">
      <div class="db-heading">
        <div class="db-eyebrow">TRACK ME · HISTORY &amp; REPORTS</div>
        <h2>ประวัติ &amp; รายงาน</h2>
        <p>รวมสรุปรายสัปดาห์/รายเดือน และแนวโน้มระยะยาวครบทุกหมวด พร้อมส่งออกรายงานในที่เดียว</p>
      </div>
      <div class="db-controls">
        <div class="tm-seg tm-seg--2" role="tablist" aria-label="สลับมุมมองประวัติและรายงาน">
          <button type="button" role="tab" id="db-view-overview" data-page-go="overview" aria-pressed="true" aria-selected="true" class="tm-seg-btn is-active">ภาพรวม &amp; สรุป</button>
          <button type="button" role="tab" id="db-view-report" data-page-go="report" aria-pressed="false" aria-selected="false" class="tm-seg-btn">${iconSvg('report', { size: 14 })}<span>รายงาน (PDF / CSV)</span></button>
        </div>
        <button type="button" id="db-refresh" class="db-refresh">${iconSvg('rotate-right', { size: 14 })}<span>รีเฟรช</span></button>
      </div>
    </header>

    <div id="db-weekly" class="space-y-5" aria-live="polite"></div>

    <section class="space-y-4" aria-labelledby="db-longterm-title">
      <div class="card !py-3.5 !px-4 sm:!px-5 flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h3 id="db-longterm-title" class="font-bold text-slate-800 inline-flex items-center gap-1.5 text-base">${iconSvg('overview', { size: 18, className: 'text-brand' })}<span>แนวโน้มระยะยาวรายเดือน</span></h3>
          <p class="text-xs text-slate-500 mt-0.5">เปรียบเทียบพัฒนาการข้ามเดือนด้านน้ำหนัก พลังงาน การออกกำลังกาย และการเงิน</p>
        </div>
        <div class="db-range tm-seg tm-seg--3 shrink-0" role="group" aria-label="ช่วงเวลาแนวโน้มระยะยาว">
          <button type="button" id="db-range-3" class="tm-seg-btn" aria-pressed="false">3 เดือน</button>
          <button type="button" id="db-range-6" class="tm-seg-btn" aria-pressed="true">6 เดือน</button>
          <button type="button" id="db-range-12" class="tm-seg-btn" aria-pressed="false">12 เดือน</button>
        </div>
      </div>
      <div id="db-content" class="db-content" aria-live="polite"><p class="db-loading">กำลังรวบรวมข้อมูล…</p></div>
    </section>
  </div>`;

  let monthCount = 6;
  const setRange = n => {
    monthCount = n;
    [3, 6, 12].forEach(r => {
      const b = $('#db-range-' + r, root);
      b?.setAttribute('aria-pressed', String(r === n));
    });
    loadAndRender(monthCount);
  };
  $('#db-range-3', root).addEventListener('click', () => setRange(3));
  $('#db-range-6', root).addEventListener('click', () => setRange(6));
  $('#db-range-12', root).addEventListener('click', () => setRange(12));
  $('#db-refresh', root).addEventListener('click', () => {
    void loadAndRender(monthCount);
    window.dispatchEvent(new Event('trackme:overview-refresh'));
  });

  window.addEventListener('trackme:theme', () => {
    if (root?.isConnected && dashboardData) render(monthCount);
  });

  loadAndRender(monthCount);
}

export function resetDashboardToToday() {
  if (root) loadAndRender(6);
}

export function resetDashboardState() {
  dashboardData = null;
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
    dashboardData = await loadData(monthCount);
    render(monthCount);
  } catch (e) {
    $('#db-content', root).innerHTML = `<p class="text-sm text-rose-600">โหลดข้อมูลไม่สำเร็จ: ${esc(e.message)}</p>`;
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
  for (const ms of months) byMonth[ms] = { weight: [], kcal: 0, kcalDays: 0, workoutCount: 0, workoutMin: 0, workoutRpe: [], workoutIntensity: { light: 0, moderate: 0, vigorous: 0 }, expenseTotal: 0, incomeTotal: 0 };

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
    byMonth[ms].workoutMin += computeWorkoutTotalMinutes(w);
    if (w.intensity && Object.hasOwn(byMonth[ms].workoutIntensity, w.intensity)) {
      byMonth[ms].workoutIntensity[w.intensity] += 1;
    }
    const rpe = w.sessionRpe != null ? Number(w.sessionRpe) : effortLevelToSessionRpe(w.effortLevel);
    if (Number.isFinite(rpe) && rpe >= 1 && rpe <= 10) byMonth[ms].workoutRpe.push(rpe);
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
    const workoutAvgRpe = d.workoutRpe.length
      ? round1(d.workoutRpe.reduce((a, b) => a + b, 0) / d.workoutRpe.length)
      : null;
    return {
      month: ms,
      label: monthLabel(ms),
      weight: lastWeight,
      avgWeight: avgWeight ? round1(avgWeight) : null,
      avgKcal: d.kcalDays ? Math.round(d.kcal / d.kcalDays) : null,
      workoutCount: d.workoutCount,
      workoutMin: Math.round(d.workoutMin),
      workoutRpeSum: d.workoutRpe.reduce((a, b) => a + b, 0),
      workoutRpeCount: d.workoutRpe.length,
      workoutAvgRpe,
      workoutIntensity: d.workoutIntensity,
      workoutIntensityText: formatIntensityBreakdown(d.workoutIntensity),
      expenseTotal: Math.round(d.expenseTotal),
      incomeTotal: Math.round(d.incomeTotal),
      net: Math.round(d.incomeTotal - d.expenseTotal)
    };
  });
}

function lineChart(data, valueKey, color, unit, decimals = 0) {
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
      <circle cx="${cx}" cy="${cy}" r="11" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(d.label)}: ${esc(valStr)}" data-chart-color="${color}" aria-label="${esc(d.label)} ${esc(valStr)}"><title>${esc(d.label)}: ${esc(valStr)}</title></circle>
    </g>`;
  }).join('');
  const labels = data.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" font-size="9.5" fill="#647F9C" text-anchor="middle">${esc(d.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>
    ${dots}
    <text x="4" y="${y(max) + 4}" font-size="9.5" fill="#4A6685">${esc(fmtV(max))}</text>
    <text x="4" y="${y(min) + 4}" font-size="9.5" fill="#4A6685">${esc(fmtV(min))}</text>
    ${labels}
  </svg>`;
}

function barChart(data, valueKey, color, unit, decimals = 0) {
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
      <rect x="${bx}" y="12" width="${Math.max(bw, 16).toFixed(1)}" height="${H - P - 12}" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(d.label)}: ${v > 0 ? esc(valStr) : 'ไม่มีข้อมูล'}" data-chart-color="${v > 0 ? color : '#647F9C'}" aria-label="${esc(d.label)} ${esc(valStr)}"><title>${esc(d.label)}: ${esc(valStr)}</title></rect>
    </g>`;
  }).join('');
  const labels = data.map((d, i) => `<text x="${(x(i) + bw / 2).toFixed(1)}" y="${H - 6}" font-size="9.5" fill="#647F9C" text-anchor="middle">${esc(d.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">
    ${bars}
    <text x="4" y="${y(max) + 4}" font-size="9.5" fill="#4A6685">${esc(fmtV(max))}</text>
    <text x="4" y="${y(0)}" font-size="9.5" fill="#647F9C">0</text>
    ${labels}
  </svg>`;
}

function render(monthCount) {
  if (!root || !dashboardData) return;
  const d = dashboardData;
  const weightPts = d.filter(r => r.weight != null);
  const firstW = weightPts[0]?.weight ?? null;
  const lastW = weightPts[weightPts.length - 1]?.weight ?? null;
  const weightTrend = (lastW != null && firstW != null && weightPts.length >= 2) ? round1(lastW - firstW) : null;
  const weightMeta = lastW != null
    ? `${lastW} กก.${weightTrend != null ? ` (${weightTrend > 0 ? '+' : ''}${weightTrend} กก.)` : ''}`
    : '';

  const kcalPts = d.filter(r => r.avgKcal != null);
  const avgKcalOverall = kcalPts.length
    ? Math.round(kcalPts.reduce((s, r) => s + r.avgKcal, 0) / kcalPts.length)
    : null;
  const kcalMeta = avgKcalOverall != null ? `เฉลี่ย ${avgKcalOverall.toLocaleString()} kcal/วัน` : '';

  const totalWorkout = d.reduce((a, r) => a + r.workoutCount, 0);
  const totalWorkoutMin = d.reduce((a, r) => a + r.workoutMin, 0);
  const overallIntensityTotals = { light: 0, moderate: 0, vigorous: 0 };
  let overallRpeSum = 0, overallRpeCount = 0;
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

  const totalExpense = d.reduce((a, r) => a + r.expenseTotal, 0);
  const totalIncome = d.reduce((a, r) => a + r.incomeTotal, 0);
  const net = totalIncome - totalExpense;
  const financeMeta = (totalExpense || totalIncome)
    ? `จ่าย ${totalExpense.toLocaleString()} · สุทธิ ${net >= 0 ? '+' : ''}${net.toLocaleString()} บ.`
    : '';

  const brandColor = cssToken('--color-brand', '#1F4A74');
  const expenseColor = cssToken('--color-error', '#C95B72');

  const chartHead = (iconName, iconClass, title, meta) => `
    <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <h4 class="flex items-center gap-2 font-bold text-sm text-slate-800 m-0">${iconSvg(iconName, { size: 16, className: iconClass })}<span>${esc(title)}</span></h4>
      ${meta ? `<span class="text-xs font-medium text-slate-500 tabular-nums">${esc(meta)}</span>` : ''}
    </div>`;

  $('#db-content', root).innerHTML = `
    <div class="db-charts-grid" aria-label="กราฟแนวโน้ม ${monthCount} เดือน">
      <article class="db-chart-card">${chartHead('body', 'text-brand shrink-0', 'น้ำหนัก (กก.)', weightMeta)}${lineChart(d, 'weight', brandColor, 'กก.', 1)}</article>
      <article class="db-chart-card">${chartHead('flame', 'text-brand shrink-0', 'แคลอรี่เฉลี่ย/วัน (kcal)', kcalMeta)}${lineChart(d, 'avgKcal', brandColor, 'kcal', 0)}</article>
      <article class="db-chart-card">${chartHead('workout', 'text-brand shrink-0', 'จำนวนครั้งออกกำลังกาย', workoutMeta)}${barChart(d, 'workoutCount', brandColor, 'ครั้ง', 0)}</article>
      <article class="db-chart-card">${chartHead('expense', 'text-rose-500 shrink-0', 'ค่าใช้จ่ายรายเดือน (บาท)', financeMeta)}${barChart(d, 'expenseTotal', expenseColor, 'บาท', 0)}</article>
    </div>

    <details class="card space-y-3" open>
      <summary class="cursor-pointer list-none font-bold text-slate-800 text-sm flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-2">${iconSvg('table', { size: 15, className: 'text-slate-600 shrink-0' })}<span>ตารางเปรียบเทียบรายเดือน (${monthCount} เดือน)</span></span>
        <span class="text-xs font-normal text-slate-500">แตะเพื่อย่อ/ขยาย</span>
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
              <td class="p-2 text-right">${r.avgKcal != null ? r.avgKcal + ' kcal' : '-'}</td>
              <td class="p-2 text-right">${r.workoutCount || '-'}</td>
              <td class="p-2 text-right">${r.workoutMin || '-'}</td>
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
