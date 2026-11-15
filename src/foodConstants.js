import { state } from './state.js';
import { guessFoodCategory } from './foodParser.js';

export const MEAL_ORDER = ['มื้อเช้า', 'มื้อกลางวัน', 'มื้อเย็น', 'ของว่าง/เครื่องดื่ม'];
export const MEAL_COLORS = {
  'มื้อเช้า': { header: 'bg-amber-100 text-amber-900', row: 'bg-amber-50/60', icon: 'fa-sun' },
  'มื้อกลางวัน': { header: 'bg-sky-100 text-sky-900', row: 'bg-sky-50/60', icon: 'fa-cloud-sun' },
  'มื้อเย็น': { header: 'bg-violet-100 text-violet-900', row: 'bg-violet-50/60', icon: 'fa-moon' },
  'ของว่าง/เครื่องดื่ม': { header: 'bg-pink-100 text-pink-900', row: 'bg-pink-50/60', icon: 'fa-mug-hot' }
};

export const DEFAULT_PRESETS = [
  { id: 'builtin-rice', name: 'ข้าวสวย', unit: '100 g', gramsPerUnit: 100, calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { id: 'builtin-egg', name: 'ไข่ต้ม', unit: '1 ฟอง', calories: 70, protein: 6, carbs: 0.6, fat: 5 },
  { id: 'builtin-guava', name: 'ฝรั่ง', unit: '120 g', gramsPerUnit: 120, calories: 82, protein: 3.1, carbs: 17.2, fat: 1.2 }
];

export const HIDDEN_BUILTINS_KEY = 'trackme-hidden-builtins';
export const BUILTIN_FAV_KEY = 'trackme-builtin-favorites';
export const categoryNames = ['ข้าว/เส้น', 'โปรตีน', 'ผลไม้', 'ผัก', 'ซีเรียล/กราโนลา', 'ขนม/ของว่าง', 'ขนมปัง/เบเกอรี่', 'เครื่องดื่ม/นม', 'อาหารคลีน/Hiwpinto', 'อื่น ๆ'];

const FOOD_IMPORT_ROWS = [
  ['Alpen Muesli', '40.0', 'g', '148', '4.4', '29.2', '2.2'],
  ['Daily Me Granola (Dark Choc)', '35.0', 'g', '170', '4.0', '22.0', '7.0'],
  ['Grainey Grain Bar Chocolate Banana', '1.0', 'piece(s)', '80', '0.0', '18.0', '0.0'],
  ['Granola Crunchy Honey', '35.0', 'g', '150', '3.0', '28.0', '3.5'],
  ['Granola Walt Choco', '35.0', 'g', '150', '4.0', '25.0', '4.0'],
  ['Granovibes Granola (Choc)', '35.0', 'g', '160', '5.0', '24.0', '4.5'],
  ['Granovibes Granola (Matcha)', '35.0', 'g', '150', '4.0', '26.0', '3.5'],
  ['Granovibes Granola (Original)', '35.0', 'g', '160', '5.0', '23.0', '5.0'],
  ['Misura Firrextra Wholemeal', '1.0', 'serving', '120', '4.0', '22.0', '2.0'],
  ['Sourdough Bread', '100.0', 'g', '240', '10.5', '45.0', '1.5'],
  ['Whole Wheat Biscuits', '2.0', 'piece(s)', '136', '5.0', '26.0', '1.0'],
  ['Whole Wheat Bread (Cocoa)', '1.0', 'piece(s)', '80', '2.5', '13.0', '1.5'],
  ['Whole Wheat Bread (Original)', '1.0', 'piece(s)', '75', '2.5', '13.0', '1.0'],
  ['Younger Farm Protein Granola (Choc)', '40.0', 'g', '170', '9.0', '20.0', '6.0']
];

export const label = p => `${p.name}${p.brand ? ' · ' + p.brand : ''} (${p.unit})`;

const storedSet = key => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
};

export const hiddenBuiltins = () => storedSet(HIDDEN_BUILTINS_KEY);
export const builtinFavorites = () => storedSet(BUILTIN_FAV_KEY);

export const gramsInUnit = unit => {
  const matches = [...String(unit || '').matchAll(/(\d+(?:\.\d+)?)\s*(?:g|gram|grams|กรัม|ml|มล\.?|มิลลิลิตร)(?![a-z])/gi)];
  return matches.length ? Number(matches[matches.length - 1][1]) : null;
};

export const normalizedStoredPreset = p => {
  const row = FOOD_IMPORT_ROWS.find(r => r[0].toLowerCase() === String(p.name).toLowerCase());
  if (row && !p.defaultQuantity) {
    const amount = Number(row[1]), unit = row[2];
    if (String(p.unit).toLowerCase() === (String(amount) + ' ' + unit).toLowerCase()) {
      const by = /^(g|gram|grams|กรัม)$/i.test(unit) ? amount : 1;
      return { ...p, unit: /^(g|gram|grams|กรัม)$/i.test(unit) ? 'g' : unit, gramsPerUnit: by === amount ? 1 : p.gramsPerUnit,
        calories: p.calories / by, protein: p.protein / by, carbs: p.carbs / by, fat: p.fat / by,
        defaultQuantity: amount, category: p.category || guessFoodCategory(p.name), _normalizedImport: true };
    }
  }
  const parsed = gramsInUnit(p.unit);
  return p.gramsPerUnit > 0 || !parsed ? p : { ...p, gramsPerUnit: parsed };
};

export const getPresets = () => [
  ...state.customFoods.map(normalizedStoredPreset).map(p => ({ ...p, category: p.category || (p.hiwpinto ? 'อาหารคลีน/Hiwpinto' : guessFoodCategory(p.name)), custom: true })).sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.name.localeCompare(b.name, 'th')),
  ...DEFAULT_PRESETS.filter(p => !hiddenBuiltins().has(p.id)).map(p => ({ ...p, category: guessFoodCategory(p.name), favorite: builtinFavorites().has(p.id) }))
];
