import { addDoc, updateDoc, writeBatch, doc } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state, on, emit } from './state.js';
import { $, $$, esc, localDateStr, addDays, mondayOf, numField, round1, toast, openModal, toNum } from './util.js';
import { iconSvg } from './icons.js';
import { animateNumberTicker, bindChartInspector } from './ui.js';
import { buildMealDonutParts, DONUT_TOOLTIP_HINT } from './donutChart.js';
import { analyzeFoodImage, isLocalNutritionSufficient, readNutritionLabelLocally, explainGeminiError, runImageBatch, formatImageProgress } from './nutrition.js';
import { openFoodSearch, detectBarcode, barcodeOff } from './foodsearch.js';
import { openHiwpintoSync } from './hiwpinto.js';
import { getMeals, getTargets } from './profile.js';
import { guessFoodCategory, parseBulkFoodText } from './foodParser.js';
import { DEFAULT_PRESETS, MEAL_ORDER, MEAL_ICONS, BUILTIN_FAV_KEY, HIDDEN_BUILTINS_KEY, builtinFavorites, categoryNames, getPresets, gramsInUnit, hiddenBuiltins, label } from './foodConstants.js';
import {
  buildFoodAdvice,
  calculateRiceAdjustment,
  buildFoodRecordUpdatesFromLibrary,
  buildMealCaloriePieData,
  canWeigh,
  defaultFoodInputMode,
  foodLogName,
  foodLogPortion,
  foodLogQuantity,
  foodQuantityFromInput,
  fmtAmount,
  getMealPiePalette,
  hasFoodLibraryDefinitionChanged,
  isGramUnitLabel,
  riceProfileFromName,
  unitNutritionFor
} from './foodCalculations.js';
import { validateFoodLog } from './foodValidation.js';
import { addCustomFood, addFoodRecord, deleteCustomFood, deleteFoodRecord, getFoodRecordsInRange, updateCustomFood, updateFoodRecord, watchFoodRecords } from './foodService.js';
import { guardPreviewWrite, isPreviewMode } from './preview.js';
import { openFoodEditor } from './foodEditor.js';
import { openFoodHistorySearch } from './foodHistory.js';
export { guessFoodCategory };
export { openFoodEditor, openFoodHistorySearch };
export { getPresets } from './foodConstants.js';

let root, items = [], base = null;   // base = ค่าต่อ 1 หน่วยของเมนูที่เลือกจากคลัง
let lastCustomFoodsSnapshot = new Map();
let lastTrackedUid = null;
const selectedFoodIds = new Set();
const num = v => (typeof v === 'number' ? v : 0);

export function mountFood(el) {
  root = el;
  root.innerHTML = `
  <div class="md:col-span-2 space-y-4">
    <section class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-semibold text-slate-600">วันที่บันทึก</span>
        <input type="date" id="f-date" class="input !w-auto ml-auto min-h-[44px]" aria-label="เลือกวันที่">
      </div>
      <div id="f-week-strip" class="tm-week-strip" role="group" aria-label="เลือกวันที่แบบเลื่อนซ้ายขวา"></div>
      <div class="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 lg:gap-6 items-center">
        <div class="min-w-0 space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1 space-y-0.5">
              <span id="f-daylabel" class="block text-xs text-slate-500 font-medium">แคลอรี่รวมวันนี้</span>
              <div id="f-total" class="text-xl font-bold text-slate-800 tabular-nums">กำลังโหลด...</div>
              <div id="f-remain" class="text-xs text-slate-600 tabular-nums"></div>
            </div>
            <span id="f-ring-pct" class="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full bg-slate-50 text-xs font-bold text-slate-700 tabular-nums border border-slate-200">0%</span>
          </div>
          <div class="tm-progress-track" aria-hidden="true"><div id="f-cal-bar" class="tm-progress-fill" style="width:0%"></div></div>
          <div id="f-macro-strip" class="grid grid-cols-2 sm:grid-cols-4 gap-2"></div>
        </div>
        <div id="f-pie-wrap" class="space-y-2.5 lg:border-l lg:border-slate-200 lg:pl-5">
          <div id="f-meals-pie" class="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div id="f-meals-pie-svg" class="tm-donut-col shrink-0"></div>
            <div id="f-meals" class="w-full space-y-1 min-w-0"></div>
          </div>
          <div id="f-pie-readout-slot"></div>
        </div>
      </div>
    </section>

    <fieldset class="tm-seg tm-seg--2">
      <legend class="sr-only">เลือกมุมมองอาหาร</legend>
      <input id="f-view-log" type="radio" name="food-view" value="log" class="sr-only" checked>
      <label for="f-view-log" class="tm-seg-btn min-h-[44px]">บันทึกอาหาร</label>
      <input id="f-view-summary" type="radio" name="food-view" value="summary" class="sr-only">
      <label for="f-view-summary" class="tm-seg-btn min-h-[44px]">สรุปโภชนาการ</label>
    </fieldset>

    <section id="f-log-panel" aria-labelledby="f-view-log">
      <div class="tm-food-log-grid">
        <div class="card space-y-4">
          <div class="flex flex-wrap justify-between items-center gap-2">
            <h2 class="text-lg font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('circle-plus', { size: 19, className: 'text-brand' })}<span>บันทึกมื้ออาหาร</span></h2>
            <details id="f-tools-menu" class="relative">
              <summary class="chip bg-slate-50 border border-slate-200 text-slate-700 min-h-[44px] px-3.5 whitespace-nowrap list-none cursor-pointer">${iconSvg('ellipsis', { size: 15 })} เครื่องมือเพิ่มเติม</summary>
              <div class="tm-tools-menu absolute right-0 top-full z-20 mt-2 flex min-w-56 flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                <button id="f-bulk-log" type="button" class="chip tm-tool-button justify-start min-h-[44px]">${iconSvg('zap', { size: 15 })} เพิ่มหลายเมนู</button>
                <button id="f-online" type="button" class="chip tm-tool-button justify-start min-h-[44px]">${iconSvg('globe', { size: 15 })} ค้นหาโภชนาการ</button>
                <button id="f-hiwpinto-sync" type="button" class="chip tm-tool-button justify-start min-h-[44px]">${iconSvg('cloud-download', { size: 15 })} Sync Hiwpinto</button>
                <button id="f-library" type="button" class="chip tm-tool-button justify-start min-h-[44px]">${iconSvg('book', { size: 15 })} คลังอาหาร</button>
              </div>
            </details>
          </div>

          <div class="space-y-1.5">
            <label class="border border-dashed border-slate-300 bg-slate-50 hover:bg-white rounded-xl p-3.5 text-center cursor-pointer block transition min-h-[44px]">
              <input type="file" id="f-scan" accept="image/*" multiple class="hidden">
              <span class="inline-flex text-brand">${iconSvg('camera', { size: 22 })}</span>
              <span class="block text-sm font-semibold text-slate-800 mt-1">สแกนอาหาร ฉลาก หรือบาร์โค้ด (เลือกได้หลายรูป)</span>
              <span class="block text-xs text-slate-500 mt-0.5">อ่านบาร์โค้ดและฉลากในเครื่องก่อน ใช้ AI เฉพาะจานอาหารหรือรูปที่อ่านไม่ชัด</span>
            </label>
            <p id="f-scan-status" class="hidden text-xs font-medium px-1" aria-live="polite"></p>
          </div>
          <div id="f-photo-lib-bar" class="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span id="f-photo-lib-text" class="text-slate-700 font-medium"></span>
            <button id="f-photo-lib-btn" type="button" class="btn btn-ghost min-h-[44px] px-3 py-1.5 text-xs">${iconSvg('bookmark', { size: 14 })} บันทึกลงคลังอาหาร</button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="lbl" for="f-meal">มื้อ</label>
              <select id="f-meal" class="input min-h-[44px]"></select>
            </div>
            <div class="sm:col-span-2">
              <label class="lbl" for="f-name">ชื่อเมนู (พิมพ์ค้นหาจากคลังได้)</label>
              <div class="tm-combobox">
                <input id="f-name" class="input min-h-[44px]" placeholder="เช่น อกไก่ต้ม" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="f-name-listbox" autocomplete="off">
                <div id="f-name-listbox" role="listbox" class="tm-combobox-list hidden" aria-label="เมนูอาหารแนะนำ"></div>
              </div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button id="f-copy-meal" type="button" class="btn btn-ghost min-h-[44px] px-3.5 py-2 text-xs">${iconSvg('copy', { size: 14 })} คัดลอกจากมื้อเดิม</button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div id="f-qty-wrap" class="col-span-2">
              <label id="f-qty-label" class="lbl" for="f-qty">จำนวน (หน่วย)</label>
              <div class="flex items-center gap-2">
                <input id="f-qty" type="number" step="0.01" min="0" value="1" inputmode="decimal" class="input min-w-0 flex-1 min-h-[44px]">
                <select id="f-qty-mode" class="input !w-auto shrink-0 hidden min-h-[44px]" aria-label="หน่วยที่กรอก">
                  <option value="unit">หน่วย</option>
                  <option value="grams">กรัม (g)</option>
                </select>
              </div>
              <p id="f-preview" class="mt-1 text-xs text-slate-500" aria-live="polite"></p>
            </div>
            <div id="f-gross-wrap" class="hidden col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label class="lbl" for="f-gross">น้ำหนักที่ชั่งรวม (g)</label><input id="f-gross" type="number" min="0" step="1" inputmode="decimal" class="input min-h-[44px]" placeholder="เช่น 180"></div>
              <div><label class="lbl" for="f-edible">สัดส่วนที่กินได้ (%)</label><input id="f-edible" type="number" min="1" max="100" step="1" inputmode="decimal" class="input min-h-[44px]"></div>
              <p id="f-edible-note" class="sm:col-span-2 text-xs text-slate-500"></p>
            </div>
            <div><label class="lbl" for="f-cal">แคลอรี่ (kcal)</label><input id="f-cal" type="number" inputmode="decimal" class="input min-h-[44px]"></div>
            <div><label class="lbl" for="f-pro">โปรตีน (g)</label><input id="f-pro" type="number" inputmode="decimal" class="input min-h-[44px]"></div>
            <div><label class="lbl" for="f-carb">คาร์บ (g)</label><input id="f-carb" type="number" inputmode="decimal" class="input min-h-[44px]"></div>
            <div><label class="lbl" for="f-fat">ไขมัน (g)</label><input id="f-fat" type="number" inputmode="decimal" class="input min-h-[44px]"></div>
            <div id="f-sugar-wrap" class="hidden"><label class="lbl" for="f-sugar">น้ำตาล (g)</label><input id="f-sugar" type="number" inputmode="decimal" class="input min-h-[44px]"></div>
            <div id="f-sodium-wrap" class="hidden"><label class="lbl" for="f-sodium">โซเดียม (mg)</label><input id="f-sodium" type="number" inputmode="decimal" class="input min-h-[44px]"></div>
          </div>

          <div class="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-end gap-2 pt-1">
            <button id="f-clear" type="button" class="btn btn-ghost min-h-[44px] justify-center">เคลียร์ค่า</button>
            <button id="f-save-lib" type="button" class="btn btn-soft min-h-[44px] justify-center">${iconSvg('bookmark', { size: 15 })} ลงคลัง</button>
            <button id="f-save" type="button" class="btn btn-primary col-span-2 min-h-[44px] justify-center">${iconSvg('plus', { size: 15 })} บันทึกรายการ</button>
          </div>
        </div>

        <div class="card space-y-3 min-w-0">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('list', { size: 17, className: 'text-brand' })}<span>รายการอาหารของวัน</span></h3>
            <button id="f-hist-search" type="button" class="btn btn-ghost min-h-[44px] px-3.5 py-2 text-xs">${iconSvg('search', { size: 14 })} ประวัติอาหาร</button>
          </div>
          <div id="f-bulk-bar" class="hidden rounded-xl bg-slate-50 border border-slate-200 p-2.5 flex flex-wrap items-center gap-2 text-xs">
            <label class="inline-flex items-center gap-2 min-h-[44px] px-1 cursor-pointer font-medium text-slate-700"><input id="f-sel-all" type="checkbox" class="w-4 h-4 accent-violet-500"> เลือกทั้งหมด</label>
            <span class="text-slate-500">เลือกแล้ว <b id="f-sel-count">0</b></span>
            <select id="f-bulk-meal" class="input !w-auto min-h-[44px] !py-1.5 !px-2.5 text-xs ml-auto" aria-label="มื้อปลายทาง"></select>
            <button id="f-bulk-move" type="button" class="btn btn-ghost min-h-[44px] px-3 py-1.5 text-xs font-semibold" disabled>${iconSvg('swap', { size: 14 })} ย้ายไปมื้อนี้</button>
          </div>
          <div id="f-drag-targets" class="tm-drag-drop-bar hidden" aria-label="วางเพื่อย้ายไปมื้ออื่น"></div>
          <div id="f-body" class="space-y-3"></div>
          <p id="f-swipe-hint" class="hidden lg:hidden text-[11px] text-slate-400">ปัดซ้ายเพื่อแก้ไข/ลบ · ปัดขวาเพื่อบันทึกโปรด · ลากที่ไอคอน ⠿ เพื่อย้ายมื้อ</p>
        </div>
      </div>
    </section>

    <section id="f-summary-panel" aria-labelledby="f-view-summary" class="space-y-4">
      <div class="card space-y-3">
        <header class="flex flex-wrap items-center justify-between gap-2">
          <div><h2 class="text-lg font-bold text-slate-800">ภาพรวมสารอาหาร</h2><p class="text-xs text-slate-500">เทียบปริมาณที่บันทึกกับเป้าหมายในวันที่เลือก</p></div>
          <p id="f-burn" class="hidden text-xs text-slate-600 tabular-nums"></p>
        </header>
        <div id="f-stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"></div>
      </div>
      <div class="card space-y-3">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('lightbulb', { size: 17, className: 'text-brand' })}<span>คำแนะนำจากเกณฑ์ที่ตั้งไว้</span></h3>
        <div id="f-advice" class="p-3.5 rounded-xl text-xs leading-relaxed"></div>
      </div>
    </section>
  </div>`;

  $('#f-date', root).value = localDateStr();
  fillMealSelect();
  $('#f-date', root).addEventListener('change', watchDay);
  setupFoodCombobox();
  $('#f-week-strip', root).addEventListener('click', e => {
    const b = e.target.closest('[data-strip-day]');
    if (!b) return;
    $('#f-date', root).value = b.dataset.stripDay;
    watchDay();
  });
  $('#f-qty', root).addEventListener('input', updateFoodPreview);
  $('#f-qty-mode', root).addEventListener('change', () => { syncFoodWeightForm(); updateFoodPreview(); });
  const focusMealLogForm = mealName => {
    const logRadio = $('#f-view-log', root);
    if (logRadio) logRadio.checked = true;
    const mealSel = $('#f-meal', root);
    if (mealSel && mealName) {
      const opt = [...mealSel.options].find(o => o.value === mealName || o.textContent === mealName);
      if (opt) mealSel.value = opt.value;
    }
    const nameInput = $('#f-name', root);
    if (nameInput) {
      nameInput.focus();
      nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  $('#f-meals', root).addEventListener('click', e => {
    const b = e.target.closest('[data-meal]');
    if (b) focusMealLogForm(b.dataset.meal);
  });
  ['f-cal','f-pro','f-carb','f-fat','f-sugar','f-sodium'].forEach(id => $('#'+id,root).addEventListener('input', updateFoodPreview));
  $('#f-clear', root).addEventListener('click', clearFoodForm);
  $('#f-copy-meal', root).addEventListener('click', copyRecentMeal);
  $('#f-edible', root).addEventListener('input', updateEdibleEstimate);
  $('#f-gross', root).addEventListener('input', updateEdibleEstimate);
  $('#f-save', root).addEventListener('click', saveFood);
  window.addEventListener('trackme:ai-fallback', e => toast('โควตา/การเชื่อมต่อของ AI หลักใช้ไม่ได้ จึงสลับไปใช้ '+e.detail.provider));
  const toolsMenu = $('#f-tools-menu', root);
  if (toolsMenu) {
    toolsMenu.addEventListener('click', e => {
      if (e.target.closest('button')) toolsMenu.open = false;
    });
    document.addEventListener('click', e => {
      if (toolsMenu.open && !toolsMenu.contains(e.target)) toolsMenu.open = false;
    });
  }
  $('#f-bulk-log', root).addEventListener('click', () => openQuickBulkFoodLog());
  $('#f-online', root).addEventListener('click', () => openFoodSearchModal());
  $('#f-library', root).addEventListener('click', () => openLibrary(p => applyPreset(p)));
  $('#f-hist-search', root).addEventListener('click', openFoodHistorySearch);
  $('#f-save-lib', root).addEventListener('click', saveCurrentToLibrary);
  $('#f-photo-lib-btn', root).addEventListener('click', saveCurrentToLibrary);
  $('#f-hiwpinto-sync', root).addEventListener('click', () => openHiwpintoSync());
  $('#f-scan', root).addEventListener('change', onUnifiedScan);
  $('#f-sel-all', root).addEventListener('change', e => {
    items.forEach(i => { if (e.target.checked) selectedFoodIds.add(i.id); else selectedFoodIds.delete(i.id); });
    renderDay();
  });
  $('#f-bulk-move', root).addEventListener('click', bulkMoveFoodMeal);
  $('#f-body', root).addEventListener('change', e => {
    const mealChk = e.target.closest('[data-meal-sel]');
    if (mealChk) {
      const mealName = mealChk.dataset.mealSel;
      items.filter(i => (i.meal || 'ไม่ระบุมื้อ') === mealName).forEach(i => {
        if (mealChk.checked) selectedFoodIds.add(i.id);
        else selectedFoodIds.delete(i.id);
      });
      renderDay();
      return;
    }
    const chk = e.target.closest('[data-food-sel]');
    if (!chk) return;
    if (chk.checked) selectedFoodIds.add(chk.dataset.foodSel);
    else selectedFoodIds.delete(chk.dataset.foodSel);
    renderDay();
  });
  $('#f-body', root).addEventListener('click', e => {
    const addMeal = e.target.closest('[data-add-meal]');
    if (addMeal) return focusMealLogForm(addMeal.dataset.addMeal);
    const favBtn = e.target.closest('[data-fav-log]');
    if (favBtn) return void toggleFoodRecordFavorite(favBtn.dataset.favLog);
    const edit = e.target.closest('[data-edit-log]');
    if (edit) return editFoodQuantity(edit.dataset.editLog);
    const b = e.target.closest('[data-del]');
    if (b && confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) {
      selectedFoodIds.delete(b.dataset.del);
      deleteFoodRecord(state.uid, b.dataset.del).catch(err => toast('ลบไม่สำเร็จ: ' + err.message, 'err'));
    }
  });
  setupFoodBodyGestures();
  lastTrackedUid = state.uid;
  lastCustomFoodsSnapshot = new Map((state.customFoods || []).map(f => [f.id, { ...f }]));
  on('customFoods', handleCustomFoodsUpdate);
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
function riceFromName(name) {
  const last = name.match(/\(([^()]*)\)\s*$/)?.[1] || '';
  const mentionsRice = /ข้าว|rice|ไรซ์|กล้อง/i.test(last);
  return { included: mentionsRice, profile: riceProfileFromName(last) };
}

function openHiwpintoCalculator(saved = null) {
  const meta = saved?.hiwpinto || {};
  const initialName = saved?.name || '';
  const detected = riceFromName(initialName);
  const shop = saved ? {
    calories: Number.isFinite(meta.shopCalories) ? meta.shopCalories : '',
    protein: Number.isFinite(meta.shopProtein) ? meta.shopProtein : '',
    carbs: Number.isFinite(meta.shopCarbs) ? meta.shopCarbs : '',
    fat: Number.isFinite(meta.shopFat) ? meta.shopFat : ''
  } : {};
  const missingOriginalNutrition = Boolean(saved) && ['shopCalories', 'shopProtein', 'shopCarbs', 'shopFat']
    .some(key => !Number.isFinite(meta[key]));
  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">คำนวณเมนู Hiwpinto / อาหารคลีน</h3><button data-close class="text-slate-400" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <p class="text-xs text-slate-600 mb-3">คำนวณข้าวที่ต้องเพิ่มจากคาร์บของร้านและโปรไฟล์ข้าวที่เลือก ค่าประมาณอาจรวมคาร์บจากซอส ผัก หรือการหมักด้วย</p>
    ${missingOriginalNutrition ? '<p class="text-sm text-amber-900 bg-amber-50 rounded-lg p-2 mb-3">รายการเก่านี้ไม่มีโภชนาการจากร้านแยกครบ กรุณาตรวจสอบและกรอกค่าต้นฉบับจากร้านก่อนบันทึก เพื่อป้องกันการคำนวณซ้ำ</p>' : ''}
    ${!saved ? `<label class="lbl">ลองเติมตัวอย่างที่ให้มา</label><select id="hp-sample" class="input mb-3"><option value="">กรอกข้อมูลเอง</option>${HIWPINTO_SAMPLES.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select>` : ''}
    <div class="space-y-3">
      <div><label class="lbl">ชื่อเมนู *</label><input id="hp-name" class="input" value="${esc(initialName)}" placeholder="ระบุชื่อเมนูและตัวเลือกในวงเล็บ"></div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${[['calories','kcal'],['protein','P (g)'],['carbs','C (g)'],['fat','F (g)']].map(([k,t])=>`<div><label class="lbl">${t} จากร้าน *</label><input id="hp-shop-${k}" type="number" min="0" step="0.1" class="input" value="${shop[k] ?? ''}"></div>`).join('')}
      </div>
      <label class="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-sm"><input id="hp-has-rice" type="checkbox" class="mt-1" ${saved ? (meta.includedRice ? 'checked' : '') : (detected.included ? 'checked' : '')}> ค่าจากร้านรวมข้าวอยู่แล้ว (ตรวจวงเล็บท้ายสุดของชื่อเมนู)</label>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="lbl">ชนิดข้าว</label><select id="hp-rice-type" class="input"><option value="white">ข้าวขาว/ข้าวไรซ์</option><option value="brown">ข้าวไรซ์/ข้าวกล้อง (โปรไฟล์เดิม)</option><option value="riceberry">ข้าวไรซ์เบอร์รี่ (ค่าอ้างอิงชั่วคราว)</option></select></div>
        <div><label class="lbl">ข้าวที่ต้องการคำนวณ</label><select id="hp-rice-g" class="input"><option value="180" ${saved ? (meta.riceGrams === 180 || !meta.riceGrams ? 'selected' : '') : 'selected'}>180 กรัม (มาตรฐาน)</option><option value="140" ${saved && meta.riceGrams === 140 ? 'selected' : ''}>140 กรัม</option></select></div>
      </div>
      <div id="hp-side-wrap"><label class="lbl" for="hp-side-carb">คาร์บจากกับข้าวที่ทราบ (ไม่บังคับ, g)</label><input id="hp-side-carb" type="number" min="0" step="0.5" class="input" value="${meta.sideCarbs ?? ''}" placeholder="ถ้าระบุ ระบบจะหักจากคาร์บที่ใช้ประมาณข้าว"><p class="text-xs text-slate-500 mt-1">ถ้าไม่ระบุ จะใช้คาร์บรวมจากร้านประมาณน้ำหนักข้าว และผลอาจคลาดเคลื่อนเพราะคาร์บอาจมาจากซอส ผัก หรือการหมักด้วย</p></div>
      <div id="hp-result" class="rounded-xl bg-slate-50 p-3 text-sm" aria-live="polite"></div>
      <div class="flex justify-end gap-2"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="hp-save" class="btn btn-primary" disabled>${saved ? 'บันทึกการปรับปรุง' : 'บันทึกเมนูไว้ใช้ซ้ำ'}</button></div>
    </div>`, { wide: true });

  const $m = s => $(s, m.el);
  if (saved) {
    $m('#hp-rice-type').value = ['white', 'brown', 'riceberry'].includes(meta.riceProfile) ? meta.riceProfile : detected.profile;
    $m('#hp-rice-g').value = String(meta.riceGrams || 180);
  }
  else $m('#hp-rice-type').value = detected.profile;

  const calculate = () => {
    const included = $m('#hp-has-rice').checked;
    $m('#hp-side-wrap').classList.toggle('hidden', !included);
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
    const targetG = Number($m('#hp-rice-g').value);
    const adjustment = calculateRiceAdjustment({
      shopNutrition: { calories: shopCal, protein: p, carbs: shopC, fat: f },
      riceProfile: $m('#hp-rice-type').value,
      targetRiceGrams: targetG,
      sideCarbs: sideC,
      includedRice: included
    });
    if (!adjustment.valid) return bad(adjustment.error);
    const out = adjustment.nutrition;
    if (!included) {
      result.innerHTML = `<p class="font-semibold">โภชนาการจากร้าน: ${Math.round(out.calories)} kcal · P ${round1(out.protein)} · C ${round1(out.carbs)} · F ${round1(out.fat)}</p><p class="text-amber-800 mt-1">ไม่ได้ระบุว่าค่าร้านรวมข้าว จึงเก็บค่าร้านตามเดิมและไม่เพิ่มข้าว</p><p class="mt-1">${esc(kcalWarn)}</p>`;
      save.disabled = false;
      return { ...out, estimatedRiceGrams: null, additionalRiceGrams: 0, kcalWarn };
    }
    const outCal = Math.round(out.calories), outP=round1(out.protein), outC=round1(out.carbs), outF=round1(out.fat);
    const outMacroCal = 4*outP+4*outC+9*outF;
    const outGap = Math.abs(outMacroCal-outCal);
    const outWarn = outGap > Math.max(30,outCal*0.1) ? `ผลหลังปรับข้าว: kcal กับ P/C/F ยังต่างกัน ${round1(outGap)} kcal โปรดตรวจค่าจากร้าน` : `ผล kcal สัมพันธ์กับ P/C/F โดยประมาณ (${round1(outMacroCal)} kcal จากสูตร 4/4/9)`;
    const riceEstimate = adjustment.estimatedRiceGrams === null
      ? 'ไม่สามารถประมาณน้ำหนักข้าวจากคาร์บได้'
      : `ประมาณว่ามีข้าวเดิม ${round1(adjustment.estimatedRiceGrams)} g และเพิ่มอีก ${round1(adjustment.additionalRiceGrams)} g เพื่อให้ได้เป้าหมาย ${targetG} g`;
    const carbBasis = sideC === null
      ? `ใช้คาร์บรวมจากร้าน ${round1(shopC)} g`
      : `หักคาร์บกับข้าว ${round1(sideC)} g ตามที่ระบุ`;
    result.innerHTML = `<p class="font-semibold">ผลสำหรับข้าวเป้าหมาย ${targetG} g: ${outCal} kcal · P ${outP} g · C ${outC} g · F ${outF} g</p><p class="text-xs text-slate-600 mt-1">${esc(riceEstimate)} (${esc(carbBasis)})</p><p class="text-xs text-amber-800 mt-1">ค่าน้ำหนักเป็นการประมาณเท่านั้น คาร์บจากร้านอาจรวมซอส ผัก หรือส่วนผสมอื่น ไม่ได้ยืนยันว่าคาร์บทั้งหมดมาจากข้าว</p>${adjustment.warning ? `<p class="text-xs text-amber-800 mt-1">${esc(adjustment.warning)}</p>` : ''}<p class="text-xs mt-1">ค่าร้าน: ${esc(kcalWarn)}</p><p class="text-xs ${outGap > Math.max(30,outCal*0.1) ? 'text-amber-800' : 'text-green-800'}">${esc(outWarn)}</p>`;
    save.disabled = false;
    return { ...out, estimatedRiceGrams: adjustment.estimatedRiceGrams, additionalRiceGrams: adjustment.additionalRiceGrams, kcalWarn };
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
    if (guardPreviewWrite('การบันทึกเมนู Hiwpinto')) return;
    const values = calculate(); if (!values) return;
    const includedRice = $m('#hp-has-rice').checked;
    const name = $m('#hp-name').value.trim();
    const riceGrams = Number($m('#hp-rice-g').value);
    const suffix = includedRice ? ` · ข้าว ${riceGrams} g` : '';
    const rec = {
      name, brand:'Hiwpinto box', unit:`1 กล่อง${suffix}`, gramsPerUnit:null,
      calories:Math.round(values.calories), protein:round1(values.protein), carbs:round1(values.carbs), fat:round1(values.fat),
      favorite:saved?.favorite === true,
      hiwpinto:{ shopCalories:toNum($m('#hp-shop-calories').value), shopProtein:toNum($m('#hp-shop-protein').value), shopCarbs:toNum($m('#hp-shop-carbs').value), shopFat:toNum($m('#hp-shop-fat').value), sideCarbs:includedRice ? toNum($m('#hp-side-carb').value) : null, includedRice, riceProfile:$m('#hp-rice-type').value, riceGrams, kcalWarn:values.kcalWarn }
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
  watchFoodRecords(state.uid, date, list => { items = list; renderDay(); });
}

export function resetFoodToToday() {
  if (!root) return;
  const dateEl = $('#f-date', root);
  const today = localDateStr();
  if (dateEl && dateEl.value !== today) {
    dateEl.value = today;
    watchDay();
  }
}

function fillMealSelect() {
  if (!root) return;
  const opts = getMeals().map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  ['f-meal', 'f-bulk-meal'].forEach(id => {
    const sel = $('#' + id, root);
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = opts;
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
  });
}
let comboMatches = [];
let comboActiveIdx = -1;

function closeFoodCombobox() {
  if (!root) return;
  const list = $('#f-name-listbox', root);
  const inp = $('#f-name', root);
  if (list) list.classList.add('hidden');
  if (inp) inp.setAttribute('aria-expanded', 'false');
  comboActiveIdx = -1;
}

function renderFoodCombobox(queryText) {
  if (!root) return;
  const list = $('#f-name-listbox', root);
  const inp = $('#f-name', root);
  if (!list || !inp) return;
  const q = String(queryText || '').trim().toLowerCase();
  const presets = getPresets();
  comboMatches = (q
    ? presets.filter(p => label(p).toLowerCase().includes(q) || String(p.name || '').toLowerCase().includes(q))
    : presets.slice(0, 18)
  ).slice(0, 24);
  if (!comboMatches.length) {
    closeFoodCombobox();
    return;
  }
  comboActiveIdx = -1;
  list.innerHTML = comboMatches.map((p, idx) => `
    <button type="button" role="option" aria-selected="false" data-combo-idx="${idx}" class="tm-combobox-option">
      <span class="truncate">${p.favorite ? '★ ' : ''}${esc(label(p))}</span>
      <span class="tm-combobox-meta tabular-nums">${Math.round(p.calories || 0)} kcal · P${p.protein ?? '-'}</span>
    </button>`).join('');
  list.classList.remove('hidden');
  inp.setAttribute('aria-expanded', 'true');
}

function setupFoodCombobox() {
  const inp = $('#f-name', root);
  const list = $('#f-name-listbox', root);
  if (!inp || !list) return;

  const updateHighlight = () => {
    const opts = [...list.querySelectorAll('[data-combo-idx]')];
    opts.forEach((btn, idx) => {
      const on = idx === comboActiveIdx;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
      if (on) btn.scrollIntoView({ block: 'nearest' });
    });
  };

  inp.addEventListener('focus', () => renderFoodCombobox(inp.value));
  inp.addEventListener('input', e => {
    pickByLabel(e.target.value);
    renderFoodCombobox(e.target.value);
  });
  inp.addEventListener('keydown', e => {
    if (list.classList.contains('hidden')) {
      if (e.key === 'ArrowDown') { renderFoodCombobox(inp.value); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      comboActiveIdx = (comboActiveIdx + 1) % comboMatches.length;
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      comboActiveIdx = (comboActiveIdx - 1 + comboMatches.length) % comboMatches.length;
      updateHighlight();
    } else if (e.key === 'Enter' && comboActiveIdx >= 0 && comboMatches[comboActiveIdx]) {
      e.preventDefault();
      applyPreset(comboMatches[comboActiveIdx], true);
      closeFoodCombobox();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFoodCombobox();
    }
  });
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => {
    const opt = e.target.closest('[data-combo-idx]');
    if (!opt) return;
    const item = comboMatches[Number(opt.dataset.comboIdx)];
    if (item) applyPreset(item, true);
    closeFoodCombobox();
  });
  inp.addEventListener('blur', () => {
    setTimeout(() => {
      if (!root?.contains(document.activeElement)) return closeFoodCombobox();
      if (document.activeElement !== inp && !list.contains(document.activeElement)) closeFoodCombobox();
    }, 120);
  });
}

function handleCustomFoodsUpdate() {
  refreshDatalist();
  const current = state.customFoods || [];
  if (lastTrackedUid !== state.uid || (!lastCustomFoodsSnapshot.size && current.length)) {
    lastTrackedUid = state.uid;
    lastCustomFoodsSnapshot = new Map(current.map(f => [f.id, { ...f }]));
    return;
  }

  const changedPairs = [];
  for (const updated of current) {
    const prev = lastCustomFoodsSnapshot.get(updated.id);
    if (prev && hasFoodLibraryDefinitionChanged(prev, updated)) {
      changedPairs.push({ prev, updated: { ...updated, custom: true } });
    }
  }
  lastCustomFoodsSnapshot = new Map(current.map(f => [f.id, { ...f }]));
  renderDay();

  if (!changedPairs.length) return;

  // 1) อัปเดตเมนูที่เลือกค้างไว้ในฟอร์มบันทึกอาหาร (คงปริมาณ/น้ำหนักที่กรอกไว้)
  if (base?.id) {
    const activeMatch = changedPairs.find(pair => pair.updated.id === base.id);
    if (activeMatch) {
      applyPreset(activeMatch.updated, true, true);
    }
  }

  // 2) อัปเดตรายการอาหารที่บันทึก/เลือกไว้แล้วในวันที่กำลังดูอยู่
  if (!state.uid || !items.length) return;
  const pendingUpdates = [];
  for (const item of items) {
    for (const { prev, updated } of changedPairs) {
      const updates = buildFoodRecordUpdatesFromLibrary(item, updated, prev);
      if (updates) {
        pendingUpdates.push({ id: item.id, updates });
        break;
      }
    }
  }
  if (!pendingUpdates.length) return;

  const now = new Date();
  if (isPreviewMode()) {
    Promise.all(pendingUpdates.map(({ id, updates }) => updateFoodRecord(state.uid, id, { ...updates, updatedAt: now })))
      .then(() => toast(`อัปเดตรายการอาหารที่เลือกไว้ ${pendingUpdates.length} รายการตามคลังแล้ว`))
      .catch(err => toast('อัปเดตรายการที่เลือกไม่สำเร็จ: ' + err.message, 'err'));
    return;
  }

  const commits = [];
  for (let i = 0; i < pendingUpdates.length; i += 450) {
    const batch = writeBatch(db);
    pendingUpdates.slice(i, i + 450).forEach(({ id, updates }) => {
      batch.update(userDoc(state.uid, 'food_records', id), { ...updates, updatedAt: now });
    });
    commits.push(batch.commit());
  }
  Promise.all(commits)
    .then(() => toast(`อัปเดตรายการอาหารที่เลือกไว้ ${pendingUpdates.length} รายการตามคลังแล้ว`))
    .catch(err => toast('อัปเดตรายการที่เลือกไม่สำเร็จ: ' + err.message, 'err'));
}

function refreshDatalist() {
  if (!root) return;
  const list = $('#f-name-listbox', root);
  if (list && !list.classList.contains('hidden')) {
    renderFoodCombobox($('#f-name', root)?.value || '');
  }
}
function pickByLabel(v) {
  const p = getPresets().find(x => label(x) === v);
  if (p) applyPreset(p, false);
  else { base = null; syncFoodWeightForm(); updateFoodPreview(); }
}

function applyPreset(p, setName = true, preserveEnteredAmount = false) {
  base = p;
  if (setName) $('#f-name', root).value = label(p);
  const modeEl = $('#f-qty-mode', root);
  const initialMode = preserveEnteredAmount && canWeigh(p) && modeEl?.value ? modeEl.value : defaultFoodInputMode(p);
  if (modeEl) modeEl.value = initialMode;
  if (!preserveEnteredAmount || !$('#f-qty', root).value) {
    $('#f-qty', root).value = p.defaultQuantity ?? (canWeigh(p) && initialMode === 'grams' ? p.gramsPerUnit : 1);
  }
  if (p.edibleFraction && p.gramsPerUnit > 0) {
    if (!preserveEnteredAmount || !$('#f-gross', root).value) {
      $('#f-gross', root).value = p.gramsPerUnit;
    }
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
    : base?.gramsPerUnit > 0
      ? (isGramUnitLabel(base.unit) ? `${fmtAmount(qty * base.gramsPerUnit)} g` : `${fmtAmount(qty)} หน่วย ≈ ${fmtAmount(qty * base.gramsPerUnit)} g`)
    : base?.unit && base.unit !== 'หน่วย' && !/^\d/.test(base.unit) ? `${fmtAmount(qty)} ${base.unit}`
    : `${fmtAmount(qty)} หน่วย`;
  $('#f-preview', root).textContent = `${Math.round(calories)} kcal · P ${round1(protein)} · C ${round1(carbs)} · F ${round1(fat)}`
    + `${sugar !== null ? ` · น้ำตาล ${round1(sugar)}` : ''}${sodium !== null ? ` · Na ${Math.round(sodium)} mg` : ''} · ${amountText}`;
}

function clearFoodForm() {
  if (!root) return;
  ['f-name','f-cal','f-pro','f-carb','f-fat','f-gross','f-edible'].forEach(id => { const el=$('#'+id,root); if(el) el.value=''; });
  ['f-sugar','f-sodium'].forEach(id => { const el=$('#'+id,root); if(el) el.value=''; });
  $('#f-sugar-wrap',root).classList.add('hidden'); $('#f-sodium-wrap',root).classList.add('hidden');
  $('#f-photo-lib-bar', root)?.classList.add('hidden');
  setFoodScanStatus('', '');
  $('#f-qty',root).value=1;
  base=null;
  syncFoodWeightForm();
  updateFoodPreview();
}

const selectedQtyMode = () => {
  if (!canWeigh(base)) return defaultFoodInputMode(base);
  const val = $('#f-qty-mode', root)?.value;
  return val === 'grams' || val === 'unit' ? val : defaultFoodInputMode(base);
};

// จำนวนหน่วยจริงที่จะบันทึก: แปลงจากกรัมเป็นหน่วยเฉพาะเมื่อผู้ใช้เลือกโหมดกรอกเป็นกรัม
const formQty = () => foodQuantityFromInput(numField(root, 'f-qty'), base, selectedQtyMode());

function syncFoodWeightForm() {
  if (!root) return;
  const grossMode = Boolean(base?.edibleFraction && base?.gramsPerUnit > 0);
  const gramMode = base?.unit === 'g' && base?.gramsPerUnit === 1;
  const weighable = canWeigh(base);
  $('#f-qty-wrap', root).classList.toggle('hidden', grossMode);
  const modeEl = $('#f-qty-mode', root);
  if (modeEl) {
    modeEl.classList.toggle('hidden', !weighable);
    const unitOpt = modeEl.querySelector('option[value="unit"]');
    if (unitOpt) unitOpt.textContent = base?.unit ? `หน่วย (${base.unit})` : 'หน่วย';
    if (!weighable) modeEl.value = defaultFoodInputMode(base);
  }
  const mode = selectedQtyMode();
  const isGramsInput = gramMode || (weighable && mode === 'grams');
  $('#f-qty-label', root).textContent = isGramsInput
    ? 'น้ำหนักที่กิน (กรัม)'
    : base?.unit ? `จำนวน (${base.unit})` : 'จำนวน (หน่วย)';
  $('#f-qty', root).step = isGramsInput ? '1' : '0.01';
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
  const grossMode = Boolean(base?.edibleFraction && base?.gramsPerUnit > 0);
  const weighedGrams = grossMode ? numField(root, 'f-gross') : null;
  const ediblePercent = grossMode ? numField(root, 'f-edible') : null;
  const qty = grossMode ? weighedGrams * (ediblePercent / 100) / base.gramsPerUnit : (formQty() ?? 1);
  const validationError = validateFoodLog({ name, calories: cal, grossMode, weighedGrams, ediblePercent, quantity: qty });
  if (validationError) return toast(validationError, 'err');
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
  if (base?.custom && base?.id) {
    rec.customFoodId = base.id;
  }
  if (unitNutrition.sugar !== null) rec.sugar = round1(unitNutrition.sugar * qty);
  if (unitNutrition.sodium !== null) rec.sodium = Math.round(unitNutrition.sodium * qty);
  if (grossMode) {
    rec.weighedGrams = weighedGrams; rec.edibleFraction = ediblePercent / 100;
    rec.edibleGrams = weighedGrams * rec.edibleFraction; rec.edibleUnitGrams = base.gramsPerUnit;
    rec.edibleFractionSource = base.edibleFractionSource || null;
  }
  // ไม่ await: ตอนออฟไลน์ promise จะไม่จบจนกว่าจะซิงค์ แต่ข้อมูลถูกเก็บในเครื่องและแสดงทันที
  addFoodRecord(state.uid, rec).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  clearFoodForm();
}

async function copyRecentMeal() {
  const date = $('#f-date', root).value, mealId = $('#f-meal', root).value;
  const mealName=$('#f-meal',root).selectedOptions[0]?.textContent||'';
  if (!date || !mealId || !state.uid) return;
  const button = $('#f-copy-meal', root);
  button.disabled = true;
  button.innerHTML = `${iconSvg('fa-spinner fa-spin', { size: 14 })} กำลังหา…`;
  try {
    let sourceDate = null, sourceItems = [];
    for (let days = 1; days <= 30 && !sourceItems.length; days++) {
      const candidate = addDays(date, -days);
      const result = await getFoodRecordsInRange(state.uid, candidate, candidate);
      sourceItems = result.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => item.mealId===mealId || item.meal===mealName);
      if (sourceItems.length) sourceDate = candidate;
    }
    if (!sourceItems.length) return toast(`ไม่พบ${mealName}ใน 30 วันก่อนหน้า`, 'err');
    const modal = openModal(`<div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg text-slate-800">คัดลอก${esc(mealName)}</h3><button data-close type="button" class="text-slate-400 hover:text-slate-700 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
      <p class="text-sm text-slate-600 mb-3">พบมื้อวันที่ <b>${esc(sourceDate)}</b> · ${sourceItems.length} รายการ</p>
      <label class="flex items-center gap-2 text-sm min-h-[44px] mb-2 cursor-pointer"><input id="copy-meal-all" type="checkbox" class="w-4 h-4 accent-violet-500" checked> เลือกทั้งหมด</label>
      <div class="space-y-2 mb-4">${sourceItems.map((item,i) => `<label class="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm flex gap-2.5 items-start cursor-pointer"><input class="copy-meal-item mt-1 w-4 h-4 shrink-0 accent-violet-500" type="checkbox" data-index="${i}" checked><span><b>${esc(item.name)}</b><span class="block text-xs text-slate-500 tabular-nums">${esc(item.calories)} kcal · P ${esc(item.protein)} · C ${esc(item.carbs)} · F ${esc(item.fat)}</span></span></label>`).join('')}</div>
      <p class="text-xs text-slate-500 mb-3">จะเพิ่มรายการใหม่ในวันที่ ${esc(date)} โดยไม่แก้ไขมื้อเดิม</p>
      <div class="flex justify-end gap-2"><button data-close type="button" class="btn btn-ghost min-h-[44px]">ยกเลิก</button><button id="copy-meal-confirm" type="button" class="btn btn-primary min-h-[44px]">คัดลอกรายการที่เลือก</button></div>`, { wide: true });
    const choices = () => [...$$('.copy-meal-item', modal.el)];
    $('#copy-meal-all', modal.el).addEventListener('change', e => { choices().forEach(c => { c.checked=e.target.checked; }); });
    choices().forEach(c => c.addEventListener('change', () => { $('#copy-meal-all',modal.el).checked=choices().every(x=>x.checked); }));
    $('#copy-meal-confirm', modal.el).addEventListener('click', async () => {
      if (guardPreviewWrite('การคัดลอกมื้ออาหาร')) return;
      const selected = choices().filter(c=>c.checked).map(c=>sourceItems[Number(c.dataset.index)]);
      if (!selected.length) return toast('เลือกรายการอาหารอย่างน้อย 1 รายการ', 'err');
      const batch = writeBatch(db), collectionRef = userCol(state.uid, 'food_records');
      const targetMealId=$('#f-meal',root).value, targetMealName=$('#f-meal',root).selectedOptions[0]?.textContent||mealName;
      selected.forEach(({ id, ...item }) => batch.set(doc(collectionRef), { ...item, date, meal:targetMealName, mealId:targetMealId, createdAt: new Date(), copiedFrom: sourceDate }));
      try {
        batch.commit().catch(error => toast('คัดลอกไม่สำเร็จ: ' + error.message, 'err'));
        modal.close();
        toast(`คัดลอก ${selected.length} รายการแล้ว`);
      }
      catch (error) { toast('คัดลอกไม่สำเร็จ: ' + error.message, 'err'); }
    });
  } catch (error) { toast('ค้นหามื้อก่อนหน้าไม่สำเร็จ: ' + error.message, 'err'); }
  finally { button.disabled = false; button.innerHTML = `${iconSvg('copy', { size: 13 })} คัดลอกจากมื้อเดิม`; }
}

const normFoodKey = v => foodLogName(String(v || '').trim()).toLocaleLowerCase('th').replace(/\s+/g, ' ');

function findMatchingLibraryFood(item) {
  if (!item) return null;
  const customList = state.customFoods || [];
  if (item.customFoodId) {
    const byId = customList.find(f => f.id === item.customFoodId);
    if (byId) return { kind: 'custom', item: byId };
  }
  const key = normFoodKey(item.name);
  const customByName = customList.find(f => normFoodKey(f.name) === key);
  if (customByName) return { kind: 'custom', item: customByName };
  const builtin = DEFAULT_PRESETS.find(f => normFoodKey(f.name) === key);
  if (builtin) return { kind: 'builtin', item: builtin };
  return null;
}

function isFoodRecordFavorite(item) {
  const match = findMatchingLibraryFood(item);
  if (!match) return false;
  if (match.kind === 'custom') return match.item.favorite === true;
  return builtinFavorites().has(match.item.id);
}

async function toggleFoodRecordFavorite(id) {
  const item = items.find(row => row.id === id);
  if (!item) return;
  const match = findMatchingLibraryFood(item);
  if (match?.kind === 'custom') {
    if (guardPreviewWrite('การบันทึกรายการโปรด')) return;
    const nextFav = !match.item.favorite;
    try {
      await updateCustomFood(state.uid, match.item.id, { favorite: nextFav });
      toast(nextFav ? `บันทึก “${foodLogName(item.name)}” เป็นรายการโปรดแล้ว` : `นำ “${foodLogName(item.name)}” ออกจากรายการโปรดแล้ว`);
      renderDay();
    } catch (err) {
      toast('อัปเดตรายการโปรดไม่สำเร็จ: ' + err.message, 'err');
    }
    return;
  }
  if (match?.kind === 'builtin') {
    const favorites = builtinFavorites();
    const nextFav = !favorites.has(match.item.id);
    if (nextFav) favorites.add(match.item.id);
    else favorites.delete(match.item.id);
    localStorage.setItem(BUILTIN_FAV_KEY, JSON.stringify([...favorites]));
    refreshDatalist();
    emit('customFoods');
    toast(nextFav ? `บันทึก “${foodLogName(item.name)}” เป็นรายการโปรดแล้ว` : `นำ “${foodLogName(item.name)}” ออกจากรายการโปรดแล้ว`);
    renderDay();
    return;
  }
  if (guardPreviewWrite('การบันทึกรายการโปรด')) return;
  const qty = foodLogQuantity(item);
  const u = unitNutritionFor(item, qty);
  try {
    const saved = await addCustomFood(state.uid, {
      name: foodLogName(item.name),
      brand: '',
      unit: item.portionUnit || 'หน่วย',
      gramsPerUnit: Number.isFinite(item.gramsPerUnit) ? item.gramsPerUnit : null,
      defaultQuantity: 1,
      category: guessFoodCategory(item.name),
      calories: Math.round(u.calories || 0),
      protein: round1(u.protein || 0),
      carbs: round1(u.carbs || 0),
      fat: round1(u.fat || 0),
      sugar: u.sugar ?? null,
      sodium: u.sodium ?? null,
      favorite: true,
      createdAt: new Date()
    });
    if (saved?.id && !item.customFoodId) {
      updateFoodRecord(state.uid, item.id, { customFoodId: saved.id, updatedAt: new Date() }).catch(() => {});
    }
    toast(`บันทึก “${foodLogName(item.name)}” เข้าคลังและรายการโปรดแล้ว`);
    renderDay();
  } catch (err) {
    toast('บันทึกรายการโปรดไม่สำเร็จ: ' + err.message, 'err');
  }
}

function moveFoodItemToMeal(id, targetMealName) {
  const item = items.find(row => row.id === id);
  if (!item || !targetMealName || (item.meal || 'ไม่ระบุมื้อ') === targetMealName) return;
  const mealObj = getMeals().find(m => m.name === targetMealName);
  const mealId = mealObj?.id || item.mealId || targetMealName;
  updateFoodRecord(state.uid, id, { mealId, meal: targetMealName, updatedAt: new Date() })
    .then(() => toast(`ย้าย “${foodLogName(item.name)}” ไป${targetMealName}แล้ว`))
    .catch(err => toast('ย้ายมื้อไม่สำเร็จ: ' + err.message, 'err'));
}

function setupFoodBodyGestures() {
  const body = $('#f-body', root);
  const dropBar = $('#f-drag-targets', root);
  if (!body) return;

  let draggingId = null;
  let pointerDrag = null;
  let swipe = null;

  const setDropBarOpen = open => {
    if (!dropBar) return;
    dropBar.classList.toggle('hidden', !open);
    dropBar.querySelectorAll('.tm-drag-over').forEach(el => el.classList.remove('tm-drag-over'));
    body.querySelectorAll('.tm-drag-over').forEach(el => el.classList.remove('tm-drag-over'));
  };

  const closeAllSwipes = (exceptRow = null) => {
    body.querySelectorAll('.tm-swipe-row').forEach(row => {
      if (row === exceptRow) return;
      row.classList.remove('is-open-left', 'is-swiping');
      row.removeAttribute('data-swipe-dir');
      row.style.setProperty('--swipe-x', '0px');
    });
  };

  const setSwipeX = (row, dx) => {
    row.style.setProperty('--swipe-x', `${dx}px`);
    if (dx < -4) row.setAttribute('data-swipe-dir', 'left');
    else if (dx > 4) row.setAttribute('data-swipe-dir', 'right');
    else row.removeAttribute('data-swipe-dir');
  };

  // HTML5 Drag & Drop (เดสก์ท็อป) — ลากเฉพาะผ่านไอคอนจับลากเพื่อไม่ชนกับการปัดซ้าย-ขวา
  body.addEventListener('dragstart', e => {
    const handle = e.target.closest('[data-drag-handle]');
    const row = handle?.closest('.tm-swipe-row');
    if (!handle || !row || e.target.closest('.tm-swipe-actions, .tm-swipe-fav, [data-fav-log], [data-edit-log], [data-del], input, button, a')) {
      e.preventDefault();
      return;
    }
    draggingId = row.dataset.foodId;
    closeAllSwipes();
    row.classList.add('is-dragging');
    setDropBarOpen(true);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggingId || '');
      e.dataTransfer.setDragImage?.(row, 24, 24);
    }
  });

  body.addEventListener('dragend', () => {
    draggingId = null;
    body.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    setDropBarOpen(false);
  });

  [body, dropBar].filter(Boolean).forEach(zone => {
    zone.addEventListener('dragover', e => {
      if (!draggingId) return;
      const target = e.target.closest('[data-meal-drop]');
      if (!target) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      zone.querySelectorAll('.tm-drag-over').forEach(el => { if (el !== target) el.classList.remove('tm-drag-over'); });
      target.classList.add('tm-drag-over');
    });
    zone.addEventListener('dragleave', e => {
      const target = e.target.closest('[data-meal-drop]');
      if (target && !target.contains(e.relatedTarget)) target.classList.remove('tm-drag-over');
    });
    zone.addEventListener('drop', e => {
      const target = e.target.closest('[data-meal-drop]');
      if (!target) return;
      e.preventDefault();
      const id = draggingId || e.dataTransfer?.getData('text/plain');
      const mealName = target.dataset.mealDrop;
      draggingId = null;
      body.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
      setDropBarOpen(false);
      if (id && mealName) moveFoodItemToMeal(id, mealName);
    });
  });

  // Pointer Drag บนมือถือ/ทัชผ่านไอคอนจับลาก [data-drag-handle]
  body.addEventListener('pointerdown', e => {
    if (e.target.closest('.tm-swipe-actions, .tm-swipe-fav, [data-fav-log], [data-edit-log], [data-del]')) return;
    const handle = e.target.closest('[data-drag-handle]');
    if (handle) {
      if (e.pointerType === 'mouse') return; // เมาส์ใช้ HTML5 dragstart ได้ตรง ๆ
      const row = handle.closest('.tm-swipe-row');
      if (!row) return;
      e.preventDefault();
      closeAllSwipes();
      const item = items.find(x => x.id === row.dataset.foodId);
      const ghost = document.createElement('div');
      ghost.className = 'tm-drag-ghost';
      ghost.textContent = foodLogName(item?.name || 'ย้ายมื้อ');
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      document.body.appendChild(ghost);
      row.classList.add('is-dragging');
      setDropBarOpen(true);
      pointerDrag = { id: row.dataset.foodId, row, ghost, pointerId: e.pointerId, targetMeal: null };
      handle.setPointerCapture?.(e.pointerId);
      return;
    }

    if (window.matchMedia?.('(min-width: 1024px)').matches) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.tm-swipe-actions, input, button, a')) return;
    const row = e.target.closest('.tm-swipe-row');
    if (!row) {
      closeAllSwipes();
      return;
    }
    closeAllSwipes(row);
    const wasOpen = row.classList.contains('is-open-left');
    swipe = {
      row,
      id: row.dataset.foodId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: wasOpen ? -136 : 0,
      dx: wasOpen ? -136 : 0,
      locked: false,
      aborted: false
    };
  });

  window.addEventListener('pointermove', e => {
    if (pointerDrag && e.pointerId === pointerDrag.pointerId) {
      pointerDrag.ghost.style.left = `${e.clientX}px`;
      pointerDrag.ghost.style.top = `${e.clientY}px`;
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find(el => el.closest?.('[data-meal-drop]'))?.closest('[data-meal-drop]');
      document.querySelectorAll('#tab-food [data-meal-drop].tm-drag-over').forEach(el => { if (el !== hit) el.classList.remove('tm-drag-over'); });
      if (hit) hit.classList.add('tm-drag-over');
      pointerDrag.targetMeal = hit?.dataset.mealDrop || null;
      return;
    }
    if (!swipe || e.pointerId !== swipe.pointerId || swipe.aborted) return;
    const rawDx = e.clientX - swipe.startX;
    const rawDy = e.clientY - swipe.startY;
    if (!swipe.locked) {
      if (Math.abs(rawDy) > 12 && Math.abs(rawDy) > Math.abs(rawDx)) {
        swipe.aborted = true;
        return;
      }
      if (Math.abs(rawDx) > 10 && Math.abs(rawDx) > Math.abs(rawDy) * 1.15) {
        swipe.locked = true;
        swipe.row.classList.add('is-swiping');
      } else {
        return;
      }
    }
    const nextX = Math.max(-144, Math.min(116, swipe.baseX + rawDx));
    swipe.dx = nextX;
    setSwipeX(swipe.row, nextX);
  });

  const endPointer = e => {
    if (pointerDrag && e.pointerId === pointerDrag.pointerId) {
      const { id, row, ghost, targetMeal } = pointerDrag;
      ghost.remove();
      row.classList.remove('is-dragging');
      setDropBarOpen(false);
      pointerDrag = null;
      if (targetMeal) moveFoodItemToMeal(id, targetMeal);
      return;
    }
    if (!swipe || e.pointerId !== swipe.pointerId) return;
    const { row, id, dx, locked, baseX } = swipe;
    swipe = null;
    row.classList.remove('is-swiping');
    if (!locked) {
      if (baseX < 0) {
        row.classList.remove('is-open-left');
        setSwipeX(row, 0);
      }
      return;
    }
    if (dx <= -56) {
      row.classList.add('is-open-left');
      setSwipeX(row, -136);
    } else if (dx >= 68) {
      row.classList.remove('is-open-left');
      setSwipeX(row, 0);
      void toggleFoodRecordFavorite(id);
    } else {
      row.classList.remove('is-open-left');
      setSwipeX(row, 0);
    }
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  document.addEventListener('click', e => {
    if (!body.contains(e.target)) closeAllSwipes();
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
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg text-slate-800">แก้จำนวนอาหาร</h3><button data-close type="button" class="text-slate-400 hover:text-slate-700 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <p class="text-sm font-semibold text-slate-700 mb-3">${esc(foodLogName(item.name))}</p>
    <label class="lbl">${isGross ? 'น้ำหนักที่ชั่งรวม (g)' : isGrams || unitG > 1 ? (unitG > 1 ? 'น้ำหนักที่กิน (กรัม)' : 'ปริมาณ (กรัม)') : 'จำนวน (หน่วยเดิม)'}</label>
    <input id="fl-amount" type="number" min="0.01" step="${isGross||isGrams||unitG > 1 ? '1' : '0.01'}" inputmode="decimal" class="input min-h-[44px]" value="${isGross ? item.weighedGrams : unitG > 1 ? round1(currentQuantity * unitG) : currentQuantity}">
    ${isGross ? `<label class="lbl mt-3">สัดส่วนที่กินได้โดยประมาณ (%)</label><input id="fl-edible" type="number" min="1" max="100" step="1" inputmode="decimal" class="input min-h-[44px]" value="${Math.round(item.edibleFraction * 100)}">` : ''}
    <p id="fl-estimate" class="mt-2 text-sm text-slate-600 tabular-nums" aria-live="polite"></p>
    <div class="flex justify-end gap-2 mt-4"><button data-close type="button" class="btn btn-ghost min-h-[44px]">ยกเลิก</button><button id="fl-save" type="button" class="btn btn-primary min-h-[44px]">บันทึกจำนวน</button></div>`);
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
    const saving = updateFoodRecord(state.uid, id, updates);
    m.close();
    saving.then(() => toast('ปรับจำนวนและสารอาหารแล้ว'))
      .catch(err => toast('แก้จำนวนไม่สำเร็จ: ' + err.message, 'err'));
  });
}

function renderDay() {
  if (!root) return;
  const validIds = new Set(items.map(i => i.id));
  selectedFoodIds.forEach(id => { if (!validIds.has(id)) selectedFoodIds.delete(id); });

  const bulkBar = $('#f-bulk-bar', root);
  if (bulkBar) {
    bulkBar.classList.toggle('hidden', items.length === 0);
    $('#f-sel-all', root).checked = items.length > 0 && items.every(i => selectedFoodIds.has(i.id));
    $('#f-sel-count', root).textContent = selectedFoodIds.size;
    $('#f-bulk-move', root).disabled = selectedFoodIds.size === 0;
  }

  const body = $('#f-body', root);
  const meals = [...getMeals().map(m => m.name), ...MEAL_ORDER.filter(m => !getMeals().some(x => x.name === m)), ...new Set(items.map(i => i.meal || 'ไม่ระบุมื้อ').filter(m => !getMeals().some(x => x.name === m) && !MEAL_ORDER.includes(m)))];
  const dropTargets = $('#f-drag-targets', root);
  if (dropTargets) {
    const targetNames = [...new Set([...getMeals().map(m => m.name), ...items.map(i => i.meal || 'ไม่ระบุมื้อ')])];
    dropTargets.innerHTML = targetNames.map(name => `<div data-meal-drop="${esc(name)}" class="tm-drag-target">วางลง ${esc(name)}</div>`).join('');
  }
  $('#f-swipe-hint', root)?.classList.toggle('hidden', items.length === 0);

  const targets = getTargets();
  const presetsList = getPresets();
  body.innerHTML = items.length ? meals.map(meal => {
    const rows = items.filter(i => (i.meal || 'ไม่ระบุมื้อ') === meal);
    if (!rows.length) return '';
    const mealIcon = MEAL_ICONS[meal] || 'food';
    const mealCalories = rows.reduce((sum, i) => sum + num(i.calories), 0);
    const mealProtein = rows.reduce((sum, i) => sum + num(i.protein), 0);
    const mealCarbs = rows.reduce((sum, i) => sum + num(i.carbs), 0);
    const mealFat = rows.reduce((sum, i) => sum + num(i.fat), 0);
    const allMealSelected = rows.every(i => selectedFoodIds.has(i.id));
    return `
      <section class="tm-meal-group" data-meal-drop="${esc(meal)}">
        <header class="tm-meal-group-head">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <label class="inline-flex items-center gap-2 cursor-pointer font-semibold text-sm text-slate-800 min-w-0">
              <input type="checkbox" data-meal-sel="${esc(meal)}" class="accent-violet-500 w-4 h-4 shrink-0" aria-label="เลือกทั้งหมดใน${esc(meal)}" ${allMealSelected ? 'checked' : ''}>
              <span class="inline-flex items-center gap-1.5 text-brand shrink-0">${iconSvg(mealIcon, { size: 16 })}</span>
              <span class="truncate">${esc(meal)}</span>
            </label>
            <span class="text-xs text-slate-500 tabular-nums shrink-0">${rows.length} รายการ · <b class="text-slate-700">${Math.round(mealCalories)} kcal</b><span class="hidden sm:inline"> · P${round1(mealProtein)} · C${round1(mealCarbs)} · F${round1(mealFat)}</span></span>
          </div>
          <button type="button" data-add-meal="${esc(meal)}" class="tm-meal-add-btn shrink-0" aria-label="เพิ่มอาหารใน${esc(meal)}">${iconSvg('plus', { size: 13 })}<span>เพิ่ม</span></button>
        </header>
        <div class="tm-swipe-list">
          ${rows.map(i => {
            const fav = isFoodRecordFavorite(i);
            const nameText = foodLogName(i.name);
            const portionText = foodLogPortion(i, presetsList) || '1 หน่วย';
            const macrosLine = `P ${round1(num(i.protein))}g · C ${round1(num(i.carbs))}g · F ${round1(num(i.fat))}g`
              + (i.sugar != null ? ` · น้ำตาล ${round1(num(i.sugar))}g` : '')
              + (i.sodium != null ? ` · Na ${Math.round(num(i.sodium))}mg` : '');
            return `
              <div class="tm-swipe-row" data-food-id="${esc(i.id)}">
                <div class="tm-swipe-fav ${fav ? 'is-saved' : ''}" aria-hidden="true">
                  ${iconSvg('star', { size: 15 })}
                  <span>${fav ? 'นำออกจากโปรด' : 'บันทึกโปรด'}</span>
                </div>
                <div class="tm-swipe-actions">
                  <button type="button" data-edit-log="${esc(i.id)}" class="tm-swipe-action-btn is-edit" aria-label="แก้ไข ${esc(nameText)}">
                    ${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span>
                  </button>
                  <button type="button" data-del="${esc(i.id)}" class="tm-swipe-action-btn is-del" aria-label="ลบ ${esc(nameText)}">
                    ${iconSvg('trash', { size: 15 })}<span>ลบ</span>
                  </button>
                </div>
                <div class="tm-swipe-card">
                  <div class="tm-food-row-main">
                    <span data-drag-handle draggable="true" class="tm-drag-handle" title="ลากเพื่อย้ายมื้อ" aria-label="ลาก ${esc(nameText)} เพื่อย้ายมื้อ">${iconSvg('drag', { size: 15 })}</span>
                    <input type="checkbox" data-food-sel="${esc(i.id)}" class="accent-violet-500 w-4 h-4 shrink-0 mt-1 md:mt-0" aria-label="เลือก ${esc(nameText)}" ${selectedFoodIds.has(i.id) ? 'checked' : ''}>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-semibold text-slate-800 truncate">${fav ? '<span class="text-amber-500 mr-1" aria-label="รายการโปรด">★</span>' : ''}${esc(nameText)}</p>
                      <p class="text-xs text-slate-500 truncate tabular-nums">${esc(portionText)} · <span class="hidden md:inline">${esc(macrosLine)}</span></p>
                    </div>
                    <p class="text-sm font-bold text-slate-800 leading-tight tabular-nums shrink-0 md:hidden">${esc(i.calories)} kcal</p>
                  </div>
                  <div class="tm-food-row-foot">
                    <div class="min-w-0 flex-1 md:text-right tabular-nums">
                      <p class="hidden md:block text-sm font-bold text-slate-800 leading-tight">${esc(i.calories)} kcal</p>
                      <p class="text-xs text-slate-500 md:hidden truncate">${esc(macrosLine)}</p>
                    </div>
                    <div class="tm-food-row-actions">
                      <button type="button" data-fav-log="${esc(i.id)}" class="tm-food-action-btn is-fav ${fav ? 'is-active' : ''}" aria-pressed="${fav}" aria-label="${fav ? 'นำออกจากโปรด' : 'บันทึกโปรด'} ${esc(nameText)}" title="${fav ? 'นำออกจากโปรด' : 'บันทึกโปรด'}">
                        ${iconSvg('star', { size: 15 })}
                      </button>
                      <button type="button" data-edit-log="${esc(i.id)}" class="tm-food-action-btn" aria-label="แก้ไข ${esc(nameText)}">
                        ${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span>
                      </button>
                      <button type="button" data-del="${esc(i.id)}" class="tm-food-action-btn is-del" aria-label="ลบ ${esc(nameText)}">
                        ${iconSvg('trash', { size: 15 })}<span>ลบ</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }).join('')
    : '<div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 text-center text-slate-500 text-xs">ยังไม่มีรายการอาหารในวันที่เลือก — เพิ่มจากฟอร์ม สแกนรูป หรือดึงจากคลังอาหารได้เลย</div>';

  body.querySelectorAll('[data-meal-sel]').forEach(chk => {
    const mealName = chk.dataset.mealSel;
    const mealRows = items.filter(i => (i.meal || 'ไม่ระบุมื้อ') === mealName);
    const selCount = mealRows.filter(i => selectedFoodIds.has(i.id)).length;
    chk.indeterminate = selCount > 0 && selCount < mealRows.length;
  });

  const sum = k => items.reduce((a, i) => a + num(i[k]), 0);
  const t = { cal: sum('calories'), p: sum('protein'), c: sum('carbs'), f: sum('fat'), sugar: sum('sugar'), na: sum('sodium') };
  const hasItems = items.length > 0;
  const totalEl = $('#f-total', root);
  if (hasItems) {
    totalEl.innerHTML = `<span id="f-total-num">${Math.round(t.cal).toLocaleString('th-TH')}</span> / ${targets.kcal.toLocaleString()} kcal`;
    animateNumberTicker($('#f-total-num', root), Math.round(t.cal));
  } else {
    totalEl.textContent = 'ยังไม่ได้บันทึก';
  }
  const calBarEl = $('#f-cal-bar', root);
  if (calBarEl) {
    const calWidth = hasItems && targets.kcal > 0 ? Math.min((t.cal / targets.kcal) * 100, 100) : 0;
    calBarEl.style.width = `${calWidth}%`;
  }
  const macroStripEl = $('#f-macro-strip', root);
  if (macroStripEl) {
    const stripCard = (labelText, val, goal) => `
      <div class="rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 space-y-1">
        <div class="flex items-center justify-between gap-1 text-[11px] font-semibold text-slate-600"><span>${labelText}</span></div>
        <p class="text-xs font-bold text-slate-800 tabular-nums">${hasItems ? `${round1(val)}` : '—'} <span class="font-normal text-slate-500">/ ${goal}g</span></p>
        <div class="tm-progress-track"><div class="tm-progress-fill" style="width:${hasItems && goal > 0 ? Math.min((val / goal) * 100, 100) : 0}%"></div></div>
      </div>`;
    macroStripEl.innerHTML =
      stripCard('โปรตีน', t.p, targets.protein) +
      stripCard('คาร์บ', t.c, targets.carbs) +
      stripCard('ไขมัน', t.f, targets.fat) +
      `<div class="rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 space-y-1">
        <span class="block text-[11px] font-semibold text-slate-600">น้ำตาล · โซเดียม</span>
        <p class="text-xs font-bold text-slate-800 tabular-nums">${hasItems ? `${round1(t.sugar)}g · ${Math.round(t.na)}mg` : '—'}</p>
        <p class="text-[10px] text-slate-500 truncate">เฉพาะรายการที่ระบุ</p>
      </div>`;
  }
  const today = localDateStr(), date = $('#f-date', root).value, future = date > today;
  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const stripEl = $('#f-week-strip', root);
  if (stripEl) {
    const prevScroll = stripEl.scrollLeft;
    const hadPills = stripEl.children.length > 0;
    const baseMon = mondayOf(today);
    const rangeStart = addDays(baseMon, -21);
    const rangeEnd = addDays(baseMon, 20);
    const finalStart = date < rangeStart ? mondayOf(date) : rangeStart;
    const finalEnd = date > rangeEnd ? addDays(mondayOf(date), 6) : rangeEnd;
    const pills = [];
    for (let ds = finalStart; ds <= finalEnd; ds = addDays(ds, 1)) {
      const [yy, mm, dd] = ds.split('-').map(Number);
      const dow = DOW[new Date(yy, mm - 1, dd).getDay()];
      const active = ds === date;
      const isToday = ds === today;
      pills.push(`<button type="button" data-strip-day="${ds}" aria-pressed="${active}" aria-label="${esc(ds)}" class="tm-day-pill ${active ? 'is-active' : ''} ${isToday ? 'is-today' : ''}"><span class="tm-day-dow">${dow}</span><span class="tm-day-num">${dd}</span></button>`);
    }
    stripEl.innerHTML = pills.join('');
    if (hadPills && prevScroll > 0) stripEl.scrollLeft = prevScroll;
    else requestAnimationFrame(() => stripEl.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  }
  const pct = targets.kcal > 0 ? Math.round((t.cal / targets.kcal) * 100) : 0;
  const ringPctEl = $('#f-ring-pct', root);
  if (ringPctEl) ringPctEl.textContent = hasItems ? `${pct}% ของเป้า` : '0%';

  $('#f-daylabel', root).textContent = future ? 'แคลอรี่ที่วางแผนไว้' : date === today ? 'แคลอรี่รวมวันนี้' : 'แคลอรี่รวมของวันที่เลือก';
  const left = targets.kcal - t.cal;
  $('#f-remain', root).innerHTML = !hasItems
    ? `เป้าหมาย <b>${targets.kcal.toLocaleString()}</b> kcal`
    : left >= 0
      ? `เหลืออีก <b>${Math.round(left).toLocaleString()}</b> kcal`
      : `<span class="text-amber-800">เกินเป้า <b>${Math.round(-left).toLocaleString()}</b> kcal</span>`;

  const mealList = getMeals();
  const pie = buildMealCaloriePieData(items, mealList, getMealPiePalette());
  const donut = buildMealDonutParts({
    slices: pie.slices,
    totalKcal: pie.totalKcal,
    targetKcal: targets.kcal,
    hasData: hasItems && pie.totalKcal > 0
  });
  const pieSvgEl = $('#f-meals-pie-svg', root);
  if (pieSvgEl) pieSvgEl.innerHTML = `${donut.ringHtml}${donut.legendHtml}`;
  const readoutSlot = $('#f-pie-readout-slot', root);
  if (readoutSlot) readoutSlot.innerHTML = donut.readoutHtml;
  $('#f-meals', root).innerHTML = pie.slices.map(s => `
    <div class="flex items-center justify-between gap-2 text-xs min-h-[44px]">
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${s.color}"></span>
        <span class="font-semibold text-slate-700 truncate">${esc(s.meal)}</span>
      </div>
      <div class="flex items-center gap-2 shrink-0 tabular-nums">
        <span class="${s.count ? 'text-slate-800 font-semibold' : 'text-slate-400'}">${s.count ? `${s.kcal.toLocaleString()} kcal (${s.pct}%)` : '—'}</span>
        <button data-meal="${esc(s.meal)}" type="button" class="text-brand font-semibold px-2.5 min-h-[44px] inline-flex items-center rounded-lg hover:bg-slate-50">+ เพิ่ม</button>
      </div>
    </div>`).join('');
  bindChartInspector($('#f-pie-wrap', root), { hint: DONUT_TOOLTIP_HINT });

  const burned = state.workouts.filter(w => w.date === date).reduce((a, w) => a + (w.estKcal || 0), 0);
  const burnEl = $('#f-burn', root);
  burnEl.classList.toggle('hidden', !burned);
  if (burned) burnEl.textContent = `ออกกำลังกายวันนี้เผาผลาญเพิ่มประมาณ ${burned} kcal (ค่าประมาณ — ยังไม่ได้บวกเข้าเป้าอัตโนมัติ)`;
  const macroCard = (name, v, goal, unit = 'g') => {
    const pctVal = hasItems && goal > 0 ? Math.min((v / goal) * 100, 100) : 0;
    return `
    <div class="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2">
      <div class="flex justify-between items-center text-xs font-semibold text-slate-600">
        <span>${name}</span>
        <span class="text-[11px] font-medium text-slate-400 tabular-nums">${hasItems && goal > 0 ? `${Math.round((v / goal) * 100)}%` : '0%'}</span>
      </div>
      <p class="text-base font-bold text-slate-800 tabular-nums">${hasItems ? (unit === 'kcal' ? Math.round(v).toLocaleString() : round1(v)) : '—'} <span class="text-xs font-normal text-slate-500">/ ${goal.toLocaleString()} ${unit}</span></p>
      <div class="tm-progress-track"><div class="tm-progress-fill" style="width:${pctVal}%"></div></div>
    </div>`;
  };
  $('#f-stats', root).innerHTML =
    macroCard('พลังงาน', t.cal, targets.kcal, 'kcal') +
    macroCard('โปรตีน', t.p, targets.protein, 'g') +
    macroCard('คาร์บ', t.c, targets.carbs, 'g') +
    macroCard('ไขมัน', t.f, targets.fat, 'g') +
    `<div class="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2">
      <div class="flex justify-between text-xs font-semibold text-slate-600"><span>น้ำตาล · โซเดียม</span></div>
      <p class="text-sm font-bold text-slate-800 tabular-nums">${hasItems ? `${round1(t.sugar)} g · ${Math.round(t.na)} mg` : '—'}</p>
      <p class="text-[11px] text-slate-500">เฉพาะรายการที่กรอกค่านี้</p>
    </div>`;

  const advice = buildFoodAdvice(
    { kcal: t.cal, protein: t.p, carbs: t.c, fat: t.f, sugar: t.sugar, sodium: t.na },
    targets,
    { hasItems }
  );
  const adviceEl = $('#f-advice', root);
  if (adviceEl) {
    adviceEl.className = `p-3.5 rounded-xl text-xs leading-relaxed space-y-1 ${
      advice.status === 'warn'
        ? 'bg-amber-50 border border-amber-200/80 text-amber-900'
        : advice.status === 'ok'
          ? 'bg-ok-soft/70 text-green-900'
          : 'bg-slate-50 border border-slate-200 text-slate-600'
    }`;
    adviceEl.innerHTML = `<p class="font-semibold">${esc(advice.headline)}</p><ul class="list-disc pl-4 space-y-0.5">${advice.points.map(pt => `<li>${esc(pt)}</li>`).join('')}</ul>`;
  }
}

// ---------- Gemini: photo / online search ----------
function saveCurrentToLibrary() {
  const name = foodLogName($('#f-name', root).value.trim());
  const calories = numField(root, 'f-cal');
  if (!name || calories === null) return toast('กรอกชื่อเมนูและแคลอรี่ก่อนบันทึกลงคลัง', 'err');
  openFoodEditor({
    prefill: {
      name,
      unit: base?.unit || '1 จาน',
      gramsPerUnit: base?.gramsPerUnit ?? null,
      calories,
      protein: numField(root, 'f-pro'),
      carbs: numField(root, 'f-carb'),
      fat: numField(root, 'f-fat'),
      sugar: numField(root, 'f-sugar'),
      sodium: numField(root, 'f-sodium')
    },
    onSaved: food => {
      $('#f-photo-lib-bar', root)?.classList.add('hidden');
      applyPreset(food);
    }
  });
}

function openFoodSearchModal(initialQuery = '') {
  openFoodSearch({
    localFoods: getPresets(),
    initialQuery,
    onUse: food => {
      base = null;
      const fields = { 'f-name': food.name, 'f-cal': food.calories, 'f-pro': food.protein, 'f-carb': food.carbs, 'f-fat': food.fat, 'f-sugar': food.sugar, 'f-sodium': food.sodium };
      Object.entries(fields).forEach(([id, v]) => { const el = $('#' + id, root); if (el) el.value = v ?? ''; });
      const qty = $('#f-qty', root); if (qty) qty.value = 1;
      $('#f-sugar-wrap', root)?.classList.toggle('hidden', food.sugar == null);
      $('#f-sodium-wrap', root)?.classList.toggle('hidden', food.sodium == null);
      syncFoodWeightForm();
      updateFoodPreview();
    },
    onSaveLibrary: food => addCustomFood(state.uid, {
      name: food.name, brand: food.brand || '', unit: food.unit || '100 กรัม', gramsPerUnit: food.gramsPerUnit ?? 100,
      category: guessFoodCategory(food.name), calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat,
      sugar: food.sugar, sodium: food.sodium, favorite: false, createdAt: new Date()
    }).then(() => toast('บันทึกเข้าคลังอาหารแล้ว')).catch(e => toast('บันทึกเข้าคลังไม่สำเร็จ: ' + e.message, 'err'))
  });
}

async function bulkMoveFoodMeal() {
  if (guardPreviewWrite('การย้ายมื้อหลายรายการ')) return;
  const targetSel = $('#f-bulk-meal', root);
  const mealId = targetSel.value;
  const meal = targetSel.selectedOptions[0]?.textContent || '';
  const targets = items.filter(i => selectedFoodIds.has(i.id));
  if (!mealId || !targets.length) return;
  const btn = $('#f-bulk-move', root);
  btn.disabled = true;
  try {
    const now = new Date();
    const commits = [];
    for (let i = 0; i < targets.length; i += 450) {
      const chunk = targets.slice(i, i + 450);
      const batch = writeBatch(db);
      chunk.forEach(item => batch.update(userDoc(state.uid, 'food_records', item.id), { mealId, meal, updatedAt: now }));
      commits.push(batch.commit());
    }
    Promise.all(commits).catch(err => {
      targets.forEach(item => selectedFoodIds.add(item.id));
      toast('ย้ายมื้อไม่สำเร็จ: ' + err.message, 'err');
      renderDay();
    });
    selectedFoodIds.clear();
    toast(`ย้าย ${targets.length} รายการไป${meal}แล้ว`);
    btn.disabled = false;
    renderDay();
  } catch (err) {
    toast('ย้ายมื้อไม่สำเร็จ: ' + err.message, 'err');
    btn.disabled = false;
  }
}

function setFoodScanStatus(text, tone = 'busy') {
  const el = $('#f-scan-status', root);
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
  el.classList.remove('text-slate-500', 'text-green-700', 'text-rose-600', 'font-semibold');
  if (tone === 'ok') el.classList.add('text-green-700', 'font-semibold');
  else if (tone === 'err') el.classList.add('text-rose-600');
  else el.classList.add('text-slate-500');
}

// ---------- Unified multi-image scan (Barcode -> Label / Dish) ----------
async function scanSingleFoodFile(file, { signal } = {}) {
  if ('BarcodeDetector' in window) {
    let code = null;
    try { code = await detectBarcode(file); } catch { code = null; }
    if (code) {
      try {
        const hits = await barcodeOff(code);
        if (hits.length) {
          const hit = hits[0];
          const grams = hit.servingGrams || 100;
          const k = grams / 100;
          const p = hit.per100 || {};
          return {
            sourceType: 'barcode',
            barcode: code,
            name: `${hit.name}${hit.brand ? ' · ' + hit.brand : ''}`,
            unit: `${grams}g`,
            gramsPerUnit: grams,
            calories: Math.round((p.calories || 0) * k),
            protein: p.protein != null ? round1(p.protein * k) : '',
            carbs: p.carbs != null ? round1(p.carbs * k) : '',
            fat: p.fat != null ? round1(p.fat * k) : '',
            sugar: p.sugar != null ? round1(p.sugar * k) : '',
            sodium: p.sodium != null ? Math.round(p.sodium * k) : '',
            notes: `บาร์โค้ด ${code}`
          };
        }
      } catch {
        // Fallback to AI label/dish analysis if barcode lookup fails or is unavailable offline
      }
    }
  }

  const localLabel = await readNutritionLabelLocally(file);
  if (isLocalNutritionSufficient(localLabel)) {
    const per100 = localLabel.basis === 'per_100g';
    return {
      sourceType: 'label',
      basis: localLabel.basis || 'unknown',
      name: 'สินค้าจากฉลาก',
      unit: per100 ? '100 กรัม' : 'หน่วย',
      gramsPerUnit: per100 ? 100 : null,
      calories: localLabel.calories != null ? Math.round(localLabel.calories) : '',
      protein: localLabel.protein != null ? round1(localLabel.protein) : '',
      carbs: localLabel.carbs != null ? round1(localLabel.carbs) : '',
      fat: localLabel.fat != null ? round1(localLabel.fat) : '',
      sugar: localLabel.sugar != null ? round1(localLabel.sugar) : '',
      sodium: localLabel.sodium != null ? Math.round(localLabel.sodium) : '',
      notes: 'อ่านด้วย OCR ในเครื่อง (0 โทเค็น)'
    };
  }

  const r = await analyzeFoodImage(file, { signal, precheckedLocalLabel: localLabel });
  const isLabel = r.kind === 'label';
  const per100 = r.basis === 'per_100g';
  const unit = isLabel
    ? (per100 ? '100 กรัม' : (r.basis === 'per_serving' ? (r.servingSizeText || 'หน่วยบริโภค') : 'หน่วย'))
    : 'จาน/ที่';
  const gramsPerUnit = isLabel
    ? (per100 ? 100 : (r.basis === 'per_serving' && Number.isFinite(r.servingGrams) ? r.servingGrams : null))
    : null;
  return {
    sourceType: isLabel ? 'label' : 'dish',
    basis: r.basis || 'unknown',
    name: (r.name || '').trim() || (isLabel ? 'สินค้าจากฉลาก' : 'เมนูอาหารจากภาพ'),
    unit,
    gramsPerUnit,
    calories: r.calories != null ? Math.round(r.calories) : '',
    protein: r.protein != null ? round1(r.protein) : '',
    carbs: r.carbs != null ? round1(r.carbs) : '',
    fat: r.fat != null ? round1(r.fat) : '',
    sugar: r.sugar != null ? round1(r.sugar) : '',
    sodium: r.sodium != null ? Math.round(r.sodium) : '',
    notes: r.notes || ''
  };
}

function openBatchFoodScanModal(results, errors, onCleanup = null) {
  const defaultDate = $('#f-date', root)?.value || localDateStr();
  const meals = getMeals();
  const currentMealId = $('#f-meal', root)?.value || meals[0]?.id || '';
  const sourceLabels = {
    barcode: 'บาร์โค้ด',
    label: 'ฉลากโภชนาการ',
    dish: 'จานอาหาร'
  };

  const m = openModal(`
    <div class="flex justify-between items-center gap-2 mb-2">
      <h3 class="font-bold text-lg text-slate-800">ตรวจสอบผลสแกนอาหาร (${results.length} รูป)</h3>
      <button data-close type="button" class="text-slate-400 hover:text-slate-700 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <p class="text-xs text-green-700 font-semibold bg-ok-soft rounded-xl px-3 py-2 mb-3">
      ✓ ประมวลผลเสร็จสิ้น ${results.length} รายการ${errors.length ? ` · ไม่สำเร็จ ${errors.length} รูป` : ''} (ไม่เก็บรูปภาพลงระบบ · ตรวจสอบและแก้ไขได้ก่อนบันทึก)
    </p>
    ${errors.length ? `<div class="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 mb-3">${errors.map(x => `<p>• ${esc(x.fileName)}: ${esc(x.message)}</p>`).join('')}</div>` : ''}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
      <div><label class="lbl" for="bfs-date">วันที่บันทึก</label><input id="bfs-date" type="date" class="input min-h-[44px]" value="${esc(defaultDate)}"></div>
      <div><label class="lbl" for="bfs-meal">มื้ออาหาร</label><select id="bfs-meal" class="input min-h-[44px]">${meals.map(x => `<option value="${esc(x.id)}" ${x.id === currentMealId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    </div>
    <div class="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
      ${results.map((r, i) => {
        const d = r.data || {};
        const badgeText = sourceLabels[d.sourceType] || sourceLabels.dish;
        return `<div class="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3" data-bfs-row="${i}">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <label class="inline-flex items-center gap-2 min-h-[44px] text-xs font-semibold text-slate-800 cursor-pointer min-w-0">
              <input type="checkbox" class="bfs-chk w-4 h-4 accent-violet-500 shrink-0" checked>
              <span class="truncate">รูปที่ ${i + 1} (${esc(r.fileName)})</span>
            </label>
            <span class="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">${badgeText}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-[190px_minmax(0,1fr)] gap-3.5 items-start">
            <div class="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center min-h-[9rem] md:min-h-[11.5rem]">
              ${r.previewUrl
                ? `<img src="${esc(r.previewUrl)}" alt="${esc(r.fileName)}" class="w-full max-h-48 md:h-46 object-contain">`
                : `<div class="p-4 text-center text-xs text-slate-400 space-y-1">${iconSvg('image', { size: 22 })}<p>ไม่มีตัวอย่างภาพ</p></div>`}
            </div>
            <div class="min-w-0 space-y-2.5">
              ${d.notes ? `<p class="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">${esc(d.notes)}</p>` : ''}
              <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div class="sm:col-span-2"><label class="lbl">ชื่อเมนู *</label><input class="input bfs-name text-xs font-semibold min-h-[44px]" value="${esc(d.name || '')}"></div>
                <div><label class="lbl">จำนวน</label><input type="number" step="0.1" min="0.1" class="input bfs-qty text-xs min-h-[44px]" value="1"></div>
                <div><label class="lbl">หน่วย</label><input class="input bfs-unit text-xs min-h-[44px]" value="${esc(d.unit || 'หน่วย')}"></div>
              </div>
              <div class="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                <div><label class="lbl">kcal *</label><input type="number" min="0" step="1" class="input bfs-cal min-h-[44px]" value="${esc(d.calories)}"></div>
                <div><label class="lbl">P (g)</label><input type="number" min="0" step="0.1" class="input bfs-pro min-h-[44px]" value="${esc(d.protein)}"></div>
                <div><label class="lbl">C (g)</label><input type="number" min="0" step="0.1" class="input bfs-carb min-h-[44px]" value="${esc(d.carbs)}"></div>
                <div><label class="lbl">F (g)</label><input type="number" min="0" step="0.1" class="input bfs-fat min-h-[44px]" value="${esc(d.fat)}"></div>
                <div><label class="lbl">น้ำตาล (g)</label><input type="number" min="0" step="0.1" class="input bfs-sugar min-h-[44px]" value="${esc(d.sugar)}"></div>
                <div><label class="lbl">โซเดียม (mg)</label><input type="number" min="0" step="1" class="input bfs-sodium min-h-[44px]" value="${esc(d.sodium)}"></div>
              </div>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <label class="inline-flex items-center gap-2 min-h-[44px] text-xs text-slate-600 mt-3 cursor-pointer"><input id="bfs-save-lib" type="checkbox" class="w-4 h-4 accent-violet-500"> บันทึกเมนูที่ยังไม่มีเข้า "คลังอาหารของฉัน" ด้วย</label>
    <div class="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-3">
      <button type="button" data-close class="btn btn-ghost min-h-[44px] justify-center">ยกเลิก</button>
      <button type="button" id="bfs-save" class="btn btn-primary min-h-[44px] justify-center">${iconSvg('check', { size: 15 })} ยืนยันบันทึกเข้ามื้ออาหาร</button>
    </div>`, { size: 'xl', onClose: onCleanup });

  $('#bfs-save', m.el).addEventListener('click', async () => {
    if (guardPreviewWrite('การบันทึกอาหารจากรูปภาพ')) return;
    const date = $('#bfs-date', m.el).value;
    const mealSel = $('#bfs-meal', m.el);
    const mealId = mealSel.value;
    const meal = mealSel.selectedOptions[0]?.textContent || '';
    if (!date || !mealId) return toast('เลือกวันที่และมื้ออาหารก่อนบันทึก', 'err');

    const rows = [...m.el.querySelectorAll('[data-bfs-row]')];
    const itemsToSave = [];
    for (const row of rows) {
      if (!row.querySelector('.bfs-chk')?.checked) continue;
      const idx = Number(row.dataset.bfsRow);
      const orig = results[idx]?.data || {};
      const name = row.querySelector('.bfs-name').value.trim();
      const qty = Number(row.querySelector('.bfs-qty').value);
      const portionUnit = row.querySelector('.bfs-unit').value.trim() || 'หน่วย';
      const calRaw = row.querySelector('.bfs-cal').value;
      const cal = Number(calRaw);
      if (!name || !Number.isFinite(qty) || qty <= 0 || calRaw === '' || !Number.isFinite(cal) || cal < 0) {
        return toast('ตรวจสอบชื่อ จำนวน และแคลอรี่ในรายการที่เลือกให้ถูกต้องก่อนบันทึก', 'err');
      }
      const pro = toNum(row.querySelector('.bfs-pro').value) ?? 0;
      const carb = toNum(row.querySelector('.bfs-carb').value) ?? 0;
      const fat = toNum(row.querySelector('.bfs-fat').value) ?? 0;
      const sugar = toNum(row.querySelector('.bfs-sugar').value);
      const sodium = toNum(row.querySelector('.bfs-sodium').value);
      const unitNutrition = {
        calories: cal,
        protein: pro,
        carbs: carb,
        fat,
        ...(sugar !== null && { sugar }),
        ...(sodium !== null && { sodium })
      };
      itemsToSave.push({
        name: foodLogName(name),
        quantity: qty,
        portionUnit: portionUnit.slice(0, 24),
        gramsPerUnit: Number.isFinite(orig.gramsPerUnit) ? orig.gramsPerUnit : null,
        unitNutrition,
        calories: Math.round(cal * qty),
        protein: round1(pro * qty),
        carbs: round1(carb * qty),
        fat: round1(fat * qty),
        ...(sugar !== null && { sugar: round1(sugar * qty) }),
        ...(sodium !== null && { sodium: Math.round(sodium * qty) })
      });
    }
    if (!itemsToSave.length) return toast('เลือกอย่างน้อย 1 รายการก่อนบันทึก', 'err');

    const btn = $('#bfs-save', m.el);
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      const now = new Date();
      const commits = [];
      for (let i = 0; i < itemsToSave.length; i += 450) {
        const batch = writeBatch(db);
        const colRef = userCol(state.uid, 'food_records');
        itemsToSave.slice(i, i + 450).forEach(rec => {
          batch.set(doc(colRef), { date, mealId, meal, ...rec, createdAt: now });
        });
        commits.push(batch.commit());
      }

      let addedToLib = 0;
      if ($('#bfs-save-lib', m.el).checked) {
        const identity = n => String(n).trim().toLocaleLowerCase('th').replace(/\s+/g, ' ');
        const existingNames = new Set([...state.customFoods, ...DEFAULT_PRESETS].map(x => identity(x.name)));
        const seen = new Set();
        const batch = writeBatch(db);
        const libRef = userCol(state.uid, 'custom_foods');
        itemsToSave.forEach(item => {
          const k = identity(item.name);
          if (!existingNames.has(k) && !seen.has(k)) {
            seen.add(k);
            batch.set(doc(libRef), {
              name: item.name,
              brand: '',
              unit: item.portionUnit || 'หน่วย',
              gramsPerUnit: item.gramsPerUnit,
              defaultQuantity: 1,
              category: guessFoodCategory(item.name),
              calories: item.unitNutrition.calories,
              protein: item.unitNutrition.protein,
              carbs: item.unitNutrition.carbs,
              fat: item.unitNutrition.fat,
              sugar: item.unitNutrition.sugar ?? null,
              sodium: item.unitNutrition.sodium ?? null,
              favorite: false,
              createdAt: now
            });
            addedToLib++;
          }
        });
        if (addedToLib) commits.push(batch.commit());
      }

      Promise.all(commits).catch(err => toast('บันทึกไม่สำเร็จ: ' + err.message, 'err'));
      if ($('#f-date', root) && $('#f-date', root).value !== date) {
        $('#f-date', root).value = date;
        watchDay();
      }
      if ($('#f-meal', root) && mealId) $('#f-meal', root).value = mealId;
      setFoodScanStatus('', 'busy');
      m.close();
      toast(`บันทึก ${itemsToSave.length} รายการลง${meal}แล้ว${addedToLib ? ` · เพิ่มเข้าคลัง ${addedToLib} เมนู` : ''}`);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `${iconSvg('check', { size: 15 })} ยืนยันบันทึกเข้ามื้ออาหาร`;
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
    }
  });
}

async function onUnifiedScan(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;

  const previewUrls = files.map(file => {
    try { return URL.createObjectURL(file); } catch { return ''; }
  });
  const revokeAllPreviews = () => {
    previewUrls.forEach(url => {
      if (url) {
        try { URL.revokeObjectURL(url); } catch {}
      }
    });
  };

  setFoodScanStatus(formatImageProgress('กำลังวิเคราะห์', { total: files.length, activeIndex: 1, completed: 0, percent: 0 }), 'busy');
  try {
    const { results, errors } = await runImageBatch(
      files,
      (file, _idx, opts) => scanSingleFoodFile(file, opts),
      info => setFoodScanStatus(formatImageProgress('กำลังวิเคราะห์', info), 'busy'),
      { concurrency: 2 }
    );
    if (!results.length && errors.length) {
      revokeAllPreviews();
      setFoodScanStatus(errors[0].message, 'err');
      return toast(errors[0].message, 'err');
    }
    results.forEach(r => { r.previewUrl = previewUrls[r.index] || ''; });
    setFoodScanStatus(`✓ ประมวลผลครบ ${files.length}/${files.length} รูป (สำเร็จ ${results.length}) — ตรวจสอบและยืนยัน`, 'ok');
    openBatchFoodScanModal(results, errors, revokeAllPreviews);
  } catch (err) {
    revokeAllPreviews();
    const msg = explainGeminiError(err);
    setFoodScanStatus(msg, 'err');
    toast(msg, 'err');
  }
}


// ---------- Custom food library ----------
export function openLibrary(onPick) {
  const meals = getMeals();
  const currentMealId = $('#f-meal', root)?.value || meals[0]?.id || '';
  const m = openModal(`
    <div class="flex justify-between items-center gap-2 mb-3">
      <h3 class="font-bold text-lg text-slate-800 inline-flex items-center gap-2">${iconSvg('book', { size: 18, className: 'text-brand' })}<span>คลังอาหารของฉัน</span></h3>
      <button data-close type="button" class="text-slate-400 hover:text-slate-700 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <div class="flex flex-col sm:flex-row gap-2 mb-2.5">
      <input id="lib-q" class="input min-h-[44px] flex-1" placeholder="ค้นหาชื่อเมนูหรือยี่ห้อ...">
      <select id="lib-category" class="input min-h-[44px] sm:max-w-52"><option value="">ทุกหมวดหมู่</option>${categoryNames.map(c => `<option>${esc(c)}</option>`).join('')}</select>
      <button id="lib-add" type="button" class="btn btn-primary min-h-[44px] justify-center whitespace-nowrap">${iconSvg('plus', { size: 15 })} เพิ่มเมนู</button>
    </div>
    <div class="flex flex-wrap items-center gap-2 mb-3 text-xs">
      <span class="text-slate-500">วันที่เพิ่มเมนู:</span>
      <input id="lib-from" type="date" class="input !w-auto min-h-[44px] text-xs" aria-label="ตั้งแต่วันที่">
      <span class="text-slate-400">–</span>
      <input id="lib-to" type="date" class="input !w-auto min-h-[44px] text-xs" aria-label="ถึงวันที่">
      <button id="lib-date-clear" type="button" class="btn btn-ghost min-h-[44px] px-3 py-1.5 text-xs hidden">ล้างวันที่</button>
    </div>
    <div id="lib-bulk" class="space-y-2 mb-3 rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs">
      <div class="flex flex-wrap items-center gap-2">
        <label class="inline-flex items-center gap-2 min-h-[44px] cursor-pointer font-medium text-slate-700"><input id="lib-select-visible" type="checkbox" class="w-4 h-4 accent-violet-500"> เลือกทั้งหมดที่แสดง (<span id="lib-visible-count">0</span>)</label>
        <span class="text-slate-500">เลือกแล้ว <b id="lib-selected-count">0</b></span>
        <div class="flex flex-wrap items-center gap-1.5 ml-auto">
          <select id="lib-add-meal" class="input !w-auto min-h-[44px] !py-1.5 !px-2.5 text-xs" aria-label="มื้ออาหารที่จะเพิ่ม">${meals.map(x => `<option value="${esc(x.id)}" ${x.id === currentMealId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          <button id="lib-add-to-meal" type="button" class="btn btn-primary min-h-[44px] px-3 py-1.5 text-xs font-semibold" disabled>${iconSvg('plus', { size: 13 })} เพิ่มที่เลือกลงมื้อ</button>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80">
        <select id="lib-bulk-category" class="input !w-auto min-w-36 min-h-[44px] !py-1.5 text-xs"><option value="">เปลี่ยนหมวดหมู่ (เมนูของฉัน)</option>${categoryNames.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        <button id="lib-change-category" type="button" class="btn btn-ghost min-h-[44px] px-3 py-1.5 text-xs" disabled>แก้หมวดหมู่</button>
        <button id="lib-delete-selected" type="button" class="btn btn-ghost min-h-[44px] px-3 py-1.5 text-xs text-rose-700" disabled>ลบเมนูที่เลือก</button>
      </div>
    </div>
    <div class="hidden md:grid md:grid-cols-[auto_minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.25fr)_auto] gap-3 px-3 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-t-xl">
      <span class="w-4"></span><span>ชื่อเมนู</span><span>หมวด / ยี่ห้อ</span><span>หน่วย</span><span>พลังงาน &amp; สารอาหาร</span><span class="text-right">จัดการ</span>
    </div>
    <div id="lib-list" class="space-y-2 md:space-y-0 md:border-x md:border-b md:border-slate-200 md:rounded-b-xl md:divide-y md:divide-slate-100 max-h-[50vh] overflow-y-auto"></div>`, { size: 'xl' });
  const selected = new Set();
  const itemDateStr = p => {
    const raw = p.createdAt || p.updatedAt;
    if (!raw) return '';
    const d = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    return Number.isNaN(d.getTime()) ? '' : localDateStr(d);
  };
  const matches = p => {
    const from = $('#lib-from', m.el).value;
    const to = $('#lib-to', m.el).value;
    if (!label(p).toLowerCase().includes($('#lib-q', m.el).value.toLowerCase())) return false;
    if ($('#lib-category', m.el).value && (p.category || guessFoodCategory(p.name)) !== $('#lib-category', m.el).value) return false;
    if (from || to) {
      const ds = itemDateStr(p);
      if (!ds) return false;
      if (from && ds < from) return false;
      if (to && ds > to) return false;
    }
    return true;
  };
  const visibleItems = () => getPresets().filter(matches);
  const render = () => {
    const from = $('#lib-from', m.el).value;
    const to = $('#lib-to', m.el).value;
    $('#lib-date-clear', m.el).classList.toggle('hidden', !from && !to);
    const presets = visibleItems();
    const customSelectedCount = state.customFoods.filter(f => selected.has(f.id)).length;
    const allVisibleSelected = presets.length > 0 && presets.every(p => selected.has(p.id));
    $('#lib-select-visible', m.el).checked = allVisibleSelected;
    $('#lib-select-visible', m.el).disabled = presets.length === 0;
    $('#lib-visible-count', m.el).textContent = presets.length;
    $('#lib-selected-count', m.el).textContent = selected.size;
    $('#lib-add-to-meal', m.el).disabled = selected.size === 0;
    $('#lib-delete-selected', m.el).disabled = customSelectedCount === 0;
    $('#lib-change-category', m.el).disabled = customSelectedCount === 0 || !$('#lib-bulk-category', m.el).value;
    $('#lib-list', m.el).innerHTML = presets.map((p, i) => {
      const catText = p.category || guessFoodCategory(p.name);
      const brandAndCat = [p.brand, catText].filter(Boolean).join(' · ');
      const nutritionText = `${p.calories} kcal · P ${p.protein ?? '-'} · C ${p.carbs ?? '-'} · F ${p.fat ?? '-'}${p.sugar != null ? ' · น้ำตาล ' + p.sugar : ''}${p.sodium != null ? ' · Na ' + p.sodium : ''}`;
      return `
      <div class="food-library-item rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 md:space-y-0 md:rounded-none md:border-0 md:grid md:grid-cols-[auto_minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.25fr)_auto] md:items-center md:gap-3">
        <div class="flex items-start gap-2.5 min-w-0 md:contents">
          <input type="checkbox" class="lib-select w-4 h-4 mt-1 md:mt-0 shrink-0 accent-violet-500" data-select="${esc(p.id)}" aria-label="เลือก ${esc(label(p))}" ${selected.has(p.id) ? 'checked' : ''}>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-slate-800 truncate">${p.favorite ? '<span class="text-amber-500 mr-1" aria-label="โปรด">★</span>' : ''}${esc(p.name)}</p>
            <p class="text-xs text-slate-500 md:hidden">${esc(brandAndCat)} · ${esc(p.unit || 'หน่วย')}</p>
            <p class="text-xs text-slate-600 tabular-nums md:hidden mt-0.5">${esc(nutritionText)}</p>
          </div>
          <div class="hidden md:block min-w-0 text-xs text-slate-600 truncate">${esc(brandAndCat)}</div>
          <div class="hidden md:block min-w-0 text-xs text-slate-700 font-medium truncate">${esc(p.unit || 'หน่วย')}</div>
          <div class="hidden md:block min-w-0 text-xs text-slate-600 tabular-nums truncate">${esc(nutritionText)}</div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 md:justify-end">
          <button type="button" data-pick="${i}" class="btn btn-primary min-h-[44px] px-3.5 py-1.5 text-xs">เลือก</button>
          ${p.custom
            ? `${p.hiwpinto ? `<button type="button" data-hp="${esc(p.id)}" class="btn btn-ghost min-h-[44px] px-3 py-1.5 text-xs">ปรับข้าว</button>` : ''}<button type="button" data-fav="${esc(p.id)}" class="tm-food-action-btn is-fav ${p.favorite ? 'is-active' : ''}" aria-label="โปรด">${iconSvg('star', { size: 15 })}</button><button type="button" data-edit="${esc(p.id)}" class="tm-food-action-btn" aria-label="แก้ไข ${esc(p.name)}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button><button type="button" data-rm="${esc(p.id)}" class="tm-food-action-btn is-del" aria-label="ลบ ${esc(p.name)}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>`
            : `<button type="button" data-fav-default="${esc(p.id)}" class="tm-food-action-btn is-fav ${p.favorite ? 'is-active' : ''}" aria-label="โปรด">${iconSvg('star', { size: 15 })}</button>`}
        </div>
      </div>`;
    }).join('') || '<p class="text-sm text-slate-500 py-6 text-center">ไม่พบรายการที่ตรงกับเงื่อนไข</p>';
  };
  $('#lib-q', m.el).addEventListener('input', render);
  $('#lib-category', m.el).addEventListener('change', render);
  $('#lib-from', m.el).addEventListener('change', render);
  $('#lib-to', m.el).addEventListener('change', render);
  $('#lib-date-clear', m.el).addEventListener('click', () => { $('#lib-from', m.el).value = ''; $('#lib-to', m.el).value = ''; render(); });
  $('#lib-add', m.el).addEventListener('click', () => openFoodEditor({}));
  $('#lib-select-visible', m.el).addEventListener('change', e => {
    visibleItems().forEach(p => e.target.checked ? selected.add(p.id) : selected.delete(p.id));
    render();
  });
  $('#lib-add-to-meal', m.el).addEventListener('click', async () => {
    if (guardPreviewWrite('การเพิ่มหลายเมนูจากคลัง')) return;
    const picked = getPresets().filter(p => selected.has(p.id));
    if (!picked.length || !state.uid) return;
    const date = $('#f-date', root)?.value || localDateStr();
    const mealSel = $('#lib-add-meal', m.el);
    const mealId = mealSel.value;
    const meal = mealSel.selectedOptions[0]?.textContent || '';
    const btn = $('#lib-add-to-meal', m.el);
    btn.disabled = true;
    try {
      const now = new Date();
      const commits = [];
      for (let i = 0; i < picked.length; i += 450) {
        const chunk = picked.slice(i, i + 450);
        const batch = writeBatch(db);
        const colRef = userCol(state.uid, 'food_records');
        chunk.forEach(p => {
          const qty = p.defaultQuantity ?? 1;
          const unitNutrition = {
            calories: p.calories || 0,
            protein: p.protein ?? 0,
            carbs: p.carbs ?? 0,
            fat: p.fat ?? 0,
            sugar: p.sugar ?? null,
            sodium: p.sodium ?? null
          };
          const rec = {
            date,
            mealId,
            meal,
            ...(p.custom && p.id && { customFoodId: p.id }),
            name: foodLogName(p.name),
            quantity: qty,
            portionUnit: p.unit || 'หน่วย',
            gramsPerUnit: Number.isFinite(p.gramsPerUnit) ? p.gramsPerUnit : null,
            unitNutrition,
            calories: Math.round(unitNutrition.calories * qty),
            protein: round1(unitNutrition.protein * qty),
            carbs: round1(unitNutrition.carbs * qty),
            fat: round1(unitNutrition.fat * qty),
            createdAt: now
          };
          if (unitNutrition.sugar !== null) rec.sugar = round1(unitNutrition.sugar * qty);
          if (unitNutrition.sodium !== null) rec.sodium = Math.round(unitNutrition.sodium * qty);
          batch.set(doc(colRef), rec);
        });
        commits.push(batch.commit());
      }
      Promise.all(commits).catch(err => toast('เพิ่มเมนูไม่สำเร็จ: ' + err.message, 'err'));
      if ($('#f-meal', root) && mealId) $('#f-meal', root).value = mealId;
      m.close();
      toast(`เพิ่ม ${picked.length} เมนูลง${meal}แล้ว`);
    } catch (err) {
      toast('เพิ่มเมนูไม่สำเร็จ: ' + err.message, 'err');
      btn.disabled = false;
    }
  });
  $('#lib-bulk-category', m.el).addEventListener('change', render);
  $('#lib-change-category', m.el).addEventListener('click', async () => {
    if (guardPreviewWrite('การเปลี่ยนหมวดหมู่หลายรายการ')) return;
    const category = $('#lib-bulk-category', m.el).value, foods = state.customFoods.filter(f => selected.has(f.id));
    if (!category || !foods.length) return;
    if (!confirm(`เปลี่ยนหมวดหมู่ของ ${foods.length} เมนูที่เลือกเป็น “${category}” หรือไม่?`)) return;
    try {
      const commits = [];
      for (let i = 0; i < foods.length; i += 450) {
        const batch = writeBatch(db);
        foods.slice(i, i + 450).forEach(f => batch.update(userDoc(state.uid, 'custom_foods', f.id), { category }));
        commits.push(batch.commit());
      }
      Promise.all(commits).catch(err => {
        foods.forEach(f => selected.add(f.id));
        toast('เปลี่ยนหมวดหมู่ไม่สำเร็จ: ' + err.message, 'err');
        render();
      });
      selected.clear();
      $('#lib-bulk-category', m.el).value = '';
      toast(`เปลี่ยนหมวดหมู่ให้ ${foods.length} เมนูแล้ว`);
      render();
    }
    catch (err) { toast('เปลี่ยนหมวดหมู่ไม่สำเร็จ: ' + err.message, 'err'); }
  });
  $('#lib-delete-selected', m.el).addEventListener('click', async () => {
    if (guardPreviewWrite('การลบเมนูหลายรายการ')) return;
    const foods = state.customFoods.filter(f => selected.has(f.id));
    if (!foods.length) return;
    const names = foods.slice(0, 5).map(f => `• ${f.name}`).join('\n');
    const more = foods.length > 5 ? `\nและอีก ${foods.length - 5} เมนู` : '';
    if (!confirm(`ลบเมนูที่เลือก ${foods.length} รายการออกจากคลังถาวร?\n\n${names}${more}`)) return;
    try {
      const commits = [];
      for (let i = 0; i < foods.length; i += 450) {
        const chunk = foods.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach(f => batch.delete(userDoc(state.uid, 'custom_foods', f.id)));
        commits.push(batch.commit());
        chunk.forEach(f => selected.delete(f.id));
      }
      Promise.all(commits).catch(err => {
        foods.forEach(f => selected.add(f.id));
        render();
        toast('ลบเมนูไม่สำเร็จ: ' + err.message, 'err');
      });
      toast(`ลบ ${foods.length} เมนูแล้ว`);
      render();
    } catch (err) {
      render();
      toast('ลบเมนูไม่สำเร็จ: ' + err.message, 'err');
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
    const list = visibleItems();
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
    else if (b.dataset.fav) { const f = state.customFoods.find(x => x.id === b.dataset.fav); updateCustomFood(state.uid, f.id, { favorite: !f.favorite }); }
    else if (b.dataset.rm && confirm('ลบเมนูนี้ออกจากคลัง?')) {
      selected.delete(b.dataset.rm);
      deleteCustomFood(state.uid, b.dataset.rm)
        .then(render)
        .catch(err => toast('ลบเมนูไม่สำเร็จ: ' + err.message, 'err'));
    }
  });
  on('customFoods', () => {
    if (!m.el.isConnected) return;
    const allIds = new Set(getPresets().map(f => f.id));
    selected.forEach(id => { if (!allIds.has(id)) selected.delete(id); });
    render();
  });
  render();
}

function renderFoodBulkPreview(container, { items: parsedItems, errors }) {
  if (!parsedItems.length && !errors.length) {
    container.innerHTML = '<p class="text-xs text-slate-500 text-center py-3">วางข้อความด้านบนเพื่อดูตารางตัวอย่างแบบเรียลไทม์ (ไม่ใช้ AI)</p>';
    return;
  }
  const totals = parsedItems.reduce((a, r) => ({
    kcal: a.kcal + r.calories,
    p: a.p + r.protein,
    c: a.c + r.carbs,
    f: a.f + r.fat
  }), { kcal: 0, p: 0, c: 0, f: 0 });
  const errHtml = errors.length
    ? `<div class="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 space-y-1 mb-2">${errors.map(e => `<p>• ${esc(e.error)}</p>`).join('')}</div>`
    : '';
  const tableHtml = parsedItems.length
    ? `<div class="rounded-xl border border-slate-200 overflow-x-auto">
        <div class="bg-lav-soft/40 px-3 py-1.5 text-xs font-semibold text-brand-dark flex flex-wrap justify-between gap-2 tabular-nums">
          <span>แปลงได้ ${parsedItems.length} รายการ</span>
          <span>รวม ${Math.round(totals.kcal)} kcal · P ${round1(totals.p)}g · C ${round1(totals.c)}g · F ${round1(totals.f)}g</span>
        </div>
        <table class="w-full text-xs text-left">
          <thead class="bg-slate-50 text-slate-600"><tr><th class="p-2">ชื่อเมนู</th><th class="p-2">ปริมาณ</th><th class="p-2 text-right">kcal</th><th class="p-2 text-right">P</th><th class="p-2 text-right">C</th><th class="p-2 text-right">F</th></tr></thead>
          <tbody class="divide-y divide-slate-100 tabular-nums">${parsedItems.map(r => `
            <tr><td class="p-2 font-medium text-slate-800">${esc(r.name)}</td><td class="p-2 text-slate-500">${esc(r.amountDisplay)}</td><td class="p-2 text-right font-semibold">${esc(r.calories)}</td><td class="p-2 text-right">${esc(r.protein)}</td><td class="p-2 text-right">${esc(r.carbs)}</td><td class="p-2 text-right">${esc(r.fat)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`
    : '';
  container.innerHTML = errHtml + tableHtml;
}

function openQuickBulkFoodLog() {
  const defaultDate = $('#f-date', root)?.value || localDateStr();
  const meals = getMeals();
  const currentMealId = $('#f-meal', root)?.value || meals[0]?.id || '';
  const sampleText = [
    'ยำวุ้นเส้นหมูสับ 1 จาน 280 kcal / P17 / C32 / F10',
    'ข้าวสวย 1.5 ทัพพี 200 kcal / P4 / C44 / F0',
    'อกไก่ต้ม 200 กรัม 330 kcal / P62 / C0 / F7',
    'อเมริกาโน่เย็น 15 kcal / P0 / C3 / F0'
  ].join('\n');

  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg text-slate-800 inline-flex items-center gap-1.5">${iconSvg('zap', { size: 17, className: 'text-brand' })}<span>เพิ่มอาหารหลายเมนูพร้อมกัน</span></h3><button data-close type="button" class="text-slate-400 hover:text-slate-700 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      <div><label class="lbl">วันที่บันทึก</label><input id="qb-date" type="date" class="input min-h-[44px]" value="${esc(defaultDate)}"></div>
      <div><label class="lbl">มื้ออาหาร</label><select id="qb-meal" class="input min-h-[44px]">${meals.map(x => `<option value="${esc(x.id)}" ${x.id === currentMealId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    </div>
    <div class="rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-600 mb-2 space-y-1">
      <p class="font-semibold text-slate-700">วาง 1 บรรทัดต่อ 1 เมนู (แปลงทันทีในเครื่อง ไม่เรียก AI):</p>
      <p class="font-mono text-[11px] text-slate-500">ยำวุ้นเส้นหมูสับ 1 จาน 280 kcal / P17 / C32 / F10</p>
      <p class="font-mono text-[11px] text-slate-500">ไก่ป๊อปสไปซี่ 1 ที่ ⇥ 380 ⇥ 20 g ⇥ 35 g ⇥ 18 g</p>
      <p class="text-[11px] text-slate-500">รองรับคัดลอกจากตาราง Excel/Google Sheets (5 หรือ 7 คอลัมน์), ทศนิยม (0.5 จาน, 1.5 ทัพพี, 200 กรัม), ไม่มีหน่วย, P17g C32g F10g และค่ามาโครขาดเป็น 0</p>
    </div>
    <div class="flex items-center justify-between mb-1">
      <label class="lbl !mb-0">ข้อความรายการอาหาร</label>
      <button id="qb-sample" type="button" class="text-xs text-brand font-semibold underline min-h-[44px] px-2 inline-flex items-center">ใส่ตัวอย่าง</button>
    </div>
    <textarea id="qb-input" class="input min-h-36 font-mono text-xs" placeholder="วางรายการอาหารหลายบรรทัดที่นี่..." spellcheck="false"></textarea>
    <div id="qb-preview" class="mt-3 max-h-60 overflow-y-auto"></div>
    <label class="flex items-center gap-2 text-xs text-slate-600 min-h-[44px] mt-2 cursor-pointer"><input id="qb-save-lib" type="checkbox" class="w-4 h-4 accent-violet-500"> บันทึกเมนูที่ยังไม่มีเข้า "คลังอาหารของฉัน" ด้วย</label>
    <div class="flex justify-end gap-2 mt-3">
      <button data-close type="button" class="btn btn-ghost min-h-[44px]">ยกเลิก</button>
      <button id="qb-save" type="button" class="btn btn-primary min-h-[44px]" disabled>บันทึกเข้ามื้ออาหาร</button>
    </div>
  `, { wide: true });

  let parsed = { items: [], errors: [] };
  const updatePreview = () => {
    parsed = parseBulkFoodText($('#qb-input', m.el).value);
    renderFoodBulkPreview($('#qb-preview', m.el), parsed);
    const saveBtn = $('#qb-save', m.el);
    saveBtn.disabled = parsed.items.length === 0 || parsed.errors.length > 0;
    saveBtn.textContent = parsed.items.length ? `บันทึก ${parsed.items.length} รายการเข้ามื้อ` : 'บันทึกเข้ามื้ออาหาร';
  };
  $('#qb-input', m.el).addEventListener('input', updatePreview);
  $('#qb-sample', m.el).addEventListener('click', () => {
    $('#qb-input', m.el).value = sampleText;
    updatePreview();
  });
  updatePreview();

  $('#qb-save', m.el).addEventListener('click', async () => {
    if (guardPreviewWrite('การเพิ่มอาหารหลายเมนู')) return;
    const date = $('#qb-date', m.el).value;
    const mealSel = $('#qb-meal', m.el);
    const mealId = mealSel.value;
    const meal = mealSel.selectedOptions[0]?.textContent || '';
    if (!date || !mealId || !parsed.items.length || parsed.errors.length) return;
    const saveBtn = $('#qb-save', m.el);
    saveBtn.disabled = true;
    saveBtn.textContent = 'กำลังบันทึก…';
    try {
      const batch = writeBatch(db);
      const colRef = userCol(state.uid, 'food_records');
      const now = new Date();
      parsed.items.forEach(item => {
        batch.set(doc(colRef), {
          date,
          mealId,
          meal,
          name: item.name,
          quantity: item.quantity,
          portionUnit: item.portionUnit,
          ...(item.gramsPerUnit !== null && { gramsPerUnit: item.gramsPerUnit }),
          unitNutrition: item.unitNutrition,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          createdAt: now
        });
      });

      let addedToLib = 0;
      if ($('#qb-save-lib', m.el).checked) {
        const identity = n => String(n).trim().toLocaleLowerCase('th').replace(/\s+/g, ' ');
        const existingNames = new Set([...state.customFoods, ...DEFAULT_PRESETS].map(x => identity(x.name)));
        const seen = new Set();
        const libRef = userCol(state.uid, 'custom_foods');
        parsed.items.forEach(item => {
          const key = identity(item.name);
          if (!existingNames.has(key) && !seen.has(key)) {
            seen.add(key);
            batch.set(doc(libRef), { ...item.libraryRecord, createdAt: now });
            addedToLib++;
          }
        });
      }

      batch.commit().catch(error => toast('บันทึกไม่สำเร็จ: ' + error.message, 'err'));
      if ($('#f-date', root) && $('#f-date', root).value !== date) {
        $('#f-date', root).value = date;
        watchDay();
      }
      m.close();
      toast(`บันทึก ${parsed.items.length} เมนูลง${meal}แล้ว${addedToLib ? ` · เพิ่มเข้าคลัง ${addedToLib} เมนู` : ''}`);
    } catch (error) {
      saveBtn.disabled = false;
      saveBtn.textContent = `บันทึก ${parsed.items.length} รายการเข้ามื้อ`;
      toast('บันทึกไม่สำเร็จ: ' + error.message, 'err');
    }
  });
}
