import { DEFAULT_PRESETS, categoryNames } from './foodConstants.js';
import { addCustomFood, updateCustomFood } from './foodService.js';
import { state } from './state.js';
import { $, esc, openModal, round1, toast, toNum } from './util.js';
import { guessFoodCategory } from './foodParser.js';
import { validateFoodPreset } from './foodValidation.js';

const EDIT_FIELDS = [['calories', 'แคลอรี่ (kcal)'], ['protein', 'โปรตีน (g)'], ['carbs', 'คาร์โบไฮเดรต (g)'], ['fat', 'ไขมัน (g)'], ['sugar', 'น้ำตาล (g)'], ['sodium', 'โซเดียม (mg)']];

export function openFoodEditor({ id, prefill = {}, scan, onSaved }) {
  const v = prefill;
  const warn = k => scan && (v[k] === null || v[k] === undefined) ? 'border-amber-400 bg-amber-50' : '';
  const basisMsg = !scan ? '' : scan.basis === 'unknown'
    ? '⚠️ ระบบไม่แน่ใจว่าตัวเลขบนฉลากเป็น "ต่อหน่วยบริโภค" หรือ "ต่อ 100 กรัม" — ดูที่ฉลากแล้วระบุหน่วยด้านล่าง'
    : scan.basis === 'per_100g' ? 'ตัวเลขบนฉลากเป็นค่า <b>ต่อ 100 กรัม/มล.</b>' : 'ตัวเลขบนฉลากเป็นค่า <b>ต่อ 1 หน่วยบริโภค</b>';
  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">${id ? 'แก้ไขเมนู' : scan ? 'ตรวจสอบข้อมูลจากฉลาก' : 'เพิ่มเมนูของฉัน'}</h3><button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>
    ${scan ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1 mb-3">
      <p>${basisMsg}${scan.servingSizeText ? ` · หน่วยบริโภคบนฉลาก: ${esc(scan.servingSizeText)}` : ''}</p>
      <p>ช่องสีเหลืองคือค่าที่ AI อ่านไม่ชัดหรือไม่พบ — กรุณากรอกเองจากฉลาก (ระบบไม่เดาให้)</p>
      ${scan.notes ? `<p>หมายเหตุ: ${esc(scan.notes)}</p>` : ''}</div>` : ''}
    <div class="grid grid-cols-2 gap-3">
      <div class="col-span-2"><label class="lbl">ชื่ออาหาร *</label><input id="e-name" class="input" value="${esc(v.name || '')}"></div>
      <div class="col-span-2"><label class="lbl">หมวดหมู่ (ประเมินอัตโนมัติ ปรับได้)</label><select id="e-category" class="input">${categoryNames.map(c => `<option ${((v.category || guessFoodCategory(v.name || '')) === c) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div><label class="lbl">ยี่ห้อ</label><input id="e-brand" class="input" value="${esc(v.brand || '')}"></div>
      <div><label class="lbl">หน่วยบริโภค * (เช่น 1 ซอง, 100 กรัม)</label><input id="e-unit" class="input ${scan && !v.unit ? 'border-amber-400 bg-amber-50' : ''}" value="${esc(v.unit || '')}"></div>
      <div><label class="lbl">น้ำหนักต่อ 1 หน่วย (กรัม/มล.)</label><input id="e-grams" type="number" class="input" value="${v.gramsPerUnit ?? ''}"></div>
      <div><label class="lbl">สัดส่วนที่กินได้ (%) (ไม่บังคับ)</label><input id="e-edible" type="number" min="1" max="100" step="1" inputmode="decimal" class="input" value="${Number.isFinite(v.edibleFraction) ? Math.round(v.edibleFraction * 100) : ''}" placeholder="เช่น 54"></div>
      <p class="col-span-2 text-xs text-slate-500">ถ้าชั่งรวมเปลือกหรือซัง ให้ใส่สัดส่วนโดยประมาณของส่วนที่กินได้ ระบบจะให้ชั่งน้ำหนักรวมเพียงครั้งเดียว และใช้โภชนาการต่อหน่วยของส่วนที่กินได้</p>
      ${EDIT_FIELDS.map(([k, t]) => `<div><label class="lbl">${t}${k === 'calories' ? ' *' : ''}</label><input id="e-${k}" type="number" step="0.1" inputmode="decimal" class="input ${warn(k)}" value="${v[k] ?? ''}"></div>`).join('')}
    </div>
    <label class="flex items-center gap-2 mt-3 text-sm"><input id="e-fav" type="checkbox" ${v.favorite ? 'checked' : ''}> ⭐ เมนูโปรด</label>
    ${scan && scan.basis === 'per_100g' && scan.servingGrams ? `<button id="e-convert" class="btn btn-soft mt-3 text-xs">แปลงเป็นค่าต่อ 1 หน่วยบริโภค (${scan.servingGrams} g)</button>` : ''}
    ${scan ? `<label class="flex items-start gap-2 mt-3 text-sm bg-ok-soft/60 rounded-lg p-2"><input id="e-confirm" type="checkbox" class="mt-1"> ฉันตรวจตัวเลขกับฉลากจริงแล้ว และถูกต้อง</label>` : ''}
    <div class="flex justify-end gap-2 mt-4"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="e-save" class="btn btn-primary">บันทึกเมนู</button></div>`, { wide: true });

  const g = k => $('#e-' + k, m.el);
  let categoryTouched = !!v.category;
  g('category').addEventListener('change', () => { categoryTouched = true; });
  g('name').addEventListener('input', () => { if (!categoryTouched) g('category').value = guessFoodCategory(g('name').value); });
  const conv = $('#e-convert', m.el);
  if (conv) conv.addEventListener('click', () => {
    const k = scan.servingGrams / 100;
    ['calories', 'protein', 'carbs', 'fat', 'sugar', 'sodium'].forEach(f => { const n = toNum(g(f).value); if (n !== null) g(f).value = round1(n * k); });
    g('unit').value = scan.servingSizeText || `${scan.servingGrams} กรัม`; g('grams').value = scan.servingGrams;
    conv.remove();
  });
  $('#e-save', m.el).addEventListener('click', () => {
    const name = g('name').value.trim(), unit = g('unit').value.trim(), cal = toNum(g('calories').value);
    const ediblePercent = toNum(g('edible').value), gramsPerUnit = toNum(g('grams').value);
    const validationError = validateFoodPreset({
      name, unit, calories: cal, ediblePercent, gramsPerUnit,
      confirmed: !scan || $('#e-confirm', m.el).checked
    });
    if (validationError) return toast(validationError, 'err');
    const key = value => String(value).trim().toLocaleLowerCase('th').replace(/\s+/g, ' ');
    const duplicate = [...state.customFoods.filter(f => f.id !== id), ...DEFAULT_PRESETS].find(f => key(f.name) === key(name));
    if (duplicate) return toast(`มีเมนู “${duplicate.name}” อยู่ในคลังแล้ว`, 'err');
    const rec = { name, brand: g('brand').value.trim(), unit, gramsPerUnit, category: g('category').value, ...(v.defaultQuantity ? { defaultQuantity: v.defaultQuantity } : {}), edibleFraction: ediblePercent === null ? null : ediblePercent / 100, favorite: g('fav').checked };
    EDIT_FIELDS.forEach(([k]) => { rec[k] = toNum(g(k).value); });
    const done = ref => { toast('บันทึกเมนูแล้ว'); if (onSaved) onSaved({ ...rec, id: ref?.id || id }); };
    if (id) { updateCustomFood(state.uid, id, { ...rec, updatedAt: new Date() }).catch(e => toast(e.message, 'err')); done(); }
    else { addCustomFood(state.uid, { ...rec, createdAt: new Date() }).catch(e => toast(e.message, 'err')); done(); }
    m.close();
  });
}
