export function validateFoodLog({ name, calories, grossMode, weighedGrams, ediblePercent, quantity }) {
  if (!name || calories === null) return 'กรุณากรอกชื่อเมนูและแคลอรี่';
  if (grossMode && (!weighedGrams || weighedGrams <= 0 || !ediblePercent || ediblePercent > 100)) {
    return 'กรุณาระบุน้ำหนักที่ชั่งและสัดส่วนที่กินได้ 1–100%';
  }
  if (quantity <= 0) return 'จำนวนต้องมากกว่า 0';
  return null;
}

export function validateFoodPreset({ name, unit, calories, ediblePercent, gramsPerUnit, confirmed }) {
  if (!name || !unit || calories === null || calories < 0) {
    return 'กรุณากรอกชื่อ หน่วยบริโภค และแคลอรี่';
  }
  if (ediblePercent !== null && (ediblePercent <= 0 || ediblePercent > 100 || !gramsPerUnit || gramsPerUnit <= 0)) {
    return 'สัดส่วนที่กินได้ต้องอยู่ระหว่าง 1–100% และต้องระบุน้ำหนักต่อหน่วยด้วย';
  }
  if (!confirmed) return 'กรุณาติ๊กยืนยันว่าตรวจสอบกับฉลากแล้ว';
  return null;
}
