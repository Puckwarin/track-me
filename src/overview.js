import { getDocs, query, where } from 'firebase/firestore';
import { userCol } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDateTime, localDateStr, monthEndDate, toast } from './util.js';
import { getTargets } from './profile.js';
import {
  aggregateMonthlyOverview, buildMonthKeys, compactFoodForOverview, readOverviewCache, writeOverviewCache
} from './overviewLogic.js';
import { iconSvg } from './icons.js';

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
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${v > 0 ? color : '#e2e8f0'}">
        <title>${esc(formatTooltip(m, v))}</title>
      </rect>
      ${showLabel ? `<text x="${x + barW / 2}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#64748b">${esc(m.label)}</text>` : ''}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="${esc(emptyText)}">${bars}${targetLine}</svg>`;
}

function renderWeightChart(months) {
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
    ? `<polyline fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${points.map(p => `${xAt(p.i)},${yAt(p.v)}`).join(' ')}"/>`
    : '';

  const dots = points.map(p => `
    <circle cx="${xAt(p.i)}" cy="${yAt(p.v)}" r="4" fill="#3b82f6" stroke="#ffffff" stroke-width="1.5">
      <title>${esc(`${p.m.label}: เฉลี่ย ${p.v} กก. (ล่าสุด ${p.m.weightLatest} กก.)`)}</title>
    </circle>
    <text x="${xAt(p.i)}" y="${Math.max(12, yAt(p.v) - 8)}" font-size="9" text-anchor="middle" fill="#1e40af">${p.v}</text>`).join('');

  const xLabels = months.map((m, i) => {
    const show = months.length <= 6 || i % 2 === 0 || i === months.length - 1;
    return show ? `<text x="${xAt(i)}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#64748b">${esc(m.label)}</text>` : '';
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="กราฟน้ำหนักเฉลี่ยรายเดือน">${polyline}${dots}${xLabels}</svg>`;
}

async function loadFoodForRange(forceRefresh = false) {
  if (!state.uid) return;
  const today = localDateStr();
  const keys = buildMonthKeys(rangeMonths, today);
  const start = `${keys[0]}-01`;
  const end = monthEndDate(keys[keys.length - 1]);
  const key = `${state.uid}:${start}:${end}`;
  if (!forceRefresh && cachedRangeKey === key && !lastFoodError) return;

  const storageHit = readOverviewCache(state.uid, rangeMonths, { today });
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

  const mySeq = ++seq;
  isLoading = true;
  lastFoodError = '';
  renderView();

  try {
    const snap = await getDocs(query(
      userCol(state.uid, 'food_records'),
      where('date', '>=', start),
      where('date', '<=', end)
    ));
    if (mySeq !== seq) return;
    const foodRows = compactFoodForOverview(snap.docs.map(d => d.data()));
    cachedFood = foodRows;
    cachedRangeKey = key;
    cachedUpdatedAt = Date.now();
    cachedFromStorage = false;
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
    if (mySeq === seq) {
      isLoading = false;
      renderView();
    }
  }
}

function renderView() {
  if (!root) return;
  const targets = getTargets();
  const data = aggregateMonthlyOverview({
    monthsCount: rangeMonths,
    today: localDateStr(),
    food: cachedFood,
    workouts: state.workouts || [],
    body: state.body || [],
    expenses: state.expenses || []
  });
  const { months, summary } = data;

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

  const weightSub = summary.weightChange === null
    ? 'ต้องมีบันทึกอย่างน้อย 2 เดือน'
    : `เทียบต้นช่วง ${summary.weightChange > 0 ? '+' : ''}${summary.weightChange} กก.`;

  const foodKpiValue = isLoading && !cachedUpdatedAt
    ? 'กำลังโหลด...'
    : (summary.avgCalPerDay !== null ? `${summary.avgCalPerDay.toLocaleString()} kcal` : 'ยังไม่มีข้อมูล');

  $('#ov-kpis', root).innerHTML = `
    ${kpi('body', 'text-blue-500', 'น้ำหนักล่าสุด', summary.latestWeight !== null ? `${summary.latestWeight} กก.` : 'ยังไม่มีข้อมูล', weightSub)}
    ${kpi('flame', 'text-brand', 'แคลอรี่เฉลี่ย/วันที่บันทึก', foodKpiValue, summary.totalLoggedDays ? `บันทึกแล้ว ${summary.totalLoggedDays} วัน · เป้า ${targets.kcal.toLocaleString()}` : (isLoading ? 'กำลังดึงรายการอาหาร...' : 'ยังไม่มีบันทึกอาหารในช่วงนี้'))}
    ${kpi('workout', 'text-amber-600', 'ออกกำลังกายรวม', summary.totalWorkouts ? `${summary.totalWorkouts} ครั้ง` : 'ยังไม่มีบันทึก', summary.totalWorkoutMinutes ? `รวม ${summary.totalWorkoutMinutes.toLocaleString()} นาที` : 'ยังไม่มีบันทึกในช่วงเดือนนี้')}
    ${kpi('expense', 'text-emerald-600', 'ค่าใช้จ่ายรวม', (summary.totalExpense || summary.totalIncome) ? `฿${fmtMoney(summary.totalExpense)}` : 'ยังไม่มีรายการ', summary.totalIncome ? `รายรับรวม ฿${fmtMoney(summary.totalIncome)}` : 'ยังไม่มีรายการรายรับ-รายจ่าย')}`;

  $('#ov-charts', root).innerHTML = `
    <div class="card space-y-2">
      <h3 class="font-bold text-slate-800 text-sm inline-flex items-center gap-1.5">${iconSvg('body', { size: 15, className: 'text-blue-500' })}<span>น้ำหนักเฉลี่ยรายเดือน (กก.)</span></h3>
      ${renderWeightChart(months)}
      <p class="text-[11px] text-slate-500">จุดบนเส้นแสดงค่าเฉลี่ยของแต่ละเดือน (แตะจุดเพื่อดูน้ำหนักล่าสุดของเดือน)</p>
    </div>
    <div class="card space-y-2">
      <h3 class="font-bold text-slate-800 text-sm inline-flex items-center gap-1.5">${iconSvg('food', { size: 15, className: 'text-brand' })}<span>แคลอรี่เฉลี่ยต่อวันที่บันทึก (kcal/วัน)</span></h3>
      ${isLoading && !cachedUpdatedAt
        ? `<p class="text-xs text-slate-500 py-8 text-center inline-flex items-center justify-center gap-1.5 w-full">${iconSvg('fa-spinner fa-spin', { size: 14 })}<span>กำลังโหลดข้อมูลแคลอรี่...</span></p>`
        : renderBarChart(months, 'calAvgPerLoggedDay', {
          color: '#a78bfa',
          emptyText: 'ยังไม่มีบันทึกอาหารในช่วงเวลานี้',
          targetValue: targets.kcal,
          targetLabel: `เป้า ${targets.kcal.toLocaleString()} kcal`,
          formatTooltip: (m, v) => `${m.label}: เฉลี่ย ${Math.round(v).toLocaleString()} kcal/วัน (${m.foodDays} วัน)`
        })}
      <p class="text-[11px] text-slate-500">คำนวณเฉพาะวันที่มีบันทึกอาหารในแต่ละเดือน</p>
    </div>
    <div class="card space-y-2">
      <h3 class="font-bold text-slate-800 text-sm inline-flex items-center gap-1.5">${iconSvg('workout', { size: 15, className: 'text-amber-600' })}<span>การออกกำลังกายรายเดือน (ครั้ง)</span></h3>
      ${renderBarChart(months, 'workoutCount', {
        color: '#f59e0b',
        emptyText: 'ยังไม่มีบันทึกออกกำลังกายในช่วงเวลานี้',
        formatTooltip: (m, v) => `${m.label}: ${v} ครั้ง${m.workoutMinutes ? ` (${m.workoutMinutes} นาที)` : ''}`
      })}
      <p class="text-[11px] text-slate-500">นับเฉพาะครั้งที่ทำจริง (ไม่รวมรายการที่สถานะเป็นแผนล่วงหน้า)</p>
    </div>
    <div class="card space-y-2">
      <h3 class="font-bold text-slate-800 text-sm inline-flex items-center gap-1.5">${iconSvg('expense', { size: 15, className: 'text-emerald-600' })}<span>ค่าใช้จ่ายรายเดือน (บาท)</span></h3>
      ${renderBarChart(months, 'expenseTotal', {
        color: '#10b981',
        emptyText: 'ยังไม่มีรายการรายจ่ายในช่วงเวลานี้',
        formatTooltip: (m, v) => `${m.label}: จ่าย ฿${fmtMoney(v)} · รับ ฿${fmtMoney(m.incomeTotal)}`
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
    <div id="ov-charts" class="grid grid-cols-1 lg:grid-cols-2 gap-6"></div>
    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800 text-sm inline-flex items-center gap-1.5">${iconSvg('table', { size: 15, className: 'text-brand' })}<span>ตารางเปรียบเทียบรายเดือน</span></h3>
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
      <p class="text-[11px] text-slate-500">หมายเหตุ: ประวัติออกกำลังกายซิงค์ย้อนหลังประมาณ 400 วัน (~13 เดือน)</p>
    </div>
  </div>`;

  root.querySelectorAll('[data-ov-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = Number(btn.dataset.ovRange);
      if (![3, 6, 12].includes(next) || next === rangeMonths) return;
      rangeMonths = next;
      void loadFoodForRange(false);
    });
  });

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
