import { openModal, esc } from './util.js';
import { safeHttpUrl } from './workoutParser.js';

const SECTION_ORDER = ['warmup', 'main', 'cooldown'];
const SECTION_TITLES = {
  warmup: '1. วอร์มอัพ (Warm-up)',
  main: '2. ท่าหลัก (Main Workout)',
  cooldown: '3. คูลดาวน์ (Cool-down)'
};

function imageMarkup(r) {
  const validImg = safeHttpUrl(r.imageUrl);
  if (validImg) {
    return `<button type="button" data-zoom-img="${esc(validImg)}" data-zoom-name="${esc(r.name)}" class="w-full h-full block focus:outline-none cursor-zoom-in" aria-label="ขยายภาพท่า ${esc(r.name)}"><img data-exercise-image src="${esc(validImg)}" alt="ตัวอย่างท่า ${esc(r.name)}" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-contain bg-white p-1 rounded-2xl"></button>`;
  }
  const hintText = r.imageHint ? 'รอลิงก์รูปเต็ม' : 'ยังไม่มีภาพตัวอย่าง';
  return `<div data-image-placeholder class="w-full h-full min-h-28 rounded-2xl bg-slate-100 text-slate-400 flex flex-col items-center justify-center gap-1.5 px-2 text-center text-xs"><span class="text-2xl">🏋️</span><span>${hintText}</span></div>`;
}

function refMarkup(r) {
  const url = safeHttpUrl(r.refUrl);
  const title = (r.refTitle || '').trim();
  if (url) {
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 rounded-lg bg-sky-soft/80 border border-sky-200 px-2.5 py-1 text-xs text-blue-800 hover:bg-sky-soft"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i><span class="truncate max-w-[240px]">${esc(title || url)}</span></a>`;
  }
  if (title) {
    const q = 'https://www.google.com/search?q=' + encodeURIComponent(title);
    return `<div class="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600"><span>🔗 ${esc(title)}</span><a href="${esc(q)}" target="_blank" rel="noopener noreferrer" class="text-blue-700 underline font-medium">ค้นหาลิงก์</a></div>`;
  }
  return '';
}

export function runActiveWorkout(rows, onFinish, meta = {}) {
  const started = Date.now();
  let restTimer = null;
  let restSeconds = 0;

  const groups = SECTION_ORDER.map(section => {
    const members = rows.map((r, ri) => ({ r, ri })).filter(x => x.r.section === section);
    if (!members.length) return '';
    const cards = members.map(({ r, ri }) => {
      const count = Math.max(1, Math.min(30, Number(r.sets) || 1));
      const checks = Array.from({ length: count }, (_, si) =>
        `<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 min-h-[44px] text-sm cursor-pointer hover:bg-slate-50"><input type="checkbox" data-done data-ri="${ri}" data-si="${si}" class="accent-brand"> เซต ${si + 1}</label>`
      ).join('');
      const weight = r.weightKg != null
        ? `<span class="text-sm font-medium text-slate-700">${esc(r.weightKg)} kg${r.perSide ? '/ข้าง' : ''}</span><span class="text-slate-300" aria-hidden="true">·</span>`
        : '';
      const unitText = r.repUnit === 'sec' ? 'วินาที' : r.repUnit === 'min' ? 'นาที' : 'ครั้ง';
      const sideText = r.perSide && r.weightKg == null ? '/ข้าง' : '';
      const reps = `${r.reps ?? '—'} ${unitText}${sideText}`;
      return `<article class="grid grid-cols-[5rem_1fr] gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(9rem,11rem)_1fr] md:gap-5 md:p-5">
        <div class="aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white md:aspect-[4/5]">${imageMarkup(r)}</div>
        <div class="min-w-0 space-y-2 md:space-y-2.5">
          <h4 class="text-base font-semibold text-slate-800 md:text-lg">${esc(r.name)}</h4>
          <div class="flex flex-wrap items-center gap-2 tabular-nums">${weight}<strong class="text-base md:text-lg text-slate-800">${count} × ${esc(reps)}</strong></div>
          ${refMarkup(r)}
          ${r.note ? `<p class="text-sm leading-relaxed text-slate-600 md:text-base">${esc(r.note)}</p>` : ''}
          <div class="flex flex-wrap gap-2 pt-1">${checks}</div>
        </div>
      </article>`;
    }).join('');
    return `<section class="space-y-3"><h3 class="font-semibold text-slate-700">${esc(SECTION_TITLES[section])}</h3><div class="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5">${cards}</div></section>`;
  }).join('');

  const subtitleParts = [
    meta.muscleGroup ? meta.muscleGroup.trim() : '',
    meta.durationMin ? `ประมาณ ${meta.durationMin} นาที` : ''
  ].filter(Boolean);

  const m = openModal(
    `<div class="flex justify-between items-start gap-3">
      <div class="min-w-0">
        <h3 class="font-bold text-lg md:text-xl text-slate-800 truncate">${esc(meta.title || 'กำลังออกกำลังกาย')}</h3>
        <p class="text-sm text-slate-500">${esc(subtitleParts.length ? subtitleParts.join(' · ') + ' · แตะเมื่อทำแต่ละเซตเสร็จ' : 'แตะเมื่อทำแต่ละเซตเสร็จ')}</p>
      </div>
      <b id="active-time" class="text-lg tabular-nums shrink-0 text-slate-800">00:00</b>
    </div>
    <div class="flex flex-wrap items-center gap-2 mt-3">
      <button type="button" data-rest-sec="30" class="chip bg-slate-100 text-slate-700 min-h-[40px]">พัก 30 วิ</button>
      <button type="button" data-rest-sec="60" id="active-rest" class="btn btn-soft !py-1.5 !px-3.5 !min-h-[40px]">พัก 60 วินาที</button>
      <button type="button" data-rest-sec="90" class="chip bg-slate-100 text-slate-700 min-h-[40px]">พัก 90 วิ</button>
      <span id="active-rest-time" class="self-center text-sm font-medium tabular-nums text-slate-600 ml-1"></span>
    </div>
    <div class="max-h-[55vh] overflow-y-auto md:max-h-[65vh] space-y-5 mt-4 pr-1">${groups}</div>
    <div class="flex justify-end gap-2 mt-4">
      <button type="button" data-close class="btn btn-ghost">ปิด</button>
      <button type="button" id="active-finish" class="btn btn-primary">จบและบันทึกผล</button>
    </div>`,
    { wide: true }
  );

  const time = m.el.querySelector('#active-time');
  const rest = m.el.querySelector('#active-rest-time');
  const clock = setInterval(() => {
    const n = Math.floor((Date.now() - started) / 1000);
    time.textContent = String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  }, 1000);
  const clear = () => {
    clearInterval(clock);
    clearInterval(restTimer);
  };

  m.el.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) clear();
    const restBtn = e.target.closest('[data-rest-sec]');
    if (restBtn) {
      const sec = Math.max(5, Number(restBtn.dataset.restSec) || 60);
      clearInterval(restTimer);
      restSeconds = sec;
      const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      rest.textContent = fmt(restSeconds);
      restTimer = setInterval(() => {
        restSeconds--;
        rest.textContent = restSeconds > 0 ? fmt(restSeconds) : 'พักครบแล้ว';
        if (restSeconds <= 0) clearInterval(restTimer);
      }, 1000);
      return;
    }
    const zoomBtn = e.target.closest('[data-zoom-img]');
    if (zoomBtn) {
      openModal(
        `<div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h4 class="font-bold text-slate-800">${esc(zoomBtn.dataset.zoomName || 'ภาพประกอบท่า')}</h4>
            <button type="button" data-close class="btn btn-ghost !py-1 !px-3 !min-h-[36px] text-xs">ปิด</button>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-2 flex items-center justify-center max-h-[68vh] overflow-hidden">
            <img src="${esc(zoomBtn.dataset.zoomImg)}" alt="${esc(zoomBtn.dataset.zoomName || '')}" referrerpolicy="no-referrer" class="max-h-[64vh] w-auto object-contain rounded-xl">
          </div>
        </div>`
      );
    }
  });

  m.el.addEventListener('error', e => {
    if (!e.target.matches('[data-exercise-image]')) return;
    const holder = e.target.closest('div');
    e.target.closest('button')?.remove() || e.target.remove();
    const placeholder = document.createElement('div');
    placeholder.dataset.imagePlaceholder = '';
    placeholder.className = 'w-full h-full min-h-28 rounded-2xl bg-slate-100 text-slate-400 flex flex-col items-center justify-center gap-1.5 px-2 text-center text-xs';
    placeholder.innerHTML = '<span class="text-2xl">🏋️</span><span>ภาพนี้เปิดไม่ได้</span>';
    holder?.append(placeholder);
  }, true);

  m.el.querySelector('#active-finish').onclick = async () => {
    const done = [...m.el.querySelectorAll('[data-done]:checked')].map(c => {
      const ri = +c.dataset.ri;
      const si = +c.dataset.si;
      const r = rows[ri];
      return {
        name: r.name,
        section: r.section,
        set: si + 1,
        weightKg: r.weightKg ?? null,
        reps: r.reps ?? null,
        repUnit: r.repUnit || 'reps',
        completed: true
      };
    });
    await onFinish(done, Math.max(1, Math.round((Date.now() - started) / 60000)));
    clear();
    m.close();
  };
}