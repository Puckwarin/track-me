import { gramsInUnit } from './foodConstants.js';

export function foodLogQuantity(item) {
  if (Number.isFinite(item.quantity) && item.quantity > 0) return item.quantity;
  const legacy = String(item.name || '').match(/\s×\s*(\d+(?:\.\d+)?)$/);
  return legacy ? Number(legacy[1]) : 1;
}

export const foodLogName = name => String(name || '').replace(/\s×\s*\d+(?:\.\d+)?$/, '');
export const fmtAmount = value => String(Number(Number(value).toFixed(2)));

export function foodLogPortion(item, presets = []) {
  if (Number.isFinite(item.weighedGrams) && Number.isFinite(item.edibleFraction)) {
    const edibleGrams = Number.isFinite(item.edibleGrams) ? item.edibleGrams : item.weighedGrams * item.edibleFraction;
    return `ชั่ง ${fmtAmount(item.weighedGrams)} g · ${fmtAmount(item.edibleFraction * 100)}% ≈ ${fmtAmount(edibleGrams)} g ที่กินได้`;
  }
  const quantity = foodLogQuantity(item);
  if (item.portionUnit === 'g') return `${fmtAmount(quantity)} g`;
  if (item.portionUnit === 'ml') return `${fmtAmount(quantity)} ml`;
  const inferredGrams = item.gramsPerUnit > 0 ? item.gramsPerUnit : (presets.find(p => p.name === foodLogName(item.name))?.gramsPerUnit || gramsInUnit(item.portionUnit));
  if (inferredGrams > 0) return `${fmtAmount(quantity * inferredGrams)} g`;
  if (item.portionUnit && item.portionUnit !== 'หน่วย') {
    if (/^\d/.test(item.portionUnit)) return quantity === 1 ? item.portionUnit : `×${fmtAmount(quantity)} (${item.portionUnit})`;
    return `${fmtAmount(quantity)} ${item.portionUnit}`;
  }
  return quantity === 1 ? '' : `จำนวน ×${fmtAmount(quantity)} หน่วย`;
}

export function unitNutritionFor(item, quantity = foodLogQuantity(item)) {
  const perUnit = key => quantity > 0 ? num(item[key]) / quantity : num(item[key]);
  if (item.unitNutrition && Number.isFinite(item.unitNutrition.calories)) return {
    calories: item.unitNutrition.calories,
    protein: item.unitNutrition.protein ?? perUnit('protein'), carbs: item.unitNutrition.carbs ?? perUnit('carbs'),
    fat: item.unitNutrition.fat ?? perUnit('fat'),
    sugar: item.unitNutrition.sugar ?? (item.sugar == null ? null : perUnit('sugar')),
    sodium: item.unitNutrition.sodium ?? (item.sodium == null ? null : perUnit('sodium'))
  };
  return {
    calories: perUnit('calories'), protein: perUnit('protein'), carbs: perUnit('carbs'), fat: perUnit('fat'),
    sugar: item.sugar == null ? null : perUnit('sugar'), sodium: item.sodium == null ? null : perUnit('sodium')
  };
}

const num = value => typeof value === 'number' ? value : 0;

export const canWeigh = base => Boolean(base && base.gramsPerUnit > 0 && !base.edibleFraction && !(base.unit === 'g' && base.gramsPerUnit === 1));

export function foodQuantityFromInput(raw, base) {
  if (raw === null || !canWeigh(base)) return raw;
  const gramThreshold = base.gramsPerUnit * 0.9;
  const looksLikeGrams = base.gramsPerUnit >= 15 ? raw >= gramThreshold : raw >= 10;
  return looksLikeGrams ? raw / base.gramsPerUnit : raw;
}

const r1 = v => Math.round(v * 10) / 10;
const normFoodName = v => foodLogName(String(v || '').trim()).toLocaleLowerCase('th').replace(/\s+/g, ' ');

export function hasFoodLibraryDefinitionChanged(prev, next) {
  if (!prev || !next) return false;
  const sameVal = (a, b) => (a ?? null) === (b ?? null);
  return (
    String(prev.name || '') !== String(next.name || '') ||
    String(prev.unit || '') !== String(next.unit || '') ||
    !sameVal(prev.gramsPerUnit, next.gramsPerUnit) ||
    !sameVal(prev.edibleFraction, next.edibleFraction) ||
    String(prev.edibleFractionSource || '') !== String(next.edibleFractionSource || '') ||
    !sameVal(prev.calories, next.calories) ||
    !sameVal(prev.protein, next.protein) ||
    !sameVal(prev.carbs, next.carbs) ||
    !sameVal(prev.fat, next.fat) ||
    !sameVal(prev.sugar, next.sugar) ||
    !sameVal(prev.sodium, next.sodium)
  );
}

export function matchesLibraryFoodRecord(item, updatedFood, previousFood = null) {
  if (!item || !updatedFood) return false;
  if (item.customFoodId && updatedFood.id) {
    return item.customFoodId === updatedFood.id;
  }
  if (!item.customFoodId && previousFood?.name) {
    if (normFoodName(item.name) !== normFoodName(previousFood.name)) return false;
    if (item.portionUnit && previousFood.unit && item.portionUnit !== previousFood.unit) return false;
    return true;
  }
  return false;
}

export function buildFoodRecordUpdatesFromLibrary(item, updatedFood, previousFood = null) {
  if (!matchesLibraryFoodRecord(item, updatedFood, previousFood)) return null;
  const unitNutrition = {
    calories: Number(updatedFood.calories) || 0,
    protein: Number(updatedFood.protein) || 0,
    carbs: Number(updatedFood.carbs) || 0,
    fat: Number(updatedFood.fat) || 0,
    sugar: updatedFood.sugar ?? null,
    sodium: updatedFood.sodium ?? null
  };
  const isGross = Number.isFinite(item.weighedGrams) && Number(updatedFood.edibleFraction) > 0 && Number(updatedFood.gramsPerUnit) > 0;
  const quantity = isGross
    ? item.weighedGrams * updatedFood.edibleFraction / updatedFood.gramsPerUnit
    : foodLogQuantity(item);
  const updates = {
    ...(updatedFood.id && { customFoodId: updatedFood.id }),
    name: foodLogName(updatedFood.name),
    quantity,
    portionUnit: isGross ? (item.portionUnit || updatedFood.unit || 'หน่วย') : (updatedFood.unit || 'หน่วย'),
    gramsPerUnit: isGross ? item.gramsPerUnit ?? null : (Number.isFinite(updatedFood.gramsPerUnit) ? updatedFood.gramsPerUnit : null),
    unitNutrition,
    calories: Math.round(unitNutrition.calories * quantity),
    protein: r1(unitNutrition.protein * quantity),
    carbs: r1(unitNutrition.carbs * quantity),
    fat: r1(unitNutrition.fat * quantity),
    sugar: unitNutrition.sugar === null ? null : r1(unitNutrition.sugar * quantity),
    sodium: unitNutrition.sodium === null ? null : Math.round(unitNutrition.sodium * quantity)
  };
  if (isGross) {
    updates.weighedGrams = item.weighedGrams;
    updates.edibleFraction = updatedFood.edibleFraction;
    updates.edibleGrams = item.weighedGrams * updatedFood.edibleFraction;
    updates.edibleUnitGrams = updatedFood.gramsPerUnit;
    updates.edibleFractionSource = updatedFood.edibleFractionSource || null;
  }
  return updates;
}

export const MEAL_PIE_PALETTE = ['#3E8FCF', '#7CC2F0', '#7E66B0', '#4EA885', '#E89B54', '#5CA4B8', '#94A3B8'];

export const THEME_PIE_PALETTES = {
  'baby-blue': ['#3E8FCF', '#7CC2F0', '#7E66B0', '#4EA885', '#E89B54', '#5CA4B8', '#94A3B8'],
  pastel: ['#C87FA8', '#8E9CE6', '#F2A37E', '#6EC49B', '#B085D6', '#7EC4DF', '#B8A8B8'],
  cozy: ['#8B5E3C', '#C48A5A', '#5D8A66', '#D4A553', '#A66353', '#7A8C99', '#A69585'],
  dark: ['#5EB1EB', '#93C5FD', '#A78BFA', '#6EE7B7', '#FBBF24', '#F472B6', '#94A3B8']
};

export function getMealPiePalette(theme = '') {
  const key = theme || (typeof document !== 'undefined' ? document.documentElement?.dataset?.theme : '') || 'baby-blue';
  return THEME_PIE_PALETTES[key] || MEAL_PIE_PALETTE;
}

export function buildMealCaloriePieData(items = [], meals = [], palette = MEAL_PIE_PALETTE) {
  const activePalette = Array.isArray(palette) && palette.length ? palette : MEAL_PIE_PALETTE;
  const knownNames = (meals || []).map(m => (typeof m === 'string' ? m : m?.name)).filter(Boolean);
  const buckets = new Map();
  for (const name of knownNames) buckets.set(name, { meal: name, kcal: 0, count: 0 });

  for (const item of items || []) {
    const rawMeal = item?.meal || 'มื้ออื่น ๆ';
    const key = buckets.has(rawMeal) ? rawMeal : 'มื้ออื่น ๆ';
    if (!buckets.has(key)) buckets.set(key, { meal: key, kcal: 0, count: 0 });
    const entry = buckets.get(key);
    entry.kcal += Math.max(0, Number(item?.calories) || 0);
    entry.count += 1;
  }

  const ordered = [...buckets.values()].filter(b => knownNames.includes(b.meal) || b.count > 0 || b.kcal > 0);
  const totalKcal = Math.round(ordered.reduce((sum, b) => sum + b.kcal, 0));
  const slices = ordered.map((b, idx) => {
    const kcal = Math.round(b.kcal);
    return {
      meal: b.meal,
      kcal,
      count: b.count,
      pct: totalKcal > 0 ? Math.round((kcal / totalKcal) * 100) : 0,
      color: activePalette[idx % activePalette.length]
    };
  });
  return { totalKcal, slices };
}

export function buildFoodAdvice(totals = {}, targets = {}, { hasItems = true } = {}) {
  if (!hasItems) {
    return {
      status: 'neutral',
      headline: 'ยังไม่มีข้อมูลวันนี้',
      points: ['เพิ่มรายการอาหารมื้อแรกเพื่อดูการประเมินเทียบกับเป้าหมายประจำวัน']
    };
  }
  const kcal = Number(totals.kcal) || 0;
  const protein = Number(totals.protein) || 0;
  const carbs = Number(totals.carbs) || 0;
  const fat = Number(totals.fat) || 0;
  const sugar = Number(totals.sugar) || 0;
  const sodium = Number(totals.sodium) || 0;

  const tKcal = Math.max(1, Number(targets.kcal) || 1800);
  const tProtein = Math.max(1, Number(targets.protein) || 80);
  const tCarbs = Math.max(1, Number(targets.carbs) || 200);
  const tFat = Math.max(1, Number(targets.fat) || 60);

  const warnings = [];
  const positives = [];

  if (kcal < tKcal * 0.65) {
    warnings.push(`พลังงานยังค่อนข้างน้อย (${Math.round(kcal).toLocaleString()}/${Math.round(tKcal).toLocaleString()} kcal — ${Math.round((kcal / tKcal) * 100)}% ของเป้า)`);
  } else if (kcal > tKcal * 1.15) {
    warnings.push(`พลังงานเกินเป้า +${Math.round(kcal - tKcal).toLocaleString()} kcal (${Math.round((kcal / tKcal) * 100)}% ของเป้า)`);
  }

  if (protein < tProtein * 0.7) {
    warnings.push(`โปรตีนยังต่ำกว่าเป้า (${Math.round(protein)}/${Math.round(tProtein)} g) ลองเสริมเนื้อสัตว์ ไข่ เต้าหู้ หรือโปรตีนเสริม`);
  } else if (protein >= tProtein) {
    positives.push(`โปรตีนถึงเป้าแล้ว (${Math.round(protein)}/${Math.round(tProtein)} g)`);
  }

  if (carbs > tCarbs * 1.2) {
    warnings.push(`คาร์โบไฮเดรตเกินเป้า (${Math.round(carbs)}/${Math.round(tCarbs)} g)`);
  }
  if (fat > tFat * 1.2) {
    warnings.push(`ไขมันเกินเป้า (${Math.round(fat)}/${Math.round(tFat)} g)`);
  }
  if (sugar > 36) {
    warnings.push(`น้ำตาลสูง (${Math.round(sugar)} g — เกินเกณฑ์แนะนำ ~36 g/วัน)`);
  }
  if (sodium > 2300) {
    warnings.push(`โซเดียมสูง (${Math.round(sodium).toLocaleString()} mg — เกิน 2,300 mg/วัน)`);
  }

  if (warnings.length === 0) {
    const summaryPoint = positives[0] || `พลังงาน ${Math.round(kcal).toLocaleString()}/${Math.round(tKcal).toLocaleString()} kcal อยู่ในช่วงสมดุล`;
    return {
      status: 'ok',
      headline: 'ภาพรวมโภชนาการวันนี้อยู่ในเกณฑ์เหมาะสม',
      points: [summaryPoint, ...(sugar <= 24 && sodium <= 1800 ? ['น้ำตาลและโซเดียมอยู่ในระดับดี'] : [])]
    };
  }

  return {
    status: 'warn',
    headline: warnings.length >= 3 ? 'มีหลายจุดที่ควรปรับสมดุลวันนี้' : 'มีจุดที่ควรระวังเพิ่มเติม',
    points: [...warnings, ...positives]
  };
}


