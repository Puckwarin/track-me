// อ่านสลิปโอนเงินและใบเสร็จด้วย tesseract.js (tha+eng) ในเครื่องผู้ใช้เท่านั้น
// Strict Privacy: ไม่ส่ง/ไม่อัปโหลด/ไม่บันทึกรูปภาพลง Firebase หรือที่ใดทั้งสิ้น และล้างไฟล์ออกจากหน่วยความจำทันทีหลังอ่านเสร็จ
import { createWorker } from 'tesseract.js';
import { localDateStr } from './util.js';

const SHARE_CACHE = 'trackme-share-tmp';
const SHARE_KEY = '/__pending-shared-slip__';

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

const EN_MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

export async function consumePendingSharedSlip() {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const match = await cache.match(SHARE_KEY);
    if (!match) {
      await caches.delete(SHARE_CACHE).catch(() => {});
      return null;
    }
    const blob = await match.blob();
    const rawName = match.headers.get('X-Share-Filename');
    const name = rawName ? decodeURIComponent(rawName) : 'shared-slip.jpg';
    // ล้างแคชภาพทันทีก่อนส่งไปอ่าน OCR เพื่อไม่ให้ค้างในเครื่อง
    await cache.delete(SHARE_KEY);
    await caches.delete(SHARE_CACHE).catch(() => {});
    if (!blob || !blob.size) return null;
    return new File([blob], name, { type: blob.type || 'image/jpeg' });
  } catch (e) {
    return null;
  }
}

async function prepareSlipCanvas(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const maxDim = 1800;
    const minDim = 900;
    const largest = Math.max(bitmap.width, bitmap.height) || 1;
    let scale = 1;
    if (largest > maxDim) scale = maxDim / largest;
    else if (largest < minDim) scale = Math.min(2, minDim / largest);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.filter = 'grayscale(1) contrast(1.18)';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close?.();
  }
}

export async function ocrSlipInBrowser(file, onProgress = () => {}) {
  let canvas = null;
  let worker = null;
  try {
    onProgress('กำลังเตรียมภาพสลิปในเครื่อง…');
    try {
      canvas = await prepareSlipCanvas(file);
    } catch {
      canvas = null;
    }

    onProgress('กำลังโหลดตัวอ่านภาษาไทย/อังกฤษ (ครั้งแรกอาจใช้เวลาสักครู่)…');
    worker = await createWorker('tha+eng', 1, {
      logger: m => {
        if (m?.status === 'recognizing text' && typeof m.progress === 'number') {
          onProgress(`กำลังอ่านข้อความจากสลิป (${Math.round(m.progress * 100)}%)…`);
        }
      }
    });

    const result = await worker.recognize(canvas || file);
    const text = result?.data?.text || '';
    return {
      text,
      parsed: parseSlipText(text)
    };
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

function toCeYear(rawYear) {
  let y = Number(rawYear);
  if (!Number.isFinite(y)) return new Date().getFullYear();
  if (y < 100) {
    // สลิปไทยมักใช้ พ.ศ. 2 หลัก เช่น 69 (= 2569 -> 2026)
    y = y >= 55 ? 2500 + y - 543 : 2000 + y;
  } else if (y >= 2400) {
    y -= 543;
  }
  return y;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function validYmd(y, m, d) {
  if (y < 2015 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function extractAmount(lines) {
  const ignoreLine = /ค่าธรรมเนียม|fee|ยอดคงเหลือ|balance|เลขที่|อ้างอิง|ref|รหัส|id|โทร|tel/i;
  const preferLine = /จำนวนเงิน|จำนวน|ยอดเงิน|ยอดโอน|ยอดชำระ|ชำระเงิน|โอนเงิน|รวมทั้งสิ้น|amount|total|paid|บาท|thb|฿/i;

  const parseNum = raw => {
    const cleaned = raw.replace(/[Oo]/g, '0').replace(/,/g, '').replace(/\s+/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 && n < 10000000 ? Math.round(n * 100) / 100 : null;
  };

  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ignoreLine.test(line)) continue;
    const hasPrefer = preferLine.test(line);
    const matches = [...line.matchAll(/(?:^|[^\d])(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2}))(?!\d)/g)];
    for (const m of matches) {
      const val = parseNum(m[1]);
      if (val !== null) {
        let score = 1;
        if (hasPrefer) score += 5;
        if (/บาท|thb|฿/i.test(line)) score += 3;
        if (/\.\d{2}$/.test(m[1])) score += 2;
        if (i > 0 && preferLine.test(lines[i - 1]) && !ignoreLine.test(lines[i - 1])) score += 3;
        candidates.push({ val, score });
      }
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score || b.val - a.val);
    return candidates[0].val;
  }

  // Fallback: ตัวเลขแบบไม่มีทศนิยมหลังคำว่า บาท / จำนวน / THB
  const joined = lines.join('\n');
  const fb = joined.match(/(?:จำนวน(?:เงิน)?|ยอดเงิน|ยอดโอน|amount|total)[^\d\n]{0,20}(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)/i);
  if (fb) return parseNum(fb[1]);
  return null;
}

function extractDateTime(text) {
  let date = null;
  let time = null;

  // 1) รูปแบบเดือนภาษาไทย: 14 พ.ย. 69 / 14 พ.ย. 2569 / 14 พฤศจิกายน 2569
  const thMonthNames = Object.keys(TH_MONTHS).sort((a, b) => b.length - a.length).map(k => k.replace(/\./g, '\\.?')).join('|');
  const thRe = new RegExp(`(\\d{1,2})\\s*(${thMonthNames})\\s*(\\d{2,4})`, 'i');
  const thMatch = text.match(thRe);
  if (thMatch) {
    const d = Number(thMatch[1]);
    const rawM = thMatch[2].replace(/\s+/g, '');
    const mKey = Object.keys(TH_MONTHS).find(k => k.replace(/\./g, '') === rawM.replace(/\./g, ''));
    const y = toCeYear(thMatch[3]);
    if (mKey) date = validYmd(y, TH_MONTHS[mKey], d);
  }

  // 2) รูปแบบเดือนอังกฤษ: 14 Nov 2026 / 14 Nov 26
  if (!date) {
    const enMonthNames = Object.keys(EN_MONTHS).sort((a, b) => b.length - a.length).join('|');
    const enRe = new RegExp(`(\\d{1,2})\\s+(${enMonthNames})\\s+(\\d{2,4})`, 'i');
    const enMatch = text.match(enRe);
    if (enMatch) {
      const d = Number(enMatch[1]);
      const m = EN_MONTHS[enMatch[2].toLowerCase()];
      const y = toCeYear(enMatch[3]);
      if (m) date = validYmd(y, m, d);
    }
  }

  // 3) รูปแบบตัวเลข DD/MM/YYYY หรือ YYYY-MM-DD
  if (!date) {
    const numMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (numMatch) {
      const d = Number(numMatch[1]);
      const m = Number(numMatch[2]);
      const y = toCeYear(numMatch[3]);
      date = validYmd(y, m, d);
    }
  }

  // เวลา HH:MM (หรือ HH.MM น.)
  const timeMatch = text.match(/(?:^|[\s\-,])([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?\s*(?:น\.?|hrs?|am|pm)?/im);
  if (timeMatch) {
    time = `${pad2(Number(timeMatch[1]))}:${timeMatch[2]}`;
  }

  const now = new Date();
  return {
    date: date || localDateStr(),
    time: time || `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    detectedDate: Boolean(date),
    detectedTime: Boolean(time)
  };
}

function extractMerchantAndNote(lines) {
  const skipLine = /^(?:k\+|kbank|scb|krungthai|ktb|bbl|bay|krungsri|ttb|gsb|promptpay|พร้อมเพย์|โอนเงินสำเร็จ|จ่ายบิลสำเร็จ|ชำระเงินสำเร็จ|สำเร็จ|successful|completed|จาก|from|เลขที่รายการ|รหัสอ้างอิง|ref|fee|ค่าธรรมเนียม|จำนวน|amount|ยอด|สแกน|verify|qr)/i;
  const maskedAcct = /^[xX\d\-\s*]{6,}$/;

  let merchant = '';
  let note = '';

  const toIdx = lines.findIndex(l => /^(?:ไปยังบัญชี|ไปยัง|ถึง|ผู้รับเงิน|ผู้รับโอน|ชื่อร้าน|ร้านค้า|to\b|merchant\b|biller\b|paid to\b)/i.test(l));
  if (toIdx >= 0) {
    const inline = lines[toIdx].replace(/^(?:ไปยังบัญชี|ไปยัง|ถึง|ผู้รับเงิน|ผู้รับโอน|ชื่อร้าน|ร้านค้า|to\b|merchant\b|biller\b|paid to\b)\s*[:\-]?\s*/i, '').trim();
    if (inline && !skipLine.test(inline) && !maskedAcct.test(inline)) {
      merchant = inline;
    } else {
      for (let j = toIdx + 1; j <= Math.min(lines.length - 1, toIdx + 3); j++) {
        const cand = lines[j].trim();
        if (cand && !skipLine.test(cand) && !maskedAcct.test(cand) && !/^(?:ธนาคาร|bank|xxx)/i.test(cand)) {
          merchant = cand;
          break;
        }
      }
    }
  }

  const memoIdx = lines.findIndex(l => /^(?:บันทึกช่วยจำ|หมายเหตุ|รายละเอียด|memo\b|note\b)/i.test(l));
  if (memoIdx >= 0) {
    const inline = lines[memoIdx].replace(/^(?:บันทึกช่วยจำ|หมายเหตุ|รายละเอียด|memo\b|note\b)\s*[:\-]?\s*/i, '').trim();
    if (inline) note = inline;
    else if (lines[memoIdx + 1] && !skipLine.test(lines[memoIdx + 1])) note = lines[memoIdx + 1].trim();
  }

  if (!merchant) {
    const shopHit = lines.find(l => /(?:7-?eleven|cp\s*all|grab|lineman|line\s*man|shopee|lazada|amazon|starbucks|cafe|coffee|lotus|big\s*c|makro|tops|central|foodpanda|robinhood|bts|mrt|ptt|bangchak|shell|true|ais|dtac|บริษัท|ร้าน|หจก|บจก)/i.test(l) && !skipLine.test(l));
    if (shopHit) merchant = shopHit.trim();
  }

  return {
    merchant: merchant.replace(/\s{2,}/g, ' ').slice(0, 80),
    note: note.replace(/\s{2,}/g, ' ').slice(0, 120)
  };
}

export function guessExpenseCategory(text) {
  const s = (text || '').toLowerCase();
  if (/cafe|coffee|starbucks|amazon|ชา|กาแฟ|inthanin|punthai|all\s*cafe|koikoi|boost|mixue/.test(s)) return 'เครื่องดื่ม/คาเฟ่';
  if (/grabfood|lineman|line\s*man|foodpanda|robinhood|7-?eleven|cp\s*all|restaurant|kfc|mcdonald|mk|sizzler|shabu|อาหาร|ข้าว|ก๋วยเตี๋ยว|หมู|ไก่|mk\s*su|suki/.test(s)) return 'อาหาร';
  if (/bts|mrt|bolt|grab|ptt|bangchak|shell|caltex|esso|น้ำมัน|ทางด่วน|easy\s*pass|รถไฟฟ้า|แท็กซี่|การเดินทาง/.test(s)) return 'เดินทาง';
  if (/shopee|lazada|tiktok|central|uniqlo|zara|eveandboy|watson|sephora|ช้อปปิ้ง|เสื้อผ้า/.test(s)) return 'ช้อปปิ้ง';
  if (/true|ais|dtac|การไฟฟ้า|กฟน|กฟภ|การประปา|กปน|กปภ|ค่าเน็ต|ค่าไฟ|ค่าน้ำ|ค่าเช่า|บัตรเครดิต|ประกัน|อินเทอร์เน็ต/.test(s)) return 'บิล/ค่าใช้จ่ายประจำ';
  if (/โรงพยาบาล|คลินิก|clinic|hospital|pharmacy|ร้านยา|หมอฟัน|ทันตกรรม|lab/.test(s)) return 'สุขภาพ';
  if (/pet|สัตว์|โรงพยาบาลสัตว์|เพ็ท|อาหารสุนัข|อาหารแมว|กรูมมิ่ง/.test(s)) return 'สัตว์เลี้ยง';
  if (/lotus|big\s*c|makro|tops|homepro|ikea|mr\.diy|ของใช้/.test(s)) return 'ของใช้ในบ้าน';
  return 'อื่น ๆ';
}

export function parseSlipText(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const amount = extractAmount(lines);
  const { date, time, detectedDate, detectedTime } = extractDateTime(lines.join('\n'));
  const { merchant, note } = extractMerchantAndNote(lines);
  const category = guessExpenseCategory(`${merchant} ${note} ${lines.join(' ')}`);

  return {
    amount,
    date,
    time,
    detectedDate,
    detectedTime,
    merchant,
    note,
    category,
    rawText: lines.join('\n').slice(0, 1200)
  };
}
