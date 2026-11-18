import { addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { bodyLatest } from './body.js';
import { findExerciseImage } from './exerciseMedia.js';
import { TYPES, SECTIONS, repLabel } from './workoutConstants.js';
import { formatWorkoutTemplate, inferWorkoutType, parseWorkoutText, safeHttpUrl } from './workoutParser.js';
import { WORKOUT_PRESET_TEMPLATES } from './workoutPresets.js';
import { $, $$, esc, fmtDate, localDateStr, addDays, toNum, toast, openModal, confirmDialog, mondayOf } from './util.js';

import { formatFeelingLabel, summarizeSessionNextStep } from './workoutConstants.js';

export { TYPES, SECTIONS, repLabel } from './workoutConstants.js';
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
let root, draft = emptyDraft();
let weekStart = '';
let editingId = null;
let editingTemplateId = null;
let lastParsedImport = null;
let importTargetDate = '';
let importTargetStatus = 'planned';
let historyStatusFilter = 'all';

const SAMPLE_IMPORT_TEXT = `Day A — Lower Body
ขาและสะโพก
ประมาณ 20–30 นาที

1. Warm-up
https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Marching_Hip_Raise/0.jpg
1. March in Place
60 วินาที
เดินยกเข่าสลับซ้ายขวา แกว่งแขนตามธรรมชาติ

2. Main Workout
https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Goblet_Squat/0.jpg
1. Goblet Squat
2 kg
2 × 10 ครั้ง
ถือดัมเบลไว้หน้าอก ย่อตัวเหมือนนั่งเก้าอี้ แล้วดันตัวกลับขึ้นมา

3. Cool-down
1. Slow March
45–60 วินาที
เดินอยู่กับที่ช้า ๆ ให้ลมหายใจกลับสู่ปกติ`;

function emptyDraft() { return { warmup: [], main: [], cooldown: [] }; }
const blankRow = () => ({ name: '', imageUrl: '', imageHint: '', refTitle: '', refUrl: '', weightKg: null, perSide: false, sets: 1, reps: null, repUnit: 'reps', note: '' });

function renderImageFrame(r, sizeClass = 'w-16 h-16') {
  const validImg = safeHttpUrl(r.imageUrl);
  if (validImg) {
    return `<div data-img-frame class="${sizeClass} shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
      <img data-ex-img src="${esc(validImg)}" alt="ตัวอย่าง ${esc(r.name || 'ท่าออกกำลังกาย')}" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-contain p-0.5">
    </div>`;
  }
  if (r.imageHint) {
    return `<div data-img-frame class="${sizeClass} shrink-0 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 flex flex-col items-center justify-center p-1 text-center text-[10px] leading-tight">
      <span class="text-base">🔗</span>
      <span>รอลิงก์เต็ม</span>
    </div>`;
  }
  return `<div data-img-frame class="${sizeClass} shrink-0 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 flex flex-col items-center justify-center p-1 text-center text-[10px] leading-tight">
    <span class="text-base">🏋️</span>
    <span>ไม่มีรูป</span>
  </div>`;
}

async function copyTextSafe(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

export function mountWorkout(el) {
  root = el;
  const today = localDateStr();
  weekStart = mondayOf(today);
  root.innerHTML = `
  <div class="space-y-6">
    <div class="card space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-dumbbell text-brand"></i> บันทึก & วางแผนออกกำลังกาย</h2>
        <span id="w-edit-badge" class="hidden text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">กำลังแก้ไขบันทึกเดิม</span>
      </div>

      <div class="rounded-2xl border border-lav-soft bg-slate-50/70 p-3 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-semibold text-slate-700"><i class="fa-solid fa-calendar-week text-brand mr-1"></i>วางแผนรายสัปดาห์ (จ–อา)</span>
          <div class="flex items-center gap-1">
            <button type="button" id="w-wk-prev" class="chip bg-white border border-slate-200 text-slate-700 min-w-[38px] min-h-[38px] justify-center" aria-label="สัปดาห์ก่อน"><i class="fa-solid fa-chevron-left"></i></button>
            <button type="button" id="w-wk-now" class="chip bg-lav-soft text-brand-dark min-h-[38px] whitespace-nowrap">สัปดาห์นี้</button>
            <button type="button" id="w-wk-next" class="chip bg-white border border-slate-200 text-slate-700 min-w-[38px] min-h-[38px] justify-center" aria-label="สัปดาห์หน้า"><i class="fa-solid fa-chevron-right"></i></button>
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

      <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button type="button" id="w-import-toggle" class="chip bg-lav-soft text-brand-dark font-semibold border border-brand/25 hover:bg-brand/15">
          <i class="fa-solid fa-paste"></i> 📋 วางข้อความ / ตารางเป็น Template
        </button>
        <div class="flex flex-wrap gap-1.5">
          <button type="button" id="w-fill-images" class="chip bg-sky-soft text-blue-700"><i class="fa-solid fa-images"></i> เติมรูปที่ขาดอัตโนมัติ</button>
          <button type="button" id="w-last" class="chip bg-sky-soft text-blue-700"><i class="fa-solid fa-clock-rotate-left"></i> ใช้แผนล่าสุดของประเภทนี้</button>
          <button type="button" id="w-clear" class="chip bg-slate-100 text-slate-600"><i class="fa-solid fa-eraser"></i> ล้างฟอร์ม</button>
        </div>
      </div>

      <div id="w-import-panel" class="hidden rounded-2xl border border-brand/30 bg-lav-soft/35 p-3.5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-bold text-slate-800"><i class="fa-solid fa-wand-magic-sparkles text-brand mr-1"></i> แปลงข้อความดิบ / ตาราง เป็น Template ออกกำลังกาย</h3>
            <p class="text-[11px] text-slate-500">วางข้อความดิบ, ตาราง Markdown หรือคัดลอกจาก Excel/Sheets ได้เลย ระบบจะจัดเป็น 3 ช่วง (Warm-up / Main / Cool-down) เก็บลิงก์รูปเข้ากรอบภาพประกอบ และประเมินค่าเริ่มต้นให้อัตโนมัติเมื่อข้อมูลขาด</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" id="w-import-sample" class="chip bg-white border border-slate-200 text-slate-600 text-[11px]">ใส่ตัวอย่าง</button>
            <button type="button" id="w-import-close" class="text-slate-400 hover:text-slate-600 px-1.5" aria-label="ปิดหน้าต่างนำเข้า"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-[11px] font-medium text-slate-500">เทมเพลตสำเร็จรูป (0 โทเค็น):</span>
          ${WORKOUT_PRESET_TEMPLATES.map((p, i) => `<button type="button" data-w-preset="${i}" class="chip bg-white border border-slate-200 hover:border-brand/50 hover:bg-lav-soft/60 text-slate-700 text-[11px]">${p.icon} ${esc(p.label)}</button>`).join('')}
        </div>
        <textarea id="w-import-text" rows="7" class="input text-xs leading-relaxed font-sans" placeholder="วางข้อความดิบหรือตารางออกกำลังกายที่นี่... เช่น&#10;Day A — Lower Body&#10;ขาและสะโพก&#10;ประมาณ 20–30 นาที&#10;Warm-up&#10;https://...&#10;March in Place&#10;60 วินาที&#10;เดินยกเข่าสลับซ้ายขวา..."></textarea>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <button type="button" id="w-import-clear" class="btn btn-ghost !py-1.5 !px-3 text-xs">ล้างข้อความ</button>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" id="w-import-ai" class="btn btn-soft !py-2 !px-3.5 text-xs"><i class="fa-solid fa-sparkles"></i> ให้ AI ช่วยจัดโครงสร้าง</button>
            <button type="button" id="w-import-parse" class="btn btn-primary !py-2 !px-4 text-xs"><i class="fa-solid fa-table-list"></i> แปลงเป็น Template</button>
          </div>
        </div>
        <div id="w-import-preview" class="hidden space-y-3 pt-2 border-t border-brand/20"></div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div><label class="lbl">วันที่</label><input type="date" id="w-date" class="input"></div>
        <div><label class="lbl">สถานะ</label><select id="w-status" class="input"><option value="done">ทำจริงแล้ว</option><option value="planned">วางแผนไว้</option></select></div>
        <div><label class="lbl">ประเภท</label><select id="w-type" class="input">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
        <div><label class="lbl">ระยะเวลารวม (นาที)</label><input id="w-dur" type="number" inputmode="numeric" class="input" placeholder="ไม่บังคับ"></div>
        <div><label class="lbl">ความหนัก</label><select id="w-int" class="input"><option value="light">เบา (คุยได้สบาย)</option><option value="moderate" selected>ปานกลาง</option><option value="vigorous">หนัก (เหนื่อยมาก)</option></select></div>
        <div><label class="lbl">เริ่มจากเทมเพลต</label><select id="w-tpl" class="input"><option value="">เลือกเทมเพลต…</option></select></div>
        <div class="col-span-2 sm:col-span-2"><label class="lbl">ชื่อโปรแกรม (ไม่บังคับ)</label><input id="w-title" class="input" placeholder="เช่น Day A — Lower Body"></div>
        <div class="col-span-2 sm:col-span-1"><label class="lbl">กลุ่มกล้ามเนื้อ</label><input id="w-muscle" class="input" placeholder="เช่น ขาและสะโพก"></div>
      </div>
      <p id="w-burn" class="text-xs text-slate-500 -mt-1"></p>
      <div id="w-sections" class="space-y-5"></div>
      <div><label class="lbl">หมายเหตุ</label><input id="w-note" class="input" placeholder="เช่น รู้สึกเหนื่อยง่าย, ปรับลดน้ำหนักลง, เพิ่มท่า"></div>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" id="w-edit-cancel" class="btn btn-ghost hidden">ยกเลิกการแก้ไข</button>
        <button type="button" id="w-copy-tpl" class="btn btn-ghost"><i class="fa-regular fa-copy"></i> คัดลอก Template</button>
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
      <div id="w-hist-status-tabs" class="flex items-center gap-1 p-1 rounded-xl bg-slate-100 text-xs" role="tablist" aria-label="กรองสถานะบันทึก">
        <button type="button" role="tab" aria-selected="true" data-hstatus="all" class="wa-sec-tab is-active flex-1 justify-center min-h-[36px] whitespace-nowrap">ทั้งหมด</button>
        <button type="button" role="tab" aria-selected="false" data-hstatus="planned" class="wa-sec-tab flex-1 justify-center min-h-[36px] whitespace-nowrap">แผนที่วางไว้</button>
        <button type="button" role="tab" aria-selected="false" data-hstatus="done" class="wa-sec-tab flex-1 justify-center min-h-[36px] whitespace-nowrap">ทำแล้ว</button>
      </div>
      <div class="space-y-2">
        <input id="w-hist-q" class="input text-xs" placeholder="ค้นหาชื่อท่าออกกำลังกาย / ประเภท / โน้ต">
        <details class="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
          <summary class="cursor-pointer text-xs font-medium text-slate-600 select-none">กรองตามช่วงวันที่</summary>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2.5">
            <div><label class="lbl">ตั้งแต่</label><input type="date" id="w-hist-from" class="input text-xs"></div>
            <div><label class="lbl">ถึง</label><input type="date" id="w-hist-to" class="input text-xs"></div>
            <div class="flex items-end"><button type="button" id="w-hist-clear" class="chip bg-slate-100 text-slate-700 w-full justify-center py-2 min-h-[38px]">ล้างตัวกรอง</button></div>
          </div>
        </details>
      </div>
      <div id="w-history" class="space-y-2"></div>
      <div id="w-tpl-list" class="pt-3 border-t border-slate-100 space-y-1.5"></div>
    </div>
  </div>`;

  $('#w-date', root).value = today;

  // Fallback อัตโนมัติเมื่อภาพโหลดไม่สำเร็จในทุกกรอบรูปประกอบ
  root.addEventListener('error', e => {
    if (!e.target.matches('[data-ex-img]')) return;
    const frame = e.target.closest('[data-img-frame]');
    if (!frame) return;
    frame.className = frame.className.replace(/bg-white/g, 'bg-slate-100');
    frame.innerHTML = '<div class="text-slate-400 flex flex-col items-center justify-center p-1 text-center text-[10px] leading-tight"><span class="text-base">🏋️</span><span>เปิดรูปไม่ได้</span></div>';
  }, true);

  $('#w-sections', root).addEventListener('input', onInput);
  $('#w-sections', root).addEventListener('change', onInput);
  $('#w-sections', root).addEventListener('click', e => {
    const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-rm]'), media = e.target.closest('[data-media]'), refEdit = e.target.closest('[data-ref-edit]');
    if (refEdit) {
      const box = refEdit.closest('[data-row]')?.querySelector('[data-ref-box]');
      if (box) {
        box.open = true;
        box.querySelector('[data-k="refUrl"]')?.focus();
      }
      return;
    }
    if (media) {
      const [sec, i] = media.dataset.media.split(':');
      const row = draft[sec]?.[+i];
      if (!row?.name.trim()) return toast('ใส่ชื่อท่าก่อนค้นหารูป', 'err');
      media.disabled = true;
      findExerciseImage(row.name).then(hit => {
        if (!hit) return toast('ไม่พบภาพท่าที่ตรงกัน — วาง URL รูป/GIF เองได้');
        row.imageUrl = hit.url;
        row.imageHint = '';
        renderSections();
        toast('เพิ่มรูปตัวอย่างจาก Free Exercise DB แล้ว');
      }).catch(err => toast(err.message, 'err')).finally(() => { media.disabled = false; });
      return;
    }
    if (add) { draft[add.dataset.add].push(blankRow()); renderSections(); }
    if (rm) { const [sec, i] = rm.dataset.rm.split(':'); draft[sec].splice(+i, 1); renderSections(); }
  });

  $('#w-import-toggle', root).addEventListener('click', () => {
    const panel = $('#w-import-panel', root);
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) $('#w-import-text', root).focus();
  });
  $('#w-import-close', root).addEventListener('click', () => $('#w-import-panel', root).classList.add('hidden'));
  $('#w-import-sample', root).addEventListener('click', () => {
    $('#w-import-text', root).value = SAMPLE_IMPORT_TEXT;
    runImportPreview();
  });
  $('#w-import-panel', root).addEventListener('click', e => {
    const presetBtn = e.target.closest('[data-w-preset]');
    if (!presetBtn) return;
    const preset = WORKOUT_PRESET_TEMPLATES[Number(presetBtn.dataset.wPreset)];
    if (!preset) return;
    $('#w-import-text', root).value = preset.text;
    runImportPreview();
    toast(`โหลดเทมเพลต "${preset.label}" แล้ว (0 โทเค็น)`);
  });
  $('#w-import-clear', root).addEventListener('click', () => clearImportBox({ keepOpen: true }));
  $('#w-import-parse', root).addEventListener('click', () => runImportPreview());
  $('#w-import-ai', root).addEventListener('click', runAiImportFormat);
  $('#w-import-preview', root).addEventListener('input', onImportPreviewInput);
  $('#w-import-preview', root).addEventListener('change', onImportPreviewInput);
  $('#w-import-preview', root).addEventListener('click', e => {
    const mediaBtn = e.target.closest('[data-imp-media]');
    if (mediaBtn && lastParsedImport) {
      const [sec, i] = mediaBtn.dataset.impMedia.split(':');
      const row = lastParsedImport.sections?.[sec]?.[+i];
      if (!row?.name?.trim()) return toast('ใส่ชื่อท่าก่อนค้นหารูป', 'err');
      mediaBtn.disabled = true;
      findExerciseImage(row.name).then(hit => {
        if (!hit) return toast('ไม่พบภาพท่าที่ตรงกัน — วาง URL รูป/GIF เองได้');
        row.imageUrl = hit.url;
        row.imageHint = '';
        renderImportPreview();
        toast('เพิ่มรูปตัวอย่างแล้ว');
      }).catch(err => toast(err.message, 'err')).finally(() => { mediaBtn.disabled = false; });
      return;
    }
    const addBtn = e.target.closest('[data-imp-add]');
    if (addBtn && lastParsedImport) {
      const sec = addBtn.dataset.impAdd;
      (lastParsedImport.sections[sec] ||= []).push(blankRow());
      recountImportExercises();
      renderImportPreview();
      return;
    }
    const rmBtn = e.target.closest('[data-imp-rm]');
    if (rmBtn && lastParsedImport) {
      const [sec, i] = rmBtn.dataset.impRm.split(':');
      lastParsedImport.sections?.[sec]?.splice(+i, 1);
      recountImportExercises();
      renderImportPreview();
      return;
    }
    if (e.target.closest('#w-import-apply')) applyImportToForm();
    if (e.target.closest('#w-import-save-tpl')) saveImportAsTemplate();
    if (e.target.closest('#w-import-save-rec')) saveImportAsWorkout();
    if (e.target.closest('#w-import-start')) startImportActiveWorkout();
    if (e.target.closest('#w-import-copy')) copyFormattedImport();
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
  $('#w-hist-status-tabs', root).addEventListener('click', e => {
    const tab = e.target.closest('[data-hstatus]');
    if (!tab) return;
    historyStatusFilter = tab.dataset.hstatus || 'all';
    renderHistory();
  });
  $('#w-hist-clear', root).addEventListener('click', () => {
    historyStatusFilter = 'all';
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
    if (t) loadTemplate(t);
    e.target.value = '';
  });
  $('#w-fill-images', root).addEventListener('click', fillMissingImages);
  $('#w-last', root).addEventListener('click', useLast);
  $('#w-clear', root).addEventListener('click', clearForm);
  $('#w-edit-cancel', root).addEventListener('click', clearForm);
  $('#w-copy-tpl', root).addEventListener('click', copyFormAsTemplate);
  $('#w-save', root).addEventListener('click', save);
  $('#w-active', root).addEventListener('click', startActiveWorkout);
  ['w-dur', 'w-int', 'w-type'].forEach(id => $('#' + id, root).addEventListener('input', burnPreview));
  burnPreview();

  $('#w-tpl-save', root).addEventListener('click', saveTemplatePrompt);
  $('#w-tpl-edit-save', root).addEventListener('click', saveEditedTemplate);
  $('#w-tpl-edit-cancel', root).addEventListener('click', exitTemplateEdit);
  $('#w-tpl-list', root).addEventListener('click', async e => {
    const startBtn = e.target.closest('[data-tstart]');
    const useBtn = e.target.closest('[data-tuse]');
    const editBtn = e.target.closest('[data-tedit]');
    const delBtn = e.target.closest('[data-tdel]');
    if (startBtn) {
      const t = state.templates.find(x => x.id === startBtn.dataset.tstart);
      if (t) {
        editingId = null;
        updateRecordEditUi();
        loadTemplate(t, true);
        startActiveWorkout();
      }
      return;
    }
    if (useBtn) {
      const t = state.templates.find(x => x.id === useBtn.dataset.tuse);
      if (t) { loadTemplate(t); window.scrollTo({ top: root.offsetTop, behavior: 'smooth' }); }
    }
    if (editBtn) startTemplateEdit(editBtn.dataset.tedit);
    if (delBtn) {
      const tpl = state.templates.find(x => x.id === delBtn.dataset.tdel);
      const ok = await confirmDialog({
        title: 'ลบเทมเพลตออกกำลังกาย?',
        message: `ต้องการลบเทมเพลต "${tpl?.name || 'นี้'}" ใช่หรือไม่?`,
        confirmText: 'ลบเทมเพลต',
        cancelText: 'ยกเลิก',
        danger: true
      });
      if (!ok) return;
      if (editingTemplateId === delBtn.dataset.tdel) exitTemplateEdit();
      deleteDoc(userDoc(state.uid, 'workout_templates', delBtn.dataset.tdel))
        .then(() => toast('ลบเทมเพลตแล้ว'))
        .catch(err => toast('ลบไม่สำเร็จ: ' + err.message, 'err'));
    }
  });

  renderSections();
  render();
}

function loadTemplate(t, silent = false) {
  if (!t) return;
  if (t.name) $('#w-title', root).value = t.name;
  if (t.muscleGroup) $('#w-muscle', root).value = t.muscleGroup;
  if (t.durationMin) $('#w-dur', root).value = String(t.durationMin);
  loadSections(t.sections, t.type, silent);
  burnPreview();
}

function selectPlanDate(d) {
  $('#w-date', root).value = d;
  if (!editingId) $('#w-status', root).value = d > localDateStr() ? 'planned' : 'done';
  renderWeekStrip();
}

async function handleRecordAction(e) {
  const startBtn = e.target.closest('[data-start-workout]');
  const doneBtn = e.target.closest('[data-done-workout]');
  const editBtn = e.target.closest('[data-edit-workout]');
  const againBtn = e.target.closest('[data-again]');
  const delBtn = e.target.closest('[data-del]');
  if (startBtn) {
    const w = state.workouts.find(x => x.id === startBtn.dataset.startWorkout);
    if (w) {
      editingId = w.status === 'planned' ? w.id : null;
      $('#w-date', root).value = w.status === 'planned' ? (w.date || localDateStr()) : localDateStr();
      $('#w-title', root).value = w.title || '';
      $('#w-muscle', root).value = w.muscleGroup || '';
      $('#w-dur', root).value = w.durationMin ?? '';
      $('#w-int', root).value = ['light', 'moderate', 'vigorous'].includes(w.intensity) ? w.intensity : 'moderate';
      $('#w-note', root).value = w.note || '';
      updateRecordEditUi();
      loadSections(w.sections, w.type, true);
      startActiveWorkout();
    }
    return;
  }
  if (doneBtn) {
    updateDoc(userDoc(state.uid, 'workout_records', doneBtn.dataset.doneWorkout), { status: 'done', updatedAt: new Date() })
      .then(() => toast('อัปเดตเป็นทำเสร็จแล้ว 💪'))
      .catch(err => toast(err.message, 'err'));
    return;
  }
  if (editBtn) startRecordEdit(editBtn.dataset.editWorkout);
  if (againBtn) {
    const r = state.workouts.find(x => x.id === againBtn.dataset.again);
    if (r) {
      editingId = null;
      updateRecordEditUi();
      $('#w-title', root).value = r.title || '';
      $('#w-muscle', root).value = r.muscleGroup || '';
      if (r.durationMin) $('#w-dur', root).value = String(r.durationMin);
      loadSections(r.sections, r.type);
      burnPreview();
      window.scrollTo({ top: root.offsetTop, behavior: 'smooth' });
    }
  }
  if (delBtn) {
    const item = state.workouts.find(x => x.id === delBtn.dataset.del);
    const isPlan = item?.status === 'planned';
    const itemLabel = item?.title || TYPES[item?.type] || 'รายการนี้';
    const dateLabel = item?.date ? ` (${fmtDate(item.date)})` : '';
    const ok = await confirmDialog({
      title: isPlan ? 'ลบแผนที่วางไว้?' : 'ลบบันทึกการออกกำลังกาย?',
      message: `ต้องการลบ "${itemLabel}"${dateLabel} ออกจากรายการใช่หรือไม่?`,
      confirmText: isPlan ? 'ลบแผน' : 'ลบบันทึก',
      cancelText: 'ยกเลิก',
      danger: true
    });
    if (!ok) return;
    if (editingId === delBtn.dataset.del) clearForm();
    deleteDoc(userDoc(state.uid, 'workout_records', delBtn.dataset.del))
      .then(() => toast(isPlan ? 'ลบแผนที่วางไว้แล้ว' : 'ลบบันทึกแล้ว'))
      .catch(err => toast('ลบไม่สำเร็จ: ' + err.message, 'err'));
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
  $('#w-title', root).value = r.title || '';
  $('#w-muscle', root).value = r.muscleGroup || '';
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
  toast('โหลดบันทึกเข้าสู่โหมดแก้ไขแล้ว — ปรับแผนหรือเพิ่มรูปประกอบได้ตามต้องการ');
}

export function resetToToday() {
  if (!root || editingId || editingTemplateId) return;
  const today = localDateStr();
  weekStart = mondayOf(today);
  $('#w-date', root).value = today;
  $('#w-status', root).value = 'done';
  renderWeekStrip();
}

function clearImportBox({ keepOpen = false } = {}) {
  lastParsedImport = null;
  importTargetDate = '';
  importTargetStatus = 'planned';
  if (!root) return;
  const textEl = $('#w-import-text', root);
  if (textEl) textEl.value = '';
  const prevEl = $('#w-import-preview', root);
  if (prevEl) {
    prevEl.innerHTML = '';
    prevEl.classList.add('hidden');
  }
  if (!keepOpen) $('#w-import-panel', root)?.classList.add('hidden');
}

function clearForm() {
  const today = localDateStr();
  editingId = null;
  exitTemplateEdit();
  draft = emptyDraft();
  $('#w-date', root).value = today;
  $('#w-type', root).value = 'walk';
  $('#w-int', root).value = 'moderate';
  $('#w-status', root).value = 'done';
  $('#w-tpl', root).value = '';
  $('#w-title', root).value = '';
  $('#w-muscle', root).value = '';
  $('#w-note', root).value = '';
  $('#w-dur', root).value = '';
  weekStart = mondayOf(today);
  clearImportBox({ keepOpen: false });
  updateRecordEditUi();
  renderSections();
  burnPreview();
  renderWeekStrip();
}

function startTemplateEdit(id) {
  const t = state.templates.find(x => x.id === id);
  if (!t) return;
  editingTemplateId = t.id;
  $('#w-tpl-edit-name', root).value = t.name || '';
  $('#w-title', root).value = t.name || '';
  $('#w-muscle', root).value = t.muscleGroup || '';
  $('#w-dur', root).value = t.durationMin ?? '';
  $('#w-tpl-edit-bar', root).classList.remove('hidden');
  loadSections(t.sections, t.type, true);
  burnPreview();
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
    const muscleGroup = $('#w-muscle', root).value.trim().slice(0, 100);
    const durationMin = toNum($('#w-dur', root).value);
    updateDoc(userDoc(state.uid, 'workout_templates', editingTemplateId), {
      name,
      ...(muscleGroup && { muscleGroup }),
      ...(durationMin != null && { durationMin }),
      type: $('#w-type', root).value,
      sections,
      updatedAt: new Date()
    }).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
    toast('บันทึกการแก้ไขเทมเพลตแล้ว');
    clearForm();
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
  if (type && TYPES[type]) $('#w-type', root).value = type;
  renderSections();
  if (!silent) toast('นำท่ามาใส่ในฟอร์มแล้ว — ปรับน้ำหนัก/จำนวนได้เลย');
}

function useLast() {
  const type = $('#w-type', root).value;
  const last = state.workouts.filter(w => w.type === type).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return toast('ยังไม่มีประวัติของประเภทนี้', 'err');
  if (last.title) $('#w-title', root).value = last.title;
  if (last.muscleGroup) $('#w-muscle', root).value = last.muscleGroup;
  if (last.durationMin) $('#w-dur', root).value = String(last.durationMin);
  loadSections(last.sections, type);
  burnPreview();
}

async function fillMissingImages() {
  const missing = [];
  for (const sec of ['warmup', 'main', 'cooldown']) {
    draft[sec].forEach((r, i) => {
      if (r.name?.trim() && !safeHttpUrl(r.imageUrl)) missing.push({ sec, i, row: r });
    });
  }
  if (!missing.length) return toast('ทุกท่าที่มีชื่อมีรูปประกอบแล้ว หรือยังไม่มีท่าในฟอร์ม');
  const btn = $('#w-fill-images', root);
  btn.disabled = true;
  let found = 0;
  try {
    for (const item of missing) {
      const hit = await findExerciseImage(item.row.name);
      if (hit?.url) {
        item.row.imageUrl = hit.url;
        item.row.imageHint = '';
        found++;
      }
    }
    if (found) renderSections();
    toast(found ? `เติมรูปประกอบให้อัตโนมัติ ${found}/${missing.length} ท่าแล้ว` : 'ยังไม่พบภาพที่ตรงกับชื่อท่าในคลัง — วาง URL รูปเองได้ครับ');
  } catch (err) {
    toast(err.message || 'ค้นหารูปไม่สำเร็จ', 'err');
  } finally {
    btn.disabled = false;
  }
}

// เก็บค่าที่พิมพ์ลง draft ทันที (ไม่ต้อง re-render จึงไม่เสียโฟกัส)
function onInput(e) {
  const t = e.target, sec = t.dataset.sec; if (!sec) return;
  const row = draft[sec][+t.dataset.i]; if (!row) return;
  const k = t.dataset.k;
  if (k === 'name' || k === 'note' || k === 'repUnit' || k === 'imageUrl' || k === 'refTitle' || k === 'refUrl') row[k] = t.value;
  else if (k === 'perSide') row.perSide = t.checked;
  else row[k] = toNum(t.value);
  if (k === 'imageUrl') row.imageHint = '';
  if (k === 'name' && e.type === 'change') { const h = t.closest('[data-row]')?.querySelector('[data-hint]'); if (h) h.textContent = lastHint(t.value); }
  if (k === 'repUnit') renderSections();
  if (k === 'imageUrl' && e.type === 'change') renderSections();
}

function lastPerformance(name) {
  const n = name.trim().toLowerCase(); if (!n) return null;
  for (const w of state.workouts.filter(x => x.status !== 'planned').slice().sort((a, b) => b.date.localeCompare(a.date))) {
    for (const sec of ['main', 'warmup', 'cooldown']) {
      const r = (w.sections?.[sec] || []).find(x => x.name.toLowerCase() === n);
      if (r) {
        const fb = (w.exerciseFeedback || []).find(f => String(f.name || '').trim().toLowerCase() === n) || null;
        return { r, date: w.date, fb };
      }
    }
  }
  return null;
}

const rowText = r => {
  const weightPart = r.weightKg != null ? `${r.weightKg} kg${r.perSide ? '/ข้าง' : ''} · ` : '';
  const sideReps = r.perSide && r.weightKg == null ? '/ข้าง' : '';
  return `${weightPart}${r.sets || 1} × ${r.reps ?? '-'} ${repLabel(r.repUnit)}${sideReps}`;
};
const lastHint = name => {
  const p = lastPerformance(name);
  if (!p) return '';
  const fbParts = [];
  if (p.fb?.rpe != null) fbParts.push(`RPE ${p.fb.rpe}`);
  if (p.fb?.rir != null) fbParts.push(`เหลือ ${p.fb.rir} ครั้ง`);
  const fbStr = fbParts.length ? ` · ${fbParts.join('/')}` : '';
  const nextStr = p.fb?.nextLabel ? ` → ${p.fb.nextLabel}` : '';
  return `ครั้งล่าสุด (${fmtDate(p.date)}): ${rowText(p.r)}${fbStr}${nextStr}`;
};

function renderRefBadge(r, editKey = '', recordEditId = '') {
  const url = safeHttpUrl(r.refUrl);
  const title = (r.refTitle || '').trim();
  if (!url && !title) return '';
  if (url) {
    return `<div class="flex flex-wrap items-center gap-1.5 pt-0.5">
      <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 rounded-lg bg-sky-soft/80 border border-sky-200 px-2 py-0.5 text-[11px] text-blue-800 hover:bg-sky-soft">
        <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
        <span class="truncate max-w-[230px]">${esc(title || url)}</span>
      </a>
    </div>`;
  }
  const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(title);
  return `<div class="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
    <span class="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2 py-0.5 text-slate-600 max-w-full">
      <span>🔗</span><span class="truncate max-w-[220px]">${esc(title)}</span>
    </span>
    <a href="${esc(searchUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-700 hover:underline font-medium">🔍 ค้นหา</a>
    ${editKey ? `<button type="button" data-ref-edit="${esc(editKey)}" class="text-brand-dark hover:underline">✏️ เพิ่ม URL</button>` : ''}
    ${recordEditId ? `<button type="button" data-edit-workout="${esc(recordEditId)}" class="text-brand-dark hover:underline">✏️ เพิ่ม URL</button>` : ''}
  </div>`;
}

function normalizeAiWorkoutResult(aiObj) {
  const rawSec = aiObj?.sections || {};
  const sections = { warmup: [], main: [], cooldown: [] };
  for (const key of ['warmup', 'main', 'cooldown']) {
    const arr = Array.isArray(rawSec[key]) ? rawSec[key] : [];
    sections[key] = arr.filter(x => x && String(x.name || '').trim()).map(x => {
      const imgUrl = safeHttpUrl(x.imageUrl);
      const refUrl = safeHttpUrl(x.refUrl);
      const unit = ['sec', 'min', 'reps'].includes(x.repUnit) ? x.repUnit : 'reps';
      return {
        name: String(x.name).trim().slice(0, 80),
        imageUrl: imgUrl.slice(0, 1000),
        ...(!imgUrl && typeof x.imageUrl === 'string' && /\.\.|…/.test(x.imageUrl) && { imageHint: x.imageUrl.slice(0, 200) }),
        refTitle: String(x.refTitle || '').trim().slice(0, 200),
        refUrl: refUrl.slice(0, 1000),
        weightKg: typeof x.weightKg === 'number' && Number.isFinite(x.weightKg) && x.weightKg >= 0 ? x.weightKg : null,
        perSide: x.perSide === true,
        sets: Math.max(1, Math.min(99, Math.round(Number(x.sets) || 1))),
        reps: typeof x.reps === 'number' && Number.isFinite(x.reps) && x.reps > 0 ? x.reps : 10,
        repUnit: unit,
        note: String(x.note || '').trim().slice(0, 400)
      };
    });
  }
  const totalExercises = sections.warmup.length + sections.main.length + sections.cooldown.length;
  const programName = String(aiObj?.programName || '').trim().slice(0, 100);
  const muscleGroup = String(aiObj?.muscleGroup || '').trim().slice(0, 100);
  const durationMin = typeof aiObj?.durationMin === 'number' && Number.isFinite(aiObj.durationMin) && aiObj.durationMin > 0
    ? Math.round(aiObj.durationMin)
    : null;
  const durationText = String(aiObj?.durationText || (durationMin ? `ประมาณ ${durationMin} นาที` : '')).trim().slice(0, 60);
  return {
    programName,
    muscleGroup,
    durationText,
    durationMin,
    sectionNotes: { warmup: '', main: '', cooldown: '' },
    suggestedType: inferWorkoutType(`${programName} ${muscleGroup}`, sections),
    sections,
    totalExercises,
    autoFilledCount: 0
  };
}

async function runAiImportFormat() {
  const text = ($('#w-import-text', root)?.value || '').trim();
  if (!text) {
    toast('กรุณาวางข้อความหรือตารางออกกำลังกายก่อน', 'err');
    return;
  }
  const btn = $('#w-import-ai', root);
  btn.disabled = true;
  const prevHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังจัดโครงสร้าง...';
  try {
    const { formatWorkoutPlanWithAi, explainGeminiError } = await import('./nutrition.js');
    const { result, provider } = await formatWorkoutPlanWithAi(text).catch(err => {
      throw new Error(explainGeminiError(err));
    });
    const normalized = normalizeAiWorkoutResult(result);
    if (!normalized.totalExercises) {
      throw new Error('AI ไม่พบรายการท่าออกกำลังกายในข้อความนี้');
    }
    const formattedText = formatWorkoutTemplate(normalized);
    $('#w-import-text', root).value = formattedText;
    runImportPreview(normalized);
    toast(`จัดโครงสร้าง Template ด้วย ${provider} แล้ว`);
  } catch (err) {
    toast(err.message || 'ไม่สามารถจัดรูปแบบด้วย AI ได้ — ลองกด "แปลงเป็น Template" แทนได้ครับ', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = prevHtml;
  }
}

function recountImportExercises() {
  if (!lastParsedImport) return;
  lastParsedImport.totalExercises = ['warmup', 'main', 'cooldown'].reduce(
    (sum, k) => sum + (lastParsedImport.sections?.[k]?.length || 0),
    0
  );
}

function onImportPreviewInput(e) {
  if (!lastParsedImport) return;
  const t = e.target;
  if (t.dataset.impMeta) {
    const field = t.dataset.impMeta;
    if (field === 'programName') lastParsedImport.programName = t.value;
    else if (field === 'muscleGroup') lastParsedImport.muscleGroup = t.value;
    else if (field === 'durationMin') {
      const d = toNum(t.value);
      lastParsedImport.durationMin = d;
      lastParsedImport.durationText = d ? `ประมาณ ${d} นาที` : '';
    } else if (field === 'suggestedType') lastParsedImport.suggestedType = t.value;
    else if (field === 'targetDate') {
      importTargetDate = t.value || localDateStr();
      importTargetStatus = importTargetDate > localDateStr() ? 'planned' : importTargetStatus;
      const stSel = $('#w-imp-status', root);
      if (stSel) stSel.value = importTargetStatus;
    } else if (field === 'targetStatus') {
      importTargetStatus = t.value === 'done' ? 'done' : 'planned';
    }
    return;
  }
  const sec = t.dataset.impSec;
  if (!sec) return;
  const row = lastParsedImport.sections?.[sec]?.[+t.dataset.impI];
  if (!row) return;
  const k = t.dataset.impK;
  if (k === 'name' || k === 'note' || k === 'repUnit' || k === 'imageUrl' || k === 'refTitle' || k === 'refUrl') {
    row[k] = t.value;
  } else if (k === 'perSide') {
    row.perSide = t.checked;
  } else {
    row[k] = toNum(t.value);
  }
  if (k === 'imageUrl') row.imageHint = '';
  if (k === 'repUnit' || (k === 'imageUrl' && e.type === 'change')) {
    renderImportPreview();
  }
}

function runImportPreview(parsedOverride = null) {
  const text = ($('#w-import-text', root)?.value || '').trim();
  const prevEl = $('#w-import-preview', root);
  if (!text && !parsedOverride) {
    toast('กรุณาวางข้อความหรือตารางออกกำลังกายก่อน', 'err');
    return;
  }
  const parsed = parsedOverride || parseWorkoutText(text);
  lastParsedImport = parsed;
  if (!importTargetDate) importTargetDate = $('#w-date', root)?.value || localDateStr();
  importTargetStatus = importTargetDate > localDateStr() ? 'planned' : 'done';
  if (!parsed.totalExercises) {
    prevEl.classList.remove('hidden');
    prevEl.innerHTML = `<div class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
      ไม่พบรายการท่าออกกำลังกาย — ลองใส่หัวหมวด (เช่น <code>Warm-up</code> / <code>Main Workout</code> / <code>Cool-down</code>) หรือตัวเลขนำหน้าชื่อท่า หรือกด <b>"ใส่ตัวอย่าง"</b> เพื่อดูรูปแบบครับ
    </div>`;
    return;
  }
  renderImportPreview();
}

function renderImportPreview() {
  const prevEl = $('#w-import-preview', root);
  const parsed = lastParsedImport;
  if (!prevEl || !parsed) return;

  const targetDate = importTargetDate || localDateStr();
  const sectionsHtml = SECTIONS.map(([k, title, icon], si) => {
    const rows = parsed.sections[k] || [];
    const sub = parsed.sectionNotes?.[k] ? ` <span class="text-xs font-normal text-slate-500">— ${esc(parsed.sectionNotes[k])}</span>` : '';
    return `<div class="rounded-xl bg-white border border-slate-200 p-3 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-bold text-slate-700"><i class="fa-solid ${icon} text-brand mr-1"></i>${si + 1}. ${esc(title)}${sub}</p>
        <button type="button" data-imp-add="${k}" class="chip bg-lav-soft text-brand-dark !py-1 !px-2.5 !min-h-[34px] text-[11px]"><i class="fa-solid fa-plus"></i> เพิ่มท่า</button>
      </div>
      ${rows.length ? `<div class="space-y-2">
        ${rows.map((r, idx) => `
          <div class="rounded-xl bg-slate-50/90 border border-slate-200/80 p-2.5 space-y-2 text-xs">
            <div class="flex items-start gap-2.5 min-w-0">
              ${renderImageFrame(r, 'w-14 h-14 sm:w-16 sm:h-16')}
              <div class="min-w-0 flex-1 space-y-1.5">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="text-[11px] font-bold text-brand shrink-0 tabular-nums">${idx + 1}.</span>
                  <input data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="name" list="w-names" class="input !py-1.5 text-xs font-semibold flex-1 min-w-0" placeholder="ชื่อท่า" value="${esc(r.name || '')}">
                  <button type="button" data-imp-media="${k}:${idx}" class="chip bg-sky-soft text-blue-700 !py-1 !px-2 !min-h-[34px] text-[11px] shrink-0" title="ค้นหารูปอัตโนมัติ"><i class="fa-solid fa-image"></i> หาภาพ</button>
                  <button type="button" data-imp-rm="${k}:${idx}" class="text-rose-400 hover:text-rose-600 min-w-[34px] min-h-[34px] flex items-center justify-center shrink-0" aria-label="ลบท่า"><i class="fa-solid fa-trash-can text-xs"></i></button>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5 items-end">
                  <div><label class="lbl text-[10px]">น้ำหนัก (kg)</label><input data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="weightKg" type="number" step="0.5" inputmode="decimal" class="input !py-1 text-xs" value="${r.weightKg ?? ''}" placeholder="-"></div>
                  <div><label class="lbl text-[10px]">เซต</label><input data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="sets" type="number" inputmode="numeric" class="input !py-1 text-xs" value="${r.sets ?? 1}"></div>
                  <div><label class="lbl text-[10px]">${repLabel(r.repUnit)}</label><input data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="reps" type="number" inputmode="numeric" class="input !py-1 text-xs" value="${r.reps ?? ''}"></div>
                  <div><label class="lbl text-[10px]">หน่วย</label><select data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="repUnit" class="input !py-1 text-xs"><option value="reps" ${r.repUnit === 'reps' ? 'selected' : ''}>ครั้ง</option><option value="sec" ${r.repUnit === 'sec' ? 'selected' : ''}>วินาที</option><option value="min" ${r.repUnit === 'min' ? 'selected' : ''}>นาที</option></select></div>
                  <label class="col-span-2 sm:col-span-1 flex items-center gap-1.5 min-h-[32px] text-[11px] text-slate-600"><input data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="perSide" type="checkbox" class="accent-brand" ${r.perSide ? 'checked' : ''}> ต่อข้าง</label>
                </div>
              </div>
            </div>
            <input data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="note" class="input !py-1.5 text-xs" placeholder="คำอธิบายวิธีทำ / โน้ตสั้น ๆ" value="${esc(r.note || '')}">
            <details class="text-[11px] text-slate-500">
              <summary class="cursor-pointer select-none hover:text-slate-700">🖼️ แก้ไข URL รูปภาพ / แหล่งอ้างอิง${r.autoFilled ? ' <span class="text-amber-700">(เติมค่าเริ่มต้นอัตโนมัติ)</span>' : ''}</summary>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mt-1.5">
                <input data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="imageUrl" type="url" class="input !py-1 text-xs" placeholder="URL รูป/GIF" value="${esc(r.imageUrl || '')}">
                <input data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="refTitle" class="input !py-1 text-xs" placeholder="ชื่อลิงก์อ้างอิง" value="${esc(r.refTitle || '')}">
                <input data-imp-sec="${k}" data-imp-i="${idx}" data-imp-k="refUrl" type="url" class="input !py-1 text-xs" placeholder="URL อ้างอิง" value="${esc(r.refUrl || '')}">
              </div>
            </details>
          </div>`).join('')}
      </div>` : '<p class="text-[11px] text-slate-400">ยังไม่มีท่าในช่วงนี้</p>'}
    </div>`;
  }).join('');

  prevEl.classList.remove('hidden');
  prevEl.innerHTML = `
    <div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-bold text-green-800"><i class="fa-solid fa-circle-check mr-1"></i> Preview &amp; แก้ไขได้เลย (${parsed.totalExercises} ท่า)</span>
        ${parsed.autoFilledCount ? `<span class="text-[11px] text-amber-800">✨ เติมค่าแนะนำให้ ${parsed.autoFilledCount} ท่า</span>` : ''}
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl bg-white border border-slate-200 p-2.5 text-xs">
        <div class="col-span-2 sm:col-span-2"><label class="lbl text-[10px]">ชื่อโปรแกรม</label><input data-imp-meta="programName" class="input !py-1.5 text-xs" value="${esc(parsed.programName || '')}" placeholder="เช่น Day A — Lower Body"></div>
        <div><label class="lbl text-[10px]">ประเภท</label><select data-imp-meta="suggestedType" class="input !py-1.5 text-xs">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${parsed.suggestedType === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><label class="lbl text-[10px]">กลุ่มกล้ามเนื้อ</label><input data-imp-meta="muscleGroup" class="input !py-1.5 text-xs" value="${esc(parsed.muscleGroup || '')}" placeholder="เช่น ขาและสะโพก"></div>
        <div><label class="lbl text-[10px]">เวลา (นาที)</label><input data-imp-meta="durationMin" type="number" inputmode="numeric" class="input !py-1.5 text-xs" value="${parsed.durationMin ?? ''}" placeholder="25"></div>
        <div class="grid grid-cols-2 gap-1.5 col-span-2 sm:col-span-1">
          <div><label class="lbl text-[10px]">วันที่</label><input data-imp-meta="targetDate" type="date" class="input !py-1.5 text-xs" value="${esc(targetDate)}"></div>
          <div><label class="lbl text-[10px]">สถานะ</label><select id="w-imp-status" data-imp-meta="targetStatus" class="input !py-1.5 text-xs"><option value="planned" ${importTargetStatus === 'planned' ? 'selected' : ''}>วางแผนไว้</option><option value="done" ${importTargetStatus === 'done' ? 'selected' : ''}>ทำจริงแล้ว</option></select></div>
        </div>
      </div>

      <div class="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">${sectionsHtml}</div>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div class="flex flex-wrap items-center gap-1.5">
          <button type="button" id="w-import-copy" class="btn btn-ghost !py-2 !px-3 text-xs"><i class="fa-regular fa-copy"></i> คัดลอก Template</button>
          <button type="button" id="w-import-apply" class="btn btn-ghost !py-2 !px-3 text-xs">ส่งลงฟอร์มด้านล่าง</button>
        </div>
        <div class="flex flex-wrap items-center gap-2 ml-auto">
          <button type="button" id="w-import-save-tpl" class="btn btn-soft !py-2 !px-3.5 text-xs"><i class="fa-solid fa-bookmark"></i> บันทึกเป็นเทมเพลต</button>
          <button type="button" id="w-import-save-rec" class="btn btn-soft !py-2 !px-3.5 text-xs"><i class="fa-solid fa-calendar-check"></i> บันทึกแผน/ผล</button>
          <button type="button" id="w-import-start" class="btn btn-primary !py-2 !px-4 text-xs"><i class="fa-solid fa-play"></i> เริ่มตามแผนทันที</button>
        </div>
      </div>
    </div>`;
}

function applyImportToForm({ keepPanel = false } = {}) {
  if (!lastParsedImport?.totalExercises) return;
  const p = lastParsedImport;

  if (p.programName) $('#w-title', root).value = p.programName;
  if (p.muscleGroup) $('#w-muscle', root).value = p.muscleGroup;
  if (p.durationMin) $('#w-dur', root).value = String(p.durationMin);
  if (p.suggestedType && TYPES[p.suggestedType]) $('#w-type', root).value = p.suggestedType;

  const secNotes = Object.entries(p.sectionNotes || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k === 'warmup' ? 'Warm-up' : k === 'main' ? 'Main' : 'Cool-down'}: ${v}`);
  if (secNotes.length && !$('#w-note', root).value.trim()) {
    $('#w-note', root).value = secNotes.join(' · ');
  }

  draft = emptyDraft();
  for (const k of ['warmup', 'main', 'cooldown']) {
    draft[k] = (p.sections[k] || []).map(row => ({ ...blankRow(), ...row }));
  }

  renderSections();
  burnPreview();
  if (!keepPanel) clearImportBox({ keepOpen: false });
  $('#w-sections', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast(`นำเข้า ${p.totalExercises} ท่าลงฟอร์มแล้ว 💪`);
}

function saveImportAsWorkout() {
  if (!lastParsedImport?.totalExercises) return;
  const p = lastParsedImport;
  const sections = cleanRowsObject(p.sections);
  const count = Object.values(sections).reduce((sum, arr) => sum + arr.length, 0);
  if (!count) return toast('กรุณาระบุชื่อท่าอย่างน้อย 1 ท่า', 'err');
  const date = importTargetDate || localDateStr();
  const status = importTargetStatus === 'done' ? 'done' : 'planned';
  const type = TYPES[p.suggestedType] ? p.suggestedType : 'other';
  const durationMin = p.durationMin ?? null;
  const title = (p.programName || '').trim().slice(0, 100);
  const muscleGroup = (p.muscleGroup || '').trim().slice(0, 100);
  addDoc(userCol(state.uid, 'workout_records'), {
    date,
    type,
    typeLabel: TYPES[type],
    status,
    durationMin,
    intensity: 'moderate',
    ...(title && { title }),
    ...(muscleGroup && { muscleGroup }),
    estKcal: estimateBurn(type, 'moderate', durationMin, currentWeightKg()),
    sections,
    note: '',
    createdAt: new Date()
  }).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  toast(status === 'planned' ? `บันทึกแผนวันที่ ${fmtDate(date)} แล้ว 📅` : `บันทึกผลการฝึกวันที่ ${fmtDate(date)} แล้ว 💪`);
  clearImportBox({ keepOpen: false });
}

function saveImportAsTemplate() {
  if (!lastParsedImport?.totalExercises) return;
  const p = lastParsedImport;
  const cleanSec = cleanRowsObject(p.sections);
  if (!Object.values(cleanSec).some(r => r.length)) return toast('กรุณาระบุชื่อท่าอย่างน้อย 1 ท่า', 'err');
  const saveNow = name => {
    const tplName = String(name || '').trim().slice(0, 60);
    if (!tplName) return toast('กรุณาตั้งชื่อเทมเพลต', 'err');
    const type = TYPES[p.suggestedType] ? p.suggestedType : 'other';
    addDoc(userCol(state.uid, 'workout_templates'), {
      name: tplName,
      ...(p.muscleGroup && { muscleGroup: p.muscleGroup.trim().slice(0, 100) }),
      ...(p.durationMin && { durationMin: p.durationMin }),
      type,
      sections: cleanSec,
      createdAt: new Date()
    }).catch(e => toast('บันทึกเทมเพลตไม่สำเร็จ: ' + e.message, 'err'));
    toast(`บันทึกเทมเพลต "${tplName}" แล้ว`);
    clearImportBox({ keepOpen: false });
  };

  if (p.programName?.trim()) {
    saveNow(p.programName);
    return;
  }
  const { el, close } = openModal(`
    <h3 class="font-bold text-slate-800 mb-3"><i class="fa-solid fa-bookmark text-brand mr-1"></i> ตั้งชื่อเทมเพลต</h3>
    <div class="space-y-3">
      <input id="wt-imp-name" class="input" placeholder="เช่น Day A — Lower Body">
      <div class="flex justify-end gap-2">
        <button type="button" data-close class="btn btn-ghost">ยกเลิก</button>
        <button type="button" id="wt-imp-ok" class="btn btn-primary">บันทึก</button>
      </div>
    </div>`);
  const inp = $('#wt-imp-name', el);
  inp.focus();
  $('#wt-imp-ok', el).addEventListener('click', () => { saveNow(inp.value); close(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveNow(inp.value); close(); } });
}

async function startImportActiveWorkout() {
  if (!lastParsedImport?.totalExercises) return;
  const p = lastParsedImport;
  const sections = cleanRowsObject(p.sections);
  const rows = SECTIONS.flatMap(([section, sectionLabel]) => (sections[section] || []).map(r => ({ ...r, section, sectionLabel })));
  if (!rows.length) return toast('กรุณาระบุชื่อท่าอย่างน้อย 1 ท่าก่อนเริ่ม', 'err');
  const type = TYPES[p.suggestedType] ? p.suggestedType : 'other';
  const title = (p.programName || '').trim().slice(0, 100);
  const muscleGroup = (p.muscleGroup || '').trim().slice(0, 100);
  await launchActiveWorkoutSession({
    rows,
    sections,
    type,
    intensity: 'moderate',
    title,
    muscleGroup,
    durInput: p.durationMin ?? null,
    date: importTargetDate || localDateStr(),
    baseNote: '',
    recordId: null,
    onSaved: () => clearImportBox({ keepOpen: false })
  });
}

async function copyFormattedImport() {
  if (!lastParsedImport?.totalExercises) return;
  const text = formatWorkoutTemplate(lastParsedImport);
  const ok = await copyTextSafe(text);
  toast(ok ? 'คัดลอก Template มาตรฐานแล้ว 📋' : 'คัดลอกไม่สำเร็จ', ok ? 'ok' : 'err');
}

async function copyFormAsTemplate() {
  const sections = clean();
  if (!Object.values(sections).some(r => r.length)) return toast('ยังไม่มีท่าในฟอร์มให้คัดลอก', 'err');
  const text = formatWorkoutTemplate({
    programName: $('#w-title', root).value.trim() || TYPES[$('#w-type', root).value] || 'Workout Plan',
    muscleGroup: $('#w-muscle', root).value.trim(),
    durationMin: toNum($('#w-dur', root).value),
    sections
  });
  const ok = await copyTextSafe(text);
  toast(ok ? 'คัดลอก Template ออกกำลังกายแล้ว 📋' : 'คัดลอกไม่สำเร็จ', ok ? 'ok' : 'err');
}

function renderSections() {
  $('#w-sections', root).innerHTML = SECTIONS.map(([k, title, icon], si) => `
    <div class="rounded-2xl border border-lav-soft bg-white p-3 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <h4 class="font-semibold text-slate-700 text-sm"><span class="text-brand mr-1">${si + 1}.</span><i class="fa-solid ${icon} text-brand"></i> ${title}</h4>
        <button type="button" data-add="${k}" class="chip bg-lav-soft text-brand-dark !py-1 !px-2.5 text-xs"><i class="fa-solid fa-plus"></i> เพิ่มท่า</button>
      </div>
      ${draft[k].length ? draft[k].map((r, i) => `
        <div data-row class="bg-slate-50/90 rounded-xl p-2.5 space-y-2 border border-slate-200/80">
          <div class="flex items-start gap-2.5">
            ${renderImageFrame(r, 'w-16 h-16')}
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex gap-1.5 items-center">
                <input data-sec="${k}" data-i="${i}" data-k="name" list="w-names" class="input font-semibold flex-1 min-w-0" placeholder="ชื่อท่า เช่น Goblet Squat" value="${esc(r.name)}">
                <button type="button" data-media="${k}:${i}" class="chip bg-sky-soft text-blue-700 !py-1.5 !px-2.5 shrink-0" title="ค้นหารูปท่านี้"><i class="fa-solid fa-image"></i><span class="hidden sm:inline"> หาภาพ</span></button>
                <button type="button" data-rm="${k}:${i}" class="text-rose-400 hover:text-rose-600 px-2 min-w-[40px] min-h-[40px]" aria-label="ลบท่า"><i class="fa-solid fa-trash-can text-xs"></i></button>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5 items-end">
                <div><label class="lbl">น้ำหนัก (kg)</label><input data-sec="${k}" data-i="${i}" data-k="weightKg" type="number" step="0.5" inputmode="decimal" class="input" value="${r.weightKg ?? ''}"></div>
                <div><label class="lbl">เซต</label><input data-sec="${k}" data-i="${i}" data-k="sets" type="number" inputmode="numeric" class="input" value="${r.sets ?? ''}"></div>
                <div><label class="lbl">${repLabel(r.repUnit)}</label><input data-sec="${k}" data-i="${i}" data-k="reps" type="number" inputmode="numeric" class="input" value="${r.reps ?? ''}"></div>
                <div><label class="lbl">หน่วย</label><select data-sec="${k}" data-i="${i}" data-k="repUnit" class="input"><option value="reps" ${r.repUnit === 'reps' ? 'selected' : ''}>ครั้ง</option><option value="sec" ${r.repUnit === 'sec' ? 'selected' : ''}>วินาที</option><option value="min" ${r.repUnit === 'min' ? 'selected' : ''}>นาที</option></select></div>
                <label class="col-span-2 sm:col-span-1 flex items-center gap-1.5 min-h-[38px] text-xs text-slate-600"><input data-sec="${k}" data-i="${i}" data-k="perSide" type="checkbox" class="accent-brand" ${r.perSide ? 'checked' : ''}> ต่อข้าง</label>
              </div>
            </div>
          </div>
          <input data-sec="${k}" data-i="${i}" data-k="note" class="input text-xs" placeholder="คำอธิบายท่า / โน้ต เช่น เน้นควบคุมการย่อตัว" value="${esc(r.note)}">
          ${renderRefBadge(r, `${k}:${i}`)}
          <details data-ref-box class="text-xs text-slate-500">
            <summary class="cursor-pointer select-none hover:text-slate-700">🖼️ URL รูปภาพ &amp; แหล่งอ้างอิง (ไม่บังคับ)${r.imageHint ? ` · <span class="text-amber-700">รอลิงก์เต็ม (${esc(r.imageHint)})</span>` : ''}</summary>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1.5">
              <input data-sec="${k}" data-i="${i}" data-k="imageUrl" type="url" class="input text-xs" placeholder="URL รูป/GIF ประกอบท่า" value="${esc(r.imageUrl || '')}">
              <input data-sec="${k}" data-i="${i}" data-k="refTitle" class="input text-xs" placeholder="ชื่อบทความ / แหล่งอ้างอิง" value="${esc(r.refTitle || '')}">
              <input data-sec="${k}" data-i="${i}" data-k="refUrl" type="url" class="input text-xs" placeholder="URL ลิงก์อ้างอิง (https://...)" value="${esc(r.refUrl || '')}">
            </div>
          </details>
          <p data-hint class="text-[11px] text-slate-500">${esc(lastHint(r.name))}</p>
        </div>`).join('') : '<p class="text-xs text-slate-500">ยังไม่มีท่าในช่วงนี้</p>'}
    </div>`).join('');
}

const cleanRowsObject = obj => Object.fromEntries(['warmup', 'main', 'cooldown'].map(k => [k, (obj?.[k] || []).filter(r => r?.name?.trim()).map(r => ({
  name: r.name.trim().slice(0, 80),
  imageUrl: safeHttpUrl(r.imageUrl).slice(0, 1000),
  ...(r.refTitle?.trim() && { refTitle: r.refTitle.trim().slice(0, 200) }),
  ...(safeHttpUrl(r.refUrl) && { refUrl: safeHttpUrl(r.refUrl).slice(0, 1000) }),
  weightKg: r.weightKg ?? null,
  perSide: !!r.perSide,
  sets: Math.max(1, Math.round(r.sets || 1)),
  reps: r.reps ?? null,
  repUnit: r.repUnit || 'reps',
  note: (r.note || '').trim().slice(0, 400)
}))]));

const clean = () => cleanRowsObject(draft);

async function launchActiveWorkoutSession({ rows, sections, type, intensity, title, muscleGroup, durInput, date, baseNote, recordId, onSaved }) {
  try {
    const { runActiveWorkout } = await import('./workoutActive.js');
    await runActiveWorkout(rows, async (performedSets, actualMinutes, feedback = null) => {
      const duration = durInput || actualMinutes;
      const volumeKg = performedSets.reduce((sum, x) => sum + (x.weightKg || 0) * (x.reps || 0), 0);
      const mergedNote = [baseNote, feedback?.reflectionNote].filter(Boolean).join(' · ').slice(0, 500);
      const payload = {
        date: date || localDateStr(),
        type,
        typeLabel: TYPES[type],
        status: 'done',
        ...(title && { title }),
        ...(muscleGroup && { muscleGroup }),
        durationMin: duration,
        intensity,
        estKcal: estimateBurn(type, intensity, duration, currentWeightKg()),
        sections,
        performedSets,
        completedSetCount: performedSets.length,
        volumeKg,
        ...(feedback?.feeling && { feeling: feedback.feeling }),
        ...(feedback?.sessionRpe != null && { sessionRpe: feedback.sessionRpe }),
        ...(feedback?.exerciseFeedback?.length && { exerciseFeedback: feedback.exerciseFeedback }),
        note: mergedNote
      };
      if (recordId) {
        updateDoc(userDoc(state.uid, 'workout_records', recordId), { ...payload, updatedAt: new Date() })
          .catch(err => toast('บันทึกไม่สำเร็จ: ' + err.message, 'err'));
      } else {
        addDoc(userCol(state.uid, 'workout_records'), { ...payload, createdAt: new Date() })
          .catch(err => toast('บันทึกไม่สำเร็จ: ' + err.message, 'err'));
      }
      const nextSummary = summarizeSessionNextStep(feedback?.exerciseFeedback);
      toast(`บันทึกแล้ว · ${performedSets.length} เซต · ${Math.round(volumeKg)} kg รวม${nextSummary ? ` · ${nextSummary}` : ''}`);
      onSaved?.();
      render();
    }, { title: title || TYPES[type], muscleGroup, durationMin: durInput });
  } catch (err) {
    toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
  }
}

async function startActiveWorkout() {
  const sections = clean(), rows = SECTIONS.flatMap(([section, sectionLabel]) => (sections[section] || []).map(r => ({ ...r, section, sectionLabel })));
  if (!rows.length) return toast('เพิ่มท่าอย่างน้อย 1 ท่าก่อนเริ่ม', 'err');
  await launchActiveWorkoutSession({
    rows,
    sections,
    type: $('#w-type', root).value,
    intensity: $('#w-int', root).value,
    title: $('#w-title', root).value.trim().slice(0, 100),
    muscleGroup: $('#w-muscle', root).value.trim().slice(0, 100),
    durInput: toNum($('#w-dur', root).value),
    date: $('#w-date', root).value || localDateStr(),
    baseNote: $('#w-note', root).value.trim(),
    recordId: editingId,
    onSaved: clearForm
  });
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
  const title = $('#w-title', root).value.trim().slice(0, 100);
  const muscleGroup = $('#w-muscle', root).value.trim().slice(0, 100);
  const payload = {
    date, type, typeLabel: TYPES[type], status, durationMin: dur, intensity,
    ...(title && { title }), ...(muscleGroup && { muscleGroup }),
    estKcal: estimateBurn(type, intensity, dur, currentWeightKg()), sections, note: $('#w-note', root).value.trim().slice(0, 500)
  };
  try {
    if (editingId) {
      updateDoc(userDoc(state.uid, 'workout_records', editingId), { ...payload, updatedAt: new Date() })
        .catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
      toast('อัปเดตบันทึกการออกกำลังกายแล้ว 💪');
    } else {
      addDoc(userCol(state.uid, 'workout_records'), { ...payload, createdAt: new Date() })
        .catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
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
      <div><label class="lbl">ชื่อเทมเพลต</label><input id="wt-name" class="input" value="${esc($('#w-title', root).value.trim())}" placeholder="เช่น Day A — Lower Body"></div>
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
    const muscleGroup = $('#w-muscle', root).value.trim().slice(0, 100);
    const durationMin = toNum($('#w-dur', root).value);
    try {
      addDoc(userCol(state.uid, 'workout_templates'), {
        name,
        ...(muscleGroup && { muscleGroup }),
        ...(durationMin != null && { durationMin }),
        type: $('#w-type', root).value,
        sections,
        createdAt: new Date()
      }).catch(e => toast('บันทึกเทมเพลตไม่สำเร็จ: ' + e.message, 'err'));
      toast('บันทึกเทมเพลตแล้ว');
      close();
      clearForm();
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
      <span class="text-sm font-bold leading-tight tabular-nums">${dayNum}</span>
      <span class="flex items-center gap-0.5 h-2 mt-0.5">
        ${hasDone ? `<span class="w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-emerald-500'}" title="ทำแล้ว"></span>` : ''}
        ${hasPlanned ? `<span class="w-1.5 h-1.5 rounded-full ${isSel ? 'bg-amber-200' : 'bg-amber-400'}" title="วางแผนไว้"></span>` : ''}
      </span>
    </button>`;
  }).join('');

  const dayList = byDate[selected] || [];
  $('#w-day-plans', root).innerHTML = dayList.length ? dayList.map(w => {
    const hasRows = Object.values(w.sections || {}).some(arr => Array.isArray(arr) && arr.length);
    return `<div class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-lav-soft px-3 py-2 text-xs tabular-nums">
      <div class="min-w-0 flex-1 break-words">
        <span class="font-semibold mr-1 ${w.status === 'planned' ? 'text-amber-700' : 'text-green-700'}">[${w.status === 'planned' ? 'แผน' : 'ทำแล้ว'}]</span>
        <b>${esc(w.title || TYPES[w.type] || w.type)}</b>${w.title ? ` <span class="text-slate-500">(${esc(TYPES[w.type] || w.type)})</span>` : ''}${w.muscleGroup ? ` · <span class="text-brand-dark">${esc(w.muscleGroup)}</span>` : ''}${w.durationMin ? ` · ${w.durationMin} นาที` : ''}
        ${w.note ? `<span class="text-slate-500 ml-1">${esc(w.note)}</span>` : ''}
      </div>
      <div class="flex flex-wrap gap-1.5 shrink-0">
        ${hasRows ? `<button type="button" data-start-workout="${esc(w.id)}" class="chip bg-sky-soft text-blue-700"><i class="fa-solid fa-play"></i> เริ่มตามแผน</button>` : ''}
        ${w.status === 'planned' ? `<button type="button" data-done-workout="${esc(w.id)}" class="chip bg-ok-soft text-green-700"><i class="fa-solid fa-check"></i> ทำเสร็จ</button>` : ''}
        <button type="button" data-edit-workout="${esc(w.id)}" class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-pen"></i> แก้ไข</button>
        <button type="button" data-del="${esc(w.id)}" class="chip bg-pink-soft text-rose-600" aria-label="ลบ${w.status === 'planned' ? 'แผน' : 'บันทึก'}นี้"><i class="fa-solid fa-trash-can"></i> ลบ</button>
      </div>
    </div>`;
  }).join('')
    : `<p class="text-[11px] text-slate-500">ยังไม่มีแผนหรือบันทึกในวันที่ ${esc(fmtDate(selected))} — เลือกท่าด้านล่างแล้วบันทึกเป็น "ทำจริงแล้ว" หรือ "วางแผนไว้" ได้เลย</p>`;
}

export function render() {
  if (!root) return;
  const names = new Set(STARTER);
  [...state.workouts, ...state.templates].forEach(w => Object.values(w.sections || {}).flat().forEach(r => r?.name && names.add(r.name)));
  $('#w-names', root).innerHTML = [...names].sort().map(n => `<option value="${esc(n)}">`).join('');

  const sortedTpl = state.templates.slice().sort((a, b) => a.name.localeCompare(b.name, 'th'));
  $('#w-tpl', root).innerHTML = '<option value="">เลือกเทมเพลต…</option>' + sortedTpl.map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${esc(TYPES[t.type] || '')})</option>`).join('');
  $('#w-tpl-list', root).innerHTML = sortedTpl.length
    ? '<p class="text-xs font-semibold text-slate-600">เทมเพลตของฉัน</p>' + sortedTpl.map(t => `
      <div class="flex justify-between items-center gap-2 text-sm py-1">
        <button type="button" data-tuse="${esc(t.id)}" class="text-left text-slate-700 hover:text-brand-dark truncate min-w-0 flex-1 min-h-[36px]">${esc(t.name)} <span class="text-xs text-slate-500">(${esc(TYPES[t.type] || '')}${t.muscleGroup ? ' · ' + esc(t.muscleGroup) : ''})</span></button>
        <div class="flex items-center gap-2 shrink-0 text-xs">
          <button type="button" data-tstart="${esc(t.id)}" class="text-blue-700 font-medium hover:underline min-h-[36px] px-1">เริ่ม</button>
          <button type="button" data-tedit="${esc(t.id)}" class="text-brand-dark hover:underline min-h-[36px] px-1">แก้ไข</button>
          <button type="button" data-tdel="${esc(t.id)}" class="text-rose-500 hover:underline min-h-[36px] px-1">ลบ</button>
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
    ? `<p class="tabular-nums"><b>${wk.length}</b> ครั้ง${mins ? ` · รวม ${mins} นาที` : ''}${burn ? ` · เผาผลาญประมาณ ${burn} kcal` : ''}</p>` + Object.entries(by).map(([t, n]) => `<p class="text-xs text-slate-600 tabular-nums">${esc(TYPES[t])}: ${n} ครั้ง</p>`).join('')
    : '<p class="text-xs text-slate-500">ยังไม่มีการออกกำลังกายที่ทำแล้วใน 7 วันนี้</p>')
    + (plannedCount ? `<p class="text-xs text-amber-800 pt-1 tabular-nums">มีแผนที่วางไว้ ${plannedCount} รายการ</p>` : '');

  renderHistory();
  $$('[data-hint]', root).forEach(h => { const n = h.closest('[data-row]')?.querySelector('[data-k="name"]'); if (n) h.textContent = lastHint(n.value); });
}

function renderHistory() {
  if (!root) return;
  const q = ($('#w-hist-q', root)?.value || '').trim().toLowerCase();
  const from = $('#w-hist-from', root)?.value || '';
  const to = $('#w-hist-to', root)?.value || '';
  const filtering = Boolean(q || from || to || historyStatusFilter !== 'all');

  const plannedTotal = state.workouts.filter(w => w.status === 'planned').length;
  const tabsWrap = $('#w-hist-status-tabs', root);
  if (tabsWrap) {
    tabsWrap.querySelectorAll('[data-hstatus]').forEach(btn => {
      const k = btn.dataset.hstatus;
      const isOn = k === historyStatusFilter;
      btn.classList.toggle('is-active', isOn);
      btn.setAttribute('aria-selected', isOn ? 'true' : 'false');
      if (k === 'planned') btn.textContent = plannedTotal ? `แผนที่วางไว้ (${plannedTotal})` : 'แผนที่วางไว้';
    });
  }

  const filtered = state.workouts.filter(w => {
    const isPlan = w.status === 'planned';
    if (historyStatusFilter === 'planned' && !isPlan) return false;
    if (historyStatusFilter === 'done' && isPlan) return false;
    if (from && (w.date || '') < from) return false;
    if (to && (w.date || '') > to) return false;
    if (!q) return true;
    const exerciseNames = Object.values(w.sections || {}).flat().map(r => `${r?.name || ''} ${r?.note || ''} ${r?.refTitle || ''}`).join(' ');
    const hay = `${w.title || ''} ${w.muscleGroup || ''} ${TYPES[w.type] || w.type || ''} ${w.note || ''} ${exerciseNames}`.toLowerCase();
    return hay.includes(q);
  });

  const sorted = filtered.slice().sort((a, b) => historyStatusFilter === 'planned'
    ? (a.date || '').localeCompare(b.date || '')
    : (b.date || '').localeCompare(a.date || ''));
  const rows = sorted.slice(0, filtering ? 50 : 15);

  $('#w-history', root).innerHTML = rows.length ? rows.map(w => {
    const hasRows = Object.values(w.sections || {}).some(arr => Array.isArray(arr) && arr.length);
    const isPlan = w.status === 'planned';
    const fbList = Array.isArray(w.exerciseFeedback) ? w.exerciseFeedback : [];
    const fbByName = Object.fromEntries(fbList.map(x => [String(x.name || '').trim().toLowerCase(), x]));
    const detail = SECTIONS.map(([k, t], si) => (w.sections?.[k]?.length ? `
      <div class="mt-2 space-y-1.5">
        <p class="text-xs font-semibold text-slate-600">${si + 1}. ${t}</p>
        ${w.sections[k].map((r, ri) => {
          const exFb = fbByName[String(r.name || '').trim().toLowerCase()];
          const exFbText = exFb
            ? [exFb.rpe != null ? `RPE ${exFb.rpe}` : '', exFb.rir != null ? `เหลือ ${exFb.rir} ครั้ง` : ''].filter(Boolean).join(' · ')
            : '';
          return `
          <div class="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-100 p-2">
            ${renderImageFrame(r, 'w-12 h-12')}
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                <b class="text-slate-800 break-words min-w-0">${ri + 1}. ${esc(r.name)}</b>
                <span class="tabular-nums text-slate-700 font-medium">${esc(rowText(r))}</span>
              </div>
              ${r.note ? `<p class="text-[11px] text-slate-600 leading-relaxed break-words">${esc(r.note)}</p>` : ''}
              ${exFbText ? `<p class="text-[11px] text-brand-dark font-medium">${esc(exFbText)}${exFb.nextLabel ? ` · 💡 ${esc(exFb.nextLabel)}` : ''}</p>` : ''}
              ${renderRefBadge(r, '', w.id)}
            </div>
          </div>`;
        }).join('')}
      </div>` : '')).join('');

    const feelingStr = formatFeelingLabel(w.feeling);
    const sessionEval = [feelingStr, w.sessionRpe != null ? `RPE ${w.sessionRpe}/10` : ''].filter(Boolean).join(' · ');
    const statusPrefix = isPlan ? '<span class="text-amber-700 font-semibold mr-1">[วางแผนไว้]</span>' : '';
    const titleStr = w.title ? `${esc(w.title)} <span class="text-xs font-normal text-slate-400">(${esc(TYPES[w.type] || w.type)})</span>` : esc(TYPES[w.type] || w.type);
    const actionsHtml = `
      <div class="flex flex-wrap gap-2 ${isPlan ? 'pt-1' : 'mt-2.5'}">
        ${hasRows ? `<button type="button" data-start-workout="${esc(w.id)}" class="chip bg-sky-soft text-blue-700"><i class="fa-solid fa-play"></i> เริ่มตามแผน</button>` : ''}
        ${isPlan ? `<button type="button" data-done-workout="${esc(w.id)}" class="chip bg-ok-soft text-green-700"><i class="fa-solid fa-check"></i> ทำเสร็จแล้ว</button>` : ''}
        <button type="button" data-edit-workout="${esc(w.id)}" class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-pen"></i> แก้ไข</button>
        ${!isPlan ? `<button type="button" data-again="${esc(w.id)}" class="chip bg-sky-soft text-blue-700">ทำซ้ำ</button>` : ''}
        <button type="button" data-del="${esc(w.id)}" class="chip bg-pink-soft text-rose-600"><i class="fa-solid fa-trash-can"></i> ลบ</button>
      </div>`;

    return `<div class="rounded-xl border border-lav-soft p-2.5 space-y-2">
      <details>
        <summary class="cursor-pointer text-sm break-words tabular-nums">${statusPrefix}<b>${esc(fmtDate(w.date))}</b> · ${titleStr}${w.muscleGroup ? ` · <span class="text-xs text-brand-dark">${esc(w.muscleGroup)}</span>` : ''}${w.durationMin ? ` · ${w.durationMin} นาที` : ''}${w.estKcal ? ` · ~${w.estKcal} kcal` : ''}${w.completedSetCount ? ` · ทำจริง ${w.completedSetCount} เซต` : ''}${w.volumeKg ? ` · ${Math.round(w.volumeKg)} kg รวม` : ''}${sessionEval ? ` · <span class="text-xs text-brand-dark">${esc(sessionEval)}</span>` : ''}</summary>
        <div class="mt-1.5">${detail || '<p class="text-xs text-slate-500">ไม่มีรายการท่า</p>'}${w.note ? `<p class="text-xs mt-1.5 text-slate-600 break-words">โน้ต: ${esc(w.note)}</p>` : ''}${isPlan ? '' : actionsHtml}</div>
      </details>
      ${isPlan ? actionsHtml : ''}
    </div>`;
  }).join('') : `<p class="text-xs text-slate-500 py-2">${filtering ? (historyStatusFilter === 'planned' ? 'ยังไม่มีแผนที่วางไว้' : 'ไม่พบบันทึกที่ตรงกับคำค้นหา/ช่วงวันที่') : 'ยังไม่มีบันทึกการออกกำลังกาย'}</p>`;
}
