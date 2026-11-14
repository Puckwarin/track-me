// โมเดล Gemini ที่ลองใช้งานตามลำดับ (Fallback อัตโนมัติเมื่อช้า/Timeout หรือติด 429 Rate Limit)
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const GEMINI_TIMEOUT_MS = 35000;
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
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(id => id && !GEMINI_MODELS.includes(id) &&
        /(flash|lite)/i.test(id) &&
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
  // ปิดโหมดคิดนานในโมเดล Gemini 2.5 เพื่อให้ตอบกลับรวดเร็วและไม่ติด Timeout
  if (/^gemini-2\.5-/i.test(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        // ส่ง key ใน header (ไม่ใส่ใน URL เพื่อไม่ให้ไปค้างใน log/ประวัติเบราว์เซอร์)
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
      });
    } catch (cause) {
      const isTimeout = cause?.name === 'AbortError' || cause?.name === 'TimeoutError';
      const err = new Error(isTimeout ? 'หมดเวลารอคำตอบจาก Gemini (35 วินาที)' : (cause.message || 'Network error'));
      err.timeoutError = isTimeout;
      err.networkError = !isTimeout;
      throw err;
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
      err.retryable = [500, 502, 503, 504].includes(res.status) || /high demand|temporarily unavailable|overloaded/i.test(message);
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
    const cleaned = text.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
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
        if (e.invalidKey) throw e;
        tried.push({ model, error: e });
        // หาก Timeout, 429 (Quota/Rate Limit), 404, 5xx หรือ error เฉพาะโมเดล ให้สลับไปลองโมเดลถัดไปทันที
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
  err.timeoutError = tried.length > 0 && tried.every(x => x.error.timeoutError);
  err.networkError = tried.length > 0 && tried.every(x => x.error.networkError);
  err.status = last?.status;
  throw err;
}

const GROQ_TEXT_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const GROQ_VISION_MODELS = ['llama-3.2-11b-vision-preview', 'llama-3.2-90b-vision-preview'];
const GROQ_TIMEOUT_MS = 35000;

function schemaSummary(schema) {
  if (!schema?.properties) return 'JSON object';
  return Object.entries(schema.properties).map(([k, v]) => {
    if (v.type === 'ARRAY') return `${k}: array of objects (${Object.keys(v.items?.properties || {}).join(', ')})`;
    return `${k}: ${v.type === 'NUMBER' ? 'number or null' : v.type === 'STRING' ? 'string or null' : 'value'}`;
  }).join(', ');
}

async function fetchGroqModels(key) {
  try {
    const mRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(10000)
    });
    if (!mRes.ok) return [];
    const mData = await mRes.json().catch(() => ({}));
    return (mData.data || []).map(x => x.id).filter(Boolean);
  } catch {
    return [];
  }
}

async function callGroq(parts, schema) {
  const key = getGroqKey();
  if (!key) throw new Error('NO_KEY');
  const hasImage = parts.some(p => p.inline_data);
  let models = [...(hasImage ? GROQ_VISION_MODELS : GROQ_TEXT_MODELS)];
  const contentParts = parts.map(p => p.inline_data
    ? { type: 'image_url', image_url: { url: 'data:' + p.inline_data.mime_type + ';base64,' + p.inline_data.data } }
    : { type: 'text', text: p.text || '' });
  const schemaHint = schemaSummary(schema);

  const sendReq = async (model, useJsonFormat) => {
    const messages = hasImage
      ? [{ role: 'user', content: [{ type: 'text', text: 'Return ONLY a valid json object (no markdown) with these fields: ' + schemaHint }, ...contentParts] }]
      : [
          { role: 'system', content: 'You are a nutrition data extractor. Always reply with a single valid json object only (no markdown, no explanation) matching fields: ' + schemaHint },
          { role: 'user', content: parts.map(p => p.text || '').join('\n') + '\nReturn valid json.' }
        ];
    const payload = { model, messages, temperature: 0 };
    if (useJsonFormat) payload.response_format = { type: 'json_object' };
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(GROQ_TIMEOUT_MS)
      });
      const data = await res.json().catch(() => ({}));
      return { res, data, fetchErr: null };
    } catch (cause) {
      const isTimeout = cause?.name === 'AbortError' || cause?.name === 'TimeoutError';
      const err = new Error(isTimeout ? 'หมดเวลารอคำตอบจาก Groq' : (cause.message || 'Groq network error'));
      err.timeoutError = isTimeout;
      err.networkError = !isTimeout;
      return { res: null, data: {}, fetchErr: err };
    }
  };

  let lastErr = null;
  let discovered = false;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    let { res, data, fetchErr } = await sendReq(model, true);
    if (fetchErr) {
      lastErr = fetchErr;
      continue;
    }
    if (!res.ok && res.status === 400) {
      const failedGen = data?.error?.failed_generation;
      if (typeof failedGen === 'string') {
        const recovered = failedGen.replace(/```json|```/gi, '').trim().match(/\{[\s\S]*\}/);
        if (recovered) {
          try { return JSON.parse(recovered[0]); } catch {}
        }
      }
      if (/response_format|json_object|json_validate_failed/i.test(data?.error?.message || '')) {
        ({ res, data, fetchErr } = await sendReq(model, false));
        if (fetchErr) {
          lastErr = fetchErr;
          continue;
        }
      }
    }
    if (res.ok) {
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        lastErr = new Error('Groq ไม่ส่งผลลัพธ์กลับมา');
        continue;
      }
      try {
        const cleaned = String(content).split(String.fromCharCode(96).repeat(3)).join('').replace(/^json\s*/i, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      } catch {
        lastErr = new Error('Groq ตอบกลับไม่ใช่รูปแบบ JSON ที่ถูกต้อง');
        continue;
      }
    }
    const e = new Error(data?.error?.message || 'Groq HTTP ' + res.status);
    e.status = res.status;
    e.invalidKey = res.status === 401 || res.status === 403;
    e.quotaExceeded = [402, 429].includes(res.status) || /quota|rate.?limit/i.test(e.message);
    lastErr = e;
    if (e.invalidKey) throw e;
    // ถ้าโมเดลวิชันหลักไม่มีในบัญชี ลองค้นหาโมเดลวิชันที่เปิดใช้งานอยู่จริงจากบัญชีนี้เพิ่มอีก 1 รอบ
    if (hasImage && !discovered && i === models.length - 1) {
      discovered = true;
      const available = await fetchGroqModels(key);
      const extraVision = available.filter(id => !models.includes(id) && /vision|llava|pixtral/i.test(id));
      if (extraVision.length) models = [...models, ...extraVision];
    }
  }
  throw lastErr || new Error('Groq ไม่พร้อมใช้งาน');
}

async function callAI(parts, schema, { order = 'gemini-first', includeMeta = false } = {}) {
  const geminiEntry = ['Gemini', getGeminiKey(), () => callGeminiProvider(parts, schema)];
  const groqEntry = ['Groq', getGroqKey(), () => callGroq(parts, schema)];
  const providers = (order === 'groq-first' ? [groqEntry, geminiEntry] : [geminiEntry, groqEntry]).filter(x => x[1]);
  if (!providers.length) throw new Error('NO_KEY');
  const errors = [];
  for (let i = 0; i < providers.length; i++) {
    const [name, , run] = providers[i];
    try {
      const result = await run();
      if (i > 0) window.dispatchEvent(new CustomEvent('trackme:ai-fallback', { detail: { provider: name, failed: errors.length } }));
      return includeMeta ? { result, provider: name } : result;
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

// ย่อรูปก่อนส่ง (เร็วกว่า ประหยัดโควตา และล้างหน่วยความจำ Canvas ทันที) — ถ้าอ่านไฟล์ไม่ได้ (เช่น HEIC) ส่งไฟล์เดิม
export async function imageToInlineData(file, maxDim = 1024, quality = 0.78) {
  let bmp = null;
  const c = document.createElement('canvas');
  try {
    bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', quality).split(',')[1];
    ctx.clearRect(0, 0, c.width, c.height);
    return { mime_type: 'image/jpeg', data };
  } catch (e) {
    const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(file); });
    return { mime_type: file.type || 'image/jpeg', data };
  } finally {
    bmp?.close?.();
    c.width = 0;
    c.height = 0;
  }
}

const S = { type: 'STRING' };
const N = { type: 'NUMBER', nullable: true };

export function lookupPer100g(name) {
  return callAI([{ text: `ให้ข้อมูลโภชนาการมาตรฐานต่อ 100 กรัมของอาหาร "${name}" (ค่าโดยประมาณทั่วไป) ตอบเป็น JSON ตาม schema` }], {
    type: 'OBJECT',
    properties: { name: S, calories: N, protein: N, carbs: N, fat: N },
    required: ['name', 'calories', 'protein', 'carbs', 'fat']
  }, { order: 'groq-first' });
}

export function lookupPer100gWithProvider(name) {
  return callAI([{ text: `ให้ข้อมูลโภชนาการมาตรฐานต่อ 100 กรัมของอาหาร "${name}" (ค่าโดยประมาณทั่วไป) ตอบเป็น JSON ตาม schema` }], {
    type: 'OBJECT',
    properties: { name: S, calories: N, protein: N, carbs: N, fat: N },
    required: ['name', 'calories', 'protein', 'carbs', 'fat']
  }, { order: 'groq-first', includeMeta: true });
}

export async function estimateFromPhoto(file) {
  const img = await imageToInlineData(file, 1024, 0.78);
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
  const hasAiKey = Boolean(getGeminiKey() || getGroqKey());
  if (!hasAiKey) {
    const ocr = await tryLabelOcr(file);
    const kcal = labelNumber(ocr, [/(?:energy|พลังงาน)[^\d]{0,30}(\d+(?:[.,]\d+)?)[^\d]{0,8}(?:kcal|กิโลแคลอรี)?/i]);
    const protein = labelNumber(ocr, [/(?:protein|โปรตีน)[^\d]{0,24}(\d+(?:[.,]\d+)?)/i]);
    const carbs = labelNumber(ocr, [/(?:total carbohydrate|carbohydrate|คาร์โบไฮเดรต)[^\d]{0,32}(\d+(?:[.,]\d+)?)/i]);
    const fat = labelNumber(ocr, [/(?:total fat|fat|ไขมัน)[^\d]{0,24}(\d+(?:[.,]\d+)?)/i]);
    if ([kcal, protein, carbs, fat].some(x => x !== null)) {
      return {
        name: null, basis: /100\s*(?:g|กรัม|ml|มล)/i.test(ocr) ? 'per_100g' : 'unknown',
        servingSizeText: null, servingGrams: null, calories: kcal, protein, carbs, fat, sugar: null, sodium: null,
        notes: 'อ่านเบื้องต้นด้วย OCR ในเครื่อง (ไม่ได้ตั้งคีย์ AI) — โปรดตรวจตัวเลขและหน่วยกับรูปฉลากก่อนบันทึก'
      };
    }
    throw new Error('NO_KEY');
  }
  const image = await imageToInlineData(file, 1200, 0.82);
  const instruction = 'นี่คือฉลากโภชนาการภาษาไทยหรืออังกฤษ. อ่านเฉพาะตัวเลขที่พิมพ์จริง ห้ามประมาณหรือเดา; ค่าอ่านไม่ชัดให้เป็น null. basis เป็น per_serving, per_100g หรือ unknown; ระบุ servingSizeText/servingGrams หากชัด. ส่ง JSON ตาม schema';
  return callAI([{ text: instruction }, { inline_data: image }], {
    type: 'OBJECT', properties: { name: { type: 'STRING', nullable: true }, basis: { type: 'STRING', enum: ['per_serving', 'per_100g', 'unknown'] }, servingSizeText: { type: 'STRING', nullable: true }, servingGrams: N, calories: N, protein: N, carbs: N, fat: N, sugar: N, sodium: N, notes: { type: 'STRING', nullable: true } },
    required: ['basis', 'servingSizeText', 'servingGrams', 'calories', 'protein', 'carbs', 'fat', 'sugar', 'sodium']
  });
}

// วิเคราะห์รูปอาหารหรือฉลากโภชนาการในปุ่มเดียว (ลดขั้นตอนบนมือถือ)
export async function analyzeFoodImage(file) {
  const hasAiKey = Boolean(getGeminiKey() || getGroqKey());
  if (!hasAiKey) {
    const label = await readNutritionLabel(file);
    return { kind: 'label', ...label };
  }
  const image = await imageToInlineData(file, 1100, 0.8);
  const instruction = 'ดูภาพนี้แล้วแยกว่าเป็น "ฉลากโภชนาการ/ตารางข้อมูลโภชนาการบนบรรจุภัณฑ์" (kind="label") หรือ "จานอาหาร/เครื่องดื่มพร้อมกิน" (kind="dish").\n' +
    '- ถ้าเป็น label: อ่านเฉพาะตัวเลขที่พิมพ์จริง ห้ามเดา (ค่าที่ไม่ชัดให้ null), basis เป็น per_serving | per_100g | unknown, ระบุ servingSizeText/servingGrams ถ้าชัด\n' +
    '- ถ้าเป็น dish: ประมาณชื่อเมนู และค่า kcal, protein, carbs, fat ของทั้งจาน (basis="per_serving")\n' +
    'ตอบเป็น JSON ตาม schema เท่านั้น';
  return callAI([{ text: instruction }, { inline_data: image }], {
    type: 'OBJECT',
    properties: {
      kind: { type: 'STRING', enum: ['dish', 'label'] },
      name: { type: 'STRING', nullable: true },
      basis: { type: 'STRING', enum: ['per_serving', 'per_100g', 'unknown'] },
      servingSizeText: { type: 'STRING', nullable: true },
      servingGrams: N,
      calories: N,
      protein: N,
      carbs: N,
      fat: N,
      sugar: N,
      sodium: N,
      notes: { type: 'STRING', nullable: true }
    },
    required: ['kind', 'name', 'calories', 'protein', 'carbs', 'fat']
  });
}

// วิเคราะห์ภาพในหน่วยความจำชั่วคราว ไม่บันทึกไฟล์ภาพลงแอป
export async function estimateStockFromPhoto(file) {
  const img = await imageToInlineData(file, 1024, 0.78);
  return callAI([
    { text: `วิเคราะห์ภาพสินค้า/ของใช้/ฉลากวันหมดอายุ: ระบุชื่อสินค้า, ปริมาณเต็มแพ็ก, ปริมาณคงเหลือโดยประมาณ, หน่วย (ชิ้น, ห่อ, หลอด, ml, g), วันหมดอายุหรือควรใช้ก่อนในรูปแบบ YYYY-MM-DD คริสต์ศักราช (หากเป็น พ.ศ. ให้ลบ 543, หากไม่เห็นวันหมดอายุให้ null), สภาพ/หมายเหตุ และระดับความมั่นใจ ตอบ JSON ตาม schema` },
    { inline_data: img }
  ], {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING', nullable: true },
      totalQuantity: N,
      remainingQuantity: N,
      unit: { type: 'STRING', nullable: true },
      expiryDate: { type: 'STRING', nullable: true },
      confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
      notes: { type: 'STRING', nullable: true }
    },
    required: ['name', 'totalQuantity', 'remainingQuantity', 'unit', 'expiryDate', 'confidence', 'notes']
  });
}

export async function estimateStockFromPhotos(files, onProgress = () => {}) {
  const list = [...files];
  const results = new Array(list.length);
  const errors = [];
  let done = 0;
  let cursor = 0;
  const concurrency = Math.min(2, list.length || 1);
  async function worker() {
    while (cursor < list.length) {
      const idx = cursor++;
      const f = list[idx];
      try {
        const res = await estimateStockFromPhoto(f);
        results[idx] = { fileName: f.name, ...res };
      } catch (err) {
        errors.push({ fileName: f.name, message: explainGeminiError(err) });
      } finally {
        done++;
        onProgress(done, list.length);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { results: results.filter(Boolean), errors };
}

export async function parseReminderWithAI(text, today, existingTitles = []) {
  const prompt = `วันนี้คือ ${today}. แปลงข้อความแจ้งเตือนภาษาไทยต่อไปนี้เป็นโครงสร้าง JSON:\n"${text}"\n` +
    (existingTitles.length ? `รายการแจ้งเตือนที่มีอยู่แล้ว: ${existingTitles.slice(0, 20).join(', ')}\n` : '') +
    `หมวดหมู่เลือกจาก: สัตว์เลี้ยง | เปลี่ยนของ | เอกสาร/ประกัน/ภาษี | นัดหมาย/อื่น ๆ\n` +
    `ruleKind เลือกจาก: once | interval | monthly | yearly | nth_weekday | last_weekday | same_as | weekly_except_linked\n` +
    `weekday: 0=จันทร์..5=เสาร์..6=อาทิตย์ (หรือ null). nth: 1-4 (หรือ null). remindDays: จำนวนวันเตือนล่วงหน้า (เช่น ก่อนสามวัน=3, สองสัปดาห์=14, ค่าเริ่มต้น=7). dueTime: HH:MM หรือ null.`;
  return callAI([{ text: prompt }], {
    type: 'OBJECT',
    properties: {
      title: S,
      kind: S,
      nextDate: { type: 'STRING', nullable: true },
      dueTime: { type: 'STRING', nullable: true },
      remindDays: N,
      ruleKind: S,
      weekday: N,
      nth: N,
      intervalDays: N,
      repeatMonths: N,
      linkedQuery: { type: 'STRING', nullable: true },
      note: { type: 'STRING', nullable: true }
    },
    required: ['title', 'kind', 'nextDate', 'remindDays', 'ruleKind']
  }, { order: 'groq-first' });
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
      if (e.invalidKey) throw e;
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
  const textModel = GROQ_TEXT_MODELS.find(id => ids.includes(id)) || ids.find(id => !/whisper|tts|guard|embed|vision/i.test(id));
  const visionModel = GROQ_VISION_MODELS.find(id => ids.includes(id)) || ids.find(id => /vision|llava|pixtral/i.test(id)) || null;
  const picked = textModel || visionModel;
  if (!picked) return { ok: true, model: 'API Key ถูกต้อง', visionModel: null };
  const cRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: picked, messages: [{ role: 'user', content: 'Reply with JSON {"ok":true}' }], response_format: { type: 'json_object' }, max_tokens: 20, temperature: 0 }),
    signal: AbortSignal.timeout(15000)
  });
  const cData = await cRes.json().catch(() => ({}));
  if (!cRes.ok) {
    const err = new Error(cData?.error?.message || `HTTP ${cRes.status}`);
    err.quotaExceeded = cRes.status === 429;
    throw err;
  }
  return { ok: true, model: picked, visionModel };
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
