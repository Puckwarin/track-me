import { setDoc, deleteDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state, emit } from './state.js';
import { $, esc, fmtDate, localDateStr, addDays, toast } from './util.js';

export const SYMPTOMS = [
  ['cramps', 'ปวดท้อง'], ['backache', 'ปวดหลัง'], ['headache', 'ปวดหัว'],
  ['acne', 'สิว'], ['fatigue', 'อ่อนเพลีย'], ['bloating', 'ท้องอืด']
];
export const SEVERITY = ['ไม่มี', 'เล็กน้อย', 'ปานกลาง', 'มาก'];
export const MOODS = ['', '😣 แย่มาก', '🙁 แย่', '😐 ปกติ', '🙂 ดี', '😊 ดีมาก'];
export const STRESS = ['', 'ต่ำมาก', 'ต่ำ', 'ปานกลาง', 'สูง', 'สูงมาก'];

let root;

export function mountSymptoms(el) {
  root = el;
  root.innerHTML = `
    <h3 class="font-bold text-slate-800"><i class="fa-solid fa-notes-medical text-pink-500"></i> บันทึกอาการรายวัน</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div class="col-span-2 sm:col-span-3"><label class="lbl">วันที่ (แตะวันที่ในปฏิทินเพื่อเลือกก็ได้)</label>
        <input type="date" id="s-date" class="input" min="${addDays(localDateStr(), -399)}" max="${localDateStr()}"></div>
      ${SYMPTOMS.map(([k, t]) => `<div><label class="lbl">${t}</label><select id="s-${k}" class="input">${SEVERITY.map((s, i) => `<option value="${i}">${s}</option>`).join('')}</select></div>`).join('')}
      <div><label class="lbl">อารมณ์</label><select id="s-mood" class="input"><option value="">ไม่ระบุ</option>${MOODS.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></div>
      <div><label class="lbl">ระดับความเครียด</label><select id="s-stress" class="input"><option value="">ไม่ระบุ</option>${STRESS.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></div>
      <div class="col-span-2 sm:col-span-3"><label class="lbl">หมายเหตุเพิ่มเติม</label><input id="s-note" class="input" placeholder="เช่น กินยาแก้ปวด, นอนน้อย"></div>
    </div>
    <div class="flex justify-end gap-2">
      <button id="s-del" class="btn btn-ghost hidden">ลบวันนี้</button>
      <button id="s-save" class="btn btn-pink"><i class="fa-solid fa-floppy-disk"></i> บันทึกอาการ</button>
    </div>
    <div><h4 class="text-xs font-bold text-slate-500 mb-2">บันทึกล่าสุด</h4><div id="s-list" class="space-y-1 text-sm"></div></div>`;
  $('#s-date', root).value = localDateStr();
  $('#s-date', root).addEventListener('change', loadForm);
  $('#s-save', root).addEventListener('click', save);
  $('#s-del', root).addEventListener('click', del);
  $('#s-list', root).addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) selectDate(b.dataset.d); });
  loadForm();
}

export function selectDate(d) {
  if (!root) return;
  $('#s-date', root).value = d;
  loadForm();
  root.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const get = date => state.symptoms.find(s => s.id === date);

export function loadForm() {
  if (!root) return;
  const r = get($('#s-date', root).value);
  SYMPTOMS.forEach(([k]) => { $('#s-' + k, root).value = r?.symptoms?.[k] ?? 0; });
  $('#s-mood', root).value = r?.mood ?? '';
  $('#s-stress', root).value = r?.stress ?? '';
  $('#s-note', root).value = r?.note ?? '';
  $('#s-del', root).classList.toggle('hidden', !r);
}

export function renderList() {
  if (!root) return;
  const rows = state.symptoms.slice().sort((a, b) => b.id.localeCompare(a.id)).slice(0, 10);
  $('#s-list', root).innerHTML = rows.length ? rows.map(r => {
    const sx = SYMPTOMS.filter(([k]) => r.symptoms?.[k] > 0).map(([k, t]) => `${t} (${SEVERITY[r.symptoms[k]]})`).join(', ');
    return `<button data-d="${esc(r.id)}" class="w-full text-left px-3 py-2 rounded-lg hover:bg-pink-soft/50 border border-pink-soft">
      <b>${esc(fmtDate(r.id))}</b> <span class="text-slate-600">${esc(sx || 'ไม่มีอาการ')}</span>${r.mood ? ` · ${esc(MOODS[r.mood])}` : ''}</button>`;
  }).join('') : '<p class="text-xs text-slate-400">ยังไม่มีบันทึกอาการ</p>';
  loadForm();
}

function save() {
  const date = $('#s-date', root).value;
  if (!date) return toast('กรุณาเลือกวันที่', 'err');
  const symptoms = {};
  SYMPTOMS.forEach(([k]) => { symptoms[k] = +$('#s-' + k, root).value; });
  const num = id => { const v = $('#' + id, root).value; return v === '' ? null : +v; };
  // ใช้วันที่เป็น id → 1 วัน = 1 บันทึก บันทึกซ้ำคือแก้ไขของเดิม
  setDoc(userDoc(state.uid, 'symptom_records', date), {
    date, symptoms, mood: num('s-mood'), stress: num('s-stress'), note: $('#s-note', root).value.trim(), updatedAt: new Date()
  }).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  toast('บันทึกอาการแล้ว');
}
function del() {
  const date = $('#s-date', root).value;
  if (confirm('ลบบันทึกอาการของวันนี้?')) deleteDoc(userDoc(state.uid, 'symptom_records', date)).catch(e => toast(e.message, 'err'));
}
