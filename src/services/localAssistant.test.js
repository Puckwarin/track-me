import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (!globalThis.localStorage || typeof globalThis.localStorage.setItem !== 'function') {
    const values = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        clear: () => values.clear()
      }
    });
  }
  if (!globalThis.window) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
        location: { origin: 'https://localhost', href: 'https://localhost/' }
      }
    });
  }
  if (!globalThis.document) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        getElementById: () => null,
        querySelector: () => null
      }
    });
  }
});

const firestoreMocks = vi.hoisted(() => ({
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {})
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    setDoc: firestoreMocks.setDoc,
    updateDoc: firestoreMocks.updateDoc,
    deleteDoc: firestoreMocks.deleteDoc
  };
});

import { state } from '../state.js';
import { getAnyChatRole } from './chatRoles.js';
import { normalizeFoodName, prepareWriteAction, shouldAttachToolsForTurn } from './aiAssistant.js';
import { parseLocalAssistantIntent, runLocalAssistantCommand } from './localAssistant.js';

describe('0-token Local Pattern Assistant & AI tool-gating', () => {
  const today = '2026-11-16';
  const samplePresets = [
    { name: 'ไข่ต้ม', defaultQuantity: 1, calories: 75, protein: 6.5, carbs: 0.6, fat: 5.2 },
    { name: 'อกไก่ต้ม (100g)', defaultQuantity: 1, calories: 165, protein: 31, carbs: 0, fat: 3.6 }
  ];

  beforeEach(() => {
    localStorage.clear();
    firestoreMocks.setDoc.mockReset().mockResolvedValue(undefined);
    firestoreMocks.updateDoc.mockReset().mockResolvedValue(undefined);
    firestoreMocks.deleteDoc.mockReset().mockResolvedValue(undefined);
    state.uid = 'user-1';
    state.expenses = [
      { id: 'ex1', date: '2026-11-10', title: 'กาแฟ', amount: 65, category: 'เครื่องดื่ม/คาเฟ่', type: 'expense' },
      { id: 'ex2', date: '2026-11-12', title: 'กะเพรา', amount: 70, category: 'อาหาร', type: 'expense' }
    ];
    state.trackedProducts = [
      { id: 'inv1', name: 'ทิชชู่', quantity: 2, minStock: 2, unit: 'ม้วน', category: 'ของใช้ในบ้าน' }
    ];
    state.assistantNotes = [];
    state.userFeedback = [];
    state.body = [];
    state.workouts = [];
    state.templates = [];
    state.petCare = [];
    state.labs = [];
    state.period = [];
    state.symptoms = [];
    state.replacements = [];
  });

  it('exposes local role via getAnyChatRole without changing CHAT_ROLES', () => {
    expect(getAnyChatRole('local').id).toBe('local');
    expect(getAnyChatRole('local').feature).toBe('local');
  });

  it('parses Thai expense, income, and inventory commands deterministically', () => {
    const exp = parseLocalAssistantIntent('☕ จดค่ากาแฟ 60 บาท เมื่อวาน', { today });
    expect(exp).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'addExpense',
      args: { title: 'กาแฟ', amount: 60, date: '2026-11-15', type: 'expense' }
    });

    const inc = parseLocalAssistantIntent('จดรายรับ โบนัส 5000 บาท', { today });
    expect(inc).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'addExpense',
      args: { title: 'โบนัส', amount: 5000, type: 'income', category: 'รายรับ' }
    });

    const invSub = parseLocalAssistantIntent('ใช้ทิชชู่ไป 1 ม้วน', { today });
    expect(invSub).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'updateInventory',
      args: { itemName: 'ทิชชู่', changeAmount: -1 }
    });

    const invAdd = parseLocalAssistantIntent('เติมทิชชู่ 4', { today });
    expect(invAdd).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'updateInventory',
      args: { itemName: 'ทิชชู่', changeAmount: 4 }
    });
  });

  it('parses food from presets, explicit kcal/macros, and detects missing kcal without calling AI', () => {
    const presetHit = parseLocalAssistantIntent('จดมื้อเช้า ไข่ต้ม 2 ฟอง', { today, presets: samplePresets });
    expect(presetHit).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'addFoodLog',
      args: { mealType: 'เช้า', calories: 150, protein: 13 }
    });

    const explicit = parseLocalAssistantIntent('จดมื้อเย็น กะเพราไก่ 480 kcal P28 C52 F16', { today, presets: samplePresets });
    expect(explicit).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'addFoodLog',
      args: { mealType: 'เย็น', foodName: 'กะเพราไก่', calories: 480, protein: 28, carbs: 52, fat: 16 }
    });

    const missing = parseLocalAssistantIntent('จดมื้อเย็น ส้มตำปูปลาร้า', { today, presets: samplePresets });
    expect(missing).toMatchObject({
      matched: true,
      kind: 'food_missing_kcal',
      foodName: 'ส้มตำปูปลาร้า'
    });
  });

  it('parses notes, feedback, reminders, read queries, and passes through generative prompts', () => {
    const note = parseLocalAssistantIntent('จดโน้ต [น้องหมา]: พามูมู่ตรวจเลือดเสาร์นี้', { today });
    expect(note).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'saveNote',
      args: { category: 'น้องหมา', content: 'พามูมู่ตรวจเลือดเสาร์นี้' }
    });

    const fb = parseLocalAssistantIntent('แจ้งปัญหา: หน้ากราฟโหลดช้า', { today });
    expect(fb).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'submitFeedback',
      args: { category: 'bug', message: 'หน้ากราฟโหลดช้า' }
    });

    const rem = parseLocalAssistantIntent('เตือนนัดหมอฟันพรุ่งนี้ 10:00', { today });
    expect(rem).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'addReminder',
      args: { date: '2026-11-17', time: '10:00' }
    });

    const expRead = parseLocalAssistantIntent('💸 เดือนนี้ค่ากินเท่าไหร่?', { today });
    expect(expRead).toMatchObject({
      matched: true,
      kind: 'read',
      toolName: 'getExpenses',
      args: { startDate: 'เดือนนี้', category: 'ค่ากิน' }
    });

    expect(parseLocalAssistantIntent('💡 ช่วยคิดเมนูมื้อเย็นทำง่าย โปรตีนสูง', { today }).matched).toBe(false);
    expect(parseLocalAssistantIntent('✍️ ช่วยร่างข้อความลางานแบบสุภาพ', { today }).matched).toBe(false);
    expect(parseLocalAssistantIntent('💪 ออกท่าเล่นกล้ามก้นและขาที่บ้าน 20 นาที', { today }).matched).toBe(false);
  });

  it('executes local read/write commands with 0 AI fetch calls and preserves high-risk confirmation', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const readRes = await runLocalAssistantCommand('💸 สรุปค่าใช้จ่ายเดือนนี้', { today, presets: samplePresets });
    expect(readRes.handled).toBe(true);
    expect(readRes.model).toBe('0 โทเค็น');
    expect(readRes.text).toContain('135 บาท');
    expect(fetchSpy).not.toHaveBeenCalled();

    const smallWrite = await runLocalAssistantCommand('จดค่ากาแฟ 60 บาท', { today, presets: samplePresets });
    expect(smallWrite.handled).toBe(true);
    expect(smallWrite.receipts).toHaveLength(1);
    expect(smallWrite.pendingActions).toEqual([]);
    expect(firestoreMocks.setDoc).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    const highRiskWrite = await runLocalAssistantCommand('จดค่าโรงพยาบาลสัตว์ 2500 บาท', { today, presets: samplePresets });
    expect(highRiskWrite.handled).toBe(true);
    expect(highRiskWrite.pendingActions).toHaveLength(1);
    expect(highRiskWrite.pendingActions[0].isHighRisk).toBe(true);
    expect(firestoreMocks.setDoc).toHaveBeenCalledTimes(1); // Did not write before confirmation
  });

  it('attaches AI tools only when role or text involves Track Me data', () => {
    expect(shouldAttachToolsForTurn([], 'ช่วยร่างข้อความลางานแบบสุภาพ', 'general')).toBe(false);
    expect(shouldAttachToolsForTurn([], 'ช่วยแปลประโยคนี้เป็นภาษาอังกฤษ', 'fast')).toBe(false);
    expect(shouldAttachToolsForTurn([], 'สรุปค่าใช้จ่ายเดือนนี้ให้หน่อย', 'general')).toBe(true);
    expect(shouldAttachToolsForTurn([], 'สวัสดี', 'coach')).toBe(true);
    expect(shouldAttachToolsForTurn([], 'สวัสดี', 'planner')).toBe(true);
    expect(shouldAttachToolsForTurn([{ role: 'user', text: 'เช็กสต๊อก' }], 'เหลืออันไหนอีกไหม', 'general')).toBe(true);
  });

  it('normalizes trailing food weights/units and matches local presets with 0 AI calls', async () => {
    expect(normalizeFoodName('ข้าวสวย 150g')).toBe('ข้าวสวย');
    expect(normalizeFoodName('อกไก่ต้ม 120 กรัม')).toBe('อกไก่ต้ม');
    expect(normalizeFoodName('นมถั่วเหลือง 250 มล.')).toBe('นมถั่วเหลือง');

    const localMatch = parseLocalAssistantIntent('จดมื้อกลางวัน ข้าวสวย 150g', {
      today,
      presets: [{ name: 'ข้าวสวย', defaultQuantity: 1, calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }]
    });
    expect(localMatch).toMatchObject({
      matched: true,
      kind: 'write',
      toolName: 'addFoodLog',
      args: { mealType: 'กลางวัน', foodName: 'ข้าวสวย 150g', calories: 130 }
    });

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    state.customFoods = [{ name: 'ข้าวสวย', defaultQuantity: 1, calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }];
    const prep = await prepareWriteAction('addFoodLog', { foodName: 'ข้าวสวย 150g', mealType: 'กลางวัน' });
    expect(prep.prepared.writePlan.nutritionSource).toBe('local_library');
    expect(prep.prepared.writePlan.rec.calories).toBe(130);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
