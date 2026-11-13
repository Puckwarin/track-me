import { addDoc, setDoc, updateDoc, deleteDoc, query, where, writeBatch, getDocs, doc } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state, on } from './state.js';
import { watch } from './sync.js';
import { $, $$, esc, localDateStr, addDays, numField, round1, toast, openModal, toNum } from './util.js';
import { lookupPer100g, estimateFromPhoto, readNutritionLabel, explainGeminiError } from './nutrition.js';
import { openFoodSearch } from './foodsearch.js';
import { openHiwpintoSync } from './hiwpinto.js';
import { getMeals, getTargets } from './profile.js';

const GOALS = { cal: 2000, protein: 100, carbs: 200, fat: 60 };
const MEAL_ORDER = ['มื้อเช้า', 'มื้อกลางวัน', 'มื้อเย็น', 'ของว่าง/เครื่องดื่ม'];
const MEAL_COLORS = {
  'มื้อเช้า': { header: 'bg-amber-100 text-amber-900', row: 'bg-amber-50/60', icon: 'fa-sun' },
  'มื้อกลางวัน': { header: 'bg-sky-100 text-sky-900', row: 'bg-sky-50/60', icon: 'fa-cloud-sun' },
  'มื้อเย็น': { header: 'bg-violet-100 text-violet-900', row: 'bg-violet-50/60', icon: 'fa-moon' },
  'ของว่าง/เครื่องดื่ม': { header: 'bg-pink-100 text-pink-900', row: 'bg-pink-50/60', icon: 'fa-mug-hot' }
};
const DEFAULT_PRESETS = [
  { id: 'builtin-rice', name: 'ข้าวสวย', unit: '100 g', gramsPerUnit: 100, calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { id: 'builtin-egg', name: 'ไข่ต้ม', unit: '1 ฟอง', calories: 70, protein: 6, carbs: 0.6, fat: 5 },
  { id: 'builtin-guava', name: 'ฝรั่ง', unit: '120 g', gramsPerUnit: 120, calories: 82, protein: 3.1, carbs: 17.2, fat: 1.2 }
];
const FOOD_IMPORT_ROWS = [
  ['Alpen Muesli', '40.0', 'g', '148', '4.4', '29.2', '2.2'],
  ['Daily Me Granola (Dark Choc)', '35.0', 'g', '170', '4.0', '22.0', '7.0'],
  ['Grainey Grain Bar Chocolate Banana', '1.0', 'piece(s)', '80', '0.0', '18.0', '0.0'],
  ['Granola Crunchy Honey', '35.0', 'g', '150', '3.0', '28.0', '3.5'],
  ['Granola Walt Choco', '35.0', 'g', '150', '4.0', '25.0', '4.0'],
  ['Granovibes Granola (Choc)', '35.0', 'g', '160', '5.0', '24.0', '4.5'],
  ['Granovibes Granola (Matcha)', '35.0', 'g', '150', '4.0', '26.0', '3.5'],
  ['Granovibes Granola (Original)', '35.0', 'g', '160', '5.0', '23.0', '5.0'],
  ['Misura Firrextra Wholemeal', '1.0', 'serving', '120', '4.0', '22.0', '2.0'],
  ['Sourdough Bread', '100.0', 'g', '240', '10.5', '45.0', '1.5'],
  ['Whole Wheat Biscuits', '2.0', 'piece(s)', '136', '5.0', '26.0', '1.0'],
  ['Whole Wheat Bread (Cocoa)', '1.0', 'piece(s)', '80', '2.5', '13.0', '1.5'],
  ['Whole Wheat Bread (Original)', '1.0', 'piece(s)', '75', '2.5', '13.0', '1.0'],
  ['Younger Farm Protein Granola (Choc)', '40.0', 'g', '170', '9.0', '20.0', '6.0']
];

const label = p => `${p.name}${p.brand ? ' · ' + p.brand : ''} (${p.unit})`;
const HIDDEN_BUILTINS_KEY = 'trackme-hidden-builtins';
const hiddenBuiltins = () => { try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_BUILTINS_KEY) || '[]')); } catch { return new Set(); } };
const BUILTIN_FAV_KEY = 'trackme-builtin-favorites';
const builtinFavorites = () => { try { return new Set(JSON.parse(localStorage.getItem(BUILTIN_FAV_KEY) || '[]')); } catch { return new Set(); } };
const categoryNames = ['ข้าว/เส้น', 'โปรตีน', 'ผลไม้', 'ผัก', 'ซีเรียล/กราโนลา', 'ขนม/ของว่าง', 'ขนมปัง/เบเกอรี่', 'เครื่องดื่ม/นม', 'อาหารคลีน/Hiwpinto', 'อื่น ๆ'];
export function guessFoodCategory(name = '') {
  const n = String(name).toLowerCase();
  if (/hiwp|hiwpinto|คลีน|น้ำตก|ห่อหมก|กะหล่ำปลีผัด/.test(n)) return 'อาหารคลีน/Hiwpinto';
  if (/ข้าว|ไรซ์|rice|บะหมี่|เส้น|พาสต้า|noodle/.test(n)) return 'ข้าว/เส้น';
  if (/ไก่|หมู|เนื้อ|ปลา|ไข่|กุ้ง|เต้าหู้|protein/.test(n)) return 'โปรตีน';
  if (/กล้วย|ฝรั่ง|แอปเปิล|ผลไม้|ส้ม|มะม่วง|berry/.test(n)) return 'ผลไม้';
  if (/ผัก|เห็ด|กะหล่ำ|แครอท|บรอกโคลี/.test(n)) return 'ผัก';
  if (/granola|muesli|ซีเรียล/.test(n)) return 'ซีเรียล/กราโนลา';
  if (/bread|ขนมปัง|sourdough|biscuits|biscuit/.test(n)) return 'ขนมปัง/เบเกอรี่';
  if (/นม|milk|กาแฟ|ชา|น้ำผลไม้/.test(n)) return 'เครื่องดื่ม/นม';
  if (/ขนม|bar|snack|ช็อกโกแลต|choc/.test(n)) return 'ขนม/ของว่าง';
  return 'อื่น ๆ';
}
const gramsInUnit = unit => {
  const matches = [...String(unit || '').matchAll(/(\d+(?:\.\d+)?)\s*(?:g|gram|grams|กรัม|ml|มล\.?|มิลลิลิตร)(?![a-z])/gi)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
};
const normalizedStoredPreset = p => {
  const row = FOOD_IMPORT_ROWS.find(r => r[0].toLowerCase() === String(p.name).toLowerCase());
  if (row && !p.defaultQuantity) {
    const amount = Number(row[1]), unit = row[2];
    if (String(p.unit).toLowerCase() === (String(amount) + ' ' + unit).toLowerCase()) {
      const by = /^(g|gram|grams|กรัม)$/i.test(unit) ? amount : 1;
      return { ...p, unit: /^(g|gram|grams|กรัม)$/i.test(unit) ? 'g' : unit, gramsPerUnit: by === amount ? 1 : p.gramsPerUnit,
        calories: p.calories / by, protein: p.protein / by, carbs: p.carbs / by, fat: p.fat / by,
        defaultQuantity: amount, category: p.category || guessFoodCategory(p.name), _normalizedImport: true };
    }
  }
  // Older custom foods may store the portion weight in the unit text but lack gramsPerUnit.
  const parsed = gramsInUnit(p.unit);
  return p.gramsPerUnit > 0 || !parsed ? p : { ...p, gramsPerUnit: parsed };
};
export const getPresets = () => [
  ...state.customFoods.map(normalizedStoredPreset).map(p => ({ ...p, category: p.category || (p.hiwpinto ? 'อาหารคลีน/Hiwpinto' : guessFoodCategory(p.name)), custom: true })).sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name, 'th')),
  ...DEFAULT_PRESETS.filter(p => !hiddenBuiltins().has(p.id)).map(p => ({ ...p, category: guessFoodCategory(p.name), favorite: builtinFavorites().has(p.id) }))
];

let root, items = [], base = null;   // base = ค่าต่อ 1 หน่วยของเมนูที่เลือกจากคลัง
const num = v => (typeof v === 'number' ? v : 0);

export function mountFood(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-2 space-y-6">
    <div class="card space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <button data-day="-1" class="chip bg-slate-100 text-slate-700">เมื่อวาน</button>
        <button data-day="0" class="chip bg-lav-soft text-brand-dark">วันนี้</button>
        <button data-day="1" class="chip bg-sky-soft text-blue-700">พรุ่งนี้ (วางแผน)</button>
        <input type="date" id="f-date" class="input !w-auto ml-auto" aria-label="เลือกวันที่">
      </div>
      <div class="flex items-center justify-between gap-3 bg-lav-soft rounded-xl px-4 py-2">
        <div><span id="f-daylabel" class="block text-xs text-brand font-medium">แคลอรี่รวมวันนี้</span><span id="f-total" class="text-lg font-bold text-brand-dark">0 / 2,000</span></div>
        <span id="f-remain" class="text-xs text-slate-600 text-right"></span>
      </div>
      <div id="f-stats" class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1"></div>
      <p id="f-burn" class="hidden text-xs text-slate-500"></p>
    </div>

    <div class="card space-y-4">
      <div class="flex flex-wrap justify-between items-center gap-2">
        <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-circle-plus text-brand"></i> บันทึกมื้ออาหาร</h2>
        <div class="flex flex-wrap gap-2">
          <button id="f-online" class="chip bg-sky-soft text-blue-700"><i class="fa-solid fa-globe"></i> ค้นหาโภชนาการ</button>
          <button id="f-hiwpinto" class="chip bg-amber-100 text-amber-900"><i class="fa-solid fa-calculator"></i> คำนวณ Hiwpinto / อาหารคลีน</button>
          <button id="f-hiwpinto-sync" class="chip bg-emerald-100 text-emerald-800"><i class="fa-solid fa-cloud-arrow-down"></i> Sync Data Hiwpinto</button>
          <button id="f-library" class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-book-bookmark"></i> คลังอาหารของฉัน</button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="border-2 border-dashed border-sky-soft bg-sky-soft/30 rounded-xl p-3 text-center cursor-pointer block">
          <input type="file" id="f-photo" accept="image/*" class="hidden">
          <i class="fa-solid fa-camera-retro text-xl text-blue-500"></i>
          <span class="block text-sm font-semibold text-slate-700">ถ่ายรูปจานอาหาร</span>
          <span class="block text-xs text-slate-500">Gemini ประเมินสารอาหารให้ (ค่าประมาณ)</span>
        </label>
        <label class="border-2 border-dashed border-lav-soft bg-lav-soft/40 rounded-xl p-3 text-center cursor-pointer block">
          <input type="file" id="f-label" accept="image/*" class="hidden">
          <i class="fa-solid fa-barcode text-xl text-brand"></i>
          <span class="block text-sm font-semibold text-slate-700">ถ่ายรูปหรือเลือกภาพฉลากโภชนาการ</span>
          <span class="block text-xs text-slate-500">ถ่ายใหม่หรือเลือกรูปจากคลัง → ตรวจสอบ → บันทึกเมนู</span>
        </label>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="lbl">มื้อ</label>
          <select id="f-meal" class="input"></select>
          <button id="f-copy-meal" type="button" class="chip bg-lav-soft text-brand-dark mt-2"><i class="fa-regular fa-copy"></i> คัดลอกจากมื้อเดิม</button>
        </div>
        <div class="sm:col-span-2">
          <label class="lbl">ชื่อเมนู (พิมพ์ค้นหาจากคลังได้)</label>
          <input id="f-name" list="f-datalist" class="input" placeholder="เช่น อกไก่ต้ม">
          <datalist id="f-datalist"></datalist>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div id="f-qty-wrap"><label id="f-qty-label" class="lbl">จำนวน (หน่วย)</label><input id="f-qty" type="number" step="0.01" min="0" value="1" inputmode="decimal" class="input"><p id="f-preview" class="mt-1 text-xs text-slate-500" aria-live="polite"></p></div>
        <div id="f-gross-wrap" class="hidden col-span-2 sm:col-span-1"><label class="lbl">น้ำหนักที่ชั่งรวม (g)</label><input id="f-gross" type="number" min="0" step="1" inputmode="decimal" class="input" placeholder="เช่น 180"><label class="lbl mt-2">สัดส่วนที่กินได้โดยประมาณ (%)</label><input id="f-edible" type="number" min="1" max="100" step="1" inputmode="decimal" class="input"><p id="f-edible-note" class="mt-1 text-xs text-slate-500"></p></div>
        <div><label class="lbl">แคลอรี่ (kcal)</label><input id="f-cal" type="number" inputmode="decimal" class="input"></div>
        <div><label class="lbl">โปรตีน (g)</label><input id="f-pro" type="number" inputmode="decimal" class="input"></div>
        <div><label class="lbl">คาร์บ (g)</label><input id="f-carb" type="number" inputmode="decimal" class="input"></div>
        <div><label class="lbl">ไขมัน (g)</label><input id="f-fat" type="number" inputmode="decimal" class="input"></div>
        <div id="f-sugar-wrap" class="hidden"><label class="lbl">น้ำตาล (g)</label><input id="f-sugar" type="number" inputmode="decimal" class="input"></div>
        <div id="f-sodium-wrap" class="hidden"><label class="lbl">โซเดียม (mg)</label><input id="f-sodium" type="number" inputmode="decimal" class="input"></div>
      </div>
      <div class="flex justify-end gap-2"><button id="f-clear" type="button" class="btn btn-ghost">เคลียร์ค่า</button><button id="f-save" class="btn btn-primary"><i class="fa-solid fa-plus"></i> บันทึกรายการ</button></div>
    </div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-list text-brand"></i> รายการอาหารของวัน</h3>
      <div class="overflow-x-auto"><table class="w-full text-left text-sm">
        <thead class="bg-lav-soft/50 text-slate-600"><tr><th class="p-3">เมนู</th><th class="p-3 text-right">kcal</th><th class="p-3 text-right">โปรตีน</th><th class="p-3 text-center">แก้ไข / ลบ</th></tr></thead>
        <tbody id="f-body" class="divide-y divide-slate-100"></tbody>
      </table></div>
    </div>
  </div>

  <div class="space-y-6">
    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-clock text-brand"></i> พลังงานแต่ละมื้อ</h3>
      <div id="f-meals" class="space-y-3"></div>
      <p id="f-meals-note" class="text-[11px] text-slate-400"></p>
    </div>
    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-lightbulb text-brand"></i> คำแนะนำจากเกณฑ์ที่ตั้งไว้</h3>
      <div id="f-advice" class="bg-ok-soft/60 p-3 rounded-xl text-xs text-green-900 leading-relaxed"></div>
    </div>
  </div>`;

  $('#f-date', root).value = localDateStr();
  fillMealSelect();
  $('#f-date', root).addEventListener('change', watchDay);
  $('#f-name', root).addEventListener('input', e => pickByLabel(e.target.value));
  $('#f-qty', root).addEventListener('input', updateFoodPreview);
  $$('[data-day]', root).forEach(b => b.addEventListener('click', () => { $('#f-date', root).value = addDays(localDateStr(), +b.dataset.day); watchDay(); }));
  $('#f-meals', root).addEventListener('click', e => { const b = e.target.closest('[data-meal]'); if (b) { $('#f-meal', root).value = b.dataset.meal; $('#f-name', root).focus(); $('#f-name', root).scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
  ['f-cal','f-pro','f-carb','f-fat','f-sugar','f-sodium'].forEach(id => $('#'+id,root).addEventListener('input', updateFoodPreview));
  $('#f-clear', root).addEventListener('click', clearFoodForm);
  $('#f-copy-meal', root).addEventListener('click', copyRecentMeal);
  $('#f-edible', root).addEventListener('input', updateEdibleEstimate);
  $('#f-gross', root).addEventListener('input', updateEdibleEstimate);
  $('#f-save', root).addEventListener('click', saveFood);
  window.addEventListener('trackme:ai-fallback', e => toast('โควตา/การเชื่อมต่อของ AI หลักใช้ไม่ได้ จึงสลับไปใช้ '+e.detail.provider));
  $('#f-online', root).addEventListener('click', () => openFoodSearch({
    onUse: food => {
      const fields = { 'f-name':food.name, 'f-cal':food.calories, 'f-pro':food.protein, 'f-carb':food.carbs, 'f-fat':food.fat, 'f-sugar':food.sugar, 'f-sodium':food.sodium };
      Object.entries(fields).forEach(([id,v]) => { const el=$('#'+id,root); if(el) el.value=v ?? ''; });
      const qty=$('#f-qty',root); if(qty) qty.value=1;
    },
    onSaveLibrary: food => addDoc(userCol(state.uid,'custom_foods'), { name:food.name, brand:food.brand||'', unit:food.unit||'100 กรัม', gramsPerUnit:food.gramsPerUnit??100, category:guessFoodCategory(food.name), calories:food.calories, protein:food.protein, carbs:food.carbs, fat:food.fat, sugar:food.sugar, sodium:food.sodium, favorite:false, createdAt:new Date() }).catch(e=>toast('บันทึกเข้าคลังไม่สำเร็จ: '+e.message,'err'))
  }));
  $('#f-library', root).addEventListener('click', () => openLibrary(p => applyPreset(p)));
  $('#f-hiwpinto', root).addEventListener('click', () => openHiwpintoCalculator());
  $('#f-hiwpinto-sync', root).addEventListener('click', () => openHiwpintoSync());
  $('#f-photo', root).addEventListener('change', onPhoto);
  $('#f-label', root).addEventListener('change', onLabel);
  $('#f-body', root).addEventListener('click', e => {
    const edit = e.target.closest('[data-edit-log]');
    if (edit) return editFoodQuantity(edit.dataset.editLog);
    const move = e.target.closest('[data-move-log]');
    if (move) return moveFoodMeal(move.dataset.moveLog);
    const b = e.target.closest('[data-del]');
    if (b && confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) deleteDoc(userDoc(state.uid, 'food_records', b.dataset.del)).catch(err => toast('ลบไม่สำเร็จ: ' + err.message, 'err'));
  });
  on('customFoods', refreshDatalist);
  on('profile', fillMealSelect);
  refreshDatalist();
  syncFoodWeightForm();
  renderDay();
}

// ---------- Hiwpinto / clean-food rice adjustment ----------
const HIWPINTO_SAMPLES = [
  { name: 'น้ำตกปลาดอลลี่ใส่เห็ดชิเมจิ (แยกเครื่อง) (กล้อง) (ข้าวไรซ์)', calories: 230, protein: 20, carbs: 27, fat: 3 },
  { name: 'บะหมี่หยกกับไก่ย่างเทอริยากิ (แยกน้ำราด)', calories: 290, protein: 28, carbs: 36, fat: 4 },
  { name: 'ห่อหมกปลากรายทะเลรวมกับน้ำพริกหอมแดง (ไรซ์) (ข้าวไรซ์)', calories: 280, protein: 22, carbs: 28, fat: 9 }
];
const RICE = {
  white: { label: 'ข้าวขาว/ข้าวไรซ์', calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  brown: { label: 'ข้าวกล้อง', calories: 123, protein: 2.7, carbs: 25.6, fat: 1 }
};

function riceFromName(name) {
  const last = name.match(/\(([^()]*)\)\s*$/)?.[1] || '';
  const mentionsRice = /ข้าว|rice|ไรซ์|กล้อง/i.test(last);
  const profile = /กล้อง|ไรซ์/i.test(last) ? 'brown' : 'white';
  return { included: mentionsRice, profile };
}

function openHiwpintoCalculator(saved = null) {
  const meta = saved?.hiwpinto || {};
  const initialName = saved?.name || '';
  const detected = riceFromName(initialName);
  const shop = saved ? {
    calories: meta.shopCalories ?? saved.calories, protein: meta.shopProtein ?? saved.protein,
    carbs: meta.shopCarbs ?? saved.carbs, fat: meta.shopFat ?? saved.fat
  } : {};
  const baseRiceGrams = [80, 100, 120, 140, 180].includes(meta.baseRiceGrams) ? meta.baseRiceGrams : 100;
  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">คำนวณเมนู Hiwpinto / อาหารคลีน</h3><button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>
    <p class="text-xs text-slate-600 mb-3">กรอกโภชนาการจากร้านครั้งเดียว แล้วปรับข้าวหรือกลับมาแก้ภายหลังได้ เมนูที่บันทึกจะติดหมวด <b>Hiwpinto box</b></p>
    ${!saved ? `<label class="lbl">ลองเติมตัวอย่างที่ให้มา</label><select id="hp-sample" class="input mb-3"><option value="">กรอกข้อมูลเอง</option>${HIWPINTO_SAMPLES.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select>` : ''}
    <div class="space-y-3">
      <div><label class="lbl">ชื่อเมนู *</label><input id="hp-name" class="input" value="${esc(initialName)}" placeholder="ระบุชื่อเมนูและตัวเลือกในวงเล็บ"></div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${[['calories','kcal'],['protein','P (g)'],['carbs','C (g)'],['fat','F (g)']].map(([k,t])=>`<div><label class="lbl">${t} จากร้าน *</label><input id="hp-shop-${k}" type="number" min="0" step="0.1" class="input" value="${shop[k] ?? ''}"></div>`).join('')}
      </div>
      <label class="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-sm"><input id="hp-has-rice" type="checkbox" class="mt-1" ${saved ? (meta.includedRice ? 'checked' : '') : (detected.included ? 'checked' : '')}> ค่าจากร้านรวมข้าวอยู่แล้ว (ตรวจวงเล็บท้ายสุดของชื่อเมนู)</label>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="lbl">ชนิดข้าวตามวงเล็บท้ายสุด</label><select id="hp-rice-type" class="input"><option value="white">ข้าวขาว</option><option value="brown">ข้าวไรซ์/ข้าวกล้อง</option></select></div>
        <div><label class="lbl">ข้าวที่ต้องการคำนวณ</label><select id="hp-rice-g" class="input"><option value="180" ${saved ? (meta.riceGrams === 180 || !meta.riceGrams ? 'selected' : '') : 'selected'}>180 กรัม (มาตรฐาน)</option><option value="140" ${saved && meta.riceGrams === 140 ? 'selected' : ''}>140 กรัม</option></select></div>
      </div>
      <div id="hp-side-wrap"><div class="grid grid-cols-2 gap-3"><div><label class="lbl">สมมติฐานข้าวที่รวมอยู่ในค่าร้าน</label><select id="hp-base-g" class="input">${[80,100,120,140,180].map(g=>`<option value="${g}" ${Number(baseRiceGrams)===g?'selected':''}>${g} กรัม</option>`).join('')}</select></div><div><label class="lbl">คาร์บจากกับข้าว (ไม่บังคับ, g)</label><input id="hp-side-carb" type="number" min="0" max="100" step="0.5" class="input" value="${meta.sideCarbs ?? ''}" placeholder="ใส่เพื่อเช็กสมมติฐาน"></div></div><p class="text-xs text-slate-500 mt-1">เริ่มที่ข้าวเดิม 100 g ตามสมมติฐานของคุณ ระบบปรับจากน้ำหนักตั้งต้นนี้โดยตรง ไม่เดาน้ำหนักข้าวจากคาร์บรวม ช่องคาร์บกับข้าวใช้ตรวจสอบความสมเหตุสมผลเท่านั้น</p></div>
      <div id="hp-result" class="rounded-xl bg-slate-50 p-3 text-sm" aria-live="polite"></div>
      <div class="flex justify-end gap-2"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="hp-save" class="btn btn-primary" disabled>${saved ? 'บันทึกการปรับปรุง' : 'บันทึกเมนูไว้ใช้ซ้ำ'}</button></div>
    </div>`, { wide: true });

  const $m = s => $(s, m.el);
  if (saved) { $m('#hp-rice-type').value = meta.riceProfile || detected.profile; $m('#hp-base-g').value = String(baseRiceGrams); $m('#hp-rice-g').value = String(meta.riceGrams || 180); }
  else $m('#hp-rice-type').value = detected.profile;

  const calculate = () => {
    const included = $m('#hp-has-rice').checked;
    $m('#hp-side-wrap').classList.toggle('hidden', !included);
    $m('#hp-base-g').disabled = !included;
    $m('#hp-rice-type').disabled = !included; $m('#hp-rice-g').disabled = !included;
    const read = k => toNum($m(`#hp-shop-${k}`).value);
    const shopC = read('carbs'), shopCal = read('calories'), sideC = toNum($m('#hp-side-carb').value);
    const p = read('protein'), f = read('fat');
    const result = $m('#hp-result'); const save = $m('#hp-save');
    const bad = message => { result.innerHTML = `<p class="text-amber-900">⚠️ ${esc(message)}</p>`; save.disabled = true; return null; };
    if (!$m('#hp-name').value.trim() || [shopCal,p,shopC,f].some(v => v === null || v < 0)) return bad('กรอกชื่อเมนูและค่า kcal / P / C / F จากร้านให้ครบ โดยค่าต้องไม่ติดลบ');
    const kcalFromMacros = 4*p + 4*shopC + 9*f;
    const kcalGap = Math.abs(kcalFromMacros-shopCal);
    const kcalWarn = kcalGap > Math.max(30, shopCal*0.1)
      ? `⚠️ kcal จากร้าน ${round1(shopCal)} ไม่ค่อยสัมพันธ์กับ P/C/F (คำนวณได้ ${round1(kcalFromMacros)} kcal ต่าง ${round1(kcalGap)} kcal)`
      : `✓ kcal สัมพันธ์กับ P/C/F โดยประมาณ (${round1(kcalFromMacros)} kcal จากสูตร 4/4/9)`;
    if (!included) {
      result.innerHTML = `<p class="font-semibold">ผลคำนวณ: ${Math.round(shopCal)} kcal · P ${round1(p)} · C ${round1(shopC)} · F ${round1(f)}</p><p class="text-amber-800 mt-1">ไม่ได้เลือกว่าค่าร้านรวมข้าว — จะเก็บค่าร้านตามเดิม ไม่บวกข้าวเพิ่ม</p><p class="mt-1">${esc(kcalWarn)}</p>`;
      save.disabled = false; return { calories: shopCal, protein:p, carbs:shopC, fat:f, originalRiceGrams:null, kcalWarn };
    }
    const rice = RICE[$m('#hp-rice-type').value];
    const baseG = Number($m('#hp-base-g').value), targetG = Number($m('#hp-rice-g').value), scale = (targetG-baseG)/100;
    const estimatedSideCarbs = shopC - baseG/100*rice.carbs;
    const out = {
      calories: shopCal + scale*rice.calories,
      protein: p + scale*rice.protein,
      carbs: shopC + scale*rice.carbs,
      fat: f + scale*rice.fat
    };
    if (Object.values(out).some(v => v < 0)) return bad('ผลปรับข้าวทำให้สารอาหารติดลบ กรุณาตรวจสมมติฐานคาร์บจากกับข้าว');
    const outCal = Math.round(out.calories), outP=round1(out.protein), outC=round1(out.carbs), outF=round1(out.fat);
    const outMacroCal = 4*outP+4*outC+9*outF;
    const outGap = Math.abs(outMacroCal-outCal);
    const outWarn = outGap > Math.max(30,outCal*0.1) ? `ผลหลังปรับข้าว: kcal กับ P/C/F ยังต่างกัน ${round1(outGap)} kcal โปรดตรวจค่าจากร้าน` : `ผล kcal สัมพันธ์กับ P/C/F โดยประมาณ (${round1(outMacroCal)} kcal จากสูตร 4/4/9)`;
    const sideWarning = estimatedSideCarbs < 0
      ? `คาร์บรวมจากร้านต่ำกว่าคาร์บที่คาดในข้าว ${baseG} g (${round1(baseG/100*rice.carbs)} g) จึงควรลดสมมติฐานข้าวเดิมหรือตรวจค่าร้าน`
      : sideC === null
        ? `คาร์บกับข้าวที่เหลือจากสมมติฐานนี้ประมาณ ${round1(estimatedSideCarbs)} g แต่ยังไม่ได้ยืนยันแยกจากร้าน`
        : Math.abs(sideC-estimatedSideCarbs)>5
          ? `คาร์บกับข้าวที่ระบุ (${round1(sideC)} g) ต่างจากค่าที่คำนวณคร่าว ๆ (${round1(estimatedSideCarbs)} g) โปรดตรวจสมมติฐาน`
          : `คาร์บกับข้าวที่ระบุใกล้เคียงกับค่าประมาณ (${round1(estimatedSideCarbs)} g)`;
    const sideIsWarning = estimatedSideCarbs < 0 || (sideC !== null && Math.abs(sideC-estimatedSideCarbs)>5);
    result.innerHTML = `<p class="font-semibold">ผลสำหรับข้าว ${targetG} g: ${outCal} kcal · P ${outP} g · C ${outC} g · F ${outF} g</p><p class="text-xs text-slate-600 mt-1">ปรับจากข้าวเดิมสมมติ ${baseG} g เป็น ${targetG} g โดยใช้ค่าข้าว ${rice.carbs} g C / 100 g; ข้าวเดิมถูกหักก่อนแทน จึงไม่บวกซ้ำ</p><p class="text-xs ${sideIsWarning || sideC===null ? 'text-amber-800' : 'text-green-800'} mt-1">${sideC===null ? '⚠️ ' : sideIsWarning ? '⚠️ ' : '✓ '}${esc(sideWarning)}</p><p class="text-xs mt-1">ค่าร้าน: ${esc(kcalWarn)}</p><p class="text-xs ${outGap > Math.max(30,outCal*0.1) ? 'text-amber-800' : 'text-green-800'}">${esc(outWarn)}</p><p class="text-xs text-amber-800 mt-1">น้ำหนักข้าวเดิมเป็นสมมติฐานที่ปรับได้ ไม่ได้อนุมานจากคาร์บรวมโดยอัตโนมัติ</p>`;
    save.disabled = false; return { ...out, baseRiceGrams:baseG, estimatedSideCarbs:round1(estimatedSideCarbs), kcalWarn };
  };
  m.el.addEventListener('input', e => { if (e.target.id.startsWith('hp-')) calculate(); });
  m.el.addEventListener('change', e => { if (e.target.id.startsWith('hp-')) calculate(); });
  $m('#hp-name').addEventListener('change', () => {
    const tail = $m('#hp-name').value.match(/\(([^()]*)\)\s*$/);
    if (!tail) return;
    const detectedTail = riceFromName($m('#hp-name').value);
    $m('#hp-has-rice').checked = detectedTail.included;
    $m('#hp-rice-type').value = detectedTail.profile;
    calculate();
  });
  const sample = $m('#hp-sample');
  if (sample) sample.addEventListener('change', () => {
    if (!sample.value) return;
    const x = HIWPINTO_SAMPLES[Number(sample.value)]; if (!x) return;
    $m('#hp-name').value = x.name;
    ['calories','protein','carbs','fat'].forEach(k => { $m(`#hp-shop-${k}`).value = x[k]; });
    const detectedNow = riceFromName(x.name);
    $m('#hp-has-rice').checked = detectedNow.included; $m('#hp-rice-type').value = detectedNow.profile;
    calculate();
  });
  $m('#hp-save').addEventListener('click', () => {
    const values = calculate(); if (!values) return;
    const includedRice = $m('#hp-has-rice').checked;
    const name = $m('#hp-name').value.trim();
    const riceGrams = Number($m('#hp-rice-g').value);
    const suffix = includedRice ? ` · ข้าว ${riceGrams} g` : '';
    const rec = {
      name, brand:'Hiwpinto box', unit:`1 กล่อง${suffix}`, gramsPerUnit:null,
      calories:Math.round(values.calories), protein:round1(values.protein), carbs:round1(values.carbs), fat:round1(values.fat),
      favorite:saved?.favorite === true,
      hiwpinto:{ shopCalories:toNum($m('#hp-shop-calories').value), shopProtein:toNum($m('#hp-shop-protein').value), shopCarbs:toNum($m('#hp-shop-carbs').value), shopFat:toNum($m('#hp-shop-fat').value), sideCarbs:includedRice ? toNum($m('#hp-side-carb').value) : null, includedRice, riceProfile:$m('#hp-rice-type').value, baseRiceGrams:values.baseRiceGrams ?? null, riceGrams, kcalWarn:values.kcalWarn }
    };
    if (saved?.id) updateDoc(userDoc(state.uid,'custom_foods',saved.id),{...rec,updatedAt:new Date()}).then(()=>toast('ปรับปรุงเมนูไว้ใช้ซ้ำแล้ว')).catch(e=>toast('บันทึกไม่สำเร็จ: '+e.message,'err'));
    else addDoc(userCol(state.uid,'custom_foods'),{...rec,createdAt:new Date()}).then(()=>toast('บันทึกเมนู Hiwpinto ไว้ใช้ซ้ำแล้ว')).catch(e=>toast('บันทึกไม่สำเร็จ: '+e.message,'err'));
    m.close();
  });
  calculate();
}

export function watchDay() {
  if (!state.uid || !root) return;
  const date = $('#f-date', root).value;
  watch('food', query(userCol(state.uid, 'food_records'), where('date', '==', date)), list => { items = list; renderDay(); });
}

function fillMealSelect() {
  if (!root) return;
  const sel = $('#f-meal', root), keep = sel.value;
  sel.innerHTML = getMeals().map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}

function refreshDatalist() {
  if (!root) return;
  $('#f-datalist', root).innerHTML = getPresets().map(p => `<option value="${esc(label(p))}"></option>`).join('');
}
function pickByLabel(v) {
  const p = getPresets().find(x => label(x) === v);
  if (p) applyPreset(p, false);
  else { base = null; syncFoodWeightForm(); updateFoodPreview(); }
}

function applyPreset(p, setName = true) {
  base = p;
  if (setName) $('#f-name', root).value = label(p);
  qtyMode = 'auto';
  $('#f-qty', root).value = p.defaultQuantity ?? 1;
  if (p.edibleFraction && p.gramsPerUnit > 0) {
    $('#f-gross', root).value = p.gramsPerUnit;
    $('#f-edible', root).value = Math.round(p.edibleFraction * 100);
  }
  const set = (id, v) => { $('#' + id, root).value = typeof v === 'number' ? v : ''; };
  set('f-cal', p.calories); set('f-pro', p.protein); set('f-carb', p.carbs); set('f-fat', p.fat);
  set('f-sugar', p.sugar); set('f-sodium', p.sodium);
  $('#f-sugar-wrap', root).classList.toggle('hidden', p.sugar == null);
  $('#f-sodium-wrap', root).classList.toggle('hidden', p.sodium == null);
  syncFoodWeightForm();
  updateFoodPreview();
}

function updateFoodPreview() {
  if (!root) return;
  const qty = formQty() || 0;
  const calories = (toNum($('#f-cal', root).value) || 0) * qty;
  const protein = (toNum($('#f-pro', root).value) || 0) * qty;
  const carbs = (toNum($('#f-carb', root).value) || 0) * qty;
  const fat = (toNum($('#f-fat', root).value) || 0) * qty;
  const hasSugar = !$('#f-sugar-wrap', root).classList.contains('hidden');
  const hasSodium = !$('#f-sodium-wrap', root).classList.contains('hidden');
  const sugar = hasSugar ? (toNum($('#f-sugar', root).value) || 0) * qty : null;
  const sodium = hasSodium ? (toNum($('#f-sodium', root).value) || 0) * qty : null;
  const perGram = base?.unit === 'g' && base?.gramsPerUnit === 1;
  const amountText = perGram ? `${fmtAmount(qty)} g`
    : base?.gramsPerUnit > 0 ? `${fmtAmount(qty)} หน่วย ≈ ${fmtAmount(qty * base.gramsPerUnit)} g`
    : `${fmtAmount(qty)} หน่วย`;
  $('#f-preview', root).textContent = `${Math.round(calories)} kcal · P ${round1(protein)} · C ${round1(carbs)} · F ${round1(fat)}`
    + `${sugar !== null ? ` · น้ำตาล ${round1(sugar)}` : ''}${sodium !== null ? ` · Na ${Math.round(sodium)} mg` : ''} · ${amountText}`;
}

function clearFoodForm() {
  if (!root) return;
  ['f-name','f-cal','f-pro','f-carb','f-fat','f-gross','f-edible'].forEach(id => { const el=$('#'+id,root); if(el) el.value=''; });
  ['f-sugar','f-sodium'].forEach(id => { const el=$('#'+id,root); if(el) el.value=''; });
  $('#f-sugar-wrap',root).classList.add('hidden'); $('#f-sodium-wrap',root).classList.add('hidden');
  $('#f-qty',root).value=1;
  base=null; qtyMode='auto';
  syncFoodWeightForm();
  updateFoodPreview();
}

function foodLogQuantity(item) {
  if (Number.isFinite(item.quantity) && item.quantity > 0) return item.quantity;
  const legacy = String(item.name || '').match(/\s×\s*(\d+(?:\.\d+)?)$/);
  return legacy ? Number(legacy[1]) : 1;
}

const foodLogName = name => String(name || '').replace(/\s×\s*\d+(?:\.\d+)?$/, '');
const fmtAmount = value => String(Number(Number(value).toFixed(2)));
const foodLogPortion = item => {
  if (Number.isFinite(item.weighedGrams) && Number.isFinite(item.edibleFraction)) {
    const edibleGrams = Number.isFinite(item.edibleGrams) ? item.edibleGrams : item.weighedGrams * item.edibleFraction;
    return `ชั่ง ${fmtAmount(item.weighedGrams)} g · ${fmtAmount(item.edibleFraction * 100)}% ≈ ${fmtAmount(edibleGrams)} g ที่กินได้`;
  }
  const quantity = foodLogQuantity(item);
  if (item.portionUnit === 'g') return `${fmtAmount(quantity)} g`;
  const inferredGrams = item.gramsPerUnit > 0 ? item.gramsPerUnit : (getPresets().find(p => p.name === foodLogName(item.name))?.gramsPerUnit || gramsInUnit(item.portionUnit));
  if (inferredGrams > 0) return `${fmtAmount(quantity * inferredGrams)} g`;
  return quantity === 1 ? '' : `จำนวน ×${fmtAmount(quantity)} หน่วย`;
};

function unitNutritionFor(item, quantity = foodLogQuantity(item)) {
  const perUnit = key => quantity > 0 ? num(item[key]) / quantity : num(item[key]);
  if (item.unitNutrition && Number.isFinite(item.unitNutrition.calories)) return {
    calories: item.unitNutrition.calories,
    protein: item.unitNutrition.protein ?? perUnit('protein'), carbs: item.unitNutrition.carbs ?? perUnit('carbs'),
    fat: item.unitNutrition.fat ?? perUnit('fat'),
    sugar: item.unitNutrition.sugar ?? (item.sugar == null ? null : perUnit('sugar')),
    sodium: item.unitNutrition.sodium ?? (item.sodium == null ? null : perUnit('sodium'))
  };
  return {
    calories: perUnit('calories'), protein: perUnit('protein'), carbs: perUnit('carbs'), fat: perUnit('fat'),
    sugar: item.sugar == null ? null : perUnit('sugar'), sodium: item.sodium == null ? null : perUnit('sodium')
  };
}

// ถ้าเมนูรู้น้ำหนักต่อหน่วย ผู้ใช้จะกรอกเป็นกรัมหรือจำนวนหน่วยก็ได้: ระบบใช้ขนาดของตัวเลขเดาโหมดเอง — เลข ≥ น้ำหนัก 1 หน่วย × 0.9 ถือเป็นกรัม เลขน้อยกว่านั้นถือเป็นจำนวนหน่วย
let qtyMode = 'auto';
const isWeightUnit = u => /^\s*\d+(\.\d+)?\s*(g|gram|grams|กรัม|ml|มล\.?|มิลลิลิตร)\s*$/i.test(u || '');
const canWeigh = () => Boolean(base && base.gramsPerUnit > 0 && !base.edibleFraction && !(base.unit === 'g' && base.gramsPerUnit === 1));
// จำนวนหน่วยจริงที่จะบันทึก: ถ้าเมนูชั่งได้และค่าที่กรอกน่าจะเป็นกรัม ให้แปลงกลับเป็นหน่วย
const formQty = () => {
  const raw = numField(root, 'f-qty');
  if (raw === null || !canWeigh()) return raw;
  const gramThreshold = base.gramsPerUnit * 0.9;
  const looksLikeGrams = base.gramsPerUnit >= 15 ? raw >= gramThreshold : raw >= 10;
  return looksLikeGrams ? raw / base.gramsPerUnit : raw;
};

function syncFoodWeightForm() {
  if (!root) return;
  const grossMode = Boolean(base?.edibleFraction && base?.gramsPerUnit > 0);
  const gramMode = base?.unit === 'g' && base?.gramsPerUnit === 1;
  $('#f-qty-wrap', root).classList.toggle('hidden', grossMode);
  $('#f-qty-label', root).textContent = gramMode ? 'น้ำหนักที่กิน (กรัม)'
    : canWeigh() ? `จำนวน หรือน้ำหนัก (กรัม)` : 'จำนวน (หน่วย)';
  $('#f-qty', root).step = gramMode ? '1' : '0.01';
  $('#f-preview', root).textContent = gramMode ? 'สารอาหารในคลังคิดต่อ 1 กรัม · ยอดรวมปรับตามน้ำหนักที่กรอก' : '';
  $('#f-gross-wrap', root).classList.toggle('hidden', !grossMode);
  if (grossMode) updateEdibleEstimate();
  else updateFoodPreview();
}

function updateEdibleEstimate() {
  if (!root || !base?.edibleFraction) return;
  const gross = toNum($('#f-gross', root).value) || 0;
  const percent = toNum($('#f-edible', root).value) || 0;
  const approx = Math.round(gross * percent / 100);
  const source = base.edibleFractionSource || 'สัดส่วนนี้เป็นค่าประมาณ ปรับได้ตามอาหารที่ชั่ง';
  $('#f-edible-note', root).textContent = `${source} · คาดว่าส่วนที่กินได้ประมาณ ${approx} g`;
}

function saveFood() {
  const name = $('#f-name', root).value.trim();
  const cal = numField(root, 'f-cal');
  if (!name || cal === null) return toast('กรุณากรอกชื่อเมนูและแคลอรี่', 'err');
  const grossMode = Boolean(base?.edibleFraction && base?.gramsPerUnit > 0);
  const weighedGrams = grossMode ? numField(root, 'f-gross') : null;
  const ediblePercent = grossMode ? numField(root, 'f-edible') : null;
  if (grossMode && (!weighedGrams || weighedGrams <= 0 || !ediblePercent || ediblePercent > 100)) return toast('กรุณาระบุน้ำหนักที่ชั่งและสัดส่วนที่กินได้ 1–100%', 'err');
  const qty = grossMode ? weighedGrams * (ediblePercent / 100) / base.gramsPerUnit : (formQty() ?? 1);
  if (qty <= 0) return toast('จำนวนต้องมากกว่า 0', 'err');
  const m = v => (v === null ? 0 : round1(v * qty));
  const unitNutrition = {
    calories: cal, protein: numField(root, 'f-pro') ?? 0, carbs: numField(root, 'f-carb') ?? 0,
    fat: numField(root, 'f-fat') ?? 0,
    sugar: numField(root, 'f-sugar'), sodium: numField(root, 'f-sodium')
  };
  const rec = {
    date: $('#f-date', root).value,
    mealId: $('#f-meal', root).value,
    meal: $('#f-meal', root).selectedOptions[0]?.textContent || '',
    name: foodLogName(name), quantity: qty, unitNutrition,
    calories: Math.round(unitNutrition.calories * qty),
    protein: m(unitNutrition.protein), carbs: m(unitNutrition.carbs), fat: m(unitNutrition.fat),
    createdAt: new Date()
  };
  if (!grossMode && base) {
    rec.portionUnit = base.unit || 'หน่วย';
    rec.gramsPerUnit = Number.isFinite(base.gramsPerUnit) ? base.gramsPerUnit : null;
  }
  if (unitNutrition.sugar !== null) rec.sugar = round1(unitNutrition.sugar * qty);
  if (unitNutrition.sodium !== null) rec.sodium = Math.round(unitNutrition.sodium * qty);
  if (grossMode) {
    rec.weighedGrams = weighedGrams; rec.edibleFraction = ediblePercent / 100;
    rec.edibleGrams = weighedGrams * rec.edibleFraction; rec.edibleUnitGrams = base.gramsPerUnit;
    rec.edibleFractionSource = base.edibleFractionSource || null;
  }
  // ไม่ await: ตอนออฟไลน์ promise จะไม่จบจนกว่าจะซิงค์ แต่ข้อมูลถูกเก็บในเครื่องและแสดงทันที
  addDoc(userCol(state.uid, 'food_records'), rec).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  clearFoodForm();
}

async function copyRecentMeal() {
  const date = $('#f-date', root).value, mealId = $('#f-meal', root).value;
  const mealName=$('#f-meal',root).selectedOptions[0]?.textContent||'';
  if (!date || !mealId || !state.uid) return;
  const button = $('#f-copy-meal', root);
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังหา…';
  try {
    let sourceDate = null, sourceItems = [];
    for (let days = 1; days <= 30 && !sourceItems.length; days++) {
      const candidate = addDays(date, -days);
      const result = await getDocs(query(userCol(state.uid, 'food_records'), where('date', '==', candidate)));
      sourceItems = result.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.mealId===mealId || item.meal===mealName);
      if (sourceItems.length) sourceDate = candidate;
    }
    if (!sourceItems.length) return toast(`ไม่พบ${mealName}ใน 30 วันก่อนหน้า`, 'err');
    const modal = openModal(`<div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">คัดลอก${esc(mealName)}</h3><button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>
      <p class="text-sm text-slate-600 mb-3">พบมื้อวันที่ <b>${esc(sourceDate)}</b> · ${sourceItems.length} รายการ</p>
      <label class="flex items-center gap-2 text-sm mb-2"><input id="copy-meal-all" type="checkbox" checked> เลือกทั้งหมด</label>
      <div class="space-y-2 mb-4">${sourceItems.map((item,i) => `<label class="rounded-lg bg-lav-soft/40 px-3 py-2 text-sm flex gap-2 items-start"><input class="copy-meal-item mt-1" type="checkbox" data-index="${i}" checked><span><b>${esc(item.name)}</b><span class="block text-xs text-slate-500">${esc(item.calories)} kcal · P ${esc(item.protein)} · C ${esc(item.carbs)} · F ${esc(item.fat)}</span></span></label>`).join('')}</div>
      <p class="text-xs text-slate-500 mb-3">จะเพิ่มรายการใหม่ในวันที่ ${esc(date)} โดยไม่แก้ไขมื้อเดิม</p>
      <div class="flex justify-end gap-2"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="copy-meal-confirm" class="btn btn-primary">คัดลอกรายการที่เลือก</button></div>`, { wide: true });
    const choices = () => [...$$('.copy-meal-item', modal.el)];
    $('#copy-meal-all', modal.el).addEventListener('change', e => { choices().forEach(c => { c.checked=e.target.checked; }); });
    choices().forEach(c => c.addEventListener('change', () => { $('#copy-meal-all',modal.el).checked=choices().every(x=>x.checked); }));
    $('#copy-meal-confirm', modal.el).addEventListener('click', async () => {
      const selected = choices().filter(c=>c.checked).map(c=>sourceItems[Number(c.dataset.index)]);
      if (!selected.length) return toast('เลือกรายการอาหารอย่างน้อย 1 รายการ', 'err');
      const batch = writeBatch(db), collectionRef = userCol(state.uid, 'food_records');
      const targetMealId=$('#f-meal',root).value, targetMealName=$('#f-meal',root).selectedOptions[0]?.textContent||mealName;
      selected.forEach(({ id, ...item }) => batch.set(doc(collectionRef), { ...item, date, meal:targetMealName, mealId:targetMealId, createdAt: new Date(), copiedFrom: sourceDate }));
      try { await batch.commit(); modal.close(); toast(`คัดลอก ${selected.length} รายการแล้ว`); }
      catch (error) { toast('คัดลอกไม่สำเร็จ: ' + error.message, 'err'); }
    });
  } catch (error) { toast('ค้นหามื้อก่อนหน้าไม่สำเร็จ: ' + error.message, 'err'); }
  finally { button.disabled = false; button.innerHTML = '<i class="fa-regular fa-copy"></i> คัดลอกจากมื้อเดิม'; }
}

function moveFoodMeal(id) {
  const item=items.find(row=>row.id===id);
  if(!item)return;
  const options=getMeals().map(m=>`<option value="${esc(m.id)}" ${m.id===item.mealId?'selected':''}>${esc(m.name)}</option>`).join('');
  const modal=openModal(`<h3 class="font-bold text-lg mb-3">ย้ายไปมื้ออื่น</h3><p class="text-sm text-slate-600 mb-3">${esc(foodLogName(item.name))}</p><label class="lbl">มื้อใหม่</label><select id="move-food-meal" class="input">${options}</select><div class="flex justify-end gap-2 mt-4"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="move-food-confirm" class="btn btn-primary">ย้ายมื้อ</button></div>`);
  $('#move-food-confirm',modal.el).addEventListener('click',()=>{
    const select=$('#move-food-meal',modal.el), meal=select.selectedOptions[0]?.textContent||'';
    updateDoc(userDoc(state.uid,'food_records',id),{mealId:select.value,meal,updatedAt:new Date()})
      .then(()=>toast(`ย้ายไป${meal}แล้ว`)).catch(e=>toast('ย้ายมื้อไม่สำเร็จ: '+e.message,'err'));
    modal.close();
  });
}

function editFoodQuantity(id) {
  const item = items.find(row => row.id === id);
  if (!item) return;
  const isGross = Number.isFinite(item.weighedGrams) && Number.isFinite(item.edibleFraction) && item.edibleUnitGrams > 0;
  const isGrams = item.portionUnit === 'g' && item.gramsPerUnit === 1;
  const currentQuantity = foodLogQuantity(item);
  const inferredGrams = item.gramsPerUnit > 0 ? item.gramsPerUnit : (getPresets().find(p => p.name === foodLogName(item.name))?.gramsPerUnit || gramsInUnit(item.portionUnit));
  const unitG = !isGross && !isGrams && inferredGrams > 0 ? inferredGrams : 1;   // กรัมต่อหน่วย: ถ้ามี ให้แก้เป็นกรัมได้
  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">แก้จำนวนอาหาร</h3><button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>
    <p class="text-sm font-semibold text-slate-700 mb-3">${esc(foodLogName(item.name))}</p>
    <label class="lbl">${isGross ? 'น้ำหนักที่ชั่งรวม (g)' : isGrams || unitG > 1 ? (unitG > 1 ? 'น้ำหนักที่กิน (กรัม)' : 'ปริมาณ (กรัม)') : 'จำนวน (หน่วยเดิม)'}</label>
    <input id="fl-amount" type="number" min="0.01" step="${isGross||isGrams||unitG > 1 ? '1' : '0.01'}" inputmode="decimal" class="input" value="${isGross ? item.weighedGrams : unitG > 1 ? round1(currentQuantity * unitG) : currentQuantity}">
    ${isGross ? `<label class="lbl mt-3">สัดส่วนที่กินได้โดยประมาณ (%)</label><input id="fl-edible" type="number" min="1" max="100" step="1" inputmode="decimal" class="input" value="${Math.round(item.edibleFraction * 100)}">` : ''}
    <p id="fl-estimate" class="mt-2 text-sm text-slate-600" aria-live="polite"></p>
    <div class="flex justify-end gap-2 mt-4"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="fl-save" class="btn btn-primary">บันทึกจำนวน</button></div>`);
  const updateEstimate = () => {
    const grams = toNum($('#fl-amount', m.el).value) || 0;
    const percent = isGross ? (toNum($('#fl-edible', m.el).value) || 0) : null;
    const quantity = isGross ? grams * percent / 100 / item.edibleUnitGrams : grams / unitG;
    const nutrition=unitNutritionFor(item,currentQuantity);
    const amountText=isGross ? `กินได้ประมาณ ${fmtAmount(grams*percent/100)} g · ` : isGrams || unitG > 1 ? `${fmtAmount(grams)} g · ` : '';
    $('#fl-estimate', m.el).textContent = `${amountText}${Math.round(nutrition.calories*quantity)} kcal · P ${round1(nutrition.protein*quantity)} · C ${round1(nutrition.carbs*quantity)} · F ${round1(nutrition.fat*quantity)}`;
  };
  $('#fl-amount', m.el).addEventListener('input', updateEstimate);
  if (isGross) $('#fl-edible', m.el).addEventListener('input', updateEstimate);
  updateEstimate();
  $('#fl-save', m.el).addEventListener('click', () => {
    const amount = toNum($('#fl-amount', m.el).value);
    const percent = isGross ? toNum($('#fl-edible', m.el).value) : null;
    if (!amount || amount <= 0) return toast('จำนวนต้องมากกว่า 0', 'err');
    if (isGross && (!percent || percent <= 0 || percent > 100)) return toast('สัดส่วนที่กินได้ต้องอยู่ระหว่าง 1–100%', 'err');
    const edibleFraction = isGross ? percent / 100 : null;
    const quantity = isGross ? amount * edibleFraction / item.edibleUnitGrams : amount / unitG;
    const unitNutrition = unitNutritionFor(item, currentQuantity);
    const updates = {
      name: foodLogName(item.name), quantity, unitNutrition,
      calories: Math.round(unitNutrition.calories * quantity),
      protein: round1(unitNutrition.protein * quantity), carbs: round1(unitNutrition.carbs * quantity), fat: round1(unitNutrition.fat * quantity),
      updatedAt: new Date()
    };
    if (unitNutrition.sugar !== null) updates.sugar = round1(unitNutrition.sugar * quantity);
    if (unitNutrition.sodium !== null) updates.sodium = Math.round(unitNutrition.sodium * quantity);
    if (isGross) {
      updates.weighedGrams = amount; updates.edibleFraction = edibleFraction;
      updates.edibleGrams = amount * edibleFraction; updates.edibleUnitGrams = item.edibleUnitGrams;
    }
    const saving = updateDoc(userDoc(state.uid, 'food_records', id), updates);
    m.close();
    saving.then(() => toast('ปรับจำนวนและสารอาหารแล้ว'))
      .catch(err => toast('แก้จำนวนไม่สำเร็จ: ' + err.message, 'err'));
  });
}

function renderDay() {
  if (!root) return;
  const body = $('#f-body', root);
  const meals = [...getMeals().map(m => m.name), ...MEAL_ORDER.filter(m => !getMeals().some(x => x.name === m)), ...new Set(items.map(i => i.meal || 'ไม่ระบุมื้อ').filter(m => !getMeals().some(x => x.name === m) && !MEAL_ORDER.includes(m)))];
  const targets = getTargets();
  body.innerHTML = items.length ? meals.map(meal => {
    const rows = items.filter(i => (i.meal || 'ไม่ระบุมื้อ') === meal);
    if (!rows.length) return '';
    const tone = MEAL_COLORS[meal] || { header: 'bg-slate-100 text-slate-700', row: 'bg-slate-50/60', icon: 'fa-utensils' };
    const mealCalories = rows.reduce((sum, i) => sum + num(i.calories), 0);
    const mealProtein = rows.reduce((sum, i) => sum + num(i.protein), 0);
    return `<tr class="${tone.header}"><th colspan="4" class="p-2.5 text-left">
      <div class="flex items-center justify-between gap-2"><span><i class="fa-solid ${tone.icon} mr-1.5"></i>${esc(meal)}</span><span class="text-xs font-medium">${rows.length} รายการ · ${Math.round(mealCalories)} kcal · โปรตีน ${round1(mealProtein)} g</span></div>
    </th></tr>` + rows.map(i => `
      <tr class="${tone.row} hover:bg-white/80"><td class="p-3 font-medium text-slate-800">${esc(foodLogName(i.name))}${foodLogPortion(i) ? `<span class="block text-xs font-normal text-slate-500">${esc(foodLogPortion(i))}</span>` : ''}</td>
      <td class="p-3 text-right font-bold text-slate-700">${esc(i.calories)}</td>
      <td class="p-3 text-right text-slate-600">${esc(i.protein)}g</td>
      <td class="p-3 text-center"><div class="flex justify-center gap-2"><button data-edit-log="${esc(i.id)}" class="text-brand hover:text-brand-dark p-1" aria-label="แก้จำนวน ${esc(foodLogName(i.name))}" title="แก้จำนวน"><i class="fa-solid fa-pen-to-square text-xs"></i></button><button data-move-log="${esc(i.id)}" class="text-sky-600 hover:text-sky-800 p-1" aria-label="ย้ายมื้อ ${esc(foodLogName(i.name))}" title="ย้ายไปมื้ออื่น"><i class="fa-solid fa-right-left text-xs"></i></button><button data-del="${esc(i.id)}" class="text-rose-400 hover:text-rose-600 p-1" aria-label="ลบ ${esc(foodLogName(i.name))}" title="ลบ"><i class="fa-solid fa-trash-can text-xs"></i></button></div></td></tr>`).join('');
  }).join('')
    : '<tr><td colspan="4" class="p-4 text-center text-slate-400 text-xs">ยังไม่มีรายการอาหารในวันนี้</td></tr>';

  const sum = k => items.reduce((a, i) => a + num(i[k]), 0);
  const t = { cal: sum('calories'), p: sum('protein'), c: sum('carbs'), f: sum('fat'), sugar: sum('sugar'), na: sum('sodium') };
  $('#f-total', root).textContent = `${Math.round(t.cal)} / ${targets.kcal.toLocaleString()}`;
  const today = localDateStr(), date = $('#f-date', root).value, future = date > today;
  $$('[data-day]', root).forEach(b => { const on_ = addDays(today, +b.dataset.day) === date; b.classList.toggle('ring-2', on_); b.classList.toggle('ring-brand', on_); });
  $('#f-daylabel', root).textContent = future ? 'แคลอรี่ที่วางแผนไว้' : date === today ? 'แคลอรี่รวมวันนี้' : 'แคลอรี่รวมของวันที่เลือก';
  const left = targets.kcal - t.cal;
  $('#f-remain', root).innerHTML = left >= 0 ? `เหลืออีก <b>${Math.round(left)}</b> kcal` : `<span class="text-amber-700">เกินเป้า <b>${Math.round(-left)}</b> kcal</span>`;
  // พลังงานแต่ละมื้อ: กราฟแท่งเทียบกันเองระหว่างมื้อ (ไม่อิงเป้าหมาย)
  const mealList = getMeals();
  const eatenBy = name => items.filter(i => (i.meal || '') === name).reduce((a, i) => a + num(i.calories), 0);
  const known = new Set(mealList.map(m => m.name));
  const otherKcal = items.filter(i => !known.has(i.meal || '')).reduce((a, i) => a + num(i.calories), 0);
  const mealRows = mealList.map(m => ({ name: m.name, kcal: Math.round(eatenBy(m.name)) }));
  if (otherKcal) mealRows.push({ name: 'มื้ออื่น ๆ', kcal: Math.round(otherKcal) });
  const maxMeal = Math.max(...mealRows.map(m => m.kcal), 1);
  $('#f-meals', root).innerHTML = mealRows.map(m => `
    <div><div class="flex justify-between items-center text-xs font-semibold mb-1"><span>${esc(m.name)}</span><span>${m.kcal} kcal</span></div>
      <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden"><div class="bg-violet-400 h-full transition-all" style="width:${Math.max(m.kcal / maxMeal * 100, m.kcal ? 3 : 0)}%"></div></div>
      <button data-meal="${esc(m.name)}" class="text-brand underline text-[11px] mt-0.5">+ เพิ่มในมื้อนี้</button></div>`).join('');
  $('#f-meals-note', root).textContent = mealRows.some(m => m.kcal > 0) ? 'เทียบสัดส่วนพลังงานระหว่างมื้อจากที่บันทึกในวันนี้' : 'ยังไม่มีบันทึกอาหารในวันนี้ — มื้อไหนมีรายการแล้วกราฟจะเริ่มแสดง';
  const burned = state.workouts.filter(w => w.date === date).reduce((a, w) => a + (w.estKcal || 0), 0);
  const burnEl = $('#f-burn', root);
  burnEl.classList.toggle('hidden', !burned);
  if (burned) burnEl.textContent = `🏃 ออกกำลังกายวันนี้เผาผลาญเพิ่มประมาณ ${burned} kcal (ค่าประมาณ — ยังไม่ได้บวกเข้าเป้าอัตโนมัติ)`;
  const macroCard = (name, v, goal, color) => `
    <div class="bg-slate-50 rounded-xl p-2.5"><div class="flex justify-between text-[11px] font-semibold text-slate-500"><span>${name}</span></div>
    <p class="text-sm font-bold text-slate-800">${round1(v)} <span class="text-[11px] font-normal text-slate-500">/ ${goal} g</span></p>
    <div class="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden mt-1"><div class="${color} h-full transition-all" style="width:${Math.min(v / goal * 100, 100)}%"></div></div></div>`;
  $('#f-stats', root).innerHTML = macroCard('โปรตีน', t.p, targets.protein, 'bg-blue-400') + macroCard('คาร์บ', t.c, targets.carbs, 'bg-violet-400') + macroCard('ไขมัน', t.f, targets.fat, 'bg-pink-400') +
    `<div class="bg-slate-50 rounded-xl p-2.5"><div class="flex justify-between text-[11px] font-semibold text-slate-500"><span>น้ำตาล · โซเดียม</span></div>
    <p class="text-sm font-bold text-slate-800">${round1(t.sugar)} g · ${Math.round(t.na)} mg</p>
    <p class="text-[11px] text-slate-400">เฉพาะรายการที่กรอกค่านี้</p></div>`;
  $('#f-advice', root).textContent = t.cal === 0 ? 'ยังไม่มีข้อมูลวันนี้ เริ่มบันทึกมื้อแรกกันเลย!'
    : t.p < targets.protein * 0.5 ? '⚠️ วันนี้โปรตีนค่อนข้างน้อย ลองเสริมไข่ อกไก่ หรือปลาในมื้อถัดไป'
    : '✨ สารอาหารวันนี้อยู่ในเกณฑ์ดี รักษาระดับไว้นะ';
}

// ---------- Gemini: photo / online search ----------
async function onPhoto(e) {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  toast('กำลังให้ Gemini วิเคราะห์รูปอาหาร...');
  try {
    const r = await estimateFromPhoto(f);
    base = null;
    $('#f-name', root).value = r.name || '';
    $('#f-qty', root).value = 1;
    [['f-cal', r.calories], ['f-pro', r.protein], ['f-carb', r.carbs], ['f-fat', r.fat]].forEach(([id, v]) => { $('#' + id, root).value = v ?? ''; });
    toast('วิเคราะห์สำเร็จ — ตรวจสอบค่าแล้วกดบันทึก (เป็นค่าประมาณ)');
  } catch (err) { toast(explainGeminiError(err), 'err'); }
}

function openOnlineSearch() {
  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">ค้นหาโภชนาการ (ต่อ 100 กรัม)</h3><button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="flex gap-2"><input id="os-q" class="input" placeholder="เช่น ฝรั่ง, ข้าวสวย"><button id="os-go" class="btn btn-primary">ค้นหา</button></div>
    <div id="os-res" class="mt-3 text-sm text-slate-500">ค่าที่ได้เป็นค่าโดยประมาณจาก Gemini · ถ้าบริการหนาแน่น ระบบจะลองซ้ำให้อัตโนมัติ</div>
    <div id="os-calc" class="hidden mt-3 bg-sky-soft/50 rounded-xl p-3 space-y-2">
      <label class="lbl">น้ำหนักที่กิน (กรัม)</label><input id="os-g" type="number" value="100" class="input">
      <p id="os-out" class="text-sm font-semibold text-blue-700"></p>
      <button id="os-import" class="btn btn-primary">นำเข้าฟอร์มบันทึก</button>
    </div>`);
  let cur = null;
  const upd = () => { const g = toNum($('#os-g', m.el).value) || 0; $('#os-out', m.el).textContent = `${Math.round((cur.calories || 0) * g / 100)} kcal`; };
  const go = $('#os-go', m.el);
  go.addEventListener('click', async () => {
    if (go.disabled) return;
    const q = $('#os-q', m.el).value.trim(); if (!q) return;
    go.disabled = true;
    go.textContent = 'กำลังค้นหา…';
    $('#os-res', m.el).textContent = 'กำลังค้นหา...';
    try {
      cur = await lookupPer100g(q);
      $('#os-res', m.el).innerHTML = `<b>${esc(cur.name)}</b> ต่อ 100g: ${esc(cur.calories)} kcal · โปรตีน ${esc(cur.protein)} · คาร์บ ${esc(cur.carbs)} · ไขมัน ${esc(cur.fat)}`;
      $('#os-calc', m.el).classList.remove('hidden'); upd();
    } catch (err) {
      $('#os-res', m.el).innerHTML = `<p>${esc(explainGeminiError(err))}</p><button id="os-local" class="btn btn-soft mt-2">เลือกจากคลังอาหารของฉัน</button>`;
      $('#os-local', m.el).addEventListener('click', () => { m.close(); openLibrary(p => applyPreset(p)); });
    } finally {
      if (m.el.isConnected) { go.disabled = false; go.textContent = 'ค้นหา'; }
    }
  });
  $('#os-g', m.el).addEventListener('input', () => cur && upd());
  $('#os-import', m.el).addEventListener('click', () => {
    const g = toNum($('#os-g', m.el).value) || 100, k = g / 100;
    base = null;
    $('#f-name', root).value = `${cur.name} (${g}g)`; $('#f-qty', root).value = 1;
    $('#f-cal', root).value = Math.round((cur.calories || 0) * k); $('#f-pro', root).value = round1((cur.protein || 0) * k);
    $('#f-carb', root).value = round1((cur.carbs || 0) * k); $('#f-fat', root).value = round1((cur.fat || 0) * k);
    m.close();
  });
}

// ---------- Nutrition label scan ----------
async function onLabel(e) {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const progress = openModal(`<div class="flex items-center gap-3"><span class="animate-spin rounded-full h-6 w-6 border-2 border-brand border-t-transparent"></span><div><h3 class="font-bold">กำลังอ่านฉลากโภชนาการ</h3><p class="text-xs text-slate-500">กำลังส่งภาพให้ Gemini อ่าน ตัวแอปจะหยุดรอภายใน 20 วินาทีหากไม่มีคำตอบ</p></div></div>`);
  try {
    const r = await readNutritionLabel(f);
    progress.close();
    const per100 = r.basis === 'per_100g';
    openFoodEditor({
      prefill: {
        name: r.name || '', brand: '',
        unit: per100 ? '100 กรัม' : (r.basis === 'per_serving' ? (r.servingSizeText || '') : ''),
        gramsPerUnit: per100 ? 100 : (r.basis === 'per_serving' ? r.servingGrams : null),
        calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, sugar: r.sugar, sodium: r.sodium
      },
      scan: { basis: r.basis, servingGrams: r.servingGrams, servingSizeText: r.servingSizeText, notes: r.notes },
      onSaved: food => applyPreset(food)
    });
  } catch (err) {
    if(progress.el.isConnected){
      progress.el.querySelector('.animate-spin')?.remove();
      const box=progress.el.querySelector('.text-xs');
      if(box)box.outerHTML=`<p class="mt-2 text-sm text-rose-700" role="alert">${esc(explainGeminiError(err))}</p><button id="label-retry" class="btn btn-soft mt-3">เลือกภาพใหม่</button><button data-close class="btn btn-ghost mt-3">ปิด</button>`;
      progress.el.querySelector('#label-retry')?.addEventListener('click',()=>{progress.close();$('#f-label',root).click();});
      progress.el.querySelector('[data-close]')?.addEventListener('click',progress.close);
    } else toast(explainGeminiError(err), 'err');
  }
}

// ---------- Custom food library ----------
export function openLibrary(onPick) {
  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">คลังอาหารของฉัน</h3><button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="flex flex-col sm:flex-row gap-2 mb-3"><input id="lib-q" class="input" placeholder="🔍 ค้นหา..."><select id="lib-category" class="input sm:max-w-52"><option value="">ทุกหมวดหมู่</option>${categoryNames.map(c => `<option>${esc(c)}</option>`).join('')}</select><button id="lib-add" class="btn btn-primary whitespace-nowrap"><i class="fa-solid fa-plus"></i> เพิ่ม</button><button id="lib-bulk-add" class="btn btn-soft whitespace-nowrap"><i class="fa-solid fa-file-import"></i> เพิ่มหลายเมนู</button></div>
    <button id="lib-restore-builtins" class="hidden chip bg-sky-soft text-blue-700 mb-2">คืนเมนูเริ่มต้นที่ซ่อนไว้</button>
    <div id="lib-bulk" class="flex flex-wrap items-center gap-2 mb-2 rounded-xl bg-slate-50 p-2 text-sm">
      <label class="flex items-center gap-2"><input id="lib-select-visible" type="checkbox"> เลือกเมนูของฉันที่แสดง (<span id="lib-visible-count">0</span>)</label>
      <span>เลือกแล้ว <b id="lib-selected-count">0</b></span>
      <select id="lib-bulk-category" class="input !w-auto min-w-40 !py-2 text-xs"><option value="">เลือกหมวดหมู่ใหม่</option>${categoryNames.map(c=>`<option>${esc(c)}</option>`).join('')}</select>
      <button id="lib-change-category" class="chip bg-sky-soft text-blue-700 !px-3 !py-2 text-xs" disabled>แก้ไขหมวดหมู่</button>
      <button id="lib-delete-selected" class="chip bg-pink-soft text-rose-600 !px-3 !py-2 text-xs" disabled>ลบรายการที่เลือก</button>
    </div>
    <div id="lib-list" class="divide-y divide-slate-100 md:grid md:grid-cols-2 md:divide-y-0 md:gap-x-5"></div>`, { wide: true });
  const selected = new Set();
  const matches = p => label(p).toLowerCase().includes($('#lib-q', m.el).value.toLowerCase()) && (!$('#lib-category', m.el).value || (p.category || guessFoodCategory(p.name)) === $('#lib-category', m.el).value);
  const visibleCustom = () => getPresets().filter(p => p.custom && matches(p));
  const render = () => {
    const q = $('#lib-q', m.el).value.toLowerCase();
    const presets = getPresets().filter(matches);
    const custom = presets.filter(p => p.custom);
    const hidden = hiddenBuiltins();
    $('#lib-restore-builtins', m.el).classList.toggle('hidden', hidden.size === 0);
    const allVisibleSelected = custom.length > 0 && custom.every(p => selected.has(p.id));
    $('#lib-select-visible', m.el).checked = allVisibleSelected;
    $('#lib-select-visible', m.el).disabled = custom.length === 0;
    $('#lib-visible-count', m.el).textContent = custom.length;
    $('#lib-selected-count', m.el).textContent = selected.size;
    $('#lib-delete-selected', m.el).disabled = selected.size === 0;
    $('#lib-change-category', m.el).disabled = selected.size === 0 || !$('#lib-bulk-category', m.el).value;
    $('#lib-list', m.el).innerHTML = presets.map((p, i) => `
      <div class="food-library-item py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 md:border-b md:border-slate-100 md:py-4">
        <div class="min-w-0 flex items-start gap-2">${p.custom ? `<input type="checkbox" class="lib-select mt-1 shrink-0" data-select="${esc(p.id)}" aria-label="เลือก ${esc(label(p))}" ${selected.has(p.id) ? 'checked' : ''}>` : ''}<div class="min-w-0"><p class="text-sm font-semibold text-slate-800">${p.favorite ? '⭐ ' : ''}${esc(label(p))}</p>
        <p class="text-xs text-slate-500"><span class="inline-block rounded-full bg-slate-100 px-2 py-0.5 mr-1">${esc(p.category || guessFoodCategory(p.name))}</span>${p.calories} kcal · P ${p.protein ?? '-'} · C ${p.carbs ?? '-'} · F ${p.fat ?? '-'}${p.sugar != null ? ' · น้ำตาล ' + p.sugar : ''}${p.sodium != null ? ' · Na ' + p.sodium : ''}</p></div>
        </div><div class="flex flex-wrap gap-1 sm:shrink-0">
          <button data-pick="${i}" class="chip bg-ok-soft text-green-800">เลือก</button>
          ${p.custom ? `${p.hiwpinto ? `<button data-hp="${esc(p.id)}" class="chip bg-amber-100 text-amber-900">ปรับข้าว</button>` : ''}<button data-fav="${esc(p.id)}" class="chip bg-lav-soft" title="โปรด">${p.favorite ? '★' : '☆'}</button><button data-edit="${esc(p.id)}" class="chip bg-sky-soft text-blue-700">แก้ไข</button><button data-rm="${esc(p.id)}" class="chip bg-pink-soft text-rose-600">ลบ</button>` : `<button data-fav-default="${esc(p.id)}" class="chip bg-lav-soft" title="โปรด">${p.favorite ? '★' : '☆'}</button>`}
        </div>
      </div>`).join('') || '<p class="text-sm text-slate-400 py-4 text-center">ไม่พบรายการ</p>';
  };
  $('#lib-q', m.el).addEventListener('input', render);
  $('#lib-category', m.el).addEventListener('change', render);
  $('#lib-add', m.el).addEventListener('click', () => openFoodEditor({}));
  $('#lib-bulk-add', m.el).addEventListener('click', () => openBulkFoodImport(m));
  $('#lib-restore-builtins', m.el).addEventListener('click', () => { localStorage.removeItem(HIDDEN_BUILTINS_KEY); refreshDatalist(); render(); });
  $('#lib-select-visible', m.el).addEventListener('change', e => {
    visibleCustom().forEach(p => e.target.checked ? selected.add(p.id) : selected.delete(p.id));
    render();
  });
  $('#lib-bulk-category', m.el).addEventListener('change', render);
  $('#lib-change-category', m.el).addEventListener('click', async () => {
    const category=$('#lib-bulk-category',m.el).value, foods=state.customFoods.filter(f=>selected.has(f.id));
    if(!category||!foods.length)return;
    if(!confirm(`เปลี่ยนหมวดหมู่ของ ${foods.length} เมนูที่เลือกเป็น “${category}” หรือไม่?`))return;
    try{for(let i=0;i<foods.length;i+=450){const batch=writeBatch(db);foods.slice(i,i+450).forEach(f=>batch.update(userDoc(state.uid,'custom_foods',f.id),{category}));await batch.commit();}selected.clear();$('#lib-bulk-category',m.el).value='';toast(`เปลี่ยนหมวดหมู่ให้ ${foods.length} เมนูแล้ว`);render();}
    catch(err){toast('เปลี่ยนหมวดหมู่ไม่สำเร็จ: '+err.message,'err');}
  });
  $('#lib-delete-selected', m.el).addEventListener('click', async () => {
    const foods = state.customFoods.filter(f => selected.has(f.id));
    if (!foods.length) return;
    const names = foods.slice(0, 5).map(f => `• ${f.name}`).join('\n');
    const more = foods.length > 5 ? `\nและอีก ${foods.length - 5} เมนู` : '';
    if (!confirm(`ลบเมนูที่เลือก ${foods.length} รายการออกจากคลังถาวร?\n\n${names}${more}`)) return;
    let deleted = 0;
    try {
      for (let i = 0; i < foods.length; i += 450) {
        const chunk = foods.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach(f => batch.delete(userDoc(state.uid, 'custom_foods', f.id)));
        await batch.commit();
        chunk.forEach(f => selected.delete(f.id));
        deleted += chunk.length;
      }
      toast(`ลบ ${foods.length} เมนูแล้ว`);
      render();
    } catch (err) {
      render();
      toast(deleted ? `ลบแล้ว ${deleted} จาก ${foods.length} เมนู ที่เหลือลบไม่สำเร็จ: ${err.message}` : 'ลบเมนูไม่สำเร็จ: ' + err.message, 'err');
    }
  });
  m.el.addEventListener('change', e => {
    const input = e.target.closest('[data-select]');
    if (!input) return;
    input.checked ? selected.add(input.dataset.select) : selected.delete(input.dataset.select);
    render();
  });
  m.el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const list = getPresets().filter(matches);
    if (b.dataset.pick !== undefined) { onPick(list[+b.dataset.pick]); m.close(); }
    else if (b.dataset.hp) openHiwpintoCalculator(state.customFoods.find(f => f.id === b.dataset.hp));
    else if (b.dataset.hideDefault) {
      const hidden = hiddenBuiltins(); hidden.add(b.dataset.hideDefault);
      localStorage.setItem(HIDDEN_BUILTINS_KEY, JSON.stringify([...hidden])); refreshDatalist(); render();
    }
    else if (b.dataset.favDefault) {
      const favorites = builtinFavorites();
      favorites.has(b.dataset.favDefault) ? favorites.delete(b.dataset.favDefault) : favorites.add(b.dataset.favDefault);
      localStorage.setItem(BUILTIN_FAV_KEY, JSON.stringify([...favorites])); render();
    }
    else if (b.dataset.edit) openFoodEditor({ id: b.dataset.edit, prefill: state.customFoods.find(f => f.id === b.dataset.edit) });
    else if (b.dataset.fav) { const f = state.customFoods.find(x => x.id === b.dataset.fav); updateDoc(userDoc(state.uid, 'custom_foods', f.id), { favorite: !f.favorite }); }
    else if (b.dataset.rm && confirm('ลบเมนูนี้ออกจากคลัง?')) {
      selected.delete(b.dataset.rm);
      deleteDoc(userDoc(state.uid, 'custom_foods', b.dataset.rm))
        .then(render)
        .catch(err => toast('ลบเมนูไม่สำเร็จ: ' + err.message, 'err'));
    }
  });
  on('customFoods', () => {
    if (!m.el.isConnected) return;
    const existing = new Set(state.customFoods.map(f => f.id));
    selected.forEach(id => { if (!existing.has(id)) selected.delete(id); });
    render();
  });
  render();
}

function openBulkFoodImport(parentModal) {
  const m = openModal(`<div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">เพิ่มอาหารหลายเมนู</h3><button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>
    <p class="text-xs text-slate-500 mb-3">วางข้อมูลต่อบรรทัด: ชื่อเมนู ⇥ จำนวน ⇥ หน่วย ⇥ kcal ⇥ P ⇥ C ⇥ F<br>ตัวอย่าง: Daily Me Granola (Dark Choc) ⇥ 35 ⇥ g ⇥ 170 ⇥ 4 ⇥ 22 ⇥ 7<br>ใส่โภชนาการตามปริมาณที่ระบุ จำนวนเริ่มต้นจะเติมให้อัตโนมัติ</p>
    <textarea id="lib-import-data" class="input min-h-56 font-mono text-xs" spellcheck="false"></textarea>
    <div class="flex justify-end gap-2 mt-4"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="lib-import-save" class="btn btn-primary">บันทึกเข้าคลัง</button></div>`, { wide: true });
  $('#lib-import-save', m.el).addEventListener('click', async () => {
    const lines = $('#lib-import-data', m.el).value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const parsed = lines.map((line, i) => {
      const [name, amountText, unitText, calText, pText, cText, fText] = line.includes('\t') ? line.split('\t') : line.split('|').map(v => v.trim());
      const amount = Number(amountText), calories = Number(calText), protein = Number(pText), carbs = Number(cText), fat = Number(fText);
      if (!name || !unitText || !Number.isFinite(amount) || amount <= 0 || ![calories, protein, carbs, fat].every(value => Number.isFinite(value) && value >= 0)) return { error: `บรรทัด ${i + 1} มีข้อมูลไม่ครบหรือไม่ใช่ตัวเลขบวก` };
      const grams = /^(g|gram|grams|กรัม)$/i.test(unitText);
      const unit = grams ? 'g' : unitText;
      const divisor = grams ? amount : 1;
      return { record: { name: name.trim(), unit, gramsPerUnit: grams ? 1 : null, defaultQuantity: amount, calories: calories / divisor, protein: protein / divisor, carbs: carbs / divisor, fat: fat / divisor, category: guessFoodCategory(name), favorite: false, createdAt: new Date() } };
    });
    const invalid = parsed.find(item => item.error);
    if (invalid) return toast(invalid.error, 'err');
    const identity = item => item.name.trim().toLocaleLowerCase('th').replace(/\s+/g, ' ');
    const existingNames = new Set([...state.customFoods, ...DEFAULT_PRESETS].map(identity));
    const unique = [], seen = new Set(), duplicateNames = [];
    parsed.forEach(({ record }) => { const key = identity(record); if (existingNames.has(key) || seen.has(key)) duplicateNames.push(record.name); else { seen.add(key); unique.push(record); } });
    const records = unique;
    if (!records.length) return toast(`มีเมนูอยู่แล้ว: ${[...new Set(duplicateNames)].slice(0, 4).join(', ')}`, 'err');
    const saveButton = $('#lib-import-save', m.el); saveButton.disabled = true; saveButton.textContent = 'กำลังบันทึก…';
    try {
      const batch = writeBatch(db), collectionRef = userCol(state.uid, 'custom_foods');
      records.forEach(record => batch.set(doc(collectionRef), record));
      await batch.commit();
      m.close(); parentModal.close(); toast(`เพิ่ม ${records.length} เมนูแล้ว${duplicateNames.length ? ` · ข้าม ${duplicateNames.length} เมนูซ้ำ: ${[...new Set(duplicateNames)].slice(0, 3).join(', ')}` : ''}`);
    } catch (error) {
      saveButton.disabled = false; saveButton.textContent = 'บันทึกเข้าคลัง';
      toast('เพิ่มเมนูไม่สำเร็จ: ' + error.message, 'err');
    }
  });
}

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
    if (!name || !unit || cal === null || cal < 0) return toast('กรุณากรอกชื่อ หน่วยบริโภค และแคลอรี่', 'err');
    const ediblePercent = toNum(g('edible').value), gramsPerUnit = toNum(g('grams').value);
    if (ediblePercent !== null && (ediblePercent <= 0 || ediblePercent > 100 || !gramsPerUnit || gramsPerUnit <= 0)) return toast('สัดส่วนที่กินได้ต้องอยู่ระหว่าง 1–100% และต้องระบุน้ำหนักต่อหน่วยด้วย', 'err');
    if (scan && !$('#e-confirm', m.el).checked) return toast('กรุณาติ๊กยืนยันว่าตรวจสอบกับฉลากแล้ว', 'err');
    const key = value => String(value).trim().toLocaleLowerCase('th').replace(/\s+/g, ' ');
    const duplicate = [...state.customFoods.filter(f => f.id !== id), ...DEFAULT_PRESETS].find(f => key(f.name) === key(name));
    if (duplicate) return toast(`มีเมนู “${duplicate.name}” อยู่ในคลังแล้ว`, 'err');
    const rec = { name, brand: g('brand').value.trim(), unit, gramsPerUnit, category: g('category').value, ...(v.defaultQuantity ? { defaultQuantity: v.defaultQuantity } : {}), edibleFraction: ediblePercent === null ? null : ediblePercent / 100, favorite: g('fav').checked };
    EDIT_FIELDS.forEach(([k]) => { rec[k] = toNum(g(k).value); });
    const done = ref => { toast('บันทึกเมนูแล้ว'); if (onSaved) onSaved({ ...rec, id: ref?.id || id }); };
    if (id) { updateDoc(userDoc(state.uid, 'custom_foods', id), { ...rec, updatedAt: new Date() }).catch(e => toast(e.message, 'err')); done(); }
    else { addDoc(userCol(state.uid, 'custom_foods'), { ...rec, createdAt: new Date() }).catch(e => toast(e.message, 'err')); done(); }
    m.close();
  });
}
