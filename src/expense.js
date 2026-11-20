// บันทึกรายรับ-รายจ่าย + สแกนสลิปอัตโนมัติ (OCR ในเครื่องเท่านั้น ไม่เก็บรูปภาพลง Firebase)
import { deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, round1, toCsv, downloadFile, toast, openModal } from './util.js';
import { iconSvg } from './icons.js';
import { animateNumberTicker } from './ui.js';
import { guardPreviewWrite, isPreviewMode } from './preview.js';
import { ocrSlipInBrowser, ocrMultipleSlipsInBrowser, consumePendingSharedSlip } from './slipOcr.js';
import { parseStatementText } from './statementParser.js';
import {
  advanceRecurringDate, calculateExpenseBudgets, detectRecurringExpenses,
  estimateMonthlyRecurringTotal, expenseSettingDocId, normalizeExpenseKeyword, suggestExpenseCategory
} from './expenseLogic.js';

export const EXPENSE_CATEGORIES = [
  'อาหาร',
  'เครื่องดื่ม/คาเฟ่',
  'ช้อปปิ้ง',
  'เดินทาง',
  'รถยนต์/ภาษี',
  'ค่าโทรศัพท์',
  'บิล/ค่าใช้จ่ายประจำ',
  'สุขภาพ',
  'สัตว์เลี้ยง',
  'ของใช้ในบ้าน',
  'อื่น ๆ'
];

export const INCOME_CATEGORIES = [
  'เงินเดือน',
  'รายได้เสริม',
  'โอนเข้า/คืนเงิน',
  'ลงทุน/ดอกเบี้ย',
  'อื่น ๆ'
];

const CAT_ICONS = {
  'อาหาร': '🍜',
  'เครื่องดื่ม/คาเฟ่': '☕',
  'ช้อปปิ้ง': '🛍️',
  'เดินทาง': '🚆',
  'บิล/ค่าใช้จ่ายประจำ': '🧾',
  'สุขภาพ': '💊',
  'สัตว์เลี้ยง': '🐾',
  'ของใช้ในบ้าน': '🧺',
  'เงินเดือน': '💼',
  'รายได้เสริม': '✨',
  'โอนเข้า/คืนเงิน': '🔄',
  'ลงทุน/ดอกเบี้ย': '📈',
  'อื่น ๆ': '💸'
};

let root;
let txType = 'expense';
let editing = null; // { id, oldMonth } | null
let selectedMonth = localDateStr().slice(0, 7);
let pendingStatement = [];
let expenseRules = [];
let expenseBudgets = {};
let recurringExpenses = [];
let analyzedRecurringCandidates = [];
let manualCategoryTouched = false;

const $r = s => $(s, root);
const fmtMoney = n => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function monthItems(monthStr) {
  return (state.expenses || []).filter(x => (x.date || '').slice(0, 7) === monthStr);
}

function syncExpenseSettings() {
  const settings = Array.isArray(state.expenseSettings) ? state.expenseSettings : [];
  const legacyRules = settings.find(item => item.id === 'expense_rules')?.rules || [];
  expenseRules = [
    ...legacyRules,
    ...settings.filter(item => item.kind === 'expense_rule' && typeof item.keyword === 'string' && typeof item.category === 'string')
      .map(({ keyword, category }) => ({ keyword, category }))
  ];
  expenseBudgets = Object.fromEntries(settings
    .filter(item => item.kind === 'expense_budget' && EXPENSE_CATEGORIES.includes(item.category)
      && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 && Number(item.amount) <= 100000000)
    .map(item => [item.category, Number(item.amount)]));
  recurringExpenses = settings
    .filter(item => item.kind === 'expense_recurring' && /^[\w-]{1,80}$/.test(item.planId || '')
      && typeof item.merchant === 'string' && item.merchant.trim() && EXPENSE_CATEGORIES.includes(item.category)
      && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 && Number(item.amount) <= 100000000
      && ['monthly', 'yearly'].includes(item.frequency) && isValidExpenseDate(item.nextDate)
      && Number.isInteger(item.dayOfMonth) && item.dayOfMonth >= 1 && item.dayOfMonth <= 31)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

function updateExpenseSetting(id, data) {
  const settings = Array.isArray(state.expenseSettings) ? [...state.expenseSettings] : [];
  const index = settings.findIndex(item => item.id === id);
  const updated = { id, ...data };
  if (index >= 0) settings[index] = updated;
  else settings.push(updated);
  state.expenseSettings = settings;
  syncExpenseSettings();
}

function removeExpenseSetting(id) {
  state.expenseSettings = (state.expenseSettings || []).filter(item => item.id !== id);
  syncExpenseSettings();
}

function rememberExpenseRules(rules) {
  if (!state.uid || isPreviewMode()) return;
  const latest = new Map();
  rules.forEach(rule => {
    const keyword = normalizeExpenseKeyword(rule.keyword);
    if (keyword && rule.category && (EXPENSE_CATEGORIES.includes(rule.category) || INCOME_CATEGORIES.includes(rule.category))) {
      latest.set(keyword, { keyword, category: rule.category });
    }
  });
  for (const [keyword, rule] of latest.entries()) {
    const id = expenseSettingDocId('expense_rule', keyword);
    const data = { kind: 'expense_rule', keyword: rule.keyword, category: rule.category, updatedAt: new Date().toISOString() };
    updateExpenseSetting(id, data);
    setDoc(userDoc(state.uid, 'settings', id), data)
      .catch(err => toast(`บันทึกกฎหมวดหมู่ไม่สำเร็จ: ${err.message || 'เกิดข้อผิดพลาด'}`, 'err'));
  }
}

function buildExpensePayload(record) {
  return {
    type: ['income', 'transfer'].includes(record.type) ? record.type : 'expense',
    amount: Math.round((Number(record.amount) || 0) * 100) / 100,
    category: String(record.category || 'อื่น ๆ').slice(0, 60),
    date: record.date,
    ...(record.time && { time: String(record.time).slice(0, 5) }),
    merchant: String(record.merchant || '').slice(0, 120),
    note: String(record.note || '').slice(0, 200),
    source: ['slip_ocr', 'statement', 'recurring'].includes(record.source) ? record.source : 'manual',
    createdAt: record.createdAt || new Date().toISOString()
  };
}

function explainExpenseWriteError(err) {
  const msg = String(err?.code || err?.message || '');
  if (/permission-denied/i.test(msg)) {
    return 'ยังไม่ได้เผยแพร่ Firestore Rules สำหรับ expense_records/settings — กรุณาอัปเดต Rules ตาม docs/SETUP.md';
  }
  return err?.message || 'ไม่สามารถบันทึกข้อมูลได้';
}

function saveTransactionRecord(record, prevEdit = null) {
  if (!state.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  if (guardPreviewWrite('การบันทึกรายรับ-รายจ่าย')) return false;
  const targetMonth = record.date.slice(0, 7);
  const docId = prevEdit?.id || record.id;
  setDoc(userDoc(state.uid, 'expense_records', docId), buildExpensePayload(record))
    .catch(err => toast(explainExpenseWriteError(err), 'err'));
  selectedMonth = targetMonth;
  return true;
}

async function saveBatchExpenseRecords(records) {
  if (!state.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  if (guardPreviewWrite('การบันทึกรายการจำนวนมาก')) return false;
  try {
    for (let i = 0; i < records.length; i += 400) {
      const batch = writeBatch(db);
      records.slice(i, i + 400).forEach(r => {
        batch.set(userDoc(state.uid, 'expense_records', r.id), buildExpensePayload(r));
      });
      batch.commit().catch(err => toast(explainExpenseWriteError(err), 'err'));
    }
    return true;
  } catch (err) {
    throw new Error(explainExpenseWriteError(err));
  }
}

async function deleteTransactionRecord(id, dateStr) {
  if (!state.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  if (guardPreviewWrite('การลบรายรับ-รายจ่าย')) return false;
  try {
    deleteDoc(userDoc(state.uid, 'expense_records', id))
      .catch(err => toast(explainExpenseWriteError(err), 'err'));
  } catch (err) {
    throw new Error(explainExpenseWriteError(err));
  }
  // หากรายการนี้ยังค้างอยู่ในเอกสารเก่า settings/exp_YYYY-MM ให้เอาออกด้วยเพื่อกันเด้งกลับ
  const m = (dateStr || localDateStr()).slice(0, 7);
  const legacyDoc = (state.legacyExpenseDocs || []).find(d => !d.migratedAt && (d.id === `exp_${m}` || d.month === m));
  if (legacyDoc && Array.isArray(legacyDoc.items) && legacyDoc.items.some(x => x.id === id)) {
    const remaining = legacyDoc.items.filter(x => x.id !== id);
    setDoc(userDoc(state.uid, 'settings', legacyDoc.id), {
      kind: 'expense_month',
      month: m,
      items: remaining,
      updatedAt: new Date()
    }, { merge: true }).catch(err => toast(explainExpenseWriteError(err), 'err'));
  }
  return true;
}

export function mountExpense(el) {
  root = el;
  txType = 'expense';
  editing = null;
  manualCategoryTouched = false;
  pendingStatement = [];
  const today = localDateStr();
  root.innerHTML = `
  <div class="lg:col-span-1 space-y-4">
    <section class="card space-y-4">
      <header class="space-y-1">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('expense', { size: 19, className: 'text-brand' })}<span>รายรับ-รายจ่าย</span></h2>
          <span class="text-[11px] px-2 py-0.5 rounded-md bg-ok-soft text-green-800 font-medium">สลิปอ่านเฉพาะในเครื่อง</span>
        </div>
        <p class="text-xs text-slate-500">สแกนสลิปโอนเงินด้วย OCR ฟรีในเบราว์เซอร์ (ไม่มีการอัปโหลดหรือบันทึกรูปภาพลงระบบ)</p>
      </header>

      <div class="rounded-2xl border border-dashed border-brand/40 bg-lav-soft/40 p-3 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label class="btn btn-primary !py-2 !px-3.5 text-xs cursor-pointer">
            ${iconSvg('camera', { size: 15 })} สแกนสลิป (เลือกได้หลายรูป)
            <input id="ex-slip-file" type="file" accept="image/*" multiple class="hidden">
          </label>
          <span class="text-[11px] text-slate-500">หรือกด แชร์ รูปจากแกลเลอรีเข้า Track Me</span>
        </div>
        <p id="ex-ocr-status" class="hidden text-xs font-medium" aria-live="polite"></p>
      </div>

      <details id="ex-statement-box" class="rounded-2xl border border-dashed border-sky-300 bg-sky-50/50 p-3">
        <summary class="cursor-pointer flex items-center justify-between gap-2 text-sm font-semibold text-slate-800 select-none">
          <span>นำเข้า Statement (วางข้อความ)</span>
          <span class="text-[11px] font-normal text-green-700">ประมวลผลในเครื่อง</span>
        </summary>
        <div class="mt-2.5 space-y-2">
          <p class="text-xs text-slate-500">คัดลอกข้อความหลายบรรทัดจาก PDF Statement แล้ววางที่นี่ ข้อมูลยอดคงเหลือและเลขบัญชีจะไม่ถูกนำไปบันทึก</p>
          <textarea id="ex-statement-text" rows="5" class="input w-full text-xs" placeholder="วางข้อความ Statement ที่นี่..."></textarea>
          <div class="flex flex-wrap items-center justify-between gap-2"><p id="ex-statement-status" class="text-xs text-slate-500" aria-live="polite"></p><button type="button" id="ex-statement-parse" class="btn btn-primary !py-2 !px-3 text-xs">ประมวลผลข้อความ Statement</button></div>
        </div>
      </details>
      <div class="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button type="button" data-ex-type="expense" class="py-2 rounded-xl text-xs font-semibold transition">รายจ่าย (Expense)</button>
        <button type="button" data-ex-type="income" class="py-2 rounded-xl text-xs font-semibold transition">รายรับ (Income)</button>
      </div>

      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-2.5">
          <div><label class="lbl">จำนวนเงิน (บาท) *</label><input id="ex-amount" type="number" step="0.01" min="0" inputmode="decimal" class="input" placeholder="0.00"></div>
          <div><label class="lbl">หมวดหมู่</label><select id="ex-category" class="input"></select></div>
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          <div><label class="lbl">วันที่ *</label><input id="ex-date" type="date" class="input"></div>
          <div><label class="lbl">เวลา</label><input id="ex-time" type="time" class="input"></div>
        </div>
        <details id="ex-optional-fields" class="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
          <summary class="cursor-pointer text-xs font-semibold text-slate-700 select-none">ตัวเลือกเพิ่มเติม · ร้านค้าและหมายเหตุ</summary>
          <div class="mt-3 space-y-3">
            <div><label class="lbl" for="ex-merchant">ผู้รับเงิน / ร้านค้า / ที่มา</label><input id="ex-merchant" class="input" placeholder="เช่น 7-Eleven, ค่าอาหาร, เงินเดือน"></div>
            <div><label class="lbl" for="ex-note">หมายเหตุ</label><input id="ex-note" class="input" placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"></div>
          </div>
        </details>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" id="ex-cancel" class="btn btn-ghost hidden">ยกเลิกแก้ไข</button>
        <button type="button" id="ex-save" class="btn btn-primary">${iconSvg('check', { size: 15 })} บันทึกรายการ</button>
      </div>
    </section>
  </div>

  <div class="lg:col-span-2 space-y-4">
    <section class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('overview', { size: 17, className: 'text-brand' })}<span>สรุปประจำเดือน</span></h3>
        <input id="ex-month" type="month" class="input !w-auto !py-1.5 text-xs">
      </div>
      <div id="ex-summary" class="grid grid-cols-3 gap-2.5"></div>
      <div id="ex-breakdown" class="space-y-1.5 pt-1"></div>
      <div class="border-t border-slate-100 pt-3 space-y-2">
        <div class="flex items-center justify-between gap-2"><h4 class="text-sm font-bold text-slate-700">งบรายจ่ายตามหมวด</h4><button type="button" id="ex-budget-edit" class="btn btn-soft !py-1.5 !px-3 !min-h-8 text-xs">ตั้งงบ</button></div>
        <div id="ex-budget-list" class="space-y-2"></div>
      </div>
    </section>

    <section class="card space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div><h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('repeat', { size: 17, className: 'text-brand' })}<span>รายจ่ายประจำ</span></h3><p class="text-xs text-slate-500">ถึงกำหนดแล้วจะรอให้คุณยืนยันก่อนบันทึก</p></div>
        <button type="button" id="ex-recurring-add" class="btn btn-primary !py-1.5 !px-3 text-xs">เพิ่มรายการ</button>
      </div>
      <div id="ex-recurring-list" class="space-y-2"></div>
    </section>

    <section id="ex-pending-card" class="card space-y-3 hidden">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-bold text-slate-800">กล่องรอตรวจ Statement <span id="ex-pending-count" class="text-xs text-slate-500"></span></h3>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" id="ex-pending-clear" class="btn btn-ghost !py-2 !px-3 text-xs text-rose-600">ล้างกล่องรอตรวจ</button>
          <button type="button" id="ex-pending-import" class="btn btn-primary !py-2 text-xs">ยืนยันนำเข้าที่เลือกทั้งหมด</button>
        </div>
      </div>
      <div id="ex-pending-list" class="space-y-2"></div>
    </section>
    <section class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('report', { size: 17, className: 'text-brand' })}<span>ประวัติรายรับ-รายจ่าย</span></h3>
        <div class="flex items-center gap-2">
          <span id="ex-count" class="text-xs text-slate-500"></span>
          <button type="button" id="ex-export-csv" class="btn btn-soft !py-1.5 !px-3 !min-h-9 text-xs">${iconSvg('csv', { size: 14 })} ส่งออก CSV</button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input id="ex-search" class="input text-xs" placeholder="🔍 ค้นหาร้านค้า / โน้ต">
        <select id="ex-filter-type" class="input text-xs">
          <option value="all">ทุกประเภท</option>
          <option value="expense">เฉพาะรายจ่าย</option>
          <option value="income">เฉพาะรายรับ</option>
        </select>
        <select id="ex-filter-cat" class="input text-xs"><option value="">ทุกหมวดหมู่</option></select>
      </div>
      <div id="ex-list" class="space-y-2"></div>
    </section>
  </div>`;

  $r('#ex-date').value = today;
  $r('#ex-time').value = nowTimeStr();
  $r('#ex-month').value = selectedMonth;

  updateTypeUi();

  root.addEventListener('click', async e => {
    const typeBtn = e.target.closest('[data-ex-type]');
    if (typeBtn) {
      txType = typeBtn.dataset.exType === 'income' ? 'income' : 'expense';
      manualCategoryTouched = false;
      updateTypeUi();
      applyManualCategorySuggestion();
      return;
    }
    if (e.target.closest('#ex-budget-edit')) {
      openExpenseBudgetEditor();
      return;
    }
    if (e.target.closest('#ex-recurring-add')) {
      openRecurringEditor();
      return;
    }
    const recurringAdopt = e.target.closest('[data-recurring-adopt]');
    if (recurringAdopt) {
      const candidate = analyzedRecurringCandidates[Number(recurringAdopt.dataset.recurringAdopt)];
      if (candidate) {
        openRecurringEditor({
          merchant: candidate.merchant,
          amount: candidate.avgAmount,
          category: EXPENSE_CATEGORIES.includes(candidate.category) ? candidate.category : 'บิล/ค่าใช้จ่ายประจำ',
          frequency: 'monthly',
          nextDate: candidate.predictedNextDate,
          dayOfMonth: candidate.dayOfMonth,
          note: `วิเคราะห์จากประวัติ ${candidate.monthsCount} เดือน`
        }, { isEdit: false });
      }
      return;
    }
    const recurringEdit = e.target.closest('[data-recurring-edit]');
    if (recurringEdit) {
      const plan = recurringExpenses.find(item => item.planId === recurringEdit.dataset.recurringEdit);
      if (plan) openRecurringEditor(plan, { isEdit: true });
      return;
    }
    const recurringDelete = e.target.closest('[data-recurring-delete]');
    if (recurringDelete) {
      const plan = recurringExpenses.find(item => item.planId === recurringDelete.dataset.recurringDelete);
      if (plan && confirm(`ลบรายการประจำ “${plan.merchant}” หรือไม่? รายการที่บันทึกไปแล้วจะไม่ถูกลบ`)) deleteRecurringPlan(plan);
      return;
    }
    const recurringRecord = e.target.closest('[data-recurring-record]');
    if (recurringRecord) {
      const plan = recurringExpenses.find(item => item.planId === recurringRecord.dataset.recurringRecord);
      if (plan && confirm(`ยืนยันบันทึกรายจ่าย “${plan.merchant}” จำนวน ${fmtMoney(plan.amount)} ฿ สำหรับวันที่ ${fmtDate(plan.nextDate)} หรือไม่?`)) {
        recordRecurringExpense(plan);
      }
      return;
    }
    const pendingRemove = e.target.closest('[data-pending-remove]');
    if (pendingRemove) {
      const removeId = pendingRemove.dataset.pendingRemove;
      pendingStatement = pendingStatement.filter(x => x.id !== removeId);
      renderPendingStatement();
      if (!pendingStatement.length && $r('#ex-statement-status')) $r('#ex-statement-status').textContent = '';
      toast('ลบรายการออกจากกล่องรอตรวจแล้ว');
      return;
    }
    const editBtn = e.target.closest('[data-ex-edit]');
    if (editBtn) {
      const hit = (state.expenses || []).find(x => x.id === editBtn.dataset.exEdit);
      if (hit) startEdit(hit);
      return;
    }
    const delBtn = e.target.closest('[data-ex-del]');
    if (delBtn) {
      if (guardPreviewWrite('การลบรายรับ-รายจ่าย')) return;
      const id = delBtn.dataset.exDel;
      const hit = (state.expenses || []).find(x => x.id === id);
      if (!hit || !confirm(`ลบรายการ “${hit.merchant || hit.category} (${fmtMoney(hit.amount)} ฿)” ?`)) return;
      try {
        const deleted = await deleteTransactionRecord(hit.id, hit.date);
        if (!deleted) return;
        if (editing?.id === hit.id) resetForm();
        toast('ลบรายการแล้ว');
      } catch (err) {
        toast('ลบไม่สำเร็จ: ' + err.message, 'err');
      }
    }
  });

  $r('#ex-slip-file').addEventListener('change', async e => {
    const input = e.target;
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length) return;
    if (files.length === 1) await runSlipScan(files[0]);
    else await runMultiSlipScan(files);
  });

  $r('#ex-save').addEventListener('click', saveManualForm);
  $r('#ex-category').addEventListener('change', () => { manualCategoryTouched = true; });
  $r('#ex-merchant').addEventListener('input', applyManualCategorySuggestion);
  $r('#ex-note').addEventListener('input', applyManualCategorySuggestion);
  $r('#ex-statement-parse').addEventListener('click', processStatementPaste);
  $r('#ex-pending-clear').addEventListener('click', clearPendingStatement);
  $r('#ex-pending-import').addEventListener('click', importSelectedStatementItems);
  $r('#ex-pending-list').addEventListener('change', e => {
    const row = e.target.closest('[data-pending-id]'); if (!row) return;
    const item = pendingStatement.find(x => x.id === row.dataset.pendingId); if (!item) return;
    if (e.target.matches('[data-pending-category]')) {
      item.category = e.target.value;
      item.categoryTouched = true;
    }
    if (e.target.matches('[data-pending-select]')) item.selected = e.target.checked;
  });
  $r('#ex-pending-list').addEventListener('input', e => {
    const row = e.target.closest('[data-pending-id]'); if (!row) return;
    const item = pendingStatement.find(x => x.id === row.dataset.pendingId); if (!item) return;
    if (e.target.matches('[data-pending-merchant]')) {
      item.merchant = e.target.value.slice(0, 120);
      if (!item.categoryTouched && item.type !== 'transfer') {
        const suggested = suggestStatementCategory(item, expenseRules);
        if (suggested) {
          item.category = suggested;
          const catSelect = row.querySelector('[data-pending-category]');
          if (catSelect && [...catSelect.options].some(opt => opt.value === suggested)) catSelect.value = suggested;
        }
      }
    }
    if (e.target.matches('[data-pending-note]')) {
      item.note = e.target.value.slice(0, 200);
    }
  });
  $r('#ex-cancel').addEventListener('click', resetForm);
  $r('#ex-export-csv').addEventListener('click', exportMonthCsv);
  $r('#ex-month').addEventListener('change', () => {
    selectedMonth = $r('#ex-month').value || localDateStr().slice(0, 7);
    renderExpense();
  });
  ['ex-search', 'ex-filter-type', 'ex-filter-cat'].forEach(id => {
    $r('#' + id).addEventListener('input', renderExpense);
    $r('#' + id).addEventListener('change', renderExpense);
  });

  renderExpense();
}

function updateTypeUi() {
  if (!root) return;
  root.querySelectorAll('[data-ex-type]').forEach(b => {
    const active = b.dataset.exType === txType;
    b.className = active
      ? `py-2 rounded-xl text-xs font-semibold transition ${txType === 'income' ? 'bg-ok-soft text-green-800 shadow-sm' : 'bg-white text-rose-700 shadow-sm'}`
      : 'py-2 rounded-xl text-xs font-medium text-slate-500 transition';
  });
  const cats = txType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const cur = $r('#ex-category').value;
  $r('#ex-category').innerHTML = cats.map(c => `<option value="${esc(c)}">${CAT_ICONS[c] || '💸'} ${esc(c)}</option>`).join('');
  if (cats.includes(cur)) $r('#ex-category').value = cur;
}

function applyManualCategorySuggestion() {
  const category = $r('#ex-category');
  const merchant = $r('#ex-merchant')?.value.trim();
  const note = $r('#ex-note')?.value.trim();
  if (!category || manualCategoryTouched || (!merchant && !note)) return;
  const suggestion = suggestExpenseCategory({ type: txType, merchant, note }, expenseRules, EXPENSE_CATEGORIES, INCOME_CATEGORIES, state.expenses || []);
  if (suggestion && [...category.options].some(option => option.value === suggestion)) category.value = suggestion;
}

function clearOcrStatus() {
  const statusEl = root ? $r('#ex-ocr-status') : null;
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'hidden text-xs font-medium';
  }
}

export function resetExpenseToToday() {
  if (!root) return;
  const today = localDateStr();
  selectedMonth = today.slice(0, 7);
  if ($r('#ex-month')) $r('#ex-month').value = selectedMonth;
  if (!editing) {
    if ($r('#ex-date')) $r('#ex-date').value = today;
    if ($r('#ex-time')) $r('#ex-time').value = nowTimeStr();
  }
}

function resetForm() {
  editing = null;
  txType = 'expense';
  manualCategoryTouched = false;
  updateTypeUi();
  $r('#ex-amount').value = '';
  $r('#ex-date').value = localDateStr();
  $r('#ex-time').value = nowTimeStr();
  $r('#ex-merchant').value = '';
  $r('#ex-note').value = '';
  if ($r('#ex-optional-fields')) $r('#ex-optional-fields').open = false;
  $r('#ex-save').innerHTML = `${iconSvg('check', { size: 15 })} บันทึกรายการ`;
  $r('#ex-cancel').classList.add('hidden');
  clearOcrStatus();
}

function startEdit(item) {
  editing = { id: item.id, oldMonth: (item.date || localDateStr()).slice(0, 7) };
  txType = item.type === 'income' ? 'income' : 'expense';
  manualCategoryTouched = true;
  updateTypeUi();
  $r('#ex-amount').value = item.amount ?? '';
  $r('#ex-category').value = item.category || (txType === 'income' ? 'อื่น ๆ' : 'อาหาร');
  $r('#ex-date').value = item.date || localDateStr();
  $r('#ex-time').value = item.time || '';
  $r('#ex-merchant').value = item.merchant || '';
  $r('#ex-note').value = item.note || '';
  if ($r('#ex-optional-fields')) $r('#ex-optional-fields').open = Boolean(item.merchant || item.note);
  $r('#ex-save').innerHTML = `${iconSvg('save', { size: 15 })} บันทึกการแก้ไข`;
  $r('#ex-cancel').classList.remove('hidden');
  root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveManualForm() {
  const amount = Number($r('#ex-amount').value);
  const date = $r('#ex-date').value;
  if (!Number.isFinite(amount) || amount <= 0) return toast('กรอกจำนวนเงินให้ถูกต้องก่อนค่ะ', 'err');
  if (!date) return toast('เลือกวันที่ก่อนค่ะ', 'err');

  const record = {
    id: editing ? editing.id : 'ex' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    type: txType,
    amount: Math.round(amount * 100) / 100,
    category: $r('#ex-category').value || 'อื่น ๆ',
    date,
    ...($r('#ex-time').value && { time: $r('#ex-time').value }),
    merchant: $r('#ex-merchant').value.trim().slice(0, 120),
    note: $r('#ex-note').value.trim().slice(0, 200),
    source: 'manual',
    createdAt: new Date().toISOString()
  };

  try {
    if (!saveTransactionRecord(record, editing)) return;
    if (record.type === 'expense' && record.merchant) {
      rememberExpenseRules([{ keyword: record.merchant, category: record.category }]);
    }
    toast(editing ? 'อัปเดตรายการแล้ว' : (txType === 'income' ? 'บันทึกรายรับแล้ว 💰' : 'บันทึกรายจ่ายแล้ว 💸'));
    resetForm();
    if ($r('#ex-month')) $r('#ex-month').value = selectedMonth;
  } catch (err) {
    toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
  }
}

async function runSlipScan(file) {
  const statusEl = root ? $r('#ex-ocr-status') : null;
  if (statusEl) {
    statusEl.className = 'text-xs text-brand-dark font-medium';
    statusEl.textContent = 'กำลังเริ่มสแกนสลิปในเครื่อง…';
  }
  try {
    const { parsed } = await ocrSlipInBrowser(file, msg => {
      if (statusEl && statusEl.isConnected) statusEl.textContent = msg;
    });
    if (statusEl && statusEl.isConnected) {
      statusEl.className = 'text-xs text-green-700 font-semibold';
      statusEl.textContent = `✓ อ่านสลิปเสร็จแล้ว${parsed.amount ? ` (${fmtMoney(parsed.amount)} ฿)` : ''} — กรุณาตรวจสอบก่อนบันทึก`;
    }
    openSlipConfirmModal(parsed);
  } catch (err) {
    if (statusEl && statusEl.isConnected) {
      statusEl.className = 'text-xs text-rose-600 font-medium';
      statusEl.textContent = 'อ่านสลิปไม่สำเร็จ: ' + (err.message || 'กรุณาลองใหม่อีกครั้ง');
    }
    toast('อ่านสลิปไม่สำเร็จ: ' + (err.message || 'กรุณาลองใหม่อีกครั้ง'), 'err');
  }
}

async function runMultiSlipScan(files) {
  const statusEl = root ? $r('#ex-ocr-status') : null;
  if (statusEl) {
    statusEl.className = 'text-xs text-brand-dark font-medium';
    statusEl.textContent = `อัปโหลด ${files.length} รูป · กำลังเตรียมอ่านสลิป 1/${files.length} (0%)…`;
  }
  try {
    const results = await ocrMultipleSlipsInBrowser(files, msg => {
      if (statusEl && statusEl.isConnected) statusEl.textContent = msg;
    });
    const okCount = results.filter(x => x.parsed).length;
    if (statusEl && statusEl.isConnected) {
      statusEl.className = okCount ? 'text-xs text-green-700 font-semibold' : 'text-xs text-rose-600 font-medium';
      statusEl.textContent = okCount
        ? `✓ ประมวลผลครบ ${files.length}/${files.length} รูป (อ่านได้ ${okCount} ใบ) — ตรวจสอบและยืนยัน`
        : 'ไม่สามารถอ่านข้อมูลจากสลิปที่เลือกได้';
    }
    if (okCount) openBatchSlipsConfirmModal(results);
    else toast('อ่านสลิปไม่สำเร็จ กรุณาลองภาพที่ชัดขึ้น', 'err');
  } catch (err) {
    if (statusEl && statusEl.isConnected) {
      statusEl.className = 'text-xs text-rose-600 font-medium';
      statusEl.textContent = 'อ่านสลิปไม่สำเร็จ: ' + (err.message || 'กรุณาลองใหม่อีกครั้ง');
    }
    toast('อ่านสลิปไม่สำเร็จ: ' + (err.message || 'กรุณาลองใหม่อีกครั้ง'), 'err');
  }
}

function openBatchSlipsConfirmModal(results) {
  const okItems = results.filter(r => r.parsed);
  const failedItems = results.filter(r => !r.parsed);
  const m = openModal(`
    <div class="flex justify-between items-center mb-2">
      <h3 class="font-bold text-lg text-slate-800 inline-flex items-center gap-2">${iconSvg('report', { size: 17, className: 'text-brand' })}<span>ตรวจสอบสลิปหลายใบ (${okItems.length} ใบ)</span></h3>
      <button data-close class="text-slate-400" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <p class="text-xs text-green-700 font-semibold bg-ok-soft rounded-xl px-3 py-2 mb-3">
      ประมวลผล OCR บนเครื่องเสร็จสิ้น ${okItems.length} ใบ และล้างรูปภาพออกจากหน่วยความจำแล้ว
    </p>
    ${failedItems.length ? `<div class="rounded-xl bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700 mb-3">${failedItems.map(x => `<p>• ${esc(x.fileName)}: ${esc(x.error || 'อ่านไม่สำเร็จ')}</p>`).join('')}</div>` : ''}
    <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      ${okItems.map(({ fileName, parsed }, idx) => `
        <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 space-y-2" data-ms-row="${idx}">
          <label class="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <span class="flex items-center gap-2"><input type="checkbox" class="ms-chk" checked> สลิป ${idx + 1} (${esc(fileName)})</span>
            <span class="text-[11px] ${parsed.amount ? 'text-green-700' : 'text-amber-700'}">${parsed.amount ? `${fmtMoney(parsed.amount)} ฿` : 'กรุณากรอกยอดเงิน'}</span>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="lbl">ยอดเงิน (บาท) *</label><input type="number" step="0.01" min="0" inputmode="decimal" class="input ms-amt text-xs font-bold text-rose-700" value="${parsed.amount ?? ''}" placeholder="0.00"></div>
            <div><label class="lbl">หมวดหมู่</label><select class="input ms-cat text-xs">${EXPENSE_CATEGORIES.map(c => `<option value="${esc(c)}" ${c === parsed.category ? 'selected' : ''}>${CAT_ICONS[c] || '💸'} ${esc(c)}</option>`).join('')}</select></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="lbl">วันที่โอน</label><input type="date" class="input ms-date text-xs" value="${esc(parsed.date || localDateStr())}"></div>
            <div><label class="lbl">เวลา</label><input type="time" class="input ms-time text-xs" value="${esc(parsed.time || nowTimeStr())}"></div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input class="input ms-merchant text-xs" value="${esc(parsed.merchant || '')}" placeholder="ผู้รับเงิน / ร้านค้า">
            <input class="input ms-note text-xs" value="${esc(parsed.note || '')}" placeholder="หมายเหตุ (ไม่บังคับ)">
          </div>
          ${parsed.rawText ? `<details class="text-[11px] text-slate-500"><summary class="cursor-pointer">ดูข้อความ OCR</summary><pre class="mt-1 whitespace-pre-wrap max-h-24 overflow-y-auto">${esc(parsed.rawText)}</pre></details>` : ''}
        </div>`).join('')}
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <button type="button" data-close class="btn btn-ghost">ยกเลิก</button>
      <button type="button" id="ms-confirm" class="btn btn-primary">${iconSvg('check', { size: 15 })} ยืนยันบันทึกรายจ่ายทั้งหมด</button>
    </div>`, { wide: true });

  $('#ms-confirm', m.el).addEventListener('click', async () => {
    const rows = [...m.el.querySelectorAll('[data-ms-row]')];
    const records = [];
    for (const row of rows) {
      if (!row.querySelector('.ms-chk')?.checked) continue;
      const amount = Number(row.querySelector('.ms-amt').value);
      const date = row.querySelector('.ms-date').value || localDateStr();
      if (!Number.isFinite(amount) || amount <= 0) return toast('ตรวจสอบยอดเงินในสลิปที่เลือกให้ถูกต้องก่อนบันทึก', 'err');
      const time = row.querySelector('.ms-time').value;
      records.push({
        id: 'ex' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: 'expense',
        amount: Math.round(amount * 100) / 100,
        category: row.querySelector('.ms-cat').value || 'อื่น ๆ',
        date,
        ...(time && { time }),
        merchant: row.querySelector('.ms-merchant').value.trim().slice(0, 120),
        note: row.querySelector('.ms-note').value.trim().slice(0, 200),
        source: 'slip_ocr',
        createdAt: new Date().toISOString()
      });
    }
    if (!records.length) return toast('เลือกอย่างน้อย 1 สลิปก่อนบันทึก', 'err');
    if (guardPreviewWrite('การบันทึกสลิปหลายรายการ')) return;

    const btn = $('#ms-confirm', m.el);
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      const saved = await saveBatchExpenseRecords(records);
      if (!saved) return;
      const learnedRules = records
        .filter(r => r.type === 'expense' && r.merchant && r.category && r.category !== 'อื่น ๆ')
        .map(r => ({ keyword: r.merchant.slice(0, 80), category: r.category }));
      if (learnedRules.length && state.uid) rememberExpenseRules(learnedRules);
      selectedMonth = records[0].date.slice(0, 7);
      if ($r('#ex-month')) $r('#ex-month').value = selectedMonth;
      const totalAmt = records.reduce((s, x) => s + x.amount, 0);
      toast(`บันทึกรายจ่าย ${records.length} สลิป (${fmtMoney(totalAmt)} บาท) แล้ว`);
      clearOcrStatus();
      m.close();
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `${iconSvg('check', { size: 15 })} ยืนยันบันทึกรายจ่ายทั้งหมด`;
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
    }
  });
}

export function openSlipConfirmModal(parsed) {
  const m = openModal(`
    <div class="flex justify-between items-center mb-2">
      <h3 class="font-bold text-lg text-slate-800 inline-flex items-center gap-2">${iconSvg('report', { size: 17, className: 'text-brand' })}<span>ตรวจสอบสลิปก่อนบันทึก</span></h3>
      <button data-close class="text-slate-400" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <p class="text-xs text-green-800 bg-ok-soft rounded-xl px-3 py-2 mb-3">
      ประมวลผล OCR บนเครื่องของคุณเท่านั้น และล้างรูปภาพออกจากหน่วยความจำแล้ว — บันทึกเฉพาะข้อความ/ตัวเลขเป็น <b>รายจ่าย (Expense)</b>
    </p>
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2.5">
        <div>
          <label class="lbl">ยอดเงินที่อ่านได้ (บาท) *</label>
          <input id="sl-amount" type="number" step="0.01" min="0" inputmode="decimal" class="input font-bold text-rose-700" value="${parsed.amount ?? ''}" placeholder="0.00">
        </div>
        <div>
          <label class="lbl">หมวดหมู่รายจ่าย</label>
          <select id="sl-category" class="input">${EXPENSE_CATEGORIES.map(c => `<option value="${esc(c)}" ${c === parsed.category ? 'selected' : ''}>${CAT_ICONS[c] || '💸'} ${esc(c)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2.5">
        <div><label class="lbl">วันที่โอน</label><input id="sl-date" type="date" class="input" value="${esc(parsed.date || localDateStr())}"></div>
        <div><label class="lbl">เวลา</label><input id="sl-time" type="time" class="input" value="${esc(parsed.time || nowTimeStr())}"></div>
      </div>
      <div>
        <label class="lbl">ผู้รับเงิน / ร้านค้า</label>
        <input id="sl-merchant" class="input" value="${esc(parsed.merchant || '')}" placeholder="ระบุชื่อร้านค้าหรือผู้รับเงิน">
      </div>
      <div>
        <label class="lbl">หมายเหตุ / บันทึกช่วยจำ</label>
        <input id="sl-note" class="input" value="${esc(parsed.note || '')}" placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)">
      </div>
      ${parsed.rawText ? `<details class="rounded-xl bg-slate-50 border border-slate-200 p-2 text-xs">
        <summary class="cursor-pointer text-slate-600 font-medium">ดูข้อความที่อ่านได้จากสลิป (OCR)</summary>
        <pre class="mt-2 whitespace-pre-wrap text-[11px] text-slate-500 max-h-32 overflow-y-auto">${esc(parsed.rawText)}</pre>
      </details>` : ''}
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" data-close class="btn btn-ghost">ยกเลิก</button>
        <button type="button" id="sl-confirm" class="btn btn-primary">${iconSvg('check', { size: 15 })} ยืนยันบันทึกรายจ่าย</button>
      </div>
    </div>`, { wide: true });

  const amountInp = $('#sl-amount', m.el);
  if (!parsed.amount) amountInp.focus();

  $('#sl-confirm', m.el).addEventListener('click', async () => {
    const amount = Number($('#sl-amount', m.el).value);
    const date = $('#sl-date', m.el).value || localDateStr();
    if (!Number.isFinite(amount) || amount <= 0) return toast('กรุณากรอกยอดเงินที่ถูกต้อง', 'err');

    const record = {
      id: 'ex' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      type: 'expense',
      amount: Math.round(amount * 100) / 100,
      category: $('#sl-category', m.el).value || 'อื่น ๆ',
      date,
      ...($('#sl-time', m.el).value && { time: $('#sl-time', m.el).value }),
      merchant: $('#sl-merchant', m.el).value.trim().slice(0, 120),
      note: $('#sl-note', m.el).value.trim().slice(0, 200),
      source: 'slip_ocr',
      createdAt: new Date().toISOString()
    };

    if (guardPreviewWrite('การบันทึกสลิป')) return;
    const btn = $('#sl-confirm', m.el);
    btn.disabled = true;
    try {
      const saved = await saveTransactionRecord(record);
      if (!saved) return;
      if (record.merchant && record.category && record.category !== 'อื่น ๆ' && state.uid) {
        rememberExpenseRules([{ keyword: record.merchant.slice(0, 80), category: record.category }]);
      }
      if ($r('#ex-month')) $r('#ex-month').value = selectedMonth;
      toast(`บันทึกรายจ่าย ${fmtMoney(record.amount)} บาท แล้ว 💸`);
      clearOcrStatus();
      m.close();
    } catch (err) {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });
}

let shareHandlingStarted = false;
export async function handleSharedSlipLaunch(showTabFn) {
  if (shareHandlingStarted) return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('shared-slip')) return;
  shareHandlingStarted = true;

  // ลบ query string ออกจาก URL ทันทีเพื่อไม่ให้ทำงานซ้ำเมื่อรีเฟรช
  try {
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);
  } catch (e) {}

  const file = await consumePendingSharedSlip();
  if (!file) return;
  if (typeof showTabFn === 'function') showTabFn('expense');
  toast('กำลังอ่านสลิปที่แชร์เข้ามาในเครื่อง…');
  await runSlipScan(file);
}


function loadExpenseRules() {
  syncExpenseSettings();
  return expenseRules;
}

function suggestStatementCategory(item, rules) {
  return suggestExpenseCategory(item, rules, EXPENSE_CATEGORIES, INCOME_CATEGORIES, state.expenses || [])
    || (item.type === 'transfer' ? 'โอนระหว่างบัญชี' : 'อื่น ๆ');
}

function statementDuplicate(item) {
  const target = new Date(item.date + 'T' + (item.time || '00:00') + ':00').getTime();
  return (state.expenses || []).some(old => {
    if (Number(old.amount) !== Number(item.amount) || old.type !== item.type) return false;
    const dayDiff = Math.abs(new Date(old.date + 'T00:00:00').getTime() - new Date(item.date + 'T00:00:00').getTime());
    if (dayDiff > 86400000) return false;
    if (!old.time) return false;
    return Math.abs(new Date(old.date + 'T' + old.time + ':00').getTime() - target) <= 15 * 60000;
  });
}

function clearPendingStatement() {
  pendingStatement = [];
  renderPendingStatement();
  if ($r('#ex-statement-status')) $r('#ex-statement-status').textContent = '';
  toast('ล้างกล่องรอตรวจ Statement แล้ว');
}

async function processStatementPaste() {
  const input = $r('#ex-statement-text'), status = $r('#ex-statement-status');
  if (!input.value.trim()) return toast('กรุณาวางข้อความ Statement ก่อนค่ะ', 'err');
  const { items, errors } = parseStatementText(input.value);
  input.value = ''; // discard raw statement immediately; only sanitized fields remain in the review queue
  if (!items.length) { status.textContent = 'อ่านไม่พบรายการที่รองรับ (' + errors.length + ' บรรทัด)'; return; }
  const rules = loadExpenseRules();
  pendingStatement = items.map((item, index) => {
    const next = {
      ...item,
      id: 'st' + Date.now().toString(36) + index.toString(36),
      selected: true,
      note: item.note || '',
      categoryTouched: false
    };
    next.category = suggestStatementCategory(next, rules);
    next.duplicate = statementDuplicate(next);
    return next;
  });
  status.textContent = 'อ่านได้ ' + items.length + ' รายการ · ข้าม/อ่านไม่ได้ ' + errors.length + ' บรรทัด';
  renderPendingStatement();
}

function renderPendingStatement() {
  const card = $r('#ex-pending-card'); if (!card) return;
  card.classList.toggle('hidden', !pendingStatement.length);
  $r('#ex-pending-count').textContent = pendingStatement.length ? '(' + pendingStatement.length + ' รายการ)' : '';
  $r('#ex-pending-list').innerHTML = pendingStatement.map(item => {
    const cats = item.type === 'income' ? INCOME_CATEGORIES : item.type === 'transfer' ? ['โอนระหว่างบัญชี'] : EXPENSE_CATEGORIES;
    return '<article data-pending-id="' + esc(item.id) + '" class="rounded-xl border border-slate-200 p-3 space-y-2">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="flex items-start gap-2 min-w-0 flex-1">' +
          '<input type="checkbox" data-pending-select ' + (item.selected ? 'checked' : '') + ' class="mt-1">' +
          '<div class="min-w-0 flex-1 space-y-1">' +
            '<p class="text-xs text-slate-500">' + esc(fmtDate(item.date)) + (item.time ? ' · ' + esc(item.time) + ' น.' : '') + ' · <b class="text-slate-800">' + fmtMoney(item.amount) + ' ฿</b> (' + (item.type === 'income' ? 'รายรับ' : item.type === 'transfer' ? 'โอนเงิน' : 'รายจ่าย') + ')</p>' +
            (item.duplicate ? '<p class="text-xs font-semibold text-amber-700">⚠️ อาจซ้ำกับรายการเดิม</p>' : '') +
          '</div>' +
        '</div>' +
        '<button type="button" data-pending-remove="' + esc(item.id) + '" class="text-xs text-slate-400 hover:text-rose-600 px-1.5 py-0.5 rounded" aria-label="ลบรายการนี้ออกจากกล่องรอตรวจ">✕</button>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
        '<div><label class="lbl !mb-0.5 text-[11px]">ผู้รับเงิน / ร้านค้า / ที่มา</label><input type="text" data-pending-merchant maxlength="120" class="input !py-1.5 text-xs font-semibold" value="' + esc(item.merchant || '') + '" placeholder="แก้ชื่อร้านค้า/ที่มาให้จำง่าย"></div>' +
        '<div><label class="lbl !mb-0.5 text-[11px]">หมวดหมู่</label><select data-pending-category class="input !py-1.5 text-xs">' +
          cats.map(c => '<option value="' + esc(c) + '"' + (c === item.category ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
        '</select></div>' +
      '</div>' +
      '<div><input type="text" data-pending-note maxlength="200" class="input !py-1.5 text-xs" value="' + esc(item.note || '') + '" placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"></div>' +
    '</article>';
  }).join('');
}

async function importSelectedStatementItems() {
  const selected = pendingStatement.filter(x => x.selected);
  if (!selected.length) return toast('กรุณาเลือกรายการที่ต้องการนำเข้าก่อนค่ะ', 'err');
  const records = selected.map(item => ({
    id: 'ex' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    type: item.type,
    amount: item.amount,
    category: item.category,
    date: item.date,
    time: item.time,
    merchant: String(item.merchant || '').trim().slice(0, 120),
    note: String(item.note || '').trim().slice(0, 200),
    source: 'statement',
    createdAt: new Date().toISOString()
  }));
  const rulesToSave = records
    .filter(x => x.type === 'expense' && x.merchant && EXPENSE_CATEGORIES.includes(x.category) && x.category !== 'อื่น ๆ')
    .map(x => ({ keyword: x.merchant.slice(0, 80), category: x.category }));
  if (guardPreviewWrite('การนำเข้า Statement')) return;
  const btn = $r('#ex-pending-import'); btn.disabled = true;
  try {
    const saved = await saveBatchExpenseRecords(records);
    if (!saved) return;
    if (rulesToSave.length && state.uid) {
      rememberExpenseRules(rulesToSave);
    }
    pendingStatement = pendingStatement.filter(x => !x.selected);
    renderPendingStatement();
    if (!pendingStatement.length && $r('#ex-statement-status')) $r('#ex-statement-status').textContent = '';
    if ($r('#ex-month')) $r('#ex-month').value = selectedMonth;
    toast('นำเข้า ' + records.length + ' รายการแล้ว');
  } catch (err) { toast('นำเข้าไม่สำเร็จ: ' + err.message, 'err'); }
  finally { btn.disabled = false; }
}

function renderExpenseBudgets(month) {
  const progress = calculateExpenseBudgets(state.expenses || [], expenseBudgets, month);
  $r('#ex-budget-list').innerHTML = progress.length ? progress.map(item => {
    const over = item.status === 'over';
    const near = item.status === 'near';
    const percent = Math.round((item.spent / item.amount) * 100);
    const tone = over ? 'text-rose-700 bg-rose-500' : near ? 'text-amber-700 bg-amber-500' : 'text-slate-600 bg-brand';
    const message = over ? `เกินงบ ${fmtMoney(item.spent - item.amount)} ฿`
      : near ? `ใกล้ถึงงบ · เหลือ ${fmtMoney(item.remaining)} ฿`
        : `ใช้ไป ${fmtMoney(item.spent)} / ${fmtMoney(item.amount)} ฿`;
    return `<div class="space-y-1 tabular-nums">
      <div class="flex justify-between gap-2 text-xs"><b class="text-slate-700">${CAT_ICONS[item.category] || '💸'} ${esc(item.category)}</b><span class="${tone.split(' ')[0]}">${esc(message)}</span></div>
      <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full ${tone.split(' ')[1]}" style="width:${Math.min(100, percent)}%"></div></div>
    </div>`;
  }).join('') : '<p class="text-xs text-slate-500">ยังไม่ได้ตั้งงบรายหมวดสำหรับเดือนนี้</p>';
}

function openExpenseBudgetEditor() {
  const fields = EXPENSE_CATEGORIES.map((category, index) => `
    <div><label class="lbl">${CAT_ICONS[category] || '💸'} ${esc(category)}</label>
      <input id="ex-budget-${index}" type="number" min="0" max="100000000" step="0.01" inputmode="decimal" class="input" value="${expenseBudgets[category] ?? ''}" placeholder="ไม่ตั้งงบ"></div>`).join('');
  const modal = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">ตั้งงบรายเดือน</h3><button data-close class="text-slate-400" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <p class="text-xs text-slate-500 mb-3">งบใช้กับเดือนที่เลือกในหน้ารายจ่าย และจะแจ้งเตือนเมื่อใช้ถึง 80% หรือเกินงบ</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${fields}</div>
    <div class="flex justify-end gap-2 mt-4"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="ex-budget-save" class="btn btn-primary">บันทึกงบ</button></div>`, { wide: true });

  $('#ex-budget-save', modal.el).addEventListener('click', () => {
    if (!state.uid) return toast('กรุณาเข้าสู่ระบบก่อน', 'err');
    if (guardPreviewWrite('การบันทึกงบประมาณรายเดือน')) return;
    const next = {};
    for (const [index, category] of EXPENSE_CATEGORIES.entries()) {
      const raw = $(`#ex-budget-${index}`, modal.el).value.trim();
      if (!raw) continue;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return toast(`กรุณาตรวจสอบงบของหมวด ${category}`, 'err');
      next[category] = Math.round(amount * 100) / 100;
    }

    const batch = writeBatch(db);
    let writes = 0;
    for (const category of EXPENSE_CATEGORIES) {
      const id = expenseSettingDocId('expense_budget', category);
      if (next[category] && next[category] !== expenseBudgets[category]) {
        const data = { kind: 'expense_budget', category, amount: next[category], updatedAt: new Date().toISOString() };
        batch.set(userDoc(state.uid, 'settings', id), data);
        updateExpenseSetting(id, data);
        writes++;
      } else if (!next[category] && expenseBudgets[category]) {
        batch.delete(userDoc(state.uid, 'settings', id));
        removeExpenseSetting(id);
        writes++;
      }
    }
    modal.close();
    renderExpense();
    if (writes) {
      try {
        batch.commit().catch(err => toast(`บันทึกงบไม่สำเร็จ: ${explainExpenseWriteError(err)}`, 'err'));
      } catch (err) {
        return toast(`บันทึกงบไม่สำเร็จ: ${explainExpenseWriteError(err)}`, 'err');
      }
    }
    toast('บันทึกงบรายเดือนแล้ว');
  });
}

function isValidExpenseDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(`${date}T00:00:00Z`);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function openRecurringEditor(plan = null, { isEdit = Boolean(plan?.planId) } = {}) {
  const planId = (isEdit && plan?.planId) || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const categoryOptions = EXPENSE_CATEGORIES.map(category =>
    `<option value="${esc(category)}"${category === plan?.category ? ' selected' : ''}>${esc(category)}</option>`
  ).join('');
  const modal = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">${isEdit ? 'แก้ไขรายการประจำ' : 'เพิ่มรายการประจำ'}</h3><button data-close class="text-slate-400" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <div class="space-y-3">
      <div><label class="lbl">ร้านค้า / รายการ *</label><input id="ex-recurring-merchant" class="input" maxlength="120" value="${esc(plan?.merchant || '')}" placeholder="เช่น ค่าเช่าบ้าน"></div>
      <div class="grid grid-cols-2 gap-2"><div><label class="lbl">จำนวนเงิน (บาท) *</label><input id="ex-recurring-amount" type="number" min="0" max="100000000" step="0.01" class="input" value="${plan?.amount ?? ''}"></div>
      <div><label class="lbl">หมวดหมู่</label><select id="ex-recurring-category" class="input">${categoryOptions}</select></div></div>
      <div class="grid grid-cols-2 gap-2"><div><label class="lbl">รอบ</label><select id="ex-recurring-frequency" class="input"><option value="monthly"${plan?.frequency !== 'yearly' ? ' selected' : ''}>รายเดือน</option><option value="yearly"${plan?.frequency === 'yearly' ? ' selected' : ''}>รายปี</option></select></div>
      <div><label class="lbl">วันครบกำหนดถัดไป</label><input id="ex-recurring-date" type="date" class="input" value="${esc(plan?.nextDate || localDateStr())}"></div></div>
      <div><label class="lbl">หมายเหตุ (ไม่บังคับ)</label><input id="ex-recurring-note" maxlength="200" class="input" value="${esc(plan?.note || '')}"></div>
    </div>
    <div class="flex justify-end gap-2 mt-4"><button data-close class="btn btn-ghost">ยกเลิก</button><button id="ex-recurring-save" class="btn btn-primary">บันทึกรายการ</button></div>`);

  $('#ex-recurring-save', modal.el).addEventListener('click', () => {
    if (!state.uid) return toast('กรุณาเข้าสู่ระบบก่อน', 'err');
    if (guardPreviewWrite('การบันทึกรายการประจำ')) return;
    const merchant = $('#ex-recurring-merchant', modal.el).value.trim();
    const amount = Number($('#ex-recurring-amount', modal.el).value);
    const category = $('#ex-recurring-category', modal.el).value;
    const frequency = $('#ex-recurring-frequency', modal.el).value;
    const nextDate = $('#ex-recurring-date', modal.el).value;
    if (!merchant) return toast('กรุณากรอกชื่อร้านค้าหรือรายการ', 'err');
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return toast('กรุณากรอกจำนวนเงินให้ถูกต้อง', 'err');
    if (!EXPENSE_CATEGORIES.includes(category) || !['monthly', 'yearly'].includes(frequency) || !isValidExpenseDate(nextDate)) {
      return toast('กรุณาตรวจสอบหมวดหมู่ รอบ และวันที่ครบกำหนด', 'err');
    }
    const dayOfMonth = plan?.nextDate === nextDate && Number.isInteger(plan.dayOfMonth)
      ? plan.dayOfMonth
      : Number(nextDate.slice(-2));
    const data = {
      kind: 'expense_recurring', planId, merchant: merchant.slice(0, 120),
      amount: Math.round(amount * 100) / 100, category, frequency, nextDate, dayOfMonth,
      note: $('#ex-recurring-note', modal.el).value.trim().slice(0, 200),
      createdAt: (isEdit && plan?.createdAt) || new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    const id = expenseSettingDocId('expense_recurring', planId);
    updateExpenseSetting(id, data);
    setDoc(userDoc(state.uid, 'settings', id), data)
      .catch(err => toast(`บันทึกประจำไม่สำเร็จ: ${explainExpenseWriteError(err)}`, 'err'));
    modal.close();
    renderExpense();
    toast(isEdit ? 'อัปเดตรายการประจำแล้ว' : 'เพิ่มรายการประจำแล้ว');
  });
}

function deleteRecurringPlan(plan) {
  if (!state.uid) return toast('กรุณาเข้าสู่ระบบก่อน', 'err');
  if (guardPreviewWrite('การลบรายการประจำ')) return;
  const id = expenseSettingDocId('expense_recurring', plan.planId);
  removeExpenseSetting(id);
  deleteDoc(userDoc(state.uid, 'settings', id))
    .catch(err => toast(`ลบรายการประจำไม่สำเร็จ: ${explainExpenseWriteError(err)}`, 'err'));
  renderExpense();
  toast('ลบรายการประจำแล้ว');
}

function recordRecurringExpense(plan) {
  if (!state.uid) return toast('กรุณาเข้าสู่ระบบก่อน', 'err');
  if (guardPreviewWrite('การบันทึกรายจ่ายประจำ')) return;
  const today = localDateStr();
  if (plan.nextDate > today) return toast('รายการนี้ยังไม่ถึงกำหนด', 'err');
  let nextDate = advanceRecurringDate(plan.nextDate, plan.frequency, plan.dayOfMonth);
  let advances = 0;
  while (nextDate && nextDate <= today && advances < 1200) {
    nextDate = advanceRecurringDate(nextDate, plan.frequency, plan.dayOfMonth);
    advances++;
  }
  if (!nextDate || nextDate <= today) return toast('วันที่หรือรอบของรายการประจำไม่ถูกต้อง', 'err');
  const settingId = expenseSettingDocId('expense_recurring', plan.planId);
  const recordId = expenseSettingDocId('expense_recurring', `${plan.planId}_${plan.nextDate}`).replace('expense_recurring_', 'exr_');
  const record = {
    id: recordId, type: 'expense', amount: plan.amount, category: plan.category,
    date: plan.nextDate, merchant: plan.merchant, note: plan.note || '',
    source: 'recurring', createdAt: new Date().toISOString()
  };
  const updatedPlan = { ...plan, nextDate, updatedAt: new Date().toISOString() };
  const updatedPlanData = {
    kind: 'expense_recurring', planId: updatedPlan.planId, merchant: updatedPlan.merchant,
    amount: updatedPlan.amount, category: updatedPlan.category, frequency: updatedPlan.frequency,
    nextDate: updatedPlan.nextDate, dayOfMonth: updatedPlan.dayOfMonth, note: updatedPlan.note || '',
    createdAt: updatedPlan.createdAt, updatedAt: updatedPlan.updatedAt
  };
  const batch = writeBatch(db);
  batch.set(userDoc(state.uid, 'expense_records', recordId), buildExpensePayload(record));
  batch.set(userDoc(state.uid, 'settings', settingId), updatedPlanData);
  updateExpenseSetting(settingId, updatedPlanData);
  renderExpense();
  try {
    batch.commit().catch(err => toast(`บันทึกรายจ่ายประจำไม่สำเร็จ: ${explainExpenseWriteError(err)}`, 'err'));
  } catch (err) {
    toast(`บันทึกรายจ่ายประจำไม่สำเร็จ: ${explainExpenseWriteError(err)}`, 'err');
    return;
  }
  toast(`ยืนยันและบันทึกรายจ่าย ${plan.merchant} แล้ว`);
}

function getFilteredMonthItems(curMonth) {
  const inMonth = monthItems(curMonth);
  const q = ($r('#ex-search')?.value || '').trim().toLowerCase();
  const fType = $r('#ex-filter-type')?.value || 'all';
  const fCat = $r('#ex-filter-cat')?.value || '';
  return inMonth.filter(x => {
    if (fType !== 'all' && x.type !== fType) return false;
    if (fCat && x.category !== fCat) return false;
    if (q && !`${x.merchant || ''} ${x.note || ''} ${x.category || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function exportMonthCsv() {
  const curMonth = $r('#ex-month')?.value || selectedMonth;
  const rows = getFilteredMonthItems(curMonth);
  if (!rows.length) return toast('ไม่มีรายการในเดือน/ตัวกรองนี้สำหรับส่งออก', 'err');
  const header = ['วันที่', 'เวลา', 'ประเภท', 'หมวดหมู่', 'ร้านค้า/รายการ', 'จำนวนเงิน (บาท)', 'ที่มา', 'หมายเหตุ'];
  const csvRows = [
    header,
    ...rows.map(x => [
      x.date || '',
      x.time || '',
      x.type === 'income' ? 'รายรับ' : x.type === 'transfer' ? 'โอนระหว่างบัญชี' : 'รายจ่าย',
      x.category || '',
      x.merchant || '',
      x.amount ?? 0,
      x.source === 'slip_ocr' ? 'สแกนสลิป' : x.source === 'statement' ? 'Statement' : x.source === 'recurring' ? 'รายการประจำ' : 'จดเอง',
      x.note || ''
    ])
  ];
  downloadFile(`trackme-expenses-${curMonth}.csv`, toCsv(csvRows), 'text/csv');
  toast(`ส่งออก CSV ${rows.length} รายการแล้ว`);
}

export function renderExpense() {
  if (!root?.isConnected) return;

  syncExpenseSettings();
  applyManualCategorySuggestion();
  const curMonth = $r('#ex-month')?.value || selectedMonth;
  const inMonth = monthItems(curMonth);

  const hasMonthItems = inMonth.length > 0;
  const totalIncome = inMonth.filter(x => x.type === 'income').reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalExpense = inMonth.filter(x => x.type === 'expense').reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const net = totalIncome - totalExpense;

  $r('#ex-summary').innerHTML = `
    <div class="rounded-2xl bg-ok-soft/70 p-3 tabular-nums">
      <p class="text-[11px] text-green-800">รายรับ</p>
      <p class="text-base sm:text-lg font-bold text-green-900">${hasMonthItems ? `<span id="ex-sum-inc">+${fmtMoney(totalIncome)}</span> <small class="text-[11px] font-normal">฿</small>` : '<span class="text-sm font-medium text-green-800">ยังไม่มีรายการ</span>'}</p>
    </div>
    <div class="rounded-2xl bg-pink-soft/70 p-3 tabular-nums">
      <p class="text-[11px] text-rose-800">รายจ่าย</p>
      <p class="text-base sm:text-lg font-bold text-rose-900">${hasMonthItems ? `<span id="ex-sum-exp">-${fmtMoney(totalExpense)}</span> <small class="text-[11px] font-normal">฿</small>` : '<span class="text-sm font-medium text-rose-800">ยังไม่มีรายการ</span>'}</p>
    </div>
    <div class="rounded-2xl bg-sky-soft/70 p-3 tabular-nums">
      <p class="text-[11px] text-blue-800">สุทธิ</p>
      <p class="text-base sm:text-lg font-bold ${hasMonthItems ? (net >= 0 ? 'text-blue-900' : 'text-rose-700') : 'text-blue-800'}">${hasMonthItems ? `<span id="ex-sum-net">${net >= 0 ? '+' : '-'}${fmtMoney(Math.abs(net))}</span> <small class="text-[11px] font-normal">฿</small>` : '—'}</p>
    </div>`;

  if (hasMonthItems) {
    const dec = n => (Math.abs(n % 1) > 0.005 ? 2 : 0);
    animateNumberTicker($r('#ex-sum-inc'), totalIncome, { prefix: '+', decimals: dec(totalIncome) });
    animateNumberTicker($r('#ex-sum-exp'), totalExpense, { prefix: '-', decimals: dec(totalExpense) });
    animateNumberTicker($r('#ex-sum-net'), Math.abs(net), { prefix: net >= 0 ? '+' : '-', decimals: dec(net) });
  }

  // สัดส่วนรายจ่ายตามหมวดในเดือนที่เลือก
  const byCat = {};
  inMonth.filter(x => x.type === 'expense').forEach(x => {
    const c = x.category || 'อื่น ๆ';
    byCat[c] = (byCat[c] || 0) + (Number(x.amount) || 0);
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $r('#ex-breakdown').innerHTML = catEntries.length
    ? catEntries.slice(0, 6).map(([c, val]) => {
        const pct = totalExpense ? Math.round((val / totalExpense) * 100) : 0;
        return `<div class="space-y-0.5 text-xs tabular-nums">
          <div class="flex justify-between text-slate-600"><span>${CAT_ICONS[c] || '💸'} ${esc(c)}</span><b>${fmtMoney(val)} ฿ (${round1(pct)}%)</b></div>
          <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full bg-brand/80" style="width:${pct}%"></div></div>
        </div>`;
      }).join('')
    : '<p class="text-xs text-slate-500">ยังไม่มีรายจ่ายในเดือนนี้</p>';
  renderExpenseBudgets(curMonth);
  const today = localDateStr();
  analyzedRecurringCandidates = detectRecurringExpenses(state.expenses || [], recurringExpenses);
  const monthlyEstimate = estimateMonthlyRecurringTotal(recurringExpenses, analyzedRecurringCandidates);

  const estimateBanner = (recurringExpenses.length || analyzedRecurringCandidates.length)
    ? `<div class="rounded-xl bg-lav-soft/60 border border-brand/20 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
        <span class="font-semibold text-slate-700">📌 ประมาณการรายจ่ายซ้ำต่อเดือน: <b class="text-brand-dark text-sm">${fmtMoney(monthlyEstimate.totalMonthly)} ฿/เดือน</b></span>
        <span class="text-slate-500">ตั้งไว้ ${fmtMoney(monthlyEstimate.plannedMonthly)} ฿${monthlyEstimate.detectedMonthly ? ` · วิเคราะห์เพิ่ม ~${fmtMoney(monthlyEstimate.detectedMonthly)} ฿` : ''}</span>
      </div>`
    : '';

  const plannedHtml = recurringExpenses.map(plan => {
      const due = plan.nextDate <= today;
      return `<article class="rounded-xl border ${due ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-slate-50/70'} p-3 flex flex-wrap items-center justify-between gap-2 tabular-nums">
        <div class="min-w-0"><b class="text-sm text-slate-800">${esc(plan.merchant)}</b>
          <p class="text-xs text-slate-500">${esc(plan.category)} · ${fmtMoney(plan.amount)} ฿ · ${plan.frequency === 'yearly' ? 'รายปี' : 'รายเดือน'} · ครบกำหนด ${esc(fmtDate(plan.nextDate))}</p>
          ${due ? '<p class="text-xs font-semibold text-amber-800">ถึงกำหนด — รอการยืนยัน</p>' : ''}
        </div>
        <div class="flex flex-wrap gap-2">
          ${due ? `<button type="button" data-recurring-record="${esc(plan.planId)}" class="btn btn-primary !py-1.5 !px-2.5 text-xs">ยืนยันและบันทึกรายจ่าย</button>` : ''}
          <button type="button" data-recurring-edit="${esc(plan.planId)}" class="btn btn-soft !py-1.5 !px-2.5 text-xs">แก้ไข</button>
          <button type="button" data-recurring-delete="${esc(plan.planId)}" class="btn btn-ghost !py-1.5 !px-2.5 text-xs text-rose-600">ลบ</button>
        </div>
      </article>`;
  }).join('');

  const detectedHtml = analyzedRecurringCandidates.length
    ? `<div class="pt-2 border-t border-slate-100 space-y-2">
        <p class="text-xs font-semibold text-slate-600">🔍 ระบบวิเคราะห์ยอดที่จ่ายซ้ำทุกเดือน (${analyzedRecurringCandidates.length} รายการ)</p>
        ${analyzedRecurringCandidates.map((cand, idx) => `
          <article class="rounded-xl border border-dashed border-sky-300 bg-sky-50/40 p-2.5 flex flex-wrap items-center justify-between gap-2 tabular-nums">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <b class="text-xs sm:text-sm text-slate-800">${esc(cand.merchant)}</b>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">${esc(cand.category)}</span>
              </div>
              <p class="text-[11px] text-slate-500">เฉลี่ย ~<b>${fmtMoney(cand.avgAmount)} ฿/เดือน</b>${cand.isVariable ? ` (${fmtMoney(cand.minAmount)}–${fmtMoney(cand.maxAmount)} ฿)` : ''} · พบ ${cand.monthsCount} เดือน (${esc(cand.months.slice(-3).join(', '))}) · คาดรอบถัดไป ${esc(fmtDate(cand.predictedNextDate))}</p>
            </div>
            <button type="button" data-recurring-adopt="${idx}" class="btn btn-soft !py-1.5 !px-2.5 text-xs shrink-0">+ ตั้งเป็นประจำ</button>
          </article>`).join('')}
      </div>`
    : (!recurringExpenses.length ? '<p class="text-xs text-slate-500">ยังไม่มีรายการประจำ (เมื่อมีรายจ่ายร้านเดิมซ้ำตั้งแต่ 2 เดือนขึ้นไป ระบบจะวิเคราะห์มาให้ที่นี่)</p>' : '');

  $r('#ex-recurring-list').innerHTML = estimateBanner + plannedHtml + detectedHtml;

  // อัปเดตตัวเลือกหมวดหมู่ในตัวกรอง
  const filterCatSel = $r('#ex-filter-cat');
  const prevCat = filterCatSel.value;
  const allCats = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])];
  filterCatSel.innerHTML = '<option value="">ทุกหมวดหมู่</option>' + allCats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (allCats.includes(prevCat)) filterCatSel.value = prevCat;

  const q = ($r('#ex-search')?.value || '').trim().toLowerCase();
  const fType = $r('#ex-filter-type')?.value || 'all';
  const fCat = filterCatSel.value || '';

  const filtered = inMonth.filter(x => {
    if (fType !== 'all' && x.type !== fType) return false;
    if (fCat && x.category !== fCat) return false;
    if (q && !`${x.merchant || ''} ${x.note || ''} ${x.category || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  $r('#ex-count').textContent = `${filtered.length} รายการ`;
  const sorted = filtered.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.time || '').localeCompare(String(a.time || '')));
  const filterActive = Boolean(q || fType !== 'all' || fCat);
  const showAllHistory = filterActive || Boolean($r('#ex-history-more')?.open);
  const renderExpenseRow = x => {
    const isInc = x.type === 'income';
    const isTransfer = x.type === 'transfer';
    return `<article class="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 flex items-center justify-between gap-2 tabular-nums">
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="emoji-bubble emoji-sm" aria-hidden="true">${CAT_ICONS[x.category] || '💸'}</span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-1.5">
            <b class="text-sm text-slate-800 truncate">${esc(x.merchant || x.category)}</b>
            <span class="text-[11px] text-slate-500">· ${esc(x.category)}</span>
            ${x.source === 'slip_ocr' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-soft text-blue-700">สลิป</span>' : ''}
            ${x.source === 'recurring' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">ประจำ</span>' : ''}
          </div>
          <p class="text-[11px] text-slate-500">${esc(fmtDate(x.date))}${x.time ? ` · ${esc(x.time)} น.` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</p>
        </div>
      </div>
      <div class="text-right shrink-0 space-y-1">
        <p class="text-sm font-bold ${isInc ? 'text-green-700' : 'text-rose-700'}">${isInc ? '+' : isTransfer ? '↔ ' : '-'}${fmtMoney(x.amount)} ฿</p>
        <div class="flex justify-end gap-1 text-[11px]">
          <button type="button" data-ex-edit="${esc(x.id)}" class="min-h-[32px] px-2 rounded-lg text-blue-700 hover:bg-sky-soft/70">แก้</button>
          <button type="button" data-ex-del="${esc(x.id)}" class="min-h-[32px] px-2 rounded-lg text-rose-600 hover:bg-rose-50">ลบ</button>
        </div>
      </div>
    </article>`;
  };
  const recent = showAllHistory ? sorted : sorted.slice(0, 5);
  const older = showAllHistory ? [] : sorted.slice(5);
  $r('#ex-list').innerHTML = sorted.length
    ? `${recent.map(renderExpenseRow).join('')}${older.length ? `<details id="ex-history-more" class="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2"><summary class="cursor-pointer text-xs font-semibold text-slate-700 select-none">ดูรายการเก่าทั้งหมด (${older.length})</summary><div class="mt-2 space-y-2">${older.map(renderExpenseRow).join('')}</div></details>` : ''}`
    : `<p class="text-xs text-slate-500 text-center py-6">${hasMonthItems ? 'ไม่มีรายการที่ตรงกับเงื่อนไขการค้นหา' : 'ยังไม่มีรายการรับ-จ่ายในเดือนนี้'}</p>`;
}
