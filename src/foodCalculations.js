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
