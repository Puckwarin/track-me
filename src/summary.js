import { state } from './state.js';
import { isPreviewMode } from './demo.js';
import { $, esc, fmtDate, localDateStr, addDays, daysBetween, round1, toast, openModal, mondayOf } from './util.js';
import { periodStats } from './period.js';
import { bodyLatest } from './body.js';
import { syncLineText, renderSyncStatus } from './sync.js';
import { iconSvg, iconBubble } from './icons.js';

let current = null;
const cacheKey = () => 'summary_cache_' + state.uid;
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const fmtMoney = n => Math.round(n || 0).toLocaleString();

export function clearSummaryCache() { if (state.uid) localStorage.removeItem(cacheKey()); }

function buildLiveSummary() {
  const today = localDateStr();
  const ym = today.slice(0, 7);
  const wkStart = mondayOf(today);
  const wkEnd = addDays(wkStart, 6);

  const monthEx = (state.expenses || []).filter(x => String(x.date || '').startsWith(ym));
  const income = monthEx.filter(x => x.type === 'income').reduce((a, x) => a + num(x.amount), 0);
  const expense = monthEx.filter(x => x.type !== 'income').reduce((a, x) => a + num(x.amount), 0);
  const finance = { ym, income, expense, net: income - expense, count: monthEx.length };

  const wkWorkouts = (state.workouts || []).filter(w => w.date >= wkStart && w.date <= wkEnd);
  const doneWorkouts = wkWorkouts.filter(w => w.status !== 'planned');
  const plannedWorkouts = wkWorkouts.filter(w => w.status === 'planned');
  const workouts = {
    doneCount: doneWorkouts.length,
    plannedCount: plannedWorkouts.length,
    minutes: doneWorkouts.reduce((a, w) => a + num(w.durationMin), 0),
    kcal: Math.round(doneWorkouts.reduce((a, w) => a + num(w.estKcal), 0))
  };

  return {
    period: periodStats(state.period || []),
    body: bodyLatest(state.body || []),
    finance,
    workouts
  };
}

// การ์ดสรุปทุกมิติแบบรวมศูนย์ (ใช้ได้ทั้งออนไลน์และออฟไลน์ผ่านแคชในเครื่อง)
export function renderSummary() {
  const grid = $('#summary-grid');
  if (!grid) return;

  const live = state.loaded.period && state.loaded.body;
  let s = null;
  if (live) {
    s = buildLiveSummary();
    if (!isPreviewMode()) {
      try { localStorage.setItem(cacheKey(), JSON.stringify(s)); } catch {}
    }
  } else {
    try { s = JSON.parse(localStorage.getItem(cacheKey()) || 'null'); } catch { s = null; }
  }
  current = s;

  let hasAnyValue = false;
  const card = (iconName, colorCls, title, main, sub, hasValue = true, targetTab = '') => {
    if (hasValue) hasAnyValue = true;
    const cls = `summary-kpi bg-slate-50 border border-slate-100 rounded-2xl p-3 text-left w-full${hasValue ? '' : ' summary-kpi-empty'}${targetTab ? ' cursor-pointer' : ''}`;
    if (targetTab) {
      return `<button type="button" data-page-go="${targetTab}" class="${cls}">
    <div class="text-xs text-slate-600 mb-1 flex items-center gap-1.5"><span class="${colorCls} shrink-0">${iconSvg(iconName, { size: 14 })}</span><span>${title}</span></div><div class="text-sm sm:text-base font-bold text-slate-800 tabular-nums">${main}</div><div class="text-[11px] text-slate-500 mt-0.5 tabular-nums">${sub}</div></button>`;
    }
    return `<div class="${cls}">
    <div class="text-xs text-slate-600 mb-1 flex items-center gap-1.5"><span class="${colorCls} shrink-0">${iconSvg(iconName, { size: 14 })}</span><span>${title}</span></div><div class="text-sm sm:text-base font-bold text-slate-800 tabular-nums">${main}</div><div class="text-[11px] text-slate-500 mt-0.5 tabular-nums">${sub}</div></div>`;
  };
  const empty = '<span class="text-slate-500 font-normal text-sm">ยังไม่มีข้อมูล</span>';

  const p = s?.period, b = s?.body || {};
  let c1, c2;
  if (p) {
    c1 = card('period', 'text-pink-500', 'ประจำเดือนล่าสุด', esc(fmtDate(p.lastStart)),
      `${daysBetween(p.lastStart, localDateStr())} วันที่แล้ว${p.lastEnd ? ' · มา ' + (daysBetween(p.lastStart, p.lastEnd) + 1) + ' วัน' : ''}`, true, 'period');
    c2 = card('cycle', 'text-pink-500', 'รอบเฉลี่ย', p.avgCycle ? p.avgCycle + ' วัน' : empty, p.next ? 'คาดรอบหน้า ~ ' + esc(fmtDate(p.next)) : 'ต้องมีอย่างน้อย 2 รอบ', !!p.avgCycle, 'period');
  } else {
    c1 = card('period', 'text-pink-500', 'ประจำเดือนล่าสุด', empty, 'บันทึกได้ที่แท็บประจำเดือน', false, 'period');
    c2 = card('cycle', 'text-pink-500', 'รอบเฉลี่ย', empty, 'รอรอบเดือนที่บันทึก', false, 'period');
  }

  const c3 = card('body', 'text-brand', 'น้ำหนักล่าสุด', b.weight ? b.weight.v + ' กก.' : empty, b.weight ? esc(fmtDate(b.weight.d)) : 'บันทึกได้ที่แท็บน้ำหนัก', !!b.weight, 'body');

  const measureParts = [['อก', 'bust'], ['เอว', 'waist'], ['สะโพก', 'hip'], ['แขน', 'arm'], ['ขา', 'thigh']].map(([t, k]) => `${t} ${b[k] ? b[k].v : '-'}`).join(' / ');
  const hasBodyMeasurements = !!(b.bust || b.waist || b.hip || b.arm || b.thigh);
  const measureDate = [b.bust, b.waist, b.hip, b.arm, b.thigh].find(Boolean)?.d;
  const c4 = card(
    'ruler',
    'text-brand',
    'สัดส่วน',
    hasBodyMeasurements ? `<span class="text-xs sm:text-sm">${measureParts}</span>` : empty,
    hasBodyMeasurements ? (measureDate ? `${esc(fmtDate(measureDate))} · ซม.` : 'หน่วย ซม.') : 'บันทึกได้ที่แท็บน้ำหนัก · สัดส่วน',
    hasBodyMeasurements,
    'body'
  );

  const hasSleep = !!(b.sleepHours && Number.isFinite(Number(b.sleepHours.v)));
  const c5 = card(
    'sleep',
    'text-brand',
    'การนอน',
    hasSleep ? `${round1(b.sleepHours.v)} ชม.` : empty,
    hasSleep ? esc(fmtDate(b.sleepHours.d)) : 'บันทึกได้ที่แท็บน้ำหนัก · นอน/ก้าว',
    hasSleep,
    'body'
  );

  const hasSteps = !!(b.steps && Number.isFinite(Number(b.steps.v)));
  const c6 = card(
    'steps',
    'text-brand',
    'ก้าวเดิน',
    hasSteps ? `${Math.round(b.steps.v).toLocaleString()} ก้าว` : empty,
    hasSteps ? esc(fmtDate(b.steps.d)) : 'บันทึกได้ที่แท็บน้ำหนัก · นอน/ก้าว',
    hasSteps,
    'body'
  );

  const fin = s?.finance;
  const netCls = fin && fin.net < 0 ? 'text-rose-600' : 'text-emerald-700';
  const c7 = card(
    'expense',
    'text-emerald-600',
    'การเงินเดือนนี้',
    fin && fin.count ? `จ่าย ฿${fmtMoney(fin.expense)}` : empty,
    fin && fin.count
      ? `รับ ฿${fmtMoney(fin.income)}<div class="mt-0.5 ${netCls} font-semibold">ยอดรวม ${fin.net >= 0 ? '+' : ''}฿${fmtMoney(fin.net)}</div>`
      : 'ยังไม่มีรายการเดือนนี้',
    !!(fin && fin.count),
    'expense'
  );

  const wo = s?.workouts;
  const hasWorkouts = !!(wo && (wo.doneCount > 0 || wo.plannedCount > 0));
  const c8 = card(
    'workout',
    'text-amber-600',
    'ออกกำลังกายสัปดาห์นี้',
    hasWorkouts
      ? `${wo.doneCount} ครั้ง${wo.minutes ? ` <span class="text-xs font-normal text-slate-500">(${wo.minutes} น.)</span>` : ''}`
      : empty,
    hasWorkouts
      ? `${wo.kcal ? `เผาผลาญ ~${wo.kcal} kcal` : (wo.doneCount ? 'บันทึกเวลาแล้ว' : 'มีเฉพาะแผนที่วางไว้')}${wo.plannedCount ? ` · แผนอีก ${wo.plannedCount}` : ''}`
      : 'ยังไม่มีบันทึกสัปดาห์นี้',
    hasWorkouts,
    'workout'
  );

  const desktopEmptyState = hasAnyValue ? '' : `
    <div class="summary-all-empty col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center space-y-2">
      <div class="flex justify-center">${iconBubble('overview')}</div>
      <p class="text-sm font-semibold text-slate-800">ยังไม่มีข้อมูลสรุปในตอนนี้</p>
      <p class="text-xs text-slate-500 leading-relaxed">เริ่มบันทึกน้ำหนัก สัดส่วน การนอน ก้าวเดิน ออกกำลังกาย หรือรายรับ-รายจ่าย เพื่อดูสรุปภาพรวมทั้งหมดที่นี่</p>
    </div>`;

  grid.innerHTML = c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8 + desktopEmptyState;
  renderSyncStatus();
}

export function copySummary() {
  const s = current || (state.uid ? buildLiveSummary() : null);
  if (!s) return toast('ยังไม่มีข้อมูลให้คัดลอก', 'err');
  const p = s.period, b = s.body || {}, fin = s.finance, wo = s.workouts;
  const L = [`📊 สรุปภาพรวม Track Me (ณ ${fmtDate(localDateStr())})`];
  if (p) {
    L.push(`🌸 ประจำเดือนล่าสุด (LMP): ${fmtDate(p.lastStart)} (${daysBetween(p.lastStart, localDateStr())} วันที่แล้ว)`);
    if (p.avgCycle) L.push(`   รอบเฉลี่ย: ${p.avgCycle} วัน${p.next ? ` · คาดรอบหน้า ~${fmtDate(p.next)}` : ''}`);
    if (p.avgDur) L.push(`   มาเฉลี่ย: ${p.avgDur} วัน`);
  }
  if (b.weight) L.push(`⚖️ น้ำหนักล่าสุด: ${b.weight.v} กก. (${fmtDate(b.weight.d)})`);
  const m = [['อก', b.bust], ['เอว', b.waist], ['สะโพก', b.hip], ['แขน', b.arm], ['ขา', b.thigh]].filter(x => x[1]).map(x => `${x[0]} ${x[1].v}`);
  if (m.length) L.push(`📏 สัดส่วน: ${m.join(' / ')} ซม.`);
  if (b.sleepHours) L.push(`😴 การนอนล่าสุด: ${round1(b.sleepHours.v)} ชม. (${fmtDate(b.sleepHours.d)})`);
  if (b.steps) L.push(`👣 ก้าวเดินล่าสุด: ${Math.round(b.steps.v).toLocaleString()} ก้าว (${fmtDate(b.steps.d)})`);
  if (fin && fin.count) L.push(`💰 การเงินเดือนนี้: รับ ${fmtMoney(fin.income)} · จ่าย ${fmtMoney(fin.expense)} · ยอดรวม ${fin.net >= 0 ? '+' : ''}${fmtMoney(fin.net)} บาท`);
  if (wo && (wo.doneCount || wo.plannedCount)) L.push(`💪 ออกกำลังกายสัปดาห์นี้: ${wo.doneCount} ครั้ง (${wo.minutes} นาที · ~${wo.kcal} kcal${wo.plannedCount ? ` · แผนค้าง ${wo.plannedCount}` : ''})`);
  L.push(syncLineText());
  const text = L.join('\n');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('คัดลอกสรุปแล้ว')).catch(() => showCopyFallback(text));
  } else {
    showCopyFallback(text);
  }
}

function showCopyFallback(text) {
  openModal(`
    <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-base">คัดลอกสรุป</h3><button data-close class="text-slate-500 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <textarea class="input min-h-48 text-xs font-mono" readonly>${esc(text)}</textarea>
    <div class="flex justify-end mt-3"><button data-close class="btn btn-primary text-xs">ปิด</button></div>
  `);
}
