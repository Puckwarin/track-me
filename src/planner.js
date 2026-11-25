import { setDoc, updateDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state } from './state.js';
import { isPreviewMode } from './preview.js';
import {
  TYPES,
  computeWorkoutTotalMinutes,
  formatIntensityLabel,
  formatWorkoutEvaluationParts,
  buildWorkoutNotesText
} from './workoutConstants.js';
import { remindersForDate } from './reminders.js';
import { $, esc, fmtDate, localDateStr, parseLocal, addDays, isDateStr, toast, openModal, mondayOf } from './util.js';
import { iconSvg } from './icons.js';
import { bindSwipeRows, buildWeekStripRange, centerStripPill, weekNavBarHtml } from './ui.js';

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
let stripScrollMode = 'center';
let dragPayload = null;
let lastActionFeedback = '';
let feedbackClearTimer = 0;
let flashDayPanel = false;
const boundContainers = new WeakSet();
const busyTargets = new WeakSet();

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
  if (isDateStr(r.weekStart)) {
    return mondayOf(dateStr) === mondayOf(r.weekStart);
  }
  if (!r.weekPattern || r.weekPattern === 'every') return true;
  return r.weekPattern === weekCodeForDate(dateStr, altAnchor);
}

export function weekRangeLabel(mondayStr) {
  const start = parseLocal(mondayStr);
  const end = parseLocal(addDays(mondayStr, 6));
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const monthYear = end.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
    return `${start.getDate()}–${end.getDate()} ${monthYear}`;
  }
  const sTxt = start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const eTxt = end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  return `${sTxt} – ${eTxt}`;
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

export function formatPlannerToast(action, {
  title = '',
  dateStr = '',
  weekMonday = '',
  delta = 0,
  checked = false,
  kind = 'routine',
  scopedToWeek = true
} = {}) {
  const cleanTitle = String(title || '').trim();
  if (action === 'select-day' && isDateStr(dateStr)) {
    return `เลือกวัน${WEEKDAYS[weekdayIdx(dateStr)]} · ${fmtDate(dateStr)}`;
  }
  if (action === 'week-shift' && isDateStr(weekMonday)) {
    return `${delta < 0 ? 'ย้อนดูสัปดาห์' : 'เลื่อนดูสัปดาห์'} ${weekRangeLabel(weekMonday)}`;
  }
  if (action === 'today') {
    return 'กลับมาที่วันปัจจุบันแล้ว';
  }
  if (action === 'toggle') {
    if (kind === 'workout') {
      return checked ? 'เช็กออกกำลังกายเสร็จแล้ว 💪' : 'เปลี่ยนกลับเป็นวางแผนไว้';
    }
    return checked
      ? `เช็ก "${cleanTitle || 'กิจกรรม'}" เสร็จแล้ว ✓`
      : `เปลี่ยน "${cleanTitle || 'กิจกรรม'}" เป็นยังไม่ทำ`;
  }
  if (action === 'move' && isDateStr(dateStr)) {
    return `ย้าย "${cleanTitle || 'งาน'}" ไป ${fmtDate(dateStr)} แล้ว`;
  }
  if (action === 'skip') {
    return scopedToWeek
      ? `ลบ "${cleanTitle || 'งาน'}" แล้ว`
      : `นำ "${cleanTitle || 'กิจกรรม'}" ออกจาก ${fmtDate(dateStr)} แล้ว`;
  }
  if (action === 'save-edit') return 'แก้ไขงานเฉพาะสัปดาห์นี้แล้ว';
  if (action === 'save-new') return 'เพิ่มงานในสัปดาห์นี้แล้ว';
  return '';
}

export function validateRoutineDraft(rawTitle, rawDays) {
  const title = String(rawTitle || '').trim().slice(0, 80);
  if (!title) return { ok: false, message: 'กรอกชื่องานก่อนค่ะ' };
  const days = [...new Set(Array.isArray(rawDays) ? rawDays : [])]
    .filter(d => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  if (!days.length) return { ok: false, message: 'เลือกวันอย่างน้อย 1 วัน' };
  return { ok: true, title, days };
}

function setPlannerFeedback(message, { pulse = true } = {}) {
  lastActionFeedback = String(message || '').trim();
  flashDayPanel = Boolean(pulse && lastActionFeedback);
  clearTimeout(feedbackClearTimer);
  if (lastActionFeedback && typeof window !== 'undefined') {
    feedbackClearTimer = window.setTimeout(() => {
      lastActionFeedback = '';
      const pill = root ? $('#pl-feedback-slot', root) : null;
      if (pill) {
        pill.textContent = '';
        pill.classList.add('hidden');
      }
    }, 2200);
  }
}

async function withBusyLock(targetEl, taskFn) {
  if (!targetEl || busyTargets.has(targetEl)) return false;
  busyTargets.add(targetEl);
  const cardEl = targetEl.closest('.tm-swipe-card, .pl-board-task');
  const hadDisabled = 'disabled' in targetEl;
  const prevDisabled = hadDisabled ? targetEl.disabled : false;
  if (hadDisabled) targetEl.disabled = true;
  cardEl?.classList.add('pl-task-busy');
  try {
    return await taskFn();
  } finally {
    busyTargets.delete(targetEl);
    if (targetEl.isConnected && hadDisabled) targetEl.disabled = prevDisabled;
    if (cardEl?.isConnected) cardEl.classList.remove('pl-task-busy');
  }
}

export function resetPlannerToToday() {
  selectedDate = localDateStr();
  stripScrollMode = 'center';
}

function normalizePlannerState(raw = {}) {
  return {
    routines: Array.isArray(raw.routines) ? raw.routines : [],
    doneMap: raw.doneMap && typeof raw.doneMap === 'object' ? raw.doneMap : {},
    recentDone: Array.isArray(raw.recentDone) ? raw.recentDone : [],
    moves: Array.isArray(raw.moves) ? raw.moves : [],
    skips: Array.isArray(raw.skips) ? raw.skips : [],
    altAnchor: isDateStr(raw.altAnchor) ? raw.altAnchor : DEFAULT_ALT_ANCHOR,
    ...(raw.extras && typeof raw.extras === 'object' ? { extras: raw.extras } : {})
  };
}

function getPlanner() {
  return normalizePlannerState(state.planner || {});
}

function isRoutineActiveOnDate(planner, r, dateStr) {
  if (!r || !isDateStr(dateStr)) return false;
  const moves = Array.isArray(planner.moves) ? planner.moves : [];
  const skips = Array.isArray(planner.skips) ? planner.skips : [];
  if (skips.some(s => s?.routineId === r.id && s?.date === dateStr)) return false;
  if (moves.some(m => m?.routineId === r.id && m?.to === dateStr)) return true;
  if (routineAppliesToDate(r, dateStr, planner.altAnchor)) {
    return !moves.some(m => m?.routineId === r.id && m?.from === dateStr);
  }
  return false;
}

function transferDoneState(doneMap, recentDone, routineId, fromDate, toDate) {
  const nextDoneMap = { ...(doneMap || {}) };
  const fromSet = new Set(nextDoneMap[fromDate] || []);
  const wasDone = fromSet.has(routineId);
  if (wasDone) {
    fromSet.delete(routineId);
    if (fromSet.size) nextDoneMap[fromDate] = [...fromSet];
    else delete nextDoneMap[fromDate];

    const toSet = new Set(nextDoneMap[toDate] || []);
    toSet.add(routineId);
    nextDoneMap[toDate] = [...toSet];
  }
  const nextRecentDone = (Array.isArray(recentDone) ? recentDone : []).map(x =>
    x?.id === routineId && x?.date === fromDate ? { ...x, date: toDate } : x
  );
  return { doneMap: nextDoneMap, recentDone: nextRecentDone };
}

/**
 * ย้ายงานประจำ/งานวันเดียวจาก fromDate ไป toDate โดยไม่สร้างซ้ำ รักษาสถานะเดิม และไม่กระทบสัปดาห์อื่น
 */
export function moveRoutineOccurrence(rawPlanner, { routineId, fromDate, toDate }) {
  const planner = normalizePlannerState(rawPlanner);
  if (!routineId || !isDateStr(fromDate) || !isDateStr(toDate)) {
    return { ok: false, reason: 'invalid', message: 'ข้อมูลวันที่หรือรายการไม่ถูกต้อง' };
  }
  if (fromDate === toDate) {
    return { ok: false, reason: 'same_date', message: 'เป็นวันเดียวกันอยู่แล้ว' };
  }
  const targetRoutine = planner.routines.find(r => r.id === routineId);
  if (!targetRoutine) {
    return { ok: false, reason: 'not_found', message: 'ไม่พบรายการที่ต้องการย้าย' };
  }
  if (isRoutineActiveOnDate(planner, targetRoutine, toDate)) {
    return { ok: false, reason: 'duplicate', message: `วัน${WEEKDAYS[weekdayIdx(toDate)]} (${fmtDate(toDate)}) มี "${targetRoutine.title}" อยู่แล้ว` };
  }

  let nextRoutines = planner.routines;
  let nextMoves = [...planner.moves];
  const nextSkips = planner.skips.filter(s => !(s.routineId === routineId && s.date === toDate));

  if (targetRoutine.weekPattern === 'once') {
    nextRoutines = planner.routines.map(r =>
      r.id === routineId ? { ...r, date: toDate, days: [weekdayIdx(toDate)] } : r
    );
  } else {
    const existingMoveIdx = nextMoves.findIndex(m => m.routineId === routineId && m.to === fromDate);
    if (existingMoveIdx >= 0) {
      const origFrom = nextMoves[existingMoveIdx].from;
      if (origFrom === toDate) {
        nextMoves.splice(existingMoveIdx, 1);
      } else {
        nextMoves[existingMoveIdx] = { routineId, from: origFrom, to: toDate };
      }
    } else if (routineAppliesToDate(targetRoutine, fromDate, planner.altAnchor)) {
      nextMoves.push({ routineId, from: fromDate, to: toDate });
    } else {
      return { ok: false, reason: 'not_scheduled', message: 'ไม่พบงานนี้ในวันที่ต้นทาง' };
    }
  }

  const transferred = transferDoneState(planner.doneMap, planner.recentDone, routineId, fromDate, toDate);
  return {
    ok: true,
    planner: {
      ...planner,
      routines: nextRoutines,
      moves: nextMoves,
      skips: nextSkips,
      doneMap: transferred.doneMap,
      recentDone: transferred.recentDone
    }
  };
}

/**
 * ลบ/นำงานออกจากวันที่กำหนด (ถ้าเป็นงานเฉพาะวันเดียวจะลบรายการนั้น, ถ้าเป็นงานประจำจะซ่อนเฉพาะวันที่เลือกโดยไม่กระทบสัปดาห์อื่น)
 */
export function skipRoutineOccurrence(rawPlanner, { routineId, dateStr }) {
  const planner = normalizePlannerState(rawPlanner);
  const targetRoutine = planner.routines.find(r => r.id === routineId);
  if (!targetRoutine || !isDateStr(dateStr)) {
    return { ok: false, message: 'ไม่พบรายการที่ต้องการนำออก' };
  }

  let nextRoutines = planner.routines;
  let nextMoves = [...planner.moves];
  let nextSkips = [...planner.skips];
  const nextDoneMap = { ...planner.doneMap };

  if (nextDoneMap[dateStr]) {
    const filtered = nextDoneMap[dateStr].filter(id => id !== routineId);
    if (filtered.length) nextDoneMap[dateStr] = filtered;
    else delete nextDoneMap[dateStr];
  }

  if (targetRoutine.weekPattern === 'once') {
    nextRoutines = planner.routines.filter(r => r.id !== routineId);
    nextMoves = nextMoves.filter(m => m.routineId !== routineId);
    nextSkips = nextSkips.filter(s => s.routineId !== routineId);
  } else {
    const movedInIdx = nextMoves.findIndex(m => m.routineId === routineId && m.to === dateStr);
    if (movedInIdx >= 0) {
      const origFrom = nextMoves[movedInIdx].from;
      nextMoves.splice(movedInIdx, 1);
      if (!nextSkips.some(s => s.routineId === routineId && s.date === origFrom)) {
        nextSkips.push({ routineId, date: origFrom });
      }
    } else if (!nextSkips.some(s => s.routineId === routineId && s.date === dateStr)) {
      nextSkips.push({ routineId, date: dateStr });
    }
  }

  return {
    ok: true,
    planner: {
      ...planner,
      routines: nextRoutines,
      moves: nextMoves,
      skips: nextSkips,
      doneMap: nextDoneMap,
      recentDone: planner.recentDone.filter(x => !(x?.id === routineId && x?.date === dateStr))
    }
  };
}

async function savePlanner(next) {
  if (!state.uid) return false;
  const today = localDateStr();
  const minKeep = addDays(today, -60);
  const maxKeep = addDays(today, 90);
  const pruneObj = obj => Object.fromEntries(
    Object.entries(obj || {}).filter(([d]) => d >= minKeep && d <= maxKeep)
  );
  const prevRaw = state.planner;
  const cur = getPlanner();
  const payload = {
    routines: (next.routines || []).slice(0, 80),
    doneMap: pruneObj(next.doneMap),
    recentDone: (Array.isArray(next.recentDone) ? next.recentDone : cur.recentDone).slice(0, 40),
    moves: (Array.isArray(next.moves) ? next.moves : cur.moves)
      .filter(m => m && m.routineId && isDateStr(m.from) && isDateStr(m.to) && m.from !== m.to && (m.to >= minKeep || m.from >= minKeep) && (m.to <= maxKeep || m.from <= maxKeep))
      .slice(-160),
    skips: (Array.isArray(next.skips) ? next.skips : cur.skips)
      .filter(s => s && s.routineId && isDateStr(s.date) && s.date >= minKeep && s.date <= maxKeep)
      .slice(-160),
    altAnchor: isDateStr(next.altAnchor) ? next.altAnchor : cur.altAnchor,
    ...(cur.extras || next.extras ? { extras: pruneObj(next.extras || cur.extras) } : {}),
    updatedAt: new Date()
  };
  state.planner = { id: 'planner', ...payload };
  renderPlanner();
  if (isPreviewMode()) {
    window.dispatchEvent(new Event('trackme:data-change'));
    return true;
  }
  try {
    await setDoc(userDoc(state.uid, 'settings', 'planner'), payload);
    return true;
  } catch (e) {
    state.planner = prevRaw;
    renderPlanner();
    toast('บันทึก Planner ไม่สำเร็จ: ' + e.message, 'err');
    return false;
  }
}

// Planner รวมเฉพาะ 2 กลุ่มงาน:
// (ก) ตารางออกกำลังกายที่วางแผนไว้ในวันนั้นๆ
// (ข) กิจกรรมประจำวัน/งานบ้าน (รองรับเฉพาะวัน, ทุกสัปดาห์, สลับ A/B และงานที่ย้ายวันมา)
export function itemsForDate(dateStr, rawPlanner = null) {
  const planner = rawPlanner ? normalizePlannerState(rawPlanner) : getPlanner();
  const { routines, doneMap, altAnchor, moves, skips } = planner;
  const doneSet = new Set(doneMap[dateStr] || []);
  const skipSet = new Set(skips.filter(s => s?.date === dateStr).map(s => s.routineId));
  const movedAwaySet = new Set(moves.filter(m => m?.from === dateStr).map(m => m.routineId));
  const movedInMap = new Map(
    moves.filter(m => m?.to === dateStr).map(m => [m.routineId, m.from])
  );

  const workouts = rawPlanner ? [] : (state.workouts || [])
    .filter(w => w.date === dateStr)
    .map(w => {
      const totalMin = computeWorkoutTotalMinutes(w);
      const label = w.title || TYPES[w.type] || w.type || 'ออกกำลังกาย';
      const exCount = w.sections ? Object.values(w.sections).reduce((a, r) => a + (r?.length || 0), 0) : 0;
      const intensityText = formatIntensityLabel(w.intensity);
      const evalParts = formatWorkoutEvaluationParts(w);
      const notesText = buildWorkoutNotesText(w);
      const subParts = [
        intensityText ? `ความหนัก: ${intensityText}` : '',
        ...evalParts,
        notesText || (exCount ? `${exCount} ท่า` : '')
      ].filter(Boolean);
      return {
        kind: 'workout',
        id: w.id,
        title: `${label}${totalMin ? ` (${totalMin} นาที รวม)` : ''}`,
        done: w.status !== 'planned',
        time: '',
        icon: '🏃‍♀️',
        sub: subParts.join(' · ')
      };
    });

  const seenRoutineIds = new Set();
  const dayRoutines = [];
  for (const r of routines) {
    if (!r?.id || seenRoutineIds.has(r.id) || skipSet.has(r.id)) continue;
    const movedFrom = movedInMap.get(r.id) || '';
    const nativeHere = routineAppliesToDate(r, dateStr, altAnchor) && !movedAwaySet.has(r.id);
    if (!nativeHere && !movedFrom) continue;
    seenRoutineIds.add(r.id);

    const movedFromLabel = movedFrom
      ? `ย้ายมาจาก ${WEEKDAYS[weekdayIdx(movedFrom)]} ${Number(movedFrom.slice(8))}/${Number(movedFrom.slice(5, 7))}`
      : '';
    dayRoutines.push({
      kind: 'routine',
      id: r.id,
      title: r.title,
      done: doneSet.has(r.id),
      time: r.time || '',
      icon: inferRoutineEmoji(r.title, r.icon),
      weekPattern: r.weekPattern || 'every',
      weekStart: isDateStr(r.weekStart) ? r.weekStart : '',
      date: r.date || '',
      movedFrom,
      sub: movedFromLabel || (
        r.weekPattern === 'once'
          ? 'เฉพาะวันนี้'
          : isDateStr(r.weekStart)
            ? 'สัปดาห์นี้'
            : r.weekPattern === 'A'
              ? 'สลับสัปดาห์ (รอบ A)'
              : r.weekPattern === 'B'
                ? 'สลับสัปดาห์ (รอบ B)'
                : 'ประจำสัปดาห์'
      )
    });
  }
  dayRoutines.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

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

async function toggleTaskStatus(kind, d, id, checked) {
  if (kind === 'workout') {
    const prevWorkouts = state.workouts || [];
    const target = prevWorkouts.find(w => w.id === id);
    if (!target) return false;
    const prevStatus = target.status;
    state.workouts = prevWorkouts.map(w => w.id === id ? { ...w, status: checked ? 'done' : 'planned' } : w);
    setPlannerFeedback(formatPlannerToast('toggle', { kind: 'workout', checked }), { pulse: false });
    renderPlanner();
    if (isPreviewMode()) {
      window.dispatchEvent(new Event('trackme:data-change'));
      toast(checked ? 'เช็กออกกำลังกายเสร็จแล้ว (โหมดดูตัวอย่าง)' : 'เปลี่ยนกลับเป็นวางแผนไว้');
      return true;
    }
    try {
      await updateDoc(userDoc(state.uid, 'workout_records', id), {
        status: checked ? 'done' : 'planned',
        updatedAt: new Date()
      });
      toast(formatPlannerToast('toggle', { kind: 'workout', checked }));
      return true;
    } catch (err) {
      state.workouts = (state.workouts || []).map(w => w.id === id ? { ...w, status: prevStatus } : w);
      setPlannerFeedback('');
      renderPlanner();
      toast('อัปเดตไม่สำเร็จ: ' + err.message, 'err');
      return false;
    }
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
    const okMsg = formatPlannerToast('toggle', { kind: 'routine', title: matchedRoutine?.title, checked });
    setPlannerFeedback(okMsg, { pulse: false });
    const saved = await savePlanner({ ...p, doneMap, recentDone });
    if (saved) {
      toast(isPreviewMode() ? `${okMsg} (โหมดดูตัวอย่าง)` : okMsg);
    }
    return saved;
  }
  return false;
}

async function rescheduleTask(kind, fromDate, id, toDate) {
  if (!isDateStr(fromDate) || !isDateStr(toDate)) return false;
  if (fromDate === toDate) {
    toast('เลือกวันใหม่ที่ต่างจากวันเดิม');
    return false;
  }

  if (kind === 'workout') {
    const target = (state.workouts || []).find(w => w.id === id);
    if (!target) return false;
    const prevDate = target.date;
    state.workouts = (state.workouts || []).map(w => w.id === id ? { ...w, date: toDate } : w);
    selectedDate = toDate;
    stripScrollMode = 'smooth';
    renderPlanner();
    if (isPreviewMode()) {
      window.dispatchEvent(new Event('trackme:data-change'));
      toast(`ย้ายแผนออกกำลังกายไป ${fmtDate(toDate)} แล้ว (โหมดดูตัวอย่าง)`);
      return true;
    }
    try {
      await updateDoc(userDoc(state.uid, 'workout_records', id), {
        date: toDate,
        updatedAt: new Date()
      });
      toast(`ย้ายแผนออกกำลังกายไป ${fmtDate(toDate)} แล้ว`);
      return true;
    } catch (err) {
      state.workouts = (state.workouts || []).map(w => w.id === id ? { ...w, date: prevDate } : w);
      selectedDate = prevDate;
      stripScrollMode = 'smooth';
      renderPlanner();
      toast('ย้ายวันไม่สำเร็จ: ' + err.message, 'err');
      return false;
    }
  }

  if (kind === 'routine') {
    const res = moveRoutineOccurrence(getPlanner(), { routineId: id, fromDate, toDate });
    if (!res.ok) {
      toast(res.message, 'err');
      return false;
    }
    selectedDate = toDate;
    stripScrollMode = 'smooth';
    const movedRoutine = getPlanner().routines.find(r => r.id === id);
    const msg = formatPlannerToast('move', { title: movedRoutine?.title, dateStr: toDate });
    setPlannerFeedback(msg);
    const saved = await savePlanner(res.planner);
    if (saved) toast(isPreviewMode() ? `${msg} (โหมดดูตัวอย่าง)` : msg);
    return saved;
  }

  return false;
}

export function mountPlanner(el, navigate) {
  root = el;
  goFn = navigate || (() => {});
  stripScrollMode = 'center';

  if (!boundContainers.has(root)) {
    boundContainers.add(root);

    root.addEventListener('click', async e => {
      if (e.target.closest('[data-pl-week-today]')) {
        selectedDate = localDateStr();
        stripScrollMode = 'smooth';
        const msg = formatPlannerToast('today');
        setPlannerFeedback(msg);
        toast(msg);
        renderPlanner();
        return;
      }

      const dayBtn = e.target.closest('[data-pl-day]');
      if (dayBtn) {
        selectedDate = dayBtn.dataset.plDay;
        stripScrollMode = 'preserve';
        setPlannerFeedback(formatPlannerToast('select-day', { dateStr: selectedDate }));
        renderPlanner();
        return;
      }

      const quickAddBtn = e.target.closest('[data-pl-quick-add]');
      if (quickAddBtn) {
        const d = quickAddBtn.dataset.plQuickAdd || selectedDate;
        selectedDate = d;
        openRoutinesModal({ initialDate: d });
        return;
      }

      if (e.target.closest('[data-pl-routines]')) {
        openRoutinesModal({ initialDate: selectedDate });
        return;
      }

      const moveBtn = e.target.closest('[data-pl-move]');
      if (moveBtn) {
        const [kind, d, id] = moveBtn.dataset.plMove.split(':');
        openRescheduleModal(kind, d, id);
        return;
      }

      const editTaskBtn = e.target.closest('[data-pl-edit]');
      if (editTaskBtn) {
        const [kind, d, id] = editTaskBtn.dataset.plEdit.split(':');
        if (kind === 'routine') openRoutinesModal({ editId: id, initialDate: d });
        else if (kind === 'workout') goFn('workout', 'w-date');
        return;
      }

      const delTaskBtn = e.target.closest('[data-pl-del]');
      if (delTaskBtn) {
        const [kind, d, id] = delTaskBtn.dataset.plDel.split(':');
        if (kind === 'routine') {
          await withBusyLock(delTaskBtn, async () => {
            const item = itemsForDate(d).find(x => x.kind === 'routine' && x.id === id);
            const res = skipRoutineOccurrence(getPlanner(), { routineId: id, dateStr: d });
            if (!res.ok) return toast(res.message, 'err');
            const msg = formatPlannerToast('skip', {
              title: item?.title,
              dateStr: d,
              scopedToWeek: item?.weekPattern === 'once'
            });
            setPlannerFeedback(msg);
            const saved = await savePlanner(res.planner);
            if (saved) toast(msg);
          });
        }
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
      const nextChecked = chk.checked;
      const ok = await withBusyLock(chk, () => toggleTaskStatus(kind, d, id, nextChecked));
      if (!ok) chk.checked = !nextChecked;
    });

    // Desktop Drag & Drop ระหว่างคอลัมน์วันจันทร์–อาทิตย์
    root.addEventListener('dragstart', e => {
      const card = e.target.closest('[data-pl-drag]');
      if (!card) return;
      const [kind, date, id] = card.dataset.plDrag.split(':');
      dragPayload = { kind, date, id };
      card.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.plDrag);
      }
    });

    root.addEventListener('dragend', () => {
      dragPayload = null;
      root.querySelectorAll('.is-dragging, .is-drop-target').forEach(node => {
        node.classList.remove('is-dragging', 'is-drop-target');
      });
    });

    root.addEventListener('dragover', e => {
      const col = e.target.closest('[data-pl-drop-date]');
      if (!col || !dragPayload) return;
      if (col.dataset.plDropDate === dragPayload.date) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      root.querySelectorAll('[data-pl-drop-date].is-drop-target').forEach(node => {
        if (node !== col) node.classList.remove('is-drop-target');
      });
      col.classList.add('is-drop-target');
    });

    root.addEventListener('dragleave', e => {
      const col = e.target.closest('[data-pl-drop-date]');
      if (!col) return;
      if (e.relatedTarget && col.contains(e.relatedTarget)) return;
      col.classList.remove('is-drop-target');
    });

    root.addEventListener('drop', async e => {
      const col = e.target.closest('[data-pl-drop-date]');
      if (!col || !dragPayload) return;
      e.preventDefault();
      col.classList.remove('is-drop-target');
      const { kind, date: fromDate, id } = dragPayload;
      dragPayload = null;
      const toDate = col.dataset.plDropDate;
      if (toDate && toDate !== fromDate) {
        await rescheduleTask(kind, fromDate, id, toDate);
      }
    });
  }

  renderPlanner();
}

function renderTaskListHtml(dateStr) {
  const items = itemsForDate(dateStr);
  const rowsHtml = items.length
    ? items.map(it => {
        const key = `${it.kind}:${dateStr}:${it.id}`;
        const kindBadge = it.kind === 'workout'
          ? `<span class="text-[10px] px-1.5 py-0.5 rounded font-medium ${it.done ? 'bg-ok-soft text-slate-700' : 'bg-amber-100 text-amber-800'}">${it.done ? 'ออกกำลังกายแล้ว' : 'แผนออกกำลังกาย'}</span>`
          : `<span class="text-[10px] px-1.5 py-0.5 rounded ${it.movedFrom || it.weekPattern === 'once' || it.weekStart ? 'bg-sky-soft text-brand-dark font-semibold' : 'bg-lav-soft text-brand-dark'}">${esc(it.sub)}</span>`;
        const swipeActions = it.kind === 'routine'
          ? `<div class="tm-swipe-actions">
              <button type="button" data-pl-edit="${esc(key)}" class="tm-swipe-action-btn is-edit" aria-label="แก้ไข ${esc(it.title)}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
              <button type="button" data-pl-del="${esc(key)}" class="tm-swipe-action-btn is-del" aria-label="ลบ ${esc(it.title)}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
            </div>`
          : `<div class="tm-swipe-actions tm-swipe-actions--single">
              <button type="button" data-pl-edit="${esc(key)}" class="tm-swipe-action-btn is-edit" aria-label="แก้ไข ${esc(it.title)}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
            </div>`;
        return `<div class="tm-swipe-row ${it.done ? 'is-muted' : ''}">
          ${swipeActions}
          <div class="tm-swipe-card pl-mobile-task !flex-row items-center justify-between gap-2 !px-3 !py-2 min-h-[52px]">
            <label class="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer py-1">
              <input type="checkbox" class="mt-0.5 w-4 h-4 accent-brand rounded shrink-0" data-pl-toggle="${esc(key)}" ${it.done ? 'checked' : ''}>
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-1.5">
                  <span class="text-sm font-medium ${it.done ? 'line-through text-slate-500' : 'text-slate-800'}">${it.icon} ${esc(it.title)}</span>
                  ${it.time ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-soft text-blue-700 tabular-nums">${esc(it.time)} น.</span>` : ''}
                  ${kindBadge}
                </span>
                ${it.sub && it.kind === 'workout' ? `<span class="block text-[11px] text-slate-500 mt-0.5">${esc(it.sub)}</span>` : ''}
              </span>
            </label>
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" data-pl-move="${esc(key)}" class="pl-task-action-btn" aria-label="ย้ายวันหรือจัดการ ${esc(it.title)}">
                ${iconSvg('swap', { size: 14 })}<span>ย้ายวัน</span>
              </button>
            </div>
          </div>
        </div>`;
      }).join('')
    : `<p class="text-xs text-slate-500 text-center py-4 rounded-xl bg-slate-50/70">ยังไม่มีงานในวัน${WEEKDAYS[weekdayIdx(dateStr)]} · กด "+ เพิ่มงาน" เพื่อวางแผนได้เลย</p>`;

  return `
    ${renderDayReminderBanner(dateStr)}
    <div class="tm-swipe-list tm-swipe-list--cards">${rowsHtml}</div>`;
}

function renderDesktopBoardHtml(weekDays, today) {
  return `
    <div class="pl-week-board" role="region" aria-label="ตารางแผนงานรายสัปดาห์ จันทร์ถึงอาทิตย์">
      ${weekDays.map(m => {
        const isSel = m.date === selectedDate;
        const isToday = m.date === today;
        const allDone = m.items.length > 0 && m.done === m.items.length;
        return `
          <div class="pl-day-col ${isToday ? 'is-today' : ''} ${isSel ? 'is-selected' : ''}" data-pl-drop-date="${m.date}">
            <div class="pl-day-col-head">
              <button type="button" data-pl-day="${m.date}" class="pl-day-col-title text-left min-w-0 flex-1" aria-label="เลือกวัน${m.wd} ${esc(fmtDate(m.date))}">
                <span class="pl-day-col-wd">${m.wd}</span>
                <span class="pl-day-col-num tabular-nums">${Number(m.date.slice(8))}</span>
                ${isToday ? '<span class="pl-today-tag">วันนี้</span>' : ''}
              </button>
              <button type="button" data-pl-quick-add="${m.date}" class="pl-col-add-btn" title="เพิ่มงานในวัน${m.wd}" aria-label="เพิ่มงานในวัน${m.wd}">${iconSvg('plus', { size: 13 })}</button>
            </div>
            <div class="pl-day-col-meta tabular-nums">
              <span class="${allDone ? 'text-emerald-700 font-semibold' : ''}">${m.items.length ? `${m.done}/${m.items.length} เสร็จ` : 'ว่าง'}</span>
              ${m.remCount ? `<span class="pl-col-rem-badge" title="มีนัดหมาย/แจ้งเตือน ${m.remCount} รายการ">🔔 ${m.remCount}</span>` : ''}
            </div>
            <div class="pl-day-col-list">
              ${m.items.length
                ? m.items.map(it => {
                    const key = `${it.kind}:${m.date}:${it.id}`;
                    return `
                      <div class="pl-board-task ${it.done ? 'is-done' : ''}" draggable="true" data-pl-drag="${esc(key)}">
                        <div class="pl-board-task-top">
                          <input type="checkbox" class="mt-0.5 w-4 h-4 accent-brand rounded shrink-0 cursor-pointer" data-pl-toggle="${esc(key)}" ${it.done ? 'checked' : ''} aria-label="ทำเครื่องหมาย ${esc(it.title)}">
                          <span class="pl-board-task-title ${it.done ? 'line-through text-slate-500' : ''}">${it.icon} ${esc(it.title)}</span>
                        </div>
                        <div class="pl-board-task-foot">
                          <span class="pl-board-task-tag">${esc(it.time ? `${it.time} · ` : '')}${esc(it.movedFrom ? 'ย้ายมา' : it.kind === 'workout' ? 'ออกกำลัง' : it.weekPattern === 'once' ? 'เฉพาะวัน' : it.weekStart ? 'สัปดาห์นี้' : it.weekPattern !== 'every' ? `รอบ ${it.weekPattern}` : 'ประจำ')}</span>
                          <button type="button" data-pl-move="${esc(key)}" class="pl-board-move-btn" title="ย้ายวัน / แก้ไข / ลบ" aria-label="จัดการ ${esc(it.title)}">${iconSvg('swap', { size: 13 })}<span>ย้าย</span></button>
                        </div>
                      </div>`;
                  }).join('')
                : '<p class="pl-col-empty">ลากงานมาวางที่นี่ หรือกด +</p>'}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

export function renderPlanner() {
  if (!root) return;
  const today = localDateStr();
  if (!isDateStr(selectedDate)) selectedDate = today;

  const prevStrip = $('#pl-day-strip', root);
  const prevScroll = prevStrip ? prevStrip.scrollLeft : 0;
  const hadStrip = Boolean(prevStrip?.children.length);

  const weekMonday = mondayOf(selectedDate);

  const weekDays = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(weekMonday, i);
    const items = itemsForDate(d);
    const done = items.filter(x => x.done).length;
    const remCount = remindersForDate(d).length;
    weekDays.push({ date: d, wd: WEEKDAYS[i], items, done, remCount });
  }

  const weekTotal = weekDays.reduce((sum, d) => sum + d.items.length, 0);
  const weekDone = weekDays.reduce((sum, d) => sum + d.done, 0);
  const selectedItems = itemsForDate(selectedDate);
  const selectedDone = selectedItems.filter(x => x.done).length;
  const stripDays = buildWeekStripRange(today, selectedDate);

  const mobileStripHtml = `
    <div id="pl-day-strip" class="tm-week-strip tabular-nums" role="listbox" aria-label="เลือกวันที่แบบเลื่อนซ้ายขวา">
      ${stripDays.map(m => {
        const items = itemsForDate(m.date);
        const done = items.filter(x => x.done).length;
        const remCount = remindersForDate(m.date).length;
        const isSel = m.date === selectedDate;
        const allDone = items.length > 0 && done === items.length;
        return `<button type="button" data-pl-day="${m.date}" role="option" aria-selected="${isSel}" aria-label="${esc(fmtDate(m.date))}" class="tm-day-pill relative ${isSel ? 'is-active' : ''} ${m.isToday ? 'is-today' : ''}">
          ${remCount ? `<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${isSel ? 'bg-amber-200' : 'bg-amber-500'}" title="มีนัดหมาย/แจ้งเตือน ${remCount} รายการ"></span>` : ''}
          <span class="tm-day-dow">${m.dow}</span>
          <span class="tm-day-num">${m.dayNum}</span>
          <span class="tm-day-meta ${isSel ? 'text-white/95' : allDone ? 'text-emerald-700 font-semibold' : 'text-slate-500'}">
            ${items.length ? `${done}/${items.length}` : '·'}
          </span>
        </button>`;
      }).join('')}
    </div>`;

  const shouldFlash = flashDayPanel;
  flashDayPanel = false;

  root.innerHTML = `
  <section class="card pl-card space-y-3">
    <div class="pl-card-head">
      <div class="pl-card-head-main">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm sm:text-base font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('planner', { size: 17, className: 'text-brand' })}<span>Weekly Planner</span></h2>
            <span id="pl-feedback-slot" class="pl-feedback-pill ${lastActionFeedback ? '' : 'hidden'}" role="status" aria-live="polite">${esc(lastActionFeedback)}</span>
          </div>
          <p class="text-[11px] sm:text-xs text-slate-500 tabular-nums">สัปดาห์ ${esc(weekRangeLabel(weekMonday))} · เสร็จแล้ว ${weekDone}/${weekTotal} งาน</p>
        </div>
        <div class="pl-card-actions">
          ${weekNavBarHtml({ isToday: selectedDate === today, todayAttrs: 'data-pl-week-today', showArrows: false })}
          <button type="button" data-pl-quick-add="${esc(selectedDate)}" class="chip min-h-[40px] bg-brand text-white font-semibold">${iconSvg('plus', { size: 14 })} เพิ่มงาน</button>
        </div>
      </div>
      <button type="button" data-pl-collapse class="pl-collapse-btn" aria-label="ย่อ Weekly Planner" title="ย่อ">${iconSvg('chevron-up', { size: 16 })}</button>
    </div>

    <div class="pl-mobile-view space-y-2.5">
      ${mobileStripHtml}
      ${!weekTotal ? `<div class="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between gap-2 text-xs text-amber-900">
        <span class="min-w-0">เพิ่มงานวางแผนในสัปดาห์นี้ได้ทันที</span>
        <button type="button" data-pl-quick-add="${esc(selectedDate)}" class="chip min-h-[36px] bg-white border border-amber-300 text-amber-900 font-semibold shrink-0">+ เพิ่มงาน</button>
      </div>` : ''}
      <div class="pl-day-panel ${shouldFlash ? 'pl-feedback-flash' : ''} rounded-2xl border border-slate-200/80 bg-slate-50/45 p-2.5 sm:p-3 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2 tabular-nums">
          <span class="text-xs sm:text-sm font-bold text-slate-800">วัน${WEEKDAYS[weekdayIdx(selectedDate)]} · ${esc(fmtDate(selectedDate))}${selectedDate === today ? ' <span class="text-[10px] px-1.5 py-0.5 rounded bg-brand text-white ml-1">วันนี้</span>' : ''}</span>
          <span class="text-[11px] sm:text-xs text-slate-500">${selectedDone}/${selectedItems.length} เสร็จ</span>
        </div>
        <div class="pl-task-list">${renderTaskListHtml(selectedDate)}</div>
      </div>
    </div>

    <div class="pl-desktop-view space-y-2">
      <div class="flex items-center justify-between text-xs text-slate-500">
        <span>ลากงานข้ามวันเพื่อย้ายตาราง หรือกดปุ่ม <b>ย้าย</b> เพื่อเลือกวันโดยไม่ต้องลาก</span>
        <span class="tabular-nums">วันที่เลือก: <b class="text-slate-700">${esc(fmtDate(selectedDate))}</b></span>
      </div>
      ${renderDesktopBoardHtml(weekDays, today)}
      ${renderDayReminderBanner(selectedDate)}
    </div>
  </section>`;
  bindSwipeRows($('.pl-task-list', root));
  const nextStrip = $('#pl-day-strip', root);
  if (nextStrip) {
    if (!hadStrip || stripScrollMode === 'center') {
      centerStripPill(nextStrip, '.is-active', { behavior: 'auto' });
    } else if (stripScrollMode === 'smooth') {
      centerStripPill(nextStrip, '.is-active', { behavior: 'smooth' });
    } else {
      nextStrip.scrollLeft = prevScroll;
    }
    stripScrollMode = 'preserve';
  }
}

function openRescheduleModal(kind, fromDate, id) {
  const items = itemsForDate(fromDate);
  const item = items.find(x => x.kind === kind && x.id === id);
  if (!item) return;

  const weekMonday = mondayOf(fromDate);
  const weekButtons = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekMonday, i);
    const isCurrent = d === fromDate;
    return `<button type="button" data-mv-to="${d}" ${isCurrent ? 'disabled' : ''} class="min-h-[44px] py-1.5 px-1 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center transition ${
      isCurrent
        ? 'bg-brand text-white border-brand opacity-75 cursor-default'
        : 'bg-white border-slate-200 text-slate-700 hover:bg-sky-soft'
    }">
      <span>${WEEKDAYS[i]}</span>
      <span class="text-[11px] font-bold tabular-nums">${Number(d.slice(8))}</span>
    </button>`;
  }).join('');

  const m = openModal(`
    <div class="flex justify-between items-center mb-3 gap-2">
      <h3 class="font-bold text-base sm:text-lg text-slate-800 inline-flex items-center gap-2 min-w-0">${iconSvg('swap', { size: 18, className: 'text-brand shrink-0' })}<span class="truncate">จัดการ & ย้ายวัน</span></h3>
      <button data-close type="button" class="min-w-[44px] min-h-[44px] rounded-xl text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 space-y-1.5 mb-4">
      <p class="font-semibold text-sm text-slate-800">${item.icon} ${esc(item.title)}</p>
      <p class="text-xs text-slate-500">วันที่ปัจจุบัน: <b class="text-slate-700">วัน${WEEKDAYS[weekdayIdx(fromDate)]} · ${esc(fmtDate(fromDate))}</b> · สถานะ: <b class="${item.done ? 'text-emerald-700' : 'text-slate-700'}">${item.done ? 'เสร็จแล้ว' : 'ยังไม่ทำ'}</b></p>
    </div>

    <div class="space-y-3">
      <div>
        <p class="lbl">ย้ายไปวันอื่นในสัปดาห์นี้ (แตะเพื่อย้ายทันที — คงสถานะเดิม)</p>
        <div class="grid grid-cols-7 gap-1.5">${weekButtons}</div>
      </div>

      <div class="pt-1 border-t border-slate-200/80">
        <label class="lbl" for="pl-move-date">หรือเลือกวันที่ปลายทางเอง (ย้ายข้ามสัปดาห์ได้)</label>
        <div class="flex items-center gap-2">
          <input id="pl-move-date" type="date" class="input min-h-[44px] flex-1" value="${esc(addDays(fromDate, 1))}">
          <button type="button" id="pl-move-confirm" class="btn btn-primary min-h-[44px] shrink-0">ย้ายวัน</button>
        </div>
      </div>

      <div class="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
        <button type="button" id="pl-modal-toggle" class="btn btn-ghost min-h-[44px] text-xs">${item.done ? 'ยังไม่ทำ' : 'ทำเสร็จ'}</button>
        <div class="flex flex-wrap gap-2">
          ${kind === 'routine'
            ? `<button type="button" id="pl-modal-edit" class="tm-food-action-btn" aria-label="แก้ไข ${esc(item.title)}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
               <button type="button" id="pl-modal-skip" class="tm-food-action-btn is-del" aria-label="ลบ ${esc(item.title)}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>`
            : `<button type="button" id="pl-modal-workout" class="btn btn-sky min-h-[44px] text-xs">ดูแผนในหน้าออกกำลังกาย</button>`}
        </div>
      </div>
    </div>
  `);

  m.el.addEventListener('click', async e => {
    const btn = e.target.closest('[data-mv-to]');
    if (!btn || btn.disabled) return;
    const toDate = btn.dataset.mvTo;
    await withBusyLock(btn, async () => {
      const ok = await rescheduleTask(kind, fromDate, id, toDate);
      if (ok) m.close();
    });
  });

  $('#pl-move-confirm', m.el)?.addEventListener('click', async e => {
    const confirmBtn = e.currentTarget;
    const toDate = $('#pl-move-date', m.el)?.value;
    if (!isDateStr(toDate)) return toast('กรุณาเลือกวันที่ที่ถูกต้อง', 'err');
    await withBusyLock(confirmBtn, async () => {
      const ok = await rescheduleTask(kind, fromDate, id, toDate);
      if (ok) m.close();
    });
  });

  $('#pl-modal-toggle', m.el)?.addEventListener('click', async e => {
    const toggleBtn = e.currentTarget;
    await withBusyLock(toggleBtn, async () => {
      const ok = await toggleTaskStatus(kind, fromDate, id, !item.done);
      if (ok) m.close();
    });
  });

  $('#pl-modal-edit', m.el)?.addEventListener('click', () => {
    m.close();
    openRoutinesModal({ editId: id, initialDate: fromDate });
  });

  $('#pl-modal-skip', m.el)?.addEventListener('click', async e => {
    const skipBtn = e.currentTarget;
    await withBusyLock(skipBtn, async () => {
      const res = skipRoutineOccurrence(getPlanner(), { routineId: id, dateStr: fromDate });
      if (!res.ok) return toast(res.message, 'err');
      const msg = formatPlannerToast('skip', {
        title: item.title,
        dateStr: fromDate,
        scopedToWeek: item.weekPattern === 'once'
      });
      setPlannerFeedback(msg);
      const saved = await savePlanner(res.planner);
      if (saved) {
        toast(item.weekPattern === 'once' ? 'ลบงานแล้ว' : `นำ "${item.title}" ออกจาก ${fmtDate(fromDate)} แล้ว (สัปดาห์อื่นคงเดิม)`);
        m.close();
      }
    });
  });

  $('#pl-modal-workout', m.el)?.addEventListener('click', () => {
    m.close();
    goFn('workout', 'w-date');
  });
}

function openRoutinesModal(opts = {}) {
  let editingId = null;
  const initialDate = isDateStr(opts.initialDate) ? opts.initialDate : (selectedDate || localDateStr());
  const weekMonday = mondayOf(initialDate);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekMonday, i));
  const weekDateSet = new Set(weekDates);

  let pickedDays = new Set([weekdayIdx(initialDate)]);
  let pickedIcon = '✨';

  const isScopedToThisWeek = r =>
    !!r && (
      (isDateStr(r.weekStart) && mondayOf(r.weekStart) === weekMonday) ||
      (r.weekPattern === 'once' && isDateStr(r.date) && mondayOf(r.date) === weekMonday)
    );

  const activeWeekdaysInWeek = (planner, r) =>
    weekDates.map((d, idx) => (isRoutineActiveOnDate(planner, r, d) ? idx : -1)).filter(idx => idx >= 0);

  const frequentRoutines = getFrequentRecentRoutines(getPlanner(), 10);
  const m = openModal(`
    <div class="flex justify-between items-center mb-2 gap-2">
      <h3 class="font-bold text-lg text-slate-800 inline-flex items-center gap-1.5 min-w-0">${iconSvg('planner', { size: 18, className: 'text-brand shrink-0' })}<span class="truncate">จัดการ & แก้ไข</span></h3>
      <button data-close type="button" class="min-w-[44px] min-h-[44px] rounded-xl text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <p class="text-xs text-slate-500 mb-3">ผูกเฉพาะสัปดาห์ <b class="text-slate-700">${esc(weekRangeLabel(weekMonday))}</b> (จันทร์–อาทิตย์) ไม่กระทบสัปดาห์อื่น</p>

    <div class="rounded-2xl bg-slate-50 border border-slate-200 p-3 space-y-3 mb-4">
      ${frequentRoutines.length ? `
      <div class="flex flex-wrap gap-1.5">
        ${frequentRoutines.map(item => `<button type="button" data-rt-preset="${esc(item.icon + '|' + item.title)}" class="chip bg-sky-soft/70 border border-sky-200 text-slate-700 text-xs hover:bg-sky-soft">${item.icon} ${esc(item.title)}</button>`).join('')}
      </div>` : ''}
      <div>
        <label class="lbl" for="rt-title">ชื่องาน / กิจกรรม *</label>
        <div class="flex items-center gap-2">
          <span id="rt-icon-badge" class="w-11 h-11 shrink-0 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-lg" title="อิโมจิของกิจกรรม">✨</span>
          <input id="rt-title" class="input flex-1 min-h-[44px]" placeholder="เช่น ล้างจาน, ส่งงาน, ออกกำลังกาย">
        </div>
      </div>
      <div id="rt-days-wrap" class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <label class="lbl !mb-0">วันในสัปดาห์ *</label>
          <div class="flex flex-wrap gap-1.5" id="rt-day-presets">
            ${DAY_PRESETS.map(p => `<button type="button" data-rt-days="${p.key}" class="px-2.5 py-1.5 min-h-[36px] rounded-lg border text-[11px] font-semibold transition">${p.label}</button>`).join('')}
          </div>
        </div>
        <div id="rt-days" class="grid grid-cols-7 gap-1"></div>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button type="button" id="rt-cancel-edit" class="btn btn-ghost text-xs">ยกเลิก</button>
        <button type="button" id="rt-save" class="btn btn-primary text-xs">${iconSvg('save', { size: 14 })} บันทึก</button>
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between gap-2 px-0.5">
        <span class="text-xs font-semibold text-slate-700" id="rt-list-title">รายการในสัปดาห์นี้</span>
        <span class="text-[11px] text-slate-500 tabular-nums">${esc(weekRangeLabel(weekMonday))}</span>
      </div>
      <div id="rt-list" class="tm-swipe-list tm-swipe-list--cards max-h-72 overflow-y-auto overscroll-contain"></div>
    </div>
  `, { wide: true });

  const renderDays = () => {
    const activePreset = matchingDayPreset(pickedDays);
    m.el.querySelectorAll('[data-rt-days]').forEach(btn => {
      const active = btn.dataset.rtDays === activePreset;
      btn.className = `px-2.5 py-1.5 min-h-[36px] rounded-lg border text-[11px] font-semibold transition ${
        active
          ? 'bg-brand text-white border-brand'
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
      }`;
    });
    const daysEl = $('#rt-days', m.el);
    if (!daysEl) return;
    daysEl.innerHTML = WEEKDAYS.map((wd, idx) => `
      <button type="button" data-rt-d="${idx}" class="min-h-[44px] py-1.5 rounded-xl border text-xs font-semibold ${pickedDays.has(idx) ? 'bg-brand text-white border-brand' : 'bg-white border-slate-200 text-slate-600'}">${wd}</button>
    `).join('');
  };

  const renderList = () => {
    const planner = getPlanner();
    const entries = planner.routines
      .map(r => ({ routine: r, daysInWeek: activeWeekdaysInWeek(planner, r) }))
      .filter(({ routine, daysInWeek }) => daysInWeek.length > 0 || isScopedToThisWeek(routine));

    const titleEl = $('#rt-list-title', m.el);
    if (titleEl) titleEl.textContent = `รายการในสัปดาห์นี้ (${entries.length})`;

    const listEl = $('#rt-list', m.el);
    listEl.innerHTML = entries.length ? entries.map(({ routine: r, daysInWeek }) => {
      const icon = inferRoutineEmoji(r.title, r.icon);
      const schedDesc = daysInWeek.length === 7
        ? 'ทุกวันในสัปดาห์นี้'
        : daysInWeek.length
          ? `วัน${daysInWeek.map(d => WEEKDAYS[d]).join(', ')}`
          : 'ไม่ได้เลือกวันในสัปดาห์นี้';
      return `
      <div class="tm-swipe-row">
        <div class="tm-swipe-actions">
          <button type="button" data-rt-edit="${esc(r.id)}" class="tm-swipe-action-btn is-edit" aria-label="แก้ไข ${esc(r.title)}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
          <button type="button" data-rt-del="${esc(r.id)}" class="tm-swipe-action-btn is-del" aria-label="ลบ ${esc(r.title)}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
        </div>
        <div class="tm-swipe-card !flex !flex-row items-center justify-between gap-3 !px-3.5 !py-2.5 min-h-[56px] text-sm">
          <div class="min-w-0 flex-1 space-y-0.5">
            <p class="font-semibold text-slate-800 truncate">${icon} ${esc(r.title)}</p>
            <p class="text-[11px] text-slate-500 truncate">${esc(schedDesc)}</p>
          </div>
          <div class="tm-row-actions shrink-0">
            <button type="button" data-rt-edit="${esc(r.id)}" class="tm-row-action-btn" aria-label="แก้ไข ${esc(r.title)}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
            <button type="button" data-rt-del="${esc(r.id)}" class="tm-row-action-btn is-del" aria-label="ลบ ${esc(r.title)}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
          </div>
        </div>
      </div>`;
    }).join('')
      : '<p class="text-xs text-slate-500 text-center py-5 rounded-xl bg-slate-50 border border-dashed border-slate-200">ยังไม่มีงานในสัปดาห์นี้</p>';
    bindSwipeRows(listEl);
  };

  const syncIconBadge = (titleVal = '') => {
    const badge = $('#rt-icon-badge', m.el);
    if (badge) badge.textContent = inferRoutineEmoji(titleVal, pickedIcon);
  };

  const startEditById = targetId => {
    const p = getPlanner();
    const r = p.routines.find(x => x.id === targetId);
    if (!r) return;
    editingId = r.id;
    pickedIcon = inferRoutineEmoji(r.title, r.icon);
    const activeDays = activeWeekdaysInWeek(p, r);
    const fallbackDays = Array.isArray(r.days) && r.days.length
      ? r.days
      : (isDateStr(r.date) ? [weekdayIdx(r.date)] : [weekdayIdx(initialDate)]);
    pickedDays = new Set(activeDays.length ? activeDays : fallbackDays);
    $('#rt-title', m.el).value = r.title;
    syncIconBadge(r.title);
    $('#rt-save', m.el).innerHTML = `${iconSvg('save', { size: 14 })} บันทึก`;
    renderDays();
  };

  const resetEdit = () => {
    editingId = null;
    pickedIcon = '✨';
    pickedDays = new Set([weekdayIdx(initialDate)]);
    $('#rt-title', m.el).value = '';
    $('#rt-save', m.el).innerHTML = `${iconSvg('save', { size: 14 })} บันทึก`;
    syncIconBadge('');
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

    const dayPreset = e.target.closest('[data-rt-days]');
    if (dayPreset) {
      const v = dayPreset.dataset.rtDays;
      const found = DAY_PRESETS.find(p => p.key === v);
      if (found) {
        pickedDays = matchingDayPreset(pickedDays) === v ? new Set() : new Set(found.days);
        renderDays();
      }
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
      startEditById(editBtn.dataset.rtEdit);
      return;
    }

    const delBtn = e.target.closest('[data-rt-del]');
    if (delBtn) {
      const targetId = delBtn.dataset.rtDel;
      const p = getPlanner();
      const orig = p.routines.find(x => x.id === targetId);
      let routines = p.routines;
      let moves = p.moves.filter(mv => !(mv.routineId === targetId && (weekDateSet.has(mv.from) || weekDateSet.has(mv.to))));
      let skips = [...p.skips];
      const doneMap = { ...p.doneMap };

      for (const wd of weekDates) {
        if (doneMap[wd]) {
          const rest = doneMap[wd].filter(id => id !== targetId);
          if (rest.length) doneMap[wd] = rest;
          else delete doneMap[wd];
        }
      }

      if (!orig || isScopedToThisWeek(orig)) {
        routines = p.routines.filter(x => x.id !== targetId);
        moves = moves.filter(mv => mv.routineId !== targetId);
        skips = skips.filter(sk => sk.routineId !== targetId);
      } else {
        for (const wd of weekDates) {
          if (routineAppliesToDate(orig, wd, p.altAnchor) && !skips.some(sk => sk.routineId === targetId && sk.date === wd)) {
            skips.push({ routineId: targetId, date: wd });
          }
        }
      }

      await withBusyLock(delBtn, async () => {
        if (editingId === targetId) resetEdit();
        const msg = !orig || isScopedToThisWeek(orig)
          ? 'ลบงานในสัปดาห์นี้แล้ว'
          : 'นำงานออกจากสัปดาห์นี้แล้ว (สัปดาห์อื่นคงเดิม)';
        setPlannerFeedback(msg);
        const saved = await savePlanner({ ...p, routines, moves, skips, doneMap });
        if (saved) toast(msg);
        renderList();
      });
    }
  });

  $('#rt-cancel-edit', m.el).addEventListener('click', () => {
    if (editingId) resetEdit();
    else m.close();
  });

  $('#rt-save', m.el).addEventListener('click', async e => {
    const saveBtn = e.currentTarget;
    const draft = validateRoutineDraft($('#rt-title', m.el).value, [...pickedDays]);
    if (!draft.ok) return toast(draft.message, 'err');
    const { title, days } = draft;

    const p = getPlanner();
    const icon = inferRoutineEmoji(title, pickedIcon);
    let routines = p.routines;
    let moves = p.moves;
    let skips = p.skips;
    const doneMap = { ...p.doneMap };

    if (editingId) {
      const orig = p.routines.find(x => x.id === editingId);
      if (!orig || isScopedToThisWeek(orig)) {
        const rec = { id: editingId, title, days, icon, weekStart: weekMonday };
        routines = p.routines.map(x => (x.id === editingId ? rec : x));
        moves = p.moves.filter(mv => !(mv.routineId === editingId && (weekDateSet.has(mv.from) || weekDateSet.has(mv.to))));
        skips = p.skips.filter(sk => !(sk.routineId === editingId && weekDateSet.has(sk.date)));
      } else {
        // งานเดิมเป็นแบบต่อเนื่อง: แยกบันทึกเฉพาะสัปดาห์นี้เพื่อไม่กระทบสัปดาห์อื่น
        const newId = 'r' + Date.now().toString(36);
        const rec = { id: newId, title, days, icon, weekStart: weekMonday };
        moves = p.moves.filter(mv => !(mv.routineId === orig.id && (weekDateSet.has(mv.from) || weekDateSet.has(mv.to))));
        skips = [...p.skips];
        for (const wd of weekDates) {
          if (routineAppliesToDate(orig, wd, p.altAnchor) && !skips.some(sk => sk.routineId === orig.id && sk.date === wd)) {
            skips.push({ routineId: orig.id, date: wd });
          }
          if (doneMap[wd]?.includes(orig.id)) {
            const rest = doneMap[wd].filter(id => id !== orig.id);
            if (days.includes(weekdayIdx(wd))) rest.push(newId);
            if (rest.length) doneMap[wd] = [...new Set(rest)];
            else delete doneMap[wd];
          }
        }
        routines = [...p.routines, rec];
      }
    } else {
      const rec = {
        id: 'r' + Date.now().toString(36),
        title,
        days,
        icon,
        weekStart: weekMonday
      };
      routines = [...p.routines, rec];
    }

    await withBusyLock(saveBtn, async () => {
      const msg = formatPlannerToast(editingId ? 'save-edit' : 'save-new');
      setPlannerFeedback(msg);
      const saved = await savePlanner({ ...p, routines, moves, skips, doneMap });
      if (!saved) return;
      toast(isPreviewMode() ? `${msg} (โหมดดูตัวอย่าง)` : msg);
      resetEdit();
      renderList();
    });
  });

  if (opts.editId) {
    startEditById(opts.editId);
  } else {
    renderDays();
  }
  renderList();
}
