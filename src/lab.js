import { addDoc, deleteDoc, writeBatch, doc } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, isDateStr, toNum, toast, openModal } from './util.js';
import { readLabReportFromPhoto, explainGeminiError } from './nutrition.js';

// ค่าอ้างอิงทั่วไปเพื่อช่วยกรอกเร็ว — ค่าจริงต่างกันตามห้องแล็บ/ชนิดสัตว์/อายุ ให้แก้ตามใบผลตรวจเสมอ
export const LAB_PRESETS = [
  ['BUN', 'mg/dL', 7, 27],
  ['Creatinine (CREA)', 'mg/dL', 0.5, 1.8],
  ['SDMA', 'µg/dL', 0, 14],
  ['ALT (SGPT)', 'U/L', 10, 125],
  ['ALP (ALKP)', 'U/L', 23, 212],
  ['AST (SGOT)', 'U/L', 0, 50],
  ['Glucose (GLU)', 'mg/dL', 74, 143],
  ['Total Protein (TP)', 'g/dL', 5.2, 8.2],
  ['Albumin (ALB)', 'g/dL', 2.3, 4.0],
  ['Globulin (GLOB)', 'g/dL', 2.5, 4.5],
  ['WBC', 'K/µL', 5.05, 16.76],
  ['RBC', 'M/µL', 5.65, 8.87],
  ['HGB (ฮีโมโกลบิน)', 'g/dL', 13.1, 20.5],
  ['HCT (ฮีมาโตคริต)', '%', 37.3, 61.7],
  ['PLT (เกล็ดเลือด)', 'K/µL', 148, 484],
  ['น้ำตาลในเลือดหลังอดอาหาร (FBS)', 'mg/dL', 70, 99],
  ['HbA1c', '%', 4, 5.6],
  ['คอเลสเตอรอลรวม (Total Cholesterol)', 'mg/dL', null, 199],
  ['TSH', 'mIU/L', 0.4, 4]
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
      <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-vial text-brand"></i> บันทึกผลตรวจ / ผลเลือด</h2>
      <label class="border-2 border-dashed border-lav-soft bg-lav-soft/40 rounded-xl p-3 text-center cursor-pointer block">
        <input type="file" id="lb-photo" accept="image/*" class="hidden">
        <i class="fa-solid fa-camera text-lg text-brand"></i>
        <span class="block text-sm font-semibold text-slate-700">ถ่ายรูป / เลือกรูปใบผลตรวจ</span>
        <span class="block text-xs text-slate-500">ให้ AI อ่านค่าหลายรายการแล้วตรวจสอบก่อนบันทึก</span>
      </label>
      <p id="lb-scan-status" class="hidden text-xs text-slate-500"></p>
      <div><label class="lbl">วันที่ตรวจ</label><input id="lb-date" type="date" class="input"></div>
      <div><label class="lbl">รายการตรวจ (เลือกจากรายการหรือพิมพ์เอง)</label><input id="lb-name" list="lb-names" class="input" placeholder="เช่น BUN, Creatinine, HCT"><datalist id="lb-names">${LAB_PRESETS.map(p => `<option value="${esc(p[0])}">`).join('')}</datalist></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="lbl">ผลที่ได้</label><input id="lb-value" type="number" step="any" inputmode="decimal" class="input"></div>
        <div><label class="lbl">หน่วย</label><input id="lb-unit" class="input" placeholder="mg/dL"></div>
        <div><label class="lbl">ค่าอ้างอิง ต่ำสุด</label><input id="lb-low" type="number" step="any" inputmode="decimal" class="input"></div>
        <div><label class="lbl">ค่าอ้างอิง สูงสุด</label><input id="lb-high" type="number" step="any" inputmode="decimal" class="input"></div>
      </div>
      <div><label class="lbl">คลินิก/โรงพยาบาล · หมายเหตุ</label><input id="lb-note" class="input" placeholder="ไม่บังคับ"></div>
      <p class="text-[11px] text-slate-500">ค่าอ้างอิงที่เติมให้เป็นค่าทั่วไปเท่านั้น — แก้ตามใบผลตรวจจริงทุกครั้ง ผลสูง/ต่ำเป็นการเทียบตัวเลข ควรให้สัตวแพทย์หรือแพทย์แปลผล</p>
      <button id="lb-save" class="btn btn-primary w-full justify-center"><i class="fa-solid fa-plus"></i> บันทึกผล</button>
    </div>
  </div>
  <div class="lg:col-span-2 space-y-4"><div class="flex gap-2"><input id="lb-search" class="input" placeholder="🔍 ค้นหารายการผลตรวจ"></div><div id="lb-list" class="space-y-3"></div></div>`;
  $('#lb-date', root).value = localDateStr();
  $('#lb-name', root).addEventListener('input', e => {
    const p = LAB_PRESETS.find(x => x[0] === e.target.value); if (!p) return;
    const last = [...state.labs].filter(r => key(r.name) === key(p[0])).sort((a, b) => b.date.localeCompare(a.date))[0];   // ถ้าเคยกรอกแล้ว ใช้ค่าอ้างอิงจากใบผลครั้งก่อน
    $('#lb-unit', root).value = last?.unit ?? p[1]; $('#lb-low', root).value = (last ? last.refLow : p[2]) ?? ''; $('#lb-high', root).value = (last ? last.refHigh : p[3]) ?? '';
  });
  $('#lb-photo', root).addEventListener('change', onScanLabPhoto);
  $('#lb-save', root).addEventListener('click', save);
  $('#lb-search', root).addEventListener('input', render);
  $('#lb-list', root).addEventListener('click', e => {
    const d = e.target.closest('[data-del]');
    if (d && confirm('ลบผลตรวจนี้?')) deleteDoc(userDoc(state.uid, 'lab_records', d.dataset.del)).catch(err => toast(err.message, 'err'));
  });
  render();
}

async function onScanLabPhoto(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  const st = $('#lb-scan-status', root);
  st.className = 'text-xs text-slate-500';
  st.textContent = 'กำลังอ่านใบผลตรวจด้วย AI...';
  try {
    const res = await readLabReportFromPhoto(f);
    st.classList.add('hidden');
    const items = (res?.items || []).filter(x => x && x.name && typeof x.value === 'number' && Number.isFinite(x.value));
    if (!items.length) {
      return toast('ไม่พบค่าตรวจที่อ่านได้ชัดเจน ลองถ่ายให้ชัดขึ้นหรือกรอกเองค่ะ', 'err');
    }
    const defaultDate = isDateStr(res.date) ? res.date : ($('#lb-date', root).value || localDateStr());
    const labName = (res.labName || '').trim();
    const m = openModal(`
      <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">ตรวจค่าที่ AI อ่านได้ (${items.length} รายการ)</h3><button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>
      <p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 mb-3">โปรดเทียบตัวเลขและค่าอ้างอิงกับใบผลตรวจจริงก่อนกดบันทึก</p>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <div><label class="lbl">วันที่ตรวจ</label><input id="lbs-date" type="date" class="input" value="${esc(defaultDate)}"></div>
        <div><label class="lbl">คลินิก/หมายเหตุรวม</label><input id="lbs-note" class="input" value="${esc(labName)}" placeholder="ไม่บังคับ"></div>
      </div>
      <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
        ${items.map((it, i) => `
          <div class="rounded-xl border border-slate-200 p-2.5 space-y-2 bg-slate-50/70" data-lbs-row="${i}">
            <div class="flex items-center gap-2">
              <input type="checkbox" class="lbs-check" data-i="${i}" checked>
              <input class="input !py-1.5 text-sm font-semibold" data-f="name" value="${esc(it.name || '')}" placeholder="ชื่อรายการ">
            </div>
            <div class="grid grid-cols-4 gap-1.5 text-xs">
              <div><label class="lbl">ค่า</label><input type="number" step="any" class="input !py-1" data-f="value" value="${it.value ?? ''}"></div>
              <div><label class="lbl">หน่วย</label><input class="input !py-1" data-f="unit" value="${esc(it.unit || '')}"></div>
              <div><label class="lbl">ต่ำสุด</label><input type="number" step="any" class="input !py-1" data-f="refLow" value="${it.refLow ?? ''}"></div>
              <div><label class="lbl">สูงสุด</label><input type="number" step="any" class="input !py-1" data-f="refHigh" value="${it.refHigh ?? ''}"></div>
            </div>
          </div>`).join('')}
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button data-close class="btn btn-ghost">ยกเลิก</button>
        <button id="lbs-save" class="btn btn-primary">บันทึกรายการที่เลือก</button>
      </div>`, { wide: true });

    $('#lbs-save', m.el).addEventListener('click', async () => {
      const date = $('#lbs-date', m.el).value;
      const globalNote = $('#lbs-note', m.el).value.trim();
      if (!date) return toast('กรุณาระบุวันที่ตรวจ', 'err');
      const rowsToSave = [];
      m.el.querySelectorAll('[data-lbs-row]').forEach(rowEl => {
        const chk = rowEl.querySelector('.lbs-check');
        if (!chk?.checked) return;
        const val = key => rowEl.querySelector(`[data-f="${key}"]`).value;
        const name = val('name').trim();
        const value = toNum(val('value'));
        if (!name || value === null) return;
        const refLow = toNum(val('refLow'));
        const refHigh = toNum(val('refHigh'));
        rowsToSave.push({
          date,
          name: name.slice(0, 80),
          value,
          unit: val('unit').trim().slice(0, 20),
          refLow: refLow !== null && refHigh !== null && refLow > refHigh ? null : refLow,
          refHigh: refLow !== null && refHigh !== null && refLow > refHigh ? null : refHigh,
          note: (items[+rowEl.dataset.lbsRow]?.note || globalNote || '').slice(0, 200),
          createdAt: new Date()
        });
      });
      if (!rowsToSave.length) return toast('เลือกรายการที่มีชื่อและตัวเลขอย่างน้อย 1 รายการ', 'err');
      const btn = $('#lbs-save', m.el);
      btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
      try {
        for (let i = 0; i < rowsToSave.length; i += 450) {
          const batch = writeBatch(db);
          const colRef = userCol(state.uid, 'lab_records');
          rowsToSave.slice(i, i + 450).forEach(rec => batch.set(doc(colRef), rec));
          await batch.commit();
        }
        m.close();
        toast(`บันทึกผลตรวจ ${rowsToSave.length} รายการแล้ว`);
      } catch (err) {
        btn.disabled = false; btn.textContent = 'บันทึกรายการที่เลือก';
        toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
      }
    });
  } catch (err) {
    st.className = 'text-xs text-rose-600';
    st.textContent = explainGeminiError(err);
  }
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
  if (!root?.isConnected) return;
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
  }).join('') : '<p class="text-sm text-slate-400">ยังไม่มีผลตรวจ — กรอกด้านซ้าย หรือถ่ายรูปใบผลตรวจให้ AI อ่าน</p>';
}
