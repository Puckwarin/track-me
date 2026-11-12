import { addDoc, setDoc, updateDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state, on } from './state.js';
import { watch } from './sync.js';
import { $, $$, esc, localDateStr, numField, round1, toast, openModal, toNum } from './util.js';
import { lookupPer100g, estimateFromPhoto, readNutritionLabel, explainGeminiError } from './nutrition.js';

const GOALS = { cal: 2000, protein: 100, carbs: 200, fat: 60 };
const MEAL_ORDER = ['มื้อเช้า', 'มื้อกลางวัน', 'มื้อเย็น', 'ของว่าง/เครื่องดื่ม'];
const MEAL_COLORS = {
  'มื้อเช้า': { header: 'bg-amber-100 text-amber-900', row: 'bg-amber-50/60', icon: 'fa-sun' },
  'มื้อกลางวัน': { header: 'bg-sky-100 text-sky-900', row: 'bg-sky-50/60', icon: 'fa-cloud-sun' },
  'มื้อเย็น': { header: 'bg-violet-100 text-violet-900', row: 'bg-violet-50/60', icon: 'fa-moon' },
  'ของว่าง/เครื่องดื่ม': { header: 'bg-pink-100 text-pink-900', row: 'bg-pink-50/60', icon: 'fa-mug-hot' }
};
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
          <button id="f-hiwpinto" class="chip bg-amber-100 text-amber-900"><i class="fa-solid fa-calculator"></i> คำนวณ Hiwpinto / อาหารคลีน</button>
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
        <thead class="bg-lav-soft/50 text-slate-600"><tr><th class="p-3">เมนู</th><th class="p-3 text-right">kcal</th><th class="p-3 text-right">โปรตีน</th><th class="p-3 text-center">ลบ</th></tr></thead>
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
  $('#f-hiwpinto', root).addEventListener('click', () => openHiwpintoCalculator());
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
  const meals = [...MEAL_ORDER, ...new Set(items.map(i => i.meal || 'ไม่ระบุมื้อ').filter(m => !MEAL_ORDER.includes(m)))];
  body.innerHTML = items.length ? meals.map(meal => {
    const rows = items.filter(i => (i.meal || 'ไม่ระบุมื้อ') === meal);
    if (!rows.length) return '';
    const tone = MEAL_COLORS[meal] || { header: 'bg-slate-100 text-slate-700', row: 'bg-slate-50/60', icon: 'fa-utensils' };
    const mealCalories = rows.reduce((sum, i) => sum + num(i.calories), 0);
    return `<tr class="${tone.header}"><th colspan="4" class="p-2.5 text-left">
      <div class="flex items-center justify-between gap-2"><span><i class="fa-solid ${tone.icon} mr-1.5"></i>${esc(meal)}</span><span class="text-xs font-medium">${rows.length} รายการ · ${Math.round(mealCalories)} kcal</span></div>
    </th></tr>` + rows.map(i => `
      <tr class="${tone.row} hover:bg-white/80"><td class="p-3 font-medium text-slate-800">${esc(i.name)}</td>
      <td class="p-3 text-right font-bold text-slate-700">${esc(i.calories)}</td>
      <td class="p-3 text-right text-slate-600">${esc(i.protein)}g</td>
      <td class="p-3 text-center"><button data-del="${esc(i.id)}" class="text-rose-400 hover:text-rose-600 p-1" aria-label="ลบ ${esc(i.name)}"><i class="fa-solid fa-trash-can text-xs"></i></button></td></tr>`).join('');
  }).join('')
    : '<tr><td colspan="4" class="p-4 text-center text-slate-400 text-xs">ยังไม่มีรายการอาหารในวันนี้</td></tr>';

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
    <div id="lib-bulk" class="flex flex-wrap items-center justify-between gap-2 mb-2 rounded-xl bg-slate-50 p-2 text-sm">
      <label class="flex items-center gap-2"><input id="lib-select-visible" type="checkbox"> เลือกเมนูของฉันที่แสดง (<span id="lib-visible-count">0</span>)</label>
      <button id="lib-delete-selected" class="btn btn-pink !px-3 !py-2 text-xs" disabled>ลบที่เลือก (<span id="lib-selected-count">0</span>)</button>
    </div>
    <div id="lib-list" class="divide-y divide-slate-100"></div>`, { wide: true });
  const selected = new Set();
  const visibleCustom = () => getPresets().filter(p => p.custom && label(p).toLowerCase().includes($('#lib-q', m.el).value.toLowerCase()));
  const render = () => {
    const q = $('#lib-q', m.el).value.toLowerCase();
    const presets = getPresets().filter(p => label(p).toLowerCase().includes(q));
    const custom = presets.filter(p => p.custom);
    const allVisibleSelected = custom.length > 0 && custom.every(p => selected.has(p.id));
    $('#lib-select-visible', m.el).checked = allVisibleSelected;
    $('#lib-select-visible', m.el).disabled = custom.length === 0;
    $('#lib-visible-count', m.el).textContent = custom.length;
    $('#lib-selected-count', m.el).textContent = selected.size;
    $('#lib-delete-selected', m.el).disabled = selected.size === 0;
    $('#lib-list', m.el).innerHTML = presets.map((p, i) => `
      <div class="food-library-item py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div class="min-w-0 flex items-start gap-2">${p.custom ? `<input type="checkbox" class="lib-select mt-1 shrink-0" data-select="${esc(p.id)}" aria-label="เลือก ${esc(label(p))}" ${selected.has(p.id) ? 'checked' : ''}>` : ''}<div class="min-w-0"><p class="text-sm font-semibold text-slate-800">${p.favorite ? '⭐ ' : ''}${esc(label(p))}</p>
        <p class="text-xs text-slate-500">${p.calories} kcal · P ${p.protein ?? '-'} · C ${p.carbs ?? '-'} · F ${p.fat ?? '-'}${p.sugar != null ? ' · น้ำตาล ' + p.sugar : ''}${p.sodium != null ? ' · Na ' + p.sodium : ''}</p></div>
        </div><div class="flex flex-wrap gap-1 sm:shrink-0">
          <button data-pick="${i}" class="chip bg-ok-soft text-green-800">เลือก</button>
          ${p.custom ? `${p.hiwpinto ? `<button data-hp="${esc(p.id)}" class="chip bg-amber-100 text-amber-900">ปรับข้าว</button>` : ''}<button data-fav="${esc(p.id)}" class="chip bg-lav-soft" title="โปรด">${p.favorite ? '★' : '☆'}</button><button data-edit="${esc(p.id)}" class="chip bg-sky-soft text-blue-700">แก้ไข</button><button data-rm="${esc(p.id)}" class="chip bg-pink-soft text-rose-600">ลบ</button>` : ''}
        </div>
      </div>`).join('') || '<p class="text-sm text-slate-400 py-4 text-center">ไม่พบรายการ</p>';
  };
  $('#lib-q', m.el).addEventListener('input', render);
  $('#lib-add', m.el).addEventListener('click', () => openFoodEditor({}));
  $('#lib-select-visible', m.el).addEventListener('change', e => {
    visibleCustom().forEach(p => e.target.checked ? selected.add(p.id) : selected.delete(p.id));
    render();
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
    const list = getPresets().filter(p => label(p).toLowerCase().includes($('#lib-q', m.el).value.toLowerCase()));
    if (b.dataset.pick !== undefined) { onPick(list[+b.dataset.pick]); m.close(); }
    else if (b.dataset.hp) openHiwpintoCalculator(state.customFoods.find(f => f.id === b.dataset.hp));
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
