import { getDocs, query, where } from 'firebase/firestore';
import { userCol } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, addDays, toNum, round1, toast } from './util.js';
import { TYPES } from './workoutConstants.js';

let root, dashboardData = null, loading = false, activeSection = 'health';

function localMonthStr(s) {
  const d = new Date(s + '-01');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  <div class="space-y-5">
    <div class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-chart-line text-brand"></i> แดชบอร์ดภาพรวม</h2>
        <div class="flex items-center gap-1.5">
          <button type="button" id="db-range-3" class="chip text-xs bg-slate-100 text-slate-600">3 เดือน</button>
          <button type="button" id="db-range-6" class="chip text-xs bg-brand text-white font-semibold">6 เดือน</button>
          <button type="button" id="db-range-12" class="chip text-xs bg-slate-100 text-slate-600">12 เดือน</button>
        </div>
      </div>
      <p class="text-xs text-slate-500">สรุปตัวเลขสำคัญ แล้วเลือกดูแนวโน้มเฉพาะหมวดที่ต้องการ</p>
      <button type="button" id="db-refresh" class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-rotate-right"></i> รีเฟรชข้อมูล</button>
    </div>
    <div id="db-content" class="space-y-5"><p class="text-sm text-slate-400">กด "รีเฟรชข้อมูล" เพื่อโหลด</p></div>
  </div>`;

  let monthCount = 6;
  const setRange = n => {
    monthCount = n;
    [3, 6, 12].forEach(r => {
      const b = $('#db-range-' + r, root);
      b.className = 'chip text-xs ' + (r === n ? 'bg-brand text-white font-semibold' : 'bg-slate-100 text-slate-600');
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
      button.setAttribute('aria-selected', String(selected));
      button.className = `whitespace-nowrap rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition ${selected ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`;
    });
    $('#db-content', root).querySelectorAll('[data-db-panel]').forEach(panel => {
      panel.hidden = panel.dataset.dbPanel !== activeSection;
    });
  });

  loadAndRender(monthCount);
}

export function resetDashboardToToday() {
  if (root) loadAndRender(6);
}

async function loadAndRender(monthCount) {
  if (loading) return;
  loading = true;
  const btn = $('#db-refresh', root);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลด…'; }
  $('#db-content', root).innerHTML = '<p class="text-sm text-slate-400">กำลังรวบรวมข้อมูล…</p>';
  try {
    dashboardData = await loadData(monthCount);
    render(monthCount);
  } catch (e) {
    $('#db-content', root).innerHTML = `<p class="text-sm text-rose-600">โหลดข้อมูลไม่สำเร็จ: ${esc(e.message)}</p>`;
  } finally {
    loading = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> รีเฟรชข้อมูล'; }
  }
}

async function loadData(monthCount) {
  const months = monthRange(monthCount);
  const from = months[0] + '-01';
  const to = localDateStr();

  const rangeQuery = name => getDocs(query(userCol(state.uid, name), where('date', '>=', from), where('date', '<=', to)))
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
  const line = idxMap.map((dataIdx, j) => {
    const val = data[dataIdx][valueKey];
    return `${x(dataIdx).toFixed(1)},${y(val).toFixed(1)}`;
  }).join(' ');
  const dots = idxMap.map(dataIdx => {
    const d = data[dataIdx];
    return `<circle cx="${x(dataIdx).toFixed(1)}" cy="${y(d[valueKey]).toFixed(1)}" r="3.5" fill="${color}"><title>${esc(d.label)}: ${fmtV(d[valueKey])} ${esc(unit)}</title></circle>`;
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
    if (v <= 0) return '';
    const bh = H - P - y(v);
    return `<rect x="${x(i).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${color}" opacity="0.85"><title>${esc(d.label)}: ${fmtV(v)} ${esc(unit)}</title></rect>`;
  }).join('');
  const labels = data.map((d, i) => `<text x="${(x(i) + bw / 2).toFixed(1)}" y="${H - 6}" font-size="9.5" fill="#94a3b8" text-anchor="middle">${esc(d.label)}</text>`).join('');
  const topVal = data.reduce((a, d) => Math.max(a, d[valueKey] || 0), 0);
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">
    ${bars}
    <text x="4" y="${y(max) + 4}" font-size="9.5" fill="#64748b">${esc(fmtV(max))}</text>
    <text x="4" y="${y(0)}" font-size="9.5" fill="#94a3b8">0</text>
    ${labels}
  </svg>`;
}

function statCard(label, value, sub, colorClass) {
  return `<div class="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
    <p class="text-xs text-slate-500">${esc(label)}</p>
    <p class="text-xl font-bold ${colorClass}">${esc(value)}</p>
    ${sub ? `<p class="text-[11px] text-slate-400">${esc(sub)}</p>` : ''}
  </div>`;
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
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      ${statCard('น้ำหนักล่าสุด', latest?.weight != null ? latest.weight + ' กก.' : '-', weightTrend != null ? `เปลี่ยน ${weightStr}` : 'จาก ' + d.length + ' เดือน', weightClass)}
      ${statCard('แคลอรี่เฉลี่ย/วัน', latest?.avgKcal != null ? latest.avgKcal + ' kcal' : '-', latest?.avgKcal != null ? 'เดือนล่าสุด' : '-', 'text-amber-600')}
      ${statCard('ออกกำลังกาย', totalWorkout + ' ครั้ง', `รวม ${d.reduce((a, r) => a + r.workoutMin, 0)} นาที · ${d.length} เดือน`, 'text-brand-dark')}
      ${statCard('ค่าใช้จ่ายสุทธิ', totalIncome - totalExpense >= 0 ? '+' + (totalIncome - totalExpense).toLocaleString() : (totalIncome - totalExpense).toLocaleString(), `รายรับ ${totalIncome.toLocaleString()} · จ่าย ${totalExpense.toLocaleString()} · ${d.length} เดือน`, totalIncome - totalExpense >= 0 ? 'text-emerald-700' : 'text-rose-600')}
    </div>

    <div role="tablist" aria-label="หมวดสรุปภาพรวม" class="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5">
      ${[['health','สุขภาพ'],['nutrition','โภชนาการ'],['activity','กิจกรรม'],['finance','การเงิน']].map(([key,label]) => `<button type="button" role="tab" id="db-tab-${key}" aria-controls="db-panel-${key}" aria-selected="${activeSection===key}" data-db-section="${key}" class="whitespace-nowrap rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition ${activeSection===key?'bg-brand text-white shadow-sm':'text-slate-600 hover:bg-slate-100'}">${label}</button>`).join('')}
    </div>

    <section role="tabpanel" id="db-panel-health" aria-labelledby="db-tab-health" data-db-panel="health" class="grid grid-cols-1 md:grid-cols-2 gap-4" ${activeSection!=='health'?'hidden':''}>
      <div class="card space-y-2"><h3 class="font-bold text-slate-800 text-sm"><i class="fa-solid fa-weight-scale text-brand"></i> น้ำหนัก (กก.)</h3>${lineChart(d, 'weight', '#6366f1', 'กก.', 1)}</div>
    </section>
    <section role="tabpanel" id="db-panel-nutrition" aria-labelledby="db-tab-nutrition" data-db-panel="nutrition" class="grid grid-cols-1 md:grid-cols-2 gap-4" ${activeSection!=='nutrition'?'hidden':''}>
      <div class="card space-y-2"><h3 class="font-bold text-slate-800 text-sm"><i class="fa-solid fa-fire text-orange-500"></i> แคลอรี่เฉลี่ย/วัน (kcal)</h3>${lineChart(d, 'avgKcal', '#f97316', 'kcal', 0)}</div>
    </section>
    <section role="tabpanel" id="db-panel-activity" aria-labelledby="db-tab-activity" data-db-panel="activity" class="grid grid-cols-1 md:grid-cols-2 gap-4" ${activeSection!=='activity'?'hidden':''}>
      <div class="card space-y-2"><h3 class="font-bold text-slate-800 text-sm"><i class="fa-solid fa-dumbbell text-emerald-600"></i> จำนวนครั้งออกกำลังกาย</h3>${barChart(d, 'workoutCount', '#10b981', 'ครั้ง', 0)}</div>
    </section>
    <section role="tabpanel" id="db-panel-finance" aria-labelledby="db-tab-finance" data-db-panel="finance" class="space-y-4" ${activeSection!=='finance'?'hidden':''}>
      <div class="card space-y-2"><h3 class="font-bold text-slate-800 text-sm"><i class="fa-solid fa-wallet text-rose-500"></i> ค่าใช้จ่ายรายเดือน (บาท)</h3>${barChart(d, 'expenseTotal', '#f43f5e', 'บาท', 0)}</div>
      <details class="card space-y-3">
        <summary class="cursor-pointer list-none font-bold text-slate-800 text-sm"><i class="fa-solid fa-table text-slate-600"></i> ตารางเปรียบเทียบรายเดือน <span class="ml-1 text-xs font-normal text-slate-500">แตะเพื่อดูรายละเอียด</span></summary>
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
}
