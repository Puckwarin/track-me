// Gemini: ใช้ API key ของผู้ใช้เอง (เก็บในเครื่องนี้เท่านั้น ไม่ซิงค์ ไม่อยู่ในไฟล์สำรอง)
// Stable Gemini Flash model; gemini-2.5-flash is no longer available to new users.
const MODEL = 'gemini-3.8-flash';
const KEY_NAME = 'gemini_key';

export const getGeminiKey = () => localStorage.getItem(KEY_NAME) || '';
export const setGeminiKey = k => k ? localStorage.setItem(KEY_NAME, k.trim()) : localStorage.removeItem(KEY_NAME);

async function callGemini(parts, schema) {
  const key = getGeminiKey();
  if (!key) throw new Error('NO_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 }
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
      err.quotaExceeded = /quota|resource exhausted/i.test(message);
      err.serverBusy = res.status === 503 || /high demand|temporarily unavailable|overloaded/i.test(message);
      err.retryable = [500, 502, 503, 504].includes(res.status) || /high demand|temporarily unavailable|overloaded/i.test(message) ||
        (res.status === 429 && !err.quotaExceeded);
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
  return callGemini([{ text: `ให้ข้อมูลโภชนาการมาตรฐานต่อ 100 กรัมของอาหาร "${name}" (ค่าโดยประมาณทั่วไป) ตอบเป็น JSON ตาม schema` }], {
    type: 'OBJECT',
    properties: { name: S, calories: N, protein: N, carbs: N, fat: N },
    required: ['name', 'calories', 'protein', 'carbs', 'fat']
  });
}

export async function estimateFromPhoto(file) {
  const img = await imageToInlineData(file);
  return callGemini([
    { text: 'วิเคราะห์จานอาหารในรูป ประมาณชื่ออาหาร และสารอาหารโดยรวมของทั้งจาน (kcal, โปรตีน, คาร์บ, ไขมัน เป็นกรัม) เป็นค่าประมาณ ตอบเป็น JSON ตาม schema' },
    { inline_data: img }
  ], {
    type: 'OBJECT',
    properties: { name: S, calories: N, protein: N, carbs: N, fat: N },
    required: ['name', 'calories', 'protein', 'carbs', 'fat']
  });
}

// อ่านฉลากโภชนาการ — ห้ามเดา: ค่าที่ไม่เห็นชัดต้องเป็น null
export async function readNutritionLabel(file) {
  const img = await imageToInlineData(file, 1800);
  return callGemini([
    { text: `นี่คือรูปฉลากโภชนาการ (Nutrition Facts / ข้อมูลโภชนาการ) ภาษาไทยหรืออังกฤษ
อ่านเฉพาะตัวเลขที่ "พิมพ์อยู่บนฉลากจริง" ห้ามประมาณ ห้ามคำนวณเอง ห้ามเดา
- ถ้าค่าใดมองไม่เห็น อ่านไม่ชัด หรือไม่มีบนฉลาก ให้ใส่ null
- basis: "per_serving" ถ้าตัวเลขเป็นค่าต่อ 1 หน่วยบริโภค/ต่อ 1 ซอง/ต่อ 1 ชิ้น, "per_100g" ถ้าเป็นค่าต่อ 100 กรัมหรือ 100 มล., "unknown" ถ้าไม่แน่ใจ
- servingSizeText: ข้อความขนาดหน่วยบริโภคตามที่พิมพ์ เช่น "1 ซอง (30 กรัม)"
- servingGrams: ขนาดหน่วยบริโภคเป็นกรัม/มล. ถ้าพิมพ์ไว้ชัดเจน ไม่เช่นนั้น null
- calories (kcal), protein/carbs/fat/sugar (กรัม), sodium (มิลลิกรัม)
- notes: ข้อสังเกตสั้น ๆ ที่ผู้ใช้ควรรู้ เช่น "1 ซองมี 2 หน่วยบริโภค" หรือ "ภาพเบลอ" (ไม่มีให้เป็น null)` },
    { inline_data: img }
  ], {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING', nullable: true },
      basis: { type: 'STRING', enum: ['per_serving', 'per_100g', 'unknown'] },
      servingSizeText: { type: 'STRING', nullable: true },
      servingGrams: N, calories: N, protein: N, carbs: N, fat: N, sugar: N, sodium: N,
      notes: { type: 'STRING', nullable: true }
    },
    required: ['basis', 'servingSizeText', 'servingGrams', 'calories', 'protein', 'carbs', 'fat', 'sugar', 'sodium']
  });
}

// วิเคราะห์ภาพในหน่วยความจำชั่วคราว ไม่บันทึกไฟล์ภาพลงแอป
export async function estimateStockFromPhoto(file) {
  const img = await imageToInlineData(file, 1400);
  return callGemini([
    { text: `ประเมินจากภาพสินค้า/ของใช้ที่เห็นเท่านั้น ชื่อสินค้า ปริมาณเต็มแพ็ก ปริมาณคงเหลือโดยประมาณ และหน่วย (ชิ้น, ห่อ, ml, g) ถ้าเป็นภาชนะเปิดใช้ให้ประเมินสัดส่วนอย่างระมัดระวัง ถ้าอ่านไม่ออกให้ null และระบุความไม่แน่นอน ตอบ JSON ตาม schema` },
    { inline_data: img }
  ], {
    type:'OBJECT', properties:{ name:{type:'STRING',nullable:true}, totalQuantity:N, remainingQuantity:N, unit:{type:'STRING',nullable:true}, confidence:{type:'STRING',enum:['low','medium','high']}, notes:{type:'STRING',nullable:true} },
    required:['name','totalQuantity','remainingQuantity','unit','confidence','notes']
  });
}

export const explainGeminiError = e => e.message === 'NO_KEY'
  ? 'ยังไม่ได้ใส่ Gemini API Key — ไปที่แท็บ "ตั้งค่า" (ดูวิธีขอคีย์ฟรีใน docs/SETUP.md)'
  : e.quotaExceeded
    ? 'โควตา Gemini ของ API Key นี้เต็มแล้ว ต้องรอรอบโควตาถัดไปหรือตั้ง API Key ที่มีโควตาอื่น แอปจะไม่ส่งซ้ำอัตโนมัติ'
    : e.status === 429
      ? 'Gemini จำกัดจำนวนคำขอชั่วคราว ลองอีกครั้งภายหลัง'
      : e.timeoutError
        ? 'Gemini ใช้เวลานานเกิน 20 วินาที แอปหยุดรอแล้ว ลองใหม่หรือใช้ค้นหาจากคลังอาหาร'
    : e.serverBusy
      ? 'Gemini กำลังมีผู้ใช้หนาแน่น ลองอีกครั้งในอีกสักครู่ได้ค่ะ ข้อมูลยังไม่ถูกบันทึก'
      : e.networkError
        ? 'เชื่อมต่อ Gemini ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'
        : e.retryable
          ? 'Gemini ยังตอบคำขอไม่ได้ชั่วคราว ลองอีกครั้งในอีกสักครู่ได้ค่ะ ข้อมูลยังไม่ถูกบันทึก'
          : 'เรียก Gemini ไม่สำเร็จ: ' + e.message;
