import { updateDoc, writeBatch } from 'firebase/firestore';
import { db, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, daysBetween, toast } from './util.js';
import { periodStats, checkReminder, REMIND_OPTIONS, remindLabel, getPeriodRemindDays, setPeriodRemindDays } from './period.js';
import { syncPeriodRemindToPush } from './push.js';

let root;
const selectedKeys = new Set();

const monthsAfter = (date, months) => {
  const d = new Date(date + 'T00:00:00'), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + months); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
};

// รายการที่มีกำหนดการทั้งหมด (ใช้ทั้งตั้งค่าระยะเตือนรายตัว/หลายตัว และคัดกรองรายการที่ถึงเกณฑ์เตือน)
function trackedSources() {
  const petName = id => (state.petProfiles || []).find(p => p.id === id)?.name || 'สัตว์เลี้ยง';
  const rows = [];

  for (const x of state.petCare || []) {
    if (x.done || !x.nextDate) continue;
    const remindDays = x.remindDays !== undefined && x.remindDays !== null ? Number(x.remindDays) : 7;
    rows.push({
      uidKey: `pet_care_records:${x.id}`,
      col: 'pet_care_records',
      id: x.id,
      date: x.nextDate,
      dueTime: x.dueTime || '',
      remindDays,
      dismissedFor: x.dismissedFor || null,
      icon: '🐾',
      label: `${x.type || 'นัดสัตว์เลี้ยง'} · ${petName(x.petId)}`,
      detail: x.note || 'ตารางนัดและดูแล'
    });
  }

  for (const x of state.replacements || []) {
    if (x.done || !x.nextDate) continue;
    const remindDays = x.remindDays !== undefined && x.remindDays !== null ? Number(x.remindDays) : 7;
    const cat = x.category || 'เปลี่ยนของ';
    const icon = cat === 'เอกสาร/ประกัน/ภาษี' ? '📄' : cat === 'นัดหมาย/อื่น ๆ' ? '📌' : '🔄';
    rows.push({
      uidKey: `replacement_records:${x.id}`,
      col: 'replacement_records',
      id: x.id,
      date: x.nextDate,
      dueTime: x.dueTime || '',
      remindDays,
      dismissedFor: x.dismissedFor || null,
      icon,
      label: `${x.name} · ${cat}`,
      detail: x.note || 'บันทึกแจ้งเตือน'
    });
  }

  for (const p of state.trackedProducts || []) {
    const exp = p.expiryDate || (p.openedDate && p.paoMonths ? monthsAfter(p.openedDate, Number(p.paoMonths)) : p.paoExpiry);
    if (exp) {
      const remindDays = p.remindDays !== undefined && p.remindDays !== null ? Number(p.remindDays) : 30;
      rows.push({
        uidKey: `tracked_products:${p.id}`,
        col: 'tracked_products',
        id: p.id,
        kind: 'exp',
        date: exp,
        remindDays,
        dismissedFor: p.dismissedFor || null,
        icon: '📅',
        label: `${p.name} · ใกล้หมดอายุ`,
        detail: exp < localDateStr() ? 'เลยกำหนดแล้ว' : 'ควรใช้ก่อน'
      });
    }
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

// รายการแจ้งเตือนที่ถึงเกณฑ์เตือนตอนนี้ (ใช้ในกระดิ่ง, หน้า Home, และหน้าแจ้งเตือน)
export function collectReminders() {
  const today = localDateStr();
  const rows = [];

  for (const x of trackedSources()) {
    if (x.remindDays < 0) continue;
    if (x.dismissedFor === x.date) continue;
    if (daysBetween(today, x.date) <= x.remindDays) {
      rows.push(x);
    }
  }

  for (const p of state.trackedProducts || []) {
    if (p.quantity != null && p.lowAt != null && Number(p.quantity) <= Number(p.lowAt) && !p.lowDismissed) {
      rows.push({
        uidKey: `tracked_products:${p.id}:low`,
        col: 'tracked_products',
        id: p.id,
        kind: 'low',
        date: today,
        remindDays: null,
        icon: '📦',
        label: `${p.name} · สต๊อกใกล้หมด`,
        detail: `เหลือ ${p.quantity} ${p.unit || 'หน่วย'}`
      });
    }
  }

  const pLead = getPeriodRemindDays();
  const cycle = periodStats(state.period || []);
  if (pLead >= 0 && cycle?.next && localStorage.getItem('reminder_dismissed') !== cycle.next) {
    const until = daysBetween(today, cycle.next);
    if (until <= pLead && until >= -7) {
      rows.push({
        uidKey: 'period:next',
        col: 'period',
        date: cycle.next,
        remindDays: pLead,
        icon: '🌸',
        label: 'ประจำเดือนใกล้ถึงรอบ',
        detail: until === 0 ? 'คาดว่ามาวันนี้ (ค่าประมาณ)' : until < 0 ? `เลยวันคาดการณ์ ${-until} วัน (ค่าประมาณ)` : `อีก ${until} วัน (ค่าประมาณ)`
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
  return rows;
}

// รายการนัดหมาย/แจ้งเตือนเฉพาะของ "วันนั้นๆ" สำหรับป้ายแจ้งเตือนด้านบนในหน้า Planner
export function remindersForDate(dateStr) {
  const rows = trackedSources().filter(x => x.date === dateStr);
  const pLead = getPeriodRemindDays();
  const cycle = periodStats(state.period || []);
  if (pLead >= 0 && cycle?.next === dateStr) {
    rows.push({
      uidKey: 'period:next',
      col: 'period',
      date: cycle.next,
      dueTime: '',
      icon: '🌸',
      label: 'คาดการณ์รอบเดือน',
      detail: 'ค่าประมาณ'
    });
  }
  return rows.sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
}

export function mountReminders(el) {
  root = el;
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  renderReminders();
}

async function onChange(e) {
  if (e.target.id === 'nt-period-days') {
    setPeriodRemindDays(e.target.value);
    checkReminder();
    syncPeriodRemindToPush();
    renderReminders();
    toast('อัปเดตการเตือนรอบเดือนแล้ว');
    return;
  }
  if (e.target.id === 'nt-sel-all') {
    const srcs = trackedSources();
    srcs.forEach(x => { if (e.target.checked) selectedKeys.add(x.uidKey); else selectedKeys.delete(x.uidKey); });
    renderReminders();
    return;
  }
  const sel = e.target.closest('[data-nt-sel]');
  if (sel) {
    if (sel.checked) selectedKeys.add(sel.dataset.ntSel);
    else selectedKeys.delete(sel.dataset.ntSel);
    renderReminders();
    return;
  }
  const single = e.target.closest('[data-nt-remind]');
  if (single) {
    const [col, id] = single.dataset.ntRemind.split(':');
    const remindDays = Number(single.value);
    try {
      await updateDoc(userDoc(state.uid, col, id), { remindDays, dismissedFor: null, updatedAt: new Date() });
      toast(`ตั้งเตือนเป็น “${remindLabel(remindDays)}”`);
    } catch (err) {
      toast('อัปเดตไม่สำเร็จ: ' + err.message, 'err');
    }
  }
}

async function onClick(e) {
  if (e.target.closest('#nt-notif-perm')) {
    if ('Notification' in window) {
      await Notification.requestPermission();
      renderReminders();
    }
    return;
  }
  if (e.target.closest('#nt-period-dismiss')) {
    const cycle = periodStats(state.period || []);
    if (cycle?.next) {
      localStorage.setItem('reminder_dismissed', cycle.next);
      checkReminder();
      renderReminders();
      toast('ปิดเตือนรอบเดือนรอบนี้แล้ว');
    }
    return;
  }
  if (e.target.closest('#nt-bulk-apply')) {
    const targets = trackedSources().filter(x => selectedKeys.has(x.uidKey));
    if (!targets.length) return;
    const remindDays = Number($('#nt-bulk-days', root).value);
    try {
      for (let i = 0; i < targets.length; i += 450) {
        const batch = writeBatch(db);
        targets.slice(i, i + 450).forEach(x => batch.update(userDoc(state.uid, x.col, x.id), { remindDays, dismissedFor: null, updatedAt: new Date() }));
        await batch.commit();
      }
      selectedKeys.clear();
      toast(`ตั้งเตือน ${targets.length} รายการเป็น “${remindLabel(remindDays)}” แล้ว`);
      renderReminders();
    } catch (err) {
      toast('ตั้งเตือนไม่สำเร็จ: ' + err.message, 'err');
    }
    return;
  }
  const dismiss = e.target.closest('[data-nt-dismiss]');
  if (dismiss) {
    const key = dismiss.dataset.ntDismiss;
    if (key === 'period:next') {
      const cycle = periodStats(state.period || []);
      if (cycle?.next) localStorage.setItem('reminder_dismissed', cycle.next);
      checkReminder();
      renderReminders();
      toast('รับทราบแจ้งเตือนรอบนี้แล้ว');
      return;
    }
    const r = collectReminders().find(x => x.uidKey === key);
    if (!r) return;
    try {
      if (r.kind === 'low') {
        await updateDoc(userDoc(state.uid, r.col, r.id), { lowDismissed: true, updatedAt: new Date() });
      } else {
        await updateDoc(userDoc(state.uid, r.col, r.id), { dismissedFor: r.date, updatedAt: new Date() });
      }
      toast('ปิดแจ้งเตือนรายการนี้สำหรับรอบนี้แล้ว');
    } catch (err) {
      toast('อัปเดตไม่สำเร็จ: ' + err.message, 'err');
    }
  }
}

export function renderReminders() {
  window.dispatchEvent(new Event('trackme:reminders'));
  if (!root?.isConnected) return;

  const today = localDateStr();
  const active = collectReminders();
  const sources = trackedSources();
  const validKeys = new Set(sources.map(x => x.uidKey));
  selectedKeys.forEach(k => { if (!validKeys.has(k)) selectedKeys.delete(k); });

  const cycle = periodStats(state.period || []);
  const pLead = getPeriodRemindDays();
  const pDismissed = cycle?.next && localStorage.getItem('reminder_dismissed') === cycle.next;
  const notifState = 'Notification' in window
    ? ({ granted: 'อนุญาตการแจ้งเตือนแล้ว', denied: 'ถูกบล็อกในเบราว์เซอร์', default: 'ยังไม่ได้อนุญาต' }[Notification.permission] || '')
    : 'เบราว์เซอร์ไม่รองรับ';

  const activeHtml = active.map(x => {
    const diff = daysBetween(today, x.date);
    const when = x.kind === 'low' ? 'ถึงเกณฑ์เตือนสต๊อก' : diff < 0 ? `เลยกำหนด ${-diff} วัน` : diff === 0 ? 'ครบกำหนดวันนี้' : `อีก ${diff} วัน`;
    return `<article class="rounded-2xl bg-slate-50 border border-slate-100 p-3 flex flex-wrap items-center justify-between gap-3">
      <div class="flex gap-3 items-center min-w-0">
        <span class="emoji-bubble">${x.icon}</span>
        <div class="min-w-0">
          <b class="text-sm block truncate">${esc(x.label)}</b>
          <p class="text-xs text-slate-600">${esc(fmtDate(x.date))}${x.dueTime ? ` · ⏰ ${esc(x.dueTime)} น.` : ''} · <span class="${diff < 0 ? 'text-rose-600 font-semibold' : ''}">${esc(when)}</span> · ${esc(x.detail)}</p>
        </div>
      </div>
      <button data-nt-dismiss="${esc(x.uidKey)}" class="chip bg-white border border-slate-200 text-slate-600 shrink-0">รับทราบ / ปิดรอบนี้</button>
    </article>`;
  }).join('');

  const configHtml = sources.map(x => {
    const diff = daysBetween(today, x.date);
    return `<div class="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 flex flex-wrap items-center justify-between gap-2">
      <label class="flex items-center gap-2.5 min-w-0 cursor-pointer">
        <input type="checkbox" data-nt-sel="${esc(x.uidKey)}" ${selectedKeys.has(x.uidKey) ? 'checked' : ''}>
        <span class="text-base">${x.icon}</span>
        <span class="min-w-0">
          <b class="text-xs sm:text-sm block truncate text-slate-800">${esc(x.label)}</b>
          <span class="text-[11px] text-slate-500">ครบกำหนด ${esc(fmtDate(x.date))}${x.dueTime ? ` (${esc(x.dueTime)} น.)` : ''} · ${diff < 0 ? `เลย ${-diff} วัน` : diff === 0 ? 'วันนี้' : `อีก ${diff} วัน`}</span>
        </span>
      </label>
      <select data-nt-remind="${esc(x.uidKey)}" class="input !w-auto !py-1.5 !px-2.5 text-xs">${REMIND_OPTIONS.map(([v, t]) => `<option value="${v}" ${x.remindDays === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>`;
  }).join('');

  root.innerHTML = `<div class="lg:col-span-3 space-y-5">
    <section class="card space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-bold"><i class="fa-regular fa-bell text-brand"></i> แจ้งเตือนที่ถึงกำหนด (${active.length})</h2>
      </div>
      <p class="text-xs text-slate-500">แสดงเฉพาะรายการที่อยู่ในช่วงแจ้งเตือนล่วงหน้าที่ตั้งค่าไว้ กด “รับทราบ / ปิดรอบนี้” เพื่อเคลียร์เลขบนกระดิ่งได้</p>
      <div class="space-y-2">${activeHtml || '<p class="rounded-2xl bg-ok-soft p-4 text-sm text-green-800">🌼 ยังไม่มีรายการแจ้งเตือนค้างอยู่ค่ะ</p>'}</div>
    </section>

    <section class="card space-y-3">
      <h3 class="font-bold text-slate-800">🌸 แจ้งเตือนรอบเดือน</h3>
      <div class="rounded-2xl bg-pink-soft/50 border border-pink-100 p-3 flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm space-y-0.5">
          <p class="font-semibold text-slate-800">${cycle?.next ? `คาดการณ์รอบถัดไป ~ ${esc(fmtDate(cycle.next))} (อีก ${daysBetween(today, cycle.next)} วัน)` : 'บันทึกรอบเดือนอย่างน้อย 2 ครั้งเพื่อคำนวณวันคาดการณ์'}</p>
          <p class="text-xs text-slate-500">ค่าประมาณจากค่าเฉลี่ยรอบที่ผ่านมา · สถานะแจ้งเตือนของเครื่อง: ${esc(notifState)}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select id="nt-period-days" class="input !w-auto text-xs">${REMIND_OPTIONS.map(([v, t]) => `<option value="${v}" ${pLead === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <button id="nt-notif-perm" type="button" class="chip bg-white border border-pink-200 text-pink-700">อนุญาตแจ้งเตือน</button>
          ${cycle?.next && pLead >= 0 && !pDismissed ? '<button id="nt-period-dismiss" type="button" class="chip bg-white border border-slate-200 text-slate-600">ปิดเตือนรอบนี้</button>' : ''}
        </div>
      </div>
    </section>

    <section class="card space-y-3">
      <div>
        <h3 class="font-bold text-slate-800">⚙️ ตั้งค่าระยะเวลาแจ้งเตือนล่วงหน้า (รายตัว / หลายรายการ)</h3>
        <p class="text-xs text-slate-500">เลือกปรับแจ้งเตือนล่วงหน้า 2 เดือน, 1 เดือน, 2 วีค, 1 วีค, 3 วัน, 2 วัน, 1 วัน หรือปิดแจ้งเตือนได้ทั้งรายตัวและหลายรายการพร้อมกัน</p>
      </div>
      <div class="rounded-xl bg-slate-50 border border-slate-100 p-2.5 flex flex-wrap items-center gap-2 text-xs">
        <label class="flex items-center gap-1.5 cursor-pointer"><input id="nt-sel-all" type="checkbox" ${sources.length > 0 && sources.every(x => selectedKeys.has(x.uidKey)) ? 'checked' : ''} ${sources.length === 0 ? 'disabled' : ''}> เลือกทั้งหมด (${sources.length})</label>
        <span class="text-slate-500">เลือกแล้ว <b>${selectedKeys.size}</b></span>
        <select id="nt-bulk-days" class="input !w-auto !py-1.5 text-xs">${REMIND_OPTIONS.map(([v, t]) => `<option value="${v}" ${v === 7 ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button id="nt-bulk-apply" type="button" class="chip bg-sky-soft text-blue-700" ${selectedKeys.size === 0 ? 'disabled' : ''}>ตั้งเตือนรายการที่เลือก</button>
      </div>
      <div class="space-y-2">${configHtml || '<p class="text-xs text-slate-400">ยังไม่มีรายการที่มีวันครบกำหนดในบันทึกเตือนหรือสต๊อก</p>'}</div>
      <p class="text-[11px] text-slate-400">สามารถเปิดรับการแจ้งเตือนอัตโนมัติเวลา 08:00 น. แม้ไม่ได้เปิดแอปได้ที่ปุ่ม “เปิดรับการแจ้งเตือน” บนหน้า Home หรือในหน้า ตั้งค่า</p>
    </section>
  </div>`;
}

