import { addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { bodyLatest } from './body.js';
import { findExerciseImage } from './exerciseMedia.js';
import { runActiveWorkout } from './workoutActive.js';
import { $, $$, esc, fmtDate, localDateStr, parseLocal, addDays, toNum, toast, openModal } from './util.js';

export const TYPES = {
  walk: 'เดิน (Walk)', upper: 'Upper body', lower: 'Lower body', full: 'Full body',
  pilates: 'พิลาทิส (Pilates)', stretch: 'ยืดเหยียด (Stretching)', other: 'อื่น ๆ'
};
export const SECTIONS = [['warmup', 'วอร์มอัพ (Warm-up)', 'fa-fire'], ['main', 'ท่าหลัก (Main workout)', 'fa-dumbbell'], ['cooldown', 'คูลดาวน์ (Cool-down)', 'fa-snowflake']];
const STARTER = ['Goblet Squat', 'Standing RDL', 'Bent-Over Row', 'Shoulder Press', 'Bicep Curl', 'Lateral Raise', 'Push-up', 'Glute Bridge', 'Lunge', 'Plank', 'Cat-Cow', 'Child’s Pose', 'Hamstring Stretch', 'เดินเร็ว'];
const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
// ค่า MET (Compendium of Physical Activities, ปัดเป็นช่วงโดยประมาณ) ตามประเภทและความหนัก
const MET = { walk: [2.8, 3.5, 5.0], upper: [3.0, 3.5, 6.0], lower: [3.0, 3.5, 6.0], full: [3.5, 4.3, 6.0], pilates: [2.5, 3.0, 4.0], stretch: [2.0, 2.3, 3.0], other: [3.0, 4.0, 6.0] };
export const INTENSITY = [['light', 'เบา'], ['moderate', 'ปานกลาง'], ['vigorous', 'หนัก']];
export const currentWeightKg = () => bodyLatest(state.body).weight?.v ?? state.profile?.weightKg ?? null;
// พลังงานที่เผาผลาญ "เพิ่มจากตอนพัก" = (MET − 1) × น้ำหนัก(กก.) × ชั่วโมง (ไม่นับ BMR ซ้ำกับ TDEE) — ค่าจริงคลาดเคลื่อนได้ ±25%
export function estimateBurn(type, intensity, minutes, weightKg) {
  if (!minutes || !weightKg) return null;
  const idx = Math.max(0, INTENSITY.findIndex(i => i[0] === intensity));
  return Math.round(((MET[type] || MET.other)[idx < 0 ? 1 : idx] - 1) * weightKg * minutes / 60);
}
export const repLabel = u => (u === 'sec' ? 'วินาที' : u === 'min' ? 'นาที' : 'ครั้ง');

let root, draft = emptyDraft();
let weekStart = '';
let editingId = null;
let editingTemplateId = null;

function emptyDraft() { return { warmup: [], main: [], cooldown: [] }; }
const blankRow = () => ({ name: '', imageUrl: '', weightKg: null, perSide: false, sets: 1, reps: null, repUnit: 'reps', note: '' });
function mondayOf(dateStr) {
  const dt = parseLocal(dateStr || localDateStr());
  const offset = (dt.getDay() + 6) % 7;
  return addDays(localDateStr(dt), -offset);
}

export function mountWorkout(el) {
  root = el;
  const today = localDateStr();
  weekStart = mondayOf(today);
  root.innerHTML = `
  <div class="lg:col-span-2 space-y-6">
    <div class="card space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-dumbbell text-brand"></i> บันทึก & วางแผนออกกำลังกาย</h2>
        <span id="w-edit-badge" class="hidden text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">กำลังแก้ไขบันทึกเดิม</span>
      </div>

      <div class="rounded-2xl border border-lav-soft bg-slate-50/70 p-3 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-semibold text-slate-700"><i class="fa-solid fa-calendar-week text-brand mr-1"></i>วางแผนรายสัปดาห์ (จ–อา)</span>
          <div class="flex items-center gap-1">
            <button type="button" id="w-wk-prev" class="chip bg-white border border-slate-200 text-slate-600" aria-label="สัปดาห์ก่อน"><i class="fa-solid fa-chevron-left"></i></button>
            <button type="button" id="w-wk-now" class="chip bg-lav-soft text-brand-dark">สัปดาห์นี้</button>
            <button type="button" id="w-wk-next" class="chip bg-white border border-slate-200 text-slate-600" aria-label="สัปดาห์หน้า"><i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>
        <div id="w-week-strip" class="grid grid-cols-7 gap-1.5"></div>
        <div id="w-day-plans" class="space-y-1.5"></div>
      </div>

      <div id="w-tpl-edit-bar" class="hidden rounded-xl border border-violet-200 bg-lav-soft/60 p-3 space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-semibold text-brand-dark"><i class="fa-solid fa-pen-to-square mr-1"></i>กำลังแก้ไขเทมเพลต:</span>
          <input id="w-tpl-edit-name" class="input !w-auto flex-1 min-w-[160px]" placeholder="ชื่อเทมเพลต">
          <button type="button" id="w-tpl-edit-save" class="btn btn-primary !py-1.5 !px-3 text-xs"><i class="fa-solid fa-floppy-disk"></i> บันทึกเทมเพลต</button>
          <button type="button" id="w-tpl-edit-cancel" class="btn btn-ghost !py-1.5 !px-2.5 text-xs">ยกเลิก</button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div><label class="lbl">วันที่</label><input type="date" id="w-date" class="input"></div>
        <div><label class="lbl">สถานะ</label><select id="w-status" class="input"><option value="done">ทำจริงแล้ว</option><option value="planned">วางแผนไว้</option></select></div>
        <div><label class="lbl">ประเภท</label><select id="w-type" class="input">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
        <div><label class="lbl">ระยะเวลารวม (นาที)</label><input id="w-dur" type="number" inputmode="numeric" class="input" placeholder="ไม่บังคับ"></div>
        <div><label class="lbl">ความหนัก</label><select id="w-int" class="input"><option value="light">เบา (คุยได้สบาย)</option><option value="moderate" selected>ปานกลาง</option><option value="vigorous">หนัก (เหนื่อยมาก)</option></select></div>
        <div><label class="lbl">เริ่มจากเทมเพลต</label><select id="w-tpl" class="input"><option value="">เลือกเทมเพลต…</option></select></div>
      </div>
      <p id="w-burn" class="text-xs text-slate-500 -mt-1"></p>
      <div class="flex flex-wrap gap-2">
        <button type="button" id="w-last" class="chip bg-sky-soft text-blue-700"><i class="fa-solid fa-clock-rotate-left"></i> ใช้แผนล่าสุดของประเภทนี้</button>
        <button type="button" id="w-clear" class="chip bg-slate-100 text-slate-600"><i class="fa-solid fa-eraser"></i> ล้างฟอร์ม</button>
      </div>
      <div id="w-sections" class="space-y-5"></div>
      <div><label class="lbl">หมายเหตุ</label><input id="w-note" class="input" placeholder="เช่น รู้สึกเหนื่อยง่าย, ปรับลดน้ำหนักลง, เพิ่มท่า"></div>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" id="w-edit-cancel" class="btn btn-ghost hidden">ยกเลิกการแก้ไข</button>
        <button type="button" id="w-active" class="btn btn-soft"><i class="fa-solid fa-play"></i> เริ่มตามแผน</button>
        <button type="button" id="w-tpl-save" class="btn btn-soft"><i class="fa-solid fa-bookmark"></i> บันทึกเป็นเทมเพลต</button>
        <button type="button" id="w-save" class="btn btn-primary"><i class="fa-solid fa-check"></i> บันทึกการออกกำลังกาย</button>
      </div>
      <datalist id="w-names"></datalist>
    </div>
  </div>
  <div class="space-y-6">
    <div class="card space-y-3"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-chart-simple text-brand"></i> 7 วันที่ผ่านมา</h3><div id="w-week" class="text-sm text-slate-700 space-y-1"></div></div>
    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-list text-brand"></i> ประวัติ & แผนที่บันทึก</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input id="w-hist-q" class="input text-xs sm:col-span-3" placeholder="🔍 ค้นหาชื่อท่าออกกำลังกาย / ประเภท / โน้ต">
        <div><label class="lbl">ตั้งแต่</label><input type="date" id="w-hist-from" class="input text-xs"></div>
        <div><label class="lbl">ถึง</label><input type="date" id="w-hist-to" class="input text-xs"></div>
        <div class="flex items-end"><button type="button" id="w-hist-clear" class="chip bg-slate-100 text-slate-600 w-full justify-center py-2">ล้างตัวกรอง</button></div>
      </div>
      <div id="w-history" class="space-y-2"></div>
      <div id="w-tpl-list" class="pt-3 border-t border-slate-100 space-y-1.5"></div>
    </div>
  </div>`;

  $('#w-date', root).value = today;
  $('#w-sections', root).addEventListener('input', onInput);
  $('#w-sections', root).addEventListener('change', onInput);
  $('#w-sections', root).addEventListener('click', e => {
    const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-rm]'), media = e.target.closest('[data-media]');
    if (media) {
      const [sec, i] = media.dataset.media.split(':');
      const row = draft[sec]?.[+i];
      if (!row?.name.trim()) return toast('ใส่ชื่อท่าก่อนค้นหารูป', 'err');
      media.disabled = true;
      findExerciseImage(row.name).then(hit => {
        if (!hit) return toast('ไม่พบภาพท่าที่ตรงกัน — วาง URL รูป/GIF เองได้');
        row.imageUrl = hit.url;
        renderSections();
        toast('เพิ่มรูปตัวอย่างจาก Free Exercise DB แล้ว');
      }).catch(err => toast(err.message, 'err')).finally(() => { media.disabled = false; });
      return;
    }
    if (add) { draft[add.dataset.add].push(blankRow()); renderSections(); }
    if (rm) { const [sec, i] = rm.dataset.rm.split(':'); draft[sec].splice(+i, 1); renderSections(); }
  });

  $('#w-wk-prev', root).addEventListener('click', () => { weekStart = addDays(weekStart, -7); renderWeekStrip(); });
  $('#w-wk-next', root).addEventListener('click', () => { weekStart = addDays(weekStart, 7); renderWeekStrip(); });
  $('#w-wk-now', root).addEventListener('click', () => { const t = localDateStr(); weekStart = mondayOf(t); selectPlanDate(t); });
  $('#w-week-strip', root).addEventListener('click', e => {
    const b = e.target.closest('[data-wday]');
    if (b) selectPlanDate(b.dataset.wday);
  });
  $('#w-day-plans', root).addEventListener('click', handleRecordAction);
  $('#w-history', root).addEventListener('click', handleRecordAction);
  ['w-hist-q', 'w-hist-from', 'w-hist-to'].forEach(id => {
    $('#' + id, root).addEventListener('input', renderHistory);
    $('#' + id, root).addEventListener('change', renderHistory);
  });
  $('#w-hist-clear', root).addEventListener('click', () => {
    $('#w-hist-q', root).value = '';
    $('#w-hist-from', root).value = '';
    $('#w-hist-to', root).value = '';
    renderHistory();
  });

  $('#w-date', root).addEventListener('change', () => {
    const d = $('#w-date', root).value || localDateStr();
    weekStart = mondayOf(d);
    if (!editingId) $('#w-status', root).value = d > localDateStr() ? 'planned' : 'done';
    renderWeekStrip();
  });

  $('#w-tpl', root).addEventListener('change', e => {
    const t = state.templates.find(x => x.id === e.target.value);
    if (t) loadSections(t.sections, t.type);
    e.target.value = '';
  });
  $('#w-last', root).addEventListener('click', useLast);
  $('#w-clear', root).addEventListener('click', clearForm);
  $('#w-edit-cancel', root).addEventListener('click', clearForm);
  $('#w-save', root).addEventListener('click', save);
  $('#w-active', root).addEventListener('click', startActiveWorkout);
  ['w-dur', 'w-int', 'w-type'].forEach(id => $('#' + id, root).addEventListener('input', burnPreview));
  burnPreview();

  $('#w-tpl-save', root).addEventListener('click', saveTemplatePrompt);
  $('#w-tpl-edit-save', root).addEventListener('click', saveEditedTemplate);
  $('#w-tpl-edit-cancel', root).addEventListener('click', exitTemplateEdit);
  $('#w-tpl-list', root).addEventListener('click', e => {
    const useBtn = e.target.closest('[data-tuse]');
    const editBtn = e.target.closest('[data-tedit]');
    const delBtn = e.target.closest('[data-tdel]');
    if (useBtn) {
      const t = state.templates.find(x => x.id === useBtn.dataset.tuse);
      if (t) { loadSections(t.sections, t.type); window.scrollTo({ top: root.offsetTop, behavior: 'smooth' }); }
    }
    if (editBtn) startTemplateEdit(editBtn.dataset.tedit);
    if (delBtn && confirm('ลบเทมเพลตนี้?')) {
      if (editingTemplateId === delBtn.dataset.tdel) exitTemplateEdit();
      deleteDoc(userDoc(state.uid, 'workout_templates', delBtn.dataset.tdel)).catch(err => toast(err.message, 'err'));
    }
  });

  renderSections();
  render();
}

function selectPlanDate(d) {
  $('#w-date', root).value = d;
  if (!editingId) $('#w-status', root).value = d > localDateStr() ? 'planned' : 'done';
  renderWeekStrip();
}

function handleRecordAction(e) {
  const doneBtn = e.target.closest('[data-done-workout]');
  const editBtn = e.target.closest('[data-edit-workout]');
  const againBtn = e.target.closest('[data-again]');
  const delBtn = e.target.closest('[data-del]');
  if (doneBtn) {
    updateDoc(userDoc(state.uid, 'workout_records', doneBtn.dataset.doneWorkout), { status: 'done', updatedAt: new Date() })
      .then(() => toast('อัปเดตเป็นทำเสร็จแล้ว 💪'))
      .catch(err => toast(err.message, 'err'));
  }
  if (editBtn) startRecordEdit(editBtn.dataset.editWorkout);
  if (againBtn) {
    const r = state.workouts.find(x => x.id === againBtn.dataset.again);
    if (r) {
      editingId = null;
      updateRecordEditUi();
      loadSections(r.sections, r.type);
      window.scrollTo({ top: root.offsetTop, behavior: 'smooth' });
    }
  }
  if (delBtn && confirm('ลบบันทึกนี้?')) {
    if (editingId === delBtn.dataset.del) clearForm();
    deleteDoc(userDoc(state.uid, 'workout_records', delBtn.dataset.del)).catch(err => toast(err.message, 'err'));
  }
}

function updateRecordEditUi() {
  const isEdit = !!editingId;
  $('#w-edit-badge', root).classList.toggle('hidden', !isEdit);
  $('#w-edit-cancel', root).classList.toggle('hidden', !isEdit);
  $('#w-save', root).innerHTML = isEdit
    ? '<i class="fa-solid fa-floppy-disk"></i> บันทึกการแก้ไข'
    : '<i class="fa-solid fa-check"></i> บันทึกการออกกำลังกาย';
}

function startRecordEdit(id) {
  const r = state.workouts.find(x => x.id === id);
  if (!r) return;
  editingId = r.id;
  $('#w-date', root).value = r.date || localDateStr();
  weekStart = mondayOf($('#w-date', root).value);
  $('#w-status', root).value = r.status === 'planned' ? 'planned' : 'done';
  $('#w-type', root).value = TYPES[r.type] ? r.type : 'other';
  $('#w-dur', root).value = r.durationMin ?? '';
  $('#w-int', root).value = ['light', 'moderate', 'vigorous'].includes(r.intensity) ? r.intensity : 'moderate';
  $('#w-note', root).value = r.note || '';
  draft = { warmup: [], main: [], cooldown: [] };
  for (const k of Object.keys(draft)) draft[k] = (r.sections?.[k] || []).map(row => ({ ...blankRow(), ...row }));
  updateRecordEditUi();
  renderSections();
  burnPreview();
  renderWeekStrip();
  window.scrollTo({ top: root.offsetTop, behavior: 'smooth' });
  toast('โหลดบันทึกเข้าสู่โหมดแก้ไขแล้ว — ปรับแผนหรือผลจริงได้ตามต้องการ');
}

function clearForm() {
  editingId = null;
  draft = emptyDraft();
  $('#w-note', root).value = '';
  $('#w-dur', root).value = '';
  $('#w-status', root).value = ($('#w-date', root).value || localDateStr()) > localDateStr() ? 'planned' : 'done';
  updateRecordEditUi();
  renderSections();
  burnPreview();
}

function startTemplateEdit(id) {
  const t = state.templates.find(x => x.id === id);
  if (!t) return;
  editingTemplateId = t.id;
  $('#w-tpl-edit-name', root).value = t.name || '';
  $('#w-tpl-edit-bar', root).classList.remove('hidden');
  loadSections(t.sections, t.type, true);
  window.scrollTo({ top: root.offsetTop, behavior: 'smooth' });
  toast('กำลังแก้ไขเทมเพลต "' + t.name + '"');
}

function exitTemplateEdit() {
  editingTemplateId = null;
  $('#w-tpl-edit-name', root).value = '';
  $('#w-tpl-edit-bar', root).classList.add('hidden');
}

async function saveEditedTemplate() {
  if (!editingTemplateId) return;
  const name = $('#w-tpl-edit-name', root).value.trim().slice(0, 60);
  if (!name) return toast('กรุณาตั้งชื่อเทมเพลต', 'err');
  const sections = clean();
  if (!Object.values(sections).some(r => r.length)) return toast('เพิ่มท่าอย่างน้อย 1 ท่าก่อนบันทึกเทมเพลต', 'err');
  try {
    await updateDoc(userDoc(state.uid, 'workout_templates', editingTemplateId), {
      name,
      type: $('#w-type', root).value,
      sections,
      updatedAt: new Date()
    });
    toast('บันทึกการแก้ไขเทมเพลตแล้ว');
    exitTemplateEdit();
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'err');
  }
}

function burnPreview() {
  const el = $('#w-burn', root), kcal = estimateBurn($('#w-type', root).value, $('#w-int', root).value, toNum($('#w-dur', root).value), currentWeightKg());
  el.textContent = kcal ? `🔥 เผาผลาญเพิ่มประมาณ ${kcal} kcal (ค่าประมาณ ±25% คิดจากน้ำหนัก ${currentWeightKg()} กก.)`
    : (!currentWeightKg() ? 'ใส่น้ำหนักในแท็บน้ำหนัก (หรือ ตั้งค่า) เพื่อประมาณแคลอรี่ที่เผาผลาญ' : 'ใส่ระยะเวลารวมเพื่อประมาณแคลอรี่ที่เผาผลาญ');
}
function loadSections(sec, type, silent = false) {
  draft = { warmup: [], main: [], cooldown: [] };
  for (const k of Object.keys(draft)) draft[k] = (sec?.[k] || []).map(r => ({ ...blankRow(), ...r }));
  if (type) $('#w-type', root).value = type;
  renderSections();
  if (!silent) toast('นำท่ามาใส่ในฟอร์มแล้ว — ปรับน้ำหนัก/จำนวนได้เลย');
}
function useLast() {
  const type = $('#w-type', root).value;
  const last = state.workouts.filter(w => w.type === type).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return toast('ยังไม่มีประวัติของประเภทนี้', 'err');
  loadSections(last.sections, type);
}

// เก็บค่าที่พิมพ์ลง draft ทันที (ไม่ต้อง re-render จึงไม่เสียโฟกัส)
function onInput(e) {
  const t = e.target, sec = t.dataset.sec; if (!sec) return;
  const row = draft[sec][+t.dataset.i]; if (!row) return;
  const k = t.dataset.k;
  if (k === 'name' || k === 'note' || k === 'repUnit' || k === 'imageUrl') row[k] = t.value;
  else if (k === 'perSide') row.perSide = t.checked;
  else row[k] = toNum(t.value);
  if (k === 'name' && e.type === 'change') { const h = t.closest('[data-row]')?.querySelector('[data-hint]'); if (h) h.textContent = lastHint(t.value); }
  if (k === 'repUnit') renderSections();
}

function lastPerformance(name) {
  const n = name.trim().toLowerCase(); if (!n) return null;
  for (const w of state.workouts.filter(x => x.status !== 'planned').slice().sort((a, b) => b.date.localeCompare(a.date)))
    for (const sec of ['main', 'warmup', 'cooldown']) { const r = (w.sections?.[sec] || []).find(x => x.name.toLowerCase() === n); if (r) return { r, date: w.date }; }
  return null;
}
const rowText = r => `${r.weightKg != null ? r.weightKg + ' kg' + (r.perSide ? '/ข้าง' : '') + ' · ' : ''}${r.sets || 1} × ${r.reps ?? '-'} ${repLabel(r.repUnit)}`;
const lastHint = name => { const p = lastPerformance(name); return p ? `ครั้งล่าสุด (${fmtDate(p.date)}): ${rowText(p.r)}` : ''; };

function renderSections() {
  $('#w-sections', root).innerHTML = SECTIONS.map(([k, title, icon], si) => `
    <div class="rounded-xl border border-lav-soft p-3 space-y-3">
      <h4 class="font-semibold text-slate-700 text-sm"><span class="text-brand mr-1">${si + 1}.</span><i class="fa-solid ${icon} text-brand"></i> ${title}</h4>
      ${draft[k].length ? draft[k].map((r, i) => `
        <div data-row class="bg-slate-50 rounded-lg p-2 space-y-2">
          <div class="flex gap-2"><input data-sec="${k}" data-i="${i}" data-k="name" list="w-names" class="input" placeholder="ชื่อท่า เช่น Goblet Squat" value="${esc(r.name)}"><button type="button" data-rm="${k}:${i}" class="text-rose-400 hover:text-rose-600 px-2" aria-label="ลบท่า"><i class="fa-solid fa-trash-can text-xs"></i></button></div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="lbl">น้ำหนัก (kg)</label><input data-sec="${k}" data-i="${i}" data-k="weightKg" type="number" step="0.5" inputmode="decimal" class="input" value="${r.weightKg ?? ''}"></div>
            <div><label class="lbl">เซต</label><input data-sec="${k}" data-i="${i}" data-k="sets" type="number" inputmode="numeric" class="input" value="${r.sets ?? ''}"></div>
            <div><label class="lbl">${repLabel(r.repUnit)}</label><input data-sec="${k}" data-i="${i}" data-k="reps" type="number" inputmode="numeric" class="input" value="${r.reps ?? ''}"></div>
          </div>
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <label class="flex items-center gap-1"><input data-sec="${k}" data-i="${i}" data-k="perSide" type="checkbox" ${r.perSide ? 'checked' : ''}> น้ำหนักข้างละ (ต่อข้าง)</label>
            <select data-sec="${k}" data-i="${i}" data-k="repUnit" class="input !w-auto !py-1"><option value="reps" ${r.repUnit === 'reps' ? 'selected' : ''}>ครั้ง</option><option value="sec" ${r.repUnit === 'sec' ? 'selected' : ''}>วินาที</option><option value="min" ${r.repUnit === 'min' ? 'selected' : ''}>นาที</option></select>
          </div>
          <div class="space-y-2 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-3 md:space-y-0"><input data-sec="${k}" data-i="${i}" data-k="imageUrl" type="url" class="input" placeholder="URL รูป/GIF (ไม่บังคับ)" value="${esc(r.imageUrl || "")}"><button type="button" data-media="${k}:${i}" class="chip bg-sky-soft text-blue-700 md:whitespace-nowrap">ค้นหารูปที่ตรงกับท่า</button></div>${r.imageUrl ? `<img src="${esc(r.imageUrl)}" alt="ตัวอย่าง ${esc(r.name)}" loading="lazy" class="max-h-36 rounded-lg object-contain bg-white md:max-h-48">` : '<p class="text-xs text-slate-400">ภาพตัวอย่างจะแสดงเมื่อเพิ่ม URL หรือพบภาพที่ตรงกับชื่อท่า</p>'}<input data-sec="${k}" data-i="${i}" data-k="note" class="input" placeholder="โน้ตท่า เช่น เน้นควบคุมการย่อตัว" value="${esc(r.note)}">
          <p data-hint class="text-[11px] text-slate-500">${esc(lastHint(r.name))}</p>
        </div>`).join('') : '<p class="text-xs text-slate-400">ยังไม่มีท่า</p>'}
      <button type="button" data-add="${k}" class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-plus"></i> เพิ่มท่า</button>
    </div>`).join('');
}

const clean = () => Object.fromEntries(Object.entries(draft).map(([k, rows]) => [k, rows.filter(r => r.name.trim()).map(r => ({
  name: r.name.trim().slice(0, 80), imageUrl: (r.imageUrl || '').trim().slice(0, 1000), weightKg: r.weightKg, perSide: !!r.perSide, sets: Math.max(1, Math.round(r.sets || 1)), reps: r.reps, repUnit: r.repUnit || 'reps', note: (r.note || '').trim().slice(0, 120)
}))]));

async function startActiveWorkout() {
  const sections = clean(), rows = SECTIONS.flatMap(([section, sectionLabel]) => (sections[section] || []).map(r => ({ ...r, section, sectionLabel })));
  if (!rows.length) return toast('เพิ่มท่าอย่างน้อย 1 ท่าก่อนเริ่ม', 'err');
  const type = $('#w-type', root).value, intensity = $('#w-int', root).value;
  try {
    await runActiveWorkout(rows, async (performedSets, actualMinutes) => {
      const duration = toNum($('#w-dur', root).value) || actualMinutes, volumeKg = performedSets.reduce((sum, x) => sum + (x.weightKg || 0) * (x.reps || 0), 0);
      const payload = {
        date: $('#w-date', root).value, type, typeLabel: TYPES[type], status: 'done',
        durationMin: duration, intensity, estKcal: estimateBurn(type, intensity, duration, currentWeightKg()),
        sections, performedSets, completedSetCount: performedSets.length, volumeKg, note: $('#w-note', root).value.trim()
      };
      if (editingId) {
        await updateDoc(userDoc(state.uid, 'workout_records', editingId), { ...payload, updatedAt: new Date() });
      } else {
        await addDoc(userCol(state.uid, 'workout_records'), { ...payload, createdAt: new Date() });
      }
      toast('บันทึกแล้ว · ' + performedSets.length + ' เซต · ' + Math.round(volumeKg) + ' kg รวม');
      clearForm();
      render();
    });
  } catch (err) { toast('บันทึกไม่สำเร็จ: ' + err.message, 'err'); }
}

async function save() {
  const sections = clean(), count = Object.values(sections).reduce((a, r) => a + r.length, 0);
  const dur = toNum($('#w-dur', root).value);
  if (!count && !dur) return toast('เพิ่มท่าอย่างน้อย 1 ท่า หรือใส่ระยะเวลา (เช่น เดิน 30 นาที)', 'err');
  const date = $('#w-date', root).value;
  if (!date) return toast('กรุณาเลือกวันที่', 'err');
  const type = $('#w-type', root).value;
  const status = $('#w-status', root).value === 'planned' ? 'planned' : 'done';
  const intensity = $('#w-int', root).value;
  const payload = {
    date, type, typeLabel: TYPES[type], status, durationMin: dur, intensity,
    estKcal: estimateBurn(type, intensity, dur, currentWeightKg()), sections, note: $('#w-note', root).value.trim()
  };
  try {
    if (editingId) {
      await updateDoc(userDoc(state.uid, 'workout_records', editingId), { ...payload, updatedAt: new Date() });
      toast('อัปเดตบันทึกการออกกำลังกายแล้ว 💪');
    } else {
      await addDoc(userCol(state.uid, 'workout_records'), { ...payload, createdAt: new Date() });
      toast(status === 'planned' ? 'บันทึกแผนออกกำลังกายแล้ว 📅' : 'บันทึกการออกกำลังกายแล้ว 💪');
    }
    clearForm();
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'err');
  }
}

function saveTemplatePrompt() {
  const sections = clean();
  if (!Object.values(sections).some(r => r.length)) return toast('เพิ่มท่าก่อนบันทึกเป็นเทมเพลต', 'err');
  if (editingTemplateId) {
    saveEditedTemplate();
    return;
  }
  const { el, close } = openModal(`
    <h3 class="font-bold text-slate-800 mb-3"><i class="fa-solid fa-bookmark text-brand mr-1"></i> บันทึกเป็นเทมเพลตใหม่</h3>
    <div class="space-y-3">
      <div><label class="lbl">ชื่อเทมเพลต</label><input id="wt-name" class="input" placeholder="เช่น Day A / Upper body 1"></div>
      <div class="flex justify-end gap-2">
        <button type="button" data-close class="btn btn-ghost">ยกเลิก</button>
        <button type="button" id="wt-ok" class="btn btn-primary">บันทึก</button>
      </div>
    </div>`);
  const inp = $('#wt-name', el);
  inp.focus();
  const submit = async () => {
    const name = inp.value.trim().slice(0, 60);
    if (!name) return toast('กรุณาตั้งชื่อเทมเพลต', 'err');
    try {
      await addDoc(userCol(state.uid, 'workout_templates'), { name, type: $('#w-type', root).value, sections, createdAt: new Date() });
      toast('บันทึกเทมเพลตแล้ว');
      close();
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#wt-ok', el).addEventListener('click', submit);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
}

function renderWeekStrip() {
  if (!root) return;
  const selected = $('#w-date', root).value || localDateStr();
  const today = localDateStr();
  if (!weekStart) weekStart = mondayOf(selected);

  const byDate = {};
  state.workouts.forEach(w => {
    if (!w.date) return;
    (byDate[w.date] ||= []).push(w);
  });

  $('#w-week-strip', root).innerHTML = WEEKDAYS.map((wd, idx) => {
    const d = addDays(weekStart, idx);
    const list = byDate[d] || [];
    const hasDone = list.some(x => x.status !== 'planned');
    const hasPlanned = list.some(x => x.status === 'planned');
    const isSel = d === selected;
    const isToday = d === today;
    const dayNum = Number(d.slice(8));
    return `<button type="button" data-wday="${d}" class="flex flex-col items-center justify-center rounded-xl border py-1.5 px-1 text-xs transition ${
      isSel ? 'bg-brand text-white border-brand shadow-sm'
        : isToday ? 'bg-white border-brand/50 text-brand-dark font-semibold hover:bg-lav-soft/60'
        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
    }">
      <span class="text-[11px] opacity-80">${wd}</span>
      <span class="text-sm font-bold leading-tight">${dayNum}</span>
      <span class="flex items-center gap-0.5 h-2 mt-0.5">
        ${hasDone ? `<span class="w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-emerald-500'}" title="ทำแล้ว"></span>` : ''}
        ${hasPlanned ? `<span class="w-1.5 h-1.5 rounded-full ${isSel ? 'bg-amber-200' : 'bg-amber-400'}" title="วางแผนไว้"></span>` : ''}
      </span>
    </button>`;
  }).join('');

  const dayList = byDate[selected] || [];
  $('#w-day-plans', root).innerHTML = dayList.length ? dayList.map(w => `
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-lav-soft px-3 py-2 text-xs">
      <div class="min-w-0">
        <span class="px-1.5 py-0.5 rounded font-medium mr-1 ${w.status === 'planned' ? 'bg-amber-100 text-amber-800' : 'bg-ok-soft text-green-700'}">${w.status === 'planned' ? 'แผน' : 'ทำแล้ว'}</span>
        <b>${esc(TYPES[w.type] || w.type)}</b>${w.durationMin ? ` · ${w.durationMin} นาที` : ''}
        ${w.note ? `<span class="text-slate-400 ml-1">${esc(w.note)}</span>` : ''}
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${w.status === 'planned' ? `<button type="button" data-done-workout="${esc(w.id)}" class="chip bg-ok-soft text-green-700">ทำเสร็จ</button>` : ''}
        <button type="button" data-edit-workout="${esc(w.id)}" class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-pen"></i> แก้ไข</button>
      </div>
    </div>`).join('')
    : `<p class="text-[11px] text-slate-400">ยังไม่มีแผนหรือบันทึกในวันที่ ${esc(fmtDate(selected))} — เลือกท่าด้านล่างแล้วบันทึกเป็น "ทำจริงแล้ว" หรือ "วางแผนไว้" ได้เลย</p>`;
}

export function render() {
  if (!root) return;
  const names = new Set(STARTER);
  [...state.workouts, ...state.templates].forEach(w => Object.values(w.sections || {}).flat().forEach(r => r?.name && names.add(r.name)));
  $('#w-names', root).innerHTML = [...names].sort().map(n => `<option value="${esc(n)}">`).join('');

  const sortedTpl = state.templates.slice().sort((a, b) => a.name.localeCompare(b.name, 'th'));
  $('#w-tpl', root).innerHTML = '<option value="">เลือกเทมเพลต…</option>' + sortedTpl.map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${esc(TYPES[t.type] || '')})</option>`).join('');
  $('#w-tpl-list', root).innerHTML = sortedTpl.length
    ? '<p class="text-xs font-semibold text-slate-500">เทมเพลตของฉัน</p>' + sortedTpl.map(t => `
      <div class="flex justify-between items-center gap-2 text-sm py-0.5">
        <button type="button" data-tuse="${esc(t.id)}" class="text-left text-slate-700 hover:text-brand-dark truncate">${esc(t.name)} <span class="text-xs text-slate-400">(${esc(TYPES[t.type] || '')})</span></button>
        <div class="flex items-center gap-2 shrink-0 text-xs">
          <button type="button" data-tedit="${esc(t.id)}" class="text-brand-dark hover:underline">แก้ไข</button>
          <button type="button" data-tdel="${esc(t.id)}" class="text-rose-400 hover:underline">ลบ</button>
        </div>
      </div>`).join('')
    : '';

  renderWeekStrip();

  const today = localDateStr(), since = addDays(today, -6);
  const wk = state.workouts.filter(w => w.date >= since && w.date <= today && w.status !== 'planned');
  const plannedCount = state.workouts.filter(w => w.date >= today && w.status === 'planned').length;
  const by = {}; wk.forEach(w => { by[w.type] = (by[w.type] || 0) + 1; });
  const mins = wk.reduce((a, w) => a + (w.durationMin || 0), 0), burn = wk.reduce((a, w) => a + (w.estKcal || 0), 0);
  $('#w-week', root).innerHTML = (wk.length
    ? `<p><b>${wk.length}</b> ครั้ง${mins ? ` · รวม ${mins} นาที` : ''}${burn ? ` · เผาผลาญประมาณ ${burn} kcal` : ''}</p>` + Object.entries(by).map(([t, n]) => `<p class="text-xs text-slate-500">${esc(TYPES[t])}: ${n} ครั้ง</p>`).join('')
    : '<p class="text-xs text-slate-400">ยังไม่มีการออกกำลังกายที่ทำแล้วใน 7 วันนี้</p>')
    + (plannedCount ? `<p class="text-xs text-amber-700 pt-1">📅 มีแผนที่วางไว้ ${plannedCount} รายการ</p>` : '');

  renderHistory();
  $$('[data-hint]', root).forEach(h => { const n = h.closest('[data-row]')?.querySelector('[data-k="name"]'); if (n) h.textContent = lastHint(n.value); });
}

function renderHistory() {
  if (!root) return;
  const q = ($('#w-hist-q', root)?.value || '').trim().toLowerCase();
  const from = $('#w-hist-from', root)?.value || '';
  const to = $('#w-hist-to', root)?.value || '';
  const filtering = Boolean(q || from || to);

  const filtered = state.workouts.filter(w => {
    if (from && (w.date || '') < from) return false;
    if (to && (w.date || '') > to) return false;
    if (!q) return true;
    const exerciseNames = Object.values(w.sections || {}).flat().map(r => `${r?.name || ''} ${r?.note || ''}`).join(' ');
    const hay = `${TYPES[w.type] || w.type || ''} ${w.note || ''} ${exerciseNames}`.toLowerCase();
    return hay.includes(q);
  });

  const rows = filtered.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, filtering ? 50 : 15);
  $('#w-history', root).innerHTML = rows.length ? rows.map(w => {
    const detail = SECTIONS.map(([k, t]) => (w.sections?.[k]?.length ? `<p class="text-xs font-semibold text-slate-500 mt-1">${t}</p>` + w.sections[k].map(r => `<p class="text-xs">• ${esc(r.name)} — ${esc(rowText(r))}${r.note ? ` <span class="text-slate-400">(${esc(r.note)})</span>` : ''}</p>`).join('') : '')).join('');
    const badge = w.status === 'planned' ? '<span class="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 mr-1">วางแผนไว้</span>' : '';
    return `<details class="rounded-lg border border-lav-soft p-2"><summary class="cursor-pointer text-sm">${badge}<b>${esc(fmtDate(w.date))}</b> · ${esc(TYPES[w.type] || w.type)}${w.durationMin ? ` · ${w.durationMin} นาที` : ''}${w.estKcal ? ` · ~${w.estKcal} kcal` : ''}${w.completedSetCount ? ` · ทำจริง ${w.completedSetCount} เซต` : ''}${w.volumeKg ? ` · ${Math.round(w.volumeKg)} kg รวม` : ''}</summary>
      <div class="mt-1">${detail || '<p class="text-xs text-slate-400">ไม่มีรายการท่า</p>'}${w.note ? `<p class="text-xs mt-1 text-slate-500">โน้ต: ${esc(w.note)}</p>` : ''}
      <div class="flex flex-wrap gap-2 mt-2">
        ${w.status === 'planned' ? `<button type="button" data-done-workout="${esc(w.id)}" class="chip bg-ok-soft text-green-700">ทำเสร็จแล้ว</button>` : ''}
        <button type="button" data-edit-workout="${esc(w.id)}" class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-pen"></i> แก้ไข</button>
        <button type="button" data-again="${esc(w.id)}" class="chip bg-sky-soft text-blue-700">ทำซ้ำ</button>
        <button type="button" data-del="${esc(w.id)}" class="chip bg-pink-soft text-rose-600">ลบ</button>
      </div></div></details>`;
  }).join('') : `<p class="text-xs text-slate-400">${filtering ? 'ไม่พบบันทึกที่ตรงกับคำค้นหา/ช่วงวันที่' : 'ยังไม่มีบันทึก'}</p>`;
}
