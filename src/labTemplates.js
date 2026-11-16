// ชุดเทมเพลตผลแล็บสำเร็จรูป & ตัวแปลงข้อความหลายบรรทัด (0 โทเค็น ในเครื่อง)

export const LAB_PANEL_TEMPLATES = [
  {
    id: 'cbc',
    icon: '🩸',
    label: 'CBC (เม็ดเลือด)',
    items: ['WBC', 'RBC', 'HGB (ฮีโมโกลบิน)', 'HCT (ฮีมาโตคริต)', 'PLT (เกล็ดเลือด)']
  },
  {
    id: 'kidney',
    icon: '💧',
    label: 'ค่าไต',
    items: ['BUN', 'Creatinine (CREA)', 'SDMA']
  },
  {
    id: 'liver',
    icon: '🫀',
    label: 'ค่าตับ & โปรตีน',
    items: ['ALT (SGPT)', 'ALP (ALKP)', 'AST (SGOT)', 'Total Protein (TP)', 'Albumin (ALB)', 'Globulin (GLOB)']
  },
  {
    id: 'metabolic',
    icon: '🍬',
    label: 'น้ำตาล & ไขมัน',
    items: ['น้ำตาลในเลือดหลังอดอาหาร (FBS)', 'HbA1c', 'คอเลสเตอรอลรวม (Total Cholesterol)', 'TSH']
  }
];

const ALIAS_GROUPS = [
  ['bun', 'BUN'],
  ['crea', 'Creatinine (CREA)'],
  ['creatinine', 'Creatinine (CREA)'],
  ['sdma', 'SDMA'],
  ['alt', 'ALT (SGPT)'],
  ['sgpt', 'ALT (SGPT)'],
  ['alp', 'ALP (ALKP)'],
  ['alkp', 'ALP (ALKP)'],
  ['ast', 'AST (SGOT)'],
  ['sgot', 'AST (SGOT)'],
  ['glu', 'Glucose (GLU)'],
  ['glucose', 'Glucose (GLU)'],
  ['tp', 'Total Protein (TP)'],
  ['total protein', 'Total Protein (TP)'],
  ['alb', 'Albumin (ALB)'],
  ['albumin', 'Albumin (ALB)'],
  ['glob', 'Globulin (GLOB)'],
  ['globulin', 'Globulin (GLOB)'],
  ['wbc', 'WBC'],
  ['rbc', 'RBC'],
  ['hgb', 'HGB (ฮีโมโกลบิน)'],
  ['hemoglobin', 'HGB (ฮีโมโกลบิน)'],
  ['hct', 'HCT (ฮีมาโตคริต)'],
  ['hematocrit', 'HCT (ฮีมาโตคริต)'],
  ['plt', 'PLT (เกล็ดเลือด)'],
  ['platelet', 'PLT (เกล็ดเลือด)'],
  ['fbs', 'น้ำตาลในเลือดหลังอดอาหาร (FBS)'],
  ['hba1c', 'HbA1c'],
  ['cholesterol', 'คอเลสเตอรอลรวม (Total Cholesterol)'],
  ['total cholesterol', 'คอเลสเตอรอลรวม (Total Cholesterol)'],
  ['tsh', 'TSH']
];

const normKey = v => String(v || '').trim().toLowerCase();

export function findLatestLabDefaults(itemName, labPresets = [], existingLabs = []) {
  const k = normKey(itemName);
  const preset = labPresets.find(p => normKey(p[0]) === k);
  const canonicalKey = normKey(preset ? preset[0] : itemName);
  const latest = [...(existingLabs || [])]
    .filter(r => normKey(r.name) === canonicalKey || normKey(r.name) === k)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];

  return {
    name: preset ? preset[0] : itemName,
    unit: latest?.unit ?? preset?.[1] ?? '',
    refLow: latest?.refLow ?? preset?.[2] ?? null,
    refHigh: latest?.refHigh ?? preset?.[3] ?? null
  };
}

function resolveCanonicalLabName(rawName, labPresets = []) {
  const cleaned = String(rawName || '').trim().replace(/^[-*•\d.)\s]+/, '').replace(/[:：=]+$/, '').trim();
  if (!cleaned) return '';
  const low = normKey(cleaned);
  const exact = labPresets.find(p => normKey(p[0]) === low);
  if (exact) return exact[0];
  for (const [alias, canonical] of ALIAS_GROUPS) {
    if (low === alias || new RegExp(`\\b${alias}\\b`, 'i').test(low)) {
      return canonical;
    }
  }
  return cleaned.slice(0, 80);
}

/**
 * แปลงข้อความผลแล็บหลายบรรทัดในเครื่อง (0 โทเค็น)
 * รองรับรูปแบบ เช่น:
 * - "BUN 18 mg/dL (7-27)"
 * - "Creatinine: 1.2 mg/dL"
 * - "ALT\t64\tU/L\t10-125"
 * - "WBC = 10.5"
 */
export function parseBulkLabText(rawText, labPresets = [], existingLabs = []) {
  const lines = String(rawText || '').replace(/\r\n?/g, '\n').split('\n');
  const items = [];
  const errors = [];

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    // ตัดช่วงอ้างอิงที่อยู่ท้ายบรรทัด เช่น (7-27) หรือ 7–27 หรือ 10 - 125
    let work = trimmed;
    let parsedLow = null;
    let parsedHigh = null;
    const rangeMatch = work.match(/(?:\(|\[|\s)(\d+(?:[.,]\d+)?)\s*[-–~]\s*(\d+(?:[.,]\d+)?)\s*[\])]?\s*$/);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1].replace(',', '.'));
      const hi = Number(rangeMatch[2].replace(',', '.'));
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi) {
        parsedLow = lo;
        parsedHigh = hi;
        work = work.slice(0, rangeMatch.index).trim();
      }
    }

    // แยกแบบ Tab หรือ comma / pipe / space
    let rawName = '';
    let valueNum = null;
    let parsedUnit = '';

    const tabParts = work.split(/\t+/).map(s => s.trim()).filter(Boolean);
    if (tabParts.length >= 2 && Number.isFinite(Number(tabParts[1].replace(',', '.')))) {
      rawName = tabParts[0];
      valueNum = Number(tabParts[1].replace(',', '.'));
      parsedUnit = tabParts[2] || '';
    } else {
      const m = work.match(/^(.+?)\s*(?:[:：=]|\s)\s*(-?\d+(?:[.,]\d+)?)\s*([%µa-zA-Zก-๙/]*)\s*$/);
      if (m) {
        rawName = m[1];
        valueNum = Number(m[2].replace(',', '.'));
        parsedUnit = m[3] || '';
      }
    }

    if (!rawName || valueNum === null || !Number.isFinite(valueNum)) {
      errors.push({ line: idx + 1, raw: trimmed, error: `บรรทัดที่ ${idx + 1}: อ่านชื่อรายการและตัวเลขไม่สำเร็จ ("${trimmed}")` });
      return;
    }

    const name = resolveCanonicalLabName(rawName, labPresets);
    const defaults = findLatestLabDefaults(name, labPresets, existingLabs);
    items.push({
      name,
      value: valueNum,
      unit: (parsedUnit || defaults.unit || '').slice(0, 20),
      refLow: parsedLow !== null ? parsedLow : defaults.refLow,
      refHigh: parsedHigh !== null ? parsedHigh : defaults.refHigh
    });
  });

  return { items, errors };
}
