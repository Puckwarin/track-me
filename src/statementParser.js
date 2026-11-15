// Thai bank statement parser. Raw balance/account columns are discarded.
const MONEY = '\\d{1,3}(?:,\\d{3})*\\.\\d{2}';

function cleanMerchant(value) {
  return String(value || '').replace(/\b(?:เลขที่บัญชี|บัญชีเลขที่)\s*\d{8,15}\b/gi, '')
    .replace(/\b\d{10,15}\b/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function parseStatementLine(rawLine, lineNumber = 1) {
  const line = String(rawLine || '').replace(/\s+/g, ' ').trim();
  const re = new RegExp('^(\\d{2})-(\\d{2})-(\\d{2})\\s+(\\d{2}:\\d{2})\\s+(.+?)\\s+(' + MONEY + ')\\s+(' + MONEY + ')(?:\\s+(.*))?$');
  const m = line.match(re);
  if (!m) return { lineNumber, error: 'ไม่รู้จักรูปแบบบรรทัด Statement' };
  const [, dd, mm, yy, time, description, amountText, _balance, tail = ''] = m;
  const year = Number(yy) >= 70 ? 1900 + Number(yy) : 2000 + Number(yy);
  const date = String(year) + '-' + mm + '-' + dd;
  const amount = Number(amountText.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return { lineNumber, error: 'ยอดเงินไม่ถูกต้อง' };
  const detail = (description + ' ' + tail).trim();
  const isIncome = /รับเงินเดือน|รับโอน|โอนเข้า|เงินเข้า|ดอกเบี้ย|คืนเงิน/i.test(detail);
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
