import { getDocs, query, where } from 'firebase/firestore';
import { userCol } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, parseLocal, addDays, daysBetween, round1 } from './util.js';
import { getTargets } from './profile.js';
import { TYPES } from './workout.js';
import { sortBodyDesc } from './body.js';

let root, weekStart = mondayOf(localDateStr()), seq = 0;
function mondayOf(ds) { const d = parseLocal(ds); return addDays(ds, -((d.getDay() + 6) % 7)); }
const num = v => (typeof v === 'number' ? v : 0);

export function mountWeekly(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-3 space-y-6">
    <div class="card flex items-center justify-between gap-3">
      <button id="wk-prev" class="btn btn-ghost !px-3" aria-label="สัปดาห์ก่อน"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="text-center"><h2 class="font-bold text-slate-800"><i class="fa-solid fa-chart-line text-brand"></i> สรุปรายสัปดาห์</h2><p id="wk-range" class="text-sm text-slate-500"></p></div>
      <button id="wk-next" class="btn btn-ghost !px-3" aria-label="สัปดาห์ถัดไป"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
    <div id="wk-body" class="grid grid-cols-1 lg:grid-cols-3 gap-6"></div>
  </div>`;
  $('#wk-prev', root).addEventListener('click', () => { weekStart = addDays(weekStart, -7); renderWeekly(); });
  $('#wk-next', root).addEventListener('click', () => { weekStart = addDays(weekStart, 7); renderWeekly(); });
  renderWeekly();
}

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export async function renderWeekly() {
  if (!root || !state.uid) return;
  const my = ++seq, end = addDays(weekStart, 6), days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  $('#wk-range', root).textContent = `${fmtDate(weekStart)} – ${fmtDate(end)}${weekStart === mondayOf(localDateStr()) ? ' (สัปดาห์นี้)' : ''}`;
  $('#wk-next', root).disabled = weekStart >= mondayOf(localDateStr());
  let food = [];
  try { food = (await getDocs(query(userCol(state.uid, 'food_records'), where('date', '>=', weekStart), where('date', '<=', end)))).docs.map(d => d.data()); } catch (e) { /* ออฟไลน์/สิทธิ์: แสดงเฉพาะส่วนอื่น */ }
  if (my !== seq) return;   // มีการกดเปลี่ยนสัปดาห์ซ้อน

  const T = getTargets(), today = localDateStr();
  const byDay = Object.fromEntries(days.map(d => [d, { cal: 0, p: 0, n: 0 }]));
  food.forEach(f => { const x = byDay[f.date]; if (x) { x.cal += num(f.calories); x.p += num(f.protein); x.n++; } });
  const logged = days.filter(d => byDay[d].n > 0 && d <= today);
  const avgCal = avg(logged.map(d => byDay[d].cal)), avgP = avg(logged.map(d => byDay[d].p));
  const over = logged.filter(d => byDay[d].cal > T.kcal * 1.1).length, under = logged.filter(d => byDay[d].cal < T.kcal * 0.8).length;

  // กราฟแท่งพลังงานรายวัน
  const W = 320, H = 150, P = 22, max = Math.max(T.kcal * 1.3, ...days.map(d => byDay[d].cal), 1), bw = (W - 2 * P) / 7;
  const y = v => H - P - v / max * (H - 2 * P);
  const bars = days.map((d, i) => {
    const v = byDay[d].cal, x = P + i * bw + 4, h = H - P - y(v), c = v > T.kcal * 1.1 ? '#fbbf24' : '#a78bfa';
    return `<rect x="${x}" y="${y(v)}" width="${bw - 8}" height="${Math.max(h, 0)}" rx="3" fill="${v ? c : '#e2e8f0'}"><title>${esc(fmtDate(d))}: ${Math.round(v)} kcal</title></rect>
      <text x="${x + (bw - 8) / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#64748b">${['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'][i]}</text>`;
  }).join('');
  const chart = `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">${bars}<line x1="${P}" x2="${W - P}" y1="${y(T.kcal)}" y2="${y(T.kcal)}" stroke="#ec4899" stroke-dasharray="4 3"/><text x="${W - P}" y="${y(T.kcal) - 3}" font-size="9" text-anchor="end" fill="#ec4899">เป้า ${T.kcal}</text></svg>`;

  // น้ำหนัก: เทียบค่าเฉลี่ยสัปดาห์นี้กับสัปดาห์ก่อน
  const wOf = (a, b) => state.body.filter(r => typeof r.weight === 'number' && r.date >= a && r.date <= b).sort((p, q) => p.date.localeCompare(q.date));
  const wk = wOf(weekStart, end), prev = wOf(addDays(weekStart, -7), addDays(weekStart, -1));
  const wAvg = avg(wk.map(r => r.weight)), pAvg = avg(prev.map(r => r.weight));
  const wDelta = wAvg !== null && pAvg !== null ? round1(wAvg - pAvg) : null;

  // ออกกำลังกาย
  const ws = state.workouts.filter(w => w.date >= weekStart && w.date <= end);
  const mins = ws.reduce((a, w) => a + (w.durationMin || 0), 0), burn = ws.reduce((a, w) => a + (w.estKcal || 0), 0);
  const types = {}; ws.forEach(w => { types[w.type] = (types[w.type] || 0) + 1; });
  const sx = state.symptoms.filter(s => s.date >= weekStart && s.date <= end && Object.values(s.symptoms || {}).some(v => v > 0)).length;

  const tips = [];
  if (!logged.length) tips.push('สัปดาห์นี้ยังไม่มีบันทึกอาหาร');
  else {
    if (logged.length < 5 && end < today) tips.push(`บันทึกอาหารแค่ ${logged.length}/7 วัน — ยิ่งบันทึกครบ สรุปยิ่งแม่น`);
    if (avgP !== null && avgP < T.protein * 0.8) tips.push(`โปรตีนเฉลี่ย ${Math.round(avgP)} g ต่ำกว่าเป้า ${T.protein} g`);
    if (over >= 3) tips.push(`เกินเป้าแคลอรี่ ${over} วัน — ลองวางแผนมื้อล่วงหน้า`);
    if (under >= 3) tips.push(`ต่ำกว่าเป้ามาก ${under} วัน — กินน้อยเกินไปต่อเนื่องอาจเหนื่อยง่าย`);
  }
  if (ws.length === 0 && end < today) tips.push('สัปดาห์นี้ไม่ได้ออกกำลังกายตามที่บันทึก');
  if (ws.length >= 3) tips.push(`ออกกำลังกาย ${ws.length} ครั้ง เยี่ยมมาก 💪`);
  if (wDelta !== null && Math.abs(wDelta) >= 1) tips.push(`น้ำหนักเฉลี่ย${wDelta > 0 ? 'เพิ่ม' : 'ลด'} ${Math.abs(wDelta)} กก. จากสัปดาห์ก่อน (ความผันผวนรายวันเป็นเรื่องปกติ ดูแนวโน้มหลายสัปดาห์)`);

  const stat = (label, val, sub = '') => `<div class="bg-lav-soft/50 rounded-xl p-3"><p class="text-xs text-slate-500">${label}</p><p class="text-lg font-bold text-slate-800">${val}</p><p class="text-[11px] text-slate-500">${sub}</p></div>`;
  $('#wk-body', root).innerHTML = `
    <div class="card space-y-3 lg:col-span-2"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-utensils text-brand"></i> อาหาร</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${stat('บันทึกอาหาร', `${logged.length}/7 วัน`)}
        ${stat('พลังงานเฉลี่ย/วัน', avgCal === null ? '-' : Math.round(avgCal).toLocaleString() + ' kcal', `เป้า ${T.kcal.toLocaleString()}`)}
        ${stat('โปรตีนเฉลี่ย/วัน', avgP === null ? '-' : Math.round(avgP) + ' g', `เป้า ${T.protein} g`)}
        ${stat('เกิน / ต่ำกว่าเป้า', `${over} / ${under} วัน`, 'เกิน >110% · ต่ำ <80%')}
      </div>${chart}</div>
    <div class="space-y-6">
      <div class="card space-y-3"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-weight-scale text-blue-500"></i> น้ำหนัก</h3>
        ${wAvg === null ? '<p class="text-xs text-slate-400">ไม่มีการชั่งน้ำหนักในสัปดาห์นี้</p>' : `<p class="text-lg font-bold">${round1(wAvg)} กก. <span class="text-xs font-normal text-slate-500">เฉลี่ย (${wk.length} ครั้ง)</span></p>
        <p class="text-xs text-slate-600">${wk.length > 1 ? `ต้นสัปดาห์ ${wk[0].weight} → ปลาย ${wk[wk.length - 1].weight} กก.` : ''}</p>
        <p class="text-xs ${wDelta === null ? 'text-slate-400' : wDelta > 0 ? 'text-rose-600' : 'text-green-700'}">${wDelta === null ? 'ไม่มีข้อมูลสัปดาห์ก่อนให้เทียบ' : `เทียบสัปดาห์ก่อน ${wDelta > 0 ? '+' : ''}${wDelta} กก.`}</p>`}</div>
      <div class="card space-y-2"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-dumbbell text-brand"></i> ออกกำลังกาย</h3>
        <p class="text-lg font-bold">${ws.length} ครั้ง <span class="text-xs font-normal text-slate-500">${mins ? `· ${mins} นาที` : ''}${burn ? ` · เผาผลาญ ~${burn} kcal` : ''}</span></p>
        ${Object.entries(types).map(([t, n]) => `<p class="text-xs text-slate-600">${esc(TYPES[t] || t)}: ${n} ครั้ง</p>`).join('')}
        ${sx ? `<p class="text-xs text-slate-500 pt-1">มีบันทึกอาการ ${sx} วัน</p>` : ''}</div>
    </div>
    <div class="card lg:col-span-3"><h3 class="font-bold text-slate-800 mb-2">💡 ข้อสังเกต</h3>${tips.length ? `<ul class="list-disc pl-5 text-sm text-slate-700 space-y-1">${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="text-sm text-slate-500">ทุกอย่างอยู่ในเกณฑ์ที่ตั้งไว้ 🎉</p>'}
      <p class="text-[11px] text-slate-400 mt-2">สรุปจากข้อมูลที่บันทึกเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์</p></div>`;
}
