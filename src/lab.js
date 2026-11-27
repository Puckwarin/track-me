import { addDoc, deleteDoc, writeBatch, doc } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, isValidCalendarDate, toNum, toast, openModal, confirmDialog } from './util.js';
import { readLabReportFromPhoto, explainGeminiError, runImageBatch, formatImageProgress } from './nutrition.js';
import { LAB_PANEL_TEMPLATES, findLatestLabDefaults, parseBulkLabText } from './labTemplates.js';
import { iconSvg } from './icons.js';
import { guardPreviewWrite } from './preview.js';
import { bindChartInspector, bindSwipeRows, detailsToggleHtml } from './ui.js';
import { getChartPalette, sparklineSvg } from './chartPrimitives.js';

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
      <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">${iconSvg('stethoscope', { size: 18, className: 'text-brand shrink-0' })}<span>บันทึกผลตรวจ / ผลเลือด</span></h2>
      <label class="border-2 border-dashed border-slate-200 bg-lav-soft/40 rounded-xl p-3 text-center cursor-pointer block">
        <input type="file" id="lb-photo" accept="image/*" multiple class="hidden">
        <span class="flex justify-center text-brand mb-1">${iconSvg('camera', { size: 20 })}</span>
        <span class="block text-sm font-semibold text-slate-700">ถ่ายรูป / เลือกรูปใบผลตรวจ (เลือกได้หลายรูป)</span>
        <span class="block text-xs text-slate-500">แสดงความคืบหน้าและให้ AI อ่านค่าหลายรายการเพื่อตรวจยืนยันก่อนบันทึก</span>
      </label>
      <p id="lb-scan-status" class="hidden text-xs text-slate-500"></p>
      <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-1.5">
        <p class="text-[11px] font-semibold text-slate-600">กรอกเร็วเป็นชุด (0 โทเค็น · ไม่ใช้ AI):</p>
        <div class="flex flex-wrap gap-1.5">
          ${LAB_PANEL_TEMPLATES.map(p => `<button type="button" data-lab-panel="${esc(p.id)}" class="chip min-h-[44px] bg-white border border-slate-200 hover:bg-lav-soft text-slate-700 text-[11px]">${p.icon} ${esc(p.label)}</button>`).join('')}
          <button type="button" id="lb-bulk-paste" class="chip min-h-[44px] bg-lav-soft text-brand-dark text-[11px]">${iconSvg('note', { size: 13 })} วางหลายบรรทัด</button>
        </div>
      </div>
      <div><label class="lbl" for="lb-date">วันที่ตรวจ</label><input id="lb-date" type="date" class="input min-h-[44px]"></div>
      <div><label class="lbl" for="lb-name">รายการตรวจ (เลือกจากรายการหรือพิมพ์เอง)</label><input id="lb-name" list="lb-names" class="input min-h-[44px]" placeholder="เช่น BUN, Creatinine, HCT"><datalist id="lb-names">${LAB_PRESETS.map(p => `<option value="${esc(p[0])}">`).join('')}</datalist></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="lbl" for="lb-value">ผลที่ได้</label><input id="lb-value" type="number" step="any" inputmode="decimal" class="input min-h-[44px]"></div>
        <div><label class="lbl" for="lb-unit">หน่วย</label><input id="lb-unit" class="input min-h-[44px]" placeholder="mg/dL"></div>
        <div><label class="lbl" for="lb-low">ค่าอ้างอิง ต่ำสุด</label><input id="lb-low" type="number" step="any" inputmode="decimal" class="input min-h-[44px]"></div>
        <div><label class="lbl" for="lb-high">ค่าอ้างอิง สูงสุด</label><input id="lb-high" type="number" step="any" inputmode="decimal" class="input min-h-[44px]"></div>
      </div>
      <div><label class="lbl" for="lb-note">คลินิก/โรงพยาบาล · หมายเหตุ</label><input id="lb-note" class="input min-h-[44px]" placeholder="ไม่บังคับ"></div>
      <p class="text-[11px] text-slate-500">ค่าอ้างอิงที่เติมให้เป็นค่าทั่วไปเท่านั้น — แก้ตามใบผลตรวจจริงทุกครั้ง ผลสูง/ต่ำเป็นการเทียบตัวเลข ควรให้สัตวแพทย์หรือแพทย์แปลผล</p>
      <button id="lb-save" class="btn btn-primary w-full justify-center">${iconSvg('check', { size: 15 })} บันทึกผล</button>
    </div>
  </div>
  <div class="lg:col-span-2 space-y-4">
    <div class="card !p-3 space-y-2.5">
      <div class="flex flex-wrap items-center gap-2">
        <input id="lb-search" class="input min-h-[44px] flex-1 min-w-[160px]" aria-label="ค้นหารายการผลตรวจ" placeholder="ค้นหารายการผลตรวจ">
        <select id="lb-filter" class="input min-h-[44px] !w-auto" aria-label="กรองผลตรวจ">
          <option value="all">ผลตรวจทั้งหมด</option>
          <option value="abnormal">⚠️ เฉพาะค่าผิดปกติ (สูง/ต่ำ)</option>
        </select>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="text-slate-500">ช่วงวันที่:</span>
        <input id="lb-from" type="date" class="input min-h-[44px] !w-auto text-xs" aria-label="ตั้งแต่วันที่">
        <span class="text-slate-500">–</span>
        <input id="lb-to" type="date" class="input min-h-[44px] !w-auto text-xs" aria-label="ถึงวันที่">
        <button id="lb-clear" type="button" class="chip min-h-[44px] bg-slate-100 text-slate-600 hidden">ล้างตัวกรอง</button>
      </div>
    </div>
    <div id="lb-list" class="space-y-3"></div>
  </div>`;
  $('#lb-date', root).value = localDateStr();
  $('#lb-name', root).addEventListener('input', e => {
    const p = LAB_PRESETS.find(x => x[0] === e.target.value); if (!p) return;
    const last = [...state.labs].filter(r => key(r.name) === key(p[0])).sort((a, b) => b.date.localeCompare(a.date))[0];   // ถ้าเคยกรอกแล้ว ใช้ค่าอ้างอิงจากใบผลครั้งก่อน
    $('#lb-unit', root).value = last?.unit ?? p[1]; $('#lb-low', root).value = (last ? last.refLow : p[2]) ?? ''; $('#lb-high', root).value = (last ? last.refHigh : p[3]) ?? '';
  });
  $('#lb-photo', root).addEventListener('change', onScanLabPhoto);
  $('#lb-bulk-paste', root).addEventListener('click', openLabPasteModal);
  root.addEventListener('click', e => {
    const pBtn = e.target.closest('[data-lab-panel]');
    if (!pBtn) return;
    const panel = LAB_PANEL_TEMPLATES.find(p => p.id === pBtn.dataset.labPanel);
    if (!panel) return;
    const rows = panel.items.map(itemName => {
      const def = findLatestLabDefaults(itemName, LAB_PRESETS, state.labs);
      return { name: def.name, value: '', unit: def.unit, refLow: def.refLow, refHigh: def.refHigh };
    });
    openLabBatchModal(rows, `${panel.icon} กรอกชุดตรวจ ${panel.label}`);
  });
  $('#lb-save', root).addEventListener('click', save);
  $('#lb-search', root).addEventListener('input', render);
  $('#lb-filter', root).addEventListener('change', render);
  $('#lb-from', root).addEventListener('change', render);
  $('#lb-to', root).addEventListener('change', render);
  $('#lb-clear', root).addEventListener('click', () => {
    $('#lb-search', root).value = '';
    $('#lb-filter', root).value = 'all';
    $('#lb-from', root).value = '';
    $('#lb-to', root).value = '';
    render();
  });
  $('#lb-list', root).addEventListener('click', async e => {
    const d = e.target.closest('[data-del]');
    if (!d) return;
    if (guardPreviewWrite('การลบผลตรวจ')) return;
    const delId = d.dataset.del;
    const ok = await confirmDialog({
      title: 'ลบผลตรวจ?',
      message: 'ลบผลตรวจนี้?',
      confirmText: 'ลบผลตรวจ',
      cancelText: 'ยกเลิก',
      danger: true
    });
    if (!ok) return;
    deleteDoc(userDoc(state.uid, 'lab_records', delId)).catch(err => toast(err.message, 'err'));
  });
  render();
}

async function onScanLabPhoto(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  const st = $('#lb-scan-status', root);
  st.className = 'text-xs text-slate-500 font-medium';
  st.classList.remove('hidden');
  st.textContent = formatImageProgress('กำลังอ่านใบผลตรวจ', { total: files.length, activeIndex: 1, completed: 0, percent: 0 });

  try {
    const { results, errors } = await runImageBatch(
      files,
      file => readLabReportFromPhoto(file),
      info => {
        if (st.isConnected) st.textContent = formatImageProgress('กำลังอ่านใบผลตรวจ', info);
      },
      { concurrency: 2 }
    );

    const items = [];
    let detectedDate = '';
    const labNames = [];
    for (const r of results) {
      const res = r.data;
      if (!detectedDate && isValidCalendarDate(res?.date)) detectedDate = res.date;
      if (res?.labName && !labNames.includes(res.labName.trim())) labNames.push(res.labName.trim());
      for (const it of res?.items || []) {
        if (it && it.name && typeof it.value === 'number' && Number.isFinite(it.value)) {
          items.push({ ...it, fileName: r.fileName });
        }
      }
    }

    if (!items.length) {
      const errMsg = errors[0]?.message || 'ไม่พบค่าตรวจที่อ่านได้ชัดเจน ลองถ่ายให้ชัดขึ้นหรือกรอกเองค่ะ';
      st.className = 'text-xs text-rose-600 font-medium';
      st.textContent = errMsg;
      return toast(errMsg, 'err');
    }

    st.className = 'text-xs text-green-700 font-semibold';
    st.textContent = `✓ ประมวลผลครบ ${files.length}/${files.length} รูป (พบ ${items.length} รายการ) — ตรวจสอบและยืนยัน`;

    const defaultDate = detectedDate || ($('#lb-date', root).value || localDateStr());
    const labName = labNames.join(', ');
    const m = openModal(`
      <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-lg">ตรวจค่าที่ AI อ่านได้ (${items.length} รายการ จาก ${results.length}/${files.length} รูป)</h3><button type="button" data-close class="tm-modal-close shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
      <p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 mb-3">โปรดเทียบตัวเลขและค่าอ้างอิงกับใบผลตรวจจริงก่อนกดบันทึก</p>
      ${errors.length ? `<div class="rounded-xl bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700 mb-3">${errors.map(x => `<p>• ${esc(x.fileName)}: ${esc(x.message)}</p>`).join('')}</div>` : ''}
      <div class="grid grid-cols-2 gap-2 mb-3">
        <div><label class="lbl" for="lbs-date">วันที่ตรวจ</label><input id="lbs-date" type="date" class="input min-h-[44px]" value="${esc(defaultDate)}"></div>
        <div><label class="lbl" for="lbs-note">คลินิก/หมายเหตุรวม</label><input id="lbs-note" class="input min-h-[44px]" value="${esc(labName)}" placeholder="ไม่บังคับ"></div>
      </div>
      <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
        ${items.map((it, i) => `
          <div class="rounded-xl border border-slate-200 p-2.5 space-y-2 bg-slate-50/70" data-lbs-row="${i}">
            <div class="flex items-center gap-2">
              <label class="inline-flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0 cursor-pointer" aria-label="เลือกรายการที่ ${i + 1}"><input type="checkbox" class="lbs-check w-4 h-4 accent-brand" data-i="${i}" checked></label>
              <input class="input text-sm font-semibold min-h-[44px]" data-f="name" aria-label="ชื่อรายการที่ ${i + 1}" value="${esc(it.name || '')}" placeholder="ชื่อรายการ">
              ${files.length > 1 ? `<span class="text-[10px] text-slate-500 shrink-0">${esc(it.fileName)}</span>` : ''}
            </div>
            <div class="grid grid-cols-4 gap-1.5 text-xs">
              <div><label class="lbl" for="lbs-val-${i}">ค่า</label><input id="lbs-val-${i}" type="number" step="any" class="input min-h-[44px]" data-f="value" aria-label="ค่า ${esc(it.name || '')}" value="${it.value ?? ''}"></div>
              <div><label class="lbl" for="lbs-unit-${i}">หน่วย</label><input id="lbs-unit-${i}" class="input min-h-[44px]" data-f="unit" aria-label="หน่วย ${esc(it.name || '')}" value="${esc(it.unit || '')}"></div>
              <div><label class="lbl" for="lbs-low-${i}">ต่ำสุด</label><input id="lbs-low-${i}" type="number" step="any" class="input min-h-[44px]" data-f="refLow" aria-label="ค่าต่ำสุด ${esc(it.name || '')}" value="${it.refLow ?? ''}"></div>
              <div><label class="lbl" for="lbs-high-${i}">สูงสุด</label><input id="lbs-high-${i}" type="number" step="any" class="input min-h-[44px]" data-f="refHigh" aria-label="ค่าสูงสุด ${esc(it.name || '')}" value="${it.refHigh ?? ''}"></div>
            </div>
          </div>`).join('')}
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button data-close class="btn btn-ghost min-h-[44px]">ยกเลิก</button>
        <button id="lbs-save" class="btn btn-primary min-h-[44px]">${iconSvg('check', { size: 15 })} บันทึกที่เลือก</button>
      </div>`, { wide: true });

    $('#lbs-save', m.el).addEventListener('click', async () => {
      if (guardPreviewWrite('การบันทึกผลตรวจจากรูปภาพ')) return;
      const date = $('#lbs-date', m.el).value;
      const globalNote = $('#lbs-note', m.el).value.trim();
      if (!isValidCalendarDate(date)) return toast('กรุณาระบุวันที่ตรวจให้ถูกต้อง', 'err');
      const LAB_MAX = 10000000;
      const rowsToSave = [];
      for (const rowEl of m.el.querySelectorAll('[data-lbs-row]')) {
        const chk = rowEl.querySelector('.lbs-check');
        if (!chk?.checked) continue;
        const val = key => rowEl.querySelector(`[data-f="${key}"]`).value;
        const name = val('name').trim();
        const rawValue = val('value').trim();
        const value = toNum(rawValue);
        if (!name || rawValue === '' || value === null) continue;
        if (value < 0 || value > LAB_MAX) return toast(`ค่าผลตรวจ "${name}" ต้องอยู่ระหว่าง 0 – 10,000,000`, 'err');
        const refLow = toNum(val('refLow'));
        const refHigh = toNum(val('refHigh'));
        if ((refLow !== null && (refLow < 0 || refLow > LAB_MAX)) || (refHigh !== null && (refHigh < 0 || refHigh > LAB_MAX))) {
          return toast(`ค่าอ้างอิงของ "${name}" ต้องอยู่ระหว่าง 0 – 10,000,000`, 'err');
        }
        if (refLow !== null && refHigh !== null && refLow > refHigh) {
          return toast(`ค่าอ้างอิงต่ำสุดของ "${name}" ต้องไม่มากกว่าสูงสุด`, 'err');
        }
        rowsToSave.push({
          date,
          name: name.slice(0, 80),
          value,
          unit: val('unit').trim().slice(0, 20),
          refLow,
          refHigh,
          note: (items[+rowEl.dataset.lbsRow]?.note || globalNote || '').slice(0, 200),
          createdAt: new Date()
        });
      }
      if (!rowsToSave.length) return toast('เลือกรายการที่มีชื่อและตัวเลขอย่างน้อย 1 รายการ', 'err');
      const btn = $('#lbs-save', m.el);
      btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
      try {
        const commits = [];
        for (let i = 0; i < rowsToSave.length; i += 450) {
          const batch = writeBatch(db);
          const colRef = userCol(state.uid, 'lab_records');
          rowsToSave.slice(i, i + 450).forEach(rec => batch.set(doc(colRef), rec));
          commits.push(batch.commit());
        }
        Promise.all(commits).catch(err => toast('บันทึกไม่สำเร็จ: ' + err.message, 'err'));
        st.textContent = '';
        st.classList.add('hidden');
        m.close();
        toast(`บันทึกผลตรวจ ${rowsToSave.length} รายการแล้ว`);
      } catch (err) {
        btn.disabled = false; btn.innerHTML = `${iconSvg('check', { size: 15 })} บันทึกที่เลือก`;
        toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
      }
    });
  } catch (err) {
    st.className = 'text-xs text-rose-600 font-medium';
    st.textContent = explainGeminiError(err);
    toast(explainGeminiError(err), 'err');
  }
}

function openLabBatchModal(initialRows, titleText = 'กรอกผลตรวจเป็นชุด (0 โทเค็น)') {
  const defaultDate = $('#lb-date', root)?.value || localDateStr();
  const defaultNote = $('#lb-note', root)?.value?.trim() || '';
  const m = openModal(`
    <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-lg text-slate-800">${esc(titleText)}</h3><button type="button" data-close class="tm-modal-close shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <p class="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-2.5 mb-3">กรอกเฉพาะรายการที่มีผลตรวจ (รายการที่เว้นว่างจะไม่ถูกบันทึก) — ค่าอ้างอิงดึงจากใบล่าสุดหรือค่าทั่วไป</p>
    <div class="grid grid-cols-2 gap-2 mb-3">
      <div><label class="lbl" for="lbb-date">วันที่ตรวจ</label><input id="lbb-date" type="date" class="input min-h-[44px]" value="${esc(defaultDate)}"></div>
      <div><label class="lbl" for="lbb-note">คลินิก/หมายเหตุรวม</label><input id="lbb-note" class="input min-h-[44px]" value="${esc(defaultNote)}" placeholder="ไม่บังคับ"></div>
    </div>
    <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
      ${initialRows.map((it, i) => `
        <div class="rounded-xl border border-slate-200 p-2.5 space-y-2 bg-slate-50/70" data-lbb-row="${i}">
          <div class="flex items-center gap-2">
            <label class="inline-flex items-center justify-center min-w-[44px] min-h-[44px] shrink-0 cursor-pointer" aria-label="เลือกรายการที่ ${i + 1}"><input type="checkbox" class="lbb-check w-4 h-4 accent-brand" checked></label>
            <input class="input text-sm font-semibold min-h-[44px]" data-f="name" aria-label="ชื่อรายการที่ ${i + 1}" value="${esc(it.name || '')}" placeholder="ชื่อรายการ">
          </div>
          <div class="grid grid-cols-4 gap-1.5 text-xs">
            <div><label class="lbl" for="lbb-val-${i}">ผล *</label><input id="lbb-val-${i}" type="number" step="any" inputmode="decimal" class="input min-h-[44px]" data-f="value" aria-label="ผล ${esc(it.name || '')}" value="${it.value ?? ''}" placeholder="ตัวเลข"></div>
            <div><label class="lbl" for="lbb-unit-${i}">หน่วย</label><input id="lbb-unit-${i}" class="input min-h-[44px]" data-f="unit" aria-label="หน่วย ${esc(it.name || '')}" value="${esc(it.unit || '')}"></div>
            <div><label class="lbl" for="lbb-low-${i}">ต่ำสุด</label><input id="lbb-low-${i}" type="number" step="any" inputmode="decimal" class="input min-h-[44px]" data-f="refLow" aria-label="ต่ำสุด ${esc(it.name || '')}" value="${it.refLow ?? ''}"></div>
            <div><label class="lbl" for="lbb-high-${i}">สูงสุด</label><input id="lbb-high-${i}" type="number" step="any" inputmode="decimal" class="input min-h-[44px]" data-f="refHigh" aria-label="สูงสุด ${esc(it.name || '')}" value="${it.refHigh ?? ''}"></div>
          </div>
        </div>`).join('')}
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <button type="button" data-close class="btn btn-ghost min-h-[44px]">ยกเลิก</button>
      <button type="button" id="lbb-save" class="btn btn-primary min-h-[44px]">${iconSvg('check', { size: 15 })} บันทึก</button>
    </div>`, { wide: true });

  $('#lbb-save', m.el).addEventListener('click', () => {
    if (guardPreviewWrite('การบันทึกผลตรวจเป็นชุด')) return;
    const date = $('#lbb-date', m.el).value;
    const note = $('#lbb-note', m.el).value.trim().slice(0, 200);
    if (!isValidCalendarDate(date)) return toast('กรุณาระบุวันที่ตรวจให้ถูกต้อง', 'err');
    const LAB_MAX = 10000000;
    const rowsToSave = [];
    for (const rowEl of m.el.querySelectorAll('[data-lbb-row]')) {
      if (!rowEl.querySelector('.lbb-check')?.checked) continue;
      const val = k => rowEl.querySelector(`[data-f="${k}"]`).value;
      const name = val('name').trim();
      const rawValue = val('value').trim();
      const value = toNum(rawValue);
      if (!name || rawValue === '' || value === null) continue;
      if (value < 0 || value > LAB_MAX) return toast(`ค่าผลตรวจ "${name}" ต้องอยู่ระหว่าง 0 – 10,000,000`, 'err');
      const refLow = toNum(val('refLow'));
      const refHigh = toNum(val('refHigh'));
      if ((refLow !== null && (refLow < 0 || refLow > LAB_MAX)) || (refHigh !== null && (refHigh < 0 || refHigh > LAB_MAX))) {
        return toast(`ค่าอ้างอิงของ "${name}" ต้องอยู่ระหว่าง 0 – 10,000,000`, 'err');
      }
      if (refLow !== null && refHigh !== null && refLow > refHigh) {
        return toast(`ค่าอ้างอิงต่ำสุดของ "${name}" ต้องไม่มากกว่าสูงสุด`, 'err');
      }
      rowsToSave.push({
        date,
        name: name.slice(0, 80),
        value,
        unit: val('unit').trim().slice(0, 20),
        refLow,
        refHigh,
        note,
        createdAt: new Date()
      });
    }
    if (!rowsToSave.length) return toast('กรอกตัวเลขผลตรวจอย่างน้อย 1 รายการก่อนบันทึก', 'err');
    const btn = $('#lbb-save', m.el);
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    try {
      const commits = [];
      for (let i = 0; i < rowsToSave.length; i += 450) {
        const batch = writeBatch(db);
        const colRef = userCol(state.uid, 'lab_records');
        rowsToSave.slice(i, i + 450).forEach(rec => batch.set(doc(colRef), rec));
        commits.push(batch.commit());
      }
      Promise.all(commits).catch(err => toast('บันทึกไม่สำเร็จ: ' + err.message, 'err'));
      m.close();
      toast(`บันทึกผลตรวจ ${rowsToSave.length} รายการแล้ว`);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `${iconSvg('check', { size: 15 })} บันทึก`;
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
    }
  });
}

function openLabPasteModal() {
  const sample = [
    'BUN 18 mg/dL (7-27)',
    'Creatinine: 1.2 mg/dL (0.5-1.8)',
    'ALT: 64 U/L (10-125)',
    'WBC: 10.5'
  ].join('\n');

  const m = openModal(`
    <div class="flex justify-between items-center mb-2"><h3 class="font-bold text-lg text-slate-800 flex items-center gap-2">${iconSvg('note', { size: 18, className: 'text-brand shrink-0' })}<span>วางข้อความผลแล็บหลายบรรทัด (0 โทเค็น)</span></h3><button type="button" data-close class="tm-modal-close shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <p class="text-xs text-slate-600 mb-2">วางผลแล็บ 1 บรรทัดต่อ 1 รายการ (รองรับ copy จาก Excel/Google Sheets, แยกด้วยวรรค/Tab/: และช่วงอ้างอิงท้ายบรรทัด)</p>
    <div class="flex items-center justify-between mb-1">
      <label class="lbl !mb-0" for="lbp-text">ข้อความผลแล็บ</label>
      <button type="button" id="lbp-sample" class="text-xs text-brand underline min-h-[44px] px-2 inline-flex items-center">ใส่ตัวอย่าง</button>
    </div>
    <textarea id="lbp-text" rows="5" class="input font-mono text-xs" placeholder="BUN 18 mg/dL (7-27)&#10;Creatinine: 1.2 mg/dL"></textarea>
    <div id="lbp-preview" class="mt-3 max-h-48 overflow-y-auto text-xs"></div>
    <div class="flex justify-end gap-2 mt-4">
      <button type="button" data-close class="btn btn-ghost min-h-[44px]">${iconSvg('close', { size: 15 })} ยกเลิก</button>
      <button type="button" id="lbp-next" class="btn btn-primary min-h-[44px]" disabled>${iconSvg('check', { size: 15 })} ตรวจสอบและบันทึก</button>
    </div>`, { wide: true });

  let parsed = { items: [], errors: [] };
  const update = () => {
    parsed = parseBulkLabText($('#lbp-text', m.el).value, LAB_PRESETS, state.labs);
    const box = $('#lbp-preview', m.el);
    const btn = $('#lbp-next', m.el);
    if (!parsed.items.length && !parsed.errors.length) {
      box.innerHTML = '<p class="text-slate-500 text-center py-2">วางข้อความด้านบนเพื่อดูตัวอย่าง</p>';
      btn.disabled = true;
      return;
    }
    const errHtml = parsed.errors.length
      ? `<div class="rounded-xl border border-amber-200 bg-amber-50 p-2 text-amber-800 mb-2">${parsed.errors.map(x => `<p>• ${esc(x.error)}</p>`).join('')}</div>`
      : '';
    const rowsHtml = parsed.items.length
      ? `<div class="rounded-xl border border-slate-200 overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-50 text-slate-500"><tr><th class="p-2">รายการ</th><th class="p-2 text-right">ผล</th><th class="p-2">หน่วย</th><th class="p-2">อ้างอิง</th></tr></thead><tbody class="divide-y divide-slate-100">${parsed.items.map(it => `<tr><td class="p-2 font-medium">${esc(it.name)}</td><td class="p-2 text-right font-semibold">${esc(it.value)}</td><td class="p-2 text-slate-500">${esc(it.unit || '-')}</td><td class="p-2 text-slate-500">${it.refLow ?? '-'} – ${it.refHigh ?? '-'}</td></tr>`).join('')}</tbody></table></div>`
      : '';
    box.innerHTML = errHtml + rowsHtml;
    btn.disabled = parsed.items.length === 0;
  };

  $('#lbp-text', m.el).addEventListener('input', update);
  $('#lbp-sample', m.el).addEventListener('click', () => { $('#lbp-text', m.el).value = sample; update(); });
  $('#lbp-next', m.el).addEventListener('click', () => {
    if (!parsed.items.length) return;
    const rows = parsed.items;
    m.close();
    openLabBatchModal(rows, `ยืนยันผลแล็บ (${rows.length} รายการ)`);
  });
  update();
}

export function resetLabToToday() {
  if (!root) return;
  const d = $('#lb-date', root);
  if (d) d.value = localDateStr();
}

function save() {
  if (guardPreviewWrite('การบันทึกผลตรวจ')) return;
  const name = $('#lb-name', root).value.trim(), value = toNum($('#lb-value', root).value), date = $('#lb-date', root).value;
  if (!name || value === null || !isValidCalendarDate(date)) return toast('กรอกวันที่ รายการตรวจ และผลที่ได้ให้ถูกต้อง', 'err');
  const LAB_MAX = 10000000;
  if (value < 0 || value > LAB_MAX) return toast('ค่าผลตรวจต้องอยู่ระหว่าง 0 – 10,000,000', 'err');
  const low = toNum($('#lb-low', root).value), high = toNum($('#lb-high', root).value);
  if ((low !== null && (low < 0 || low > LAB_MAX)) || (high !== null && (high < 0 || high > LAB_MAX))) {
    return toast('ค่าอ้างอิงต้องอยู่ระหว่าง 0 – 10,000,000', 'err');
  }
  if (low !== null && high !== null && low > high) return toast('ค่าอ้างอิงต่ำสุดต้องไม่มากกว่าสูงสุด', 'err');
  addDoc(userCol(state.uid, 'lab_records'), { date, name: name.slice(0, 80), value, unit: $('#lb-unit', root).value.trim().slice(0, 20), refLow: low, refHigh: high, note: $('#lb-note', root).value.trim().slice(0, 200), createdAt: new Date() })
    .catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  ['lb-name', 'lb-value', 'lb-unit', 'lb-low', 'lb-high', 'lb-note'].forEach(id => { $('#' + id, root).value = ''; });
  $('#lb-date', root).value = localDateStr();
  toast('บันทึกผลตรวจแล้ว');
}

function spark(rows) {
  if (rows.length < 2) return '';
  const palette = getChartPalette();
  return sparklineSvg({
    points: rows.map(r => ({
      value: r.value,
      row: r,
      ariaLabel: `${r.name} ${fmtDate(r.date)} ${r.value}${r.unit ? ` ${r.unit}` : ''}`
    })),
    color: palette.brandDark,
    ariaLabel: `แนวโน้มค่าผลตรวจ ${rows[0]?.name || ''}`.trim(),
    tipFormatter: p => {
      const r = p.row;
      const valStr = `${r.value}${r.unit ? ` ${r.unit}` : ''}`;
      return `${r.name}: ${valStr}`;
    },
    subFormatter: p => {
      const r = p.row;
      const flag = labFlag(r);
      return `${fmtDate(r.date)}${flag && FLAG[flag] ? ` · ${FLAG[flag][0]}` : ''}`;
    }
  });
}

export function render() {
  if (!root?.isConnected) return;
  const q = key($('#lb-search', root).value);
  const mode = $('#lb-filter', root)?.value || 'all';
  const from = $('#lb-from', root)?.value || '';
  const to = $('#lb-to', root)?.value || '';
  $('#lb-clear', root)?.classList.toggle('hidden', !q && mode === 'all' && !from && !to);

  const groups = new Map();
  state.labs.forEach(r => {
    if (from && r.date < from) return;
    if (to && r.date > to) return;
    const k = key(r.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });

  const cards = [...groups.values()]
    .map(rows => rows.sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)))
    .filter(rows => {
      if (q && !key(rows[0].name).includes(q)) return false;
      if (mode === 'abnormal') {
        const last = rows[rows.length - 1];
        const f = labFlag(last);
        if (f !== 'low' && f !== 'high') return false;
      }
      return true;
    })
    .sort((a, b) => b[b.length - 1].date.localeCompare(a[a.length - 1].date));

  const hasAny = (state.labs || []).length > 0;
  const listEl = $('#lb-list', root);
  listEl.innerHTML = cards.length ? `<p class="tm-swipe-hint">ปัดซ้ายที่รายการเพื่อลบ</p>` + cards.map(rows => {
    const last = rows[rows.length - 1], f = labFlag(last), prev = rows[rows.length - 2];
    const arrow = prev ? (last.value > prev.value ? '↑' : last.value < prev.value ? '↓' : '→') : '';
    const displayRows = mode === 'abnormal'
      ? rows.slice().reverse().filter(r => { const rf = labFlag(r); return rf === 'low' || rf === 'high'; })
      : rows.slice().reverse();
    return `<div class="card !p-3" data-lab-card><details class="tm-details" ${mode === 'abnormal' ? 'open' : ''}><summary class="tm-details-summary cursor-pointer min-h-[44px] flex-wrap">
      <div class="min-w-0 flex-1"><p class="font-semibold text-slate-800">${esc(last.name)}</p><p class="text-xs text-slate-500 tabular-nums">ล่าสุด ${esc(fmtDate(last.date))} · อ้างอิง ${esc(refText(last))}</p></div>
      <div class="flex items-center gap-2.5 tabular-nums shrink-0">${spark(rows)}<div class="text-right"><p class="text-lg font-bold">${esc(last.value)} <span class="text-xs font-normal text-slate-500">${esc(last.unit)}</span> <span class="text-sm text-slate-500">${arrow}</span></p>${f ? `<span class="inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${FLAG[f][1]}">${FLAG[f][0]}</span>` : ''}</div>${detailsToggleHtml({ compact: true })}</div></summary>
      <div class="mt-3 tm-swipe-list text-sm tabular-nums">${displayRows.map(r => `
        <div class="tm-swipe-row">
          <div class="tm-swipe-actions tm-swipe-actions--single">
            <button type="button" data-del="${esc(r.id)}" class="tm-swipe-action-btn is-del" aria-label="ลบผลตรวจ ${esc(r.name)} ${esc(fmtDate(r.date))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
          </div>
          <div class="tm-swipe-card !flex-row items-center justify-between gap-2 !px-2 !py-1.5">
            <span class="min-w-0">${esc(fmtDate(r.date))}${r.note ? ` <span class="text-xs text-slate-500">· ${esc(r.note)}</span>` : ''}</span>
            <span class="flex items-center gap-2 shrink-0">
              <span><b>${esc(r.value)}</b> ${esc(r.unit)}${labFlag(r) && labFlag(r) !== 'ok' ? ` <span class="text-xs font-medium ${labFlag(r) === 'high' ? 'text-rose-600' : 'text-sky-700'}">${FLAG[labFlag(r)][0]}</span>` : ''}</span>
              <span class="tm-row-actions">
                <button type="button" data-del="${esc(r.id)}" class="tm-row-action-btn is-del" aria-label="ลบผลตรวจ ${esc(r.name)}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
              </span>
            </span>
          </div>
        </div>`).join('')}</div></details><div class="tm-chart-readout is-empty hidden mt-2" data-lab-readout aria-live="polite"></div></div>`;
  }).join('') : `<p class="text-sm text-slate-500 py-4 text-center">${mode === 'abnormal' ? 'ไม่พบค่าผลตรวจที่ผิดปกติ (สูง/ต่ำ) ตามเงื่อนไข' : hasAny ? 'ไม่พบผลตรวจที่ตรงกับคำค้นหาหรือช่วงวันที่ที่เลือก' : 'ยังไม่มีผลตรวจ — กรอกด้านซ้าย ใช้ชุดกรอกเร็ว หรือถ่ายรูปใบผลตรวจให้ AI อ่าน'}</p>`;

  bindSwipeRows(listEl);
  listEl.querySelectorAll('[data-lab-card]').forEach(card => {
    bindChartInspector(card, {
      hint: 'แตะจุดบนกราฟเล็กเพื่อดูค่าแต่ละครั้ง',
      readoutEl: card.querySelector('[data-lab-readout]'),
      stopSummaryToggle: true
    });
  });
}
