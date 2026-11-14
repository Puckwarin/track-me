// โมเดล Gemini ที่ลองใช้งานตามลำดับ (แต่ละโมเดลมีโควตาแยกกัน)
const GEMINI_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
const KEY_NAME = 'gemini_key';
const GROQ_KEY = 'groq_key';
export const getGroqKey = () => localStorage.getItem(GROQ_KEY) || '';
export const setGroqKey = k => k ? localStorage.setItem(GROQ_KEY, k.trim()) : localStorage.removeItem(GROQ_KEY);

export const getGeminiKey = () => localStorage.getItem(KEY_NAME) || '';
export const setGeminiKey = k => k ? localStorage.setItem(KEY_NAME, k.trim()) : localStorage.removeItem(KEY_NAME);

async function discoverFallbackGeminiModels(key) {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(id => id && !GEMINI_MODELS.includes(id) &&
        /(flash|lite|hydrogen)/i.test(id) &&
        !/tts|live|image|audio|embedding|transcribe|thinking|1\.5|2\.0|exp/i.test(id))
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function requestGeminiModel(model, key, parts, schema) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const generationConfig = { responseMimeType: 'application/json' };
  if (schema) generationConfig.responseSchema = schema;
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      res = await fetch(url, {
        method: 'POST',
        // ส่ง key ใน header (ไม่ใส่ใน URL เพื่อไม่ให้ไปค้างใน log/ประวัติเบราว์เซอร์)
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: controller.signal
      });
    } catch (cause) {
      const err = new Error(cause.name === 'AbortError' ? 'หมดเวลารอคำตอบจาก Gemini (20 วินาที)' : (cause.message || 'Network error'));
      err.timeoutError = cause.name === 'AbortError';
      err.networkError = !err.timeoutError;
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data?.error?.message || `HTTP ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.invalidKey = (res.status === 400 && /api.?key|invalid/i.test(message)) || res.status === 403;
      err.modelNotFound = res.status === 404;
      err.quotaExceeded = res.status === 429 || /quota|resource.?exhausted/i.test(message);
      err.serverBusy = res.status === 503 || /high demand|temporarily unavailable|overloaded/i.test(message);
      err.retryable = [500, 502, 503, 504].includes(res.status) || /high demand|temporarily unavailable|overloaded/i.test(message) ||
        (res.status === 429 && !/quota|resource.?exhausted|limit:\s*0/i.test(message));
      if (err.retryable && attempt < 1) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 1200) : 400;
        await delay(wait);
        continue;
      }
      throw err;
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini ไม่ส่งผลลัพธ์กลับมา');
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  }
}

async function callGeminiProvider(parts, schema) {
  const key = getGeminiKey();
  if (!key) throw new Error('NO_KEY');

  const tried = [];
  const tryModels = async (models) => {
    for (const model of models) {
      try {
        const result = await requestGeminiModel(model, key, parts, schema);
        return { model, result };
      } catch (e) {
        if (e.invalidKey || e.timeoutError || e.networkError) throw e;
        tried.push({ model, error: e });
        if (!e.modelNotFound && !e.quotaExceeded && !e.serverBusy && e.status !== 400) throw e;
      }
    }
    return null;
  };

  const primary = await tryModels(GEMINI_MODELS);
  if (primary) return primary.result;

  const extraModels = await discoverFallbackGeminiModels(key);
  if (extraModels.length) {
    const fallback = await tryModels(extraModels);
    if (fallback) return fallback.result;
  }

  const last = tried[tried.length - 1]?.error;
  const summary = tried.map(x => `${x.model}: ${x.error.status || ''} ${x.error.message}`).join(' | ');
  const err = new Error(summary || last?.message || 'Gemini ไม่พร้อมใช้งาน');
  err.quotaExceeded = tried.length > 0 && tried.every(x => x.error.quotaExceeded);
  err.modelNotFound = tried.length > 0 && tried.every(x => x.error.modelNotFound);
  err.status = last?.status;
  throw err;
}

const GROQ_VISION_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];
const GROQ_TEXT_MODELS = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'];

function schemaSummary(schema) {
  if (!schema?.properties) return 'JSON object';
  return Object.entries(schema.properties).map(([k, v]) => {
    if (v.type === 'ARRAY') return `${k}: array of objects (${Object.keys(v.items?.properties || {}).join(', ')})`;
    return `${k}: ${v.type === 'NUMBER' ? 'number or null' : v.type === 'STRING' ? 'string or null' : 'value'}`;
  }).join(', ');
}

async function callGroq(parts, schema) {
  const key = getGroqKey();
  if (!key) throw new Error('NO_KEY');
  const hasImage = parts.some(p => p.inline_data);
  const models = hasImage ? GROQ_VISION_MODELS : GROQ_TEXT_MODELS;
  const messages = parts.map(p => p.inline_data
    ? { type: 'image_url', image_url: { url: 'data:' + p.inline_data.mime_type + ';base64,' + p.inline_data.data } }
    : { type: 'text', text: p.text || '' });
  const schemaHint = schemaSummary(schema);
  let lastErr = null;
  for (const model of models) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Return only valid JSON with these fields: ' + schemaHint }, ...messages] }],
        response_format: { type: 'json_object' },
        temperature: 0
      }),
      signal: AbortSignal.timeout(25000)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Groq ไม่ส่งผลลัพธ์กลับมา');
      return JSON.parse(String(content).split(String.fromCharCode(96).repeat(3)).join('').replace(/^json\s*/i, '').trim());
    }
    const e = new Error(data?.error?.message || 'Groq HTTP ' + res.status);
    e.status = res.status;
    e.invalidKey = res.status === 401 || res.status === 403;
    e.quotaExceeded = [402, 429].includes(res.status) || /quota|rate.?limit/i.test(e.message);
    lastErr = e;
    if (e.invalidKey) throw e;
  }
  throw lastErr || new Error('Groq ไม่พร้อมใช้งาน');
}

async function callAI(parts, schema) {
  const providers = [['Gemini', getGeminiKey(), () => callGeminiProvider(parts, schema)], ['Groq', getGroqKey(), () => callGroq(parts, schema)]].filter(x => x[1]);
  if (!providers.length) throw new Error('NO_KEY');
  const errors = [];
  for (let i = 0; i < providers.length; i++) {
    const [name, , run] = providers[i];
    try {
      const result = await run();
      if (i > 0) window.dispatchEvent(new CustomEvent('trackme:ai-fallback', { detail: { provider: name, failed: errors.length } }));
      return result;
    } catch (e) {
      if (providers.length === 1) throw e;
      errors.push(name + ': ' + (e.message || 'error'));
    }
  }
  const err = new Error('AI ทุกแหล่งที่ตั้งค่าไว้ไม่พร้อมใช้งาน — ' + errors.join(' · '));
  err.fallbackErrors = errors;
  err.quotaExceeded = errors.some(x => /429|quota|limit/i.test(x));
  throw err;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ย่อรูปก่อนส่ง (เร็วกว่า ประหยัดโควตา) — ถ้าอ่านไฟล์ไม่ได้ (เช่น HEIC) ส่งไฟล์เดิม
export async function imageToInlineData(file, maxDim = 1400) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return { mime_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
  } catch (e) {
    const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(file); });
    return { mime_type: file.type || 'image/jpeg', data };
  }
}

const S = { type: 'STRING' };
const N = { type: 'NUMBER', nullable: true };

export function lookupPer100g(name) {
  return callAI([{ text: `ให้ข้อมูลโภชนาการมาตรฐานต่อ 100 กรัมของอาหาร "${name}" (ค่าโดยประมาณทั่วไป) ตอบเป็น JSON ตาม schema` }], {
    type: 'OBJECT',
    properties: { name: S, calories: N, protein: N, carbs: N, fat: N },
    required: ['name', 'calories', 'protein', 'carbs', 'fat']
  });
}

export async function estimateFromPhoto(file) {
  const img = await imageToInlineData(file);
  return callAI([
    { text: 'วิเคราะห์จานอาหารในรูป ประมาณชื่ออาหาร และสารอาหารโดยรวมของทั้งจาน (kcal, โปรตีน, คาร์บ, ไขมัน เป็นกรัม) เป็นค่าประมาณ ตอบเป็น JSON ตาม schema' },
    { inline_data: img }
  ], {
    type: 'OBJECT',
    properties: { name: S, calories: N, protein: N, carbs: N, fat: N },
    required: ['name', 'calories', 'protein', 'carbs', 'fat']
  });
}

// อ่านฉลากโภชนาการ — ห้ามเดา: ค่าที่ไม่เห็นชัดต้องเป็น null
async function tryLabelOcr(file) {
  try {
    const mod = await import('tesseract.js');
    const worker = await mod.createWorker('tha+eng');
    try { const result = await worker.recognize(file); return result?.data?.text || ''; }
    finally { await worker.terminate(); }
  } catch { return ''; }
}
function labelNumber(text, patterns) {
  for(const pattern of patterns){const m=text.match(pattern);if(m){const n=Number(m[1].replace(',','.'));if(Number.isFinite(n))return n;}}
  return null;
}
export async function readNutritionLabel(file) {
  const image=await imageToInlineData(file,1800);
  const ocr=await tryLabelOcr(file);
  const kcal=labelNumber(ocr,[/(?:energy|พลังงาน)[^\d]{0,30}(\d+(?:[.,]\d+)?)[^\d]{0,8}(?:kcal|กิโลแคลอรี)?/i]);
  const protein=labelNumber(ocr,[/(?:protein|โปรตีน)[^\d]{0,24}(\d+(?:[.,]\d+)?)/i]);
  const carbs=labelNumber(ocr,[/(?:total carbohydrate|carbohydrate|คาร์โบไฮเดรต)[^\d]{0,32}(\d+(?:[.,]\d+)?)/i]);
  const fat=labelNumber(ocr,[/(?:total fat|fat|ไขมัน)[^\d]{0,24}(\d+(?:[.,]\d+)?)/i]);
  if([kcal,protein,carbs,fat].every(x=>x!==null)) return {
    name:null,basis:/100\s*(?:g|กรัม|ml|มล)/i.test(ocr)?'per_100g':'unknown',
    servingSizeText:null,servingGrams:null,calories:kcal,protein,carbs,fat,sugar:null,sodium:null,
    notes:'อ่านเบื้องต้นด้วย OCR — โปรดตรวจตัวเลขและหน่วยกับรูปฉลากก่อนบันทึก'
  };
  const instruction=`นี่คือฉลากโภชนาการภาษาไทยหรืออังกฤษ. อ่านเฉพาะตัวเลขที่พิมพ์จริง ห้ามประมาณหรือเดา; ค่าอ่านไม่ชัดให้เป็น null. basis เป็น per_serving, per_100g หรือ unknown; ระบุ servingSizeText/servingGrams หากชัด. ส่ง JSON ตาม schema. ข้อความ OCR เบื้องต้น (อาจผิด): ${ocr.slice(0,4000)}`;
  return callAI([{text:instruction},{inline_data:image}],{
    type:'OBJECT',properties:{name:{type:'STRING',nullable:true},basis:{type:'STRING',enum:['per_serving','per_100g','unknown']},servingSizeText:{type:'STRING',nullable:true},servingGrams:N,calories:N,protein:N,carbs:N,fat:N,sugar:N,sodium:N,notes:{type:'STRING',nullable:true}},
    required:['basis','servingSizeText','servingGrams','calories','protein','carbs','fat','sugar','sodium']
  });
}

// วิเคราะห์ภาพในหน่วยความจำชั่วคราว ไม่บันทึกไฟล์ภาพลงแอป
export async function estimateStockFromPhoto(file) {
  const img = await imageToInlineData(file, 1400);
  return callAI([
    { text: `ประเมินจากภาพสินค้า/ของใช้ที่เห็นเท่านั้น ชื่อสินค้า ปริมาณเต็มแพ็ก ปริมาณคงเหลือโดยประมาณ และหน่วย (ชิ้น, ห่อ, ml, g) ถ้าเป็นภาชนะเปิดใช้ให้ประเมินสัดส่วนอย่างระมัดระวัง ถ้าอ่านไม่ออกให้ null และระบุความไม่แน่นอน ตอบ JSON ตาม schema` },
    { inline_data: img }
  ], {
    type:'OBJECT', properties:{ name:{type:'STRING',nullable:true}, totalQuantity:N, remainingQuantity:N, unit:{type:'STRING',nullable:true}, confidence:{type:'STRING',enum:['low','medium','high']}, notes:{type:'STRING',nullable:true} },
    required:['name','totalQuantity','remainingQuantity','unit','confidence','notes']
  });
}

// อ่านข้อมูลจากซองอาหารสัตว์เลี้ยง (ไม่เก็บไฟล์ภาพ)
export async function readPetFoodLabel(file) {
  const img = await imageToInlineData(file, 1600);
  const res = await callAI([
    { text: 'นี่คือรูปซองอาหาร/ขนมสัตว์เลี้ยง อ่านชื่อสินค้า ยี่ห้อ และค่าพลังงาน (kcal/100g หรือ kcal/kg หรือ kcal/ถ้วย) รวมถึงโปรตีน/ไขมัน/เยื่อใย/ความชื้น (% Guaranteed Analysis) เฉพาะที่เห็นชัดในรูป ห้ามเดาตัวเลขที่อ่านไม่ชัด ตอบเป็น JSON ตาม schema' },
    { inline_data: img }
  ], {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING', nullable: true },
      brand: { type: 'STRING', nullable: true },
      kcalPer100g: N,
      kcalPerKg: N,
      proteinPct: N,
      fatPct: N,
      fiberPct: N,
      moisturePct: N,
      notes: { type: 'STRING', nullable: true }
    },
    required: ['name', 'kcalPer100g', 'kcalPerKg']
  });
  if (res && res.kcalPer100g == null && typeof res.kcalPerKg === 'number' && Number.isFinite(res.kcalPerKg)) {
    res.kcalPer100g = Math.round(res.kcalPerKg / 10);
  }
  return res;
}

// อ่านใบผลตรวจเลือด/ผลแล็บ (คนหรือสัตว์เลี้ยง) จากรูปภาพ ห้ามเดาค่าที่อ่านไม่ออก
export async function readLabReportFromPhoto(file) {
  const img = await imageToInlineData(file, 1800);
  return callAI([
    { text: 'นี่คือภาพใบผลตรวจเลือดหรือผลแล็บ (คนหรือสัตว์เลี้ยง) ให้อ่านทุกรายการที่มองเห็นชัดเจน ได้แก่ วันที่ตรวจ (รูปแบบ YYYY-MM-DD คริสต์ศักราช ถ้าเป็น พ.ศ. ให้ลบ 543), ชื่อคลินิก/โรงพยาบาล, และรายการค่าตรวจ (ชื่อรายการ เช่น BUN, Creatinine, ALT, WBC, RBC, HGB, HCT, PLT, Glucose ฯลฯ, ค่าที่วัดได้เป็นตัวเลข, หน่วย, ค่าอ้างอิงต่ำสุด-สูงสุด) อ่านเฉพาะที่พิมพ์จริง ห้ามเดาหรือแต่งตัวเลขเอง ตอบเป็น JSON ตาม schema' },
    { inline_data: img }
  ], {
    type: 'OBJECT',
    properties: {
      date: { type: 'STRING', nullable: true },
      labName: { type: 'STRING', nullable: true },
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: S,
            value: N,
            unit: { type: 'STRING', nullable: true },
            refLow: N,
            refHigh: N,
            note: { type: 'STRING', nullable: true }
          },
          required: ['name', 'value']
        }
      }
    },
    required: ['items']
  });
}

export async function testGeminiConnection() {
  const key = getGeminiKey();
  if (!key) throw new Error('NO_KEY');
  const models = [...GEMINI_MODELS, ...(await discoverFallbackGeminiModels(key))];
  const details = [];
  for (const model of models) {
    try {
      await requestGeminiModel(model, key, [{ text: 'Reply with JSON: {"ok":true}' }], {
        type: 'OBJECT',
        properties: { ok: { type: 'BOOLEAN' } },
        required: ['ok']
      });
      return { ok: true, model, details };
    } catch (e) {
      if (e.invalidKey || e.timeoutError || e.networkError) throw e;
      details.push(`${model}: ${e.status ? `HTTP ${e.status} ` : ''}${e.message}`);
    }
  }
  const err = new Error(details.join(' · ') || 'ไม่พบโมเดล Gemini ที่ใช้งานได้');
  err.quotaExceeded = details.some(x => /429|quota|resource.?exhausted/i.test(x));
  throw err;
}

export async function testGroqConnection() {
  const key = getGroqKey();
  if (!key) throw new Error('NO_KEY');
  const mRes = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: 'Bearer ' + key },
    signal: AbortSignal.timeout(10000)
  });
  const mData = await mRes.json().catch(() => ({}));
  if (!mRes.ok) {
    const msg = mData?.error?.message || `HTTP ${mRes.status}`;
    const err = new Error(msg);
    err.invalidKey = mRes.status === 401 || mRes.status === 403;
    err.quotaExceeded = mRes.status === 429;
    throw err;
  }
  const ids = (mData.data || []).map(x => x.id);
  const picked = GROQ_VISION_MODELS.find(id => ids.includes(id)) || GROQ_TEXT_MODELS.find(id => ids.includes(id)) || ids.find(id => !/whisper|tts|guard/i.test(id));
  if (!picked) return { ok: true, model: 'API Key ถูกต้อง' };
  const cRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: picked, messages: [{ role: 'user', content: 'Reply with JSON {"ok":true}' }], response_format: { type: 'json_object' }, max_tokens: 20, temperature: 0 }),
    signal: AbortSignal.timeout(12000)
  });
  const cData = await cRes.json().catch(() => ({}));
  if (!cRes.ok) {
    const err = new Error(cData?.error?.message || `HTTP ${cRes.status}`);
    err.quotaExceeded = cRes.status === 429;
    throw err;
  }
  return { ok: true, model: picked };
}

export const explainGeminiError = e => e.message === 'NO_KEY'
  ? 'ยังไม่ได้ใส่คีย์ AI — ตั้งค่า Gemini หรือ Groq ในหน้า Settings'
  : e.invalidKey
    ? 'คีย์ AI ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน (ตรวจคีย์ใน ตั้งค่า): ' + e.message
    : e.fallbackErrors
      ? e.message
      : e.quotaExceeded
        ? 'โควตา AI เต็มหรือถูกจำกัดชั่วคราว (' + e.message + ')'
        : e.timeoutError
          ? 'AI ใช้เวลานานเกินกำหนด ลองอีกครั้งหรือใช้คลังอาหาร'
          : e.networkError
            ? 'เชื่อมต่อ AI ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต'
            : 'เรียก AI ไม่สำเร็จ: ' + e.message;
