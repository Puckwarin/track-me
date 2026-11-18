import { state } from './state.js';
import { $, addDays, esc, localDateStr, openModal, round1, toast } from './util.js';
import { getFoodRecordsInRange } from './foodService.js';
import { iconSvg } from './icons.js';

export function openFoodHistorySearch() {
  const today = localDateStr();
  const m = openModal(`
    <div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg inline-flex items-center gap-1.5">${iconSvg('search', { size: 18, className: 'text-brand' })}<span>ค้นหาประวัติอาหารที่บันทึก</span></h3><button data-close class="text-slate-400 hover:text-slate-600 min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button></div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      <input id="fh-q" class="input" placeholder="🔍 ชื่อเมนู (เว้นว่าง = ดูทั้งหมด)">
      <input id="fh-from" type="date" class="input" value="${addDays(today, -30)}">
      <input id="fh-to" type="date" class="input" value="${today}">
    </div>
    <div class="flex justify-end mb-3"><button id="fh-go" type="button" class="btn btn-primary text-xs">ค้นหา</button></div>
    <div id="fh-res" class="space-y-2 max-h-80 overflow-y-auto text-sm text-slate-500">กดปุ่ม "ค้นหา" เพื่อดูรายการในช่วงวันที่เลือก</div>
  `, { wide: true });

  const search = async () => {
    const q = $('#fh-q', m.el).value.trim().toLowerCase();
    const from = $('#fh-from', m.el).value;
    const to = $('#fh-to', m.el).value;
    if (!from || !to || from > to) return toast('ช่วงวันที่ไม่ถูกต้อง', 'err');
    const out = $('#fh-res', m.el);
    out.textContent = 'กำลังค้นหา...';
    try {
      const snap = await getFoodRecordsInRange(state.uid, from, to);
      const rows = snap.docs
        .map(d => d.data())
        .filter(r => !q || String(r.name || '').toLowerCase().includes(q) || String(r.meal || '').toLowerCase().includes(q))
        .sort((a, b) => b.date.localeCompare(a.date));
      out.innerHTML = rows.length
        ? `<p class="text-xs text-slate-500 mb-2">พบ ${rows.length} รายการ</p>` + rows.slice(0, 100).map(r => `
          <div class="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
            <div class="min-w-0">
              <p class="font-semibold text-slate-800 truncate">${esc(r.name)}</p>
              <p class="text-xs text-slate-500">${esc(r.date)} · ${esc(r.meal || '-')}</p>
            </div>
            <div class="text-right shrink-0">
              <p class="font-bold text-slate-800 text-xs">${Math.round(r.calories || 0)} kcal</p>
              <p class="text-[11px] text-slate-500">P ${round1(r.protein || 0)} · C ${round1(r.carbs || 0)} · F ${round1(r.fat || 0)}</p>
            </div>
          </div>`).join('')
        : '<p class="text-center text-xs text-slate-400 py-4">ไม่พบรายการที่ตรงกันในช่วงวันที่นี้</p>';
    } catch (err) {
      out.textContent = 'ค้นหาไม่สำเร็จ: ' + err.message;
    }
  };
  $('#fh-go', m.el).addEventListener('click', search);
  $('#fh-q', m.el).addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
  search();
}
