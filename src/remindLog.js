import { addDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, addDays, daysBetween, toast } from './util.js';
import { REMIND_OPTIONS, remindLabel } from './period.js';
import { parseSmartReminder, resolveRuleNextDate, addMonthsSafe } from './reminderParser.js';
import { getGeminiKey, getGroqKey, parseReminderWithAI, explainGeminiError } from './nutrition.js';

const KINDS = [
  ['สัตว์เลี้ยง', '🐾 สัตว์เลี้ยง'],
  ['เปลี่ยนของ', '🔄 เปลี่ยนของใช้'],
  ['เอกสาร/ประกัน/ภาษี', '📄 เอกสาร/ภาษี/ประกัน'],
  ['นัดหมาย/อื่น ๆ', '📌 นัดหมาย & อื่น ๆ']
];

const SMART_EXAMPLES = [
  'นัดอาบน้ำน้องหมา ทุกวันเสาร์ที่สามของเดือน แจ้งเตือนก่อนสามวัน',
  'ขูดหินปูนน้องหมาปีหน้าแจ้งเตือนก่อนถึงเวลาสองสัปดาห์',
  'เปลี่ยนผ้าปูวันเดียวกับที่อาบน้ำน้องหมา',
  'ซักผ้าห่มทุกวันเสาร์ที่ไม่ได้พาน้องหมาไปอาบน้ำ'
];

let root;
let editing = null; // { col, id } | null
let currentDraft = null;
let manualOverrides = {};
const selectedKeys = new Set();

const $r = s => $(s, root);

function rawItems() {
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
  return [...fromPet, ...fromRep];
}

function allItems() {
  const base = rawItems();
  const today = localDateStr();
  return base.map(item => {
    if (!item.done && item.rule && ['same_as', 'weekly_except_linked'].includes(item.rule.kind)) {
      const resolved = resolveRuleNextDate(item.rule, base, today, true);
      if (resolved) return { ...item, nextDate: resolved };
    }
    return item;
  }).sort((a, b) => {
    if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
    const da = a.nextDate || a.date || '9999-12-31';
    const db_ = b.nextDate || b.date || '9999-12-31';
    return da.localeCompare(db_);
  });
}

function computeNextForItem(item, fromDate) {
  if (item.rule && item.rule.kind && item.rule.kind !== 'once') {
    const base = rawItems().filter(x => x.uidKey !== item.uidKey);
    const resolved = resolveRuleNextDate(item.rule, base, fromDate, false);
    if (resolved) return resolved;
  }
  if (item.intervalDays && Number(item.intervalDays) > 0) return addDays(fromDate, Number(item.intervalDays));
  if (item.repeatMonths && Number(item.repeatMonths) > 0) return addMonthsSafe(fromDate, Number(item.repeatMonths));
  return null;
}

function repeatText(item) {
  if (item.rule?.summary && item.rule.kind !== 'once') return item.rule.summary;
  if (item.repeatMonths) return item.repeatMonths === 12 ? 'ทุก 1 ปี' : `ทุก ${item.repeatMonths} เดือน`;
  if (item.intervalDays) return `ทุก ${item.intervalDays} วัน`;
  return '';
}

export function mountRemind(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-2 grid grid-cols-1 lg:grid-cols-5 gap-6">
    <section class="card space-y-4 lg:col-span-2 self-start">
      <header>
        <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-wand-magic-sparkles text-brand"></i> บันทึกแจ้งเตือนอัจฉริยะ</h2>
        <p class="text-xs text-slate-500 mt-1">พิมพ์ประโยคเดียวได้เลย ระบบจะแยกชื่อรายการ หมวดหมู่ วันที่ เวลา รอบทำซ้ำ เงื่อนไขเชื่อมโยง และวันเตือนล่วงหน้าให้ทันที</p>
      </header>

      <div class="space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <label for="rm-smart" class="lbl !mb-0">พิมพ์หรือวางข้อความแจ้งเตือน *</label>
          <button id="rm-ai-btn" type="button" class="chip bg-lav-soft text-brand-dark text-[11px] !py-1 hidden"><i class="fa-solid fa-sparkles"></i> ให้ AI ช่วยตีความ</button>
        </div>
        <textarea id="rm-smart" rows="3" class="input min-h-24 text-sm leading-relaxed" placeholder="เช่น นัดอาบน้ำน้องหมา ทุกวันเสาร์ที่สามของเดือน แจ้งเตือนก่อนสามวัน"></textarea>

        <div class="space-y-1">
          <p class="text-[11px] text-slate-400">ตัวอย่างกดลองใช้ได้:</p>
          <div class="flex flex-wrap gap-1.5">
            ${SMART_EXAMPLES.map((ex, i) => `<button type="button" data-rm-ex="${i}" class="text-left text-[11px] rounded-xl bg-slate-100 hover:bg-lav-soft px-2.5 py-1 text-slate-600 transition">${esc(ex)}</button>`).join('')}
          </div>
        </div>
      </div>

      <div id="rm-preview" class="hidden rounded-2xl border border-brand/25 bg-lav-soft/35 p-3 space-y-2 text-xs"></div>

      <details id="rm-adjust-box" class="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs">
        <summary class="cursor-pointer font-semibold text-slate-600">ปรับค่าที่แปลงได้ด้วยตนเอง (ถ้าต้องการ)</summary>
        <div class="grid grid-cols-2 gap-2.5 mt-2.5">
          <div class="col-span-2"><label class="lbl">ชื่อรายการ</label><input id="rm-ov-title" class="input text-xs" placeholder="อัตโนมัติจากข้อความ"></div>
          <div><label class="lbl">หมวดหมู่</label><select id="rm-ov-kind" class="input text-xs"><option value="">อัตโนมัติ</option>${KINDS.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>
          <div><label class="lbl">เตือนล่วงหน้า</label><select id="rm-ov-remind" class="input text-xs"><option value="">อัตโนมัติ</option>${REMIND_OPTIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
          <div><label class="lbl">วันครบกำหนดถัดไป</label><input id="rm-ov-next" type="date" class="input text-xs"></div>
          <div><label class="lbl">เวลา (ถ้ามี)</label><input id="rm-ov-time" type="time" class="input text-xs"></div>
          <div class="col-span-2"><label class="lbl">หมายเหตุเพิ่มเติม</label><input id="rm-ov-note" class="input text-xs" placeholder="คลินิก, รายละเอียด"></div>
        </div>
      </details>

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

  const syncAiBtn = () => {
    const hasKey = Boolean(getGeminiKey() || getGroqKey());
    $r('#rm-ai-btn')?.classList.toggle('hidden', !hasKey);
  };
  syncAiBtn();

  $r('#rm-smart').addEventListener('input', () => {
    manualOverrides = {};
    updateSmartPreview();
  });
  root.addEventListener('click', e => {
    const exBtn = e.target.closest('[data-rm-ex]');
    if (exBtn) {
      $r('#rm-smart').value = SMART_EXAMPLES[Number(exBtn.dataset.rmEx)] || '';
      manualOverrides = {};
      updateSmartPreview();
      $r('#rm-smart').focus();
    }
  });
  ['rm-ov-title', 'rm-ov-kind', 'rm-ov-remind', 'rm-ov-next', 'rm-ov-time', 'rm-ov-note'].forEach(id => {
    $r('#' + id).addEventListener('input', () => {
      manualOverrides[id] = $r('#' + id).value;
      updateSmartPreview(false);
    });
    $r('#' + id).addEventListener('change', () => {
      manualOverrides[id] = $r('#' + id).value;
      updateSmartPreview(false);
    });
  });

  $r('#rm-ai-btn').addEventListener('click', assistWithAI);
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

function updateSmartPreview(reparse = true) {
  if (!root) return;
  const text = $r('#rm-smart').value.trim();
  const box = $r('#rm-preview');
  if (!text) {
    currentDraft = null;
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const existing = rawItems().filter(x => !editing || x.id !== editing.id);
  const parsed = reparse || !currentDraft ? parseSmartReminder(text, existing, localDateStr()) : currentDraft;
  const effective = {
    ...parsed,
    title: (manualOverrides['rm-ov-title'] || '').trim() || parsed.title,
    kind: manualOverrides['rm-ov-kind'] || parsed.kind,
    nextDate: manualOverrides['rm-ov-next'] || parsed.nextDate,
    dueTime: manualOverrides['rm-ov-time'] !== undefined && manualOverrides['rm-ov-time'] !== '' ? manualOverrides['rm-ov-time'] : parsed.dueTime,
    remindDays: manualOverrides['rm-ov-remind'] !== undefined && manualOverrides['rm-ov-remind'] !== '' ? Number(manualOverrides['rm-ov-remind']) : parsed.remindDays,
    note: manualOverrides['rm-ov-note'] !== undefined ? manualOverrides['rm-ov-note'].trim() : (parsed.note || '')
  };
  currentDraft = parsed;

  if (reparse) {
    $r('#rm-ov-title').value = manualOverrides['rm-ov-title'] || '';
    $r('#rm-ov-kind').value = manualOverrides['rm-ov-kind'] || '';
    $r('#rm-ov-remind').value = manualOverrides['rm-ov-remind'] || '';
    $r('#rm-ov-next').value = manualOverrides['rm-ov-next'] || '';
    $r('#rm-ov-time').value = manualOverrides['rm-ov-time'] || '';
  }

  const ruleText = effective.rule?.summary && effective.rule.kind !== 'once'
    ? effective.rule.summary
    : 'แจ้งเตือนครั้งเดียว';
  const unlinkedWarn = (effective.rule?.kind === 'same_as' || effective.rule?.kind === 'weekly_except_linked') && !effective.rule?.linkedId
    ? `<p class="text-[11px] text-amber-800">⚠️ ยังไม่พบรายการ "${esc(effective.rule.linkedQuery || '')}" ที่บันทึกไว้ — บันทึกได้ และระบบจะเชื่อมวันให้อัตโนมัติทันทีที่สร้างรายการนั้น</p>`
    : '';

  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-1">
      <span class="font-bold text-green-700"><i class="fa-solid fa-circle-check mr-1"></i>ระบบเข้าใจว่า:</span>
      <span class="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600">${esc(effective.kind)}</span>
    </div>
    <p class="text-sm font-bold text-slate-800">${esc(effective.title)}</p>
    <div class="flex flex-wrap gap-1.5">
      <span class="rounded-lg bg-white px-2 py-1 text-slate-700">📅 <b>${esc(fmtDate(effective.nextDate))}</b></span>
      ${effective.dueTime ? `<span class="rounded-lg bg-white px-2 py-1 text-blue-700">⏰ <b>${esc(effective.dueTime)} น.</b></span>` : ''}
      <span class="rounded-lg bg-white px-2 py-1 text-brand-dark">🔁 ${esc(ruleText)}</span>
      <span class="rounded-lg bg-white px-2 py-1 text-slate-700">🔔 ${esc(remindLabel(effective.remindDays))}</span>
    </div>
    ${unlinkedWarn}`;
}

async function assistWithAI() {
  const text = $r('#rm-smart').value.trim();
  if (!text) return toast('พิมพ์ข้อความแจ้งเตือนก่อนค่ะ', 'err');
  const btn = $r('#rm-ai-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังวิเคราะห์…';
  try {
    const existing = rawItems().filter(x => !editing || x.id !== editing.id);
    const ai = await parseReminderWithAI(text, localDateStr(), existing.map(x => x.title));
    const localBase = parseSmartReminder(text, existing, localDateStr());
    const validKind = KINDS.some(([v]) => v === ai.kind) ? ai.kind : localBase.kind;
    const ruleKind = ['once', 'interval', 'monthly', 'yearly', 'nth_weekday', 'last_weekday', 'same_as', 'weekly_except_linked'].includes(ai.ruleKind)
      ? ai.ruleKind
      : localBase.rule.kind;
    const rule = {
      kind: ruleKind,
      ...(Number.isInteger(ai.weekday) && ai.weekday >= 0 && ai.weekday <= 6 && { weekday: ai.weekday }),
      ...(Number.isInteger(ai.nth) && ai.nth >= 1 && ai.nth <= 5 && { nth: ai.nth }),
      ...(ai.intervalDays > 0 && { intervalDays: Math.round(ai.intervalDays) }),
      ...(ai.repeatMonths > 0 && { repeatMonths: Math.round(ai.repeatMonths) }),
      ...(ai.linkedQuery && { linkedQuery: ai.linkedQuery }),
      summary: localBase.rule?.summary && ruleKind === localBase.rule?.kind ? localBase.rule.summary : (ai.ruleKind === 'once' ? 'ครั้งเดียว' : ai.ruleKind)
    };
    const resolvedDate = resolveRuleNextDate(rule, existing, localDateStr(), true) || ai.nextDate || localBase.nextDate;
    currentDraft = {
      rawText: text,
      title: ai.title || localBase.title,
      kind: validKind,
      nextDate: resolvedDate,
      dueTime: ai.dueTime || localBase.dueTime || null,
      remindDays: Number.isFinite(ai.remindDays) ? Math.round(ai.remindDays) : localBase.remindDays,
      repeatMonths: ai.repeatMonths || localBase.repeatMonths || null,
      intervalDays: ai.intervalDays || localBase.intervalDays || null,
      rule,
      note: ai.note || ''
    };
    manualOverrides = {};
    updateSmartPreview(false);
    toast('AI แปลงข้อความให้แล้ว ✓');
  } catch (err) {
    toast(explainGeminiError(err), 'err');
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-sparkles"></i> ให้ AI ช่วยตีความ';
    }
  }
}

function resetForm() {
  editing = null;
  currentDraft = null;
  manualOverrides = {};
  $r('#rm-smart').value = '';
  ['rm-ov-title', 'rm-ov-kind', 'rm-ov-remind', 'rm-ov-next', 'rm-ov-time', 'rm-ov-note'].forEach(id => { $r('#' + id).value = ''; });
  $r('#rm-adjust-box').open = false;
  $r('#rm-save').innerHTML = '<i class="fa-solid fa-plus"></i> บันทึกแจ้งเตือน';
  $r('#rm-cancel').classList.add('hidden');
  updateSmartPreview();
}

async function saveForm() {
  const rawText = $r('#rm-smart').value.trim();
  if (!rawText) return toast('พิมพ์ข้อความแจ้งเตือนก่อนค่ะ', 'err');
  if (!currentDraft) updateSmartPreview(true);
  const d = currentDraft;
  const kind = manualOverrides['rm-ov-kind'] || d.kind || 'นัดหมาย/อื่น ๆ';
  const title = (manualOverrides['rm-ov-title'] || '').trim() || d.title || rawText.slice(0, 80);
  const today = localDateStr();
  const nextDate = manualOverrides['rm-ov-next'] || d.nextDate || today;
  const dueTime = (manualOverrides['rm-ov-time'] || d.dueTime || '').trim() || null;
  const remindDays = (manualOverrides['rm-ov-remind'] !== undefined && manualOverrides['rm-ov-remind'] !== '')
    ? Number(manualOverrides['rm-ov-remind'])
    : (d.remindDays ?? 7);
  const note = (manualOverrides['rm-ov-note'] !== undefined ? manualOverrides['rm-ov-note'] : (d.note || '')).trim();

  const isPet = kind === 'สัตว์เลี้ยง';
  const targetCol = isPet ? 'pet_care_records' : 'replacement_records';
  const petId = (state.petProfiles || [])[0]?.id || '';
  const payload = isPet
    ? {
        petId, type: title.slice(0, 80), category: 'สัตว์เลี้ยง',
        date: today, nextDate, ...(dueTime && { dueTime }),
        repeatMonths: d.repeatMonths ?? null, intervalDays: d.intervalDays ?? null,
        remindDays, rawText: rawText.slice(0, 300),
        ...(d.rule && { rule: d.rule }),
        note, done: false, dismissedFor: null
      }
    : {
        name: title.slice(0, 120), category: kind,
        date: today, nextDate, ...(dueTime && { dueTime }),
        repeatMonths: d.repeatMonths ?? null, intervalDays: d.intervalDays ?? null,
        remindDays, rawText: rawText.slice(0, 300),
        ...(d.rule && { rule: d.rule }),
        note, done: false, dismissedFor: null
      };

  try {
    if (editing && editing.col === targetCol) {
      await updateDoc(userDoc(state.uid, targetCol, editing.id), { ...payload, updatedAt: new Date() });
      toast('อัปเดตรายการแล้ว');
    } else {
      await addDoc(userCol(state.uid, targetCol), { ...payload, createdAt: new Date() });
      if (editing && editing.col !== targetCol) {
        await deleteDoc(userDoc(state.uid, editing.col, editing.id));
      }
      toast(editing ? 'ย้ายหมวดและบันทึกแล้ว' : 'บันทึกแจ้งเตือนแล้ว ✓');
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
    const fallbackRaw = [item.title, item.rule?.summary && item.rule.kind !== 'once' ? item.rule.summary : repeatText(item), item.nextDate || ''].filter(Boolean).join(' ');
    $r('#rm-smart').value = item.rawText || fallbackRaw;
    manualOverrides = {
      'rm-ov-title': item.title || '',
      'rm-ov-kind': KINDS.some(([v]) => v === item.kind) ? item.kind : 'นัดหมาย/อื่น ๆ',
      'rm-ov-next': item.nextDate || '',
      'rm-ov-time': item.dueTime || '',
      'rm-ov-remind': String(item.remindDays),
      'rm-ov-note': item.note || ''
    };
    $r('#rm-ov-title').value = manualOverrides['rm-ov-title'];
    $r('#rm-ov-kind').value = manualOverrides['rm-ov-kind'];
    $r('#rm-ov-next').value = manualOverrides['rm-ov-next'];
    $r('#rm-ov-time').value = manualOverrides['rm-ov-time'];
    $r('#rm-ov-remind').value = manualOverrides['rm-ov-remind'];
    $r('#rm-ov-note').value = manualOverrides['rm-ov-note'];
    currentDraft = item.rule ? { ...parseSmartReminder($r('#rm-smart').value, rawItems(), localDateStr()), rule: item.rule } : null;
    updateSmartPreview(!currentDraft);
    $r('#rm-save').innerHTML = '<i class="fa-solid fa-check"></i> บันทึกการแก้ไข';
    $r('#rm-cancel').classList.remove('hidden');
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (btn.dataset.done) {
    const today = localDateStr();
    const baseDate = item.nextDate && item.nextDate > today ? item.nextDate : today;
    const next = computeNextForItem(item, baseDate);
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
    if (q && !`${x.title} ${x.note || ''} ${x.kind} ${x.rawText || ''}`.toLowerCase().includes(q)) return false;
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
            <p class="text-xs text-slate-600 mt-0.5">ทำล่าสุด ${esc(fmtDate(x.date))}${due ? ` · ครบกำหนด <b>${esc(fmtDate(due))}</b>` : ''}${x.dueTime ? ` · ⏰ <b>${esc(x.dueTime)} น.</b>` : ''}${rep ? ` · 🔁 ${esc(rep)}` : ''}</p>
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
  }).join('') : '<p class="text-sm text-slate-400 text-center py-6">ยังไม่มีบันทึกแจ้งเตือน — พิมพ์รายการใหม่ทางด้านซ้ายได้เลย</p>';
}
