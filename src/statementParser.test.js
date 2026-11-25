import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStatementLine, parseStatementText } from './statementParser.js';

describe('Thai bank statement parser (StatementParser)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('BE / AD year conversion', () => {
    it('converts 2-digit and 4-digit Thai Buddhist Era years (>= 55) to Gregorian years', () => {
      const be67 = parseStatementLine('15/08/67 09:30 ซื้อสินค้า 7-Eleven 120.50 5,000.00');
      expect(be67.item).toMatchObject({ date: '2024-08-15', time: '09:30', amount: 120.5 });

      const be69 = parseStatementLine('20-11-69 14:05 ค่ากาแฟ 65.00 4,935.00');
      expect(be69.item).toMatchObject({ date: '2026-11-20', time: '14:05', amount: 65 });

      const be2569 = parseStatementLine('24/11/2569 08:00 ค่าเดินทาง 45.00 4,890.00');
      expect(be2569.item).toMatchObject({ date: '2026-11-24', time: '08:00', amount: 45 });
    });

    it('treats 2-digit years below 55 as Gregorian AD (2000+yy)', () => {
      const ad25 = parseStatementLine('10/05/25 11:15 ร้านอาหาร 250.00 1,000.00');
      expect(ad25.item).toMatchObject({ date: '2025-05-10', time: '11:15', amount: 250 });

      const ad54 = parseStatementLine('01/01/2026 12:00 โอนเงิน ค่าสินค้า 99.00 901.00');
      expect(ad54.item).toMatchObject({ date: '2026-01-01', amount: 99 });
    });
  });

  describe('Calendar & time validation', () => {
    it('rejects non-existent calendar dates and accepts valid leap day', () => {
      const feb31 = parseStatementLine('31/02/69 10:00 ซื้อสินค้า 100.00 1,000.00', 3);
      expect(feb31).toEqual({ lineNumber: 3, error: 'วันที่ไม่มีอยู่จริง: 31-02-69' });

      const feb29NonLeap = parseStatementLine('29/02/68 10:00 ซื้อสินค้า 100.00 1,000.00', 4);
      expect(feb29NonLeap).toEqual({ lineNumber: 4, error: 'วันที่ไม่มีอยู่จริง: 29-02-68' });

      const apr31 = parseStatementLine('31/04/69 10:00 ซื้อสินค้า 100.00 1,000.00', 5);
      expect(apr31).toEqual({ lineNumber: 5, error: 'วันที่ไม่มีอยู่จริง: 31-04-69' });

      const leap2024 = parseStatementLine('29/02/67 10:00 ซื้อสินค้า 100.00 1,000.00', 6);
      expect(leap2024.item).toMatchObject({ date: '2024-02-29', amount: 100 });
    });

    it('rejects dates more than 7 days in the future while allowing dates within 7 days', () => {
      const within7Days = parseStatementLine('01/12/69 09:00 ค่าอาหาร 80.00 1,000.00', 1);
      expect(within7Days.item).toMatchObject({ date: '2026-12-01', amount: 80 });

      const tooFarFuture = parseStatementLine('05/12/69 09:00 ค่าอาหาร 80.00 1,000.00', 2);
      expect(tooFarFuture).toEqual({ lineNumber: 2, error: 'วันที่เป็นอนาคตเกินไป: 05-12-69' });
    });

    it('rejects invalid times, zero amounts, and unrecognized line formats', () => {
      expect(parseStatementLine('24/11/69 24:00 ค่าอาหาร 50.00 1,000.00', 7)).toEqual({
        lineNumber: 7,
        error: 'เวลาไม่ถูกต้อง: 24:00'
      });
      expect(parseStatementLine('24/11/69 12:60 ค่าอาหาร 50.00 1,000.00', 8)).toEqual({
        lineNumber: 8,
        error: 'เวลาไม่ถูกต้อง: 12:60'
      });
      expect(parseStatementLine('24/11/69 12:30 ค่าอาหาร 0.00 1,000.00', 9)).toEqual({
        lineNumber: 9,
        error: 'ยอดเงินไม่ถูกต้อง'
      });
      expect(parseStatementLine('ข้อมูลที่ไม่ใช่บรรทัด statement', 10)).toEqual({
        lineNumber: 10,
        error: 'ไม่รู้จักรูปแบบบรรทัด Statement'
      });
    });
  });

  describe('Transaction classification & merchant sanitization', () => {
    it('classifies TrueWallet, TrueMoney, and e-wallet top-ups as income rather than expense', () => {
      const tw = parseStatementLine('20/11/69 11:20 เติมเงิน TrueWallet 500.00 4,500.00 เพื่อชำระร้านค้า');
      expect(tw.item).toMatchObject({ type: 'income', amount: 500 });

      const tm = parseStatementLine('20/11/69 11:25 โอนเงิน เติมเงินเข้า TrueMoney Wallet 300.00 4,200.00');
      expect(tm.item).toMatchObject({ type: 'income', amount: 300 });

      const rabbit = parseStatementLine('20/11/69 11:30 เติมเงิน Rabbit LinePay 200.00 4,000.00');
      expect(rabbit.item).toMatchObject({ type: 'income', amount: 200 });

      const topupWallet = parseStatementLine('20/11/69 11:35 โอนเข้ากระเป๋า 150.00 3,850.00');
      expect(topupWallet.item).toMatchObject({ type: 'income', amount: 150 });
    });

    it('classifies own-account transfers as transfer, refunds/salary as income, and regular spending as expense', () => {
      const ownTransfer = parseStatementLine('21/11/69 09:00 โอนเงิน บัญชีตัวเอง 2,000.00 8,000.00');
      expect(ownTransfer.item).toMatchObject({ type: 'transfer', amount: 2000 });

      const salary = parseStatementLine('21/11/69 09:05 รับเงินเดือน บริษัท เอ บี ซี 25,000.00 33,000.00');
      expect(salary.item).toMatchObject({ type: 'income', amount: 25000 });

      const refund = parseStatementLine('21/11/69 09:10 คืนเงิน ShopeePay 189.50 33,189.50');
      expect(refund.item).toMatchObject({ type: 'income', amount: 189.5 });

      const expense = parseStatementLine('21/11/69 12:15 โอนเงิน ร้านข้าวมันไก่ 65.00 33,124.50');
      expect(expense.item).toMatchObject({ type: 'expense', amount: 65 });
    });

    it('discards raw balance column and strips bank account numbers and noisy channel tokens', () => {
      const res = parseStatementLine(
        '22/11/69 18:45 ชำระเงิน K PLUS เลขที่บัญชี 1234567890 โอนไป KBANK X9876 เพื่อชำระ ร้านกาแฟ 1,250.75 88,749.25'
      );
      expect(res.item.amount).toBe(1250.75);
      expect(res.item.merchant).not.toContain('1234567890');
      expect(res.item.merchant).not.toContain('X9876');
      expect(res.item.merchant).not.toContain('K PLUS');
      expect(res.item.merchant).not.toContain('เพื่อชำระ');
      expect(res.item.merchant).not.toContain('88,749.25');
      expect(res.item.merchant).toContain('ร้านกาแฟ');
    });
  });

  describe('parseStatementText multi-line parsing', () => {
    it('ignores blank lines, keeps accurate 1-based line numbers for errors, and collects valid items', () => {
      const raw = [
        '',
        '20/11/69 08:30 รับโอน ค่าขนม 300.00 5,300.00',
        '   ',
        '31/02/69 09:00 ซื้อสินค้า 50.00 5,250.00',
        '21/11/69 13:10 เติมเงิน TrueWallet 100.00 5,150.00',
        '22/11/69 19:00 ค่าอาหารเย็น 180.00 4,970.00',
        'บรรทัดผิดรูปแบบ'
      ].join('\n');

      const { items, errors } = parseStatementText(raw);
      expect(items).toHaveLength(3);
      expect(items[0]).toMatchObject({ date: '2026-11-20', type: 'income', amount: 300 });
      expect(items[1]).toMatchObject({ date: '2026-11-21', type: 'income', amount: 100 });
      expect(items[2]).toMatchObject({ date: '2026-11-22', type: 'expense', amount: 180 });

      expect(errors).toEqual([
        { lineNumber: 4, error: 'วันที่ไม่มีอยู่จริง: 31-02-69' },
        { lineNumber: 7, error: 'ไม่รู้จักรูปแบบบรรทัด Statement' }
      ]);
    });
  });
});
