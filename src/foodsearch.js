import { $, esc, toNum, round1, openModal } from './util.js';
import {
  lookupPer100gWithProvider, getGeminiKey, getGroqKey, getOpenRouterKey, explainGeminiError
} from './nutrition.js';
import { state } from './state.js';
import { reportRuntimeError } from './runtimeErrorMonitor.js';
import { iconSvg } from './icons.js';

// แหล่งข้อมูลโภชนาการ (ทุกแหล่งใช้ฟรี ไม่ต้องผูกบัตร)
//  all    = ค้นตามลำดับ: คลังในเครื่อง → USDA → Open Food Facts → AI (Gemini → Groq → OpenRouter)
//  off    = Open Food Facts: สินค้าบรรจุภัณฑ์ทั่วโลกรวมของไทย + ค้นด้วยบาร์โค้ด (ไม่ต้องใช้คีย์, จำกัด ~10 ครั้ง/นาที)
//  usda   = USDA FoodData Central: อาหารทั่วไป/วัตถุดิบ ค้นด้วยชื่อภาษาอังกฤษ (มี DEMO_KEY ให้ใช้)
//  gemini = AI (Gemini → Groq → OpenRouter): อาหารไทย/เมนูทั่วไป (ประมาณค่า)
export const SOURCES = {
  off: 'Open Food Facts — สินค้า/ขนมซอง/บาร์โค้ด (ไม่ต้องใช้คีย์)',
  usda: 'USDA — วัตถุดิบทั่วไป (DEMO_KEY พร้อมใช้)',
  gemini: 'AI (Gemini → Groq → OpenRouter) — อาหารไทย/เมนูทั่วไป (ประมาณค่า)'
};
const K_USDA = 'usda_key', USDA_DEMO_KEY = 'DEMO_KEY';
export const getUsdaKey = () => localStorage.getItem(K_USDA) || USDA_DEMO_KEY;
export const setUsdaKey = k => k && k.trim() !== USDA_DEMO_KEY
  ? localStorage.setItem(K_USDA, k.trim())
  : localStorage.removeItem(K_USDA);

const THAI_FOOD_TRANSLATIONS = {
  'ข้าวมันไก่': 'chicken rice', 'ข้าวผัด': 'fried rice', 'ข้าวเหนียว': 'sticky rice',
  'ข้าวกล้อง': 'brown rice', 'ข้าวสวย': 'cooked white rice', 'ข้าวโอ๊ต': 'oats',
  'ข้าวต้ม': 'rice porridge', 'ข้าวโพด': 'corn',
  'ต้มยำกุ้ง': 'tom yum shrimp soup', 'ผัดไทย': 'pad thai', 'ส้มตำ': 'papaya salad',
  'ก๋วยเตี๋ยว': 'rice noodles', 'หมูปิ้ง': 'grilled pork', 'หมูย่าง': 'grilled pork',
  'หมูสับ': 'ground pork', 'หมูทอด': 'fried pork', 'ไก่ทอด': 'fried chicken',
  'ไก่ต้ม': 'boiled chicken', 'น่องไก่': 'chicken drumstick', 'อกไก่': 'chicken breast',
  'ไข่ต้ม': 'boiled egg', 'ไข่ดาว': 'fried egg', 'ไข่เจียว': 'omelet',
  'ไข่ลวก': 'soft-boiled egg', 'ไข่ขาว': 'egg white', 'ไข่แดง': 'egg yolk',
  'นมถั่วเหลือง': 'soy milk', 'มันฝรั่ง': 'potato', 'มันเทศ': 'sweet potato',
  'มันบด': 'mashed potato', 'ผักโขม': 'spinach', 'บรอกโคลี': 'broccoli',
  'กะหล่ำปลี': 'cabbage', 'ผักบุ้ง': 'water spinach', 'ถั่วลิสง': 'peanut',
  'เนื้อวัว': 'beef', 'ปลากระป๋อง': 'canned fish', 'ปลาทู': 'mackerel',
  'ทูน่า': 'tuna', 'แซลมอน': 'salmon', 'โยเกิร์ต': 'yogurt',
  'อะโวคาโด': 'avocado', 'แอปเปิ้ล': 'apple', 'แอปเปิล': 'apple',
  'สับปะรด': 'pineapple', 'แตงโม': 'watermelon', 'มะม่วง': 'mango',
  'น้ำส้ม': 'orange juice', 'น้ำมะพร้าว': 'coconut water',
  'น้ำตาล': 'sugar', 'น้ำปลา': 'fish sauce', 'น้ำมัน': 'cooking oil',
  'ขนมปัง': 'bread', 'เต้าหู้': 'tofu', 'มะพร้าว': 'coconut',
  'น้ำผึ้ง': 'honey', 'ฟักทอง': 'pumpkin', 'เห็ด': 'mushroom',
  'กาแฟ': 'coffee', 'ชา': 'tea', 'โกโก้': 'cocoa',
  'ไก่': 'chicken', 'หมู': 'pork', 'เนื้อ': 'beef', 'ปลา': 'fish',
  'กุ้ง': 'shrimp', 'ไข่': 'egg', 'นม': 'milk', 'ชีส': 'cheese', 'ส้ม': 'orange',
  'ข้าว': 'cooked rice', 'น้ำ': 'water', 'และ': 'and', 'กับ': 'and',
  'มัน': 'potato', 'ถั่ว': 'beans', 'แครอท': 'carrot', 'แตงกวา': 'cucumber',
  'มะเขือเทศ': 'tomato', 'หอมหัวใหญ่': 'onion', 'กระเทียม': 'garlic'
};
const thaiFoodTerms = Object.keys(THAI_FOOD_TRANSLATIONS)
  .sort((a, b) => b.length - a.length)
  .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const thaiFoodTermPattern = new RegExp(thaiFoodTerms.join('|'), 'g');

export function translateThaiFoodQuery(query) {
  return String(query || '').replace(thaiFoodTermPattern, term => ` ${THAI_FOOD_TRANSLATIONS[term]} `)
    .replace(/\s+/g, ' ').trim();
}

const FOOD_SEARCH_CACHE = 'trackme_foodsearch_v1';
const FOOD_SEARCH_CACHE_TTL_MS = 7 * 864e5;
const FOOD_SEARCH_CACHE_MAX = 60;

function cacheGet(key) {
  try {
    if (typeof localStorage === 'undefined' || !key) return null;
    const c = JSON.parse(localStorage.getItem(FOOD_SEARCH_CACHE) || '{}');
    const e = c[key];
    return e && Date.now() - e.t < FOOD_SEARCH_CACHE_TTL_MS ? e.v : null;
  } catch {
    return null;
  }
}

function cachePut(key, v) {
  try {
    if (typeof localStorage === 'undefined' || !key || !Array.isArray(v) || !v.length) return;
    const c = JSON.parse(localStorage.getItem(FOOD_SEARCH_CACHE) || '{}');
    c[key] = { t: Date.now(), v };
    const keys = Object.keys(c).sort((a, b) => (c[a]?.t || 0) - (c[b]?.t || 0));
    keys.slice(0, Math.max(0, keys.length - FOOD_SEARCH_CACHE_MAX)).forEach(k => delete c[k]);
    localStorage.setItem(FOOD_SEARCH_CACHE, JSON.stringify(c));
  } catch {
    // Ignore storage quota errors
  }
}

export function usdaCacheKey(q) {
  const en = translateThaiFoodQuery(q);
  return 'usda|' + (en || String(q || '')).toLowerCase().trim().replace(/\s+/g, ' ');
}

const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : (typeof x === 'string' && x.trim() !== '' && Number.isFinite(+x) ? +x : null));
const r1 = x => (x === null ? null : round1(x));

async function getJson(url, timeoutMs = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (res.status === 429) throw new Error('เรียกถี่เกินโควตา (429) — รอสักครู่แล้วลองใหม่');
    if (res.status === 403) throw new Error('ถูกปฏิเสธ (403) — ตรวจคีย์ หรือเซิร์ฟเวอร์จำกัดการเข้าถึง');
    if (!res.ok) throw new Error('เซิร์ฟเวอร์ตอบ HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('หมดเวลาเชื่อมต่อ');
    if (e instanceof TypeError) throw new Error('เชื่อมต่อไม่ได้ (ออฟไลน์ หรือเซิร์ฟเวอร์ไม่อนุญาตการเรียกจากเบราว์เซอร์)');
    throw e;
  } finally { clearTimeout(t); }
}

// ---- Open Food Facts ----
const offHits = [];
function offRateOk() {
  const now = Date.now();
  while (offHits.length && now - offHits[0] > 60000) offHits.shift();
  if (offHits.length >= 8) throw new Error('Open Food Facts จำกัดการค้นหา ~10 ครั้ง/นาที — รอสักครู่');
  offHits.push(now);
}
function fromOff(p) {
  const m = p.nutriments || {};
  let kcal = num(m['energy-kcal_100g']);
  if (kcal === null) { const kj = num(m['energy_100g'] ?? m['energy-kj_100g']); if (kj !== null) kcal = kj / 4.184; }
  if (kcal === null) return null;
  const na = num(m.sodium_100g), salt = num(m.salt_100g);
  const name = (p.product_name || '').toString().trim();
  if (!name) return null;
  return {
    source: 'off', code: p.code, name, brand: (Array.isArray(p.brands) ? p.brands.join(', ') : (p.brands || '')).toString().split(',')[0].trim(),
    per100: { calories: Math.round(kcal), protein: r1(num(m.proteins_100g)), carbs: r1(num(m.carbohydrates_100g)), fat: r1(num(m.fat_100g)), sugar: r1(num(m.sugars_100g)),
      sodium: na !== null ? Math.round(na * 1000) : (salt !== null ? Math.round(salt * 400) : null) },
    servingGrams: num(p.serving_quantity), servingText: p.serving_size || ''
  };
}
const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity';
export async function searchOff(q) {
  const cacheKey = 'off|' + String(q || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  offRateOk();
  const enc = encodeURIComponent(q);
  // Start with Open Food Facts' plain-text search. The v2 structured endpoint does not support free-text search.
  let firstError = null;
  try {
    const d = await getJson(`https://search.openfoodfacts.org/search?q=${enc}&page_size=12&fields=${OFF_FIELDS}`);
    const hits = (d.hits || d.products || []).map(fromOff).filter(Boolean);
    if (hits.length) {
      cachePut(cacheKey, hits);
      return hits;
    }
  } catch (e) { firstError = e; }
  try {
    const d = await getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=15&fields=${OFF_FIELDS}`);
    const hits = (d.products || []).map(fromOff).filter(Boolean);
    if (hits.length) cachePut(cacheKey, hits);
    return hits;
  } catch (e) {
    // Keep the actual connection error visible so users know that retrying a different source is needed.
    throw firstError || e;
  }
}
export async function barcodeOff(code) {
  const cacheKey = 'off_code|' + String(code || '').trim();
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  offRateOk();
  const d = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (d.status !== 1 || !d.product) return [];
  const hits = [fromOff({ ...d.product, code })].filter(Boolean);
  if (hits.length) cachePut(cacheKey, hits);
  return hits;
}

// ---- USDA FoodData Central ----
export async function testUsdaConnection() {
  const key = getUsdaKey();
  if (!key) throw new Error('ยังไม่ได้ใส่ USDA API Key');
  const u = new URLSearchParams({ api_key: key, query: 'apple', pageSize: '1' });
  const d = await getJson('https://api.nal.usda.gov/fdc/v1/foods/search?' + u, 12000);
  return { ok: true, totalHits: d.totalHits ?? 0 };
}
export async function searchUsda(q) {
  const en = translateThaiFoodQuery(q);
  const cacheKey = usdaCacheKey(q);
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const key = getUsdaKey();
  const u = new URLSearchParams({ api_key: key, query: en, pageSize: '12', dataType: 'Foundation,SR Legacy' });
  const d = await getJson('https://api.nal.usda.gov/fdc/v1/foods/search?' + u);
  const hits = (d.foods || []).map(f => {
    const get = no => num((f.foodNutrients || []).find(n => String(n.nutrientNumber) === no)?.value);
    const kcal = get('208');
    if (kcal === null) return null;
    return { source: 'usda', code: String(f.fdcId), name: f.description, brand: '', per100: { calories: Math.round(kcal), protein: r1(get('203')), carbs: r1(get('205')), fat: r1(get('204')), sugar: r1(get('269')), sodium: get('307') !== null ? Math.round(get('307')) : null }, servingGrams: null, servingText: '' };
  }).filter(Boolean);
  if (hits.length) cachePut(cacheKey, hits);
  return hits;
}

export async function testFoodSearchConnections() {
  const usdaParams = new URLSearchParams({ api_key: getUsdaKey(), query: 'apple', pageSize: '1' });
  const offQuery = encodeURIComponent('apple');
  const checks = [
    ['USDA FoodData Central', () => getJson(`https://api.nal.usda.gov/fdc/v1/foods/search?${usdaParams}`, 12000)],
    ['Open Food Facts search', () => getJson(`https://search.openfoodfacts.org/search?q=${offQuery}&page_size=1&fields=code,product_name`)],
    ['Open Food Facts fallback', () => getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${offQuery}&search_simple=1&action=process&json=1&page_size=1&fields=code,product_name`)]
  ];
  return Promise.all(checks.map(async ([label, check]) => {
    try {
      await check();
      return { label, ok: true, message: 'เชื่อมต่อได้' };
    } catch (error) {
      return { label, ok: false, message: error?.message || 'เชื่อมต่อไม่สำเร็จ' };
    }
  }));
}

async function searchAI(q) {
  if (!getGroqKey() && !getGeminiKey() && !getOpenRouterKey()) throw new Error('NO_KEY');
  const { result: r, provider } = await lookupPer100gWithProvider(q);
  const srcKey = provider === 'Groq'
    ? 'groq'
    : provider === 'OpenRouter'
      ? 'openrouter'
      : provider === 'cache'
        ? 'cache'
        : 'gemini';
  return [{
    source: srcKey,
    name: r.name || q,
    brand: '',
    per100: {
      calories: Math.round(r.calories ?? 0),
      protein: r1(num(r.protein)),
      carbs: r1(num(r.carbs)),
      fat: r1(num(r.fat)),
      sugar: null,
      sodium: null
    },
    servingGrams: null,
    servingText: ''
  }];
}

function searchLocalDb(q, localFoods) {
  const needle = q.toLowerCase();
  const pool = Array.isArray(localFoods) && localFoods.length ? localFoods : (state.customFoods || []);
  return pool
    .filter(x => x && String(x.name || '').toLowerCase().includes(needle))
    .slice(0, 8)
    .map(x => {
      if (x.gramsPerUnit > 0) {
        const k = 100 / x.gramsPerUnit;
        return {
          source: 'local',
          name: x.name,
          brand: x.brand || '',
          per100: {
            calories: Math.round((x.calories || 0) * k),
            protein: r1((x.protein || 0) * k),
            carbs: r1((x.carbs || 0) * k),
            fat: r1((x.fat || 0) * k),
            sugar: x.sugar != null ? r1(x.sugar * k) : null,
            sodium: x.sodium != null ? Math.round(x.sodium * k) : null
          },
          servingGrams: x.gramsPerUnit,
          servingText: x.unit || ''
        };
      }
      return {
        source: 'local',
        servingOnly: true,
        name: x.name,
        brand: x.brand || '',
        perServing: {
          calories: Math.round(x.calories || 0),
          protein: r1(x.protein ?? 0),
          carbs: r1(x.carbs ?? 0),
          fat: r1(x.fat ?? 0),
          sugar: x.sugar != null ? r1(x.sugar) : null,
          sodium: x.sodium != null ? Math.round(x.sodium) : null
        },
        servingGrams: null,
        servingText: x.unit || '1 หน่วย'
      };
    });
}

export async function detectBarcode(file) {
  if (!('BarcodeDetector' in window)) throw new Error('เบราว์เซอร์นี้ยังสแกนบาร์โค้ดจากรูปไม่ได้ (ใช้ได้บน Chrome Android) — พิมพ์เลขบาร์โค้ดแทน');
  const bmp = await createImageBitmap(file);
  try {
    const found = await new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }).detect(bmp);
    if (!found.length) throw new Error('ไม่พบบาร์โค้ดในรูป ลองถ่ายให้ชัดขึ้น');
    return found[0].rawValue;
  } finally {
    try { bmp.close?.(); } catch {}
  }
}

// ---- UI ----
export function openFoodSearch({ localFoods = null, initialQuery = '', onUse, onSaveLibrary }) {
  const m = openModal(`
    <div class="flex justify-between items-center gap-2 mb-3">
      <h3 class="font-bold text-lg text-slate-800 inline-flex items-center gap-2">${iconSvg('search', { size: 18, className: 'text-brand' })}<span>ค้นหาโภชนาการ</span></h3>
      <button data-close type="button" class="tm-modal-close shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <div class="flex flex-col sm:flex-row gap-2">
      <input id="os-q" class="input w-full flex-1 min-h-[44px]" placeholder="พิมพ์ชื่ออาหาร หรือเลขบาร์โค้ด" value="${esc(initialQuery)}" enterkeyhint="search" aria-label="ค้นหาชื่ออาหารหรือเลขบาร์โค้ด">
      <div class="grid grid-cols-2 sm:flex gap-2 shrink-0">
        <button id="os-go" type="button" class="btn btn-primary min-h-[44px] justify-center">${iconSvg('search', { size: 15 })} ค้นหา</button>
        <button id="os-test-connections" type="button" class="btn btn-ghost min-h-[44px] justify-center text-xs sm:text-sm">ตรวจการเชื่อมต่อ</button>
      </div>
    </div>
    <p id="os-hint" class="text-xs text-slate-500 mt-2">แหล่งข้อมูลตามลำดับ: คลังอาหารของฉัน → USDA → Open Food Facts → AI</p>
    <p id="os-connection-status" class="text-xs text-slate-500 mt-1" aria-live="polite"></p>
    <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4 items-start mt-3">
      <div class="min-w-0 space-y-2.5">
        <div id="os-res" class="space-y-2 md:max-h-[55vh] md:overflow-y-auto md:pr-1"></div>
        <div id="os-next-wrap" class="hidden">
          <button id="os-next" type="button" class="btn btn-ghost w-full justify-center min-h-[44px] text-xs font-semibold">${iconSvg('forward', { size: 14 })} ไม่ตรงที่ต้องการ? ค้นหาต่อในแหล่งถัดไป</button>
        </div>
      </div>
      <div class="min-w-0 md:sticky md:top-0">
        <div id="os-calc-empty" class="hidden md:flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 min-h-[14rem] text-xs text-slate-500 gap-2">
          ${iconSvg('food', { size: 24, className: 'text-slate-400' })}
          <p class="font-medium text-slate-600">เลือกรายการอาหารทางซ้าย</p>
          <p>เพื่อกำหนดน้ำหนักหรือจำนวนหน่วยและดูค่าพลังงานก่อนนำไปบันทึก</p>
        </div>
        <div id="os-calc" class="hidden rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div class="space-y-0.5">
            <p class="text-[11px] font-semibold text-slate-500">รายการที่เลือก</p>
            <p id="os-pick" class="text-sm font-bold text-slate-800"></p>
          </div>
          <div>
            <label id="os-g-lbl" class="lbl" for="os-g">น้ำหนักที่กิน (กรัม/มล.)</label>
            <input id="os-g" type="number" step="0.1" inputmode="decimal" class="input min-h-[44px]">
          </div>
          <div class="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
            <p class="text-[11px] text-slate-500">ค่าโภชนาการตามปริมาณที่ระบุ</p>
            <p id="os-out" class="text-sm font-bold text-slate-800 tabular-nums mt-0.5"></p>
          </div>
          <div class="flex flex-col sm:flex-row md:flex-col gap-2">
            <button id="os-use" type="button" class="btn btn-primary min-h-[44px] justify-center">${iconSvg('check', { size: 15 })} ใช้ในฟอร์มบันทึก</button>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button id="os-both" type="button" class="btn btn-sky min-h-[44px] justify-center text-xs">ใช้ + เก็บเข้าคลัง</button>
              <button id="os-lib" type="button" class="btn btn-ghost min-h-[44px] justify-center text-xs">เก็บเข้าคลัง (100 g)</button>
            </div>
          </div>
        </div>
      </div>
    </div>`, { size: 'xl' });

  let results = [], cur = null, activeQuery = '', pipelineStage = 0, selectedIndex = -1;
  const upd = () => {
    const val = toNum($('#os-g', m.el).value) || 0;
    if (cur.servingOnly) {
      const p = cur.perServing;
      $('#os-out', m.el).textContent = `${Math.round(p.calories * val)} kcal · P ${round1((p.protein || 0) * val)}g · C ${round1((p.carbs || 0) * val)}g · F ${round1((p.fat || 0) * val)}g`;
    } else {
      const k = val / 100, p = cur.per100;
      $('#os-out', m.el).textContent = `${Math.round(p.calories * k)} kcal · P ${round1((p.protein || 0) * k)}g · C ${round1((p.carbs || 0) * k)}g · F ${round1((p.fat || 0) * k)}g`;
    }
  };
  const sourceLabel = src => ({ local: 'คลังในเครื่อง', off: 'Open Food Facts', usda: 'USDA', groq: 'AI (Groq)', gemini: 'AI (Gemini)', openrouter: 'AI (OpenRouter)', cache: 'แคช AI ในเครื่อง' })[src] || src;
  const renderResults = (errors = [], canContinue = false) => {
    const warnings = errors.map(x => `<p class="text-xs ${x.missing ? 'text-amber-700' : 'text-rose-600'} py-1"><b>${esc(x.label)}:</b> ${esc(x.message)}</p>`).join('');
    const doneBanner = results.length ? `<p class="text-xs text-green-700 font-semibold py-1">✓ พบ ${results.length} รายการ</p>` : '';
    $('#os-next-wrap', m.el).classList.toggle('hidden', !canContinue);
    $('#os-res', m.el).innerHTML = warnings + doneBanner + (results.length ? results.map((r, i) => {
      const nut = r.servingOnly ? r.perServing : r.per100;
      const basis = r.servingOnly ? `ต่อ ${esc(r.servingText || '1 หน่วย')}` : 'ต่อ 100 g';
      const isSelected = i === selectedIndex;
      return `
      <div class="rounded-xl border ${isSelected ? 'border-brand bg-slate-50/80' : 'border-slate-200 bg-white'} p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <p class="text-sm font-semibold text-slate-800">${esc(r.name)}${r.brand ? ` <span class="text-slate-500 font-normal">· ${esc(r.brand)}</span>` : ''}</p>
            <span class="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">${esc(sourceLabel(r.source))}</span>
          </div>
          <p class="text-xs text-slate-600 tabular-nums">${basis}: <b class="text-slate-800">${nut.calories} kcal</b> · P ${nut.protein ?? '-'}g · C ${nut.carbs ?? '-'}g · F ${nut.fat ?? '-'}g${!r.servingOnly && r.servingText ? ' · หน่วย ' + esc(r.servingText) : ''}</p>
        </div>
        <button type="button" data-i="${i}" class="btn ${isSelected ? 'btn-primary' : 'btn-ghost'} min-h-[44px] px-4 text-xs font-semibold shrink-0 justify-center">เลือก</button>
      </div>`;
    }).join('') : '<p class="text-sm text-slate-500 py-4 text-center rounded-xl border border-slate-200 bg-white">ไม่พบผลลัพธ์ — ลองคำอื่น หรือใช้ปุ่มสแกนภาพ/ฉลาก</p>');
  };

  const setStatus = text => { $('#os-res', m.el).innerHTML = `<p class="text-sm text-slate-500 py-3 inline-flex items-center gap-1.5">${iconSvg('fa-spinner fa-spin', { size: 15 })}<span>${esc(text)}</span></p>`; };

  const runPipelineFromStage = async (q, startStage = 0, append = false) => {
    if (!append) { results = []; selectedIndex = -1; }
    const errors = [];
    const isBarcode = /^\d{8,14}$/.test(q);

    // Stage 0: Local DB
    if (startStage <= 0 && !isBarcode) {
      const localHits = searchLocalDb(q, localFoods);
      if (localHits.length) {
        results.push(...localHits);
        pipelineStage = 1;
        renderResults(errors, true);
        return;
      }
    }

    // Stage 1: USDA
    if (startStage <= 1 && !isBarcode && getUsdaKey()) {
      setStatus('กำลังค้นหาจาก USDA FoodData Central...');
      try {
        const usdaHits = await searchUsda(q);
        if (usdaHits.length) {
          results.push(...usdaHits);
          pipelineStage = 2;
          renderResults(errors, true);
          return;
        }
      } catch (e) {
        reportRuntimeError(e, { category: 'api', source: 'food-search' });
        errors.push({ label: 'USDA', message: e?.message || 'ค้นหาไม่สำเร็จ', missing: false });
      }
    }

    // Stage 2: Open Food Facts
    if (startStage <= 2) {
      setStatus('กำลังค้นหาจาก Open Food Facts...');
      try {
        const offResult = isBarcode ? await barcodeOff(q) : await searchOff(q);
        if (offResult.length) {
          results.push(...offResult);
          pipelineStage = 3;
          renderResults(errors, !isBarcode);
          return;
        }
      } catch (e) {
        reportRuntimeError(e, { category: 'api', source: 'food-search' });
        errors.push({ label: 'Open Food Facts', message: e?.message || 'ค้นหาไม่สำเร็จ', missing: false });
      }
    }

    // Stage 3: AI fallback (Gemini -> Groq -> OpenRouter)
    if (startStage <= 3 && !isBarcode) {
      if (getGroqKey() || getGeminiKey() || getOpenRouterKey()) {
        setStatus('ยังไม่พบในฐานข้อมูล กำลังประมาณค่าด้วย AI (Gemini → Groq → OpenRouter)...');
        try {
          const aiHits = await searchAI(q);
          if (aiHits.length) results.push(...aiHits);
        } catch (e) {
          errors.push({ label: 'AI', message: e?.message === 'NO_KEY' ? explainGeminiError(e) : (e?.message || 'ค้นหาไม่สำเร็จ'), missing: e?.message === 'NO_KEY' });
        }
      } else {
        errors.push({ label: 'AI', message: 'ยังไม่พบในคลัง/USDA/OFF — ใส่คีย์ Gemini, Groq หรือ OpenRouter ใน ตั้งค่า เพื่อเปิดค้นหาอัตโนมัติด้วย AI', missing: true });
      }
    }

    pipelineStage = 4;
    renderResults(errors, false);
  };

  const run = async () => {
    const q = $('#os-q', m.el).value.trim();
    if (!q) return;
    activeQuery = q;
    pipelineStage = 0;
    selectedIndex = -1;
    $('#os-calc', m.el).classList.add('hidden');
    $('#os-calc-empty', m.el)?.classList.remove('hidden');
    $('#os-next-wrap', m.el).classList.add('hidden');
    await runPipelineFromStage(q, 0, false);
  };
  $('#os-go', m.el).addEventListener('click', run);
  $('#os-test-connections', m.el).addEventListener('click', async event => {
    const btn = event.currentTarget, status = $('#os-connection-status', m.el);
    btn.disabled = true;
    status.className = 'text-xs text-slate-500 mt-1';
    status.textContent = 'กำลังตรวจ USDA และ Open Food Facts (ไม่เรียก AI)...';
    try {
      const checks = await testFoodSearchConnections();
      const failed = checks.filter(check => !check.ok);
      status.className = failed.length ? 'text-xs text-amber-700 mt-1' : 'text-xs text-green-700 mt-1';
      status.textContent = checks.map(check => `${check.ok ? '✓' : '✕'} ${check.label}: ${check.message}`).join(' · ');
    } finally {
      btn.disabled = false;
    }
  });
  $('#os-next', m.el).addEventListener('click', () => {
    if (activeQuery && pipelineStage < 4) runPipelineFromStage(activeQuery, pipelineStage, true);
  });
  $('#os-q', m.el).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  if (initialQuery) run();
  $('#os-res', m.el).addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    selectedIndex = +b.dataset.i;
    cur = results[selectedIndex];
    if (!cur) return;
    $('#os-pick', m.el).textContent = `${cur.name}${cur.brand ? ' · ' + cur.brand : ''}`;
    if (cur.servingOnly) {
      $('#os-g-lbl', m.el).textContent = `จำนวน (${cur.servingText || 'หน่วย'})`;
      $('#os-g', m.el).value = 1;
      $('#os-lib', m.el).classList.add('hidden');
      $('#os-both', m.el).classList.add('hidden');
    } else {
      $('#os-g-lbl', m.el).textContent = 'น้ำหนักที่กิน (กรัม/มล.)';
      $('#os-g', m.el).value = cur.servingGrams || 100;
      $('#os-lib', m.el).classList.remove('hidden');
      $('#os-both', m.el).classList.remove('hidden');
    }
    $('#os-calc-empty', m.el)?.classList.add('hidden');
    $('#os-calc', m.el).classList.remove('hidden');
    renderResults([], pipelineStage < 4 && !/^\d{8,14}$/.test(activeQuery));
    upd();
    $('#os-calc', m.el).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#os-g', m.el).addEventListener('input', () => cur && upd());
  const useCur = () => {
    const val = toNum($('#os-g', m.el).value) || (cur.servingOnly ? 1 : 100);
    if (cur.servingOnly) {
      const p = cur.perServing;
      onUse({
        name: `${cur.name}${cur.brand ? ' · ' + cur.brand : ''}${val !== 1 ? ` ×${val}` : ''}`,
        calories: Math.round(p.calories * val),
        protein: round1((p.protein || 0) * val),
        carbs: round1((p.carbs || 0) * val),
        fat: round1((p.fat || 0) * val),
        sugar: p.sugar !== null ? round1(p.sugar * val) : null,
        sodium: p.sodium !== null ? Math.round(p.sodium * val) : null
      });
      return;
    }
    const k = val / 100, p = cur.per100;
    onUse({ name: `${cur.name}${cur.brand ? ' · ' + cur.brand : ''} (${val}g)`, calories: Math.round(p.calories * k), protein: round1((p.protein || 0) * k), carbs: round1((p.carbs || 0) * k), fat: round1((p.fat || 0) * k), sugar: p.sugar !== null ? round1(p.sugar * k) : null, sodium: p.sodium !== null ? Math.round(p.sodium * k) : null });
  };
  const libCur = () => {
    if (cur.servingOnly) return;
    const p = cur.per100;
    onSaveLibrary({ name: cur.name, brand: cur.brand, unit: '100 กรัม', gramsPerUnit: 100, calories: p.calories, protein: p.protein, carbs: p.carbs, fat: p.fat, sugar: p.sugar, sodium: p.sodium });
  };
  $('#os-use', m.el).addEventListener('click', () => { useCur(); m.close(); });
  $('#os-lib', m.el).addEventListener('click', () => { libCur(); m.close(); });
  $('#os-both', m.el).addEventListener('click', () => { useCur(); libCur(); m.close(); });
}
