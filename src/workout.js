import { addDoc, deleteDoc } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { bodyLatest } from './body.js';
import { findExerciseImage } from './exerciseMedia.js';
import { runActiveWorkout } from './workoutActive.js';
import { $, $$, esc, fmtDate, localDateStr, addDays, toNum, toast, openModal } from './util.js';

export const TYPES = {
  walk: 'เดิน (Walk)', upper: 'Upper body', lower: 'Lower body', full: 'Full body',
  pilates: 'พิลาทิส (Pilates)', stretch: 'ยืดเหยียด (Stretching)', other: 'อื่น ๆ'
};
export const SECTIONS = [['warmup', 'วอร์มอัพ (Warm-up)', 'fa-fire'], ['main', 'ท่าหลัก (Main workout)', 'fa-dumbbell'], ['cooldown', 'คูลดาวน์ (Cool-down)', 'fa-snowflake']];
const STARTER = ['Goblet Squat', 'Standing RDL', 'Bent-Over Row', 'Shoulder Press', 'Bicep Curl', 'Lateral Raise', 'Push-up', 'Glute Bridge', 'Lunge', 'Plank', 'Cat-Cow', 'Child’s Pose', 'Hamstring Stretch', 'เดินเร็ว'];
// ค่า MET (Compendium of Physical Activities, ปัดเป็นช่วงโดยประมาณ) ตามประเภทและความหนัก
const MET = { walk: [2.8, 3.5, 5.0], upper: [3.0, 3.5, 6.0], lower: [3.0, 3.5, 6.0], full: [3.5, 4.3, 6.0], pilates: [2.5, 3.0, 4.0], stretch: [2.0, 2.3, 3.0], other: [3.0, 4.0, 6.0] };
export const INTENSITY = [['light', 'เบา'], ['moderate', 'ปานกลาง'], ['vigorous', 'หนัก']];
export const currentWeightKg = () => bodyLatest(state.body).weight?.v ?? state.profile?.weightKg ?? null;
// พลังงานที่เผาผลาญ "เพิ่มจากตอนพัก" = (MET − 1) × น้ำหนัก(กก.) × ชั่วโมง  (ไม่นับ BMR ซ้ำกับ TDEE) — ค่าจริงคลาดเคลื่อนได้ ±25%
export function estimateBurn(type, intensity, minutes, weightKg) {
  if (!minutes || !weightKg) return null;
  const idx = Math.max(0, INTENSITY.findIndex(i => i[0] === intensity));
  return Math.round(((MET[type] || MET.other)[idx < 0 ? 1 : idx] - 1) * weightKg * minutes / 60);
}
export const repLabel = u => (u === 'sec' ? 'วินาที' : u === 'min' ? 'นาที' : 'ครั้ง');

let root, draft = emptyDraft();
function emptyDraft() { return { warmup: [], main: [], cooldown: [] }; }
const blankRow = () => ({ name: '', weightKg: null, perSide: false, sets: 1, reps: null, repUnit: 'reps', note: '' });

export function mountWorkout(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-2 space-y-6">
    <div class="card space-y-4">
      <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-dumbbell text-brand"></i> บันทึกการออกกำลังกาย</h2>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="lbl">วันที่</label><input type="date" id="w-date" class="input"></div>
        <div><label class="lbl">ประเภท</label><select id="w-type" class="input">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
        <div><label class="lbl">ระยะเวลารวม (นาที)</label><input id="w-dur" type="number" inputmode="numeric" class="input" placeholder="ไม่บังคับ"></div>
        <div><label class="lbl">ความหนัก</label><select id="w-int" class="input"><option value="light">เบา (คุยได้สบาย)</option><option value="moderate" selected>ปานกลาง</option><option value="vigorous">หนัก (เหนื่อยมาก)</option></select></div>
        <div><label class="lbl">เริ่มจาก</label><select id="w-tpl" class="input"><option value="">เลือกเทมเพลต…</option></select></div>
      </div>
      <p id="w-burn" class="text-xs text-slate-500 -mt-1"></p>
      <div class="flex flex-wrap gap-2">
        <button id="w-last" class="chip bg-sky-soft text-blue-700"><i class="fa-solid fa-clock-rotate-left"></i> ใช้แผนล่าสุดของประเภทนี้</button>
        <button id="w-clear" class="chip bg-slate-100 text-slate-600"><i class="fa-solid fa-eraser"></i> ล้างฟอร์ม</button>
      </div>
      <div id="w-sections" class="space-y-5"></div>
      <div><label class="lbl">หมายเหตุ</label><input id="w-note" class="input" placeholder="เช่น รู้สึกเหนื่อยง่าย, เพิ่มน้ำหนักได้"></div>
      <div class="flex flex-wrap justify-end gap-2">
        <button id="w-active" class="btn btn-soft"><i class="fa-solid fa-play"></i> เริ่มตามแผน</button><button id="w-tpl-save" class="btn btn-soft"><i class="fa-solid fa-bookmark"></i> บันทึกเป็นเทมเพลต</button>
        <button id="w-save" class="btn btn-primary"><i class="fa-solid fa-check"></i> บันทึกการออกกำลังกาย</button>
      </div>
      <datalist id="w-names"></datalist>
    </div>
  </div>
  <div class="space-y-6">
    <div class="card space-y-3"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-chart-simple text-brand"></i> 7 วันที่ผ่านมา</h3><div id="w-week" class="text-sm text-slate-700 space-y-1"></div></div>
    <div class="card space-y-3"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-list text-brand"></i> ประวัติล่าสุด</h3><div id="w-history" class="space-y-2"></div>
      <div id="w-tpl-list" class="pt-2 border-t border-slate-100 space-y-1"></div></div>
  </div>`;
  $('#w-date', root).value = localDateStr();
  $('#w-sections', root).addEventListener('input', onInput);
  $('#w-sections', root).addEventListener('change', onInput);
  $('#w-sections', root).addEventListener('click', e => {
    const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-rm]'), media=e.target.closest('[data-media]');
    if(media){const [sec,i]=media.dataset.media.split(':');const row=draft[sec]?.[+i];if(!row?.name.trim())return toast('ใส่ชื่อท่าก่อนค้นหารูป','err');media.disabled=true;findExerciseImage(row.name).then(hit=>{if(!hit)return toast('ไม่พบภาพท่าที่ตรงกัน — วาง URL รูป/GIF เองได้');row.imageUrl=hit.url;renderSections();toast('เพิ่มรูปตัวอย่างจาก Free Exercise DB แล้ว');}).catch(err=>toast(err.message,'err')).finally(()=>{media.disabled=false;});return;}
    if (add) { draft[add.dataset.add].push(blankRow()); renderSections(); }
    if (rm) { const [sec, i] = rm.dataset.rm.split(':'); draft[sec].splice(+i, 1); renderSections(); }
  });
  $('#w-type', root).addEventListener('change', () => { /* ประเภทเปลี่ยนไม่ล้างท่าที่กรอกไว้ */ });
  $('#w-tpl', root).addEventListener('change', e => { const t = state.templates.find(x => x.id === e.target.value); if (t) loadSections(t.sections, t.type); e.target.value = ''; });
  $('#w-last', root).addEventListener('click', useLast);
  $('#w-clear', root).addEventListener('click', () => { draft = emptyDraft(); $('#w-note', root).value = ''; $('#w-dur', root).value = ''; renderSections(); });
  $('#w-save', root).addEventListener('click', save);
  $('#w-active',root).addEventListener('click',startActiveWorkout);
  ['w-dur', 'w-int', 'w-type'].forEach(id => $('#' + id, root).addEventListener('input', burnPreview));
  burnPreview();
  $('#w-tpl-save', root).addEventListener('click', saveTemplate);
  $('#w-history', root).addEventListener('click', e => {
    const del = e.target.closest('[data-del]'), again = e.target.closest('[data-again]');
    if (del && confirm('ลบบันทึกนี้?')) deleteDoc(userDoc(state.uid, 'workout_records', del.dataset.del)).catch(err => toast(err.message, 'err'));
    if (again) { const r = state.workouts.find(x => x.id === again.dataset.again); if (r) { loadSections(r.sections, r.type); window.scrollTo({ top: root.offsetTop, behavior: 'smooth' }); } }
  });
  $('#w-tpl-list', root).addEventListener('click', e => {
    const d = e.target.closest('[data-tdel]');
    if (d && confirm('ลบเทมเพลตนี้?')) deleteDoc(userDoc(state.uid, 'workout_templates', d.dataset.tdel)).catch(err => toast(err.message, 'err'));
  });
  renderSections(); render();
}

function burnPreview() {
  const el = $('#w-burn', root), kcal = estimateBurn($('#w-type', root).value, $('#w-int', root).value, toNum($('#w-dur', root).value), currentWeightKg());
  el.textContent = kcal ? `🔥 เผาผลาญเพิ่มประมาณ ${kcal} kcal (ค่าประมาณ ±25% คิดจากน้ำหนัก ${currentWeightKg()} กก.)`
    : (!currentWeightKg() ? 'ใส่น้ำหนักในแท็บน้ำหนัก (หรือ ตั้งค่า) เพื่อประมาณแคลอรี่ที่เผาผลาญ' : 'ใส่ระยะเวลารวมเพื่อประมาณแคลอรี่ที่เผาผลาญ');
}
function loadSections(sec, type) {
  draft = { warmup: [], main: [], cooldown: [] };
  for (const k of Object.keys(draft)) draft[k] = (sec?.[k] || []).map(r => ({ ...blankRow(), ...r }));
  if (type) $('#w-type', root).value = type;
  renderSections();
  toast('นำท่ามาใส่ในฟอร์มแล้ว — ปรับน้ำหนัก/จำนวนได้เลย');
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
  for (const w of state.workouts.slice().sort((a, b) => b.date.localeCompare(a.date)))
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
          <div class="flex gap-2"><input data-sec="${k}" data-i="${i}" data-k="name" list="w-names" class="input" placeholder="ชื่อท่า เช่น Goblet Squat" value="${esc(r.name)}"><button data-rm="${k}:${i}" class="text-rose-400 hover:text-rose-600 px-2" aria-label="ลบท่า"><i class="fa-solid fa-trash-can text-xs"></i></button></div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="lbl">น้ำหนัก (kg)</label><input data-sec="${k}" data-i="${i}" data-k="weightKg" type="number" step="0.5" inputmode="decimal" class="input" value="${r.weightKg ?? ''}"></div>
            <div><label class="lbl">เซต</label><input data-sec="${k}" data-i="${i}" data-k="sets" type="number" inputmode="numeric" class="input" value="${r.sets ?? ''}"></div>
            <div><label class="lbl">${repLabel(r.repUnit)}</label><input data-sec="${k}" data-i="${i}" data-k="reps" type="number" inputmode="numeric" class="input" value="${r.reps ?? ''}"></div>
          </div>
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <label class="flex items-center gap-1"><input data-sec="${k}" data-i="${i}" data-k="perSide" type="checkbox" ${r.perSide ? 'checked' : ''}> น้ำหนักข้างละ (ต่อข้าง)</label>
            <select data-sec="${k}" data-i="${i}" data-k="repUnit" class="input !w-auto !py-1"><option value="reps" ${r.repUnit === 'reps' ? 'selected' : ''}>ครั้ง</option><option value="sec" ${r.repUnit === 'sec' ? 'selected' : ''}>วินาที</option><option value="min" ${r.repUnit === 'min' ? 'selected' : ''}>นาที</option></select>
          </div>
          <div><input data-sec="${k}" data-i="${i}" data-k="imageUrl" type="url" class="input" placeholder="URL รูป/GIF (ไม่บังคับ)" value="${esc(r.imageUrl || "")}"><button data-media="${k}:${i}" class="chip bg-sky-soft text-blue-700">ค้นหารูปฟรี</button></div>${r.imageUrl ? `<img src="${esc(r.imageUrl)}" alt="ตัวอย่าง ${esc(r.name)}" loading="lazy" class="max-h-36 rounded-lg object-contain bg-white">` : ""}<input data-sec="${k}" data-i="${i}" data-k="note" class="input" placeholder="โน้ตท่า เช่น เน้นควบคุมการย่อตัว" value="${esc(r.note)}">
          <p data-hint class="text-[11px] text-slate-500">${esc(lastHint(r.name))}</p>
        </div>`).join('') : '<p class="text-xs text-slate-400">ยังไม่มีท่า</p>'}
      <button data-add="${k}" class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-plus"></i> เพิ่มท่า</button>
    </div>`).join('');
}

const clean = () => Object.fromEntries(Object.entries(draft).map(([k, rows]) => [k, rows.filter(r => r.name.trim()).map(r => ({
  name: r.name.trim().slice(0, 80), imageUrl: (r.imageUrl||'').trim().slice(0,1000), weightKg: r.weightKg, perSide: !!r.perSide, sets: Math.max(1, Math.round(r.sets || 1)), reps: r.reps, repUnit: r.repUnit || 'reps', note: (r.note || '').trim().slice(0, 120)
}))]));

async function startActiveWorkout(){
  const sections=clean(), rows=SECTIONS.flatMap(([section,sectionLabel])=>(sections[section]||[]).map(r=>({...r,section,sectionLabel})));
  if(!rows.length)return toast('เพิ่มท่าอย่างน้อย 1 ท่าก่อนเริ่ม','err');
  const type=$('#w-type',root).value,intensity=$('#w-int',root).value;
  try{
    await runActiveWorkout(rows,async(performedSets,actualMinutes)=>{
      const duration=toNum($('#w-dur',root).value)||actualMinutes,volumeKg=performedSets.reduce((sum,x)=>sum+(x.weightKg||0)*(x.reps||0),0);
      await addDoc(userCol(state.uid,'workout_records'),{date:$('#w-date',root).value,type,typeLabel:TYPES[type],durationMin:duration,intensity,estKcal:estimateBurn(type,intensity,duration,currentWeightKg()),sections,performedSets,completedSetCount:performedSets.length,volumeKg,note:$('#w-note',root).value.trim(),createdAt:new Date()});
      toast('บันทึกแล้ว · '+performedSets.length+' เซต · '+Math.round(volumeKg)+' kg รวม');
      draft=emptyDraft();$('#w-note',root).value='';$('#w-dur',root).value='';renderSections();render();
    });
  }catch(err){toast('บันทึกไม่สำเร็จ: '+err.message,'err');}
}

function save() {
  const sections = clean(), count = Object.values(sections).reduce((a, r) => a + r.length, 0);
  const dur = toNum($('#w-dur', root).value);
  if (!count && !dur) return toast('เพิ่มท่าอย่างน้อย 1 ท่า หรือใส่ระยะเวลา (เช่น เดิน 30 นาที)', 'err');
  const type = $('#w-type', root).value;
  addDoc(userCol(state.uid, 'workout_records'), {
    date: $('#w-date', root).value, type, typeLabel: TYPES[type], durationMin: dur, intensity: $('#w-int', root).value, estKcal: estimateBurn(type, $('#w-int', root).value, dur, currentWeightKg()), sections, note: $('#w-note', root).value.trim(), createdAt: new Date()
  }).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  toast('บันทึกการออกกำลังกายแล้ว 💪');
  draft = emptyDraft(); $('#w-note', root).value = ''; $('#w-dur', root).value = ''; renderSections(); burnPreview();
}

function saveTemplate() {
  const sections = clean();
  if (!Object.values(sections).some(r => r.length)) return toast('เพิ่มท่าก่อนบันทึกเป็นเทมเพลต', 'err');
  const name = prompt('ตั้งชื่อเทมเพลต (เช่น Day A / Upper body 1):');
  if (!name || !name.trim()) return;
  addDoc(userCol(state.uid, 'workout_templates'), { name: name.trim().slice(0, 60), type: $('#w-type', root).value, sections, createdAt: new Date() })
    .catch(e => toast(e.message, 'err'));
  toast('บันทึกเทมเพลตแล้ว');
}

export function render() {
  if (!root) return;
  // ชื่อท่าสำหรับ autocomplete: ของเริ่มต้น + จากประวัติ/เทมเพลต
  const names = new Set(STARTER);
  [...state.workouts, ...state.templates].forEach(w => Object.values(w.sections || {}).flat().forEach(r => r?.name && names.add(r.name)));
  $('#w-names', root).innerHTML = [...names].sort().map(n => `<option value="${esc(n)}">`).join('');
  const sel = $('#w-tpl', root);
  sel.innerHTML = '<option value="">เลือกเทมเพลต…</option>' + state.templates.slice().sort((a, b) => a.name.localeCompare(b.name, 'th')).map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${esc(TYPES[t.type] || '')})</option>`).join('');
  $('#w-tpl-list', root).innerHTML = state.templates.length ? '<p class="text-xs font-semibold text-slate-500">เทมเพลตของฉัน</p>' + state.templates.map(t => `<div class="flex justify-between items-center text-sm"><span>${esc(t.name)}</span><button data-tdel="${esc(t.id)}" class="text-rose-400 text-xs">ลบ</button></div>`).join('') : '';

  const since = addDays(localDateStr(), -6), wk = state.workouts.filter(w => w.date >= since);
  const by = {}; wk.forEach(w => { by[w.type] = (by[w.type] || 0) + 1; });
  const mins = wk.reduce((a, w) => a + (w.durationMin || 0), 0), burn = wk.reduce((a, w) => a + (w.estKcal || 0), 0);
  $('#w-week', root).innerHTML = wk.length ? `<p><b>${wk.length}</b> ครั้ง${mins ? ` · รวม ${mins} นาที` : ''}${burn ? ` · เผาผลาญประมาณ ${burn} kcal` : ''}</p>` + Object.entries(by).map(([t, n]) => `<p class="text-xs text-slate-500">${esc(TYPES[t])}: ${n} ครั้ง</p>`).join('') : '<p class="text-xs text-slate-400">ยังไม่มีการออกกำลังกายใน 7 วันนี้</p>';

  const rows = state.workouts.slice().sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 12);
  $('#w-history', root).innerHTML = rows.length ? rows.map(w => {
    const detail = SECTIONS.map(([k, t]) => (w.sections?.[k]?.length ? `<p class="text-xs font-semibold text-slate-500 mt-1">${t}</p>` + w.sections[k].map(r => `<p class="text-xs">• ${esc(r.name)} — ${esc(rowText(r))}${r.note ? ` <span class="text-slate-400">(${esc(r.note)})</span>` : ''}</p>`).join('') : '')).join('');
    return `<details class="rounded-lg border border-lav-soft p-2"><summary class="cursor-pointer text-sm"><b>${esc(fmtDate(w.date))}</b> · ${esc(TYPES[w.type] || w.type)}${w.durationMin ? ` · ${w.durationMin} นาที` : ''}${w.estKcal ? ` · ~${w.estKcal} kcal` : ''}${w.completedSetCount ? ` · ทำจริง ${w.completedSetCount} เซต` : ''}${w.volumeKg ? ` · ${Math.round(w.volumeKg)} kg รวม` : ''}</summary>
      <div class="mt-1">${detail || '<p class="text-xs text-slate-400">ไม่มีรายการท่า</p>'}${w.note ? `<p class="text-xs mt-1 text-slate-500">โน้ต: ${esc(w.note)}</p>` : ''}
      <div class="flex gap-2 mt-2"><button data-again="${esc(w.id)}" class="chip bg-sky-soft text-blue-700">ทำซ้ำ</button><button data-del="${esc(w.id)}" class="chip bg-pink-soft text-rose-600">ลบ</button></div></div></details>`;
  }).join('') : '<p class="text-xs text-slate-400">ยังไม่มีบันทึก</p>';
  $$('[data-hint]', root).forEach(h => { const n = h.closest('[data-row]')?.querySelector('[data-k="name"]'); if (n) h.textContent = lastHint(n.value); });
}
