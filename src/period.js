import { addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, isValidCalendarDate, localDateStr, daysBetween, addDays, toast, confirmDialog } from './util.js';
import { iconSvg } from './icons.js';
import { guardPreviewWrite } from './preview.js';
import { bindSwipeRows } from './ui.js';
import { periodStats, REMIND_OPTIONS, remindLabel, getPeriodRemindDays, setPeriodRemindDays } from './periodStats.js';

export { periodStats, REMIND_OPTIONS, remindLabel, getPeriodRemindDays, setPeriodRemindDays };

let root, activePeriodTab = 'main', selectedCalDate = '', cal = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();

function setPeriodTab(tab) {
  if (!root) return;
  activePeriodTab = tab === 'stats' ? 'stats' : 'main';
  root.querySelectorAll('[data-period-tab]').forEach(btn => {
    const on = btn.dataset.periodTab === activePeriodTab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#p-panel-main', root)?.classList.toggle('hidden', activePeriodTab !== 'main');
  $('#p-panel-stats', root)?.classList.toggle('hidden', activePeriodTab !== 'stats');
}

// REMIND_OPTIONS, remindLabel, getPeriodRemindDays, setPeriodRemindDays, periodStats re-exported from ./periodStats.js

export function mountPeriod(el) {
  root = el;
  activePeriodTab = 'main';
  root.innerHTML = `
  <div class="lg:col-span-3">
    <div class="tm-seg tm-seg--2 max-w-md" role="tablist" aria-label="หมวดบันทึกรอบเดือน">
      <button type="button" role="tab" data-period-tab="main" aria-selected="true" class="tm-seg-btn is-active">บันทึก & ปฏิทิน</button>
      <button type="button" role="tab" data-period-tab="stats" aria-selected="false" class="tm-seg-btn">สถิติ & ประวัติ</button>
    </div>
  </div>

  <div id="p-panel-main" class="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="card space-y-4 lg:col-span-2">
      <h2 class="text-lg font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('period', { size: 19, className: 'text-pink-500' })}<span>บันทึกรอบเดือน</span></h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="lbl" for="p-start">วันแรกที่มา *</label><input type="date" id="p-start" class="input"></div>
        <div><label class="lbl" for="p-end">วันสุดท้าย (เว้นว่างได้ถ้ายังไม่หมด)</label><input type="date" id="p-end" class="input"></div>
        <div><label class="lbl" for="p-flow">ปริมาณ</label><select id="p-flow" class="input"><option value="">ไม่ระบุ</option><option>น้อย</option><option>ปานกลาง</option><option>มาก</option></select></div>
        <div><label class="lbl" for="p-note">หมายเหตุ</label><input id="p-note" class="input" placeholder="เช่น มาช้ากว่าปกติ"></div>
      </div>
      <div class="flex justify-end"><button id="p-save" class="btn btn-pink">${iconSvg('check', { size: 15 })} บันทึกรอบเดือน</button></div>
    </div>

    <div class="card space-y-3 lg:col-span-1">
      <div class="flex items-center justify-between gap-2">
        <button id="c-prev" class="btn btn-ghost !px-3 min-w-[44px] min-h-[44px]" aria-label="เดือนก่อน">${iconSvg('chevron-left', { size: 16 })}</button>
        <h3 id="c-title" class="font-bold text-slate-800 text-center"></h3>
        <button id="c-next" class="btn btn-ghost !px-3 min-w-[44px] min-h-[44px]" aria-label="เดือนถัดไป">${iconSvg('chevron-right', { size: 16 })}</button>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-xs period-weekdays font-medium">${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => `<div>${d}</div>`).join('')}</div>
      <div id="c-grid" class="grid grid-cols-7 gap-1 tabular-nums"></div>
      <div class="flex flex-wrap gap-3 text-xs text-slate-600">
        <span class="inline-flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded period-legend-period"></span> มีประจำเดือน</span>
        <span class="inline-flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded period-legend-pred"></span> คาดการณ์ (ค่าประมาณ)</span>
        <span class="inline-flex items-center gap-1.5"><span class="inline-block w-2 h-2 rounded-full period-legend-dot"></span> มีบันทึกอาการ</span>
      </div>
      <div id="c-selected-bar" class="hidden rounded-2xl border period-selected-bar p-3 flex flex-wrap items-center justify-between gap-2"></div>
    </div>
  </div>

  <div id="p-panel-stats" class="hidden lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="card space-y-3 lg:col-span-1">
      <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('overview', { size: 17, className: 'text-pink-500' })}<span>สถิติรอบเดือน</span></h3>
      <div id="p-stats" class="space-y-2 text-sm text-slate-700 tabular-nums"></div>
      <p class="text-xs text-slate-500">* วันที่คาดการณ์เป็นการประมาณจากค่าเฉลี่ยเท่านั้น ไม่ใช่การวินิจฉัยทางการแพทย์ หากรอบเดือนผิดปกติควรปรึกษาแพทย์</p>
    </div>

    <div class="card space-y-3 lg:col-span-2">
      <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('list', { size: 17, className: 'text-pink-500' })}<span>ประวัติประจำเดือน</span></h3>
      <div id="p-history-wrap">
        <p id="p-swipe-hint" class="tm-swipe-hint hidden">ปัดซ้ายที่รายการเพื่อลบ</p>
        <div id="p-mobile-list" class="lg:hidden tm-swipe-list tm-swipe-list--cards tabular-nums"></div>
        <div class="hidden lg:block overflow-x-auto"><table class="w-full text-left text-sm">
          <thead class="period-table-head"><tr><th class="p-3">เริ่ม</th><th class="p-3">สิ้นสุด</th><th class="p-3 text-right">มา (วัน)</th><th class="p-3 text-right">รอบ (วัน)</th><th class="p-3">หมายเหตุ</th><th class="p-3 text-center">ลบ</th></tr></thead>
          <tbody id="p-body" class="divide-y divide-slate-100 tabular-nums"></tbody></table></div>
      </div>
    </div>
  </div>`;
  $('#p-start', root).value = localDateStr();
  root.addEventListener('click', e => {
    const tabBtn = e.target.closest('[data-period-tab]');
    if (tabBtn) setPeriodTab(tabBtn.dataset.periodTab);
  });
  window.addEventListener('trackme:focus', e => {
    if (!root?.isConnected || e.detail?.tab !== 'period') return;
    const fid = String(e.detail?.focusId || '');
    setPeriodTab(fid === 'p-stats' || fid === 'p-body' ? 'stats' : 'main');
  });
  $('#p-save', root).addEventListener('click', save);
  $('#c-prev', root).addEventListener('click', () => shiftMonth(-1));
  $('#c-next', root).addEventListener('click', () => shiftMonth(1));
  const cGrid = $('#c-grid', root);
  let calSwipe = null;
  cGrid.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    calSwipe = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  });
  cGrid.addEventListener('pointerup', e => {
    if (!calSwipe || e.pointerId !== calSwipe.pointerId) return;
    const dx = e.clientX - calSwipe.x;
    const dy = e.clientY - calSwipe.y;
    calSwipe = null;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      shiftMonth(dx < 0 ? 1 : -1);
    }
  });
  cGrid.addEventListener('pointercancel', () => { calSwipe = null; });
  window.addEventListener('trackme:symptom-date-change', e => {
    if (!root?.isConnected) return;
    selectedCalDate = e.detail?.date || '';
    renderCalendar();
    renderSelectedBar();
  });
  cGrid.addEventListener('click', e => {
    const d = e.target.closest('[data-d]');
    if (d && d.dataset.d <= localDateStr()) {
      const ds = d.dataset.d;
      selectedCalDate = ds;
      renderCalendar();
      renderSelectedBar();
      void import('./symptoms.js').then(m => m.setDateOnly?.(ds));
      toast(`เลือกวันที่ ${fmtDate(ds)} สำหรับอาการ & ผิวแล้ว`);
    }
  });
  $('#c-selected-bar', root)?.addEventListener('click', e => {
    if (e.target.closest('[data-c-go-symptoms]') && selectedCalDate) {
      window.dispatchEvent(new CustomEvent('trackme:show-symptoms', { detail: { date: selectedCalDate } }));
      return;
    }
    if (e.target.closest('[data-c-clear-sel]')) {
      selectedCalDate = '';
      void import('./symptoms.js').then(m => m.resetSymptomsToToday?.());
      renderCalendar();
      renderSelectedBar();
    }
  });
  $('#p-history-wrap', root).addEventListener('click', async e => {
    const end = e.target.closest('[data-end]'), del = e.target.closest('[data-del]');
    if (end) {
      if (guardPreviewWrite('การอัปเดตวันสิ้นสุดรอบเดือน')) return;
      const p = state.period.find(i => i.id === end.dataset.end); if (!p) return;
      const d = localDateStr();
      updateDoc(userDoc(state.uid, 'period_records', p.id), { end: d < p.start ? p.start : d }).catch(err => toast(err.message, 'err'));
    }
    if (del) {
      if (guardPreviewWrite('การลบบันทึกรอบเดือน')) return;
      const delId = del.dataset.del;
      const ok = await confirmDialog({
        title: 'ลบบันทึกประจำเดือน?',
        message: 'ต้องการลบบันทึกประจำเดือนนี้ใช่หรือไม่?',
        confirmText: 'ลบบันทึก',
        cancelText: 'ยกเลิก',
        danger: true
      });
      if (!ok) return;
      deleteDoc(userDoc(state.uid, 'period_records', delId)).catch(err => toast(err.message, 'err'));
    }
  });
  setPeriodTab('main');
  render();
}

export function resetPeriodToToday() {
  const now = new Date();
  const today = localDateStr(now);
  cal = { y: now.getFullYear(), m: now.getMonth() };
  const symDate = document.getElementById('s-date')?.value || '';
  selectedCalDate = symDate && symDate !== today ? symDate : '';
  if (!root) return;
  const startEl = $('#p-start', root);
  if (startEl) startEl.value = today;
  render();
}

function shiftMonth(n) { const d = new Date(cal.y, cal.m + n, 1); cal = { y: d.getFullYear(), m: d.getMonth() }; renderCalendar(); }

function periodDays() {
  const set = new Set(), today = localDateStr();
  state.period.forEach(p => {
    if (!p.start) return;
    const end = p.end || (daysBetween(p.start, today) > 9 ? addDays(p.start, 9) : today);   // ยังไม่ระบุวันสิ้นสุด: ไฮไลต์ถึงวันนี้ (สูงสุด 10 วัน)
    for (let d = p.start; d <= end && set.size < 5000; d = addDays(d, 1)) set.add(d);
  });
  return set;
}
function predictedDays() {
  const s = periodStats(state.period), set = new Set();
  if (s?.next) for (let i = 0; i < (s.avgDur || 5); i++) set.add(addDays(s.next, i));
  return set;
}

function getSelectedCalendarDate() {
  const today = localDateStr();
  const symDate = document.getElementById('s-date')?.value || '';
  return selectedCalDate || (symDate && symDate !== today ? symDate : '');
}

function renderSelectedBar() {
  if (!root) return;
  const bar = $('#c-selected-bar', root);
  if (!bar) return;
  const sel = getSelectedCalendarDate();
  if (!sel) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  const hasSx = (state.symptoms || []).some(s => s.id === sel);
  const hasSkin = (state.skinRecords || []).some(s => s.id === sel);
  const statusText = hasSx || hasSkin
    ? [hasSx ? 'มีบันทึกอาการ' : '', hasSkin ? 'มีบันทึกผิว' : ''].filter(Boolean).join(' · ')
    : 'ยังไม่มีบันทึกอาการ/ผิววันนี้';
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="min-w-0 flex-1 space-y-0.5">
      <p class="text-xs font-bold text-slate-800">วันที่เลือก: ${esc(fmtDate(sel))}</p>
      <p class="text-[11px] text-slate-600">${esc(statusText)}</p>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <button type="button" data-c-go-symptoms class="btn btn-pink btn-sm min-h-[44px]">
        <span>เปิดอาการ &amp; ผิว</span>
        ${iconSvg('chevron-right', { size: 14 })}
      </button>
      <button type="button" data-c-clear-sel class="tm-modal-close shrink-0" aria-label="ล้างวันที่เลือก" title="ล้างวันที่เลือก">
        ${iconSvg('close', { size: 16 })}
      </button>
    </div>`;
}

export function renderCalendar() {
  if (!root) return;
  const first = new Date(cal.y, cal.m, 1);
  $('#c-title', root).textContent = first.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const pd = periodDays(), pr = predictedDays(), today = localDateStr();
  const sym = new Set(state.symptoms.map(s => s.id));
  const sel = getSelectedCalendarDate();
  const days = new Date(cal.y, cal.m + 1, 0).getDate();
  let html = '<div></div>'.repeat(first.getDay());
  for (let d = 1; d <= days; d++) {
    const ds = localDateStr(new Date(cal.y, cal.m, d));
    const isPeriod = pd.has(ds);
    const isPred = pr.has(ds);
    const cls = ['cal-day', isPeriod ? 'cal-period' : isPred ? 'cal-pred' : '', ds === today ? 'cal-today' : '', ds === sel ? 'cal-sel' : ''].join(' ');
    const stateLabel = isPeriod ? ' มีประจำเดือน' : isPred ? ' คาดการณ์' : '';
    const disabledAttr = ds > today ? ' disabled aria-disabled="true"' : '';
    html += `<button type="button" class="${cls}" data-d="${ds}" aria-label="${esc(fmtDate(ds))}${stateLabel}"${disabledAttr}>${d}${sym.has(ds) ? '<span class="cal-dot"></span>' : ''}</button>`;
  }
  $('#c-grid', root).innerHTML = html;
  renderSelectedBar();
}

export function render() {
  if (!root) return;
  const desc = state.period.slice().sort((a, b) => b.start.localeCompare(a.start));
  $('#p-body', root).innerHTML = desc.length ? desc.map((p, i) => {
    const older = desc[i + 1];
    const endCell = p.end ? esc(fmtDate(p.end)) : `<button type="button" data-end="${esc(p.id)}" class="chip period-end-chip min-h-[44px]">หมดวันนี้</button>`;
    return `<tr class="period-table-row"><td class="p-3 font-medium whitespace-nowrap">${esc(fmtDate(p.start))}</td><td class="p-3 text-slate-600 whitespace-nowrap">${endCell}</td>
      <td class="p-3 text-right text-slate-600">${p.end ? daysBetween(p.start, p.end) + 1 : '—'}</td><td class="p-3 text-right text-slate-600">${older ? daysBetween(older.start, p.start) : '—'}</td>
      <td class="p-3 text-xs text-slate-500">${esc([p.flow, p.note].filter(Boolean).join(' · '))}</td>
      <td class="p-3 text-center"><button type="button" data-del="${esc(p.id)}" class="tm-row-action-btn is-del !mx-auto" aria-label="ลบบันทึกประจำเดือน ${esc(fmtDate(p.start))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="p-5 text-center text-slate-500 text-xs">ยังไม่มีข้อมูลประจำเดือน — เพิ่มวันแรกที่มาด้านบนได้เลย</td></tr>';

  const mobileList = $('#p-mobile-list', root);
  $('#p-swipe-hint', root)?.classList.toggle('hidden', !desc.length);
  if (mobileList) {
    mobileList.innerHTML = desc.length ? desc.map((p, i) => {
      const older = desc[i + 1];
      const dur = p.end ? `${daysBetween(p.start, p.end) + 1} วัน` : 'ยังไม่สิ้นสุด';
      const cycle = older ? `รอบ ${daysBetween(older.start, p.start)} วัน` : '';
      const meta = [p.flow ? `ปริมาณ ${p.flow}` : '', p.note].filter(Boolean).join(' · ');
      return `
        <div class="tm-swipe-row is-soft text-xs">
          <div class="tm-swipe-actions tm-swipe-actions--single">
            <button type="button" data-del="${esc(p.id)}" class="tm-swipe-action-btn is-del" aria-label="ลบบันทึกประจำเดือน ${esc(fmtDate(p.start))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
          </div>
          <div class="tm-swipe-card !flex-row items-center justify-between gap-2 !p-2.5">
            <div class="min-w-0 flex-1 space-y-0.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <b class="text-sm text-slate-800">${esc(fmtDate(p.start))}</b>
                <span class="text-slate-500">– ${p.end ? esc(fmtDate(p.end)) : 'ปัจจุบัน'}</span>
              </div>
              <p class="text-[11px] text-slate-500">${esc([dur, cycle, meta].filter(Boolean).join(' · '))}</p>
            </div>
            ${!p.end ? `<button type="button" data-end="${esc(p.id)}" class="chip period-end-chip shrink-0 min-h-[44px]">หมดวันนี้</button>` : ''}
          </div>
        </div>`;
    }).join('') : '<p class="py-4 text-center text-slate-500 text-xs">ยังไม่มีข้อมูลประจำเดือน — เพิ่มวันแรกที่มาด้านบนได้เลย</p>';
    bindSwipeRows(mobileList);
  }

  const s = periodStats(state.period), box = $('#p-stats', root);
  if (!s) box.innerHTML = '<p class="text-xs text-slate-500">บันทึกอย่างน้อย 2 รอบเพื่อดูสถิติ</p>';
  else {
    const row = (a, b) => `<div class="flex justify-between gap-2"><span>${a}</span><b>${b}</b></div>`;
    box.innerHTML = row('ครั้งล่าสุด', esc(fmtDate(s.lastStart))) + row('ผ่านมาแล้ว', daysBetween(s.lastStart, localDateStr()) + ' วัน') +
      row('รอบเฉลี่ย', s.avgCycle ? s.avgCycle + ' วัน' : '—') + row('มาเฉลี่ย', s.avgDur ? s.avgDur + ' วัน' : '—') +
      row('คาดว่ารอบหน้า', s.next ? '~ ' + esc(fmtDate(s.next)) : '—') + row('จำนวนรอบที่บันทึก', s.count);
  }
  renderCalendar();
}

async function save() {
  if (guardPreviewWrite('การบันทึกรอบเดือน')) return;
  const start = $('#p-start', root).value, end = $('#p-end', root).value;
  const flow = $('#p-flow', root).value, note = $('#p-note', root).value.trim();
  if (!isValidCalendarDate(start)) return toast('กรุณาเลือกวันแรกที่ประจำเดือนมาให้ถูกต้อง', 'err');
  if (end && !isValidCalendarDate(end)) return toast('กรุณาเลือกวันสุดท้ายให้ถูกต้อง', 'err');
  if (end && end < start) return toast('วันสุดท้ายต้องไม่ก่อนวันแรก', 'err');
  if (state.period.some(p => p.start === start)) {
    const ok = await confirmDialog({
      title: 'มีบันทึกที่เริ่มวันเดียวกันอยู่แล้ว',
      message: 'มีบันทึกที่เริ่มวันเดียวกันอยู่แล้ว ต้องการเพิ่มซ้ำหรือไม่?',
      confirmText: 'เพิ่มซ้ำ',
      cancelText: 'ยกเลิก',
      danger: false
    });
    if (!ok) return;
  }
  addDoc(userCol(state.uid, 'period_records'), { start, end: end || null, flow, note, createdAt: new Date() })
    .catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  ['p-end', 'p-note'].forEach(id => { $('#' + id, root).value = ''; });
  $('#p-flow', root).value = '';
  $('#p-start', root).value = localDateStr();
  toast('บันทึกรอบเดือนแล้ว');
}

// ---------- การแจ้งเตือน (ทำงานเมื่อเปิดแอป — ไม่มี server push เพราะต้องใช้แผนเสียเงิน) ----------
export function checkReminder() {
  const banner = $('#reminder-banner');
  if (!banner) return;
  banner.classList.add('hidden');
  const days = getPeriodRemindDays();
  const s = periodStats(state.period);
  if (days < 0 || !s?.next) return;
  const until = daysBetween(localDateStr(), s.next);
  if (until < -7 || until > days) return;
  const text = until === 0 ? 'วันนี้ประจำเดือนน่าจะมา (ค่าประมาณ)' : until < 0 ? `เลยวันคาดการณ์ประจำเดือนมา ${-until} วัน (~${fmtDate(s.next)})` : `ประจำเดือนน่าจะมาในอีก ${until} วัน (~${fmtDate(s.next)}) · ค่าประมาณ`;
  if (localStorage.getItem('reminder_dismissed') !== s.next) {
    banner.innerHTML = `<div class="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm"><span>🔔 ${esc(text)}</span><button id="rem-x" class="text-pink-700 underline text-xs">ปิด</button></div>`;
    banner.classList.remove('hidden');
    $('#rem-x', banner).addEventListener('click', () => {
      localStorage.setItem('reminder_dismissed', s.next);
      banner.classList.add('hidden');
      window.dispatchEvent(new Event('trackme:reminders'));
    });
  }
  if ('Notification' in window && Notification.permission === 'granted' && localStorage.getItem('reminder_notified') !== s.next) {
    localStorage.setItem('reminder_notified', s.next);
    navigator.serviceWorker?.ready.then(r => r.showNotification('Track Me', { body: text, icon: import.meta.env.BASE_URL + 'icon-192.png' })).catch(() => {});
  }
}
