import { writeBatch, doc } from 'firebase/firestore';
import { db, userCol } from './firebase.js';
import { state } from './state.js';
import { $, addDays, esc, fmtDate, localDateStr, mondayOf, openModal, round1, toast } from './util.js';
import { getFoodRecordsInRange } from './foodService.js';
import { iconSvg } from './icons.js';
import { MEAL_ICONS, MEAL_ORDER } from './foodConstants.js';
import { foodLogName, foodLogPortion } from './foodCalculations.js';
import { getMeals } from './profile.js';
import { guardPreviewWrite } from './preview.js';

export function openFoodHistorySearch() {
  const today = localDateStr();
  const targetDate = () => document.getElementById('f-date')?.value || today;
  let activeDate = targetDate();
  let rangeDays = 30;

  const m = openModal(`
    <div class="flex justify-between items-center gap-2 mb-3">
      <div>
        <h3 class="font-bold text-lg text-slate-800 inline-flex items-center gap-2">${iconSvg('search', { size: 18, className: 'text-brand' })}<span>ค้นหาประวัติอาหาร</span></h3>
        <p class="text-xs text-slate-500 mt-0.5">ดูย้อนหลังหรือคัดลอกมื้อที่เคยบันทึกไปยังวันที่เลือก (${esc(fmtDate(targetDate()))})</p>
      </div>
      <button data-close type="button" class="text-slate-400 hover:text-slate-700 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <div class="space-y-2.5 mb-3">
      <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2.5 items-end">
        <div>
          <label class="lbl" for="fh-q">ค้นหาชื่อเมนูหรือมื้ออาหาร</label>
          <input id="fh-q" class="input min-h-[44px]" placeholder="เช่น อกไก่, ข้าวสวย, มื้อเช้า">
        </div>
        <div>
          <label class="lbl" for="fh-range">ช่วงข้อมูล</label>
          <select id="fh-range" class="input min-h-[44px]">
            <option value="0">เฉพาะวันที่เลือก</option>
            <option value="7">7 วันล่าสุด</option>
            <option value="30" selected>30 วันล่าสุด</option>
          </select>
        </div>
      </div>
      <div id="fh-week-strip" class="tm-week-strip" role="group" aria-label="เลือกวันที่แบบเลื่อนซ้ายขวา"></div>
    </div>
    <div id="fh-res" class="space-y-3 max-h-[58vh] overflow-y-auto pr-0.5 text-sm text-slate-500">กำลังโหลดประวัติอาหาร...</div>
  `, { size: 'xl' });

  let mealGroups = [];
  let flatRows = [];

  const copyRecords = async records => {
    if (guardPreviewWrite('การคัดลอกประวัติอาหาร')) return;
    if (!state.uid || !records.length) return;
    const destDate = targetDate();
    const meals = getMeals();
    const fallbackMeal = meals[0] || { id: 'breakfast', name: MEAL_ORDER[0] };
    const now = new Date();
    const batch = writeBatch(db);
    const colRef = userCol(state.uid, 'food_records');
    records.forEach(src => {
      const rest = { ...src };
      delete rest.id;
      delete rest.createdAt;
      delete rest.updatedAt;
      const matchedMeal = meals.find(x => x.id === src.mealId || x.name === src.meal);
      batch.set(doc(colRef), {
        ...rest,
        date: destDate,
        mealId: matchedMeal?.id || src.mealId || fallbackMeal.id,
        meal: matchedMeal?.name || src.meal || fallbackMeal.name,
        createdAt: now,
        copiedFrom: src.date || destDate
      });
    });
    await batch.commit();
    toast(`คัดลอก ${records.length} รายการลงวันที่ ${fmtDate(destDate)} แล้ว`);
    m.close();
  };

  const renderGroups = rows => {
    const out = $('#fh-res', m.el);
    mealGroups = [];
    flatRows = rows.slice(0, 150);
    if (!flatRows.length) {
      out.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 text-center text-xs text-slate-500">ไม่พบรายการที่ตรงกันในช่วงวันที่นี้</div>';
      return;
    }

    const byDate = new Map();
    for (const r of flatRows) {
      const d = r.date || '-';
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(r);
    }

    const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
    const html = [`<p class="text-xs text-slate-500">พบทั้งหมด <b class="text-slate-700">${rows.length}</b> รายการ${rows.length > 150 ? ' (แสดง 150 รายการล่าสุด)' : ''}</p>`];

    for (const d of sortedDates) {
      const dayItems = byDate.get(d);
      const dayTotalKcal = Math.round(dayItems.reduce((s, r) => s + (Number(r.calories) || 0), 0));
      const mealsPresent = [...new Set(dayItems.map(r => r.meal || 'ไม่ระบุมื้อ'))].sort((a, b) => {
        const ia = MEAL_ORDER.indexOf(a);
        const ib = MEAL_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

      const mealsHtml = mealsPresent.map(mealName => {
        const mealRows = dayItems.filter(r => (r.meal || 'ไม่ระบุมื้อ') === mealName);
        const groupIdx = mealGroups.length;
        mealGroups.push(mealRows);
        const mealKcal = Math.round(mealRows.reduce((s, r) => s + (Number(r.calories) || 0), 0));
        const mealPro = round1(mealRows.reduce((s, r) => s + (Number(r.protein) || 0), 0));
        const mealIcon = MEAL_ICONS[mealName] || 'food';

        return `
          <div class="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div class="bg-slate-50 border-b border-slate-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-brand shrink-0">${iconSvg(mealIcon, { size: 15 })}</span>
                <span class="font-semibold text-sm text-slate-800 truncate">${esc(mealName)}</span>
                <span class="text-xs text-slate-500 tabular-nums shrink-0">${mealRows.length} รายการ · ${mealKcal.toLocaleString()} kcal · P ${mealPro}g</span>
              </div>
              <button type="button" data-copy-meal-idx="${groupIdx}" class="btn btn-ghost min-h-[44px] px-3 py-1.5 text-xs font-semibold shrink-0">${iconSvg('copy', { size: 14 })} คัดลอกมื้อนี้</button>
            </div>
            <div class="divide-y divide-slate-100">
              ${mealRows.map(r => {
                const rowIdx = flatRows.indexOf(r);
                const nameText = foodLogName(r.name);
                const portionText = foodLogPortion(r);
                return `
                  <div class="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div class="min-w-0 flex-1 space-y-0.5">
                      <p class="font-semibold text-sm text-slate-800 truncate">${esc(nameText)}</p>
                      <p class="text-xs text-slate-500 tabular-nums">
                        ${portionText ? `<span>${esc(portionText)} · </span>` : ''}
                        <b class="text-slate-700">${Math.round(r.calories || 0)} kcal</b> · P ${round1(r.protein || 0)}g · C ${round1(r.carbs || 0)}g · F ${round1(r.fat || 0)}g
                        ${r.sugar != null ? ` · น้ำตาล ${round1(r.sugar)}g` : ''}${r.sodium != null ? ` · Na ${Math.round(r.sodium)}mg` : ''}
                      </p>
                    </div>
                    <button type="button" data-copy-item-idx="${rowIdx}" class="btn btn-ghost min-h-[44px] px-3 py-1.5 text-xs shrink-0 self-start sm:self-center">${iconSvg('plus', { size: 13 })} ใช้เมนูนี้</button>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      }).join('');

      html.push(`
        <section class="space-y-2">
          <div class="flex items-center justify-between gap-2 px-1">
            <h4 class="text-xs font-bold text-slate-700">${esc(fmtDate(d))} <span class="font-normal text-slate-400">(${esc(d)})</span></h4>
            <span class="text-xs font-semibold text-slate-600 tabular-nums">รวม ${dayTotalKcal.toLocaleString()} kcal</span>
          </div>
          <div class="space-y-2">${mealsHtml}</div>
        </section>`);
    }

    out.innerHTML = html.join('');
  };

  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const renderStrip = (centerIfInitial = false) => {
    const stripEl = $('#fh-week-strip', m.el);
    if (!stripEl) return;
    const prevScroll = stripEl.scrollLeft;
    const hadPills = stripEl.children.length > 0;
    const baseMon = mondayOf(today);
    const rangeStart = addDays(baseMon, -28);
    const rangeEnd = addDays(baseMon, 13);
    const finalStart = activeDate < rangeStart ? mondayOf(activeDate) : rangeStart;
    const finalEnd = activeDate > rangeEnd ? addDays(mondayOf(activeDate), 6) : rangeEnd;
    const pills = [];
    for (let ds = finalStart; ds <= finalEnd; ds = addDays(ds, 1)) {
      const [yy, mm, dd] = ds.split('-').map(Number);
      const dow = DOW[new Date(yy, mm - 1, dd).getDay()];
      const active = ds === activeDate;
      const isToday = ds === today;
      pills.push(`<button type="button" data-fh-day="${ds}" aria-pressed="${active}" aria-label="${esc(ds)}" class="tm-day-pill ${active ? 'is-active' : ''} ${isToday ? 'is-today' : ''}"><span class="tm-day-dow">${dow}</span><span class="tm-day-num">${dd}</span></button>`);
    }
    stripEl.innerHTML = pills.join('');
    if (!centerIfInitial && hadPills && prevScroll > 0) stripEl.scrollLeft = prevScroll;
    else requestAnimationFrame(() => stripEl.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  };

  let searchTimer = null;
  const search = async () => {
    const q = $('#fh-q', m.el).value.trim().toLowerCase();
    const to = activeDate;
    const from = rangeDays === 0 ? activeDate : addDays(activeDate, -rangeDays);
    const out = $('#fh-res', m.el);
    out.textContent = 'กำลังค้นหา...';
    try {
      const snap = await getFoodRecordsInRange(state.uid, from, to);
      const rows = snap.docs
        .map(d => d.data())
        .filter(r => !q || String(r.name || '').toLowerCase().includes(q) || String(r.meal || '').toLowerCase().includes(q))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      renderGroups(rows);
    } catch (err) {
      out.textContent = 'ค้นหาไม่สำเร็จ: ' + err.message;
    }
  };

  $('#fh-res', m.el).addEventListener('click', e => {
    const mealBtn = e.target.closest('[data-copy-meal-idx]');
    if (mealBtn) {
      const group = mealGroups[Number(mealBtn.dataset.copyMealIdx)];
      if (group?.length) {
        mealBtn.disabled = true;
        copyRecords(group).catch(err => {
          mealBtn.disabled = false;
          toast('คัดลอกไม่สำเร็จ: ' + err.message, 'err');
        });
      }
      return;
    }
    const itemBtn = e.target.closest('[data-copy-item-idx]');
    if (itemBtn) {
      const row = flatRows[Number(itemBtn.dataset.copyItemIdx)];
      if (row) {
        itemBtn.disabled = true;
        copyRecords([row]).catch(err => {
          itemBtn.disabled = false;
          toast('คัดลอกไม่สำเร็จ: ' + err.message, 'err');
        });
      }
    }
  });
  $('#fh-week-strip', m.el).addEventListener('click', e => {
    const b = e.target.closest('[data-fh-day]');
    if (!b) return;
    activeDate = b.dataset.fhDay;
    if (rangeDays !== 0) {
      rangeDays = 0;
      $('#fh-range', m.el).value = '0';
    }
    renderStrip(false);
    search();
  });
  $('#fh-range', m.el).addEventListener('change', e => {
    rangeDays = Number(e.target.value);
    search();
  });
  $('#fh-q', m.el).addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(search, 220);
  });
  $('#fh-q', m.el).addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); search(); } });
  renderStrip(true);
  search();
}
