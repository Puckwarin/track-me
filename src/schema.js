import { isDateStr } from './util.js';

// ตรวจและคัดกรองข้อมูลก่อนเขียนลง Firestore (ใช้ตอนกู้คืน/ย้ายข้อมูล) — เก็บเฉพาะฟิลด์ที่รู้จัก
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100000 ? v : null);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const ts = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? new Date() : d; };

export const SANITIZERS = {
  food_records: o => isDateStr(o.date) && str(o.name) ? {
    date: o.date, meal: str(o.meal, 40), mealId: typeof o.mealId === 'string' && /^[\w-]{1,40}$/.test(o.mealId) ? o.mealId : null, name: str(o.name),
    calories: num(o.calories) ?? 0, protein: num(o.protein) ?? 0, carbs: num(o.carbs) ?? 0, fat: num(o.fat) ?? 0,
    ...(num(o.sugar) !== null && { sugar: num(o.sugar) }), ...(num(o.sodium) !== null && { sodium: num(o.sodium) }),
    ...(num(o.quantity) !== null && { quantity: num(o.quantity) }),
    ...(o.unitNutrition && typeof o.unitNutrition === 'object' && { unitNutrition: Object.fromEntries(['calories','protein','carbs','fat','sugar','sodium'].filter(k => num(o.unitNutrition[k]) !== null).map(k => [k,num(o.unitNutrition[k])])) }),
    ...(num(o.weighedGrams) !== null && { weighedGrams: num(o.weighedGrams) }),
    ...(num(o.edibleFraction) !== null && o.edibleFraction <= 1 && { edibleFraction: o.edibleFraction }),
    ...(num(o.edibleGrams) !== null && { edibleGrams: num(o.edibleGrams) }),
    ...(num(o.edibleUnitGrams) !== null && { edibleUnitGrams: num(o.edibleUnitGrams) }),
    ...(o.edibleFractionSource && { edibleFractionSource: str(o.edibleFractionSource, 300) }),
    ...(isDateStr(o.copiedFrom) && { copiedFrom: o.copiedFrom }),
    createdAt: ts(o.createdAt || o.timestamp)
  } : null,
  period_records: o => isDateStr(o.start) && (o.end == null || isDateStr(o.end)) && (!o.end || o.end >= o.start) ? {
    start: o.start, end: o.end || null, flow: str(o.flow, 20), note: str(o.note), createdAt: ts(o.createdAt || o.timestamp)
  } : null,
  body_records: o => isDateStr(o.date) && ['weight', 'bust', 'waist', 'hip'].some(k => num(o[k]) !== null) ? {
    date: o.date, weight: num(o.weight), bust: num(o.bust), waist: num(o.waist), hip: num(o.hip), note: str(o.note), createdAt: ts(o.createdAt || o.timestamp)
  } : null,
  symptom_records: o => isDateStr(o.date) ? {
    date: o.date,
    symptoms: Object.fromEntries(['cramps', 'backache', 'headache', 'acne', 'fatigue', 'bloating'].map(k => [k, int(o.symptoms?.[k], 0, 3) ?? 0])),
    mood: int(o.mood, 1, 5), stress: int(o.stress, 1, 5), note: str(o.note), updatedAt: ts(o.updatedAt)
  } : null,
  custom_foods: o => str(o.name) && str(o.unit, 60) && num(o.calories) !== null ? {
    name: str(o.name), brand: str(o.brand, 80), unit: str(o.unit, 60), gramsPerUnit: num(o.gramsPerUnit), defaultQuantity:num(o.defaultQuantity), category:str(o.category,80), edibleFraction: num(o.edibleFraction), edibleFractionSource: str(o.edibleFractionSource,300),
    calories: num(o.calories), protein: num(o.protein), carbs: num(o.carbs), fat: num(o.fat), sugar: num(o.sugar), sodium: num(o.sodium),
    ...(o.hiwpinto && typeof o.hiwpinto === 'object' && {
      hiwpinto: {
        shopCalories: num(o.hiwpinto.shopCalories), shopProtein: num(o.hiwpinto.shopProtein),
        shopCarbs: num(o.hiwpinto.shopCarbs), shopFat: num(o.hiwpinto.shopFat),
        sideCarbs: num(o.hiwpinto.sideCarbs), includedRice: o.hiwpinto.includedRice === true,
        riceProfile: o.hiwpinto.riceProfile === 'brown' ? 'brown' : 'white',
        baseRiceGrams: num(o.hiwpinto.baseRiceGrams) ?? 100,
        riceGrams: o.hiwpinto.riceGrams === 140 ? 140 : 180,
        originalRiceGrams: num(o.hiwpinto.originalRiceGrams), kcalWarn: str(o.hiwpinto.kcalWarn, 300)
      }
    }),
    favorite: o.favorite === true, createdAt: ts(o.createdAt)
  } : null,
  skincare_products: o => str(o.name) ? {
    name: str(o.name), openedDate: isDateStr(o.openedDate) ? o.openedDate : null, paoMonths: int(o.paoMonths, 1, 120), expiryDate: isDateStr(o.expiryDate) ? o.expiryDate : null,
    ingredients: str(o.ingredients, 3000), pros: str(o.pros, 2000), cons: str(o.cons, 2000), createdAt: ts(o.createdAt)
  } : null,
  skin_records: o => isDateStr(o.date) ? { date:o.date, symptoms:Object.fromEntries(['rash','itch','burning','redness','peeling','dryness'].map(k=>[k,int(o.symptoms?.[k],0,3)??0])), result:str(o.result,2000), updatedAt:ts(o.updatedAt) } : null,
  ingredient_blacklist: o => ({ ingredients:str(o.ingredients,5000), updatedAt:ts(o.updatedAt) }),
  pet_profiles: o => str(o.name) && num(o.weightKg) !== null ? { name:str(o.name), kind:str(o.kind,120), birthDate:isDateStr(o.birthDate)?o.birthDate:null, weightKg:num(o.weightKg), weightHistory:Array.isArray(o.weightHistory)?o.weightHistory.filter(x=>isDateStr(x?.date)&&num(x?.weightKg)!==null).slice(-365).map(x=>({date:x.date,weightKg:num(x.weightKg)})):[], lifeStage:['neutered','intact','inactive','puppy-young','puppy-old'].includes(o.lifeStage)?o.lifeStage:'neutered', createdAt:ts(o.createdAt), updatedAt:ts(o.updatedAt) } : null,
  pet_care_records: o => str(o.type,80) && isDateStr(o.date) ? { petId:str(o.petId,80), type:str(o.type,80), date:o.date, nextDate:isDateStr(o.nextDate)?o.nextDate:null, note:str(o.note,2000), createdAt:ts(o.createdAt) } : null,
  pet_food_records: o => str(o.name) && num(o.grams)!==null && isDateStr(o.date) ? { petId:str(o.petId,80), date:o.date, name:str(o.name), grams:num(o.grams), kcalPer100:num(o.kcalPer100), allergy:['yes','no','unknown'].includes(o.allergy)?o.allergy:'unknown', note:str(o.note,2000), createdAt:ts(o.createdAt) } : null,
  tracked_products: o => str(o.name) && str(o.unit,80) ? { name:str(o.name), category:str(o.category,100), quantity:num(o.quantity), unit:str(o.unit,80), lowAt:num(o.lowAt), expiryDate:isDateStr(o.expiryDate)?o.expiryDate:null, openedDate:isDateStr(o.openedDate)?o.openedDate:null, paoMonths:int(o.paoMonths,1,120), paoExpiry:isDateStr(o.paoExpiry)?o.paoExpiry:null, ingredients:str(o.ingredients,3000), pros:str(o.pros,2000), cons:str(o.cons,2000), createdAt:ts(o.createdAt), updatedAt:ts(o.updatedAt) } : null,
  replacement_records: o => str(o.name) && isDateStr(o.date) ? { name:str(o.name), date:o.date, intervalDays:int(o.intervalDays,1,3650), nextDate:isDateStr(o.nextDate)?o.nextDate:null, note:str(o.note,2000), createdAt:ts(o.createdAt) } : null,

  workout_records: o => isDateStr(o.date) && ['walk','upper','lower','full','pilates','stretch','other'].includes(o.type) ? {
    date:o.date, type:o.type, typeLabel:str(o.typeLabel,40), durationMin:num(o.durationMin),
    sections:Object.fromEntries(['warmup','main','cooldown'].map(k=>[k,(Array.isArray(o.sections?.[k])?o.sections[k]:[]).slice(0,40).filter(r=>r&&str(r.name,80)).map(r=>({name:str(r.name,80),weightKg:num(r.weightKg),perSide:r.perSide===true,sets:int(r.sets,1,99),reps:num(r.reps),repUnit:['sec','min'].includes(r.repUnit)?r.repUnit:'reps',note:str(r.note,120)}))])),
    note:str(o.note,300), createdAt:ts(o.createdAt)
  } : null,
  workout_templates: o => str(o.name,60) && ['walk','upper','lower','full','pilates','stretch','other'].includes(o.type) ? {
    name:str(o.name,60), type:o.type,
    sections:Object.fromEntries(['warmup','main','cooldown'].map(k=>[k,(Array.isArray(o.sections?.[k])?o.sections[k]:[]).slice(0,40).filter(r=>r&&str(r.name,80)).map(r=>({name:str(r.name,80),weightKg:num(r.weightKg),perSide:r.perSide===true,sets:int(r.sets,1,99),reps:num(r.reps),repUnit:['sec','min'].includes(r.repUnit)?r.repUnit:'reps',note:str(r.note,120)}))])),
    createdAt:ts(o.createdAt)
  } : null,
  settings: o => ({
    sex:o.sex==='male'?'male':'female', birthYear:int(o.birthYear,1900,2100), heightCm:num(o.heightCm), weightKg:num(o.weightKg),
    activity:['sedentary','light','moderate','active','very'].includes(o.activity)?o.activity:'light',
    adjust:typeof o.adjust==='number'&&Math.abs(o.adjust)<=1500?Math.round(o.adjust):0,
    kcalOverride:num(o.kcalOverride), proteinPerKg:num(o.proteinPerKg), fatPct:num(o.fatPct),
    meals:(Array.isArray(o.meals)?o.meals:[]).slice(0,12).filter(m=>m&&/^[\w-]{1,40}$/.test(m.id||'')&&str(m.name,30)).map(m=>({id:m.id,name:str(m.name,30),pct:num(m.pct)??0})),
    updatedAt:ts(o.updatedAt)
  }),
};
export const COLLECTION_LABELS = {
  food_records: 'อาหารที่บันทึก', period_records: 'ประจำเดือน', body_records: 'น้ำหนัก/สัดส่วน',
  symptom_records: 'อาการรายวัน', custom_foods: 'คลังอาหารของฉัน', workout_records:'บันทึกการออกกำลังกาย', workout_templates:'เทมเพลตออกกำลังกาย', settings:'เป้าหมายและมื้ออาหาร', skincare_products:'ผลิตภัณฑ์สกินแคร์เดิม', skin_records:'ผลและอาการผิว', ingredient_blacklist:'ส่วนผสมที่หลีกเลี่ยง', pet_profiles:'โปรไฟล์สัตว์เลี้ยง', pet_care_records:'นัดและการดูแลสัตว์เลี้ยง', pet_food_records:'อาหารสัตว์เลี้ยง', tracked_products:'ของใช้และสต๊อก', replacement_records:'ประวัติเปลี่ยนของ'
};
// symptom_records ใช้วันที่เป็น doc id
export const docIdFor = (col, o, fallback) => ['symptom_records','skin_records'].includes(col) ? o.date : col === 'settings' ? 'profile' : fallback;
