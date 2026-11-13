// โมเดล Gemini ที่ลองใช้งานตามลำดับ (แต่ละโมเดลมีโควตาแยกกัน)
const GEMINI_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
const KEY_NAME = 'gemini_key';
const GROQ_KEY='groq_key', OPENROUTER_KEY='openrouter_key';
export const getGroqKey=()=>localStorage.getItem(GROQ_KEY)||'';
export const setGroqKey=k=>k?localStorage.setItem(GROQ_KEY,k.trim()):localStorage.removeItem(GROQ_KEY);
export const getOpenRouterKey=()=>localStorage.getItem(OPENROUTER_KEY)||'';
export const setOpenRouterKey=k=>k?localStorage.setItem(OPENROUTER_KEY,k.trim()):localStorage.removeItem(OPENROUTER_KEY);

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


async function callOpenAICompatible(provider, parts, schema) {
  const groq=provider==='groq', key=groq?getGroqKey():getOpenRouterKey();
  const model=groq?'qwen/qwen3.8-27b':'openrouter/free';
  const endpoint=groq?'https://api.groq.com/openai/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions';
  const messages=parts.map(p=>p.inline_data
    ? {type:'image_url',image_url:{url:'data:'+p.inline_data.mime_type+';base64,'+p.inline_data.data}}
    : {type:'text',text:p.text||''});
  const schemaHint=Object.entries(schema?.properties||{}).map(([k,v])=>k+': '+(v.type==='NUMBER'?'number or null':v.type==='STRING'?'string':'value')).join(', ');
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,...(groq?{}:{'HTTP-Referer':window.location.origin,'X-Title':'Track Me'})},
    body:JSON.stringify({model,messages:[{role:'user',content:[{type:'text',text:'Return only valid JSON with these fields: '+schemaHint},...messages]}],response_format:{type:'json_object'},temperature:0}),signal:AbortSignal.timeout(25000)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const e=new Error(data?.error?.message||provider+' HTTP '+res.status);e.status=res.status;e.quotaExceeded=[402,429].includes(res.status)||/quota|rate.?limit/i.test(e.message);e.retryable=e.quotaExceeded||res.status>=500;throw e;}
  const content=data?.choices?.[0]?.message?.content;
  if(!content)throw new Error(provider+' ไม่ส่งผลลัพธ์กลับมา');
  return JSON.parse(String(content).split(String.fromCharCode(96).repeat(3)).join('').trim());
}
async function callAI(parts,schema){
  const providers=[['Gemini',getGeminiKey(),()=>callGeminiProvider(parts,schema)],['Groq',getGroqKey(),()=>callOpenAICompatible('groq',parts,schema)],['OpenRouter',getOpenRouterKey(),()=>callOpenAICompatible('openrouter',parts,schema)]].filter(x=>x[1]);
  if(!providers.length)throw new Error('NO_KEY');
  const errors=[];
  for(let i=0;i<providers.length;i++){const [name,,run]=providers[i];try{const result=await run();if(i>0)window.dispatchEvent(new CustomEvent('trackme:ai-fallback',{detail:{provider:name,failed:errors.length}}));return result;}catch(e){if(providers.length===1)throw e;errors.push(name+': '+(e.message||'error'));}}
  const err=new Error('AI ทุกแหล่งที่ตั้งค่าไว้ไม่พร้อมใช้งาน — '+errors.join(' · '));err.fallbackErrors=errors;err.quotaExceeded=errors.some(x=>/429|quota|limit/i.test(x));throw err;
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
    const mod=await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js');
    const worker=await mod.createWorker('tha+eng');
    try { const result=await worker.recognize(file); return result?.data?.text||''; }
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

export const explainGeminiError = e => e.message === 'NO_KEY'
  ? 'ยังไม่ได้ใส่คีย์ AI — ตั้งค่า Gemini, Groq หรือ OpenRouter ในหน้า Settings'
  : e.invalidKey
    ? 'คีย์ Gemini ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน (ตรวจคีย์ใน ตั้งค่า หรือเปิดใช้ Generative Language API): ' + e.message
    : e.fallbackErrors
      ? e.message
      : e.quotaExceeded
        ? 'โควตา Gemini เต็มหรือถูกจำกัดในโมเดลที่ลองใช้ (' + e.message + ')'
        : e.timeoutError
          ? 'AI ใช้เวลานานเกินกำหนด ลองอีกครั้งหรือใช้คลังอาหาร'
          : e.networkError
            ? 'เชื่อมต่อ AI ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ต'
            : 'เรียก AI ไม่สำเร็จ: ' + e.message;
