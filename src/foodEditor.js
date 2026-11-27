import { DEFAULT_PRESETS, categoryNames } from './foodConstants.js';
import { addCustomFood, updateCustomFood } from './foodService.js';
import { state } from './state.js';
import { $, esc, openModal, round1, toast, toNum } from './util.js';
import { guessFoodCategory } from './foodParser.js';
import { validateFoodPreset } from './foodValidation.js';
import { iconSvg } from './icons.js';

const EDIT_FIELDS = [['calories', 'แคลอรี่ (kcal)'], ['protein', 'โปรตีน (g)'], ['carbs', 'คาร์บ (g)'], ['fat', 'ไขมัน (g)'], ['sugar', 'น้ำตาล (g)'], ['sodium', 'โซเดียม (mg)']];

export function openFoodEditor({ id, prefill = {}, scan, onSaved }) {
  const v = prefill;
  const isRequiredScanMissing = k => scan && (k === 'calories') && (v[k] === null || v[k] === undefined);
  const warn = k => isRequiredScanMissing(k) ? 'border-amber-400 bg-amber-50' : '';
  const basisMsg = !scan ? '' : scan.basis === 'unknown'
    ? 'ไม่พบเกณฑ์บนฉลาก — โปรดระบุหน่วยบริโภค (ต่อ 1 หน่วย หรือ ต่อ 100 กรัม) ให้ตรงกับตัวเลข'
    : scan.basis === 'per_100g'
      ? 'ตัวเลขเป็นค่า <b>ต่อ 100 กรัม/มล.</b>'
      : 'ตัวเลขเป็นค่า <b>ต่อ 1 หน่วยบริโภค</b>';
  const nutritionSubtitle = !scan
    ? 'กรอกสารอาหารตามหน่วยบริโภคที่ระบุ (เช่น ต่อ 1 หน่วย หรือ ต่อ 100 กรัม)'
    : scan.basis === 'per_100g'
      ? 'แสดงค่าต่อ 100 กรัม/มล. (กดแปลงด้านล่างได้หากมีน้ำหนักต่อหน่วย)'
      : 'แสดงค่าต่อ 1 หน่วยบริโภคตามฉลาก';

  const m = openModal(`
    <div class="flex justify-between items-center gap-2 mb-3">
      <h3 class="font-bold text-lg text-slate-800">${id ? 'แก้ไขเมนู' : scan ? 'ตรวจสอบข้อมูลจากฉลาก' : 'เพิ่มเมนูของฉัน'}</h3>
      <button data-close type="button" class="tm-modal-close shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    ${scan ? `<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1 mb-3">
      <p class="inline-flex items-center gap-1.5 font-medium">${iconSvg('alert', { size: 15, className: 'text-amber-600 shrink-0' })}<span>${basisMsg}${scan.servingSizeText ? ` · บนฉลาก: ${esc(scan.servingSizeText)}` : ''}</span></p>
      ${scan.notes ? `<p class="text-slate-500 pl-5">หมายเหตุ: ${esc(scan.notes)}</p>` : ''}
    </div>` : ''}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <section class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
        <h4 class="text-xs font-bold text-slate-700">ข้อมูลอาหารและหน่วยบริโภค</h4>
        <div>
          <label class="lbl" for="e-name">ชื่ออาหาร *</label>
          <input id="e-name" class="input min-h-[44px]" value="${esc(v.name || '')}" placeholder="เช่น อกไก่ต้ม, กราโนล่า">
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="lbl" for="e-category">หมวดหมู่</label>
            <select id="e-category" class="input min-h-[44px]">${categoryNames.map(c => `<option ${((v.category || guessFoodCategory(v.name || '')) === c) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          </div>
          <div>
            <label class="lbl" for="e-brand">ยี่ห้อ (ไม่บังคับ)</label>
            <input id="e-brand" class="input min-h-[44px]" value="${esc(v.brand || '')}" placeholder="เช่น CP, Diamond Grains">
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="lbl" for="e-unit">หน่วยบริโภค * (เช่น 1 ซอง, 100 กรัม)</label>
            <input id="e-unit" class="input min-h-[44px] ${scan && !v.unit ? 'border-amber-400 bg-amber-50' : ''}" value="${esc(v.unit || '')}" placeholder="1 หน่วย / 100 กรัม">
          </div>
          <div>
            <label class="lbl" for="e-grams">น้ำหนักต่อ 1 หน่วย (g / ml)</label>
            <input id="e-grams" type="number" min="0" step="0.1" inputmode="decimal" class="input min-h-[44px]" value="${v.gramsPerUnit ?? ''}" placeholder="เช่น 100">
          </div>
        </div>
        <div>
          <button id="e-fav" type="button" class="tm-food-action-btn is-fav ${v.favorite ? 'is-active' : ''}" aria-pressed="${Boolean(v.favorite)}" aria-label="บันทึกเป็นเมนูโปรด">
            ${iconSvg('star', { size: 16 })}<span>${v.favorite ? 'เมนูโปรด' : 'บันทึกเป็นเมนูโปรด'}</span>
          </button>
        </div>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
        <div class="space-y-0.5">
          <h4 class="text-xs font-bold text-slate-700">พลังงานและสารอาหาร</h4>
          <p class="text-[11px] text-slate-500">${nutritionSubtitle}</p>
        </div>
        ${scan && scan.basis === 'per_100g' && scan.servingGrams ? `<button id="e-convert" type="button" class="btn btn-ghost w-full justify-center min-h-[44px] text-xs">${iconSvg('swap', { size: 15 })} แปลงเป็นค่าต่อ 1 หน่วยบริโภค (${scan.servingGrams} g)</button>` : ''}
        <div>
          <label class="lbl" for="e-calories">แคลอรี่ (kcal) *</label>
          <input id="e-calories" type="number" min="0" step="0.1" inputmode="decimal" class="input min-h-[44px] font-semibold ${warn('calories')}" value="${v.calories ?? ''}" placeholder="0">
        </div>
        <div class="grid grid-cols-3 gap-2.5">
          ${EDIT_FIELDS.slice(1, 4).map(([k, t]) => `<div><label class="lbl" for="e-${k}">${t}</label><input id="e-${k}" type="number" min="0" step="0.1" inputmode="decimal" class="input min-h-[44px] ${warn(k)}" value="${v[k] ?? ''}" placeholder="0"></div>`).join('')}
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          ${EDIT_FIELDS.slice(4).map(([k, t]) => `<div><label class="lbl" for="e-${k}">${t}</label><input id="e-${k}" type="number" min="0" step="0.1" inputmode="decimal" class="input min-h-[44px] ${warn(k)}" value="${v[k] ?? ''}" placeholder="ไม่ระบุ"></div>`).join('')}
        </div>
        ${scan ? `<label class="flex items-start gap-2.5 min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 cursor-pointer"><input id="e-confirm" type="checkbox" class="mt-0.5 w-4 h-4 accent-brand shrink-0"><span>ฉันตรวจตัวเลขพลังงานและสารอาหารกับฉลากจริงแล้ว และถูกต้อง</span></label>` : ''}
      </section>
    </div>
    <div class="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-4">
      <button data-close type="button" class="btn btn-ghost min-h-[44px] justify-center">ยกเลิก</button>
      <button id="e-save" type="button" class="btn btn-primary min-h-[44px] justify-center">${iconSvg('save', { size: 15 })} บันทึกเมนู</button>
    </div>`, { size: 'xl' });

  const g = k => $('#e-' + k, m.el);
  let categoryTouched = !!v.category;
  g('category').addEventListener('change', () => { categoryTouched = true; });
  g('name').addEventListener('input', () => { if (!categoryTouched) g('category').value = guessFoodCategory(g('name').value); });
  const favBtn = g('fav');
  let isFav = Boolean(v.favorite);
  if (favBtn) {
    favBtn.addEventListener('click', () => {
      isFav = !isFav;
      favBtn.classList.toggle('is-active', isFav);
      favBtn.setAttribute('aria-pressed', String(isFav));
      const labelSpan = favBtn.querySelector('span');
      if (labelSpan) labelSpan.textContent = isFav ? 'เมนูโปรด' : 'บันทึกเป็นเมนูโปรด';
    });
  }
  const conv = $('#e-convert', m.el);
  if (conv) conv.addEventListener('click', () => {
    const k = scan.servingGrams / 100;
    ['calories', 'protein', 'carbs', 'fat', 'sugar', 'sodium'].forEach(f => { const n = toNum(g(f).value); if (n !== null) g(f).value = round1(n * k); });
    g('unit').value = scan.servingSizeText || `${scan.servingGrams} กรัม`; g('grams').value = scan.servingGrams;
    conv.remove();
  });
  $('#e-save', m.el).addEventListener('click', () => {
    const name = g('name').value.trim(), unit = g('unit').value.trim(), cal = toNum(g('calories').value);
    const gramsPerUnit = toNum(g('grams').value);
    const protein = toNum(g('protein').value), carbs = toNum(g('carbs').value), fat = toNum(g('fat').value);
    const sugar = toNum(g('sugar').value), sodium = toNum(g('sodium').value);
    const validationError = validateFoodPreset({
      name, unit, calories: cal, ediblePercent: null, gramsPerUnit,
      protein, carbs, fat, sugar, sodium,
      confirmed: !scan || $('#e-confirm', m.el).checked
    });
    if (validationError) return toast(validationError, 'err');
    const key = value => String(value).trim().toLocaleLowerCase('th').replace(/\s+/g, ' ');
    const duplicate = [...state.customFoods.filter(f => f.id !== id), ...DEFAULT_PRESETS].find(f => key(f.name) === key(name));
    if (duplicate) return toast(`มีเมนู “${duplicate.name}” อยู่ในคลังแล้ว`, 'err');
    const rec = { name, brand: g('brand').value.trim(), unit, gramsPerUnit, category: g('category').value, ...(v.defaultQuantity ? { defaultQuantity: v.defaultQuantity } : {}), edibleFraction: Number.isFinite(v.edibleFraction) ? v.edibleFraction : null, favorite: isFav };
    EDIT_FIELDS.forEach(([k]) => { rec[k] = toNum(g(k).value); });
    const done = ref => { toast('บันทึกเมนูแล้ว'); if (onSaved) onSaved({ ...rec, id: ref?.id || id }); };
    if (id) { updateCustomFood(state.uid, id, { ...rec, updatedAt: new Date() }).catch(e => toast(e.message, 'err')); done(); }
    else { addCustomFood(state.uid, { ...rec, createdAt: new Date() }).catch(e => toast(e.message, 'err')); done(); }
    m.close();
  });
}
