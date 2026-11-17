import { getDocs, query, where } from 'firebase/firestore';
import { userCol } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, addDays, daysBetween, round1, addMonthsLocal, mondayOf, shiftMonth, monthEndDate } from './util.js';
import { getTargets } from './profile.js';
import { TYPES } from './workoutConstants.js';
import { collectReminders, trackedSources } from './reminders.js';

let root, weekStart = mondayOf(localDateStr()), selectedMonth = localDateStr().slice(0, 7), summaryMode = 'weekly', seq = 0;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const fmtMoney = n => Math.round(n || 0).toLocaleString();

function renderLoadingSkeleton(message) {
  const body = $('#wk-body', root);
  if (!body) return;
  body.innerHTML = `
    <div class="card lg:col-span-3 py-10 text-center space-y-2 text-sm text-slate-600" role="status" aria-live="polite">
      <p><i class="fa-solid fa-spinner fa-spin text-brand text-lg"></i></p>
      <p>${esc(message)}</p>
    </div>`;
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

function financeRangeSummary(start, end) {
  const rows = (state.expenses || []).filter(x => x.date >= start && x.date <= end);
  const income = rows.filter(x => x.type === 'income').reduce((a, x) => a + num(x.amount), 0);
  const expense = rows.filter(x => x.type !== 'income').reduce((a, x) => a + num(x.amount), 0);
  const cats = {};
  rows.filter(x => x.type !== 'income').forEach(x => { cats[x.category || 'อื่น ๆ'] = (cats[x.category || 'อื่น ๆ'] || 0) + num(x.amount); });
  const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { count: rows.length, income, expense, net: income - expense, topCats };
}

export function mountWeekly(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-3 space-y-6">
    <div class="card space-y-3">
      <div class="flex justify-center gap-2">
        <button id="sum-week" type="button" class="chip whitespace-nowrap min-h-[38px]">รายสัปดาห์</button>
        <button id="sum-month" type="button" class="chip whitespace-nowrap min-h-[38px]">รายเดือน</button>
      </div>
      <div class="flex items-center justify-between gap-3">
        <button id="wk-prev" type="button" class="btn btn-ghost !px-3 min-w-[44px] min-h-[44px]" aria-label="ช่วงก่อน"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="text-center min-w-0">
          <h2 id="wk-title" class="font-bold text-slate-800"><i class="fa-solid fa-chart-line text-brand"></i> สรุปสุขภาพ</h2>
          <p id="wk-range" class="text-sm text-slate-600 tabular-nums"></p>
        </div>
        <button id="wk-next" type="button" class="btn btn-ghost !px-3 min-w-[44px] min-h-[44px]" aria-label="ช่วงถัดไป"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
    <div id="wk-body" class="grid grid-cols-1 lg:grid-cols-3 gap-6"></div>
  </div>`;
  $('#wk-prev', root).addEventListener('click', () => { if (summaryMode === 'monthly') { selectedMonth = shiftMonth(selectedMonth, -1); renderWeekly(); } else { weekStart = addDays(weekStart, -7); renderWeekly(); } });
  $('#wk-next', root).addEventListener('click', () => { if (summaryMode === 'monthly') { selectedMonth = shiftMonth(selectedMonth, 1); renderWeekly(); } else { weekStart = addDays(weekStart, 7); renderWeekly(); } });
  $('#sum-week', root).onclick = () => { summaryMode = 'weekly'; renderWeekly(); };
  $('#sum-month', root).onclick = () => { summaryMode = 'monthly'; renderWeekly(); };
  renderWeekly();
}

export function resetWeeklyToToday() {
  const today = localDateStr();
  weekStart = mondayOf(today);
  selectedMonth = today.slice(0, 7);
}

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export async function renderWeekly() {
  if (!root || !state.uid) return;
  $('#sum-week', root).className = `chip whitespace-nowrap min-h-[38px] ${summaryMode === 'weekly' ? 'bg-brand text-white' : 'bg-lav-soft text-brand-dark'}`;
  $('#sum-month', root).className = `chip whitespace-nowrap min-h-[38px] ${summaryMode === 'monthly' ? 'bg-brand text-white' : 'bg-lav-soft text-brand-dark'}`;
  $('#wk-prev', root).setAttribute('aria-label', summaryMode === 'monthly' ? 'เดือนก่อน' : 'สัปดาห์ก่อน');
  $('#wk-next', root).setAttribute('aria-label', summaryMode === 'monthly' ? 'เดือนถัดไป' : 'สัปดาห์ถัดไป');
  if (summaryMode === 'monthly') return renderMonthly();

  const my = ++seq, end = addDays(weekStart, 6), days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  $('#wk-range', root).textContent = `${fmtDate(weekStart)} – ${fmtDate(end)}${weekStart === mondayOf(localDateStr()) ? ' (สัปดาห์นี้)' : ''}`;
  $('#wk-next', root).disabled = weekStart >= mondayOf(localDateStr());
  renderLoadingSkeleton('กำลังโหลดสรุปสัปดาห์...');

  let food = [];
  let foodError = false;
  try {
    food = (await getDocs(query(userCol(state.uid, 'food_records'), where('date', '>=', weekStart), where('date', '<=', end)))).docs.map(d => d.data());
  } catch {
    foodError = true;
  }
  if (my !== seq) return;

  const T = getTargets(), today = localDateStr();
  const byDay = Object.fromEntries(days.map(d => [d, { cal: 0, p: 0, n: 0 }]));
  food.forEach(f => { const x = byDay[f.date]; if (x) { x.cal += num(f.calories); x.p += num(f.protein); x.n++; } });
  const logged = days.filter(d => byDay[d].n > 0 && d <= today);
  const avgCal = avg(logged.map(d => byDay[d].cal)), avgP = avg(logged.map(d => byDay[d].p));
  const over = logged.filter(d => byDay[d].cal > T.kcal * 1.1).length, under = logged.filter(d => byDay[d].cal < T.kcal * 0.8).length;

  const W = 320, H = 150, P = 22, max = Math.max(T.kcal * 1.3, ...days.map(d => byDay[d].cal), 1), bw = (W - 2 * P) / 7;
  const y = v => H - P - v / max * (H - 2 * P);
  const bars = days.map((d, i) => {
    const v = byDay[d].cal, x = P + i * bw + 4, h = H - P - y(v), c = v > T.kcal * 1.1 ? '#fbbf24' : '#a78bfa';
    return `<rect x="${x}" y="${y(v)}" width="${bw - 8}" height="${Math.max(h, 0)}" rx="3" fill="${v ? c : '#e2e8f0'}"><title>${esc(fmtDate(d))}: ${Math.round(v)} kcal</title></rect>
      <text x="${x + (bw - 8) / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#64748b">${['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'][i]}</text>`;
  }).join('');
  const chart = logged.length
    ? `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="กราฟพลังงานรายวันตลอดสัปดาห์">${bars}<line x1="${P}" x2="${W - P}" y1="${y(T.kcal)}" y2="${y(T.kcal)}" stroke="#ec4899" stroke-dasharray="4 3"/><text x="${W - P}" y="${y(T.kcal) - 3}" font-size="9" text-anchor="end" fill="#ec4899">เป้า ${T.kcal}</text></svg>`
    : `<p class="text-xs text-slate-500 bg-slate-50 rounded-xl py-6 text-center">${foodError ? 'โหลดบันทึกอาหารไม่สำเร็จในขณะนี้' : 'สัปดาห์นี้ยังไม่มีบันทึกอาหาร'}</p>`;

  const wOf = (a, b) => state.body.filter(r => typeof r.weight === 'number' && r.date >= a && r.date <= b).sort((p, q) => p.date.localeCompare(q.date));
  const wk = wOf(weekStart, end), prev = wOf(addDays(weekStart, -7), addDays(weekStart, -1));
  const wAvg = avg(wk.map(r => r.weight)), pAvg = avg(prev.map(r => r.weight));
  const wDelta = wAvg !== null && pAvg !== null ? round1(wAvg - pAvg) : null;

  const ssRange = state.body.filter(r => r.date >= weekStart && r.date <= end);
  const sleepVals = ssRange.map(r => typeof r.sleepHours === 'number' ? r.sleepHours : (typeof r.sleepMinutes === 'number' ? r.sleepMinutes / 60 : null)).filter(v => v !== null);
  const stepVals = ssRange.map(r => typeof r.steps === 'number' ? r.steps : null).filter(v => v !== null);
  const sleepAvg = avg(sleepVals);
  const stepsAvg = avg(stepVals);
  const stepsTotal = stepVals.reduce((a, b) => a + b, 0);

  const ws = state.workouts.filter(w => w.date >= weekStart && w.date <= end && w.status !== 'planned');
  const mins = ws.reduce((a, w) => a + (w.durationMin || 0), 0), burn = ws.reduce((a, w) => a + (w.estKcal || 0), 0);
  const types = {}; ws.forEach(w => { types[w.type] = (types[w.type] || 0) + 1; });
  const sx = state.symptoms.filter(s => s.date >= weekStart && s.date <= end && Object.values(s.symptoms || {}).some(v => v > 0)).length;

  const tips = [];
  if (foodError) tips.push('ไม่สามารถดึงข้อมูลอาหารจากเซิร์ฟเวอร์ได้ในขณะนี้ (แสดงเฉพาะข้อมูลส่วนอื่นในเครื่อง)');
  else if (!logged.length) tips.push('สัปดาห์นี้ยังไม่มีบันทึกอาหาร');
  else {
    if (logged.length < 5 && end < today) tips.push(`บันทึกอาหารแค่ ${logged.length}/7 วัน — ยิ่งบันทึกครบ สรุปยิ่งแม่น`);
    if (avgP !== null && avgP < T.protein * 0.8) tips.push(`โปรตีนเฉลี่ย ${Math.round(avgP)} g ต่ำกว่าเป้า ${T.protein} g`);
    if (over >= 3) tips.push(`เกินเป้าแคลอรี่ ${over} วัน — ลองวางแผนมื้อล่วงหน้า`);
    if (under >= 3) tips.push(`ต่ำกว่าเป้ามาก ${under} วัน — กินน้อยเกินไปต่อเนื่องอาจเหนื่อยง่าย`);
  }
  if (ws.length === 0 && end < today) tips.push('สัปดาห์นี้ไม่ได้ออกกำลังกายตามที่บันทึก');
  if (ws.length >= 3) tips.push(`ออกกำลังกาย ${ws.length} ครั้ง เยี่ยมมาก`);
  if (wDelta !== null && Math.abs(wDelta) >= 1) tips.push(`น้ำหนักเฉลี่ย${wDelta > 0 ? 'เพิ่ม' : 'ลด'} ${Math.abs(wDelta)} กก. จากสัปดาห์ก่อน (ความผันผวนรายวันเป็นเรื่องปกติ ดูแนวโน้มหลายสัปดาห์)`);
  if (sleepAvg !== null && sleepAvg < 6) tips.push(`สัปดาห์นี้นอนเฉลี่ย ${round1(sleepAvg)} ชม./คืน — ลองพักผ่อนให้ใกล้เคียง 7–8 ชม. จะช่วยการฟื้นตัวและความอยากอาหารได้`);

  const fin = financeRangeSummary(weekStart, end);
  const invRem = inventoryAndReminderSummary(today);

  const stat = (label, val, sub = '') => `<div class="bg-lav-soft/50 rounded-xl p-3"><p class="text-xs text-slate-600">${label}</p><p class="text-lg font-bold text-slate-800 tabular-nums">${val}</p><p class="text-[11px] text-slate-500 tabular-nums">${sub}</p></div>`;
  $('#wk-body', root).innerHTML = `
    <div class="card space-y-3 lg:col-span-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-bold text-slate-800"><i class="fa-solid fa-utensils text-brand"></i> อาหาร</h3>
        ${foodError ? '<span class="text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg">โหลดบันทึกอาหารไม่สำเร็จ</span>' : ''}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${stat('บันทึกอาหาร', `${logged.length}/7 วัน`)}
        ${stat('พลังงานเฉลี่ย/วัน', avgCal === null ? '—' : Math.round(avgCal).toLocaleString() + ' kcal', `เป้า ${T.kcal.toLocaleString()}`)}
        ${stat('โปรตีนเฉลี่ย/วัน', avgP === null ? '—' : Math.round(avgP) + ' g', `เป้า ${T.protein} g`)}
        ${stat('เกิน / ต่ำกว่าเป้า', logged.length ? `${over} / ${under} วัน` : '—', 'เกิน >110% · ต่ำ <80%')}
      </div>${chart}</div>
    <div class="space-y-6">
      <div class="card space-y-3"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-weight-scale text-blue-500"></i> น้ำหนัก · การนอน · ก้าวเดิน</h3>
        ${wAvg === null ? '<p class="text-xs text-slate-500">ไม่มีการชั่งน้ำหนักในสัปดาห์นี้</p>' : `<p class="text-lg font-bold tabular-nums">${round1(wAvg)} กก. <span class="text-xs font-normal text-slate-500">เฉลี่ย (${wk.length} ครั้ง)</span></p>
        <p class="text-xs text-slate-600 tabular-nums">${wk.length > 1 ? `ต้นสัปดาห์ ${wk[0].weight} → ปลาย ${wk[wk.length - 1].weight} กก.` : ''}</p>
        <p class="text-xs tabular-nums ${wDelta === null ? 'text-slate-500' : wDelta > 0 ? 'text-rose-600' : 'text-green-700'}">${wDelta === null ? 'ไม่มีข้อมูลสัปดาห์ก่อนให้เทียบ' : `เทียบสัปดาห์ก่อน ${wDelta > 0 ? '+' : ''}${wDelta} กก.`}</p>`}
        ${(sleepAvg !== null || stepsAvg !== null) ? `<div class="border-t border-slate-100 pt-2 text-xs text-slate-600 space-y-1 tabular-nums">
          ${sleepAvg !== null ? `<p>นอนเฉลี่ย <b>${round1(sleepAvg)}</b> ชม./คืน (${sleepVals.length} วัน)</p>` : ''}
          ${stepsAvg !== null ? `<p>ก้าวเดินเฉลี่ย <b>${Math.round(stepsAvg).toLocaleString()}</b> ก้าว/วัน (รวม ${Math.round(stepsTotal).toLocaleString()})</p>` : ''}
        </div>` : ''}</div>
      <div class="card space-y-2"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-dumbbell text-brand"></i> ออกกำลังกาย</h3>
        ${ws.length
          ? `<p class="text-lg font-bold tabular-nums">${ws.length} ครั้ง <span class="text-xs font-normal text-slate-500">${mins ? `· ${mins} นาที` : ''}${burn ? ` · เผาผลาญ ~${burn} kcal` : ''}</span></p>
             ${Object.entries(types).map(([t, n]) => `<p class="text-xs text-slate-600 tabular-nums">${esc(TYPES[t] || t)}: ${n} ครั้ง</p>`).join('')}`
          : '<p class="text-xs text-slate-500">ยังไม่มีบันทึกออกกำลังกายในสัปดาห์นี้</p>'}
        ${sx ? `<p class="text-xs text-slate-500 pt-1 tabular-nums">มีบันทึกอาการ ${sx} วัน</p>` : ''}</div>
      <div class="card space-y-2"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-wallet text-emerald-600"></i> การเงินสัปดาห์นี้</h3>
        ${fin.count ? `<p class="text-sm tabular-nums">รับ <b class="text-emerald-700">฿${fmtMoney(fin.income)}</b> · จ่าย <b class="text-rose-600">฿${fmtMoney(fin.expense)}</b></p>
        <p class="text-xs text-slate-600 tabular-nums">สุทธิ: <b class="${fin.net < 0 ? 'text-rose-600' : 'text-emerald-700'}">${fin.net >= 0 ? '+' : ''}฿${fmtMoney(fin.net)}</b> (${fin.count} รายการ)</p>
        ${fin.topCats.length ? `<p class="text-[11px] text-slate-500 tabular-nums">ใช้จ่ายหลัก: ${fin.topCats.map(([c, v]) => `${esc(c)} ฿${fmtMoney(v)}`).join(' · ')}</p>` : ''}` : '<p class="text-xs text-slate-500">ไม่มีรายการรายรับ-รายจ่ายในช่วงนี้</p>'}</div>
      <div class="card space-y-1.5"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-boxes-stacked text-sky-600"></i> สต๊อก & แจ้งเตือน</h3>
        <p class="text-xs text-slate-600 tabular-nums">สต๊อกทั้งหมด <b>${invRem.total}</b> · ใกล้หมด <b>${invRem.lowCount}</b> · ใกล้หมดอายุ <b>${invRem.expiringCount}</b></p>
        <p class="text-xs text-slate-600 tabular-nums">แจ้งเตือนถึงกำหนด <b>${invRem.activeCount}</b> รายการ${invRem.overdueCount ? ` (<span class="text-rose-600 font-semibold">เลยกำหนด ${invRem.overdueCount}</span>)` : ''} · ทั้งหมด ${invRem.scheduledTotal} กำหนดการ</p></div>
    </div>
    <div class="card lg:col-span-3"><h3 class="font-bold text-slate-800 mb-2">ข้อสังเกต</h3>${tips.length ? `<ul class="list-disc pl-5 text-sm text-slate-700 space-y-1">${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="text-sm text-slate-600">ทุกอย่างอยู่ในเกณฑ์ที่ตั้งไว้</p>'}
      <p class="text-[11px] text-slate-500 mt-2">สรุปจากข้อมูลที่บันทึกเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์</p></div>`;
}

async function renderMonthly() {
  const my = ++seq, [y, m] = selectedMonth.split('-').map(Number), start = selectedMonth + '-01', end = monthEndDate(selectedMonth), today = localDateStr();
  $('#wk-range', root).textContent = new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  $('#wk-next', root).disabled = selectedMonth >= today.slice(0, 7);
  renderLoadingSkeleton('กำลังโหลดสรุปรายเดือน...');

  let food = [];
  let foodError = false;
  try {
    food = (await getDocs(query(userCol(state.uid, 'food_records'), where('date', '>=', start), where('date', '<=', end)))).docs.map(d => d.data());
  } catch {
    foodError = true;
  }
  if (my !== seq) return;

  const loggedDays = new Set(food.map(x => x.date)), avgCal = loggedDays.size ? food.reduce((a, x) => a + num(x.calories), 0) / loggedDays.size : null, avgP = loggedDays.size ? food.reduce((a, x) => a + num(x.protein), 0) / loggedDays.size : null;
  const weights = state.body.filter(x => x.date >= start && x.date <= end && typeof x.weight === 'number').sort((a, b) => a.date.localeCompare(b.date));
  const workouts = state.workouts.filter(x => x.date >= start && x.date <= end && x.status !== 'planned'), minutes = workouts.reduce((a, x) => a + (x.durationMin || 0), 0);
  const symptoms = state.symptoms.filter(x => x.date >= start && x.date <= end && Object.values(x.symptoms || {}).some(v => v > 0)).length, targets = getTargets();
  const stat = (label, value, sub = '') => `<div class="bg-lav-soft/50 rounded-xl p-3"><p class="text-xs text-slate-600">${label}</p><p class="text-lg font-bold text-slate-800 tabular-nums">${value}</p><p class="text-[11px] text-slate-500 tabular-nums">${sub}</p></div>`;
  const daysInMonth = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${selectedMonth}-${String(i + 1).padStart(2, '0')}`);
  const byDay = Object.fromEntries(daysInMonth.map(d => [d, { cal: 0, p: 0 }]));
  food.forEach(f => { const x = byDay[f.date]; if (x) { x.cal += num(f.calories); x.p += num(f.protein); } });
  const W = 680, H = 170, P = 26, maxCal = Math.max(...daysInMonth.map(d => byDay[d].cal), 1), bw = (W - 2 * P) / daysInMonth.length;
  const yPos = v => H - P - v / maxCal * (H - 2 * P);
  const bars = daysInMonth.map((d, i) => {
    const v = byDay[d].cal, x = P + i * bw, h = Math.max(H - P - yPos(v), 0);
    return `<rect x="${x}" y="${yPos(v)}" width="${Math.max(bw - 1.5, 1)}" height="${h}" rx="1.5" fill="${v ? '#a78bfa' : '#e2e8f0'}"><title>${d}: ${Math.round(v)} kcal</title></rect>`
      + (i % 5 === 0 || i === daysInMonth.length - 1 ? `<text x="${x}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#64748b">${i + 1}</text>` : '');
  }).join('');
  const chart = loggedDays.size
    ? `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="กราฟแคลอรี่รายเดือน">${bars}</svg><p class="text-[11px] text-slate-500">แท่งกราฟ = แคลอรี่รวมต่อวัน (แตะแต่ละแท่งเพื่อดูตัวเลข)</p>`
    : `<p class="text-xs text-slate-500 bg-slate-50 rounded-xl py-6 text-center">${foodError ? 'โหลดบันทึกอาหารเดือนนี้ไม่สำเร็จ' : 'เดือนนี้ยังไม่มีบันทึกอาหาร'}</p>`;

  const ssMonth = state.body.filter(x => x.date >= start && x.date <= end);
  const mSleep = ssMonth.map(r => typeof r.sleepHours === 'number' ? r.sleepHours : (typeof r.sleepMinutes === 'number' ? r.sleepMinutes / 60 : null)).filter(v => v !== null);
  const mSteps = ssMonth.map(r => typeof r.steps === 'number' ? r.steps : null).filter(v => v !== null);
  const fin = financeRangeSummary(start, end);
  const invRem = inventoryAndReminderSummary(today);
  $('#wk-body', root).innerHTML = `<div class="card space-y-3 lg:col-span-2"><div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-bold text-slate-800">สรุปรายเดือน</h3>${foodError ? '<span class="text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg">โหลดบันทึกอาหารไม่สำเร็จ</span>' : ''}</div><div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    ${stat('วันที่บันทึกอาหาร', `${loggedDays.size} วัน`)}${stat('พลังงานเฉลี่ย/วันที่บันทึก', avgCal === null ? '—' : Math.round(avgCal).toLocaleString() + ' kcal', `เป้า ${targets.kcal.toLocaleString()} kcal`)}${stat('โปรตีนเฉลี่ย/วันที่บันทึก', avgP === null ? '—' : round1(avgP) + ' g', `เป้า ${targets.protein} g`)}
    ${stat('น้ำหนัก', weights.length ? round1(weights[weights.length - 1].weight) + ' กก.' : '—', weights.length ? `เปลี่ยนจากครั้งแรก ${round1(weights[weights.length - 1].weight - weights[0].weight)} กก.` : 'ไม่มีบันทึกเดือนนี้')}
    ${stat('ออกกำลังกาย', workouts.length ? `${workouts.length} ครั้ง` : '—', minutes ? `${minutes} นาทีรวม` : 'ยังไม่มีบันทึก')}${stat('วันที่มีบันทึกอาการ', `${symptoms} วัน`)}
    ${(mSleep.length || mSteps.length) ? stat('การนอน / ก้าวเดิน', mSleep.length ? `${round1(avg(mSleep))} ชม.` : `${Math.round(avg(mSteps)).toLocaleString()} ก้าว`, `${mSleep.length ? `นอน ${mSleep.length} คืน` : ''}${mSleep.length && mSteps.length ? ' · ' : ''}${mSteps.length ? `เดินเฉลี่ย ${Math.round(avg(mSteps)).toLocaleString()} ก้าว/วัน` : ''}`) : ''}
  </div>${chart}<p class="text-xs text-slate-500">สรุปตามวันที่มีข้อมูล ไม่ใช่คำแนะนำทางการแพทย์</p></div>
  <div class="space-y-6">
    <div class="card space-y-2"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-wallet text-emerald-600"></i> การเงินเดือนนี้</h3>
      ${fin.count ? `${stat('รายรับ / รายจ่าย', `฿${fmtMoney(fin.income)} / ฿${fmtMoney(fin.expense)}`, `สุทธิ ${fin.net >= 0 ? '+' : ''}฿${fmtMoney(fin.net)} (${fin.count} รายการ)`)}
      ${fin.topCats.length ? `<p class="text-xs text-slate-600 tabular-nums">หมวดใช้จ่ายสูง: ${fin.topCats.map(([c, v]) => `${esc(c)} (฿${fmtMoney(v)})`).join(', ')}</p>` : ''}`
        : '<p class="text-xs text-slate-500">ยังไม่มีรายการรายรับ-รายจ่ายในเดือนนี้</p>'}</div>
    <div class="card space-y-2"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-boxes-stacked text-sky-600"></i> สต๊อก & แจ้งเตือน</h3>
      <p class="text-xs text-slate-600 tabular-nums">สต๊อกทั้งหมด <b>${invRem.total}</b> รายการ (ใกล้หมด <b>${invRem.lowCount}</b> · ใกล้หมดอายุ <b>${invRem.expiringCount}</b>)</p>
      <p class="text-xs text-slate-600 tabular-nums">แจ้งเตือนที่ถึงกำหนด <b>${invRem.activeCount}</b> รายการ${invRem.overdueCount ? ` (<span class="text-rose-600 font-semibold">เลยกำหนด ${invRem.overdueCount}</span>)` : ''}</p></div>
  </div>`;
}
