import { addDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, addDays, daysBetween, toast } from './util.js';
import { REMIND_OPTIONS, remindLabel } from './period.js';

const KINDS = [
  ['สัตว์เลี้ยง', '🐾 สัตว์เลี้ยง (วัคซีน/เห็บหมัด/หาหมอ)'],
  ['เปลี่ยนของ', '🔄 เปลี่ยนของใช้ (แปรงสีฟัน/ผ้าปู/ไส้กรอง)'],
  ['เอกสาร/ประกัน/ภาษี', '📄 เอกสาร / พ.ร.บ. / ภาษี / ประกัน'],
  ['นัดหมาย/อื่น ๆ', '📌 นัดหมาย & เตือนอื่น ๆ']
];

const SUGGESTIONS = [
  'วัคซีน', 'ยาเห็บหมัด', 'ถ่ายพยาธิ', 'ตรวจสุขภาพ', 'ขูดหินปูน', 'อาบน้ำ/ตัดขน',
  'เปลี่ยนแปรงสีฟัน', 'เปลี่ยนผ้าปูที่นอน', 'เปลี่ยนฟองน้ำล้างจาน', 'เปลี่ยนไส้กรองน้ำ',
  'ต่อ พ.ร.บ.', 'ต่อภาษีรถยนต์', 'ยื่นภาษีเงินได้', 'ต่อประกันสุขภาพ', 'ต่อประกันรถ', 'ต่อบัตร/พาสปอร์ต'
];

const REPEAT_OPTIONS = [
  ['', 'ไม่ทำซ้ำ (ครั้งเดียว)'],
  ['d14', 'ทุก 14 วัน'],
  ['m1', 'ทุก 1 เดือน'],
  ['m2', 'ทุก 2 เดือน'],
  ['m3', 'ทุก 3 เดือน'],
  ['m6', 'ทุก 6 เดือน'],
  ['m12', 'ทุก 1 ปี (12 เดือน)']
];

let root;
let editing = null; // { col, id } | null
const selectedKeys = new Set();

const $r = s => $(s, root);

const addMonths = (dateStr, months) => {
  const d = new Date(`${dateStr}T00:00:00`), day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
};

function computeNext(dateStr, repeatVal, customDays) {
  if (!dateStr) return null;
  if (customDays && Number(customDays) > 0) return addDays(dateStr, Number(customDays));
  if (!repeatVal) return null;
  if (repeatVal.startsWith('d')) return addDays(dateStr, Number(repeatVal.slice(1)));
  if (repeatVal.startsWith('m')) return addMonths(dateStr, Number(repeatVal.slice(1)));
  return null;
}

function encodeRepeat(item) {
  if (item.repeatMonths) return 'm' + item.repeatMonths;
  if (item.intervalDays === 14) return 'd14';
  if (item.intervalDays === 30) return 'm1';
  if (item.intervalDays === 60) return 'm2';
  if (item.intervalDays === 90) return 'm3';
  if (item.intervalDays === 180) return 'm6';
  if (item.intervalDays === 365) return 'm12';
  return '';
}

function repeatText(item) {
  if (item.repeatMonths) return item.repeatMonths === 12 ? 'ทุก 1 ปี' : `ทุก ${item.repeatMonths} เดือน`;
  if (item.intervalDays) return `ทุก ${item.intervalDays} วัน`;
  return '';
}

function allItems() {
  const petName = id => (state.petProfiles || []).find(p => p.id === id)?.name || '';
  const fromPet = (state.petCare || []).map(x => ({
    ...x,
    col: 'pet_care_records',
    uidKey: `pet_care_records:${x.id}`,
    title: x.type || 'ดูแลสัตว์เลี้ยง',
    kind: x.category || 'สัตว์เลี้ยง',
    sub: petName(x.petId),
    remindDays: x.remindDays !== undefined && x.remindDays !== null ? Number(x.remindDays) : 7
  }));
  const fromRep = (state.replacements || []).map(x => ({
    ...x,
    col: 'replacement_records',
    uidKey: `replacement_records:${x.id}`,
    title: x.name || 'รายการเตือน',
    kind: x.category || 'เปลี่ยนของ',
    sub: '',
    remindDays: x.remindDays !== undefined && x.remindDays !== null ? Number(x.remindDays) : 7
  }));
  return [...fromPet, ...fromRep].sort((a, b) => {
    if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
    const da = a.nextDate || a.date || '9999-12-31';
    const db_ = b.nextDate || b.date || '9999-12-31';
    return da.localeCompare(db_);
  });
}

export function mountRemind(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-2 grid grid-cols-1 lg:grid-cols-5 gap-6">
    <section class="card space-y-4 lg:col-span-2 self-start">
      <header>
        <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-thumbtack text-brand"></i> บันทึกแจ้งเตือน</h2>
        <p class="text-xs text-slate-500 mt-1">รวมนัดสัตว์เลี้ยง รอบเปลี่ยนของ ต่อ พ.ร.บ. ยื่นภาษี ต่อประกัน และนัดสำคัญไว้ที่เดียว</p>
      </header>
      <div class="space-y-3">
        <div><label class="lbl">หมวดหมู่</label><select id="rm-kind" class="input">${KINDS.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>
        <div>
          <label class="lbl">ชื่อรายการ / กิจกรรม *</label>
          <input id="rm-title" list="rm-titles" class="input" placeholder="เช่น ยาเห็บหมัด, เปลี่ยนแปรงสีฟัน, ต่อ พ.ร.บ.">
          <datalist id="rm-titles">${SUGGESTIONS.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="lbl">วันที่ทำ / เริ่มต้น</label><input id="rm-date" type="date" class="input"></div>
          <div><label class="lbl">วันครบกำหนด / นัดถัดไป</label><input id="rm-next" type="date" class="input"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="lbl">รอบทำซ้ำ</label><select id="rm-repeat" class="input">${REPEAT_OPTIONS.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>
          <div><label class="lbl">หรือระบุรอบ (วัน)</label><input id="rm-days" type="number" min="1" max="3650" inputmode="numeric" class="input" placeholder="เช่น 90"></div>
        </div>
        <div>
          <label class="lbl">แจ้งเตือนล่วงหน้า</label>
          <select id="rm-remind" class="input">${REMIND_OPTIONS.map(([v, t]) => `<option value="${v}" ${v === 7 ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div><label class="lbl">หมายเหตุ</label><input id="rm-note" class="input" placeholder="เช่น คลินิก, เลขทะเบียน, จำนวนเงิน"></div>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <button id="rm-cancel" type="button" class="btn btn-ghost hidden">ยกเลิกแก้ไข</button>
        <button id="rm-save" class="btn btn-primary"><i class="fa-solid fa-plus"></i> บันทึกแจ้งเตือน</button>
      </div>
    </section>

    <section class="card space-y-4 lg:col-span-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-bold text-slate-800"><i class="fa-solid fa-calendar-check text-brand"></i> รายการที่บันทึกไว้</h3>
        <label class="text-xs text-slate-600 flex items-center gap-1.5 cursor-pointer"><input id="rm-show-done" type="checkbox"> แสดงที่ทำเสร็จแล้ว</label>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input id="rm-search" class="input" placeholder="🔍 ค้นหารายการ...">
        <select id="rm-filter" class="input"><option value="">ทุกหมวดหมู่</option>${KINDS.map(([v]) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="text-slate-500">ช่วงวันครบกำหนด:</span>
        <input id="rm-from" type="date" class="input !w-auto !py-1.5 text-xs" aria-label="ตั้งแต่วันที่">
        <span class="text-slate-400">–</span>
        <input id="rm-to" type="date" class="input !w-auto !py-1.5 text-xs" aria-label="ถึงวันที่">
        <button id="rm-clear-filter" type="button" class="chip bg-slate-100 text-slate-600 hidden">ล้างตัวกรอง</button>
      </div>
      <div id="rm-bulk" class="rounded-xl bg-slate-50 border border-slate-100 p-2.5 flex flex-wrap items-center gap-2 text-xs">
        <label class="flex items-center gap-1.5 cursor-pointer"><input id="rm-sel-all" type="checkbox"> เลือกทั้งหมด (<span id="rm-vis-count">0</span>)</label>
        <span class="text-slate-500">เลือกแล้ว <b id="rm-sel-count">0</b></span>
        <select id="rm-bulk-remind" class="input !w-auto !py-1.5 text-xs">${REMIND_OPTIONS.map(([v, t]) => `<option value="${v}" ${v === 7 ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button id="rm-bulk-apply" type="button" class="chip bg-sky-soft text-blue-700" disabled>ตั้งเตือนรายการที่เลือก</button>
      </div>
      <div id="rm-list" class="space-y-2.5"></div>
    </section>
  </div>`;

  $r('#rm-date').value = localDateStr();
  const syncAutoNext = () => {
    if ($r('#rm-next').dataset.manual === '1') return;
    const next = computeNext($r('#rm-date').value, $r('#rm-repeat').value, $r('#rm-days').value);
    if (next) $r('#rm-next').value = next;
  };
  $r('#rm-kind').addEventListener('change', () => {
    if (!editing && $r('#rm-kind').value === 'เอกสาร/ประกัน/ภาษี') $r('#rm-remind').value = '30';
  });
  $r('#rm-next').addEventListener('input', () => { $r('#rm-next').dataset.manual = $r('#rm-next').value ? '1' : ''; });
  $r('#rm-repeat').addEventListener('change', () => { $r('#rm-days').value = ''; $r('#rm-next').dataset.manual = ''; syncAutoNext(); });
  $r('#rm-days').addEventListener('input', () => { if ($r('#rm-days').value) $r('#rm-repeat').value = ''; $r('#rm-next').dataset.manual = ''; syncAutoNext(); });
  $r('#rm-date').addEventListener('change', syncAutoNext);
  $r('#rm-save').addEventListener('click', saveForm);
  $r('#rm-cancel').addEventListener('click', resetForm);
  $r('#rm-search').addEventListener('input', renderRemind);
  $r('#rm-filter').addEventListener('change', renderRemind);
  $r('#rm-from').addEventListener('change', renderRemind);
  $r('#rm-to').addEventListener('change', renderRemind);
  $r('#rm-clear-filter').addEventListener('click', () => {
    $r('#rm-search').value = '';
    $r('#rm-filter').value = '';
    $r('#rm-from').value = '';
    $r('#rm-to').value = '';
    renderRemind();
  });
  $r('#rm-show-done').addEventListener('change', renderRemind);
  $r('#rm-sel-all').addEventListener('change', e => {
    filteredItems().forEach(x => { if (e.target.checked) selectedKeys.add(x.uidKey); else selectedKeys.delete(x.uidKey); });
    renderRemind();
  });
  $r('#rm-bulk-apply').addEventListener('click', applyBulkRemind);
  $r('#rm-list').addEventListener('change', onListChange);
  $r('#rm-list').addEventListener('click', onListClick);
  renderRemind();
}

function resetForm() {
  editing = null;
  $r('#rm-title').value = '';
  $r('#rm-date').value = localDateStr();
  $r('#rm-next').value = '';
  $r('#rm-next').dataset.manual = '';
  $r('#rm-repeat').value = '';
  $r('#rm-days').value = '';
  $r('#rm-remind').value = '7';
  $r('#rm-note').value = '';
  $r('#rm-save').innerHTML = '<i class="fa-solid fa-plus"></i> บันทึกแจ้งเตือน';
  $r('#rm-cancel').classList.add('hidden');
}

async function saveForm() {
  const kind = $r('#rm-kind').value;
  const title = $r('#rm-title').value.trim();
  const date = $r('#rm-date').value;
  if (!title) return toast('กรอกชื่อรายการก่อนค่ะ', 'err');
  if (!date) return toast('เลือกวันที่ทำ/เริ่มต้นก่อนค่ะ', 'err');
  const repeatVal = $r('#rm-repeat').value;
  const customDays = $r('#rm-days').value ? Number($r('#rm-days').value) : null;
  const repeatMonths = repeatVal.startsWith('m') ? Number(repeatVal.slice(1)) : null;
  const intervalDays = customDays || (repeatVal === 'd14' ? 14 : null);
  const nextDate = $r('#rm-next').value || computeNext(date, repeatVal, customDays) || date;
  const remindDays = Number($r('#rm-remind').value);
  const note = $r('#rm-note').value.trim();

  const isPet = kind === 'สัตว์เลี้ยง';
  const targetCol = isPet ? 'pet_care_records' : 'replacement_records';
  const petId = (state.petProfiles || [])[0]?.id || '';
  const payload = isPet
    ? { petId, type: title.slice(0, 80), category: 'สัตว์เลี้ยง', date, nextDate, repeatMonths, intervalDays, remindDays, note, done: false, dismissedFor: null }
    : { name: title.slice(0, 120), category: kind, date, nextDate, repeatMonths, intervalDays, remindDays, note, done: false, dismissedFor: null };

  try {
    if (editing && editing.col === targetCol) {
      await updateDoc(userDoc(state.uid, targetCol, editing.id), { ...payload, updatedAt: new Date() });
      toast('อัปเดตรายการแล้ว');
    } else {
      await addDoc(userCol(state.uid, targetCol), { ...payload, createdAt: new Date() });
      if (editing && editing.col !== targetCol) {
        await deleteDoc(userDoc(state.uid, editing.col, editing.id));
      }
      toast(editing ? 'ย้ายหมวดและบันทึกแล้ว' : 'บันทึกแจ้งเตือนแล้ว');
    }
    resetForm();
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'err');
  }
}

async function applyBulkRemind() {
  const items = allItems().filter(x => selectedKeys.has(x.uidKey));
  if (!items.length) return;
  const remindDays = Number($r('#rm-bulk-remind').value);
  try {
    for (let i = 0; i < items.length; i += 450) {
      const batch = writeBatch(db);
      items.slice(i, i + 450).forEach(x => batch.update(userDoc(state.uid, x.col, x.id), { remindDays, dismissedFor: null, updatedAt: new Date() }));
      await batch.commit();
    }
    selectedKeys.clear();
    toast(`ตั้งเตือน ${items.length} รายการเป็น “${remindLabel(remindDays)}” แล้ว`);
    renderRemind();
  } catch (e) {
    toast('ตั้งเตือนไม่สำเร็จ: ' + e.message, 'err');
  }
}

async function onListChange(e) {
  const sel = e.target.closest('[data-rm-sel]');
  if (sel) {
    if (sel.checked) selectedKeys.add(sel.dataset.rmSel);
    else selectedKeys.delete(sel.dataset.rmSel);
    renderRemind();
    return;
  }
  const rem = e.target.closest('[data-rm-remind]');
  if (rem) {
    const [col, id] = rem.dataset.rmRemind.split(':');
    const remindDays = Number(rem.value);
    try {
      await updateDoc(userDoc(state.uid, col, id), { remindDays, dismissedFor: null, updatedAt: new Date() });
      toast(`ตั้งเตือนเป็น “${remindLabel(remindDays)}”`);
    } catch (err) {
      toast('อัปเดตไม่สำเร็จ: ' + err.message, 'err');
    }
  }
}

async function onListClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const key = btn.dataset.done || btn.dataset.edit || btn.dataset.del;
  if (!key) return;
  const item = allItems().find(x => x.uidKey === key);
  if (!item) return;

  if (btn.dataset.edit) {
    editing = { col: item.col, id: item.id };
    $r('#rm-kind').value = KINDS.some(([v]) => v === item.kind) ? item.kind : 'นัดหมาย/อื่น ๆ';
    $r('#rm-title').value = item.title;
    $r('#rm-date').value = item.date || localDateStr();
    $r('#rm-next').value = item.nextDate || '';
    $r('#rm-next').dataset.manual = item.nextDate ? '1' : '';
    const rep = encodeRepeat(item);
    $r('#rm-repeat').value = rep;
    $r('#rm-days').value = !rep && item.intervalDays ? item.intervalDays : '';
    $r('#rm-remind').value = String(item.remindDays);
    $r('#rm-note').value = item.note || '';
    $r('#rm-save').innerHTML = '<i class="fa-solid fa-check"></i> บันทึกการแก้ไข';
    $r('#rm-cancel').classList.remove('hidden');
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (btn.dataset.done) {
    const today = localDateStr();
    const rep = encodeRepeat(item);
    const next = computeNext(today, rep, !rep ? item.intervalDays : null);
    try {
      if (next) {
        await updateDoc(userDoc(state.uid, item.col, item.id), { date: today, nextDate: next, done: false, dismissedFor: null, updatedAt: new Date() });
        toast(`บันทึกเรียบร้อย · เลื่อนรอบถัดไปเป็น ${fmtDate(next)}`);
      } else {
        await updateDoc(userDoc(state.uid, item.col, item.id), { done: !item.done, dismissedFor: item.nextDate || today, updatedAt: new Date() });
        toast(item.done ? 'เปิดรายการกลับมาอีกครั้งแล้ว' : 'ทำเครื่องหมายเสร็จสิ้นแล้ว');
      }
    } catch (err) {
      toast('อัปเดตไม่สำเร็จ: ' + err.message, 'err');
    }
    return;
  }

  if (btn.dataset.del && confirm(`ลบรายการ “${item.title}”?`)) {
    selectedKeys.delete(item.uidKey);
    try {
      await deleteDoc(userDoc(state.uid, item.col, item.id));
      if (editing?.id === item.id) resetForm();
      toast('ลบรายการแล้ว');
    } catch (err) {
      toast('ลบไม่สำเร็จ: ' + err.message, 'err');
    }
  }
}

function filteredItems() {
  if (!root) return [];
  const q = ($r('#rm-search')?.value || '').trim().toLowerCase();
  const kind = $r('#rm-filter')?.value || '';
  const from = $r('#rm-from')?.value || '';
  const to = $r('#rm-to')?.value || '';
  const showDone = $r('#rm-show-done')?.checked;
  $r('#rm-clear-filter')?.classList.toggle('hidden', !q && !kind && !from && !to);
  return allItems().filter(x => {
    if (!showDone && x.done) return false;
    if (kind && x.kind !== kind) return false;
    const due = x.nextDate || x.date || '';
    if (from && (!due || due < from)) return false;
    if (to && (!due || due > to)) return false;
    if (q && !`${x.title} ${x.note || ''} ${x.kind}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function renderRemind() {
  if (!root?.isConnected) return;
  const rows = filteredItems();
  const existing = new Set(allItems().map(x => x.uidKey));
  selectedKeys.forEach(k => { if (!existing.has(k)) selectedKeys.delete(k); });

  $r('#rm-vis-count').textContent = rows.length;
  $r('#rm-sel-count').textContent = selectedKeys.size;
  $r('#rm-sel-all').checked = rows.length > 0 && rows.every(x => selectedKeys.has(x.uidKey));
  $r('#rm-sel-all').disabled = rows.length === 0;
  $r('#rm-bulk-apply').disabled = selectedKeys.size === 0;

  const today = localDateStr();
  const iconOf = kind => kind === 'สัตว์เลี้ยง' ? '🐾' : kind === 'เปลี่ยนของ' ? '🔄' : kind === 'เอกสาร/ประกัน/ภาษี' ? '📄' : '📌';

  $r('#rm-list').innerHTML = rows.length ? rows.map(x => {
    const due = x.nextDate;
    const diff = due ? daysBetween(today, due) : null;
    const statusBadge = x.done
      ? '<span class="rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[11px]">เสร็จแล้ว</span>'
      : diff === null ? ''
      : diff < 0 ? `<span class="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-semibold">เลยกำหนด ${-diff} วัน</span>`
      : diff === 0 ? '<span class="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-semibold">ครบกำหนดวันนี้</span>'
      : diff <= Math.max(0, x.remindDays) ? `<span class="rounded-full bg-sky-100 text-sky-800 px-2 py-0.5 text-[11px]">อีก ${diff} วัน</span>`
      : `<span class="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px]">อีก ${diff} วัน</span>`;
    const rep = repeatText(x);
    return `<article class="rounded-2xl border ${!x.done && diff !== null && diff < 0 ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50/60'} p-3 space-y-2">
      <div class="flex items-start justify-between gap-2">
        <label class="flex items-start gap-2.5 min-w-0 cursor-pointer">
          <input type="checkbox" class="mt-1 shrink-0" data-rm-sel="${esc(x.uidKey)}" ${selectedKeys.has(x.uidKey) ? 'checked' : ''}>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-sm font-bold text-slate-800">${iconOf(x.kind)} ${esc(x.title)}</span>
              <span class="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600">${esc(x.kind)}</span>
              ${statusBadge}
            </div>
            <p class="text-xs text-slate-600 mt-0.5">ทำล่าสุด ${esc(fmtDate(x.date))}${due ? ` · ครบกำหนด <b>${esc(fmtDate(due))}</b>` : ''}${rep ? ` · ${esc(rep)}` : ''}</p>
            ${x.note ? `<p class="text-xs text-slate-500 mt-0.5">${esc(x.note)}</p>` : ''}
          </div>
        </label>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] text-slate-500">เตือน:</span>
          <select data-rm-remind="${esc(x.uidKey)}" class="input !w-auto !py-1 !px-2.5 text-xs">${REMIND_OPTIONS.map(([v, t]) => `<option value="${v}" ${x.remindDays === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button data-done="${esc(x.uidKey)}" class="chip bg-ok-soft text-green-800">${rep ? 'ทำแล้ว → รอบถัดไป' : x.done ? 'เปิดอีกครั้ง' : 'ทำเสร็จแล้ว'}</button>
          <button data-edit="${esc(x.uidKey)}" class="chip bg-sky-soft text-blue-700">แก้ไข</button>
          <button data-del="${esc(x.uidKey)}" class="chip bg-pink-soft text-rose-600">ลบ</button>
        </div>
      </div>
    </article>`;
  }).join('') : '<p class="text-sm text-slate-400 text-center py-6">ยังไม่มีบันทึกแจ้งเตือน — เพิ่มรายการใหม่ทางด้านซ้ายได้เลย</p>';
}
