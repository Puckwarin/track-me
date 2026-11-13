import { addDoc, deleteDoc } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, toNum, toast } from './util.js';

// ค่าอ้างอิงทั่วไปเพื่อช่วยกรอกเร็ว — ค่าจริงต่างกันตามห้องแล็บ/เพศ/อายุ ให้แก้ตามที่พิมพ์ในใบผลตรวจเสมอ
export const LAB_PRESETS = [
  ['น้ำตาลในเลือดหลังอดอาหาร (FBS)', 'mg/dL', 70, 99], ['HbA1c', '%', 4, 5.6], ['คอเลสเตอรอลรวม (Total Cholesterol)', 'mg/dL', null, 199],
  ['LDL', 'mg/dL', null, 129], ['HDL', 'mg/dL', 40, null], ['ไตรกลีเซอไรด์ (Triglycerides)', 'mg/dL', null, 149],
  ['ฮีโมโกลบิน (Hb)', 'g/dL', 12, 16], ['ฮีมาโตคริต (Hct)', '%', 36, 46], ['เฟอริติน (Ferritin)', 'ng/mL', 15, 150],
  ['TSH', 'mIU/L', 0.4, 4], ['ครีเอตินีน (Creatinine)', 'mg/dL', 0.5, 1.1], ['กรดยูริก (Uric acid)', 'mg/dL', 2.4, 6],
  ['ALT (SGPT)', 'U/L', null, 40], ['AST (SGOT)', 'U/L', null, 40], ['วิตามินดี (25-OH Vit D)', 'ng/mL', 30, 100], ['วิตามินบี 12', 'pg/mL', 200, 900]
];
const key = n => String(n || '').trim().toLowerCase();
export function labFlag(r) {
  if (typeof r.value !== 'number') return null;
  if (typeof r.refLow === 'number' && r.value < r.refLow) return 'low';
  if (typeof r.refHigh === 'number' && r.value > r.refHigh) return 'high';
  return (typeof r.refLow === 'number' || typeof r.refHigh === 'number') ? 'ok' : null;
}
const FLAG = { low: ['ต่ำกว่าเกณฑ์', 'bg-sky-100 text-sky-800'], high: ['สูงกว่าเกณฑ์', 'bg-rose-100 text-rose-700'], ok: ['ในเกณฑ์', 'bg-green-100 text-green-800'] };
export const refText = r => (typeof r.refLow === 'number' && typeof r.refHigh === 'number' ? `${r.refLow}–${r.refHigh}` : typeof r.refHigh === 'number' ? `< ${r.refHigh}` : typeof r.refLow === 'number' ? `> ${r.refLow}` : '-') + (r.unit ? ' ' + r.unit : '');

let root;
export function mountLab(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-1 space-y-6">
    <div class="card space-y-3">
      <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-vial text-brand"></i> บันทึกผลตรวจ</h2>
      <div><label class="lbl">วันที่ตรวจ</label><input id="lb-date" type="date" class="input"></div>
      <div><label class="lbl">รายการตรวจ (เลือกจากรายการหรือพิมพ์เอง)</label><input id="lb-name" list="lb-names" class="input" placeholder="เช่น HbA1c"><datalist id="lb-names">${LAB_PRESETS.map(p => `<option value="${esc(p[0])}">`).join('')}</datalist></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="lbl">ผลที่ได้</label><input id="lb-value" type="number" step="any" inputmode="decimal" class="input"></div>
        <div><label class="lbl">หน่วย</label><input id="lb-unit" class="input" placeholder="mg/dL"></div>
        <div><label class="lbl">ค่าอ้างอิง ต่ำสุด</label><input id="lb-low" type="number" step="any" inputmode="decimal" class="input"></div>
        <div><label class="lbl">ค่าอ้างอิง สูงสุด</label><input id="lb-high" type="number" step="any" inputmode="decimal" class="input"></div>
      </div>
      <div><label class="lbl">โรงพยาบาล/แล็บ · หมายเหตุ</label><input id="lb-note" class="input" placeholder="ไม่บังคับ"></div>
      <p class="text-[11px] text-slate-500">ค่าอ้างอิงที่เติมให้เป็นค่าทั่วไปเท่านั้น — ให้แก้ตามใบผลตรวจของคุณ (แต่ละแล็บ เพศ และอายุต่างกัน) ผลที่ขึ้นว่าสูง/ต่ำเป็นเพียงการเทียบตัวเลข ไม่ใช่การวินิจฉัย ควรให้แพทย์แปลผล</p>
      <button id="lb-save" class="btn btn-primary w-full justify-center"><i class="fa-solid fa-plus"></i> บันทึกผล</button>
    </div>
  </div>
  <div class="lg:col-span-2 space-y-4"><div class="flex gap-2"><input id="lb-search" class="input" placeholder="🔍 ค้นหารายการ"></div><div id="lb-list" class="space-y-3"></div></div>`;
  $('#lb-date', root).value = localDateStr();
  $('#lb-name', root).addEventListener('input', e => {
    const p = LAB_PRESETS.find(x => x[0] === e.target.value); if (!p) return;
    const last = [...state.labs].filter(r => key(r.name) === key(p[0])).sort((a, b) => b.date.localeCompare(a.date))[0];   // ถ้าเคยกรอกแล้ว ใช้ค่าอ้างอิงจากใบผลครั้งก่อน
    $('#lb-unit', root).value = last?.unit ?? p[1]; $('#lb-low', root).value = (last ? last.refLow : p[2]) ?? ''; $('#lb-high', root).value = (last ? last.refHigh : p[3]) ?? '';
  });
  $('#lb-save', root).addEventListener('click', save);
  $('#lb-search', root).addEventListener('input', render);
  $('#lb-list', root).addEventListener('click', e => {
    const d = e.target.closest('[data-del]');
    if (d && confirm('ลบผลตรวจนี้?')) deleteDoc(userDoc(state.uid, 'lab_records', d.dataset.del)).catch(err => toast(err.message, 'err'));
  });
  render();
}

function save() {
  const name = $('#lb-name', root).value.trim(), value = toNum($('#lb-value', root).value), date = $('#lb-date', root).value;
  if (!name || value === null || !date) return toast('กรอกวันที่ รายการตรวจ และผลที่ได้', 'err');
  const low = toNum($('#lb-low', root).value), high = toNum($('#lb-high', root).value);
  if (low !== null && high !== null && low > high) return toast('ค่าอ้างอิงต่ำสุดต้องไม่มากกว่าสูงสุด', 'err');
  addDoc(userCol(state.uid, 'lab_records'), { date, name: name.slice(0, 80), value, unit: $('#lb-unit', root).value.trim().slice(0, 20), refLow: low, refHigh: high, note: $('#lb-note', root).value.trim().slice(0, 200), createdAt: new Date() })
    .catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  ['lb-name', 'lb-value', 'lb-unit', 'lb-low', 'lb-high'].forEach(id => { $('#' + id, root).value = ''; });
  toast('บันทึกผลตรวจแล้ว');
}

function spark(rows) {
  if (rows.length < 2) return '';
  const W = 120, H = 32, vs = rows.map(r => r.value), min = Math.min(...vs), max = Math.max(...vs), rng = max - min || 1;
  const pts = rows.map((r, i) => `${(i / (rows.length - 1) * (W - 6) + 3).toFixed(1)},${(H - 4 - (r.value - min) / rng * (H - 8)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-28 h-8"><polyline points="${pts}" fill="none" stroke="#8b7ae0" stroke-width="2"/></svg>`;
}

export function render() {
  if (!root) return;
  const q = key($('#lb-search', root).value), groups = new Map();
  state.labs.forEach(r => { const k = key(r.name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const cards = [...groups.values()].map(rows => rows.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)))
    .filter(rows => !q || key(rows[0].name).includes(q)).sort((a, b) => b[b.length - 1].date.localeCompare(a[a.length - 1].date));
  $('#lb-list', root).innerHTML = cards.length ? cards.map(rows => {
    const last = rows[rows.length - 1], f = labFlag(last), prev = rows[rows.length - 2];
    const arrow = prev ? (last.value > prev.value ? '↑' : last.value < prev.value ? '↓' : '→') : '';
    return `<details class="card !p-3"><summary class="cursor-pointer flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0"><p class="font-semibold text-slate-800">${esc(last.name)}</p><p class="text-xs text-slate-500">ล่าสุด ${esc(fmtDate(last.date))} · อ้างอิง ${esc(refText(last))}</p></div>
      <div class="flex items-center gap-3">${spark(rows)}<div class="text-right"><p class="text-lg font-bold">${esc(last.value)} <span class="text-xs font-normal text-slate-500">${esc(last.unit)}</span> <span class="text-sm text-slate-400">${arrow}</span></p>${f ? `<span class="chip !cursor-default ${FLAG[f][1]}">${FLAG[f][0]}</span>` : ''}</div></div></summary>
      <div class="mt-3 divide-y divide-slate-100 text-sm">${rows.slice().reverse().map(r => `<div class="py-1.5 flex items-center justify-between gap-2"><span>${esc(fmtDate(r.date))}${r.note ? ` <span class="text-xs text-slate-400">· ${esc(r.note)}</span>` : ''}</span><span class="flex items-center gap-2"><b>${esc(r.value)}</b> ${esc(r.unit)}${labFlag(r) && labFlag(r) !== 'ok' ? ` <span class="text-xs ${labFlag(r) === 'high' ? 'text-rose-600' : 'text-sky-700'}">${FLAG[labFlag(r)][0]}</span>` : ''}<button data-del="${esc(r.id)}" class="text-rose-400 p-1" aria-label="ลบ"><i class="fa-solid fa-trash-can text-xs"></i></button></span></div>`).join('')}</div></details>`;
  }).join('') : '<p class="text-sm text-slate-400">ยังไม่มีผลตรวจ — บันทึกผลแรกทางด้านซ้าย</p>';
}
