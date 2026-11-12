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

const SEVERITY_ICONS = ['✨', '🌱', '🌼', '🆘'];
function choiceControl(id, options, icons = [], values=options.map((_,i)=>String(i))) {
  return `<select id="${id}" class="hidden" aria-hidden="true" tabindex="-1">${options.map((text,i)=>`<option value="${values[i]}">${text}</option>`).join('')}</select><div class="flex flex-wrap gap-1.5 mt-1" role="group" aria-label="${id}">${options.map((text,i)=>`<button type="button" data-choice-for="${id}" data-value="${values[i]}" aria-pressed="${i===0}" class="rounded-full border border-pink-100 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-pink-50 aria-pressed:bg-pink-100 aria-pressed:border-pink-300 aria-pressed:text-rose-800">${icons[i] ? `${icons[i]} ` : ''}${text || 'ไม่ระบุ'}</button>`).join('')}</div>`;
}
function syncChoices() {
  if(!root)return;
  root.querySelectorAll('[data-choice-for]').forEach(button=>{
    const select=$('#'+button.dataset.choiceFor,root);
    const active=select && button.dataset.value===select.value;
    button.setAttribute('aria-pressed',String(Boolean(active)));
    button.classList.toggle('bg-pink-100',Boolean(active));
    button.classList.toggle('border-pink-300',Boolean(active));
    button.classList.toggle('text-rose-800',Boolean(active));
  });
}

let root;

export function mountSymptoms(el) {
  root = el;
  root.innerHTML = `
    <div class="card space-y-4 lg:col-span-2">
    <div><h3 class="font-bold text-slate-800"><i class="fa-solid fa-notes-medical text-pink-500"></i> บันทึกอาการรายวัน</h3><p class="text-xs text-slate-500 mt-1">บันทึกได้ทุกวัน ไม่ว่าจะมีประจำเดือนหรือไม่</p></div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div class="col-span-2 sm:col-span-3"><label class="lbl">วันที่ (แตะวันที่ในปฏิทินเพื่อเลือกก็ได้)</label>
        <input type="date" id="s-date" class="input" min="${addDays(localDateStr(), -399)}" max="${localDateStr()}"></div>
      ${SYMPTOMS.map(([k, t]) => `<div><label class="lbl">${t}</label>${choiceControl('s-'+k,SEVERITY,SEVERITY_ICONS)}</div>`).join('')}
      <div><label class="lbl">อารมณ์</label>${choiceControl('s-mood',['ไม่ระบุ',...MOODS.slice(1)],['💭','😣','🙁','😐','🙂','😊'],['','1','2','3','4','5'])}</div>
      <div><label class="lbl">ระดับความเครียด</label>${choiceControl('s-stress',['ไม่ระบุ',...STRESS.slice(1)],['💭','🍃','🌿','🌼','🌧️','🌪️'],['','1','2','3','4','5'])}</div>
      <div class="col-span-2 sm:col-span-3"><label class="lbl">หมายเหตุเพิ่มเติม</label><input id="s-note" class="input" placeholder="เช่น กินยาแก้ปวด, นอนน้อย"></div>
    </div>
    <div class="flex justify-end gap-2">
      <button id="s-del" class="btn btn-ghost hidden">ลบวันนี้</button>
      <button id="s-save" class="btn btn-pink"><i class="fa-solid fa-floppy-disk"></i> บันทึกอาการ</button>
    </div>
    <div><h4 class="text-xs font-bold text-slate-500 mb-2">บันทึกล่าสุด</h4><div id="s-list" class="space-y-1 text-sm"></div></div>
    </div>
    <section class="card space-y-4 lg:col-span-2"><header><h3 class="font-bold text-slate-800"><i class="fa-solid fa-face-smile text-rose-500"></i> บันทึกผิวรายวัน</h3><p class="text-xs text-slate-500">รวมกับบันทึกอาการรายวัน เลือกวันเดียวกันเพื่อจดอาการและผลลัพธ์ต่อผิว</p></header>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${SKIN_FIELDS.map(([k,t])=>`<div><label class="lbl">${t}</label>${choiceControl('skin-'+k,SEVERITY,SEVERITY_ICONS)}</div>`).join('')}</div>
      <textarea id="skin-result" class="input" placeholder="ผลลัพธ์/สิ่งที่สังเกต เช่น ผิวชุ่มชื้นขึ้นหลังใช้ผลิตภัณฑ์"></textarea>
      <div class="flex justify-end gap-2"><button id="skin-del" class="btn btn-ghost hidden">ลบบันทึกผิว</button><button id="skin-save" class="btn btn-pink">บันทึกอาการผิว</button></div>
      <div><h4 class="text-xs font-bold text-slate-500 mb-2">บันทึกผิวล่าสุด</h4><div id="skin-list" class="space-y-1 text-sm"></div></div>
    </section>`;
  $('#s-date', root).value = localDateStr();
  root.addEventListener('click',e=>{const b=e.target.closest('[data-choice-for]');if(!b)return;const select=$('#'+b.dataset.choiceFor,root);select.value=b.dataset.value;syncChoices();});
  $('#s-date', root).addEventListener('change', loadForm);
  $('#s-date', root).addEventListener('change', loadSkinForm);
  $('#s-save', root).addEventListener('click', save);
  $('#s-del', root).addEventListener('click', del);
  $('#skin-save', root).addEventListener('click', saveSkin);
  $('#skin-del', root).addEventListener('click', delSkin);
  $('#s-list', root).addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) selectDate(b.dataset.d); });
  $('#skin-list', root).addEventListener('click', e => { const b = e.target.closest('[data-skin-d]'); if (b) selectDate(b.dataset.skinD); });
  loadForm();
}

export function selectDate(d) {
  if (!root) return;
  $('#s-date', root).value = d;
  loadForm();
  window.dispatchEvent(new Event('trackme:show-symptoms'));
  setTimeout(() => root.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
}

const get = date => state.symptoms.find(s => s.id === date);
const SKIN_FIELDS = [['rash','ผื่น'],['itch','คัน'],['burning','แสบ'],['redness','แดง'],['peeling','ลอก'],['dryness','แห้ง']];
const getSkin = date => state.skinRecords?.find(s => s.id === date);

export function loadForm() {
  if (!root) return;
  const r = get($('#s-date', root).value);
  SYMPTOMS.forEach(([k]) => { $('#s-' + k, root).value = r?.symptoms?.[k] ?? 0; });
  $('#s-mood', root).value = r?.mood ?? '';
  $('#s-stress', root).value = r?.stress ?? '';
  $('#s-note', root).value = r?.note ?? '';
  syncChoices();
  $('#s-del', root).classList.toggle('hidden', !r);
  loadSkinForm();
}

function loadSkinForm() {
  if (!root) return;
  const r = getSkin($('#s-date', root).value);
  SKIN_FIELDS.forEach(([k]) => { $('#skin-' + k, root).value = r?.symptoms?.[k] ?? 0; });
  $('#skin-result', root).value = r?.result ?? '';
  syncChoices();
  $('#skin-del', root).classList.toggle('hidden', !r);
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
  renderSkinList();
}

export function renderSkinList() {
  if (!root) return;
  const rows = (state.skinRecords || []).slice().sort((a,b)=>b.id.localeCompare(a.id)).slice(0,10);
  $('#skin-list', root).innerHTML = rows.length ? rows.map(r => {
    const signs = SKIN_FIELDS.filter(([k])=>r.symptoms?.[k]>0).map(([k,t])=>`${t} (${SEVERITY[r.symptoms[k]]})`).join(', ');
    return `<button data-skin-d="${esc(r.id)}" class="w-full text-left px-3 py-2 rounded-lg border border-rose-100 hover:bg-rose-50"><b>${esc(fmtDate(r.id))}</b> · ${esc(signs||'ไม่มีอาการผิว')}<span class="block text-xs text-slate-500">${esc(r.result||'')}</span></button>`;
  }).join('') : '<p class="text-xs text-slate-400">ยังไม่มีบันทึกผิว</p>';
  loadSkinForm();
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

function saveSkin() {
  const date = $('#s-date', root).value;
  if (!date) return toast('กรุณาเลือกวันที่', 'err');
  const symptoms = Object.fromEntries(SKIN_FIELDS.map(([k])=>[k,+$('#skin-'+k,root).value]));
  setDoc(userDoc(state.uid,'skin_records',date),{date,symptoms,result:$('#skin-result',root).value.trim(),updatedAt:new Date()})
    .then(()=>toast('บันทึกอาการผิวแล้ว')).catch(e=>toast('บันทึกอาการผิวไม่สำเร็จ: '+e.message,'err'));
}
function delSkin() {
  const date=$('#s-date',root).value;
  if(confirm('ลบบันทึกผิวของวันนี้?')) deleteDoc(userDoc(state.uid,'skin_records',date)).catch(e=>toast(e.message,'err'));
}
