import { isDateStr } from './util.js';

// ตรวจและคัดกรองข้อมูลก่อนเขียนลง Firestore (ใช้ตอนกู้คืน/ย้ายข้อมูล) — เก็บเฉพาะฟิลด์ที่รู้จัก
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100000 ? v : null);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const ts = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? new Date() : d; };

export const SANITIZERS = {
  food_records: o => isDateStr(o.date) && str(o.name) ? {
    date: o.date, meal: str(o.meal, 40), name: str(o.name),
    calories: num(o.calories) ?? 0, protein: num(o.protein) ?? 0, carbs: num(o.carbs) ?? 0, fat: num(o.fat) ?? 0,
    ...(num(o.sugar) !== null && { sugar: num(o.sugar) }), ...(num(o.sodium) !== null && { sodium: num(o.sodium) }),
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
    name: str(o.name), brand: str(o.brand, 80), unit: str(o.unit, 60), gramsPerUnit: num(o.gramsPerUnit),
    calories: num(o.calories), protein: num(o.protein), carbs: num(o.carbs), fat: num(o.fat), sugar: num(o.sugar), sodium: num(o.sodium),
    ...(o.hiwpinto && typeof o.hiwpinto === 'object' && {
      hiwpinto: {
        shopCalories: num(o.hiwpinto.shopCalories), shopProtein: num(o.hiwpinto.shopProtein),
        shopCarbs: num(o.hiwpinto.shopCarbs), shopFat: num(o.hiwpinto.shopFat),
        sideCarbs: num(o.hiwpinto.sideCarbs), includedRice: o.hiwpinto.includedRice === true,
        riceProfile: o.hiwpinto.riceProfile === 'brown' ? 'brown' : 'white',
        riceGrams: o.hiwpinto.riceGrams === 180 ? 180 : 140,
        originalRiceGrams: num(o.hiwpinto.originalRiceGrams), kcalWarn: str(o.hiwpinto.kcalWarn, 300)
      }
    }),
    favorite: o.favorite === true, createdAt: ts(o.createdAt)
  } : null
};
export const COLLECTION_LABELS = {
  food_records: 'อาหารที่บันทึก', period_records: 'ประจำเดือน', body_records: 'น้ำหนัก/สัดส่วน',
  symptom_records: 'อาการรายวัน', custom_foods: 'คลังอาหารของฉัน'
};
// symptom_records ใช้วันที่เป็น doc id
export const docIdFor = (col, o, fallback) => col === 'symptom_records' ? o.date : fallback;
