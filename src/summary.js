import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, addDays, daysBetween, round1, toast, openModal, addMonthsLocal, mondayOf } from './util.js';
import { periodStats } from './period.js';
import { bodyLatest } from './body.js';
import { getTargets } from './profile.js';
import { collectReminders, trackedSources } from './reminders.js';
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
  const targets = getTargets();

  const todayFood = state.todayFood || [];
  const nutrition = {
    count: todayFood.length,
    cal: Math.round(todayFood.reduce((a, x) => a + num(x.calories), 0)),
    protein: round1(todayFood.reduce((a, x) => a + num(x.protein), 0)),
    carbs: round1(todayFood.reduce((a, x) => a + num(x.carbs), 0)),
    fat: round1(todayFood.reduce((a, x) => a + num(x.fat), 0)),
    targetCal: targets.kcal,
    targetProtein: targets.protein
  };

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

  const products = state.trackedProducts || [];
  const lowCount = products.filter(p => p.quantity != null && p.lowAt != null && Number(p.quantity) <= Number(p.lowAt)).length;
  const expiringCount = products.filter(p => {
    const exp = p.expiryDate || (p.openedDate && p.paoMonths ? addMonthsLocal(p.openedDate, Number(p.paoMonths)) : p.paoExpiry);
    return exp && daysBetween(today, exp) <= 30;
  }).length;
  const inventory = { total: products.length, lowCount, expiringCount };

  const activeReminders = collectReminders();
  const scheduledTotal = trackedSources().length;
  const overdueCount = activeReminders.filter(r => r.date && r.date < today).length;
  const reminders = { activeCount: activeReminders.length, overdueCount, scheduledTotal };

  return {
    period: periodStats(state.period || []),
    body: bodyLatest(state.body || []),
    nutrition,
    finance,
    workouts,
    inventory,
    reminders
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
    try { localStorage.setItem(cacheKey(), JSON.stringify(s)); } catch {}
  } else {
    try { s = JSON.parse(localStorage.getItem(cacheKey()) || 'null'); } catch { s = null; }
  }
  current = s;

  let hasAnyValue = false;
  const card = (iconName, colorCls, title, main, sub, hasValue = true) => {
    if (hasValue) hasAnyValue = true;
    return `<div class="summary-kpi bg-slate-50 border border-slate-100 rounded-2xl p-3${hasValue ? '' : ' summary-kpi-empty'}">
    <div class="text-xs text-slate-600 mb-1 flex items-center gap-1.5"><span class="${colorCls} shrink-0">${iconSvg(iconName, { size: 14 })}</span><span>${title}</span></div><div class="text-sm sm:text-base font-bold text-slate-800 tabular-nums">${main}</div><div class="text-[11px] text-slate-500 mt-0.5 tabular-nums">${sub}</div></div>`;
  };
  const empty = '<span class="text-slate-500 font-normal text-sm">ยังไม่มีข้อมูล</span>';

  const p = s?.period, b = s?.body || {};
  let c1, c2;
  if (p) {
    c1 = card('period', 'text-pink-500', 'ประจำเดือนล่าสุด', esc(fmtDate(p.lastStart)),
      `${daysBetween(p.lastStart, localDateStr())} วันที่แล้ว${p.lastEnd ? ' · มา ' + (daysBetween(p.lastStart, p.lastEnd) + 1) + ' วัน' : ''}`, true);
    c2 = card('cycle', 'text-pink-500', 'รอบเฉลี่ย', p.avgCycle ? p.avgCycle + ' วัน' : empty, p.next ? 'คาดรอบหน้า ~ ' + esc(fmtDate(p.next)) : 'ต้องมีอย่างน้อย 2 รอบ', !!p.avgCycle);
  } else {
    c1 = card('period', 'text-pink-500', 'ประจำเดือนล่าสุด', empty, 'บันทึกได้ที่แท็บประจำเดือน', false);
    c2 = card('cycle', 'text-pink-500', 'รอบเฉลี่ย', empty, 'รอรอบเดือนที่บันทึก', false);
  }

  const c3 = card('body', 'text-blue-500', 'น้ำหนักล่าสุด', b.weight ? b.weight.v + ' กก.' : empty, b.weight ? esc(fmtDate(b.weight.d)) : 'บันทึกได้ที่แท็บน้ำหนัก', !!b.weight);
  const m = [['อก', 'bust'], ['เอว', 'waist'], ['สะโพก', 'hip'], ['แขน', 'arm'], ['ขา', 'thigh']].map(([t, k]) => `${t} ${b[k] ? b[k].v : '-'}`).join(' / ');
  const sleepStepsSub = [
    b.sleepHours ? `นอน ${round1(b.sleepHours.v)} ชม. (${esc(fmtDate(b.sleepHours.d))})` : '',
    b.steps ? `${Math.round(b.steps.v).toLocaleString()} ก้าว` : ''
  ].filter(Boolean).join(' · ');
  const hasBodyMeasurements = !!(b.bust || b.waist || b.hip || b.arm || b.thigh);
  const hasBodySummary = hasBodyMeasurements || !!sleepStepsSub;
  const c4 = card('ruler', 'text-blue-500', 'สัดส่วน · นอน/ก้าว', hasBodyMeasurements ? `<span class="text-xs sm:text-sm">${m}</span>` : (sleepStepsSub ? `<span class="text-xs sm:text-sm">${sleepStepsSub}</span>` : empty), hasBodyMeasurements ? sleepStepsSub : (sleepStepsSub ? '' : 'รอกรอกสัดส่วนหรือชั่วโมงนอน'), hasBodySummary);

  const nut = s?.nutrition;
  const hasFoodToday = !!(nut && nut.count > 0);
  const c5 = card(
    'food',
    'text-brand',
    'โภชนาการวันนี้',
    hasFoodToday
      ? `${nut.cal.toLocaleString()} <span class="text-xs font-normal text-slate-500">/ ${nut.targetCal.toLocaleString()} kcal</span>`
      : empty,
    hasFoodToday
      ? `P ${nut.protein} · C ${nut.carbs} · F ${nut.fat} g (${nut.count} รายการ)`
      : (nut ? `เป้าหมาย ${nut.targetCal.toLocaleString()} kcal · P ${nut.targetProtein}g` : 'ยังไม่ได้บันทึกวันนี้'),
    hasFoodToday
  );

  const fin = s?.finance;
  const netCls = fin && fin.net < 0 ? 'text-rose-600' : 'text-emerald-700';
  const c6 = card(
    'expense',
    'text-emerald-600',
    'การเงินเดือนนี้',
    fin && fin.count ? `จ่าย ฿${fmtMoney(fin.expense)}` : empty,
    fin && fin.count
      ? `รับ ฿${fmtMoney(fin.income)} · <span class="${netCls} font-semibold">สุทธิ ${fin.net >= 0 ? '+' : ''}฿${fmtMoney(fin.net)}</span>`
      : 'ยังไม่มีรายการเดือนนี้',
    !!(fin && fin.count)
  );

  const wo = s?.workouts;
  const hasWorkouts = !!(wo && (wo.doneCount > 0 || wo.plannedCount > 0));
  const c7 = card(
    'workout',
    'text-amber-600',
    'ออกกำลังกายสัปดาห์นี้',
    hasWorkouts
      ? `${wo.doneCount} ครั้ง${wo.minutes ? ` <span class="text-xs font-normal text-slate-500">(${wo.minutes} น.)</span>` : ''}`
      : empty,
    hasWorkouts
      ? `${wo.kcal ? `เผาผลาญ ~${wo.kcal} kcal` : (wo.doneCount ? 'บันทึกเวลาแล้ว' : 'มีเฉพาะแผนที่วางไว้')}${wo.plannedCount ? ` · แผนอีก ${wo.plannedCount}` : ''}`
      : 'ยังไม่มีบันทึกสัปดาห์นี้',
    hasWorkouts
  );

  const inv = s?.inventory;
  const rem = s?.reminders;
  const hasInvOrRem = !!((inv && inv.total > 0) || (rem && (rem.activeCount > 0 || rem.scheduledTotal > 0)));
  const c8 = card(
    'inventory',
    'text-sky-600',
    'สต๊อก & แจ้งเตือน',
    hasInvOrRem ? `สต๊อก ${inv?.total ?? 0} · เตือน ${rem?.activeCount ?? 0}` : empty,
    hasInvOrRem
      ? `ใกล้หมด ${inv?.lowCount ?? 0} · ใกล้หมดอายุ ${inv?.expiringCount ?? 0}${(rem?.overdueCount || 0) > 0 ? ` · <span class="text-rose-600 font-semibold">เลยกำหนด ${rem.overdueCount}</span>` : ''}`
      : 'เพิ่มของใช้หรือกำหนดเตือนในแท็บดูแล',
    hasInvOrRem
  );

  const desktopEmptyState = hasAnyValue ? '' : `
    <div class="summary-all-empty col-span-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center space-y-2">
      <div class="flex justify-center">${iconBubble('overview', { cat: 'cat-lab' })}</div>
      <p class="text-sm font-semibold text-slate-800">ยังไม่มีข้อมูลสรุปในตอนนี้</p>
      <p class="text-xs text-slate-500 leading-relaxed">เริ่มบันทึกอาหาร น้ำหนัก ออกกำลังกาย หรือรายรับ-รายจ่าย เพื่อดูสรุปภาพรวมทั้งหมดที่นี่</p>
    </div>`;

  grid.innerHTML = c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8 + desktopEmptyState;
  renderSyncStatus();
}

export function copySummary() {
  const s = current || (state.uid ? buildLiveSummary() : null);
  if (!s) return toast('ยังไม่มีข้อมูลให้คัดลอก', 'err');
  const p = s.period, b = s.body || {}, nut = s.nutrition, fin = s.finance, wo = s.workouts, inv = s.inventory, rem = s.reminders;
  const L = [`📊 สรุปภาพรวม Track Me (ณ ${fmtDate(localDateStr())})`];
  if (p) {
    L.push(`🌸 ประจำเดือนล่าสุด (LMP): ${fmtDate(p.lastStart)} (${daysBetween(p.lastStart, localDateStr())} วันที่แล้ว)`);
    if (p.avgCycle) L.push(`   รอบเฉลี่ย: ${p.avgCycle} วัน${p.next ? ` · คาดรอบหน้า ~${fmtDate(p.next)}` : ''}`);
    if (p.avgDur) L.push(`   มาเฉลี่ย: ${p.avgDur} วัน`);
  }
  if (b.weight) L.push(`⚖️ น้ำหนักล่าสุด: ${b.weight.v} กก. (${fmtDate(b.weight.d)})`);
  const m = [['อก', b.bust], ['เอว', b.waist], ['สะโพก', b.hip], ['แขน', b.arm], ['ขา', b.thigh]].filter(x => x[1]).map(x => `${x[0]} ${x[1].v}`);
  if (m.length) L.push(`📏 สัดส่วน: ${m.join(' / ')} ซม.`);
  if (b.sleepHours || b.steps) {
    const ss = [
      b.sleepHours ? `😴 นอนล่าสุด ${round1(b.sleepHours.v)} ชม. (${fmtDate(b.sleepHours.d)})` : '',
      b.steps ? `👣 ${Math.round(b.steps.v).toLocaleString()} ก้าว (${fmtDate(b.steps.d)})` : ''
    ].filter(Boolean);
    L.push(ss.join(' · '));
  }
  if (nut && nut.count > 0) L.push(`🍙 โภชนาการวันนี้: ${nut.cal}/${nut.targetCal} kcal (P ${nut.protein} · C ${nut.carbs} · F ${nut.fat} g)`);
  if (fin && fin.count) L.push(`💰 การเงินเดือนนี้: รับ ${fmtMoney(fin.income)} · จ่าย ${fmtMoney(fin.expense)} · สุทธิ ${fin.net >= 0 ? '+' : ''}${fmtMoney(fin.net)} บาท`);
  if (wo && (wo.doneCount || wo.plannedCount)) L.push(`💪 ออกกำลังกายสัปดาห์นี้: ${wo.doneCount} ครั้ง (${wo.minutes} นาที · ~${wo.kcal} kcal${wo.plannedCount ? ` · แผนค้าง ${wo.plannedCount}` : ''})`);
  if (inv && inv.total) L.push(`📦 สต๊อกของใช้: ทั้งหมด ${inv.total} ชิ้น (ใกล้หมด ${inv.lowCount} · ใกล้หมดอายุ ${inv.expiringCount})`);
  if (rem && (rem.activeCount || rem.scheduledTotal)) L.push(`🔔 แจ้งเตือนที่ถึงกำหนด: ${rem.activeCount} รายการ${rem.overdueCount ? ` (เลยกำหนด ${rem.overdueCount})` : ''} จากทั้งหมด ${rem.scheduledTotal} กำหนดการ`);
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
    <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-base">คัดลอกสรุป</h3><button data-close class="text-slate-500 min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <textarea class="input min-h-48 text-xs font-mono" readonly>${esc(text)}</textarea>
    <div class="flex justify-end mt-3"><button data-close class="btn btn-primary text-xs">ปิด</button></div>
  `);
}
