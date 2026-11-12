import { addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, parseLocal, daysBetween, addDays, toast } from './util.js';
import { mountSymptoms, selectDate } from './symptoms.js';

let root, cal = (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();

export function periodStats(items) {
  const asc = items.filter(i => i.start).slice().sort((a, b) => a.start.localeCompare(b.start));
  if (!asc.length) return null;
  const last = asc[asc.length - 1];
  const cycles = [];
  for (let i = 1; i < asc.length; i++) cycles.push(daysBetween(asc[i - 1].start, asc[i].start));
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  const recent = cycles.slice(-6);
  const avgCycle = recent.length ? avg(recent) : null;
  const durs = asc.filter(i => i.end).map(i => daysBetween(i.start, i.end) + 1).slice(-6);
  const avgDur = durs.length ? avg(durs) : null;
  return { lastStart: last.start, lastEnd: last.end || null, avgCycle, avgDur, next: avgCycle ? addDays(last.start, avgCycle) : null, count: asc.length };
}

export function mountPeriod(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-2 space-y-6">
    <div class="card space-y-4">
      <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-droplet text-pink-500"></i> บันทึกรอบเดือน</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label class="lbl">วันแรกที่มา *</label><input type="date" id="p-start" class="input"></div>
        <div><label class="lbl">วันสุดท้าย (เว้นว่างได้ถ้ายังไม่หมด)</label><input type="date" id="p-end" class="input"></div>
        <div><label class="lbl">ปริมาณ</label><select id="p-flow" class="input"><option value="">ไม่ระบุ</option><option>น้อย</option><option>ปานกลาง</option><option>มาก</option></select></div>
        <div><label class="lbl">หมายเหตุ</label><input id="p-note" class="input" placeholder="เช่น มาช้ากว่าปกติ"></div>
      </div>
      <div class="flex justify-end"><button id="p-save" class="btn btn-pink"><i class="fa-solid fa-plus"></i> บันทึกรอบเดือน</button></div>
    </div>

    <div class="card space-y-3">
      <div class="flex items-center justify-between">
        <button id="c-prev" class="btn btn-ghost !px-3" aria-label="เดือนก่อน"><i class="fa-solid fa-chevron-left"></i></button>
        <h3 id="c-title" class="font-bold text-slate-800"></h3>
        <button id="c-next" class="btn btn-ghost !px-3" aria-label="เดือนถัดไป"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => `<div>${d}</div>`).join('')}</div>
      <div id="c-grid" class="grid grid-cols-7 gap-1"></div>
      <div class="flex flex-wrap gap-3 text-xs text-slate-500">
        <span><span class="inline-block w-3 h-3 rounded bg-pink-500 align-middle"></span> มีประจำเดือน</span>
        <span><span class="inline-block w-3 h-3 rounded border border-dashed border-pink-400 bg-pink-50 align-middle"></span> คาดการณ์ (ค่าประมาณ)</span>
        <span><span class="inline-block w-2 h-2 rounded-full bg-violet-600 align-middle"></span> มีบันทึกอาการ</span>
      </div>
    </div>

    <div id="p-symptoms" class="card space-y-4"></div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-list text-pink-500"></i> ประวัติประจำเดือน</h3>
      <div class="overflow-x-auto"><table class="w-full text-left text-sm">
        <thead class="bg-pink-soft/50 text-slate-600"><tr><th class="p-3">เริ่ม</th><th class="p-3">สิ้นสุด</th><th class="p-3 text-right">มา (วัน)</th><th class="p-3 text-right">รอบ (วัน)</th><th class="p-3">หมายเหตุ</th><th class="p-3 text-center">ลบ</th></tr></thead>
        <tbody id="p-body" class="divide-y divide-slate-100"></tbody></table></div>
    </div>
  </div>
  <div class="space-y-6"><div class="card space-y-3">
    <h3 class="font-bold text-slate-800"><i class="fa-solid fa-chart-simple text-pink-500"></i> สถิติรอบเดือน</h3>
    <div id="p-stats" class="space-y-2 text-sm text-slate-700"></div>
    <p class="text-xs text-slate-400">* วันที่คาดการณ์เป็นการประมาณจากค่าเฉลี่ยเท่านั้น ไม่ใช่การวินิจฉัยทางการแพทย์ หากรอบเดือนผิดปกติควรปรึกษาแพทย์</p>
  </div></div>`;
  $('#p-start', root).value = localDateStr();
  $('#p-save', root).addEventListener('click', save);
  $('#c-prev', root).addEventListener('click', () => shiftMonth(-1));
  $('#c-next', root).addEventListener('click', () => shiftMonth(1));
  $('#c-grid', root).addEventListener('click', e => { const d = e.target.closest('[data-d]'); if (d && d.dataset.d <= localDateStr()) { document.querySelectorAll('.cal-sel').forEach(x => x.classList.remove('cal-sel')); d.classList.add('cal-sel'); selectDate(d.dataset.d); } });
  $('#p-body', root).addEventListener('click', e => {
    const end = e.target.closest('[data-end]'), del = e.target.closest('[data-del]');
    if (end) {
      const p = state.period.find(i => i.id === end.dataset.end); if (!p) return;
      const d = localDateStr();
      updateDoc(userDoc(state.uid, 'period_records', p.id), { end: d < p.start ? p.start : d }).catch(err => toast(err.message, 'err'));
    }
    if (del && confirm('ต้องการลบบันทึกประจำเดือนนี้ใช่หรือไม่?')) deleteDoc(userDoc(state.uid, 'period_records', del.dataset.del)).catch(err => toast(err.message, 'err'));
  });
  mountSymptoms($('#p-symptoms', root));
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

export function renderCalendar() {
  if (!root) return;
  const first = new Date(cal.y, cal.m, 1);
  $('#c-title', root).textContent = first.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const pd = periodDays(), pr = predictedDays(), today = localDateStr();
  const sym = new Set(state.symptoms.map(s => s.id));
  const sel = $('#s-date', root)?.value;
  const days = new Date(cal.y, cal.m + 1, 0).getDate();
  let html = '<div></div>'.repeat(first.getDay());
  for (let d = 1; d <= days; d++) {
    const ds = localDateStr(new Date(cal.y, cal.m, d));
    const cls = ['cal-day', pd.has(ds) ? 'cal-period' : pr.has(ds) ? 'cal-pred' : '', ds === today ? 'cal-today' : '', ds === sel ? 'cal-sel' : ''].join(' ');
    html += `<div class="${cls}" data-d="${ds}">${d}${sym.has(ds) ? '<span class="cal-dot"></span>' : ''}</div>`;
  }
  $('#c-grid', root).innerHTML = html;
}

export function render() {
  if (!root) return;
  const desc = state.period.slice().sort((a, b) => b.start.localeCompare(a.start));
  $('#p-body', root).innerHTML = desc.length ? desc.map((p, i) => {
    const older = desc[i + 1];
    const endCell = p.end ? esc(fmtDate(p.end)) : `<button data-end="${esc(p.id)}" class="chip bg-pink-soft text-pink-700">หมดวันนี้</button>`;
    return `<tr class="hover:bg-pink-soft/30"><td class="p-3 font-medium">${esc(fmtDate(p.start))}</td><td class="p-3 text-slate-600">${endCell}</td>
      <td class="p-3 text-right text-slate-600">${p.end ? daysBetween(p.start, p.end) + 1 : '-'}</td><td class="p-3 text-right text-slate-600">${older ? daysBetween(older.start, p.start) : '-'}</td>
      <td class="p-3 text-xs text-slate-500">${esc([p.flow, p.note].filter(Boolean).join(' · '))}</td>
      <td class="p-3 text-center"><button data-del="${esc(p.id)}" class="text-rose-400 hover:text-rose-600 p-1"><i class="fa-solid fa-trash-can text-xs"></i></button></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="p-4 text-center text-slate-400 text-xs">ยังไม่มีข้อมูลประจำเดือน</td></tr>';

  const s = periodStats(state.period), box = $('#p-stats', root);
  if (!s) box.innerHTML = '<p class="text-xs text-slate-400">บันทึกอย่างน้อย 2 รอบเพื่อดูสถิติ</p>';
  else {
    const row = (a, b) => `<div class="flex justify-between"><span>${a}</span><b>${b}</b></div>`;
    box.innerHTML = row('ครั้งล่าสุด', esc(fmtDate(s.lastStart))) + row('ผ่านมาแล้ว', daysBetween(s.lastStart, localDateStr()) + ' วัน') +
      row('รอบเฉลี่ย', s.avgCycle ? s.avgCycle + ' วัน' : '-') + row('มาเฉลี่ย', s.avgDur ? s.avgDur + ' วัน' : '-') +
      row('คาดว่ารอบหน้า', s.next ? '~ ' + esc(fmtDate(s.next)) : '-') + row('จำนวนรอบที่บันทึก', s.count);
  }
  renderCalendar();
}

function save() {
  const start = $('#p-start', root).value, end = $('#p-end', root).value;
  if (!start) return toast('กรุณาเลือกวันแรกที่ประจำเดือนมา', 'err');
  if (end && end < start) return toast('วันสุดท้ายต้องไม่ก่อนวันแรก', 'err');
  if (state.period.some(p => p.start === start) && !confirm('มีบันทึกที่เริ่มวันเดียวกันอยู่แล้ว ต้องการเพิ่มซ้ำหรือไม่?')) return;
  addDoc(userCol(state.uid, 'period_records'), { start, end: end || null, flow: $('#p-flow', root).value, note: $('#p-note', root).value.trim(), createdAt: new Date() })
    .catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  ['p-end', 'p-note'].forEach(id => { $('#' + id, root).value = ''; });
  $('#p-flow', root).value = '';
}

// ---------- การแจ้งเตือน (ทำงานเมื่อเปิดแอป — ไม่มี server push เพราะต้องใช้แผนเสียเงิน) ----------
export function checkReminder() {
  const banner = $('#reminder-banner');
  if (!banner) return;
  banner.classList.add('hidden');
  const days = +localStorage.getItem('remind_days') || 0;
  const s = periodStats(state.period);
  if (!days || !s?.next) return;
  const until = daysBetween(localDateStr(), s.next);
  if (until < 0 || until > days) return;
  const text = until === 0 ? 'วันนี้ประจำเดือนน่าจะมา (ค่าประมาณ)' : `ประจำเดือนน่าจะมาในอีก ${until} วัน (~${fmtDate(s.next)}) · ค่าประมาณ`;
  if (localStorage.getItem('reminder_dismissed') !== s.next) {
    banner.innerHTML = `<div class="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm"><span>🔔 ${esc(text)}</span><button id="rem-x" class="text-pink-700 underline text-xs">ปิด</button></div>`;
    banner.classList.remove('hidden');
    $('#rem-x', banner).addEventListener('click', () => { localStorage.setItem('reminder_dismissed', s.next); banner.classList.add('hidden'); });
  }
  if ('Notification' in window && Notification.permission === 'granted' && localStorage.getItem('reminder_notified') !== s.next) {
    localStorage.setItem('reminder_notified', s.next);
    navigator.serviceWorker?.ready.then(r => r.showNotification('Track Me', { body: text, icon: import.meta.env.BASE_URL + 'icon-192.png' })).catch(() => {});
  }
}
