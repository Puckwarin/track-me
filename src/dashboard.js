import { state } from './state.js';
import { getPreviewRecordsInRange, isPreviewMode } from './preview.js';
import { $, esc, localDateStr, toNum, round1 } from './util.js';
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

const OVERVIEW_THEME_COLORS = {
  'baby-blue': {
    weight: '#4A9AD6',
    weightLabel: '#276594',
    kcal: '#9E85D6',
    workout: '#E0924B',
    expense: '#4EA885',
    target: '#D9647A',
    emptyBar: '#DCEAF6',
    axis: '#64748b',
    dotStroke: '#FFFFFF'
  },
  pastel: {
    weight: '#8E9CE6',
    weightLabel: '#6B4C7A',
    kcal: '#C87FA8',
    workout: '#F2A37E',
    expense: '#6EC49B',
    target: '#D66D9B',
    emptyBar: '#F2E4F1',
    axis: '#7D6374',
    dotStroke: '#FFFFFF'
  },
  cozy: {
    weight: '#8B5E3C',
    weightLabel: '#6B4428',
    kcal: '#A67C52',
    workout: '#D4A553',
    expense: '#5D8A66',
    target: '#B85A4A',
    emptyBar: '#ECE0D1',
    axis: '#7C6858',
    dotStroke: '#FFFDF9'
  },
  dark: {
    weight: '#60B2EC',
    weightLabel: '#BAE2FF',
    kcal: '#B39DDB',
    workout: '#F6B26B',
    expense: '#6EE7B7',
    target: '#F48FB1',
    emptyBar: '#28364C',
    axis: '#98A9BE',
    dotStroke: '#182232'
  }
};

function getOverviewPalette() {
  const theme = typeof document !== 'undefined' ? document.documentElement?.dataset?.theme : 'baby-blue';
  return OVERVIEW_THEME_COLORS[theme] || OVERVIEW_THEME_COLORS['baby-blue'];
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

  let monthCount = 6;
  const setRange = n => {
    monthCount = n;
    [3, 6, 12].forEach(r => {
      const b = $('#db-range-' + r, root);
      b.setAttribute('aria-pressed', String(r === n));
    });
    if (dashboardData) render(monthCount);
  };
  $('#db-range-3', root).addEventListener('click', () => setRange(3));
  $('#db-range-6', root).addEventListener('click', () => setRange(6));
  $('#db-range-12', root).addEventListener('click', () => setRange(12));
  $('#db-refresh', root).addEventListener('click', () => loadAndRender(monthCount));
  $('#db-content', root).addEventListener('click', event => {
    const tab = event.target.closest('[data-db-section]');
    if (!tab) return;
    activeSection = tab.dataset.dbSection;
    $('#db-content', root).querySelectorAll('[data-db-section]').forEach(button => {
      const selected = button.dataset.dbSection === activeSection;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    $('#db-content', root).querySelectorAll('[data-db-panel]').forEach(panel => {
      panel.hidden = panel.dataset.dbPanel !== activeSection;
    });
  });

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="${esc(emptyText)}">${bars}${targetLine}</svg>`;
}

function renderWeightChart(months, palette = getOverviewPalette()) {
  const points = months
    .map((m, i) => (typeof m.weightAvg === 'number' ? { i, m, v: m.weightAvg } : null))
    .filter(Boolean);
  if (!points.length) {
    return '<p class="text-xs text-slate-500 py-8 text-center">ยังไม่มีบันทึกน้ำหนักในช่วงเวลานี้</p>';
  }

  const W = 440, H = 165, padX = 32, padTop = 20, padBottom = 26;
  const vals = points.map(p => p.v);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = Math.max(1, maxV - minV);
  const lo = minV - span * 0.2;
  const hi = maxV + span * 0.2;
  const stepX = months.length > 1 ? (W - padX * 2) / (months.length - 1) : 0;
  const xAt = idx => (months.length > 1 ? padX + idx * stepX : W / 2);
  const yAt = v => H - padBottom - ((v - lo) / (hi - lo)) * (H - padTop - padBottom);

  const polyline = points.length >= 2
    ? `<polyline fill="none" stroke="${palette.weight}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${points.map(p => `${xAt(p.i)},${yAt(p.v)}`).join(' ')}"/>`
    : '';

  const dots = points.map(p => {
    const tip = `${p.m.label}: เฉลี่ย ${p.v} กก.`;
    const sub = `ล่าสุด ${p.m.weightLatest} กก.`;
    return `<g>
      <circle cx="${xAt(p.i)}" cy="${yAt(p.v)}" r="4" fill="${palette.weight}" stroke="${palette.dotStroke}" stroke-width="1.5"></circle>
      <circle cx="${xAt(p.i)}" cy="${yAt(p.v)}" r="12" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(tip)}" data-chart-sub="${esc(sub)}" data-chart-color="${palette.weight}" aria-label="${esc(tip)}"><title>${esc(`${tip} (${sub})`)}</title></circle>
      <text x="${xAt(p.i)}" y="${Math.max(12, yAt(p.v) - 8)}" font-size="9" text-anchor="middle" fill="${palette.weightLabel}">${p.v}</text>
    </g>`;
  }).join('');

  const xLabels = months.map((m, i) => {
    const show = months.length <= 6 || i % 2 === 0 || i === months.length - 1;
    return show ? `<text x="${xAt(i)}" y="${H - 8}" font-size="9" text-anchor="middle" fill="${palette.axis}">${esc(m.label)}</text>` : '';
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="กราฟน้ำหนักเฉลี่ยรายเดือน">${polyline}${dots}${xLabels}</svg>`;
}

export function resetDashboardState() {
  dashboardData = null;
  activeSection = 'health';
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

  root.querySelectorAll('[data-ov-range]').forEach(btn => {
    const active = Number(btn.dataset.ovRange) === rangeMonths;
    btn.className = `chip whitespace-nowrap min-h-[38px] ${active ? 'bg-brand text-white' : 'bg-lav-soft text-brand-dark'}`;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const refreshBtn = $('#ov-refresh', root);
  if (refreshBtn) {
    refreshBtn.disabled = isLoading;
    refreshBtn.innerHTML = isLoading
      ? `${iconSvg('fa-spinner fa-spin', { size: 14 })} กำลังโหลด...`
      : `${iconSvg('rotate-right', { size: 14 })} รีเฟรช`;
  }

  const cacheInfoEl = $('#ov-cache-info', root);
  if (cacheInfoEl) {
    if (isLoading && !cachedUpdatedAt) {
      cacheInfoEl.textContent = '⏳ กำลังโหลดข้อมูลอาหารย้อนหลังจากเซิร์ฟเวอร์...';
      cacheInfoEl.classList.remove('hidden');
    } else if (cachedUpdatedAt) {
      cacheInfoEl.textContent = cachedFromStorage
        ? `แสดงผลจากแคชในเครื่อง (${fmtDateTime(cachedUpdatedAt)}) · กดรีเฟรชเพื่ออัปเดตจากเซิร์ฟเวอร์`
        : `อัปเดตล่าสุดจากเซิร์ฟเวอร์ (${fmtDateTime(cachedUpdatedAt)})`;
      cacheInfoEl.classList.remove('hidden');
    } else {
      cacheInfoEl.textContent = '';
      cacheInfoEl.classList.add('hidden');
    }
  }

  const noticeEl = $('#ov-notice', root);
  if (noticeEl) {
    noticeEl.textContent = lastFoodError;
    noticeEl.classList.toggle('hidden', !lastFoodError);
  }

  const kpi = (iconName, colorCls, label, value, sub) => `
    <div class="bg-lav-soft/40 border border-slate-100 rounded-2xl p-3">
      <p class="text-xs text-slate-600 inline-flex items-center gap-1.5">${iconSvg(iconName, { size: 14, className: colorCls })}<span>${label}</span></p>
      <p class="text-base sm:text-lg font-bold text-slate-800 mt-0.5 tabular-nums">${value}</p>
      <p class="text-[11px] text-slate-500 mt-0.5 tabular-nums">${sub}</p>
    </div>`;

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
  const labels = data.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" font-size="9.5" fill="#94a3b8" text-anchor="middle">${esc(d.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>
    ${dots}
    <text x="4" y="${y(max) + 4}" font-size="9.5" fill="#64748b">${esc(fmtV(max))}</text>
    <text x="4" y="${y(min) + 4}" font-size="9.5" fill="#64748b">${esc(fmtV(min))}</text>
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
      ${v > 0 ? `<rect x="${bx}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${color}" opacity="0.85"></rect>` : ''}
      <rect x="${bx}" y="12" width="${Math.max(bw, 16).toFixed(1)}" height="${H - P - 12}" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(d.label)}: ${v > 0 ? esc(valStr) : 'ไม่มีข้อมูล'}" data-chart-color="${v > 0 ? color : '#94a3b8'}" aria-label="${esc(d.label)} ${esc(valStr)}"><title>${esc(d.label)}: ${esc(valStr)}</title></rect>
    </g>`;
  }).join('');
  const labels = data.map((d, i) => `<text x="${(x(i) + bw / 2).toFixed(1)}" y="${H - 6}" font-size="9.5" fill="#94a3b8" text-anchor="middle">${esc(d.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">
    ${bars}
    <text x="4" y="${y(max) + 4}" font-size="9.5" fill="#64748b">${esc(fmtV(max))}</text>
    <text x="4" y="${y(0)}" font-size="9.5" fill="#94a3b8">0</text>
    ${labels}
  </svg>`;
}

function statCard(label, value, sub, colorClass) {
  return `<article class="db-stat">
    <p class="db-stat-label">${esc(label)}</p>
    <p class="db-stat-value ${colorClass}">${esc(value)}</p>
    ${sub ? `<p class="db-stat-note">${esc(sub)}</p>` : ''}
  </article>`;
}

function render(monthCount) {
  if (!root || !dashboardData) return;
  const d = dashboardData;
  const latest = d[d.length - 1];
  const first = d[0];

  const weightTrend = (latest?.weight != null && first?.weight != null) ? round1(latest.weight - first.weight) : null;
  const weightStr = weightTrend != null
    ? (weightTrend > 0 ? `+${weightTrend} กก.` : `${weightTrend} กก.`)
    : '-';
  const weightClass = weightTrend != null ? (weightTrend > 0 ? 'text-rose-600' : 'text-emerald-700') : 'text-slate-400';

  const totalWorkout = d.reduce((a, r) => a + r.workoutCount, 0);
  const totalExpense = d.reduce((a, r) => a + r.expenseTotal, 0);
  const totalIncome = d.reduce((a, r) => a + r.incomeTotal, 0);

  $('#db-content', root).innerHTML = `
    <section class="db-metrics" aria-label="สรุปตัวเลขสำคัญ">
      ${statCard('น้ำหนักล่าสุด', latest?.weight != null ? latest.weight + ' กก.' : '-', weightTrend != null ? `เปลี่ยน ${weightStr}` : 'จาก ' + d.length + ' เดือน', weightClass)}
      ${statCard('แคลอรี่เฉลี่ย/วัน', latest?.avgKcal != null ? latest.avgKcal + ' kcal' : '-', latest?.avgKcal != null ? 'เดือนล่าสุด' : '-', 'text-amber-600')}
      ${statCard('ออกกำลังกาย', totalWorkout + ' ครั้ง', `รวม ${d.reduce((a, r) => a + r.workoutMin, 0)} นาที · ${d.length} เดือน`, 'text-brand-dark')}
      ${statCard('ค่าใช้จ่ายสุทธิ', totalIncome - totalExpense >= 0 ? '+' + (totalIncome - totalExpense).toLocaleString() : (totalIncome - totalExpense).toLocaleString(), `รายรับ ${totalIncome.toLocaleString()} · จ่าย ${totalExpense.toLocaleString()} · ${d.length} เดือน`, totalIncome - totalExpense >= 0 ? 'text-emerald-700' : 'text-rose-600')}
    </section>

    <div role="tablist" aria-label="หมวดสรุปภาพรวม" class="tm-seg tm-seg--4">
      ${[['health','สุขภาพ'],['nutrition','โภชนาการ'],['activity','กิจกรรม'],['finance','การเงิน']].map(([key,label]) => `<button type="button" role="tab" id="db-tab-${key}" class="tm-seg-btn ${activeSection===key?'is-active':''}" aria-controls="db-panel-${key}" aria-selected="${activeSection===key}" data-db-section="${key}">${label}</button>`).join('')}
    </div>
    <div class="card space-y-2">
      <h3 class="font-bold text-slate-800 text-sm inline-flex items-center gap-1.5">${iconSvg('expense', { size: 15, className: 'text-emerald-600' })}<span>ค่าใช้จ่ายรายเดือน (บาท)</span></h3>
      ${renderBarChart(months, 'expenseTotal', {
        color: palette.expense,
        emptyText: 'ยังไม่มีรายการรายจ่ายในช่วงเวลานี้',
        formatTooltip: (m, v) => `${m.label}: จ่าย ฿${fmtMoney(v)} · รับ ฿${fmtMoney(m.incomeTotal)}`,
        palette
      })}
      <p class="text-[11px] text-slate-500">รวมรายการรายจ่ายจริงรายเดือน (ไม่รวมรายรับ)</p>
    </div>`;

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

    <section role="tabpanel" id="db-panel-health" aria-labelledby="db-tab-health" data-db-panel="health" class="db-chart-panel" ${activeSection!=='health'?'hidden':''}>
      <div class="db-chart-card"><h3>${iconSvg('body', { size: 16, className: 'text-brand shrink-0' })}<span>น้ำหนัก (กก.)</span></h3>${lineChart(d, 'weight', '#6366f1', 'กก.', 1)}</div>
    </section>
    <section role="tabpanel" id="db-panel-nutrition" aria-labelledby="db-tab-nutrition" data-db-panel="nutrition" class="db-chart-panel" ${activeSection!=='nutrition'?'hidden':''}>
      <div class="db-chart-card"><h3>${iconSvg('flame', { size: 16, className: 'text-orange-500 shrink-0' })}<span>แคลอรี่เฉลี่ย/วัน (kcal)</span></h3>${lineChart(d, 'avgKcal', '#f97316', 'kcal', 0)}</div>
    </section>
    <section role="tabpanel" id="db-panel-activity" aria-labelledby="db-tab-activity" data-db-panel="activity" class="db-chart-panel" ${activeSection!=='activity'?'hidden':''}>
      <div class="db-chart-card"><h3>${iconSvg('workout', { size: 16, className: 'text-emerald-600 shrink-0' })}<span>จำนวนครั้งออกกำลังกาย</span></h3>${barChart(d, 'workoutCount', '#10b981', 'ครั้ง', 0)}</div>
    </section>
    <section role="tabpanel" id="db-panel-finance" aria-labelledby="db-tab-finance" data-db-panel="finance" class="db-chart-panel space-y-4" ${activeSection!=='finance'?'hidden':''}>
      <div class="db-chart-card"><h3>${iconSvg('expense', { size: 16, className: 'text-rose-500 shrink-0' })}<span>ค่าใช้จ่ายรายเดือน (บาท)</span></h3>${barChart(d, 'expenseTotal', '#f43f5e', 'บาท', 0)}</div>
      <details class="card space-y-3">
        <summary class="cursor-pointer list-none font-bold text-slate-800 text-sm flex items-center gap-2">${iconSvg('table', { size: 15, className: 'text-slate-600 shrink-0' })}<span>ตารางเปรียบเทียบรายเดือน <span class="ml-1 text-xs font-normal text-slate-500">แตะเพื่อดูรายละเอียด</span></span></summary>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs sm:text-sm">
          <thead class="bg-lav-soft/50 text-slate-600">
            <tr>
              <th class="p-2.5">เดือน</th>
              <th class="p-2.5 text-right">น้ำหนักล่าสุด</th>
              <th class="p-2.5 text-right">แคลอรี่เฉลี่ย/วัน</th>
              <th class="p-2.5 text-right">ออกกำลังกาย</th>
              <th class="p-2.5 text-right">ค่าใช้จ่าย</th>
            </tr>
          </thead>
          <tbody id="ov-table-body" class="divide-y divide-slate-100"></tbody>
        </table>
      </div>
      </details>
    </section>`;
  $('#db-content', root).querySelectorAll('.db-chart-card').forEach(card => {
    bindChartInspector(card, { hint: 'แตะจุดหรือแท่งกราฟเพื่อดูข้อมูลรายเดือน' });
  });
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