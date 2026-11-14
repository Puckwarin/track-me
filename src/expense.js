// บันทึกรายรับ-รายจ่าย + สแกนสลิปอัตโนมัติ (OCR ในเครื่องเท่านั้น ไม่เก็บรูปภาพลง Firebase)
import { setDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, round1, toast, openModal } from './util.js';
import { ocrSlipInBrowser, consumePendingSharedSlip } from './slipOcr.js';

export const EXPENSE_CATEGORIES = [
  'อาหาร',
  'เครื่องดื่ม/คาเฟ่',
  'ช้อปปิ้ง',
  'เดินทาง',
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

const $r = s => $(s, root);
const fmtMoney = n => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function monthItems(monthStr) {
  return (state.expenses || []).filter(x => (x.date || '').slice(0, 7) === monthStr);
}

async function persistMonth(monthStr, nextItems) {
  if (!state.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  const clean = nextItems
    .slice()
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    .slice(0, 1000);
  await setDoc(userDoc(state.uid, 'settings', `exp_${monthStr}`), {
    kind: 'expense_month',
    month: monthStr,
    items: clean,
    updatedAt: new Date()
  });
}

async function saveTransactionRecord(record, prevEdit = null) {
  const targetMonth = record.date.slice(0, 7);
  if (prevEdit) {
    if (prevEdit.oldMonth === targetMonth) {
      const next = monthItems(targetMonth).map(x => (x.id === prevEdit.id ? record : x));
      await persistMonth(targetMonth, next);
    } else {
      const oldNext = monthItems(prevEdit.oldMonth).filter(x => x.id !== prevEdit.id);
      const newNext = [record, ...monthItems(targetMonth).filter(x => x.id !== record.id)];
      await persistMonth(prevEdit.oldMonth, oldNext);
      await persistMonth(targetMonth, newNext);
    }
  } else {
    const next = [record, ...monthItems(targetMonth)];
    await persistMonth(targetMonth, next);
  }
  selectedMonth = targetMonth;
}

async function deleteTransactionRecord(id, dateStr) {
  const m = (dateStr || localDateStr()).slice(0, 7);
  const next = monthItems(m).filter(x => x.id !== id);
  await persistMonth(m, next);
}

export function mountExpense(el) {
  root = el;
  const today = localDateStr();
  root.innerHTML = `
  <div class="lg:col-span-1 space-y-4">
    <section class="card space-y-4">
      <header class="space-y-1">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-wallet text-brand"></i> รายรับ-รายจ่าย</h2>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-ok-soft text-green-800">🔒 สลิปอ่านเฉพาะในเครื่อง</span>
        </div>
        <p class="text-xs text-slate-500">สแกนสลิปโอนเงินด้วย OCR ฟรีในเบราว์เซอร์ (ไม่มีการอัปโหลดหรือบันทึกรูปภาพลงระบบ)</p>
      </header>

      <div class="rounded-2xl border border-dashed border-brand/40 bg-lav-soft/40 p-3 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label class="btn btn-primary !py-2 !px-3.5 text-xs cursor-pointer">
            <i class="fa-solid fa-camera"></i> 📷 สแกนสลิป (เลือกรูป)
            <input id="ex-slip-file" type="file" accept="image/*" class="hidden">
          </label>
          <span class="text-[11px] text-slate-500">หรือกด แชร์ รูปจากแกลเลอรีเข้า Track Me</span>
        </div>
        <p id="ex-ocr-status" class="hidden text-xs text-brand-dark font-medium"></p>
      </div>

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
        <div><label class="lbl">ผู้รับเงิน / ร้านค้า / ที่มา</label><input id="ex-merchant" class="input" placeholder="เช่น 7-Eleven, ค่าอาหาร, เงินเดือน"></div>
        <div><label class="lbl">หมายเหตุ</label><input id="ex-note" class="input" placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"></div>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" id="ex-cancel" class="btn btn-ghost hidden">ยกเลิกแก้ไข</button>
        <button type="button" id="ex-save" class="btn btn-primary"><i class="fa-solid fa-check"></i> บันทึกรายการ</button>
      </div>
    </section>
  </div>

  <div class="lg:col-span-2 space-y-4">
    <section class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-bold text-slate-800"><i class="fa-solid fa-chart-pie text-brand"></i> สรุปประจำเดือน</h3>
        <input id="ex-month" type="month" class="input !w-auto !py-1.5 text-xs">
      </div>
      <div id="ex-summary" class="grid grid-cols-3 gap-2.5"></div>
      <div id="ex-breakdown" class="space-y-1.5 pt-1"></div>
    </section>

    <section class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-bold text-slate-800"><i class="fa-solid fa-receipt text-brand"></i> ประวัติรายรับ-รายจ่าย</h3>
        <span id="ex-count" class="text-xs text-slate-500"></span>
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
      updateTypeUi();
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
      const id = delBtn.dataset.exDel;
      const hit = (state.expenses || []).find(x => x.id === id);
      if (!hit || !confirm(`ลบรายการ “${hit.merchant || hit.category} (${fmtMoney(hit.amount)} ฿)” ?`)) return;
      try {
        await deleteTransactionRecord(hit.id, hit.date);
        if (editing?.id === hit.id) resetForm();
        toast('ลบรายการแล้ว');
      } catch (err) {
        toast('ลบไม่สำเร็จ: ' + err.message, 'err');
      }
    }
  });

  $r('#ex-slip-file').addEventListener('change', async e => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await runSlipScan(file);
  });

  $r('#ex-save').addEventListener('click', saveManualForm);
  $r('#ex-cancel').addEventListener('click', resetForm);
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

function resetForm() {
  editing = null;
  txType = 'expense';
  updateTypeUi();
  $r('#ex-amount').value = '';
  $r('#ex-date').value = localDateStr();
  $r('#ex-time').value = nowTimeStr();
  $r('#ex-merchant').value = '';
  $r('#ex-note').value = '';
  $r('#ex-save').innerHTML = '<i class="fa-solid fa-check"></i> บันทึกรายการ';
  $r('#ex-cancel').classList.add('hidden');
}

function startEdit(item) {
  editing = { id: item.id, oldMonth: (item.date || localDateStr()).slice(0, 7) };
  txType = item.type === 'income' ? 'income' : 'expense';
  updateTypeUi();
  $r('#ex-amount').value = item.amount ?? '';
  $r('#ex-category').value = item.category || (txType === 'income' ? 'อื่น ๆ' : 'อาหาร');
  $r('#ex-date').value = item.date || localDateStr();
  $r('#ex-time').value = item.time || '';
  $r('#ex-merchant').value = item.merchant || '';
  $r('#ex-note').value = item.note || '';
  $r('#ex-save').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกการแก้ไข';
  $r('#ex-cancel').classList.remove('hidden');
  root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveManualForm() {
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
    await saveTransactionRecord(record, editing);
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
    statusEl.classList.remove('hidden');
    statusEl.textContent = 'กำลังเริ่มสแกนสลิปในเครื่อง…';
  }
  try {
    const { parsed } = await ocrSlipInBrowser(file, msg => {
      if (statusEl && statusEl.isConnected) statusEl.textContent = msg;
    });
    if (statusEl) statusEl.classList.add('hidden');
    openSlipConfirmModal(parsed);
  } catch (err) {
    if (statusEl && statusEl.isConnected) statusEl.classList.add('hidden');
    toast('อ่านสลิปไม่สำเร็จ: ' + (err.message || 'กรุณาลองใหม่อีกครั้ง'), 'err');
  }
}

export function openSlipConfirmModal(parsed) {
  const m = openModal(`
    <div class="flex justify-between items-center mb-2">
      <h3 class="font-bold text-lg text-slate-800"><i class="fa-solid fa-receipt text-brand mr-1"></i> ตรวจสอบสลิปก่อนบันทึก</h3>
      <button data-close class="text-slate-400" aria-label="ปิด"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <p class="text-xs text-green-800 bg-ok-soft rounded-xl px-3 py-2 mb-3">
      🔒 ประมวลผล OCR บนเครื่องของคุณเท่านั้น และล้างรูปภาพออกจากหน่วยความจำแล้ว — บันทึกเฉพาะข้อความ/ตัวเลขเป็น <b>รายจ่าย (Expense)</b>
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
        <button type="button" id="sl-confirm" class="btn btn-primary"><i class="fa-solid fa-check"></i> ยืนยันบันทึกรายจ่าย</button>
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

    const btn = $('#sl-confirm', m.el);
    btn.disabled = true;
    try {
      await saveTransactionRecord(record);
      if ($r('#ex-month')) $r('#ex-month').value = selectedMonth;
      toast(`บันทึกรายจ่าย ${fmtMoney(record.amount)} บาท แล้ว 💸`);
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

export function renderExpense() {
  if (!root?.isConnected) return;

  const curMonth = $r('#ex-month')?.value || selectedMonth;
  const inMonth = monthItems(curMonth);

  const totalIncome = inMonth.filter(x => x.type === 'income').reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalExpense = inMonth.filter(x => x.type !== 'income').reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const net = totalIncome - totalExpense;

  $r('#ex-summary').innerHTML = `
    <div class="rounded-2xl bg-ok-soft/70 p-3">
      <p class="text-[11px] text-green-800">รายรับ</p>
      <p class="text-base sm:text-lg font-bold text-green-900">+${fmtMoney(totalIncome)} <small class="text-[11px] font-normal">฿</small></p>
    </div>
    <div class="rounded-2xl bg-pink-soft/70 p-3">
      <p class="text-[11px] text-rose-800">รายจ่าย</p>
      <p class="text-base sm:text-lg font-bold text-rose-900">-${fmtMoney(totalExpense)} <small class="text-[11px] font-normal">฿</small></p>
    </div>
    <div class="rounded-2xl bg-sky-soft/70 p-3">
      <p class="text-[11px] text-blue-800">สุทธิ</p>
      <p class="text-base sm:text-lg font-bold ${net >= 0 ? 'text-blue-900' : 'text-rose-700'}">${net >= 0 ? '+' : '-'}${fmtMoney(Math.abs(net))} <small class="text-[11px] font-normal">฿</small></p>
    </div>`;

  // สัดส่วนรายจ่ายตามหมวดในเดือนที่เลือก
  const byCat = {};
  inMonth.filter(x => x.type !== 'income').forEach(x => {
    const c = x.category || 'อื่น ๆ';
    byCat[c] = (byCat[c] || 0) + (Number(x.amount) || 0);
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $r('#ex-breakdown').innerHTML = catEntries.length
    ? catEntries.slice(0, 6).map(([c, val]) => {
        const pct = totalExpense ? Math.round((val / totalExpense) * 100) : 0;
        return `<div class="space-y-0.5 text-xs">
          <div class="flex justify-between text-slate-600"><span>${CAT_ICONS[c] || '💸'} ${esc(c)}</span><b>${fmtMoney(val)} ฿ (${round1(pct)}%)</b></div>
          <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full bg-brand/80" style="width:${pct}%"></div></div>
        </div>`;
      }).join('')
    : '<p class="text-xs text-slate-400">ยังไม่มีรายจ่ายในเดือนนี้</p>';

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
  $r('#ex-list').innerHTML = filtered.length ? filtered.map(x => {
    const isInc = x.type === 'income';
    return `<article class="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="emoji-bubble emoji-sm">${CAT_ICONS[x.category] || '💸'}</span>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-1.5">
            <b class="text-sm text-slate-800 truncate">${esc(x.merchant || x.category)}</b>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">${esc(x.category)}</span>
            ${x.source === 'slip_ocr' ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-soft text-blue-700">สลิป</span>' : ''}
          </div>
          <p class="text-[11px] text-slate-500">${esc(fmtDate(x.date))}${x.time ? ` · ${esc(x.time)} น.` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</p>
        </div>
      </div>
      <div class="text-right shrink-0 space-y-1">
        <p class="text-sm font-bold ${isInc ? 'text-green-700' : 'text-rose-700'}">${isInc ? '+' : '-'}${fmtMoney(x.amount)} ฿</p>
        <div class="flex justify-end gap-1.5 text-[11px]">
          <button type="button" data-ex-edit="${esc(x.id)}" class="text-blue-700 hover:underline">แก้</button>
          <button type="button" data-ex-del="${esc(x.id)}" class="text-rose-500 hover:underline">ลบ</button>
        </div>
      </div>
    </article>`;
  }).join('') : '<p class="text-xs text-slate-400 text-center py-6">ไม่มีรายการที่ตรงกับเงื่อนไข</p>';
}
