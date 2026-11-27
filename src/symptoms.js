import { setDoc, deleteDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, isValidCalendarDate, localDateStr, addDays, toast, confirmDialog } from './util.js';
import { iconSvg } from './icons.js';
import { guardPreviewWrite } from './preview.js';
import { bindSwipeRows } from './ui.js';

export const SYMPTOMS = [
  ['cramps', 'ปวดท้อง'], ['backache', 'ปวดหลัง'], ['headache', 'ปวดหัว'],
  ['acne', 'สิว'], ['fatigue', 'อ่อนเพลีย'], ['bloating', 'ท้องอืด']
];
export const SEVERITY = ['ไม่มี', 'เล็กน้อย', 'ปานกลาง', 'มาก'];
export const MOODS = ['', '😣 แย่มาก', '🙁 แย่', '😐 ปกติ', '🙂 ดี', '😊 ดีมาก'];
export const STRESS = ['', 'ต่ำมาก', 'ต่ำ', 'ปานกลาง', 'สูง', 'สูงมาก'];

function sliderRow(label, id, options, values = options.map((_, i) => String(i))) {
  const max = options.length - 1;
  return `<div class="tm-dot-row py-2 border-b border-slate-100 last:border-b-0 space-y-1">
    <div class="flex items-center justify-between gap-2 text-xs sm:text-sm">
      <label for="${id}-range" class="font-medium text-slate-700">${esc(label)}:</label>
      <span id="${id}-text" class="font-semibold text-brand-dark tabular-nums">${esc(options[0] || 'ไม่ระบุ')}</span>
    </div>
    <select id="${id}" class="hidden" aria-hidden="true" tabindex="-1">${options.map((text, i) => `<option value="${values[i]}">${text}</option>`).join('')}</select>
    <div class="tm-dot-slider-box">
      <input type="range" id="${id}-range" data-slider-for="${id}" data-values="${esc(values.join('|'))}" data-labels="${esc(options.join('|'))}" class="tm-slider tm-dot-slider" min="0" max="${max}" step="1" value="0" aria-label="${esc(label)}">
      <div class="tm-dot-stops" aria-hidden="true">
        ${options.map((_, i) => `<button type="button" data-dot-for="${id}" data-dot-idx="${i}" class="tm-dot-stop ${i === 0 ? 'is-active' : ''}" tabindex="-1"><span class="tm-dot-pip"></span></button>`).join('')}
      </div>
    </div>
  </div>`;
}

function syncChoices() {
  if (!root) return;
  root.querySelectorAll('[data-slider-for]').forEach(range => {
    const id = range.dataset.sliderFor;
    const select = $('#' + id, root);
    const values = (range.dataset.values || '').split('|');
    const labels = (range.dataset.labels || '').split('|');
    const idx = Math.max(0, values.indexOf(select ? select.value : ''));
    range.value = String(idx);
    const textEl = $('#' + id + '-text', root);
    if (textEl) {
      const txt = labels[idx] || 'ไม่ระบุ';
      textEl.textContent = txt;
      textEl.classList.toggle('text-slate-400', idx === 0);
      textEl.classList.toggle('text-brand-dark', idx > 0);
    }
    const stops = root.querySelectorAll(`[data-dot-for="${id}"]`);
    stops.forEach((dot, dIdx) => dot.classList.toggle('is-active', dIdx === idx));
  });
}

let root;
let activeSymptomsTab = 'symptoms';
let pendingSelectedDate = null;

export function setSymptomsTab(tab) {
  if (!root) return;
  activeSymptomsTab = tab === 'skin' ? 'skin' : 'symptoms';
  root.querySelectorAll('[data-sx-tab]').forEach(btn => {
    const on = btn.dataset.sxTab === activeSymptomsTab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#sx-panel-symptoms', root)?.classList.toggle('hidden', activeSymptomsTab !== 'symptoms');
  $('#sx-panel-skin', root)?.classList.toggle('hidden', activeSymptomsTab !== 'skin');
}

export function mountSymptoms(el) {
  root = el;
  activeSymptomsTab = 'symptoms';
  root.innerHTML = `
    <div class="card space-y-3 lg:col-span-3">
      <div>
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('file-heart', { size: 18, className: 'text-pink-500' })}<span>บันทึกอาการรายวัน & ผิว</span></h3>
        <p class="text-xs text-slate-500 mt-0.5">บันทึกได้ทุกวัน — เลือกวันเดียวกันเพื่อจดทั้งอาการทั่วไปและอาการผิว</p>
      </div>
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <label class="w-full sm:w-32 shrink-0 text-sm font-medium text-slate-700" for="s-date">วันที่</label>
        <div class="flex-1 min-w-0">
          <input type="date" id="s-date" class="input" min="${addDays(localDateStr(), -399)}" max="${localDateStr()}">
          <p class="text-[11px] text-slate-500 mt-1">แตะวันที่ในปฏิทินหน้าประจำเดือนเพื่อเลือกก็ได้</p>
        </div>
      </div>
      <div class="tm-seg tm-seg--2" role="tablist" aria-label="หมวดบันทึกอาการ">
        <button type="button" role="tab" data-sx-tab="symptoms" aria-selected="true" class="tm-seg-btn is-active">อาการทั่วไป</button>
        <button type="button" role="tab" data-sx-tab="skin" aria-selected="false" class="tm-seg-btn">บันทึกผิว</button>
      </div>
    </div>

    <div id="sx-panel-symptoms" class="lg:col-span-3 grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      <div class="card space-y-4 lg:col-span-3">
        <div class="rounded-2xl border border-slate-200 bg-white px-3.5 py-1 grid grid-cols-1 sm:grid-cols-2 gap-x-5">
          ${SYMPTOMS.map(([k, t]) => sliderRow(t, 's-' + k, SEVERITY)).join('')}
          ${sliderRow('อารมณ์', 's-mood', ['ไม่ระบุ', ...MOODS.slice(1)], ['', '1', '2', '3', '4', '5'])}
          ${sliderRow('ความเครียด', 's-stress', ['ไม่ระบุ', ...STRESS.slice(1)], ['', '1', '2', '3', '4', '5'])}
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <label class="w-full sm:w-28 shrink-0 text-sm font-medium text-slate-700" for="s-note">หมายเหตุ</label>
          <input id="s-note" class="input flex-1" placeholder="เช่น กินยาแก้ปวด, นอนน้อย">
        </div>
        <div class="flex justify-end gap-2">
          <button id="s-del" class="btn btn-ghost text-rose-700 border-rose-200 hover:bg-rose-50 hidden">${iconSvg('trash', { size: 15 })} ลบวันนี้</button>
          <button id="s-save" class="btn btn-pink">${iconSvg('check', { size: 15 })} บันทึกอาการ</button>
        </div>
      </div>
      <div class="card space-y-2.5 lg:col-span-2">
        <h4 class="text-sm font-bold text-slate-800">บันทึกล่าสุด</h4>
        <p id="s-swipe-hint" class="tm-swipe-hint hidden">ปัดซ้ายที่รายการเพื่อแก้ไขหรือลบ</p>
        <div id="s-list" class="tm-swipe-list tm-swipe-list--cards text-sm"></div>
      </div>
    </div>

    <section id="sx-panel-skin" class="lg:col-span-3 grid grid-cols-1 lg:grid-cols-5 gap-6 items-start hidden">
      <div class="card space-y-4 lg:col-span-3">
        <header>
          <h3 class="font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('smile', { size: 18, className: 'text-rose-500' })}<span>บันทึกผิวรายวัน</span></h3>
          <p class="text-xs text-slate-500">ติดตามอาการระคายเคืองและผลลัพธ์ต่อผิวตามวันที่เลือกด้านบน</p>
        </header>
        <div class="rounded-2xl border border-slate-200 bg-white px-3.5 py-1 grid grid-cols-1 sm:grid-cols-2 gap-x-5">
          ${SKIN_FIELDS.map(([k, t]) => sliderRow(t, 'skin-' + k, SEVERITY)).join('')}
        </div>
        <div class="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
          <label class="w-full sm:w-28 shrink-0 text-sm font-medium text-slate-700 sm:pt-2" for="skin-result">ผลลัพธ์ต่อผิว</label>
          <textarea id="skin-result" class="input flex-1" placeholder="ผลลัพธ์/สิ่งที่สังเกต เช่น ผิวชุ่มชื้นขึ้นหลังใช้ผลิตภัณฑ์"></textarea>
        </div>
        <div class="flex justify-end gap-2">
          <button id="skin-del" class="btn btn-ghost text-rose-700 border-rose-200 hover:bg-rose-50 hidden">${iconSvg('trash', { size: 15 })} ลบบันทึกผิว</button>
          <button id="skin-save" class="btn btn-pink">${iconSvg('check', { size: 15 })} บันทึกอาการผิว</button>
        </div>
      </div>
      <div class="card space-y-2.5 lg:col-span-2">
        <h4 class="text-sm font-bold text-slate-800">บันทึกผิวล่าสุด</h4>
        <p id="skin-swipe-hint" class="tm-swipe-hint hidden">ปัดซ้ายที่รายการเพื่อแก้ไขหรือลบ</p>
        <div id="skin-list" class="tm-swipe-list tm-swipe-list--cards text-sm"></div>
      </div>
    </section>`;

  $('#s-date', root).value = pendingSelectedDate || localDateStr();
  pendingSelectedDate = null;
  root.addEventListener('input', e => {
    const range = e.target.closest('[data-slider-for]');
    if (!range) return;
    const id = range.dataset.sliderFor;
    const select = $('#' + id, root);
    const values = (range.dataset.values || '').split('|');
    if (select) select.value = values[Number(range.value)] ?? '';
    syncChoices();
  });
  root.addEventListener('click', e => {
    const tabBtn = e.target.closest('[data-sx-tab]');
    if (tabBtn) {
      setSymptomsTab(tabBtn.dataset.sxTab);
      return;
    }
    const dotBtn = e.target.closest('[data-dot-for]');
    if (dotBtn) {
      const id = dotBtn.dataset.dotFor;
      const idx = Number(dotBtn.dataset.dotIdx);
      const range = $('#' + id + '-range', root);
      const select = $('#' + id, root);
      const values = (range?.dataset.values || '').split('|');
      if (select) select.value = values[idx] ?? '';
      syncChoices();
    }
  });
  window.addEventListener('trackme:show-symptoms', e => {
    if (root?.isConnected) setSymptomsTab(e.detail?.targetTab === 'skin' ? 'skin' : 'symptoms');
  });
  window.addEventListener('trackme:focus', e => {
    if (!root?.isConnected || e.detail?.tab !== 'symptoms') return;
    const fid = String(e.detail?.focusId || '');
    setSymptomsTab(fid.startsWith('skin-') ? 'skin' : 'symptoms');
  });
  $('#s-date', root).addEventListener('change', () => {
    loadForm();
    window.dispatchEvent(new CustomEvent('trackme:symptom-date-change', { detail: { date: $('#s-date', root).value } }));
  });
  $('#s-save', root).addEventListener('click', save);
  $('#s-del', root).addEventListener('click', del);
  $('#skin-save', root).addEventListener('click', saveSkin);
  $('#skin-del', root).addEventListener('click', delSkin);
  $('#s-list', root).addEventListener('click', async e => {
    const delBtn = e.target.closest('[data-del-sx]');
    if (delBtn) {
      if (guardPreviewWrite('การลบบันทึกอาการ')) return;
      const delId = delBtn.dataset.delSx;
      const ok = await confirmDialog({
        title: 'ลบบันทึกอาการ?',
        message: 'ลบบันทึกอาการของวันที่เลือก?',
        confirmText: 'ลบบันทึก',
        cancelText: 'ยกเลิก',
        danger: true
      });
      if (!ok) return;
      deleteDoc(userDoc(state.uid, 'symptom_records', delId)).catch(err => toast(err.message, 'err'));
      return;
    }
    const b = e.target.closest('[data-d]');
    if (b) selectDate(b.dataset.d, 'symptoms');
  });
  $('#skin-list', root).addEventListener('click', async e => {
    const delBtn = e.target.closest('[data-del-skin]');
    if (delBtn) {
      if (guardPreviewWrite('การลบบันทึกผิว')) return;
      const delId = delBtn.dataset.delSkin;
      const ok = await confirmDialog({
        title: 'ลบบันทึกผิว?',
        message: 'ลบบันทึกผิวของวันที่เลือก?',
        confirmText: 'ลบบันทึก',
        cancelText: 'ยกเลิก',
        danger: true
      });
      if (!ok) return;
      deleteDoc(userDoc(state.uid, 'skin_records', delId)).catch(err => toast(err.message, 'err'));
      return;
    }
    const b = e.target.closest('[data-skin-d]');
    if (b) selectDate(b.dataset.skinD, 'skin');
  });
  setSymptomsTab('symptoms');
  loadForm();
}

export function setDateOnly(d, targetTab = null) {
  pendingSelectedDate = d || null;
  if (!root) return;
  const dateEl = $('#s-date', root);
  if (dateEl && d) dateEl.value = d;
  pendingSelectedDate = null;
  loadForm();
  if (targetTab) setSymptomsTab(targetTab);
}

export function selectDate(d, targetTab = 'symptoms') {
  pendingSelectedDate = d || null;
  if (!root) {
    window.dispatchEvent(new CustomEvent('trackme:show-symptoms', { detail: { date: d, targetTab } }));
    return;
  }
  $('#s-date', root).value = d;
  pendingSelectedDate = null;
  loadForm();
  setSymptomsTab(targetTab);
  window.dispatchEvent(new CustomEvent('trackme:show-symptoms', { detail: { date: d, targetTab } }));
  window.dispatchEvent(new CustomEvent('trackme:symptom-date-change', { detail: { date: d } }));
  setTimeout(() => root.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
}

export function resetSymptomsToToday() {
  pendingSelectedDate = null;
  if (!root) return;
  const today = localDateStr();
  const dateEl = $('#s-date', root);
  if (dateEl) {
    dateEl.min = addDays(today, -399);
    dateEl.max = today;
    dateEl.value = today;
  }
  loadForm();
  window.dispatchEvent(new CustomEvent('trackme:symptom-date-change', { detail: { date: '' } }));
}

const get = date => state.symptoms.find(s => s.id === date);
const SKIN_FIELDS = [['rash', 'ผื่น'], ['itch', 'คัน'], ['burning', 'แสบ'], ['redness', 'แดง'], ['peeling', 'ลอก'], ['dryness', 'แห้ง']];
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
  $('#s-swipe-hint', root)?.classList.toggle('hidden', !rows.length);
  const sListEl = $('#s-list', root);
  sListEl.innerHTML = rows.length ? rows.map(r => {
    const sx = SYMPTOMS.filter(([k]) => r.symptoms?.[k] > 0).map(([k, t]) => `${t} (${SEVERITY[r.symptoms[k]]})`).join(', ');
    return `<div class="tm-swipe-row">
      <div class="tm-swipe-actions">
        <button type="button" data-d="${esc(r.id)}" class="tm-swipe-action-btn is-edit" aria-label="แก้ไขอาการ ${esc(fmtDate(r.id))}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
        <button type="button" data-del-sx="${esc(r.id)}" class="tm-swipe-action-btn is-del" aria-label="ลบอาการ ${esc(fmtDate(r.id))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
      </div>
      <div class="tm-swipe-card !flex-row items-center justify-between gap-2 !px-3 !py-2">
        <button type="button" data-d="${esc(r.id)}" class="min-w-0 flex-1 text-left py-1 min-h-[44px] tabular-nums">
          <b>${esc(fmtDate(r.id))}</b> <span class="text-slate-600">${esc(sx || 'ไม่มีอาการ')}</span>${r.mood ? ` · ${esc(MOODS[r.mood])}` : ''}
        </button>
        <div class="tm-row-actions">
          <button type="button" data-d="${esc(r.id)}" class="tm-row-action-btn" aria-label="แก้ไขอาการ ${esc(fmtDate(r.id))}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
          <button type="button" data-del-sx="${esc(r.id)}" class="tm-row-action-btn is-del" aria-label="ลบอาการ ${esc(fmtDate(r.id))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
        </div>
      </div>
    </div>`;
  }).join('') : '<p class="text-xs text-slate-500">ยังไม่มีบันทึกอาการ</p>';
  bindSwipeRows(sListEl);
  loadForm();
  renderSkinList();
}

export function renderSkinList() {
  if (!root) return;
  const rows = (state.skinRecords || []).slice().sort((a, b) => b.id.localeCompare(a.id)).slice(0, 10);
  $('#skin-swipe-hint', root)?.classList.toggle('hidden', !rows.length);
  const skinListEl = $('#skin-list', root);
  skinListEl.innerHTML = rows.length ? rows.map(r => {
    const signs = SKIN_FIELDS.filter(([k]) => r.symptoms?.[k] > 0).map(([k, t]) => `${t} (${SEVERITY[r.symptoms[k]]})`).join(', ');
    return `<div class="tm-swipe-row">
      <div class="tm-swipe-actions">
        <button type="button" data-skin-d="${esc(r.id)}" class="tm-swipe-action-btn is-edit" aria-label="แก้ไขบันทึกผิว ${esc(fmtDate(r.id))}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
        <button type="button" data-del-skin="${esc(r.id)}" class="tm-swipe-action-btn is-del" aria-label="ลบบันทึกผิว ${esc(fmtDate(r.id))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
      </div>
      <div class="tm-swipe-card !flex-row items-center justify-between gap-2 !px-3 !py-2">
        <button type="button" data-skin-d="${esc(r.id)}" class="min-w-0 flex-1 text-left py-1 min-h-[44px] tabular-nums">
          <b>${esc(fmtDate(r.id))}</b> · ${esc(signs || 'ไม่มีอาการผิว')}${r.result ? `<span class="block text-xs text-slate-500">${esc(r.result)}</span>` : ''}
        </button>
        <div class="tm-row-actions">
          <button type="button" data-skin-d="${esc(r.id)}" class="tm-row-action-btn" aria-label="แก้ไขบันทึกผิว ${esc(fmtDate(r.id))}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
          <button type="button" data-del-skin="${esc(r.id)}" class="tm-row-action-btn is-del" aria-label="ลบบันทึกผิว ${esc(fmtDate(r.id))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
        </div>
      </div>
    </div>`;
  }).join('') : '<p class="text-xs text-slate-500">ยังไม่มีบันทึกผิว</p>';
  bindSwipeRows(skinListEl);
  loadSkinForm();
}

function save() {
  if (guardPreviewWrite('การบันทึกอาการรายวัน')) return;
  const date = $('#s-date', root).value;
  if (!isValidCalendarDate(date)) return toast('กรุณาเลือกวันที่ให้ถูกต้อง', 'err');
  const symptoms = {};
  SYMPTOMS.forEach(([k]) => { symptoms[k] = +$('#s-' + k, root).value; });
  const num = id => { const v = $('#' + id, root).value; return v === '' ? null : +v; };
  // ใช้วันที่เป็น id → 1 วัน = 1 บันทึก บันทึกซ้ำคือแก้ไขของเดิม
  setDoc(userDoc(state.uid, 'symptom_records', date), {
    date, symptoms, mood: num('s-mood'), stress: num('s-stress'), note: $('#s-note', root).value.trim(), updatedAt: new Date()
  }).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  toast('บันทึกอาการแล้ว');
}
async function del() {
  if (guardPreviewWrite('การลบบันทึกอาการ')) return;
  const date = $('#s-date', root).value;
  const ok = await confirmDialog({
    title: 'ลบบันทึกอาการวันนี้?',
    message: 'ลบบันทึกอาการของวันนี้?',
    confirmText: 'ลบบันทึก',
    cancelText: 'ยกเลิก',
    danger: true
  });
  if (!ok) return;
  deleteDoc(userDoc(state.uid, 'symptom_records', date)).catch(e => toast(e.message, 'err'));
}

function saveSkin() {
  if (guardPreviewWrite('การบันทึกอาการผิว')) return;
  const date = $('#s-date', root).value;
  if (!isValidCalendarDate(date)) return toast('กรุณาเลือกวันที่ให้ถูกต้อง', 'err');
  const symptoms = Object.fromEntries(SKIN_FIELDS.map(([k]) => [k, +$('#skin-' + k, root).value]));
  setDoc(userDoc(state.uid, 'skin_records', date), { date, symptoms, result: $('#skin-result', root).value.trim(), updatedAt: new Date() })
    .then(() => toast('บันทึกอาการผิวแล้ว')).catch(e => toast('บันทึกอาการผิวไม่สำเร็จ: ' + e.message, 'err'));
}
async function delSkin() {
  if (guardPreviewWrite('การลบบันทึกผิว')) return;
  const date = $('#s-date', root).value;
  const ok = await confirmDialog({
    title: 'ลบบันทึกผิววันนี้?',
    message: 'ลบบันทึกผิวของวันนี้?',
    confirmText: 'ลบบันทึก',
    cancelText: 'ยกเลิก',
    danger: true
  });
  if (!ok) return;
  deleteDoc(userDoc(state.uid, 'skin_records', date)).catch(e => toast(e.message, 'err'));
}
