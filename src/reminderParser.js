import { localDateStr, addDays, isDateStr } from './util.js';

const THAI_NUM_WORDS = [
  ['สิบสอง', 12], ['สิบเอ็ด', 11], ['สิบ', 10], ['เก้า', 9], ['แปด', 8], ['เจ็ด', 7],
  ['หก', 6], ['ห้า', 5], ['สี่', 4], ['สาม', 3], ['สอง', 2], ['หนึ่ง', 1],
  ['แรก', 1], ['เดียว', 1]
];

const WEEKDAY_NAMES = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const WEEKDAY_TOKENS = [
  ['พฤหัสบดี', 3], ['พฤหัส', 3], ['อาทิตย์', 6],
  ['จันทร์', 0], ['อังคาร', 1], ['พุธ', 2], ['ศุกร์', 4], ['เสาร์', 5],
  ['monday', 0], ['tuesday', 1], ['wednesday', 2], ['thursday', 3], ['friday', 4], ['saturday', 5], ['sunday', 6]
];

const TH_MONTHS = {
  'ม.ค.': 1, 'มกราคม': 1, 'มค': 1,
  'ก.พ.': 2, 'กุมภาพันธ์': 2, 'กพ': 2,
  'มี.ค.': 3, 'มีนาคม': 3, 'มีค': 3,
  'เม.ย.': 4, 'เมษายน': 4, 'เมย': 4,
  'พ.ค.': 5, 'พฤษภาคม': 5, 'พค': 5,
  'มิ.ย.': 6, 'มิถุนายน': 6, 'มิย': 6,
  'ก.ค.': 7, 'กรกฎาคม': 7, 'กค': 7,
  'ส.ค.': 8, 'สิงหาคม': 8, 'สค': 8,
  'ก.ย.': 9, 'กันยายน': 9, 'กย': 9,
  'ต.ค.': 10, 'ตุลาคม': 10, 'ตค': 10,
  'พ.ย.': 11, 'พฤศจิกายน': 11, 'พย': 11,
  'ธ.ค.': 12, 'ธันวาคม': 12, 'ธค': 12
};

function normalizeThaiDigits(str) {
  return String(str || '').replace(/[๐-๙]/g, ch => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(ch)));
}

export function parseThaiNumberToken(token) {
  const s = normalizeThaiDigits(token).trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  for (const [w, n] of THAI_NUM_WORDS) {
    if (s === w || s.includes(w)) return n;
  }
  return null;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function parseCeYear(rawYear) {
  let y = Number(rawYear);
  if (!Number.isFinite(y)) return new Date().getFullYear();
  if (y < 100) y = y >= 55 ? 2500 + y - 543 : 2000 + y;
  else if (y >= 2400) y -= 543;
  return y;
}

export function addMonthsSafe(ymd, months) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}

// 0=จันทร์ ... 6=อาทิตย์
export function weekdayMon0(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function nthWeekdayInMonth(year, month1to12, weekday0to6, nth) {
  const firstWd = (new Date(Date.UTC(year, month1to12 - 1, 1)).getUTCDay() + 6) % 7;
  const offset = (weekday0to6 - firstWd + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const lastDay = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  if (day > lastDay) return null;
  return `${year}-${pad2(month1to12)}-${pad2(day)}`;
}

export function lastWeekdayInMonth(year, month1to12, weekday0to6) {
  const lastDay = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  const lastWd = (new Date(Date.UTC(year, month1to12 - 1, lastDay)).getUTCDay() + 6) % 7;
  const back = (lastWd - weekday0to6 + 7) % 7;
  const day = lastDay - back;
  return `${year}-${pad2(month1to12)}-${pad2(day)}`;
}

export function nextNthWeekday(fromYmd, weekday, nth, inclusive = true) {
  const [startY, startM] = fromYmd.split('-').map(Number);
  for (let i = 0; i < 24; i++) {
    const dt = new Date(Date.UTC(startY, startM - 1 + i, 1));
    const cand = nth === 'last'
      ? lastWeekdayInMonth(dt.getUTCFullYear(), dt.getUTCMonth() + 1, weekday)
      : nthWeekdayInMonth(dt.getUTCFullYear(), dt.getUTCMonth() + 1, weekday, nth);
    if (cand && (inclusive ? cand >= fromYmd : cand > fromYmd)) return cand;
  }
  return fromYmd;
}

export function nextWeekdayDate(fromYmd, weekday, inclusive = true) {
  const curWd = weekdayMon0(fromYmd);
  let delta = (weekday - curWd + 7) % 7;
  if (delta === 0 && !inclusive) delta = 7;
  return addDays(fromYmd, delta);
}

// หาแจ้งเตือนที่ถูกอ้างอิงจากข้อความ (fuzzy match ทั้งคำไทยและคำสำคัญ)
export function findLinkedItem(ruleOrQuery, existingItems = []) {
  if (!ruleOrQuery || !existingItems.length) return null;
  const linkedId = typeof ruleOrQuery === 'object' ? ruleOrQuery.linkedId : null;
  const linkedQuery = typeof ruleOrQuery === 'object' ? (ruleOrQuery.linkedQuery || '') : String(ruleOrQuery);
  if (linkedId) {
    const exact = existingItems.find(x => x.id === linkedId || x.uidKey === linkedId);
    if (exact) return exact;
  }
  const q = linkedQuery.trim().toLowerCase();
  if (!q) return null;

  // ล้างคำเชื่อมทั่วไปเพื่อดึง keyword แกนกลาง
  const stripFillers = s => String(s || '')
    .toLowerCase()
    .replace(/^(?:นัด|ไป|พา|เรื่อง|การ|ที่|กับ|วันเดียวกับ|ไม่ได้|ไม่|ให้)/g, '')
    .replace(/(?:ไป|มา|แล้ว|ครับ|ค่ะ|นะ)$/g, '')
    .trim();

  const qClean = stripFillers(q);
  const subParts = [];
  const rawWords = q.split(/\s+/).filter(Boolean);
  for (const w of rawWords) subParts.push(w);
  // ดึงคำสำคัญภาษาไทยที่เจอบ่อยมาช่วยจับคู่เมื่อประโยคติดกันไม่มีเว้นวรรค
  const commonKeywords = ['อาบน้ำ', 'ตัดขน', 'ขูดหินปูน', 'วัคซีน', 'เห็บหมัด', 'ถ่ายพยาธิ', 'หาหมอ', 'หมอฟัน', 'น้องหมา', 'สุนัข', 'แมว', 'ผ้าปู', 'ผ้าห่ม', 'ซักผ้า', 'ไส้กรอง', 'แปรงสีฟัน', 'พ.ร.บ.', 'ภาษี', 'ประกัน', 'ค่าไฟ', 'ค่าน้ำ', 'ค่าเน็ต'];
  commonKeywords.forEach(kw => {
    if (q.includes(kw)) subParts.push(kw);
  });

  let best = null;
  let bestScore = 0;
  for (const item of existingItems) {
    const title = String(item.title || item.type || item.name || '').toLowerCase();
    if (!title) continue;
    let score = 0;
    if (title === q || title === qClean) score += 100;
    else if (qClean && title.includes(qClean)) score += 60;
    else if (title && q.includes(title)) score += 50;
    for (const part of new Set(subParts)) {
      if (part.length >= 2 && title.includes(part)) score += 15 + part.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 15 ? best : null;
}

export function dateMatchesRuleInMonth(dateYmd, rule) {
  if (!rule || !dateYmd) return false;
  const [y, m] = dateYmd.split('-').map(Number);
  if (rule.kind === 'nth_weekday' && Number.isInteger(rule.weekday) && Number.isInteger(rule.nth)) {
    return nthWeekdayInMonth(y, m, rule.weekday, rule.nth) === dateYmd;
  }
  if (rule.kind === 'last_weekday' && Number.isInteger(rule.weekday)) {
    return lastWeekdayInMonth(y, m, rule.weekday) === dateYmd;
  }
  return false;
}

export function resolveRuleNextDate(rule, existingItems = [], fromYmd = localDateStr(), inclusive = true, depth = 0) {
  if (!rule || depth > 3) return null;
  if (rule.kind === 'nth_weekday' && Number.isInteger(rule.weekday) && Number.isInteger(rule.nth)) {
    return nextNthWeekday(fromYmd, rule.weekday, rule.nth, inclusive);
  }
  if (rule.kind === 'last_weekday' && Number.isInteger(rule.weekday)) {
    return nextNthWeekday(fromYmd, rule.weekday, 'last', inclusive);
  }
  if (rule.kind === 'interval' && rule.intervalDays > 0) {
    return addDays(fromYmd, inclusive ? 0 : rule.intervalDays);
  }
  if (rule.kind === 'monthly') {
    const months = rule.repeatMonths > 0 ? rule.repeatMonths : 1;
    return inclusive ? fromYmd : addMonthsSafe(fromYmd, months);
  }
  if (rule.kind === 'yearly') {
    const months = rule.repeatMonths > 0 ? rule.repeatMonths : 12;
    return inclusive ? fromYmd : addMonthsSafe(fromYmd, months);
  }
  if (rule.kind === 'same_as') {
    const linked = findLinkedItem(rule, existingItems);
    if (!linked) return null;
    if (linked.nextDate && (inclusive ? linked.nextDate >= fromYmd : linked.nextDate > fromYmd)) {
      return linked.nextDate;
    }
    if (linked.rule) {
      return resolveRuleNextDate(linked.rule, existingItems, fromYmd, inclusive, depth + 1);
    }
    return linked.nextDate || null;
  }
  if (rule.kind === 'weekly_except_linked' && Number.isInteger(rule.weekday)) {
    const linked = findLinkedItem(rule, existingItems);
    let cand = nextWeekdayDate(fromYmd, rule.weekday, inclusive);
    for (let i = 0; i < 60; i++) {
      let excluded = false;
      if (linked) {
        if (linked.nextDate === cand) excluded = true;
        else if (linked.rule && dateMatchesRuleInMonth(cand, linked.rule)) excluded = true;
      }
      if (!excluded) return cand;
      cand = addDays(cand, 7);
    }
    return cand;
  }
  if (rule.kind === 'interval' && Number.isInteger(rule.weekday) && rule.intervalDays === 7) {
    return nextWeekdayDate(fromYmd, rule.weekday, inclusive);
  }
  return null;
}

export function inferCategory(text) {
  const s = text.toLowerCase();
  if (/น้องหมา|สุนัข|หมา|แมว|สัตว์|วัคซีน|เห็บ|หมัด|พยาธิ|กรูมมิ่ง|อาบน้ำน้อง|ตัดขน|ขูดหินปูนน้อง|คลินิกสัตว์|สัตวแพทย์/.test(s)) {
    return 'สัตว์เลี้ยง';
  }
  if (/พ\.?ร\.?บ|ภาษี|ประกัน|ใบขับขี่|พาสปอร์ต|บัตรประชาชน|เอกสาร|สัญญา|ต่ออายุ/.test(s)) {
    return 'เอกสาร/ประกัน/ภาษี';
  }
  if (/เปลี่ยน|ผ้าปู|ซักผ้า|ผ้าห่ม|แปรงสีฟัน|ไส้กรอง|ฟองน้ำ|ปลอกหมอน|มีดโกน|คอนแทคเลนส์|ของใช้/.test(s)) {
    return 'เปลี่ยนของ';
  }
  return 'นัดหมาย/อื่น ๆ';
}

function extractRemindDays(text) {
  const s = normalizeThaiDigits(text);
  if (/ไม่ต้อง(?:แจ้ง)?เตือน|ปิดเตือน/.test(s)) {
    return { remindDays: -1, matched: text.match(/ไม่ต้อง(?:แจ้ง)?เตือน|ปิดเตือน/i)?.[0] || '' };
  }
  if (/เตือนวันจริง|เตือนวันครบกำหนด/.test(s)) {
    return { remindDays: 0, matched: text.match(/เตือนวันจริง|เตือนวันครบกำหนด/i)?.[0] || '' };
  }
  const numWordAlt = THAI_NUM_WORDS.map(([w]) => w).join('|');
  const re = new RegExp(`(?:แจ้ง)?เตือน(?:ก่อนถึงเวลา|ก่อน|ล่วงหน้า)\\s*(${numWordAlt}|\\d+)?\\s*(วัน|สัปดาห์|อาทิตย์|วีค|เดือน)`, 'i');
  const m = s.match(re);
  if (!m) return { remindDays: null, matched: '' };
  const n = m[1] ? (parseThaiNumberToken(m[1]) ?? 1) : 1;
  const unit = m[2].toLowerCase();
  const mult = /สัปดาห์|อาทิตย์|วีค/.test(unit) ? 7 : /เดือน/.test(unit) ? 30 : 1;
  return { remindDays: Math.min(365, n * mult), matched: m[0] };
}

function extractTime(text) {
  const s = normalizeThaiDigits(text);
  let m = s.match(/(?:เวลา\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:น\.?|นาฬิกา)?/i);
  if (m) return { time: `${pad2(Number(m[1]))}:${m[2]}`, matched: m[0] };

  m = s.match(/บ่าย\s*(\d{1,2})\s*(?:โมง)?/i);
  if (m) {
    const h = Number(m[1]);
    return { time: `${pad2(h < 12 ? h + 12 : h)}:00`, matched: m[0] };
  }
  m = s.match(/(\d{1,2})\s*(?:โมงเช้า|โมงเย็น|โมง|ทุ่ม)/i);
  if (m) {
    let h = Number(m[1]);
    if (/ทุ่ม/.test(m[0]) && h < 12) h += 18;
    else if (/เย็น/.test(m[0]) && h < 12) h += 12;
    return { time: `${pad2(h % 24)}:00`, matched: m[0] };
  }
  return { time: null, matched: '' };
}

function extractExplicitDate(text, today) {
  const s = normalizeThaiDigits(text);

  if (/วันมะรืน|มะรืนนี้|มะรืน/.test(s)) {
    return { date: addDays(today, 2), matched: s.match(/วันมะรืน|มะรืนนี้|มะรืน/)?.[0] || '' };
  }
  if (/พรุ่งนี้/.test(s)) {
    return { date: addDays(today, 1), matched: 'พรุ่งนี้' };
  }
  if (/วันนี้/.test(s)) {
    return { date: today, matched: 'วันนี้' };
  }

  // DD/MM/YYYY หรือ YYYY-MM-DD
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = parseCeYear(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const cand = `${y}-${pad2(mo)}-${pad2(d)}`;
    if (isDateStr(cand)) return { date: cand, matched: m[0] };
  }
  m = s.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    const y = m[3] ? parseCeYear(m[3]) : Number(today.slice(0, 4));
    const cand = `${y}-${pad2(mo)}-${pad2(d)}`;
    if (isDateStr(cand) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return { date: (!m[3] && cand < today) ? addMonthsSafe(cand, 12) : cand, matched: m[0] };
    }
  }

  // 15 พ.ย. 69 / 15 พฤศจิกายน / 15 พ.ย.
  const thMonthNames = Object.keys(TH_MONTHS).sort((a, b) => b.length - a.length).map(k => k.replace(/\./g, '\\.?')).join('|');
  m = s.match(new RegExp(`(\\d{1,2})\\s*(${thMonthNames})(?:\\s*(\\d{2,4}))?`, 'i'));
  if (m) {
    const d = Number(m[1]);
    const rawM = m[2].replace(/\s+/g, '').replace(/\./g, '');
    const mKey = Object.keys(TH_MONTHS).find(k => k.replace(/\./g, '') === rawM);
    if (mKey) {
      const mo = TH_MONTHS[mKey];
      const y = m[3] ? parseCeYear(m[3]) : Number(today.slice(0, 4));
      let cand = `${y}-${pad2(mo)}-${pad2(d)}`;
      if (!m[3] && cand < today) cand = `${y + 1}-${pad2(mo)}-${pad2(d)}`;
      if (isDateStr(cand)) return { date: cand, matched: m[0] };
    }
  }

  // วันที่ X เดือนหน้า / เดือน <name> ปีหน้า
  m = s.match(/(?:วันที่\s*)?(\d{1,2})\s*เดือนหน้า/);
  if (m) {
    const d = Number(m[1]);
    const nextM = addMonthsSafe(`${today.slice(0, 8)}01`, 1);
    const [ny, nm] = nextM.split('-').map(Number);
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return { date: `${ny}-${pad2(nm)}-${pad2(Math.min(d, last))}`, matched: m[0] };
  }

  // สิ้นเดือนนี้ / ต้นเดือนหน้า
  if (/สิ้นเดือนนี้|ปลายเดือนนี้/.test(s)) {
    const [y, mo] = today.split('-').map(Number);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { date: `${y}-${pad2(mo)}-${pad2(last)}`, matched: s.match(/สิ้นเดือนนี้|ปลายเดือนนี้/)[0] };
  }
  if (/ต้นเดือนหน้า/.test(s)) {
    return { date: addMonthsSafe(`${today.slice(0, 8)}01`, 1), matched: 'ต้นเดือนหน้า' };
  }

  // เดือน <thMonth> ปีหน้า
  m = s.match(new RegExp(`เดือน\\s*(${thMonthNames})\\s*ปีหน้า`, 'i'));
  if (m) {
    const rawM = m[1].replace(/\s+/g, '').replace(/\./g, '');
    const mKey = Object.keys(TH_MONTHS).find(k => k.replace(/\./g, '') === rawM);
    if (mKey) {
      const y = Number(today.slice(0, 4)) + 1;
      return { date: `${y}-${pad2(TH_MONTHS[mKey])}-01`, matched: m[0] };
    }
  }

  // ปีหน้า (เช่น "ขูดหินปูนน้องหมาปีหน้า")
  if (/ปีหน้า/.test(s)) {
    return { date: addMonthsSafe(today, 12), matched: 'ปีหน้า' };
  }

  // "อีก X วัน / สัปดาห์ / เดือน / ปี"
  const numWordAlt = THAI_NUM_WORDS.map(([w]) => w).join('|');
  m = s.match(new RegExp(`อีก\\s*(${numWordAlt}|\\d+)\\s*(วัน|สัปดาห์|อาทิตย์|วีค|เดือน|ปี)`, 'i'));
  if (m) {
    const n = parseThaiNumberToken(m[1]) || 1;
    const u = m[2];
    const date = u === 'วัน' ? addDays(today, n)
      : /สัปดาห์|อาทิตย์|วีค/.test(u) ? addDays(today, n * 7)
      : u === 'เดือน' ? addMonthsSafe(today, n)
      : addMonthsSafe(today, n * 12);
    return { date, matched: m[0] };
  }

  return { date: null, matched: '' };
}

function findWeekday(text) {
  const lower = text.toLowerCase();
  for (const [token, wd] of WEEKDAY_TOKENS) {
    if (lower.includes(token)) return { weekday: wd, label: WEEKDAY_NAMES[wd], token };
  }
  return null;
}

export function parseSmartReminder(rawText, existingItems = [], today = localDateStr()) {
  const input = String(rawText || '').trim();
  if (!input) return null;

  const s = normalizeThaiDigits(input);
  const snippetsToStrip = [];

  const { remindDays: parsedRemind, matched: remMatch } = extractRemindDays(s);
  if (remMatch) snippetsToStrip.push(remMatch);

  const { time: dueTime, matched: timeMatch } = extractTime(s);
  if (timeMatch) snippetsToStrip.push(timeMatch);

  const kind = inferCategory(s);
  const defaultRemindDays = parsedRemind !== null ? parsedRemind : (kind === 'เอกสาร/ประกัน/ภาษี' ? 30 : 7);

  let rule = { kind: 'once', summary: 'ครั้งเดียว' };
  let repeatMonths = null;
  let intervalDays = null;
  let nextDate = null;

  const numWordAlt = THAI_NUM_WORDS.map(([w]) => w).join('|');

  // 1) เงื่อนไขปฏิเสธ/ยกเว้นที่อ้างอิงกับรายการอื่น เช่น "ทุกวันเสาร์ที่ไม่ได้พาน้องหมาไปอาบน้ำ"
  const exceptMatch = s.match(/(?:ทุก\s*(?:วัน)?(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์))\s*(?:ที่)?\s*(?:ไม่ได้|ไม่|เว้น(?:วันที่)?|ยกเว้น(?:วันที่)?)\s*(.+)$/i);
  if (exceptMatch) {
    const wd = findWeekday(exceptMatch[1]);
    let linkedQuery = exceptMatch[2].trim();
    if (remMatch) linkedQuery = linkedQuery.replace(remMatch, '').trim();
    if (timeMatch) linkedQuery = linkedQuery.replace(timeMatch, '').trim();
    const linked = findLinkedItem(linkedQuery, existingItems);
    rule = {
      kind: 'weekly_except_linked',
      weekday: wd ? wd.weekday : 5,
      ...(linked && { linkedId: linked.id, linkedCol: linked.col }),
      linkedQuery: linked ? linked.title : linkedQuery,
      summary: `ทุกวัน${wd ? wd.label : 'เสาร์'} (เว้นวันที่มี "${linked ? linked.title : linkedQuery}")`
    };
    intervalDays = 7;
    nextDate = resolveRuleNextDate(rule, existingItems, today, true);
    snippetsToStrip.push(exceptMatch[0]);
  }

  // 2) เงื่อนไขทำวันเดียวกับรายการอื่น เช่น "เปลี่ยนผ้าปูวันเดียวกับที่อาบน้ำน้องหมา"
  if (rule.kind === 'once') {
    const sameMatch = s.match(/(?:ใน)?วันเดียว(?:กัน)?กับ(?:ที่|วันที่)?\s*(.+)$/i);
    if (sameMatch) {
      let linkedQuery = sameMatch[1].trim();
      if (remMatch) linkedQuery = linkedQuery.replace(remMatch, '').trim();
      if (timeMatch) linkedQuery = linkedQuery.replace(timeMatch, '').trim();
      const linked = findLinkedItem(linkedQuery, existingItems);
      rule = {
        kind: 'same_as',
        ...(linked && { linkedId: linked.id, linkedCol: linked.col }),
        linkedQuery: linked ? linked.title : linkedQuery,
        summary: `วันเดียวกับ "${linked ? linked.title : linkedQuery}"`
      };
      nextDate = resolveRuleNextDate(rule, existingItems, today, true);
      snippetsToStrip.push(sameMatch[0]);
    }
  }

  // 3) ลำดับวันในเดือน เช่น "ทุกวันเสาร์ที่สามของเดือน" / "ทุกวันเสาร์สุดท้ายของเดือน"
  if (rule.kind === 'once') {
    const lastWdMatch = s.match(/ทุก\s*(?:วัน)?(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)\s*(?:สุดท้าย|ปลายเดือน)\s*(?:ของเดือน)?/i);
    if (lastWdMatch) {
      const wd = findWeekday(lastWdMatch[1]);
      rule = {
        kind: 'last_weekday',
        weekday: wd.weekday,
        summary: `ทุกวัน${wd.label}สุดท้ายของเดือน`
      };
      repeatMonths = 1;
      nextDate = resolveRuleNextDate(rule, existingItems, today, true);
      snippetsToStrip.push(lastWdMatch[0]);
    } else {
      const nthMatch = s.match(new RegExp(`ทุก\\s*(?:วัน)?(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)\\s*(?:สัปดาห์|อาทิตย์)?ที่\\s*(${numWordAlt}|\\d+)\\s*(?:ของเดือน|ทุกเดือน)?`, 'i'));
      if (nthMatch) {
        const wd = findWeekday(nthMatch[1]);
        const nth = Math.min(5, Math.max(1, parseThaiNumberToken(nthMatch[2]) || 1));
        rule = {
          kind: 'nth_weekday',
          weekday: wd.weekday,
          nth,
          summary: `ทุกวัน${wd.label}ที่ ${nth} ของเดือน`
        };
        repeatMonths = 1;
        nextDate = resolveRuleNextDate(rule, existingItems, today, true);
        snippetsToStrip.push(nthMatch[0]);
      }
    }
  }

  // 4) ทำซ้ำพื้นฐาน เช่น "ทุกวันเสาร์", "ทุก 3 เดือน", "ทุก 14 วัน", "ทุกปี"
  if (rule.kind === 'once') {
    const everyWd = s.match(/ทุก\s*(?:วัน)?(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)/i);
    if (everyWd) {
      const wd = findWeekday(everyWd[1]);
      intervalDays = 7;
      rule = { kind: 'interval', weekday: wd.weekday, intervalDays: 7, summary: `ทุกวัน${wd.label} (ทุก 7 วัน)` };
      nextDate = nextWeekdayDate(today, wd.weekday, true);
      snippetsToStrip.push(everyWd[0]);
    } else {
      const everyInterval = s.match(new RegExp(`ทุก(?:ๆ)?\\s*(${numWordAlt}|\\d+)?\\s*(วัน|สัปดาห์|อาทิตย์|วีค|เดือน|ปี)`, 'i'));
      if (everyInterval) {
        const n = everyInterval[1] ? (parseThaiNumberToken(everyInterval[1]) || 1) : 1;
        const unit = everyInterval[2];
        if (unit === 'วัน') {
          intervalDays = n;
          rule = { kind: 'interval', intervalDays: n, summary: n === 1 ? 'ทุกวัน' : `ทุก ${n} วัน` };
        } else if (/สัปดาห์|อาทิตย์|วีค/.test(unit)) {
          intervalDays = n * 7;
          rule = { kind: 'interval', intervalDays, summary: n === 1 ? 'ทุกสัปดาห์' : `ทุก ${n} สัปดาห์` };
        } else if (unit === 'เดือน') {
          repeatMonths = n;
          rule = { kind: 'monthly', repeatMonths: n, summary: n === 1 ? 'ทุกเดือน' : `ทุก ${n} เดือน` };
        } else {
          repeatMonths = n * 12;
          rule = { kind: 'yearly', repeatMonths, summary: n === 1 ? 'ทุกปี' : `ทุก ${n} ปี` };
        }
        snippetsToStrip.push(everyInterval[0]);
      }
    }
  }

  // 5) วันครบกำหนดที่ระบุตรงๆ หรือเทียบปีหน้า/พรุ่งนี้
  const { date: explicitDate, matched: dateMatch } = extractExplicitDate(s, today);
  if (dateMatch) snippetsToStrip.push(dateMatch);
  if (!nextDate) {
    if (explicitDate) nextDate = explicitDate;
    else if (intervalDays) nextDate = addDays(today, intervalDays);
    else if (repeatMonths) nextDate = addMonthsSafe(today, repeatMonths);
    else {
      // เช็กคำว่า "วันเสาร์หน้า / วันจันทร์นี้"
      const oneWd = s.match(/(?:วัน)?(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)(หน้า|นี้)?/i);
      if (oneWd) {
        const wd = findWeekday(oneWd[1]);
        nextDate = nextWeekdayDate(today, wd.weekday, oneWd[2] !== 'หน้า');
        if (oneWd[2] === 'หน้า' && nextDate === today) nextDate = addDays(nextDate, 7);
        snippetsToStrip.push(oneWd[0]);
      } else {
        nextDate = today;
      }
    }
  }

  // 6) สร้างชื่อเรื่องที่สะอาด โดยตัดส่วนวันที่/เงื่อนไข/คำเตือนออก
  let title = input;
  for (const sn of snippetsToStrip) {
    if (!sn) continue;
    title = title.replace(sn, ' ');
  }
  title = title
    .replace(/\s+(?:ทุก|ใน|ที่|และ|พร้อม)\s*$/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!title) title = input.slice(0, 60);

  return {
    rawText: input,
    title: title.slice(0, 100),
    kind,
    nextDate,
    dueTime,
    remindDays: defaultRemindDays,
    repeatMonths,
    intervalDays,
    rule
  };
}
