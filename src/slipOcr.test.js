import { describe, expect, it } from 'vitest';
import { parseSlipText } from './slipOcr.js';

describe('slip OCR parser', () => {
  it('extracts amount, merchant, category, and Thai Buddhist dates without invoking OCR', () => {
    const result = parseSlipText(`ธนาคาร
ยอดโอน 1,250.50 บาท
14 พ.ย. 69 09:35
ไปยัง
7-Eleven
หมายเหตุ: กาแฟ`);

    expect(result).toMatchObject({
      amount: 1250.5,
      date: '2026-11-14',
      time: '09:35',
      detectedDate: true,
      detectedTime: true,
      merchant: '7-Eleven',
      note: 'กาแฟ',
      category: 'เครื่องดื่ม/คาเฟ่'
    });
  });

  it('keeps missing amount and date information explicitly marked', () => {
    const result = parseSlipText('จ่ายเงินสำเร็จ');
    expect(result.amount).toBeNull();
    expect(result.detectedDate).toBe(false);
    expect(result.detectedTime).toBe(false);
  });
});
