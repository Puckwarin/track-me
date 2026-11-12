import { addDoc, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { state, on } from './state.js';
import { watch } from './sync.js';
import { $, $$, esc, localDateStr, numField, round1, toast, openModal, toNum } from './util.js';
import { lookupPer100g, estimateFromPhoto, readNutritionLabel, explainGeminiError } from './nutrition.js';

const GOALS = { cal: 2000, protein: 100, carbs: 200, fat: 60 };
const DEFAULT_PRESETS = [
  { name: 'อกไก่ต้ม', unit: '100 กรัม', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: 'ข้าวสวย', unit: '1 ทัพพี (100 กรัม)', calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { name: 'ไข่ต้ม', unit: '1 ฟอง', calories: 70, protein: 6, carbs: 0.6, fat: 5 },
  { name: 'ฝรั่ง', unit: '120 กรัม', calories: 82, protein: 3.1, carbs: 17.2, fat: 1.2 },
  { name: 'อกไก่ย่าง', unit: '150 กรัม', calories: 220, protein: 45, carbs: 1, fat: 4 },
  { name: 'นมจืดพร่องมันเนย', unit: '250 มล.', calories: 120, protein: 8, carbs: 12, fat: 5 }
];

const label = p => `${p.name}${p.brand ? ' · ' + p.brand : ''} (${p.unit})`;
export const getPresets = () => [
  ...state.customFoods.slice().sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name, 'th')).map(p => ({ ...p, custom: true })),
  ...DEFAULT_PRESETS
];

let root, items = [], base = null;   // base = ค่าต่อ 1 หน่วยของเมนูที่เลือกจากคลัง
const num = v => (typeof v === 'number' ? v : 0);

export function mountFood(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-2 space-y-6">
    <div class="card flex flex-col sm:flex-row justify-between items-center gap-4">
      <div class="flex items-center gap-3">
        <label for="f-date" class="font-semibold text-slate-700"><i class="fa-regular fa-calendar-days text-brand"></i> วันที่:</label>
        <input type="date" id="f-date" class="input !w-auto">
      </div>
      <div class="bg-lav-soft px-4 py-2 rounded-xl text-center">
        <span class="block text-xs text-brand font-medium">แคลอรี่รวมวันนี้</span>
        <span id="f-total" class="text-lg font-bold text-brand-dark">0 / ${GOALS.cal.toLocaleString()}</span>
      </div>
    </div>

    <div class="card space-y-4">
      <div class="flex flex-wrap justify-between items-center gap-2">
        <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-circle-plus text-brand"></i> บันทึกมื้ออาหาร</h2>
        <div class="flex flex-wrap gap-2">
          <button id="f-online" class="chip bg-sky-soft text-blue-700"><i class="fa-solid fa-globe"></i> ค้นหาโภชนาการ</button>
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
          <input type="file" id="f-label" accept="image/*" capture="environment" class="hidden">
          <i class="fa-solid fa-barcode text-xl text-brand"></i>
          <span class="block text-sm font-semibold text-slate-700">ถ่ายรูปฉลากโภชนาการ</span>
          <span class="block text-xs text-slate-500">อ่านค่าจากซอง → ตรวจสอบ → บันทึกเป็นเมนูของฉัน</span>
        </label>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="lbl">มื้อ</label>
          <select id="f-meal" class="input">
            <option>มื้อเช้า</option><option>มื้อกลางวัน</option><option>มื้อเย็น</option><option>ของว่าง/เครื่องดื่ม</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="lbl">ชื่อเมนู (พิมพ์ค้นหาจากคลังได้)</label>
          <input id="f-name" list="f-datalist" class="input" placeholder="เช่น อกไก่ต้ม">
          <datalist id="f-datalist"></datalist>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label class="lbl">จำนวน (หน่วย)</label><input id="f-qty" type="number" step="0.25" min="0" value="1" inputmode="decimal" class="input"></div>
        <div><label class="lbl">แคลอรี่ (kcal)</label><input id="f-cal" type="number" inputmode="decimal" class="input"></div>
        <div><label class="lbl">โปรตีน (g)</label><input id="f-pro" type="number" inputmode="decimal" class="input"></div>
        <div><label class="lbl">คาร์บ (g)</label><input id="f-carb" type="number" inputmode="decimal" class="input"></div>
        <div><label class="lbl">ไขมัน (g)</label><input id="f-fat" type="number" inputmode="decimal" class="input"></div>
        <div><label class="lbl">น้ำตาล (g)</label><input id="f-sugar" type="number" inputmode="decimal" class="input"></div>
        <div><label class="lbl">โซเดียม (mg)</label><input id="f-sodium" type="number" inputmode="decimal" class="input"></div>
      </div>
      <p class="text-xs text-slate-400">ค่าในช่องเป็นค่า "ต่อ 1 หน่วย" ยอดที่บันทึก = ค่า × จำนวน</p>
      <div class="flex justify-end"><button id="f-save" class="btn btn-primary"><i class="fa-solid fa-plus"></i> บันทึกรายการ</button></div>
    </div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-list text-brand"></i> รายการอาหารของวัน</h3>
      <div class="overflow-x-auto"><table class="w-full text-left text-sm">
        <thead class="bg-lav-soft/50 text-slate-600"><tr><th class="p-3">มื้อ</th><th class="p-3">เมนู</th><th class="p-3 text-right">kcal</th><th class="p-3 text-right">โปรตีน</th><th class="p-3 text-center">ลบ</th></tr></thead>
        <tbody id="f-body" class="divide-y divide-slate-100"></tbody>
      </table></div>
    </div>
  </div>

  <div class="space-y-6">
    <div class="card space-y-4">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-chart-pie text-brand"></i> สรุปสารอาหารประจำวัน</h3>
      <div id="f-stats" class="space-y-3"></div>
      <div class="pt-3 border-t border-slate-100">
        <h4 class="text-xs font-bold text-slate-500 mb-2">💡 คำแนะนำจากเกณฑ์ที่ตั้งไว้</h4>
        <div id="f-advice" class="bg-ok-soft/60 p-3 rounded-xl text-xs text-green-900 leading-relaxed"></div>
      </div>
    </div>
  </div>`;

  $('#f-date', root).value = localDateStr();
  $('#f-date', root).addEventListener('change', watchDay);
  $('#f-name', root).addEventListener('input', e => pickByLabel(e.target.value));
  $('#f-save', root).addEventListener('click', saveFood);
  $('#f-online', root).addEventListener('click', openOnlineSearch);
  $('#f-library', root).addEventListener('click', () => openLibrary(p => applyPreset(p)));
  $('#f-photo', root).addEventListener('change', onPhoto);
  $('#f-label', root).addEventListener('change', onLabel);
  $('#f-body', root).addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (b && confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) deleteDoc(userDoc(state.uid, 'food_records', b.dataset.del)).catch(err => toast('ลบไม่สำเร็จ: ' + err.message, 'err'));
  });
  on('customFoods', refreshDatalist);
  refreshDatalist();
  renderDay();
}

export function watchDay() {
  if (!state.uid || !root) return;
  const date = $('#f-date', root).value;
  watch('food', query(userCol(state.uid, 'food_records'), where('date', '==', date)), list => { items = list; renderDay(); });
}

function refreshDatalist() {
  if (!root) return;
  $('#f-datalist', root).innerHTML = getPresets().map(p => `<option value="${esc(label(p))}"></option>`).join('');
}
function pickByLabel(v) { const p = getPresets().find(x => label(x) === v); if (p) applyPreset(p, false); }

function applyPreset(p, setName = true) {
  base = p;
  if (setName) $('#f-name', root).value = label(p);
  $('#f-qty', root).value = 1;
  const set = (id, v) => { $('#' + id, root).value = typeof v === 'number' ? v : ''; };
  set('f-cal', p.calories); set('f-pro', p.protein); set('f-carb', p.carbs); set('f-fat', p.fat); set('f-sugar', p.sugar); set('f-sodium', p.sodium);
}

function saveFood() {
  const name = $('#f-name', root).value.trim();
  const qty = numField(root, 'f-qty') ?? 1;
  const cal = numField(root, 'f-cal');
  if (!name || cal === null) return toast('กรุณากรอกชื่อเมนูและแคลอรี่', 'err');
  if (qty <= 0) return toast('จำนวนต้องมากกว่า 0', 'err');
  const m = v => (v === null ? 0 : round1(v * qty));
  const rec = {
    date: $('#f-date', root).value,
    meal: $('#f-meal', root).value,
    name: qty === 1 ? name : `${name} ×${qty}`,
    calories: Math.round(cal * qty),
    protein: m(numField(root, 'f-pro')), carbs: m(numField(root, 'f-carb')), fat: m(numField(root, 'f-fat')),
    createdAt: new Date()
  };
  const sugar = numField(root, 'f-sugar'), sodium = numField(root, 'f-sodium');
  if (sugar !== null) rec.sugar = round1(sugar * qty);
  if (sodium !== null) rec.sodium = Math.round(sodium * qty);
  // ไม่ await: ตอนออฟไลน์ promise จะไม่จบจนกว่าจะซิงค์ แต่ข้อมูลถูกเก็บในเครื่องและแสดงทันที
  addDoc(userCol(state.uid, 'food_records'), rec).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  ['f-name', 'f-cal', 'f-pro', 'f-carb', 'f-fat', 'f-sugar', 'f-sodium'].forEach(id => { $('#' + id, root).value = ''; });
  $('#f-qty', root).value = 1; base = null;
}

function renderDay() {
  if (!root) return;
  const body = $('#f-body', root);
  body.innerHTML = items.length ? items.map(i => `
    <tr class="hover:bg-lav-soft/30"><td class="p-3 text-xs font-semibold text-brand">${esc(i.meal)}</td>
    <td class="p-3 font-medium text-slate-800">${esc(i.name)}</td>
    <td class="p-3 text-right font-bold text-slate-700">${esc(i.calories)}</td>
    <td class="p-3 text-right text-slate-600">${esc(i.protein)}g</td>
    <td class="p-3 text-center"><button data-del="${esc(i.id)}" class="text-rose-400 hover:text-rose-600 p-1"><i class="fa-solid fa-trash-can text-xs"></i></button></td></tr>`).join('')
    : '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-xs">ยังไม่มีรายการอาหารในวันนี้</td></tr>';

  const sum = k => items.reduce((a, i) => a + num(i[k]), 0);
  const t = { cal: sum('calories'), p: sum('protein'), c: sum('carbs'), f: sum('fat'), sugar: sum('sugar'), na: sum('sodium') };
  $('#f-total', root).textContent = `${Math.round(t.cal)} / ${GOALS.cal.toLocaleString()}`;
  const bar = (name, v, goal, color, unit = 'g') => `
    <div><div class="flex justify-between text-xs font-semibold mb-1"><span>${name}</span><span>${round1(v)} / ${goal}${unit}</span></div>
    <div class="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden"><div class="${color} h-full transition-all" style="width:${Math.min(v / goal * 100, 100)}%"></div></div></div>`;
  $('#f-stats', root).innerHTML = bar('โปรตีน', t.p, GOALS.protein, 'bg-blue-400') + bar('คาร์โบไฮเดรต', t.c, GOALS.carbs, 'bg-violet-400') + bar('ไขมัน', t.f, GOALS.fat, 'bg-pink-400') +
    `<p class="text-xs text-slate-500">น้ำตาล ${round1(t.sugar)} g · โซเดียม ${Math.round(t.na)} mg (เฉพาะรายการที่กรอกค่านี้)</p>`;
  $('#f-advice', root).textContent = t.cal === 0 ? 'ยังไม่มีข้อมูลวันนี้ เริ่มบันทึกมื้อแรกกันเลย!'
    : t.p < 50 ? '⚠️ วันนี้โปรตีนค่อนข้างน้อย ลองเสริมไข่ อกไก่ หรือปลาในมื้อถัดไป'
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
    <div id="os-res" class="mt-3 text-sm text-slate-500">ค่าที่ได้เป็นค่าโดยประมาณจาก Gemini</div>
    <div id="os-calc" class="hidden mt-3 bg-sky-soft/50 rounded-xl p-3 space-y-2">
      <label class="lbl">น้ำหนักที่กิน (กรัม)</label><input id="os-g" type="number" value="100" class="input">
      <p id="os-out" class="text-sm font-semibold text-blue-700"></p>
      <button id="os-import" class="btn btn-primary">นำเข้าฟอร์มบันทึก</button>
    </div>`);
  let cur = null;
  const upd = () => { const g = toNum($('#os-g', m.el).value) || 0; $('#os-out', m.el).textContent = `${Math.round((cur.calories || 0) * g / 100)} kcal`; };
  $('#os-go', m.el).addEventListener('click', async () => {
    const q = $('#os-q', m.el).value.trim(); if (!q) return;
    $('#os-res', m.el).textContent = 'กำลังค้นหา...';
    try {
      cur = await lookupPer100g(q);
      $('#os-res', m.el).innerHTML = `<b>${esc(cur.name)}</b> ต่อ 100g: ${esc(cur.calories)} kcal · โปรตีน ${esc(cur.protein)} · คาร์บ ${esc(cur.carbs)} · ไขมัน ${esc(cur.fat)}`;
      $('#os-calc', m.el).classList.remove('hidden'); upd();
    } catch (err) { $('#os-res', m.el).textContent = explainGeminiError(err); }
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
  toast('กำลังอ่านฉลากโภชนาการ...');
  try {
    const r = await readNutritionLabel(f);
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
  } catch (err) { toast(explainGeminiError(err), 'err'); }
}

// ---------- Custom food library ----------
export function openLibrary(onPick) {
  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">คลังอาหารของฉัน</h3><button data-close class="text-slate-400"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="flex gap-2 mb-3"><input id="lib-q" class="input" placeholder="🔍 ค้นหา..."><button id="lib-add" class="btn btn-primary whitespace-nowrap"><i class="fa-solid fa-plus"></i> เพิ่ม</button></div>
    <div id="lib-list" class="divide-y divide-slate-100"></div>`, { wide: true });
  const render = () => {
    const q = $('#lib-q', m.el).value.toLowerCase();
    $('#lib-list', m.el).innerHTML = getPresets().filter(p => label(p).toLowerCase().includes(q)).map((p, i) => `
      <div class="py-2 flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0"><p class="text-sm font-semibold text-slate-800 truncate">${p.favorite ? '⭐ ' : ''}${esc(label(p))}</p>
        <p class="text-xs text-slate-500">${p.calories} kcal · P ${p.protein ?? '-'} · C ${p.carbs ?? '-'} · F ${p.fat ?? '-'}${p.sugar != null ? ' · น้ำตาล ' + p.sugar : ''}${p.sodium != null ? ' · Na ' + p.sodium : ''}</p></div>
        <div class="flex gap-1 shrink-0">
          <button data-pick="${i}" class="chip bg-ok-soft text-green-800">เลือก</button>
          ${p.custom ? `<button data-fav="${esc(p.id)}" class="chip bg-lav-soft" title="โปรด">${p.favorite ? '★' : '☆'}</button><button data-edit="${esc(p.id)}" class="chip bg-sky-soft text-blue-700">แก้ไข</button><button data-rm="${esc(p.id)}" class="chip bg-pink-soft text-rose-600">ลบ</button>` : ''}
        </div>
      </div>`).join('') || '<p class="text-sm text-slate-400 py-4 text-center">ไม่พบรายการ</p>';
  };
  $('#lib-q', m.el).addEventListener('input', render);
  $('#lib-add', m.el).addEventListener('click', () => openFoodEditor({}));
  m.el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const list = getPresets().filter(p => label(p).toLowerCase().includes($('#lib-q', m.el).value.toLowerCase()));
    if (b.dataset.pick !== undefined) { onPick(list[+b.dataset.pick]); m.close(); }
    else if (b.dataset.edit) openFoodEditor({ id: b.dataset.edit, prefill: state.customFoods.find(f => f.id === b.dataset.edit) });
    else if (b.dataset.fav) { const f = state.customFoods.find(x => x.id === b.dataset.fav); updateDoc(userDoc(state.uid, 'custom_foods', f.id), { favorite: !f.favorite }); }
    else if (b.dataset.rm && confirm('ลบเมนูนี้ออกจากคลัง?')) deleteDoc(userDoc(state.uid, 'custom_foods', b.dataset.rm));
  });
  on('customFoods', () => m.el.isConnected && render());
  render();
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
      <div><label class="lbl">ยี่ห้อ</label><input id="e-brand" class="input" value="${esc(v.brand || '')}"></div>
      <div><label class="lbl">หน่วยบริโภค * (เช่น 1 ซอง, 100 กรัม)</label><input id="e-unit" class="input ${scan && !v.unit ? 'border-amber-400 bg-amber-50' : ''}" value="${esc(v.unit || '')}"></div>
      <div><label class="lbl">น้ำหนักต่อ 1 หน่วย (กรัม/มล.)</label><input id="e-grams" type="number" class="input" value="${v.gramsPerUnit ?? ''}"></div>
      <div></div>
      ${EDIT_FIELDS.map(([k, t]) => `<div><label class="lbl">${t}${k === 'calories' ? ' *' : ''}</label><input id="e-${k}" type="number" step="0.1" inputmode="decimal" class="input ${warn(k)}" value="${v[k] ?? ''}"></div>`).join('')}
    </div>
    <label class="flex items-center gap-2 mt-3 text-sm"><input id="e-fav" type="checkbox" ${v.favorite ? 'checked' : ''}> ⭐ เมนูโปรด</label>
    ${scan && scan.basis === 'per_100g' && scan.servingGrams ? `<button id="e-convert" class="btn btn-soft mt-3 text-xs">แปลงเป็นค่าต่อ 1 หน่วยบริโภค (${scan.servingGrams} g)</button>` : ''}
    ${scan ? `<label class="flex items-start gap-2 mt-3 text-sm bg-ok-soft/60 rounded-lg p-2"><input id="e-confirm" type="checkbox" class="mt-1"> ฉันตรวจตัวเลขกับฉลากจริงแล้ว และถูกต้อง</label>` : ''}
    <div class="flex justify-end gap-2 mt-4"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="e-save" class="btn btn-primary">บันทึกเมนู</button></div>`, { wide: true });

  const g = k => $('#e-' + k, m.el);
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
    if (scan && !$('#e-confirm', m.el).checked) return toast('กรุณาติ๊กยืนยันว่าตรวจสอบกับฉลากแล้ว', 'err');
    const rec = { name, brand: g('brand').value.trim(), unit, gramsPerUnit: toNum(g('grams').value), favorite: g('fav').checked };
    EDIT_FIELDS.forEach(([k]) => { rec[k] = toNum(g(k).value); });
    const done = ref => { toast('บันทึกเมนูแล้ว'); if (onSaved) onSaved({ ...rec, id: ref?.id || id }); };
    if (id) { updateDoc(userDoc(state.uid, 'custom_foods', id), { ...rec, updatedAt: new Date() }).catch(e => toast(e.message, 'err')); done(); }
    else { addDoc(userCol(state.uid, 'custom_foods'), { ...rec, createdAt: new Date() }).catch(e => toast(e.message, 'err')); done(); }
    m.close();
  });
}
