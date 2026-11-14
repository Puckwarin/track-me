export function guessFoodCategory(name = '') {
  const n = String(name).toLowerCase();
  if (/hiwp|hiwpinto|คลีน|น้ำตก|ห่อหมก|กะหล่ำปลีผัด/.test(n)) return 'อาหารคลีน/Hiwpinto';
  if (/ข้าว|ไรซ์|rice|บะหมี่|เส้น|พาสต้า|noodle/.test(n)) return 'ข้าว/เส้น';
  if (/ไก่|หมู|เนื้อ|ปลา|ไข่|กุ้ง|เต้าหู้|protein/.test(n)) return 'โปรตีน';
  if (/กล้วย|ฝรั่ง|แอปเปิล|ผลไม้|ส้ม|มะม่วง|berry/.test(n)) return 'ผลไม้';
  if (/ผัก|เห็ด|กะหล่ำ|แครอท|บรอกโคลี/.test(n)) return 'ผัก';
  if (/granola|muesli|ซีเรียล/.test(n)) return 'ซีเรียล/กราโนลา';
  if (/bread|ขนมปัง|sourdough|biscuits|biscuit/.test(n)) return 'ขนมปัง/เบเกอรี่';
  if (/นม|milk|กาแฟ|ชา|น้ำผลไม้/.test(n)) return 'เครื่องดื่ม/นม';
  if (/ขนม|bar|snack|ช็อกโกแลต|choc/.test(n)) return 'ขนม/ของว่าง';
  return 'อื่น ๆ';
}

const GRAM_UNIT_RE = /^(?:g|gram|grams|กรัม)$/i;
const ML_UNIT_RE = /^(?:ml|มล\.?|มิลลิลิตร)$/i;

function cleanLinePrefix(line) {
  return String(line || '')
    .trim()
    .replace(/^[•\-*]\s+/, '')
    .replace(/^\d+[.)]\s+(?=\S)/, '')
    .trim();
}

function parseMacro(tail, letter) {
  if (!tail) return 0;
  const re = new RegExp(`(?:^|[\\s/|·,;:])${letter}\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:g|กรัม)?(?=$|[\\s/|·,;:])`, 'i');
  const m = tail.match(re);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function splitNameAmountUnit(prefix) {
  const text = String(prefix || '').trim();
  if (!text) return null;
  const m = text.match(
    /^(.*\S)\s+(?:\((\d+(?:\.\d+)?)\s*([a-zA-Z\u0E00-\u0E7F][a-zA-Z\u0E00-\u0E7F().]*)\)|(\d+(?:\.\d+)?)\s*([a-zA-Z\u0E00-\u0E7F][a-zA-Z\u0E00-\u0E7F().]*))$/
  );
  if (!m) return { name: text, amount: 1, unit: '', hasExplicitUnit: false };
  const name = m[1].trim();
  const amount = Number(m[2] ?? m[4]);
  const unit = String(m[3] ?? m[5] ?? '').trim();
  if (!name || !Number.isFinite(amount) || amount <= 0 || !unit) {
    return { name: text, amount: 1, unit: '', hasExplicitUnit: false };
  }
  return { name, amount, unit, hasExplicitUnit: true };
}

function roundNum(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function normalizeFoodRow({ name, amount, unit, hasExplicitUnit, calories, protein, carbs, fat }) {
  const isGrams = GRAM_UNIT_RE.test(unit);
  const isMl = ML_UNIT_RE.test(unit);
  const portionUnit = isGrams ? 'g' : (isMl ? 'ml' : (unit || 'หน่วย'));
  const gramsPerUnit = isGrams || isMl ? 1 : null;
  const quantity = (isGrams || isMl) ? amount : (hasExplicitUnit ? amount : 1);
  const divisor = quantity > 0 ? quantity : 1;

  const amountDisplay = hasExplicitUnit
    ? `${Number(amount.toFixed(2))} ${unit}`
    : '1 หน่วย';

  return {
    name,
    amount,
    unit: unit || 'หน่วย',
    hasExplicitUnit,
    amountDisplay,
    isGrams,
    portionUnit,
    gramsPerUnit,
    quantity,
    calories: Math.round(calories),
    protein: roundNum(protein, 1),
    carbs: roundNum(carbs, 1),
    fat: roundNum(fat, 1),
    unitNutrition: {
      calories: calories / divisor,
      protein: protein / divisor,
      carbs: carbs / divisor,
      fat: fat / divisor
    },
    libraryRecord: {
      name,
      unit: isGrams ? 'g' : (isMl ? 'ml' : (hasExplicitUnit ? (amount === 1 ? `1 ${unit}` : `${Number(amount.toFixed(2))} ${unit}`) : '1 หน่วย')),
      gramsPerUnit,
      defaultQuantity: (isGrams || isMl) ? amount : 1,
      calories: (isGrams || isMl) ? calories / divisor : Math.round(calories),
      protein: (isGrams || isMl) ? protein / divisor : roundNum(protein, 1),
      carbs: (isGrams || isMl) ? carbs / divisor : roundNum(carbs, 1),
      fat: (isGrams || isMl) ? fat / divisor : roundNum(fat, 1),
      category: guessFoodCategory(name),
      favorite: false
    }
  };
}

function parseNutrientCell(text, defaultVal = null) {
  const s = String(text ?? '').trim();
  if (!s || s === '-' || s === '—') return defaultVal;
  const m = s.replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*(?:kcal|cal|กิโลแคลอรี|แคลอรี|แคล|g|gram|grams|กรัม)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function splitDelimitedColumns(line) {
  if (line.includes('\t')) {
    return line.split('\t').map(v => v.trim());
  }
  if (line.includes('|')) {
    let cols = line.split('|').map(v => v.trim());
    if (cols.length >= 3 && cols[0] === '') cols = cols.slice(1);
    if (cols.length >= 2 && cols[cols.length - 1] === '') cols = cols.slice(0, -1);
    if (cols.length >= 2) return cols;
  }
  return null;
}

function isTableSeparatorOrHeader(cols) {
  if (!cols || cols.length < 2) return false;
  if (cols.every(c => /^[:\-—\s]*$/.test(c))) return true;
  const col1 = (cols[1] || '').toLowerCase();
  return /^(?:kcal|cal|calories|energy|แคล|แคลอรี่|พลังงาน|ปริมาณ|จำนวน)/.test(col1) && !/\d/.test(col1);
}

export function parseFoodLine(rawLine, lineNumber = 1) {
  const line = cleanLinePrefix(rawLine);
  if (!line) return null;

  // 1) รูปแบบคั่นด้วย Tab หรือ | (รองรับทั้ง 7 คอลัมน์เดิม และ 2–6 คอลัมน์ เช่น Copy จาก Excel / ตาราง: เมนู ⇥ kcal ⇥ P ⇥ C ⇥ F)
  const delimitedCols = splitDelimitedColumns(line);
  if (delimitedCols) {
    if (isTableSeparatorOrHeader(delimitedCols)) return null;

    if (delimitedCols.length >= 7) {
      const [name, amountText, unitText, calText, pText, cText, fText] = delimitedCols;
      const amount = Number(amountText);
      const calories = parseNutrientCell(calText, null);
      const protein = parseNutrientCell(pText, 0);
      const carbs = parseNutrientCell(cText, 0);
      const fat = parseNutrientCell(fText, 0);
      if (!name || !unitText || !Number.isFinite(amount) || amount <= 0 || [calories, protein, carbs, fat].some(v => v === null)) {
        return { lineNumber, raw: rawLine, error: `บรรทัด ${lineNumber}: ข้อมูลรูปแบบคอลัมน์ไม่ครบหรือไม่ใช่ตัวเลขบวก` };
      }
      return {
        lineNumber,
        raw: rawLine,
        item: normalizeFoodRow({
          name,
          amount,
          unit: unitText,
          hasExplicitUnit: true,
          calories,
          protein,
          carbs,
          fat
        })
      };
    }

    if (delimitedCols.length === 6) {
      const [nameCol, portionCol, calText, pText, cText, fText] = delimitedCols;
      const calories = parseNutrientCell(calText, null);
      const protein = parseNutrientCell(pText, 0);
      const carbs = parseNutrientCell(cText, 0);
      const fat = parseNutrientCell(fText, 0);
      const split = splitNameAmountUnit(`${nameCol} ${portionCol}`.trim());
      if (!split || [calories, protein, carbs, fat].some(v => v === null)) {
        return { lineNumber, raw: rawLine, error: `บรรทัด ${lineNumber}: ข้อมูลรูปแบบตารางไม่ถูกต้อง` };
      }
      return {
        lineNumber,
        raw: rawLine,
        item: normalizeFoodRow({ ...split, calories, protein, carbs, fat })
      };
    }

    // 2–5 คอลัมน์: เมนู | kcal | P | C | F (เช่น ยำวุ้นเส้นหมูสับ 1 จาน + เพิ่มหมูสับ \t 350 \t 27 g \t 34 g \t 12 g)
    const [nameCol, calText, pText = '', cText = '', fText = ''] = delimitedCols;
    const calories = parseNutrientCell(calText, null);
    const protein = parseNutrientCell(pText, 0);
    const carbs = parseNutrientCell(cText, 0);
    const fat = parseNutrientCell(fText, 0);
    const split = splitNameAmountUnit(nameCol);
    if (split && calories !== null && protein !== null && carbs !== null && fat !== null) {
      return {
        lineNumber,
        raw: rawLine,
        item: normalizeFoodRow({ ...split, calories, protein, carbs, fat })
      };
    }
    // ถ้าไม่เข้าเกณฑ์ตาราง ลองตกไปตรวจรูปแบบข้อความบรรทัดเดียว (เช่น กรณีมี | คั่นระหว่าง P / C / F)
  }

  // 2) รูปแบบสรุปบรรทัดเดียว: [ชื่อเมนูและปริมาณ] [ตัวเลข] kcal|แคล / P[โปรตีน] / C[คาร์บ] / F[ไขมัน]
  const calMatch = line.match(/^(.*?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:kcal|กิโลแคลอรี|แคลอรี|แคล)(?=$|[\s/|·,;:])(.*)$/i);
  if (calMatch) {
    const prefix = calMatch[1].trim();
    const calories = Number(calMatch[2].replace(/,/g, ''));
    const tail = calMatch[3] || '';
    const split = splitNameAmountUnit(prefix);
    if (!split || !Number.isFinite(calories) || calories < 0) {
      return { lineNumber, raw: rawLine, error: `บรรทัด ${lineNumber}: ไม่พบชื่อเมนูหรือค่าแคลอรี่ที่ถูกต้อง` };
    }
    const protein = parseMacro(tail, 'p');
    const carbs = parseMacro(tail, 'c');
    const fat = parseMacro(tail, 'f');
    return {
      lineNumber,
      raw: rawLine,
      item: normalizeFoodRow({
        ...split,
        calories,
        protein,
        carbs,
        fat
      })
    };
  }

  return {
    lineNumber,
    raw: rawLine,
    error: `บรรทัด ${lineNumber}: รูปแบบไม่ถูกต้อง (ตัวอย่าง: ยำวุ้นเส้นหมูสับ 1 จาน 280 kcal / P17 / C32 / F10 หรือวางตารางจาก Excel)`
  };
}

export function parseBulkFoodText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const items = [];
  const errors = [];
  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    const res = parseFoodLine(trimmed, index + 1);
    if (!res) return;
    if (res.error) errors.push(res);
    else if (res.item) items.push(res.item);
  });
  return { items, errors };
}
