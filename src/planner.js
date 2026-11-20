import { setDoc, updateDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state } from './state.js';
import { isPreviewMode } from './preview.js';
import { TYPES } from './workoutConstants.js';
import { remindersForDate } from './reminders.js';
import { $, esc, fmtDate, localDateStr, parseLocal, addDays, isDateStr, toast, openModal, mondayOf } from './util.js';
import { iconSvg } from './icons.js';

const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const DEFAULT_ALT_ANCHOR = '2026-01-05'; // วันจันทร์อ้างอิงสำหรับสลับสัปดาห์ A / B
const DAY_PRESETS = [
  { key: 'mwfs', label: 'จ พ ศ อา', days: [0, 2, 4, 6] },
  { key: 'tts', label: 'อ พฤ ส', days: [1, 3, 5] },
  { key: 'all', label: 'ทุกวัน', days: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'wd', label: 'จ–ศ', days: [0, 1, 2, 3, 4] },
  { key: 'we', label: 'ส–อา', days: [5, 6] }
];

let root;
let goFn = () => {};
let selectedDate = localDateStr();
let shouldCenterStrip = true;
let docClickBound = false;

function weekdayIdx(dateStr) {
  return (parseLocal(dateStr).getDay() + 6) % 7; // 0 = จ ... 6 = อา
}

export function weekCodeForDate(dateStr, altAnchor = DEFAULT_ALT_ANCHOR) {
  const anchorMon = mondayOf(isDateStr(altAnchor) ? altAnchor : DEFAULT_ALT_ANCHOR);
  const targetMon = mondayOf(dateStr);
  const [ay, am, ad] = anchorMon.split('-').map(Number);
  const [ty, tm, td] = targetMon.split('-').map(Number);
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ay, am - 1, ad)) / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  return ((diffWeeks % 2) + 2) % 2 === 0 ? 'A' : 'B';
}

export function routineAppliesToDate(r, dateStr, altAnchor) {
  if (!r) return false;
  if (r.weekPattern === 'once') {
    return isDateStr(r.date) && r.date === dateStr;
  }
  if (!Array.isArray(r.days)) return false;
  if (!r.days.includes(weekdayIdx(dateStr))) return false;
  if (!r.weekPattern || r.weekPattern === 'every') return true;
  return r.weekPattern === weekCodeForDate(dateStr, altAnchor);
}

const ROUTINE_EMOJI_RULES = [
  [/ล้างจาน|จาน|ชาม|หม้อ|กระทะ|dish/i, '🍽️'],
  [/แก้ว|ขวด|tumbler|cup|mug/i, '🥤'],
  [/น้ำดื่ม|ดื่มน้ำ|กรอกน้ำ|water|hydrat/i, '💧'],
  [/หมา|แมว|สัตว์|ทรายแมว|pet|dog|cat/i, '🐾'],
  [/แปรงฟัน|ไหมขัดฟัน|ฟัน|brush|floss|teeth/i, '🪥'],
  [/อาบน้ำ|สระผม|shower|bath|hair/i, '🚿'],
  [/ครีม|กันแดด|สกินแคร์|เซรั่ม|มอยส์|ล้างหน้า|หน้า|skincare|sunscreen|cream/i, '🧴'],
  [/วิตามิน|ยา|อาหารเสริม|vitamin|pill|med/i, '💊'],
  [/ซักผ้า|พับผ้า|ตากผ้า|รีดผ้า|เสื้อผ้า|laundry|cloth/i, '🧺'],
  [/กวาด|ถูพื้น|ถูบ้าน|ดูดฝุ่น|จัดห้อง|จัดโต๊ะ|ทำความสะอาด|clean|sweep|mop|tidy/i, '🧹'],
  [/ขยะ|ทิ้งขยะ|trash|garbage/i, '🗑️'],
  [/ผ้าปู|ปลอกหมอน|ที่นอน|ผ้าห่ม|bed|sheet/i, '🛏️'],
  [/วิ่ง|เดิน|ก้าว|run|walk|jog/i, '🏃‍♀️'],
  [/โยคะ|ยืดเหยียด|สมาธิ|หายใจ|yoga|stretch|meditat/i, '🧘'],
  [/ออกกำลัง|เวท|ฟิตเนส|พิลาทิส|workout|gym|pilates|squat/i, '💪'],
  [/หนังสือ|อ่าน|เรียน|ภาษา|การบ้าน|read|study|book/i, '📚'],
  [/นอน|เข้านอน|พักผ่อน|sleep/i, '😴'],
  [/ต้นไม้|รดน้ำ|สวน|plant|garden/i, '🪴'],
  [/บัญชี|รายจ่าย|เงิน|ออม|budget|money|expense/i, '💸'],
  [/ทำอาหาร|กับข้าว|หุงข้าว|มื้อ|cook|meal/i, '🍳'],
  [/กาแฟ|ชา|มัทฉะ|coffee|tea/i, '☕'],
  [/ล้าง|ซัก|เช็ด|wash/i, '🧼']
];

export function inferRoutineEmoji(title = '', currentIcon = '') {
  const icon = String(currentIcon || '').trim();
  if (icon && icon !== '✨') return icon;
  const text = String(title || '').trim();
  if (!text) return '✨';
  for (const [pattern, emoji] of ROUTINE_EMOJI_RULES) {
    if (pattern.test(text)) return emoji;
  }
  return '✅';
}

// จัดอันดับกิจกรรมจากที่ทำบ่อยและล่าสุด (doneMap + recentDone)
export function getFrequentRecentRoutines(planner = {}, limit = 10) {
  const routines = Array.isArray(planner?.routines) ? planner.routines : [];
  const byId = new Map(routines.map(r => [r.id, r]));
  const doneMap = planner?.doneMap && typeof planner.doneMap === 'object' ? planner.doneMap : {};
  const recorded = Array.isArray(planner?.recentDone) ? planner.recentDone : [];

  const stats = new Map();
  const touch = (title, rawIcon, date, id = '') => {
    const clean = String(title || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    const icon = inferRoutineEmoji(clean, rawIcon);
    let entry = stats.get(key);
    if (!entry) {
      entry = { id, title: clean, icon, date: '', count: 0, dates: new Set() };
      stats.set(key, entry);
    } else if (icon !== '✅' && entry.icon === '✅') {
      entry.icon = icon;
    }
    if (isDateStr(date)) {
      if (!entry.dates.has(date)) {
        entry.dates.add(date);
        entry.count += 1;
      }
      if (!entry.date || date > entry.date) entry.date = date;
    } else if (entry.count === 0) {
      entry.count = 1;
    }
  };

  for (const d of Object.keys(doneMap).filter(isDateStr).sort((a, b) => b.localeCompare(a))) {
    const ids = Array.isArray(doneMap[d]) ? doneMap[d] : [];
    for (const id of ids) {
      const r = byId.get(id);
      if (r?.title) touch(r.title, r.icon, d, r.id);
    }
  }

  for (const item of recorded) {
    if (!item?.title) continue;
    touch(item.title, item.icon, isDateStr(item.date) ? item.date : '', item.id || '');
  }

  return [...stats.values()]
    .sort((a, b) => (b.count - a.count) || b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'th'))
    .slice(0, limit)
    .map(({ id, title, icon, date, count }) => ({ id, title, icon, date, count }));
}

export const getRecentCompletedRoutines = getFrequentRecentRoutines;

export function matchingDayPreset(daysSet) {
  const sorted = [...daysSet].sort((a, b) => a - b).join(',');
  return DAY_PRESETS.find(p => p.days.join(',') === sorted)?.key || 'custom';
}

export function resetPlannerToToday() {
  selectedDate = localDateStr();
  shouldCenterStrip = true;
}

function getPlanner() {
  const p = state.planner || {};
  return {
    routines: Array.isArray(p.routines) ? p.routines : [],
    doneMap: p.doneMap && typeof p.doneMap === 'object' ? p.doneMap : {},
    recentDone: Array.isArray(p.recentDone) ? p.recentDone : [],
    altAnchor: isDateStr(p.altAnchor) ? p.altAnchor : DEFAULT_ALT_ANCHOR
  };
}

async function savePlanner(next) {
  if (!state.uid) return;
  const today = localDateStr();
  const minKeep = addDays(today, -45);
  const maxKeep = addDays(today, 60);
  const pruneObj = obj => Object.fromEntries(
    Object.entries(obj || {}).filter(([d]) => d >= minKeep && d <= maxKeep)
  );
  const cur = getPlanner();
  const payload = {
    routines: (next.routines || []).slice(0, 80),
    doneMap: pruneObj(next.doneMap),
    recentDone: (Array.isArray(next.recentDone) ? next.recentDone : cur.recentDone).slice(0, 40),
    altAnchor: isDateStr(next.altAnchor) ? next.altAnchor : cur.altAnchor,
    updatedAt: new Date()
  };
  state.planner = { id: 'planner', ...payload };
  renderPlanner();
  if (isPreviewMode()) {
    window.dispatchEvent(new Event('trackme:data-change'));
    return;
  }
  try {
    setDoc(userDoc(state.uid, 'settings', 'planner'), payload)
      .catch(e => toast('บันทึก Planner ไม่สำเร็จ: ' + e.message, 'err'));
  } catch (e) {
    toast('บันทึก Planner ไม่สำเร็จ: ' + e.message, 'err');
  }
}

// Planner รวมเฉพาะ 2 กลุ่มงาน:
// (ก) ตารางออกกำลังกายที่วางแผนไว้ในวันนั้นๆ
// (ข) กิจกรรมประจำวัน/งานบ้านที่ตั้งค่าทำซ้ำได้ (ทั้งวันเดียว ทุกสัปดาห์ และสลับสัปดาห์ A/B อัตโนมัติ)
export function itemsForDate(dateStr) {
  const { routines, doneMap, altAnchor } = getPlanner();
  const doneSet = new Set(doneMap[dateStr] || []);

  const workouts = (state.workouts || [])
    .filter(w => w.date === dateStr)
    .map(w => ({
      kind: 'workout',
      id: w.id,
      title: `${TYPES[w.type] || w.type || 'ออกกำลังกาย'}${w.durationMin ? ` (${w.durationMin} นาที)` : ''}`,
      done: w.status !== 'planned',
      time: '',
      icon: '🏃‍♀️',
      sub: w.note || (w.sections ? `${Object.values(w.sections).reduce((a, r) => a + (r?.length || 0), 0)} ท่า` : '')
    }));

  const dayRoutines = routines
    .filter(r => routineAppliesToDate(r, dateStr, altAnchor))
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
    .map(r => ({
      kind: 'routine',
      id: r.id,
      title: r.title,
      done: doneSet.has(r.id),
      time: r.time || '',
      icon: inferRoutineEmoji(r.title, r.icon),
      weekPattern: r.weekPattern || 'every',
      date: r.date || '',
      sub: r.weekPattern === 'once'
        ? 'เฉพาะวันนี้'
        : r.weekPattern === 'A'
          ? 'สลับสัปดาห์ (รอบ A)'
          : r.weekPattern === 'B'
            ? 'สลับสัปดาห์ (รอบ B)'
            : 'กิจกรรมประจำสัปดาห์'
    }));

  return [...workouts, ...dayRoutines];
}

function renderDayReminderBanner(dateStr) {
  const dayReminders = remindersForDate(dateStr);
  if (!dayReminders.length) return '';
  return `
    <div class="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div class="flex flex-wrap items-center gap-1.5 min-w-0">
        <span class="font-bold text-amber-900">🔔 นัดหมาย/เตือนวันนี้:</span>
        ${dayReminders.map(r => `
          <button type="button" data-pl-go="remind" class="inline-flex items-center gap-1 rounded-lg bg-white border border-amber-200 px-2 py-0.5 text-amber-950 font-medium hover:bg-amber-100/60">
            <span>${r.icon}</span>
            ${r.dueTime ? `<span class="text-rose-700 font-semibold">${esc(r.dueTime)} น.</span>` : ''}
            <span class="truncate max-w-[180px]">${esc(r.label)}</span>
          </button>`).join('')}
      </div>
      <button type="button" data-pl-go="notifications" class="text-[11px] font-semibold text-amber-800 underline shrink-0">ดูแจ้งเตือน</button>
    </div>`;
}

export function mountPlanner(el, navigate) {
  root = el;
  goFn = navigate || (() => {});

  if (!docClickBound && typeof document !== 'undefined') {
    docClickBound = true;
    document.addEventListener('click', e => {
      const menu = root?.isConnected ? $('#pl-plan-menu', root) : null;
      if (menu?.open && !menu.contains(e.target)) {
        menu.open = false;
      }
    });
  }

  root.addEventListener('click', async e => {
    const menu = $('#pl-plan-menu', root);
    const closePlanMenu = () => {
      if (menu) menu.open = false;
    };

    if (e.target.closest('[data-pl-flip-parity]')) {
      const p = getPlanner();
      const nextAnchor = p.altAnchor === '2026-01-05' ? '2026-01-12' : '2026-01-05';
      await savePlanner({ ...p, altAnchor: nextAnchor });
      toast('สลับรอบสัปดาห์ A ↔ B แล้ว');
      return;
    }

    const dayBtn = e.target.closest('[data-pl-day]');
    if (dayBtn) {
      selectedDate = dayBtn.dataset.plDay;
      renderPlanner();
      return;
    }

    if (e.target.closest('[data-pl-routines]')) {
      closePlanMenu();
      openRoutinesModal({ initialDate: selectedDate });
      return;
    }

    const goBtn = e.target.closest('[data-pl-go]');
    if (goBtn) {
      closePlanMenu();
      goFn(goBtn.dataset.plGo);
      return;
    }

    const editW = e.target.closest('[data-pl-edit-workout]');
    if (editW) {
      goFn('workout', 'w-date');
      return;
    }
  });

  root.addEventListener('change', async e => {
    const chk = e.target.closest('[data-pl-toggle]');
    if (!chk) return;
    const [kind, d, id] = chk.dataset.plToggle.split(':');
    const checked = chk.checked;

    if (kind === 'workout') {
      if (isPreviewMode()) {
        state.workouts = (state.workouts || []).map(w => w.id === id ? { ...w, status: checked ? 'done' : 'planned' } : w);
        renderPlanner();
        window.dispatchEvent(new Event('trackme:data-change'));
        toast(checked ? 'เช็กออกกำลังกายเสร็จแล้ว (โหมดดูตัวอย่าง)' : 'เปลี่ยนกลับเป็นวางแผนไว้');
        return;
      }
      try {
        updateDoc(userDoc(state.uid, 'workout_records', id), {
          status: checked ? 'done' : 'planned',
          updatedAt: new Date()
        }).catch(err => {
          chk.checked = !checked;
          toast('อัปเดตไม่สำเร็จ: ' + err.message, 'err');
        });
        toast(checked ? 'เช็กออกกำลังกายเสร็จแล้ว 💪' : 'เปลี่ยนกลับเป็นวางแผนไว้');
      } catch (err) {
        chk.checked = !checked;
        toast('อัปเดตไม่สำเร็จ: ' + err.message, 'err');
      }
      return;
    }

    if (kind === 'routine') {
      const p = getPlanner();
      const cur = new Set(p.doneMap[d] || []);
      if (checked) cur.add(id);
      else cur.delete(id);
      const doneMap = { ...p.doneMap };
      if (cur.size) doneMap[d] = [...cur];
      else delete doneMap[d];

      let recentDone = [...(p.recentDone || [])];
      const matchedRoutine = p.routines.find(r => r.id === id);
      if (checked && matchedRoutine) {
        const cleanTitle = String(matchedRoutine.title || '').trim();
        recentDone = [
          {
            id: matchedRoutine.id,
            title: cleanTitle,
            icon: inferRoutineEmoji(cleanTitle, matchedRoutine.icon),
            date: d
          },
          ...recentDone.filter(x => String(x?.title || '').trim().toLowerCase() !== cleanTitle.toLowerCase())
        ].slice(0, 40);
      } else if (!checked) {
        recentDone = recentDone.filter(x => !(x?.id === id && x?.date === d));
      }
      await savePlanner({ ...p, doneMap, recentDone });
    }
  });

  renderPlanner();
}

function renderTaskListHtml(dateStr) {
  const items = itemsForDate(dateStr);
  const rowsHtml = items.length
    ? items.map(it => {
        const key = `${it.kind}:${dateStr}:${it.id}`;
        const kindBadge = it.kind === 'workout'
          ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-medium ${it.done ? 'bg-ok-soft text-green-800' : 'bg-amber-100 text-amber-800'}">${it.done ? 'ออกกำลังกายแล้ว' : 'แผนออกกำลังกาย'}</span>`
          : `<span class="text-[10px] px-1.5 py-0.5 rounded ${it.weekPattern === 'once' ? 'bg-emerald-100 text-emerald-800 font-semibold' : it.weekPattern === 'A' ? 'bg-sky-soft text-blue-800 font-semibold' : it.weekPattern === 'B' ? 'bg-amber-100 text-amber-900 font-semibold' : 'bg-lav-soft text-brand-dark'}">${esc(it.sub)}</span>`;
        return `<label class="flex items-start justify-between gap-2 rounded-xl border ${it.done ? 'border-slate-100 bg-slate-50/70 opacity-80' : 'border-lav-soft/70 bg-white'} px-3 py-2.5 cursor-pointer transition hover:border-brand/40 min-h-[44px]">
          <span class="flex items-start gap-2.5 min-w-0 flex-1">
            <input type="checkbox" class="mt-0.5 w-4 h-4 accent-violet-500 rounded shrink-0" data-pl-toggle="${esc(key)}" ${it.done ? 'checked' : ''}>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-1.5">
                <span class="text-sm font-medium ${it.done ? 'line-through text-slate-500' : 'text-slate-800'}">${it.icon} ${esc(it.title)}</span>
                ${it.time ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-soft text-blue-700 tabular-nums">${esc(it.time)} น.</span>` : ''}
                ${kindBadge}
              </span>
              ${it.sub && it.kind === 'workout' ? `<span class="block text-[11px] text-slate-500 mt-0.5">${esc(it.sub)}</span>` : ''}
            </span>
          </span>
          <span class="flex items-center gap-1 shrink-0">
            ${it.kind === 'workout' ? `<button type="button" data-pl-edit-workout="${esc(it.id)}" class="min-h-[32px] text-[11px] text-brand-dark underline px-1.5 rounded-lg">ดูแผน</button>` : ''}
          </span>
        </label>`;
      }).join('')
    : `<p class="text-xs text-slate-500 text-center py-3 rounded-xl bg-slate-50/70">ยังไม่มีแผนออกกำลังกายหรือกิจกรรมในวัน${WEEKDAYS[weekdayIdx(dateStr)]}</p>`;

  return `
    ${renderDayReminderBanner(dateStr)}
    <div class="space-y-2">${rowsHtml}</div>`;
}

export function renderPlanner() {
  if (!root) return;
  const prevStripScroll = $('#pl-day-strip', root)?.scrollLeft ?? null;
  const p = getPlanner();
  const today = localDateStr();
  if (!isDateStr(selectedDate)) selectedDate = today;

  const baseMonday = mondayOf(today);
  const startDay = addDays(baseMonday, -14);
  const endDay = addDays(baseMonday, 34);
  const stripStart = selectedDate < startDay ? mondayOf(selectedDate) : startDay;
  const stripEnd = selectedDate > endDay ? addDays(mondayOf(selectedDate), 6) : endDay;

  const stripDays = [];
  for (let d = stripStart; d <= stripEnd; d = addDays(d, 1)) {
    const items = itemsForDate(d);
    const done = items.filter(x => x.done).length;
    const remCount = remindersForDate(d).length;
    stripDays.push({ date: d, wd: WEEKDAYS[weekdayIdx(d)], items, done, remCount });
  }

  const weekCode = weekCodeForDate(selectedDate, p.altAnchor);
  const hasAlternating = p.routines.some(r => r.weekPattern === 'A' || r.weekPattern === 'B');
  const routinesCount = p.routines.length;
  const selectedItems = itemsForDate(selectedDate);
  const selectedDone = selectedItems.filter(x => x.done).length;

  const stripHtml = `
    <div id="pl-day-strip" class="pl-day-strip tabular-nums" role="listbox" aria-label="เลือกวันในแผน">
      ${stripDays.map(m => {
        const isSel = m.date === selectedDate;
        const isToday = m.date === today;
        const allDone = m.items.length > 0 && m.done === m.items.length;
        return `<button type="button" data-pl-day="${m.date}" role="option" aria-selected="${isSel}" aria-label="${esc(fmtDate(m.date))}" class="pl-day-pill relative flex flex-col items-center justify-center rounded-xl border py-2 px-0.5 min-h-[56px] text-xs transition ${
          isSel ? 'bg-brand text-white border-brand shadow-sm'
            : isToday ? 'bg-white border-brand/60 text-brand-dark font-semibold hover:bg-lav-soft/60'
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
        }">
          ${m.remCount ? `<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${isSel ? 'bg-amber-200' : 'bg-amber-500'}" title="มีนัดหมาย/แจ้งเตือน ${m.remCount} รายการ"></span>` : ''}
          <span class="text-[11px] opacity-85">${m.wd}</span>
          <span class="text-sm font-bold leading-tight">${Number(m.date.slice(8))}</span>
          <span class="text-[10px] mt-0.5 ${isSel ? 'text-white/95' : allDone ? 'text-emerald-700 font-semibold' : 'text-slate-500'}">
            ${m.items.length ? `${m.done}/${m.items.length}` : '·'}
          </span>
        </button>`;
      }).join('')}
    </div>`;

  root.innerHTML = `
  <section class="card space-y-3.5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-base sm:text-lg font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('planner', { size: 18, className: 'text-brand' })}<span>Weekly Planner</span></h2>
        <p class="text-xs text-slate-500 tabular-nums">${esc(fmtDate(selectedDate))} · เสร็จแล้ว ${selectedDone}/${selectedItems.length} รายการ</p>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        ${hasAlternating ? `<span class="chip ${weekCode === 'A' ? 'bg-sky-soft text-blue-800' : 'bg-amber-100 text-amber-900'} text-xs font-bold">รอบ ${weekCode}</span>
        <button type="button" data-pl-flip-parity class="chip min-h-[36px] bg-white border border-slate-200 text-slate-600 text-xs" title="สลับให้สัปดาห์นี้เป็น A หรือ B">${iconSvg('cycle', { size: 13 })} สลับ A↔B</button>` : ''}
        <details id="pl-plan-menu" class="relative">
          <summary class="chip bg-lav-soft text-brand-dark min-h-[36px] whitespace-nowrap list-none cursor-pointer font-semibold">${iconSvg('ellipsis', { size: 14 })} วางแผน</summary>
          <div class="tm-tools-menu absolute right-0 top-full z-20 mt-2 flex min-w-48 flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
            <button type="button" data-pl-routines class="chip justify-start bg-lav-soft text-brand-dark min-h-[40px]">${iconSvg('repeat', { size: 14 })} กิจกรรม (${routinesCount})</button>
            <button type="button" data-pl-go="workout" class="chip justify-start bg-sky-soft text-blue-700 min-h-[40px]">${iconSvg('workout', { size: 14 })} ออกกำลังกาย</button>
            <button type="button" data-pl-go="remind" class="chip justify-start bg-amber-100 text-amber-900 min-h-[40px]">${iconSvg('pin', { size: 14 })} นัดหมาย</button>
          </div>
        </details>
      </div>
    </div>

    ${!routinesCount ? `<div class="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
      <span>💡 ตั้งกิจกรรมประจำสัปดาห์หรือตารางสลับสัปดาห์อัตโนมัติ (เช่น สัปดาห์ A จ-พ-ศ-อา / สัปดาห์ B อ-พฤ-ส) ครั้งเดียวใช้ได้ยาว</span>
      <button type="button" data-pl-routines class="chip min-h-[36px] bg-white border border-amber-300 text-amber-900 font-semibold">ตั้งค่าเลย</button>
    </div>` : ''}

    <div class="space-y-2.5">
      ${stripHtml}
      <div class="rounded-2xl border border-lav-soft/80 bg-slate-50/40 p-3 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2 tabular-nums">
          <span class="text-sm font-bold text-slate-800">วัน${WEEKDAYS[weekdayIdx(selectedDate)]} · ${esc(fmtDate(selectedDate))}${selectedDate === today ? ' <span class="text-[10px] px-1.5 py-0.5 rounded bg-brand text-white ml-1">วันนี้</span>' : ''}</span>
          <span class="text-xs text-slate-500">${selectedDone}/${selectedItems.length} เสร็จ</span>
        </div>
        ${renderTaskListHtml(selectedDate)}
      </div>
    </div>
  </section>`;

  const stripEl = $('#pl-day-strip', root);
  if (stripEl) {
    if (shouldCenterStrip || prevStripScroll === null) {
      shouldCenterStrip = false;
      const activeEl = stripEl.querySelector(`[data-pl-day="${selectedDate}"]`);
      if (activeEl) {
        stripEl.scrollLeft = Math.max(0, activeEl.offsetLeft - Math.max(0, (stripEl.clientWidth - activeEl.offsetWidth) / 2));
      }
    } else {
      stripEl.scrollLeft = prevStripScroll;
    }
  }
}

function openRoutinesModal(opts = {}) {
  let editingId = null;
  let editingLegacyTime = '';
  let pickedDays = new Set([0, 2, 4, 6]);
  let pickedIcon = '✨';
  let pickedPattern = opts.initialPattern === 'once' ? 'once' : 'every';
  let showCustomDays = false;
  const defaultOnceDate = isDateStr(opts.initialDate) ? opts.initialDate : (selectedDate || localDateStr());
  const curWeekCode = weekCodeForDate(localDateStr(), getPlanner().altAnchor);

  const frequentRoutines = getFrequentRecentRoutines(getPlanner(), 10);
  const m = openModal(`
    <div class="flex justify-between items-center mb-3">
      <h3 class="font-bold text-lg text-slate-800 inline-flex items-center gap-1.5">${iconSvg('repeat', { size: 18, className: 'text-brand' })}<span>เพิ่มกิจกรรม</span></h3>
      <button data-close class="min-w-[36px] min-h-[36px] rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <p class="text-xs text-slate-500 mb-3">รองรับรูปแบบ<b>วันเดียว</b>, <b>ทุกสัปดาห์</b> และ<b>สลับสัปดาห์ A ↔ B</b> (สัปดาห์นี้คือ <b>รอบ ${curWeekCode}</b>)</p>

    <div class="rounded-2xl bg-slate-50 border border-slate-200 p-3 space-y-3 mb-4">
      ${frequentRoutines.length ? `
      <div class="flex flex-wrap gap-1.5">
        ${frequentRoutines.map(item => `<button type="button" data-rt-preset="${esc(item.icon + '|' + item.title)}" class="chip bg-sky-soft/70 border border-sky-200 text-slate-700 text-xs hover:bg-sky-soft">${item.icon} ${esc(item.title)}</button>`).join('')}
      </div>` : ''}
      <div>
        <label class="lbl">ชื่อกิจกรรม *</label>
        <div class="flex items-center gap-2">
          <span id="rt-icon-badge" class="w-10 h-10 shrink-0 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-lg" title="อิโมจิของกิจกรรม">✨</span>
          <input id="rt-title" class="input flex-1" placeholder="เช่น ล้างจาน, ออกกำลังกาย, ส่งพัสดุวันนี้">
        </div>
      </div>
      <div>
        <label class="lbl">รูปแบบ</label>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5" id="rt-pattern-bar">
          <button type="button" data-rt-pat="every" class="py-1.5 px-2 rounded-xl border text-xs font-semibold">ทุกสัปดาห์</button>
          <button type="button" data-rt-pat="A" class="py-1.5 px-2 rounded-xl border text-xs font-semibold">เฉพาะสัปดาห์ A</button>
          <button type="button" data-rt-pat="B" class="py-1.5 px-2 rounded-xl border text-xs font-semibold">เฉพาะสัปดาห์ B</button>
          <button type="button" data-rt-pat="once" class="py-1.5 px-2 rounded-xl border text-xs font-semibold">วันเดียว</button>
        </div>
      </div>
      <div id="rt-once-wrap" class="hidden space-y-1">
        <label class="lbl">เลือกวันที่ทำ (แสดงเฉพาะวันนี้วันเดียว ไม่ทำซ้ำ)</label>
        <input id="rt-once-date" type="date" class="input sm:max-w-xs" value="${esc(defaultOnceDate)}">
      </div>
      <div id="rt-days-wrap" class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <label class="lbl !mb-0">ทำซ้ำทุกวันไหนบ้าง?</label>
          <div class="flex flex-wrap gap-1.5" id="rt-day-presets">
            ${DAY_PRESETS.map(p => `<button type="button" data-rt-days="${p.key}" class="px-2 py-1 rounded-lg border text-[11px] font-semibold transition">${p.label}</button>`).join('')}
            <button type="button" data-rt-days="custom" class="px-2 py-1 rounded-lg border text-[11px] font-semibold transition">เลือกวันเอง</button>
          </div>
        </div>
        <div id="rt-days" class="grid grid-cols-7 gap-1 hidden"></div>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button type="button" id="rt-cancel-edit" class="btn btn-ghost hidden text-xs">ยกเลิกแก้ไข</button>
        <button type="button" id="rt-create-pair" class="btn btn-sky text-xs" title="สร้างรอบสัปดาห์ A ตามวันที่เลือก และสร้างรอบ B เป็นวันที่เหลือให้อัตโนมัติ">${iconSvg('swap', { size: 14 })} สร้างคู่สลับ A ↔ B</button>
        <button type="button" id="rt-save" class="btn btn-primary text-xs">${iconSvg('plus', { size: 14 })} เพิ่มกิจกรรม</button>
      </div>
    </div>

    <div id="rt-list" class="space-y-2 max-h-64 overflow-y-auto pr-1"></div>
  `, { wide: true });

  const renderDays = () => {
    const activePreset = showCustomDays ? 'custom' : matchingDayPreset(pickedDays);
    m.el.querySelectorAll('[data-rt-days]').forEach(btn => {
      const active = btn.dataset.rtDays === activePreset;
      btn.className = `px-2 py-1 rounded-lg border text-[11px] font-semibold transition ${
        active
          ? 'bg-brand text-white border-brand'
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
      }`;
    });
    const daysEl = $('#rt-days', m.el);
    if (!daysEl) return;
    daysEl.classList.toggle('hidden', !showCustomDays);
    daysEl.innerHTML = WEEKDAYS.map((wd, idx) => `
      <button type="button" data-rt-d="${idx}" class="py-1.5 rounded-xl border text-xs font-semibold ${pickedDays.has(idx) ? 'bg-brand text-white border-brand' : 'bg-white border-slate-200 text-slate-600'}">${wd}</button>
    `).join('');
  };

  const renderPattern = () => {
    const isOnce = pickedPattern === 'once';
    m.el.querySelectorAll('[data-rt-pat]').forEach(btn => {
      const active = btn.dataset.rtPat === pickedPattern;
      btn.className = `py-1.5 px-2 rounded-xl border text-xs font-semibold transition ${
        active
          ? (pickedPattern === 'A' ? 'bg-sky-500 text-white border-sky-500'
            : pickedPattern === 'B' ? 'bg-amber-500 text-white border-amber-500'
            : pickedPattern === 'once' ? 'bg-emerald-600 text-white border-emerald-600'
            : 'bg-brand text-white border-brand')
          : 'bg-white border-slate-200 text-slate-600'
      }`;
    });
    $('#rt-once-wrap', m.el)?.classList.toggle('hidden', !isOnce);
    $('#rt-days-wrap', m.el)?.classList.toggle('hidden', isOnce);
    $('#rt-create-pair', m.el)?.classList.toggle('hidden', isOnce || Boolean(editingId));
  };

  const renderList = () => {
    const list = getPlanner().routines;
    $('#rt-list', m.el).innerHTML = list.length ? list.map(r => {
      const icon = inferRoutineEmoji(r.title, r.icon);
      const patBadge = r.weekPattern === 'once'
        ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">เฉพาะวันเดียว</span>'
        : r.weekPattern === 'A'
          ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-soft text-blue-800 font-bold">สัปดาห์ A</span>'
          : r.weekPattern === 'B'
            ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">สัปดาห์ B</span>'
            : '';
      const schedDesc = r.weekPattern === 'once'
        ? `📅 ${r.date ? fmtDate(r.date) : '-'} (ไม่ทำซ้ำ)`
        : ((r.days || []).length === 7 ? 'ทุกวัน' : (r.days || []).map(d => WEEKDAYS[d]).join(', '));
      return `
      <div class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <div class="min-w-0">
          <p class="font-semibold text-slate-800 truncate">${icon} ${esc(r.title)} ${patBadge} ${r.time ? `<span class="text-xs font-normal text-blue-700 bg-sky-soft px-1.5 py-0.5 rounded tabular-nums">${esc(r.time)}</span>` : ''}</p>
          <p class="text-[11px] text-slate-500">${esc(schedDesc)}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button type="button" data-rt-edit="${esc(r.id)}" class="chip min-h-[34px] bg-sky-soft text-blue-700 text-xs">แก้</button>
          <button type="button" data-rt-del="${esc(r.id)}" class="chip min-h-[34px] bg-pink-soft text-rose-600 text-xs">ลบ</button>
        </div>
      </div>`;
    }).join('')
      : '<p class="text-xs text-slate-500 text-center py-4">ยังไม่มีกิจกรรมที่ตั้งไว้</p>';
  };

  const syncIconBadge = (titleVal = '') => {
    const badge = $('#rt-icon-badge', m.el);
    if (badge) badge.textContent = inferRoutineEmoji(titleVal, pickedIcon);
  };

  const resetEdit = () => {
    editingId = null;
    editingLegacyTime = '';
    pickedIcon = '✨';
    pickedPattern = opts.initialPattern === 'once' ? 'once' : 'every';
    pickedDays = new Set([0, 2, 4, 6]);
    showCustomDays = false;
    $('#rt-title', m.el).value = '';
    $('#rt-once-date', m.el).value = defaultOnceDate;
    $('#rt-save', m.el).innerHTML = `${iconSvg('plus', { size: 14 })} เพิ่มกิจกรรม`;
    $('#rt-cancel-edit', m.el).classList.add('hidden');
    syncIconBadge('');
    renderPattern();
    renderDays();
  };

  $('#rt-title', m.el).addEventListener('input', e => {
    pickedIcon = '✨';
    syncIconBadge(e.target.value);
  });

  m.el.addEventListener('click', async e => {
    const preset = e.target.closest('[data-rt-preset]');
    if (preset) {
      const [ic, title] = preset.dataset.rtPreset.split('|');
      pickedIcon = inferRoutineEmoji(title, ic);
      $('#rt-title', m.el).value = title;
      syncIconBadge(title);
      $('#rt-title', m.el).focus();
      return;
    }

    const patBtn = e.target.closest('[data-rt-pat]');
    if (patBtn) {
      pickedPattern = patBtn.dataset.rtPat;
      renderPattern();
      return;
    }

    const dayPreset = e.target.closest('[data-rt-days]');
    if (dayPreset) {
      const v = dayPreset.dataset.rtDays;
      if (v === 'custom') {
        showCustomDays = true;
      } else {
        const found = DAY_PRESETS.find(p => p.key === v);
        if (found) pickedDays = new Set(found.days);
        showCustomDays = false;
      }
      renderDays();
      return;
    }

    const dBtn = e.target.closest('[data-rt-d]');
    if (dBtn) {
      const d = Number(dBtn.dataset.rtD);
      if (pickedDays.has(d)) pickedDays.delete(d);
      else pickedDays.add(d);
      showCustomDays = true;
      renderDays();
      return;
    }

    const editBtn = e.target.closest('[data-rt-edit]');
    if (editBtn) {
      const r = getPlanner().routines.find(x => x.id === editBtn.dataset.rtEdit);
      if (!r) return;
      editingId = r.id;
      editingLegacyTime = r.time || '';
      pickedIcon = inferRoutineEmoji(r.title, r.icon);
      pickedPattern = r.weekPattern || 'every';
      pickedDays = new Set(r.days || []);
      showCustomDays = matchingDayPreset(pickedDays) === 'custom';
      $('#rt-title', m.el).value = r.title;
      if (isDateStr(r.date)) $('#rt-once-date', m.el).value = r.date;
      syncIconBadge(r.title);
      $('#rt-save', m.el).innerHTML = `${iconSvg('save', { size: 14 })} บันทึกการแก้ไข`;
      $('#rt-cancel-edit', m.el).classList.remove('hidden');
      renderPattern();
      renderDays();
      return;
    }

    const delBtn = e.target.closest('[data-rt-del]');
    if (delBtn) {
      const p = getPlanner();
      const routines = p.routines.filter(x => x.id !== delBtn.dataset.rtDel);
      if (editingId === delBtn.dataset.rtDel) resetEdit();
      await savePlanner({ ...p, routines });
      renderList();
    }
  });

  $('#rt-cancel-edit', m.el).addEventListener('click', resetEdit);

  $('#rt-create-pair', m.el).addEventListener('click', async () => {
    const title = $('#rt-title', m.el).value.trim().slice(0, 80);
    const daysA = [...pickedDays].sort((a, b) => a - b);
    if (!title) return toast('กรอกชื่อกิจกรรมก่อนค่ะ', 'err');
    if (daysA.length === 0 || daysA.length === 7) return toast('เลือกวัน 1–6 วัน เพื่อให้สัปดาห์ B สลับเป็นวันที่เหลืออัตโนมัติ', 'err');
    const daysB = [0, 1, 2, 3, 4, 5, 6].filter(d => !pickedDays.has(d));
    const p = getPlanner();
    const baseId = Date.now().toString(36);
    const icon = inferRoutineEmoji(title, pickedIcon);
    const recA = { id: 'ra' + baseId, title, days: daysA, weekPattern: 'A', icon };
    const recB = { id: 'rb' + baseId, title, days: daysB, weekPattern: 'B', icon };
    await savePlanner({ ...p, routines: [...p.routines, recA, recB] });
    toast(`สร้างคู่สลับ "${title}" (A: ${daysA.map(d => WEEKDAYS[d]).join('/')} · B: ${daysB.map(d => WEEKDAYS[d]).join('/')}) แล้ว`);
    resetEdit();
    renderList();
  });

  $('#rt-save', m.el).addEventListener('click', async () => {
    const title = $('#rt-title', m.el).value.trim().slice(0, 80);
    if (!title) return toast('กรอกชื่อกิจกรรมก่อนค่ะ', 'err');

    let days = [...pickedDays].sort((a, b) => a - b);
    let onceDate = '';
    if (pickedPattern === 'once') {
      onceDate = $('#rt-once-date', m.el).value;
      if (!isDateStr(onceDate)) return toast('กรุณาเลือกวันที่ที่ต้องการทำกิจกรรมนี้', 'err');
      days = [weekdayIdx(onceDate)];
    } else if (!days.length) {
      return toast('เลือกวันอย่างน้อย 1 วัน', 'err');
    }

    const p = getPlanner();
    const icon = inferRoutineEmoji(title, pickedIcon);
    const rec = {
      id: editingId || ('r' + Date.now().toString(36)),
      title,
      days,
      icon,
      ...(pickedPattern !== 'every' && { weekPattern: pickedPattern }),
      ...(pickedPattern === 'once' && { date: onceDate }),
      ...(editingLegacyTime && { time: editingLegacyTime })
    };
    const routines = editingId
      ? p.routines.map(x => (x.id === editingId ? rec : x))
      : [...p.routines, rec];

    await savePlanner({ ...p, routines });
    toast(editingId ? 'แก้ไขกิจกรรมแล้ว' : pickedPattern === 'once' ? `เพิ่มกิจกรรมเฉพาะวันที่ ${fmtDate(onceDate)} แล้ว` : 'เพิ่มกิจกรรมแล้ว');
    resetEdit();
    renderList();
  });

  renderPattern();
  renderDays();
  renderList();
}
