import { $, esc, toNum, round1, openModal, toast } from './util.js';
import { lookupPer100g, getGeminiKey, explainGeminiError } from './nutrition.js';

// แหล่งข้อมูลโภชนาการ (ทุกแหล่งใช้ฟรี ไม่ต้องผูกบัตร)
//  off    = Open Food Facts: สินค้าบรรจุภัณฑ์ทั่วโลกรวมของไทย + ค้นด้วยบาร์โค้ด (ไม่ต้องใช้คีย์, จำกัด ~10 ครั้ง/นาที)
//  usda   = USDA FoodData Central: อาหารทั่วไป/วัตถุดิบ ค้นด้วยชื่อภาษาอังกฤษ (ต้องมีคีย์ฟรี)
//  gemini = Gemini AI: ประมาณค่าให้ รวมอาหารไทย (ต้องมีคีย์ฟรี และมีโควตา)
export const SOURCES = {
  off: 'Open Food Facts — สินค้า/ขนมซอง/บาร์โค้ด (ไม่ต้องใช้คีย์)',
  usda: 'USDA — วัตถุดิบทั่วไป พิมพ์ชื่ออังกฤษ (ใช้คีย์ฟรี)',
  gemini: 'Gemini AI — อาหารไทย/เมนูทั่วไป (ประมาณค่า)'
};
const K_USDA = 'usda_key', K_SRC = 'food_src';
export const getUsdaKey = () => localStorage.getItem(K_USDA) || '';
export const setUsdaKey = k => k ? localStorage.setItem(K_USDA, k.trim()) : localStorage.removeItem(K_USDA);

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
async function searchOff(q) {
  offRateOk();
  const enc = encodeURIComponent(q);
  // Start with Open Food Facts' plain-text search. The v2 structured endpoint does not support free-text search.
  let firstError = null;
  try {
    const d = await getJson(`https://search.openfoodfacts.org/search?q=${enc}&page_size=12&fields=${OFF_FIELDS}`);
    const hits = (d.hits || d.products || []).map(fromOff).filter(Boolean);
    if (hits.length) return hits;
  } catch (e) { firstError = e; }
  try {
    const d = await getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=15&fields=${OFF_FIELDS}`);
    return (d.products || []).map(fromOff).filter(Boolean);
  } catch (e) {
    // Keep the actual connection error visible so users know that retrying a different source is needed.
    throw firstError || e;
  }
}
async function barcodeOff(code) {
  offRateOk();
  const d = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (d.status !== 1 || !d.product) return [];
  return [fromOff({ ...d.product, code })].filter(Boolean);
}

// ---- USDA FoodData Central ----
async function searchUsda(q) {
  const key = getUsdaKey();
  if (!key) throw new Error('ยังไม่ได้ใส่ USDA API Key — ไปที่ ตั้งค่า (ขอฟรีที่ fdc.nal.usda.gov/api-key-signup)');
  const u = new URLSearchParams({ api_key: key, query: q, pageSize: '12', dataType: 'Foundation,SR Legacy' });
  const d = await getJson('https://api.nal.usda.gov/fdc/v1/foods/search?' + u);
  return (d.foods || []).map(f => {
    const get = no => num((f.foodNutrients || []).find(n => String(n.nutrientNumber) === no)?.value);
    const kcal = get('208');
    if (kcal === null) return null;
    return { source: 'usda', code: String(f.fdcId), name: f.description, brand: '', per100: { calories: Math.round(kcal), protein: r1(get('203')), carbs: r1(get('205')), fat: r1(get('204')), sugar: r1(get('269')), sodium: get('307') !== null ? Math.round(get('307')) : null }, servingGrams: null, servingText: '' };
  }).filter(Boolean);
}

async function searchGemini(q) {
  if (!getGeminiKey()) throw new Error('NO_KEY');
  const r = await lookupPer100g(q);
  return [{ source: 'gemini', name: r.name || q, brand: '', per100: { calories: Math.round(r.calories ?? 0), protein: r1(num(r.protein)), carbs: r1(num(r.carbs)), fat: r1(num(r.fat)), sugar: null, sodium: null }, servingGrams: null, servingText: '' }];
}

async function detectBarcode(file) {
  if (!('BarcodeDetector' in window)) throw new Error('เบราว์เซอร์นี้ยังสแกนบาร์โค้ดจากรูปไม่ได้ (ใช้ได้บน Chrome Android) — พิมพ์เลขบาร์โค้ดแทน');
  const bmp = await createImageBitmap(file);
  const found = await new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }).detect(bmp);
  if (!found.length) throw new Error('ไม่พบบาร์โค้ดในรูป ลองถ่ายให้ชัดขึ้น');
  return found[0].rawValue;
}

// ---- UI ----
export function openFoodSearch({ onUse, onSaveLibrary }) {
  const src0 = localStorage.getItem(K_SRC);
  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">ค้นหาโภชนาการ</h3><button data-close class="text-slate-400 p-1"><i class="fa-solid fa-xmark"></i></button></div>
    <select id="os-src" class="input"><option value="all" selected>ค้นหาทุกแหล่งที่เปิดใช้พร้อมกัน</option>${Object.entries(SOURCES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
    <div class="flex gap-2 mt-2"><input id="os-q" class="input" placeholder="ชื่ออาหาร หรือเลขบาร์โค้ด" enterkeyhint="search"><button id="os-go" class="btn btn-primary shrink-0">ค้นหา</button></div>
    <label class="chip bg-lav-soft text-brand-dark mt-2 inline-flex"><input id="os-bc" type="file" accept="image/*" capture="environment" class="hidden"><i class="fa-solid fa-barcode"></i> สแกนบาร์โค้ดจากรูป</label>
    <p id="os-hint" class="text-xs text-slate-500 mt-2"></p>
    <div id="os-res" class="mt-3 divide-y divide-slate-100"></div>
    <div class="flex flex-wrap gap-2 mt-3 text-xs"><a id="os-off" class="chip bg-green-100 text-green-800" target="_blank" rel="noopener noreferrer">ค้นหาใน Open Food Facts ↗</a><a id="os-google" class="chip bg-slate-100 text-slate-700" target="_blank" rel="noopener noreferrer">ค้นหาต่อใน Google ↗</a><a id="os-chatgpt" href="https://chatgpt.com/" class="chip bg-slate-100 text-slate-700" target="_blank" rel="noopener noreferrer">เปิด ChatGPT ↗</a><span class="self-center text-slate-400">เปิดแยกภายนอก ไม่มีการเรียก API แบบเสียเงิน</span></div>
    <div id="os-calc" class="hidden mt-3 bg-sky-soft/50 rounded-xl p-3 space-y-2">
      <p id="os-pick" class="text-sm font-semibold"></p>
      <label class="lbl">น้ำหนักที่กิน (กรัม/มล.)</label><input id="os-g" type="number" inputmode="decimal" class="input">
      <p id="os-out" class="text-sm font-semibold text-blue-700"></p>
      <div class="flex flex-wrap gap-2"><button id="os-use" class="btn btn-primary">ใช้ในฟอร์มบันทึก</button><button id="os-lib" class="btn btn-soft">เก็บเข้าคลัง (ต่อ 100 g)</button></div>
    </div>`, { wide: true });
  const hints = {
    all: 'ค้นพร้อมกันจาก Open Food Facts, USDA และ Gemini ที่ตั้งค่าไว้ · ถ้าแหล่งหนึ่งติดลิมิต/เชื่อมต่อไม่ได้ แหล่งอื่นยังแสดงผลได้ · Google และ ChatGPT เปิดแยกเป็นลิงก์',
    off: 'ค้นจากชื่อสินค้า/ยี่ห้อ หรือพิมพ์เลขบาร์โค้ด 8–14 หลัก · ข้อมูลมาจากผู้ใช้ทั่วโลก อาจไม่ครบหรือไม่ตรงทุกรายการ โปรดตรวจกับฉลาก',
    usda: 'ค้นจากชื่อภาษาอังกฤษ เช่น "chicken breast", "banana" · ค่าเป็นต่อ 100 g ของวัตถุดิบดิบ/ปรุงตามที่ระบุในชื่อ',
    gemini: 'ประมาณค่าต่อ 100 g จาก AI — เหมาะกับเมนูไทยที่ฐานข้อมูลไม่มี แต่เป็นค่าประมาณ'
  };
  const hint = () => { $('#os-hint', m.el).textContent = hints[$('#os-src', m.el).value]; if($('#os-src',m.el).value!=='all')localStorage.setItem(K_SRC, $('#os-src', m.el).value); };
  hint();
  $('#os-src', m.el).addEventListener('change', hint);

  let results = [], cur = null;
  const upd = () => {
    const g = toNum($('#os-g', m.el).value) || 0, k = g / 100, p = cur.per100;
    $('#os-out', m.el).textContent = `${Math.round(p.calories * k)} kcal · P ${round1((p.protein || 0) * k)} · C ${round1((p.carbs || 0) * k)} · F ${round1((p.fat || 0) * k)}`;
  };
  const renderResults = (errors=[]) => {
    const warnings=errors.map(x=>`<p class="text-xs ${x.missing?'text-amber-700':'text-rose-600'} py-1"><b>${esc(x.label)}:</b> ${esc(x.message)}</p>`).join('');
    $('#os-res', m.el).innerHTML = warnings + (results.length ? results.map((r, i) => `
      <button data-i="${i}" class="w-full text-left py-2 px-1 hover:bg-lav-soft/50 rounded-lg">
        <p class="text-sm font-semibold text-slate-800">${esc(r.name)}${r.brand ? ` <span class="text-slate-500 font-normal">· ${esc(r.brand)}</span>` : ''} <span class="text-xs rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">${esc(({off:'Open Food Facts',usda:'USDA',gemini:'Gemini'})[r.source]||r.source)}</span></p>
        <p class="text-xs text-slate-500">ต่อ 100 g: ${r.per100.calories} kcal · P ${r.per100.protein ?? '-'} · C ${r.per100.carbs ?? '-'} · F ${r.per100.fat ?? '-'}${r.servingText ? ' · หน่วยบริโภค ' + esc(r.servingText) : ''}</p>
      </button>`).join('') : '<p class="text-sm text-slate-400 py-2">ไม่พบผลลัพธ์ — ลองคำอื่น เปลี่ยนแหล่งข้อมูล หรือใช้ "ถ่ายรูปฉลาก"/กรอกเอง</p>');
  };
  const run = async () => {
    const q = $('#os-q', m.el).value.trim(), src = $('#os-src', m.el).value;
    if (!q) return;
    $('#os-calc', m.el).classList.add('hidden');
    $('#os-res', m.el).innerHTML = '<p class="text-sm text-slate-500 py-2">กำลังค้นหา...</p>';
    $('#os-off',m.el).href='https://world.openfoodfacts.org/cgi/search.pl?search_terms='+encodeURIComponent(q)+'&search_simple=1&action=process';
    $('#os-google',m.el).href=`https://www.google.com/search?q=${encodeURIComponent(q+' nutrition calories')}`;
    $('#os-chatgpt',m.el).href=`https://chatgpt.com/?q=${encodeURIComponent(`Estimate nutrition per 100 g for ${q}; list calories, protein, carbs, fat.`)}`;
    const sources=src==='all'?['off','usda','gemini']:[src];
    const responses=await Promise.allSettled(sources.map(key=>key==='off'?( /^\d{8,14}$/.test(q)?barcodeOff(q):searchOff(q)):key==='usda'?searchUsda(q):searchGemini(q)));
    results=[];const errors=[];
    responses.forEach((response,i)=>{
      const key=sources[i], label=key==='off'?'Open Food Facts':key==='usda'?'USDA':'Gemini';
      if(response.status==='fulfilled')results.push(...response.value);
      else {const e=response.reason, missing=(e?.message==='NO_KEY'||String(e?.message||'').includes('USDA API Key'));errors.push({label,message:e?.message==='NO_KEY'?explainGeminiError(e):e?.message||'ค้นหาไม่สำเร็จ',missing});}
    });
    renderResults(errors);
  };
  $('#os-go', m.el).addEventListener('click', run);
  $('#os-q', m.el).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  $('#os-bc', m.el).addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { $('#os-src', m.el).value = 'off'; hint(); $('#os-q', m.el).value = await detectBarcode(f); run(); } catch (err) { toast(err.message, 'err'); }
  });
  $('#os-res', m.el).addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    cur = results[+b.dataset.i];
    $('#os-pick', m.el).textContent = cur.name;
    $('#os-g', m.el).value = cur.servingGrams || 100;
    $('#os-calc', m.el).classList.remove('hidden'); upd();
    $('#os-calc', m.el).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#os-g', m.el).addEventListener('input', () => cur && upd());
  $('#os-use', m.el).addEventListener('click', () => {
    const g = toNum($('#os-g', m.el).value) || 100, k = g / 100, p = cur.per100;
    onUse({ name: `${cur.name}${cur.brand ? ' · ' + cur.brand : ''} (${g}g)`, calories: Math.round(p.calories * k), protein: round1((p.protein || 0) * k), carbs: round1((p.carbs || 0) * k), fat: round1((p.fat || 0) * k), sugar: p.sugar !== null ? round1(p.sugar * k) : null, sodium: p.sodium !== null ? Math.round(p.sodium * k) : null });
    m.close();
  });
  $('#os-lib', m.el).addEventListener('click', () => {
    const p = cur.per100;
    onSaveLibrary({ name: cur.name, brand: cur.brand, unit: '100 กรัม', gramsPerUnit: 100, calories: p.calories, protein: p.protein, carbs: p.carbs, fat: p.fat, sugar: p.sugar, sodium: p.sodium });
    m.close();
  });
}
