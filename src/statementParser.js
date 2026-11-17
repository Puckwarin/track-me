// Thai bank statement parser. Raw balance/account columns are discarded.
const MONEY = '\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?';

function cleanMerchant(value) {
  return String(value || '').replace(/\b(?:เลขที่บัญชี|บัญชีเลขที่)\s*\d{8,15}\b/gi, '')
    .replace(/\b\d{10,15}\b/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function parseStatementLine(rawLine, lineNumber = 1) {
  const line = String(rawLine || '').replace(/\s+/g, ' ').trim();
  const re = new RegExp('^(\\d{2})[\\/-](\\d{2})[\\/-](\\d{2,4})\\s+(\\d{2}:\\d{2})\\s+(.+?)\\s+(' + MONEY + ')\\s+(' + MONEY + ')(?:\\s+(.*))?$');
  const m = line.match(re);
  if (!m) return { lineNumber, error: 'ไม่รู้จักรูปแบบบรรทัด Statement' };
  const [, dd, mm, yearText, time, description, amountText, , tail = ''] = m;
  const yy = yearText.slice(-2);
  const shortYear = Number(yy);
  const year = shortYear >= 55 ? 2500 + shortYear - 543 : 2000 + shortYear;
  const dateObj = new Date(year, Number(mm) - 1, Number(dd));
  const isValidDate = dateObj.getFullYear() === year
    && dateObj.getMonth() === Number(mm) - 1
    && dateObj.getDate() === Number(dd);
  if (!isValidDate) return { lineNumber, error: `วันที่ไม่มีอยู่จริง: ${dd}-${mm}-${yearText}` };
  const [hh, min] = time.split(':').map(Number);
  if (hh > 23 || min > 59) return { lineNumber, error: `เวลาไม่ถูกต้อง: ${time}` };
  const futureLimit = new Date();
  futureLimit.setDate(futureLimit.getDate() + 7);
  if (dateObj > futureLimit) return { lineNumber, error: `วันที่เป็นอนาคตเกินไป: ${dd}-${mm}-${yearText}` };
  const date = String(year) + '-' + mm + '-' + dd;
  const amount = Number(amountText.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return { lineNumber, error: 'ยอดเงินไม่ถูกต้อง' };
  const detail = (description + ' ' + tail).trim();
  const isRefund = /คืนเงิน|โอนคืน|เงินคืน|refund|cashback|เติมเงิน.*(?:true\s*money|truemoney|wallet|rabbit|shopeepay|linepay|wepay)|โอนเข้ากระเป๋า/i.test(detail);
  const isIncome = isRefund || /รับเงินเดือน|รับโอน|โอนเข้า|เงินเข้า|ดอกเบี้ย/i.test(detail);
  const isTransfer = /โอนเงิน|โอนไป|โอนออก|โอนระหว่าง/i.test(detail);
  const ownTransfer = isTransfer && /บัญชีตัวเอง|บัญชีของตนเอง|บัญชีตนเอง|ระหว่างบัญชี|บัญชีของฉัน/i.test(detail);
  const type = ownTransfer ? 'transfer' : (isIncome ? 'income' : 'expense');
  const merchant = cleanMerchant(detail.replace(/\bK\s*PLUS\b/gi, '')
    .replace(/\b(?:โอนไป|จาก|ไปยัง|เข้าบัญชี)\s*(?:KK|KBANK|KPLUS)?\s*X?\d{3,15}\b/gi, '')
    .replace(/\bX\d{3,15}\b/gi, '').replace(/\b\d{8,15}\b/g, '')
    .replace(/เพื่อชำระ|เพื่อชําระ/gi, ''));
  return { item: { date, time, type, amount, merchant } };
}

export function parseStatementText(text) {
  const items = [], errors = [];
  String(text || '').split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const result = parseStatementLine(line, index + 1);
    if (result.item) items.push(result.item); else errors.push(result);
  });
  return { items, errors };
}
