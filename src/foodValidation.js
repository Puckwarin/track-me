import { isValidCalendarDate } from './util.js';

export function validateFoodLog({ name, calories, grossMode, weighedGrams, ediblePercent, quantity, date }) {
  if (date !== undefined && !isValidCalendarDate(date)) return 'กรุณาเลือกวันที่ให้ถูกต้อง';
  if (!name || calories === null || !Number.isFinite(calories) || calories < 0 || calories >= 100000) {
    return 'กรุณากรอกชื่อเมนูและแคลอรี่ให้ถูกต้อง';
  }
  if (grossMode && (!Number.isFinite(weighedGrams) || weighedGrams <= 0 || weighedGrams >= 100000 || !Number.isFinite(ediblePercent) || ediblePercent <= 0 || ediblePercent > 100)) {
    return 'กรุณาระบุน้ำหนักที่ชั่งและสัดส่วนที่กินได้ 1–100%';
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= 100000) return 'จำนวนต้องมากกว่า 0';
  return null;
}

export function validateFoodPreset({ name, unit, calories, ediblePercent, gramsPerUnit, confirmed, protein, carbs, fat, sugar, sodium }) {
  if (!name || !unit || calories === null || !Number.isFinite(calories) || calories < 0 || calories >= 100000) {
    return 'กรุณากรอกชื่อ หน่วยบริโภค และแคลอรี่ให้ถูกต้อง';
  }
  if (gramsPerUnit !== null && gramsPerUnit !== undefined && (!Number.isFinite(gramsPerUnit) || gramsPerUnit <= 0 || gramsPerUnit >= 100000)) {
    return 'น้ำหนักต่อหน่วยต้องมากกว่า 0';
  }
  if (ediblePercent !== null && (!Number.isFinite(ediblePercent) || ediblePercent <= 0 || ediblePercent > 100 || !gramsPerUnit || gramsPerUnit <= 0)) {
    return 'สัดส่วนที่กินได้ต้องอยู่ระหว่าง 1–100% และต้องระบุน้ำหนักต่อหน่วยด้วย';
  }
  for (const val of [protein, carbs, fat, sugar, sodium]) {
    if (val !== null && val !== undefined && (!Number.isFinite(val) || val < 0 || val >= 100000)) {
      return 'ค่าสารอาหารต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป';
    }
  }
  if (!confirmed) return 'กรุณาติ๊กยืนยันว่าตรวจสอบกับฉลากแล้ว';
  return null;
}
