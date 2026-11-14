import { setDoc, updateDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state } from './state.js';
import { TYPES } from './workout.js';
import { remindersForDate } from './reminders.js';
import { $, esc, fmtDate, localDateStr, parseLocal, addDays, isDateStr, toast, openModal } from './util.js';

const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const DEFAULT_ALT_ANCHOR = '2026-01-05'; // วันจันทร์อ้างอิงสำหรับสลับสัปดาห์ A / B
const ROUTINE_PRESETS = [
  ['🍽️', 'ล้างจาน'],
  ['💪', 'ออกกำลังกายตามแผน'],
  ['🥤', 'ล้างแก้ว'],
  ['💧', 'เติมน้ำดื่ม'],
  ['🐾', 'เติมน้ำ/อาหารสัตว์เลี้ยง'],
  ['🧴', 'ทาครีมบำรุง / กันแดด'],
  ['💊', 'กินวิตามิน / ยา'],
  ['🧺', 'ซัก/พับผ้า'],
  ['🧹', 'กวาด/จัดห้อง']
];

let root;
let goFn = () => {};
let weekOffset = 0; // 0 = สัปดาห์นี้, 1 = สัปดาห์ถัดไป
let viewMode = 'day'; // 'day' | 'week'
let selectedDate = localDateStr();

function mondayOf(dateStr) {
  const dt = parseLocal(dateStr || localDateStr());
  const offset = (dt.getDay() + 6) % 7;
  return addDays(localDateStr(dt), -offset);
}

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
  if (!r || !Array.isArray(r.days)) return false;
  if (!r.days.includes(weekdayIdx(dateStr))) return false;
  if (!r.weekPattern || r.weekPattern === 'every') return true;
  return r.weekPattern === weekCodeForDate(dateStr, altAnchor);
}

function getPlanner() {
  const p = state.planner || {};
  return {
    routines: Array.isArray(p.routines) ? p.routines : [],
    doneMap: p.doneMap && typeof p.doneMap === 'object' ? p.doneMap : {},
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
    routines: (next.routines || []).slice(0, 60),
    doneMap: pruneObj(next.doneMap),
    altAnchor: isDateStr(next.altAnchor) ? next.altAnchor : cur.altAnchor,
    updatedAt: new Date()
  };
  state.planner = { id: 'planner', ...payload };
  renderPlanner();
  try {
    await setDoc(userDoc(state.uid, 'settings', 'planner'), payload);
  } catch (e) {
    toast('บันทึก Planner ไม่สำเร็จ: ' + e.message, 'err');
  }
}

// Planner รวมเฉพาะ 2 กลุ่มงาน:
// (ก) ตารางออกกำลังกายที่วางแผนไว้ในวันนั้นๆ
// (ข) กิจวัตรประจำวัน/งานบ้านที่ตั้งค่าทำซ้ำได้ (ทั้งทุกสัปดาห์ และสลับสัปดาห์ A/B อัตโนมัติ)
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
      icon: r.icon || '✨',
      weekPattern: r.weekPattern || 'every',
      sub: r.weekPattern === 'A' ? 'สลับสัปดาห์ (รอบ A)' : r.weekPattern === 'B' ? 'สลับสัปดาห์ (รอบ B)' : 'กิจวัตรประจำสัปดาห์'
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

  root.addEventListener('click', async e => {
    const stepBtn = e.target.closest('[data-pl-step]');
    if (stepBtn) {
      weekOffset = Math.max(-8, Math.min(12, weekOffset + (Number(stepBtn.dataset.plStep) || 0)));
      const mon = addDays(mondayOf(localDateStr()), weekOffset * 7);
      const sun = addDays(mon, 6);
      const today = localDateStr();
      selectedDate = today >= mon && today <= sun ? today : mon;
      renderPlanner();
      return;
    }

    const wkBtn = e.target.closest('[data-pl-week]');
    if (wkBtn) {
      weekOffset = Number(wkBtn.dataset.plWeek) || 0;
      const mon = addDays(mondayOf(localDateStr()), weekOffset * 7);
      const sun = addDays(mon, 6);
      const today = localDateStr();
      selectedDate = today >= mon && today <= sun ? today : mon;
      renderPlanner();
      return;
    }

    if (e.target.closest('[data-pl-flip-parity]')) {
      const p = getPlanner();
      const nextAnchor = p.altAnchor === '2026-01-05' ? '2026-01-12' : '2026-01-05';
      await savePlanner({ ...p, altAnchor: nextAnchor });
      toast('สลับรอบสัปดาห์ A ↔ B แล้ว');
      return;
    }

    const modeBtn = e.target.closest('[data-pl-mode]');
    if (modeBtn) {
      viewMode = modeBtn.dataset.plMode === 'week' ? 'week' : 'day';
      renderPlanner();
      return;
    }

    const dayBtn = e.target.closest('[data-pl-day]');
    if (dayBtn) {
      selectedDate = dayBtn.dataset.plDay;
      renderPlanner();
      return;
    }

    if (e.target.closest('[data-pl-routines]')) {
      openRoutinesModal();
      return;
    }

    const goBtn = e.target.closest('[data-pl-go]');
    if (goBtn) {
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
      try {
        await updateDoc(userDoc(state.uid, 'workout_records', id), {
          status: checked ? 'done' : 'planned',
          updatedAt: new Date()
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
      await savePlanner({ ...p, doneMap });
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
          : `<span class="text-[10px] px-1.5 py-0.5 rounded ${it.weekPattern === 'A' ? 'bg-sky-soft text-blue-800 font-semibold' : it.weekPattern === 'B' ? 'bg-amber-100 text-amber-900 font-semibold' : 'bg-lav-soft text-brand-dark'}">${esc(it.sub)}</span>`;
        return `<label class="flex items-start justify-between gap-2 rounded-xl border ${it.done ? 'border-slate-100 bg-slate-50/70 opacity-75' : 'border-lav-soft/70 bg-white'} px-3 py-2.5 cursor-pointer transition hover:border-brand/40">
          <span class="flex items-start gap-2.5 min-w-0 flex-1">
            <input type="checkbox" class="mt-0.5 w-4 h-4 accent-violet-500 rounded shrink-0" data-pl-toggle="${esc(key)}" ${it.done ? 'checked' : ''}>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-1.5">
                <span class="text-sm font-medium ${it.done ? 'line-through text-slate-400' : 'text-slate-800'}">${it.icon} ${esc(it.title)}</span>
                ${it.time ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-soft text-blue-700">${esc(it.time)} น.</span>` : ''}
                ${kindBadge}
              </span>
              ${it.sub && it.kind === 'workout' ? `<span class="block text-[11px] text-slate-500 mt-0.5">${esc(it.sub)}</span>` : ''}
            </span>
          </span>
          <span class="flex items-center gap-1 shrink-0">
            ${it.kind === 'workout' ? `<button type="button" data-pl-edit-workout="${esc(it.id)}" class="text-[11px] text-brand-dark underline px-1">ดูแผน</button>` : ''}
          </span>
        </label>`;
      }).join('')
    : `<p class="text-xs text-slate-400 text-center py-3 rounded-xl bg-slate-50/70">ยังไม่มีแผนออกกำลังกายหรือกิจวัตรในวัน${WEEKDAYS[weekdayIdx(dateStr)]}</p>`;

  return `
    ${renderDayReminderBanner(dateStr)}
    <div class="space-y-2">${rowsHtml}</div>`;
}

export function renderPlanner() {
  if (!root) return;
  const p = getPlanner();
  const today = localDateStr();
  const baseMonday = mondayOf(today);
  const mon = addDays(baseMonday, weekOffset * 7);
  const sun = addDays(mon, 6);
  if (selectedDate < mon || selectedDate > sun) {
    selectedDate = weekOffset === 0 ? today : mon;
  }

  const weekCode = weekCodeForDate(mon, p.altAnchor);
  const hasAlternating = p.routines.some(r => r.weekPattern === 'A' || r.weekPattern === 'B');
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  let totalAll = 0, doneAll = 0;
  const dayMeta = days.map((d, idx) => {
    const items = itemsForDate(d);
    const done = items.filter(x => x.done).length;
    const remCount = remindersForDate(d).length;
    totalAll += items.length;
    doneAll += done;
    return { date: d, wd: WEEKDAYS[idx], items, done, remCount };
  });

  const routinesCount = p.routines.length;
  const rangeText = `${fmtDate(mon)} – ${fmtDate(sun)}`;

  const stripHtml = `
    <div class="grid grid-cols-7 gap-1.5">
      ${dayMeta.map(m => {
        const isSel = m.date === selectedDate;
        const isToday = m.date === today;
        const allDone = m.items.length > 0 && m.done === m.items.length;
        return `<button type="button" data-pl-day="${m.date}" class="relative flex flex-col items-center justify-center rounded-xl border py-1.5 px-0.5 text-xs transition ${
          isSel ? 'bg-brand text-white border-brand shadow-sm'
            : isToday ? 'bg-white border-brand/60 text-brand-dark font-semibold hover:bg-lav-soft/60'
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
        }">
          ${m.remCount ? `<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${isSel ? 'bg-amber-200' : 'bg-amber-500'}" title="มีนัดหมาย/แจ้งเตือน ${m.remCount} รายการ"></span>` : ''}
          <span class="text-[11px] opacity-80">${m.wd}</span>
          <span class="text-sm font-bold leading-tight">${Number(m.date.slice(8))}</span>
          <span class="text-[10px] mt-0.5 ${isSel ? 'text-white/90' : allDone ? 'text-emerald-600 font-semibold' : 'text-slate-400'}">
            ${m.items.length ? `${m.done}/${m.items.length}` : '·'}
          </span>
        </button>`;
      }).join('')}
    </div>`;

  const bodyHtml = viewMode === 'week'
    ? `<div class="space-y-3">
        ${dayMeta.map(m => {
          const isToday = m.date === today;
          return `<div class="rounded-2xl border ${isToday ? 'border-brand/50 bg-lav-soft/20' : 'border-slate-200/80 bg-slate-50/40'} p-3 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-bold text-slate-800">${m.wd} · ${esc(fmtDate(m.date))}${isToday ? ' <span class="text-[10px] px-1.5 py-0.5 rounded bg-brand text-white ml-1">วันนี้</span>' : ''}</span>
              <span class="text-xs text-slate-500">${m.done}/${m.items.length} เสร็จ</span>
            </div>
            ${renderTaskListHtml(m.date)}
          </div>`;
        }).join('')}
      </div>`
    : `<div class="space-y-2.5">
        ${stripHtml}
        <div class="rounded-2xl border border-lav-soft/80 bg-slate-50/40 p-3 space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-bold text-slate-800">วัน${WEEKDAYS[weekdayIdx(selectedDate)]} · ${esc(fmtDate(selectedDate))}${selectedDate === today ? ' <span class="text-[10px] px-1.5 py-0.5 rounded bg-brand text-white ml-1">วันนี้</span>' : ''}</span>
            <span class="text-xs text-slate-500">${itemsForDate(selectedDate).filter(x => x.done).length}/${itemsForDate(selectedDate).length} เสร็จ</span>
          </div>
          ${renderTaskListHtml(selectedDate)}
          <div class="flex flex-wrap gap-1.5 pt-1">
            <button type="button" data-pl-routines class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-repeat"></i> ตั้งกิจวัตร / สลับสัปดาห์</button>
            <button type="button" data-pl-go="workout" class="chip bg-sky-soft text-blue-700"><i class="fa-solid fa-dumbbell"></i> วางแผนออกกำลังกาย</button>
            <button type="button" data-pl-go="remind" class="chip bg-amber-50 border border-amber-200 text-amber-900"><i class="fa-solid fa-thumbtack"></i> เพิ่มนัดหมาย</button>
          </div>
        </div>
      </div>`;

  root.innerHTML = `
  <section class="card space-y-3.5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-base sm:text-lg font-bold text-slate-800"><i class="fa-solid fa-calendar-check text-brand mr-1"></i> Weekly Planner & กิจวัตร</h2>
        <p class="text-xs text-slate-500">${esc(rangeText)} · เสร็จแล้ว ${doneAll}/${totalAll} รายการ</p>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        ${hasAlternating ? `<span class="chip ${weekCode === 'A' ? 'bg-sky-soft text-blue-800' : 'bg-amber-100 text-amber-900'} text-xs font-bold">รอบสัปดาห์ ${weekCode}</span>
        <button type="button" data-pl-flip-parity class="chip bg-white border border-slate-200 text-slate-600 text-xs" title="สลับให้สัปดาห์นี้เป็น A หรือ B"><i class="fa-solid fa-arrows-rotate"></i> สลับ A↔B</button>` : ''}
        <button type="button" data-pl-routines class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-repeat"></i> กิจวัตร (${routinesCount})</button>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <button type="button" data-pl-step="-1" class="chip bg-slate-100 text-slate-600" aria-label="สัปดาห์ก่อนหน้า"><i class="fa-solid fa-chevron-left"></i></button>
        <button type="button" data-pl-week="0" class="chip ${weekOffset === 0 ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}">สัปดาห์นี้</button>
        <button type="button" data-pl-week="1" class="chip ${weekOffset === 1 ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}">สัปดาห์หน้า</button>
        <button type="button" data-pl-step="1" class="chip bg-slate-100 text-slate-600" aria-label="สัปดาห์ถัดไป"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <div class="flex items-center gap-1.5">
        <button type="button" data-pl-mode="day" class="chip ${viewMode === 'day' ? 'bg-sky-soft text-blue-700 font-semibold' : 'bg-slate-100 text-slate-600'}">รายวัน</button>
        <button type="button" data-pl-mode="week" class="chip ${viewMode === 'week' ? 'bg-sky-soft text-blue-700 font-semibold' : 'bg-slate-100 text-slate-600'}">ดูทั้ง 7 วัน</button>
      </div>
    </div>

    ${!routinesCount ? `<div class="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
      <span>💡 ตั้งกิจวัตรประจำสัปดาห์หรือตารางสลับสัปดาห์อัตโนมัติ (เช่น สัปดาห์ A จ-พ-ศ-อา / สัปดาห์ B อ-พฤ-ส) ครั้งเดียวใช้ได้ยาว</span>
      <button type="button" data-pl-routines class="chip bg-white border border-amber-300 text-amber-900 font-semibold">ตั้งค่าเลย</button>
    </div>` : ''}

    ${bodyHtml}
  </section>`;
}

function openRoutinesModal() {
  let editingId = null;
  let pickedDays = new Set([0, 2, 4, 6]);
  let pickedIcon = '✨';
  let pickedPattern = 'every';
  const curWeekCode = weekCodeForDate(localDateStr(), getPlanner().altAnchor);

  const m = openModal(`
    <div class="flex justify-between items-center mb-3">
      <h3 class="font-bold text-lg text-slate-800"><i class="fa-solid fa-repeat text-brand mr-1"></i> กิจวัตร & ตารางสลับสัปดาห์</h3>
      <button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <p class="text-xs text-slate-500 mb-3">ตั้งครั้งเดียว ระบบดึงลง Planner ให้อัตโนมัติ รองรับทั้ง<b>ทุกสัปดาห์</b> และ<b>สลับสัปดาห์ A ↔ B อัตโนมัติ</b> (สัปดาห์นี้คือ <b>รอบ ${curWeekCode}</b>)</p>

    <div class="rounded-2xl bg-slate-50 border border-slate-200 p-3 space-y-3 mb-4">
      <div class="flex flex-wrap gap-1.5" id="rt-presets">
        ${ROUTINE_PRESETS.map(([ic, title]) => `<button type="button" data-rt-preset="${esc(ic + '|' + title)}" class="chip bg-white border border-slate-200 text-slate-700 text-xs hover:bg-lav-soft">${ic} ${esc(title)}</button>`).join('')}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div class="sm:col-span-2"><label class="lbl">ชื่อกิจวัตร *</label><input id="rt-title" class="input" placeholder="เช่น ล้างจาน, ออกกำลังกาย, ล้างแก้ว"></div>
        <div><label class="lbl">เวลา (ไม่บังคับ)</label><input id="rt-time" type="time" class="input"></div>
      </div>
      <div>
        <label class="lbl">รอบสัปดาห์ที่ทำ</label>
        <div class="grid grid-cols-3 gap-1.5" id="rt-pattern-bar">
          <button type="button" data-rt-pat="every" class="py-1.5 px-2 rounded-xl border text-xs font-semibold">ทุกสัปดาห์</button>
          <button type="button" data-rt-pat="A" class="py-1.5 px-2 rounded-xl border text-xs font-semibold">เฉพาะสัปดาห์ A</button>
          <button type="button" data-rt-pat="B" class="py-1.5 px-2 rounded-xl border text-xs font-semibold">เฉพาะสัปดาห์ B</button>
        </div>
      </div>
      <div>
        <div class="flex flex-wrap items-center justify-between gap-1 mb-1">
          <label class="lbl !mb-0">ทำซ้ำทุกวันไหนบ้าง?</label>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-rt-days="mwfs" class="text-[11px] text-brand-dark underline">จ พ ศ อา</button>
            <button type="button" data-rt-days="tts" class="text-[11px] text-brand-dark underline">อ พฤ ส</button>
            <button type="button" data-rt-days="all" class="text-[11px] text-brand-dark underline">ทุกวัน</button>
            <button type="button" data-rt-days="wd" class="text-[11px] text-brand-dark underline">จ–ศ</button>
            <button type="button" data-rt-days="we" class="text-[11px] text-brand-dark underline">ส–อา</button>
          </div>
        </div>
        <div id="rt-days" class="grid grid-cols-7 gap-1"></div>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button type="button" id="rt-cancel-edit" class="btn btn-ghost hidden text-xs">ยกเลิกแก้ไข</button>
        <button type="button" id="rt-create-pair" class="btn btn-sky text-xs" title="สร้างรอบสัปดาห์ A ตามวันที่เลือก และสร้างรอบ B เป็นวันที่เหลือให้อัตโนมัติ"><i class="fa-solid fa-arrows-left-right"></i> สร้างคู่สลับ A ↔ B</button>
        <button type="button" id="rt-save" class="btn btn-primary text-xs"><i class="fa-solid fa-plus"></i> เพิ่มกิจวัตร</button>
      </div>
    </div>

    <div id="rt-list" class="space-y-2 max-h-64 overflow-y-auto pr-1"></div>
  `, { wide: true });

  const renderDays = () => {
    $('#rt-days', m.el).innerHTML = WEEKDAYS.map((wd, idx) => `
      <button type="button" data-rt-d="${idx}" class="py-1.5 rounded-xl border text-xs font-semibold ${pickedDays.has(idx) ? 'bg-brand text-white border-brand' : 'bg-white border-slate-200 text-slate-600'}">${wd}</button>
    `).join('');
  };

  const renderPattern = () => {
    m.el.querySelectorAll('[data-rt-pat]').forEach(btn => {
      const active = btn.dataset.rtPat === pickedPattern;
      btn.className = `py-1.5 px-2 rounded-xl border text-xs font-semibold transition ${
        active
          ? (pickedPattern === 'A' ? 'bg-sky-500 text-white border-sky-500' : pickedPattern === 'B' ? 'bg-amber-500 text-white border-amber-500' : 'bg-brand text-white border-brand')
          : 'bg-white border-slate-200 text-slate-600'
      }`;
    });
  };

  const renderList = () => {
    const list = getPlanner().routines;
    $('#rt-list', m.el).innerHTML = list.length ? list.map(r => {
      const patBadge = r.weekPattern === 'A'
        ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-soft text-blue-800 font-bold">สัปดาห์ A</span>'
        : r.weekPattern === 'B'
          ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">สัปดาห์ B</span>'
          : '';
      return `
      <div class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <div class="min-w-0">
          <p class="font-semibold text-slate-800 truncate">${r.icon || '✨'} ${esc(r.title)} ${patBadge} ${r.time ? `<span class="text-xs font-normal text-blue-700 bg-sky-soft px-1.5 py-0.5 rounded">${esc(r.time)}</span>` : ''}</p>
          <p class="text-[11px] text-slate-500">${(r.days || []).length === 7 ? 'ทุกวัน' : (r.days || []).map(d => WEEKDAYS[d]).join(', ')}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button type="button" data-rt-edit="${esc(r.id)}" class="chip bg-sky-soft text-blue-700 text-xs">แก้</button>
          <button type="button" data-rt-del="${esc(r.id)}" class="chip bg-pink-soft text-rose-600 text-xs">ลบ</button>
        </div>
      </div>`;
    }).join('')
      : '<p class="text-xs text-slate-400 text-center py-4">ยังไม่มีกิจวัตรที่ตั้งไว้</p>';
  };

  const resetEdit = () => {
    editingId = null;
    pickedIcon = '✨';
    pickedPattern = 'every';
    pickedDays = new Set([0, 2, 4, 6]);
    $('#rt-title', m.el).value = '';
    $('#rt-time', m.el).value = '';
    $('#rt-save', m.el).innerHTML = '<i class="fa-solid fa-plus"></i> เพิ่มกิจวัตร';
    $('#rt-cancel-edit', m.el).classList.add('hidden');
    $('#rt-create-pair', m.el).classList.remove('hidden');
    renderPattern();
    renderDays();
  };

  m.el.addEventListener('click', async e => {
    const preset = e.target.closest('[data-rt-preset]');
    if (preset) {
      const [ic, title] = preset.dataset.rtPreset.split('|');
      pickedIcon = ic;
      $('#rt-title', m.el).value = title;
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
      pickedDays = new Set(
        v === 'all' ? [0, 1, 2, 3, 4, 5, 6]
          : v === 'wd' ? [0, 1, 2, 3, 4]
            : v === 'we' ? [5, 6]
              : v === 'mwfs' ? [0, 2, 4, 6]
                : [1, 3, 5]
      );
      renderDays();
      return;
    }

    const dBtn = e.target.closest('[data-rt-d]');
    if (dBtn) {
      const d = Number(dBtn.dataset.rtD);
      if (pickedDays.has(d)) pickedDays.delete(d);
      else pickedDays.add(d);
      renderDays();
      return;
    }

    const editBtn = e.target.closest('[data-rt-edit]');
    if (editBtn) {
      const r = getPlanner().routines.find(x => x.id === editBtn.dataset.rtEdit);
      if (!r) return;
      editingId = r.id;
      pickedIcon = r.icon || '✨';
      pickedPattern = r.weekPattern || 'every';
      pickedDays = new Set(r.days || []);
      $('#rt-title', m.el).value = r.title;
      $('#rt-time', m.el).value = r.time || '';
      $('#rt-save', m.el).innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกการแก้ไข';
      $('#rt-cancel-edit', m.el).classList.remove('hidden');
      $('#rt-create-pair', m.el).classList.add('hidden');
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
    const time = $('#rt-time', m.el).value.trim().slice(0, 10);
    const daysA = [...pickedDays].sort((a, b) => a - b);
    if (!title) return toast('กรอกชื่อกิจวัตรก่อนค่ะ', 'err');
    if (daysA.length === 0 || daysA.length === 7) return toast('เลือกวัน 1–6 วัน เพื่อให้สัปดาห์ B สลับเป็นวันที่เหลืออัตโนมัติ', 'err');
    const daysB = [0, 1, 2, 3, 4, 5, 6].filter(d => !pickedDays.has(d));
    const p = getPlanner();
    const baseId = Date.now().toString(36);
    const recA = { id: 'ra' + baseId, title, days: daysA, weekPattern: 'A', icon: pickedIcon, ...(time && { time }) };
    const recB = { id: 'rb' + baseId, title, days: daysB, weekPattern: 'B', icon: pickedIcon, ...(time && { time }) };
    await savePlanner({ ...p, routines: [...p.routines, recA, recB] });
    toast(`สร้างคู่สลับ "${title}" (A: ${daysA.map(d => WEEKDAYS[d]).join('/')} · B: ${daysB.map(d => WEEKDAYS[d]).join('/')}) แล้ว`);
    resetEdit();
    renderList();
  });

  $('#rt-save', m.el).addEventListener('click', async () => {
    const title = $('#rt-title', m.el).value.trim().slice(0, 80);
    const time = $('#rt-time', m.el).value.trim().slice(0, 10);
    const days = [...pickedDays].sort((a, b) => a - b);
    if (!title) return toast('กรอกชื่อกิจวัตรก่อนค่ะ', 'err');
    if (!days.length) return toast('เลือกวันอย่างน้อย 1 วัน', 'err');

    const p = getPlanner();
    const rec = {
      id: editingId || ('r' + Date.now().toString(36)),
      title,
      days,
      icon: pickedIcon,
      ...(pickedPattern !== 'every' && { weekPattern: pickedPattern }),
      ...(time && { time })
    };
    const routines = editingId
      ? p.routines.map(x => (x.id === editingId ? rec : x))
      : [...p.routines, rec];

    await savePlanner({ ...p, routines });
    toast(editingId ? 'แก้ไขกิจวัตรแล้ว' : 'เพิ่มกิจวัตรแล้ว');
    resetEdit();
    renderList();
  });

  renderPattern();
  renderDays();
  renderList();
}
