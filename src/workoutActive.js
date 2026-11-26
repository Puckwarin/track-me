import { openModal, confirmDialog, esc } from './util.js';
import { safeHttpUrl } from './workoutParser.js';
import {
  WORKOUT_FEELINGS,
  COMPLETION_STATUSES,
  EFFORT_LEVELS,
  WORKOUT_SYMPTOMS,
  effortLevelToSessionRpe,
  formatFeelingLabel,
  formatCompletionStatusLabel,
  formatEffortLabel,
  formatWorkoutSymptomLabel,
  isMainWorkoutSection,
  summarizeSessionNextStep
} from './workoutConstants.js';
import { iconSvg } from './icons.js';

export {
  WORKOUT_FEELINGS,
  COMPLETION_STATUSES,
  EFFORT_LEVELS,
  WORKOUT_SYMPTOMS,
  formatFeelingLabel,
  formatCompletionStatusLabel,
  formatEffortLabel,
  formatWorkoutSymptomLabel,
  summarizeSessionNextStep
};

export function getMainExerciseIndices(rows = []) {
  const indices = [];
  (rows || []).forEach((r, ri) => {
    if (isMainWorkoutSection(r?.section)) indices.push(ri);
  });
  return indices;
}

const SECTION_ORDER = ['warmup', 'main', 'cooldown'];
const SECTION_TITLES = {
  warmup: '1. วอร์มอัพ (Warm-up)',
  main: '2. ท่าหลัก (Main Workout)',
  cooldown: '3. คูลดาวน์ (Cool-down)'
};
const SECTION_SHORT = {
  warmup: '1. วอร์มอัพ',
  main: '2. ท่าหลัก',
  cooldown: '3. คูลดาวน์'
};

export const RPE_CHOICES = [
  { val: 5, label: '5 เบามาก' },
  { val: 6, label: '6 เบา' },
  { val: 7, label: '7 พอดี' },
  { val: 8, label: '8 หนัก' },
  { val: 9, label: '9 หนักมาก' },
  { val: 10, label: '10 สุดแรง' }
];

export const RIR_CHOICES = [
  { val: 0, label: '0 (หมดแรง)' },
  { val: 1, label: '1 ครั้ง' },
  { val: 2, label: '2 ครั้ง' },
  { val: 3, label: '3 ครั้ง' },
  { val: 4, label: '4+ ครั้ง' }
];

export function suggestNextProgression({ rpe = null, rir = null, completedSets = 0, plannedSets = 1 } = {}) {
  const hasRpe = Number.isFinite(rpe);
  const hasRir = Number.isFinite(rir);
  if (!hasRpe && !hasRir) return null;

  const targetSets = Math.max(1, Number(plannedSets) || 1);
  const doneSets = Math.max(0, Number(completedSets) || 0);

  if ((hasRpe && rpe >= 10) || (hasRpe && rpe >= 9 && hasRir && rir === 0)) {
    return { action: 'deload', label: 'รอบหน้าลดน้ำหนักเล็กน้อยหรือเพิ่มเวลาพัก' };
  }
  if (doneSets < targetSets && ((hasRpe && rpe >= 8) || (hasRir && rir <= 1))) {
    return { action: 'deload', label: 'พักให้ฟื้นแล้วเก็บเซตให้ครบก่อนเพิ่มโหลด' };
  }
  if (doneSets >= targetSets && ((hasRir && rir >= 3) || (hasRpe && rpe <= 6 && (!hasRir || rir >= 2)))) {
    return { action: 'increase', label: 'รอบหน้าเพิ่มน้ำหนัก (+1–2 kg) หรือเพิ่ม 1–2 ครั้ง' };
  }
  return { action: 'maintain', label: 'คงน้ำหนักและเซตเดิม โฟกัสฟอร์มให้แน่น' };
}

export function buildExerciseFeedbackSummary(rows = [], feedbackMap = {}, checkedCounts = {}) {
  const out = [];
  rows.forEach((r, ri) => {
    if (!isMainWorkoutSection(r?.section)) return;
    const entry = feedbackMap[ri];
    if (!entry) return;
    const rpe = Number.isInteger(entry.rpe) ? entry.rpe : null;
    const rir = Number.isInteger(entry.rir) ? entry.rir : null;
    if (rpe === null && rir === null) return;
    const next = suggestNextProgression({
      rpe,
      rir,
      completedSets: checkedCounts[ri] || 0,
      plannedSets: r.sets || 1
    });
    out.push({
      name: r.name,
      section: 'main',
      ...(rpe !== null && { rpe }),
      ...(rir !== null && { rir }),
      ...(next && { nextAction: next.action, nextLabel: next.label })
    });
  });
  return out;
}

export function formatExercisePrescription(r = {}) {
  const count = Math.max(1, Math.min(30, Number(r.sets) || 1));
  const unitText = r.repUnit === 'sec' ? 'วินาที' : r.repUnit === 'min' ? 'นาที' : 'ครั้ง';
  const weightText = r.weightKg != null ? `${r.weightKg} kg${r.perSide ? '/ข้าง' : ''}` : '';
  const sideRepsText = r.perSide && r.weightKg == null ? '/ข้าง' : '';
  const repsText = `${r.reps ?? '—'} ${unitText}${sideRepsText}`;
  const setRepText = count === 1 && (r.repUnit === 'sec' || r.repUnit === 'min')
    ? repsText
    : `${count} × ${repsText}`;
  return { count, weightText, setRepText };
}

export function buildSessionReflectPayload({
  completionStatus = '',
  effortLevel = '',
  postSymptom = '',
  reflectionNote = '',
  exerciseFeedback = []
} = {}) {
  const noteText = String(reflectionNote || '').trim();
  const sessionRpe = effortLevelToSessionRpe(effortLevel);
  const fb = Array.isArray(exerciseFeedback) ? exerciseFeedback : [];
  const hasAny = Boolean(completionStatus || effortLevel || postSymptom || noteText || fb.length > 0);
  if (!hasAny) return null;
  return {
    ...(completionStatus && { completionStatus }),
    ...(effortLevel && { effortLevel }),
    ...(sessionRpe !== null && { sessionRpe }),
    ...(postSymptom && { postSymptom }),
    ...(noteText && { reflectionNote: noteText }),
    ...(fb.length && { exerciseFeedback: fb })
  };
}

export function countTotalSets(rows = []) {
  return rows.reduce((sum, r) => sum + Math.max(1, Math.min(30, Number(r?.sets) || 1)), 0);
}

function imageMarkup(r) {
  const validImg = safeHttpUrl(r.imageUrl);
  if (validImg) {
    return `<button type="button" data-zoom-img="${esc(validImg)}" data-zoom-name="${esc(r.name)}" class="w-full h-full block focus-visible:outline-2 focus-visible:outline-brand cursor-zoom-in" aria-label="ขยายภาพท่า ${esc(r.name)}"><img data-exercise-image src="${esc(validImg)}" alt="ตัวอย่างท่า ${esc(r.name)}" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-contain bg-white p-1"></button>`;
  }
  const hintText = r.imageHint ? 'รอลิงก์รูปเต็ม' : 'ไม่มีรูป';
  return `<div data-image-placeholder class="w-full h-full bg-slate-100 text-slate-400 flex flex-col items-center justify-center gap-1 px-1.5 text-center text-[11px] leading-tight"><span class="text-xl" aria-hidden="true">🏋️</span><span>${hintText}</span></div>`;
}

function refMarkup(r) {
  const url = safeHttpUrl(r.refUrl);
  const title = (r.refTitle || '').trim();
  if (url) {
    return `<div class="pt-0.5 max-w-full min-w-0">
      <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg bg-sky-soft/80 border border-sky-200 px-2.5 py-1 text-xs text-blue-800 hover:bg-sky-soft">
        ${iconSvg('external-link', { size: 12, className: 'shrink-0' })}
        <span class="truncate min-w-0">${esc(title || url)}</span>
      </a>
    </div>`;
  }
  if (title) {
    const q = 'https://www.google.com/search?q=' + encodeURIComponent(title);
    return `<div class="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600 max-w-full min-w-0">
      <span class="break-words [overflow-wrap:anywhere] min-w-0">🔗 ${esc(title)}</span>
      <a href="${esc(q)}" target="_blank" rel="noopener noreferrer" class="text-blue-700 underline font-medium shrink-0">ค้นหาลิงก์</a>
    </div>`;
  }
  return '';
}

export function runActiveWorkout(rows, onFinish, meta = {}) {
  const started = Date.now();
  let restTimer = null;
  let restSeconds = 0;
  let activeRestPreset = 0;
  let activeSection = 'all';
  let showCompletedCards = false;
  let step = 'play'; // 'play' | 'reflect'
  let snapshotDone = [];
  let snapshotMinutes = 1;
  let snapshotCheckedCounts = {};

  const reflectState = {
    completionStatus: '',
    effortLevel: '',
    postSymptom: '',
    exerciseFeedback: {} // [ri]: { rpe: number|null, rir: number|null }
  };

  const totalSetsAll = countTotalSets(rows);
  const activeSections = SECTION_ORDER.filter(sec => rows.some(r => r.section === sec));

  const groups = activeSections.map(section => {
    const members = rows.map((r, ri) => ({ r, ri })).filter(x => x.r.section === section);
    const cards = members.map(({ r, ri }, idx) => {
      const { count, weightText, setRepText } = formatExercisePrescription(r);
      const checks = Array.from({ length: count }, (_, si) => `
        <label class="wa-set-btn" data-set-label="${ri}:${si}">
          <input type="checkbox" data-done data-ri="${ri}" data-si="${si}" class="sr-only">
          <span class="inline-flex shrink-0 opacity-60" data-set-icon aria-hidden="true">${iconSvg('circle', { size: 15 })}</span>
          <span class="whitespace-nowrap">เซต ${si + 1}</span>
        </label>`).join('');

      return `
        <article class="wa-card p-4 sm:p-5 lg:p-6 flex flex-col gap-3.5 min-w-0" data-ex-card="${ri}" data-ex-sec="${section}" data-ex-sets="${count}">
          <div class="flex items-start gap-3.5 sm:gap-4 lg:gap-5 min-w-0">
            <div class="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">${imageMarkup(r)}</div>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex items-start justify-between gap-2 min-w-0">
                <h4 class="text-base sm:text-lg lg:text-xl font-bold text-slate-800 leading-snug break-words [overflow-wrap:anywhere] min-w-0">
                  <span class="text-brand tabular-nums mr-1">${idx + 1}.</span>${esc(r.name)}
                </h4>
                <span class="hidden text-xs lg:text-sm font-semibold text-green-700 shrink-0 whitespace-nowrap" data-card-done-badge>✓ ครบ</span>
              </div>
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums text-sm sm:text-base lg:text-[1.05rem] leading-snug">
                ${weightText ? `<span class="font-semibold text-brand-dark">${esc(weightText)}</span><span class="text-slate-300" aria-hidden="true">·</span>` : ''}
                <strong class="font-bold text-slate-800">${esc(setRepText)}</strong>
                ${r.note ? `<span class="text-slate-300" aria-hidden="true">·</span><span class="font-normal text-slate-600 text-xs sm:text-sm lg:text-[0.95rem] break-words [overflow-wrap:anywhere]">${esc(r.note)}</span>` : ''}
              </div>
              ${refMarkup(r)}
            </div>
          </div>
          <div class="space-y-2 pt-0.5">
            <div class="flex items-center justify-between gap-2 text-xs lg:text-sm text-slate-500">
              <span class="tabular-nums" data-card-progress="${ri}">0 / ${count} เซต</span>
              ${count > 1 ? `<button type="button" data-toggle-all="${ri}" class="text-xs lg:text-sm font-semibold text-brand-dark hover:underline py-1 px-1.5 whitespace-nowrap">เลือกครบทุกเซต</button>` : ''}
            </div>
            <div class="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">${checks}</div>
          </div>
        </article>`;
    }).join('');

    return `
      <section class="space-y-3" data-wa-section="${section}">
        <div class="flex flex-wrap items-baseline justify-between gap-2 pb-1.5 border-b border-slate-200">
          <h3 class="text-sm sm:text-base lg:text-lg font-bold text-slate-800">${esc(SECTION_TITLES[section])}</h3>
          <span data-wa-sec-count="${section}" class="text-xs lg:text-sm text-slate-500 tabular-nums">${members.length} ท่า</span>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4 lg:gap-5">${cards}</div>
        <p data-wa-sec-done-msg="${section}" class="hidden rounded-xl bg-white/80 border border-slate-200 px-3.5 py-2.5 text-xs sm:text-sm text-emerald-700 font-medium">✓ ทำครบทุกท่าในช่วงนี้แล้ว</p>
      </section>`;
  }).join('');

  const subtitleParts = [
    meta.muscleGroup ? meta.muscleGroup.trim() : '',
    meta.durationMin ? `ประมาณ ${meta.durationMin} นาที` : '',
    `${rows.length} ท่า`
  ].filter(Boolean);

  const sectionTabsHtml = activeSections.length > 1
    ? `<div class="flex items-center gap-1 p-1 rounded-xl bg-slate-100 overflow-x-auto mt-3" role="tablist" aria-label="ช่วงการฝึก">
        <button type="button" role="tab" aria-selected="true" data-sec-tab="all" class="wa-sec-tab is-active">ทั้งหมด (${rows.length})</button>
        ${activeSections.map(sec => {
          const cnt = rows.filter(r => r.section === sec).length;
          return `<button type="button" role="tab" aria-selected="false" data-sec-tab="${sec}" class="wa-sec-tab">${esc(SECTION_SHORT[sec])} (${cnt})</button>`;
        }).join('')}
      </div>`
    : '';

  const m = openModal(
    `<header class="wa-header shrink-0 px-4 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-3.5 space-y-3">
      <div class="flex items-start justify-between gap-3 min-w-0">
        <div class="min-w-0 flex-1 space-y-0.5">
          <h3 id="wa-modal-title" class="font-bold text-lg sm:text-xl lg:text-2xl text-slate-800 leading-snug break-words [overflow-wrap:anywhere]">${esc(meta.title || 'กำลังออกกำลังกาย')}</h3>
          <p id="wa-modal-sub" class="text-xs sm:text-sm lg:text-base text-slate-500 break-words">${esc(subtitleParts.join(' · '))}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div class="text-right">
            <span class="block text-[11px] lg:text-xs text-slate-500 leading-none">เวลาฝึก</span>
            <b id="active-time" class="text-xl sm:text-2xl lg:text-[1.75rem] font-bold tabular-nums text-slate-800 leading-tight">00:00</b>
          </div>
          <button type="button" data-wa-close class="icon-btn min-w-[44px] min-h-[44px]" aria-label="ปิดหน้าต่างฝึก">${iconSvg('close', { size: 18 })}</button>
        </div>
      </div>

      <div id="wa-play-controls" class="space-y-3">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2 text-xs lg:text-sm text-slate-600 tabular-nums">
            <span id="active-progress-text">ความคืบหน้า: 0 / ${totalSetsAll} เซต (0%)</span>
            <span>แตะที่เซตเมื่อทำเสร็จ</span>
          </div>
          <div class="progress h-2"><span id="active-progress-bar" style="width:0%"></span></div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs lg:text-sm font-semibold text-slate-600 mr-0.5 whitespace-nowrap">จับเวลาพัก:</span>
            <button type="button" data-rest-sec="30" class="wa-rest-btn">30 วิ</button>
            <button type="button" data-rest-sec="60" id="active-rest" class="wa-rest-btn">60 วิ</button>
            <button type="button" data-rest-sec="90" class="wa-rest-btn">90 วิ</button>
            <button type="button" id="active-rest-stop" class="wa-rest-btn hidden">หยุด</button>
          </div>
          <div class="flex items-center gap-2.5 ml-auto">
            <button type="button" id="wa-toggle-done-cards" class="hidden chip bg-slate-100 text-slate-700 hover:bg-slate-200 !min-h-[44px] text-xs lg:text-sm"></button>
            <span id="active-rest-time" class="wa-rest-time text-sm lg:text-base font-bold tabular-nums whitespace-nowrap"></span>
          </div>
        </div>

        ${sectionTabsHtml}
      </div>
    </header>

    <div class="wa-body flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
      <div id="wa-play-view" class="space-y-6">
        <div id="wa-all-done-banner" class="hidden rounded-2xl bg-white border border-emerald-200 p-5 text-center space-y-2">
          <p class="text-base sm:text-lg font-bold text-emerald-700">🎉 ทำครบทุกท่าในแผนนี้แล้ว</p>
          <p class="text-xs sm:text-sm text-slate-600">กด "จบและประเมินผล" ด้านล่าง หรือกด "แสดงท่าที่เสร็จแล้ว" ด้านบนหากต้องการแก้ไขเซต</p>
        </div>
        ${groups}
      </div>
      <div id="wa-reflect-view" class="hidden space-y-5"></div>
    </div>

    <footer id="wa-play-footer" class="wa-footer shrink-0 px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
      <span id="active-summary" class="text-xs sm:text-sm lg:text-base font-medium text-slate-600 tabular-nums">ทำแล้ว 0 / ${totalSetsAll} เซต</span>
      <div class="flex items-center gap-2 ml-auto">
        <button type="button" data-wa-close class="btn btn-ghost min-h-[44px]">ปิด</button>
        <button type="button" id="active-finish" class="btn btn-primary min-h-[44px]">${iconSvg('check', { size: 15 })} จบและประเมินผล</button>
      </div>
    </footer>
    <footer id="wa-reflect-footer" class="wa-footer hidden shrink-0 px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-2">
      <button type="button" id="wa-back-play" class="btn btn-ghost min-h-[44px] text-xs sm:text-sm">← กลับไปแก้ไขเซต</button>
      <div class="flex items-center gap-2 ml-auto">
        <button type="button" id="wa-skip-save" class="btn btn-ghost min-h-[44px] text-xs sm:text-sm">ข้ามและบันทึกเลย</button>
        <button type="button" id="wa-save-all" class="btn btn-primary min-h-[44px]">${iconSvg('check', { size: 15 })} บันทึกผลทั้งหมด</button>
      </div>
    </footer>`,
    { size: 'xl', flush: true, staticBackdrop: true, boxClass: 'wa-modal-box' }
  );

  const titleEl = m.el.querySelector('#wa-modal-title');
  const subEl = m.el.querySelector('#wa-modal-sub');
  const timeEl = m.el.querySelector('#active-time');
  const restEl = m.el.querySelector('#active-rest-time');
  const restStopBtn = m.el.querySelector('#active-rest-stop');
  const progressText = m.el.querySelector('#active-progress-text');
  const progressBar = m.el.querySelector('#active-progress-bar');
  const summaryEl = m.el.querySelector('#active-summary');
  const finishBtn = m.el.querySelector('#active-finish');
  const playControls = m.el.querySelector('#wa-play-controls');
  const playView = m.el.querySelector('#wa-play-view');
  const reflectView = m.el.querySelector('#wa-reflect-view');
  const playFooter = m.el.querySelector('#wa-play-footer');
  const reflectFooter = m.el.querySelector('#wa-reflect-footer');
  const saveAllBtn = m.el.querySelector('#wa-save-all');
  const skipSaveBtn = m.el.querySelector('#wa-skip-save');
  const backPlayBtn = m.el.querySelector('#wa-back-play');
  const toggleDoneCardsBtn = m.el.querySelector('#wa-toggle-done-cards');
  const allDoneBanner = m.el.querySelector('#wa-all-done-banner');

  const clock = setInterval(() => {
    if (step !== 'play') return;
    const n = Math.floor((Date.now() - started) / 1000);
    timeEl.textContent = String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  }, 1000);

  const stopRestTimer = (label = '', { expired = false } = {}) => {
    clearInterval(restTimer);
    restTimer = null;
    activeRestPreset = 0;
    restEl.textContent = label;
    restEl.classList.toggle('is-expired', !!expired);
    restStopBtn?.classList.add('hidden');
    m.el.querySelectorAll('[data-rest-sec]').forEach(b => b.classList.remove('is-active'));
  };

  const clearTimers = () => {
    clearInterval(clock);
    clearInterval(restTimer);
    document.removeEventListener('keydown', onEsc);
  };

  const getCheckedCount = () => m.el.querySelectorAll('[data-done]:checked').length;

  const attemptClose = async () => {
    const checked = getCheckedCount();
    if (checked > 0 || step === 'reflect') {
      const ok = await confirmDialog({
        title: 'ออกจากการฝึกตอนนี้?',
        message: `คุณทำไปแล้ว ${checked} เซต หากปิดตอนนี้ผลและแบบประเมินจะยังไม่ถูกบันทึก`,
        confirmText: 'ออกโดยไม่บันทึก',
        cancelText: step === 'reflect' ? 'กลับไปประเมินต่อ' : 'ฝึกต่อ',
        danger: true
      });
      if (!ok) return;
    }
    clearTimers();
    m.close();
  };

  const onEsc = e => {
    if (e.key === 'Escape' && document.body.lastElementChild === m.el) {
      e.preventDefault();
      attemptClose();
    }
  };
  document.addEventListener('keydown', onEsc);

  const syncProgressUI = () => {
    const checked = getCheckedCount();
    const pct = totalSetsAll ? Math.round((checked / totalSetsAll) * 100) : 0;
    progressText.textContent = `ความคืบหน้า: ${checked} / ${totalSetsAll} เซต (${pct}%)`;
    progressBar.style.width = `${pct}%`;
    summaryEl.textContent = `ทำแล้ว ${checked} / ${totalSetsAll} เซต`;

    let completedCardsCount = 0;
    const secStats = {};

    m.el.querySelectorAll('[data-ex-card]').forEach(card => {
      const ri = card.dataset.exCard;
      const sec = card.dataset.exSec || 'main';
      const totalCardSets = Number(card.dataset.exSets) || 1;
      const doneInCard = card.querySelectorAll('[data-done]:checked').length;
      const isComplete = doneInCard === totalCardSets;
      if (isComplete) completedCardsCount++;
      const s = (secStats[sec] ||= { total: 0, done: 0 });
      s.total++;
      if (isComplete) s.done++;

      card.classList.toggle('is-complete', isComplete);
      card.classList.toggle('hidden', isComplete && !showCompletedCards);
      card.querySelector('[data-card-done-badge]')?.classList.toggle('hidden', !isComplete);
      const cardProg = card.querySelector(`[data-card-progress="${ri}"]`);
      if (cardProg) cardProg.textContent = `${doneInCard} / ${totalCardSets} เซต`;
      const toggleBtn = card.querySelector(`[data-toggle-all="${ri}"]`);
      if (toggleBtn) toggleBtn.textContent = isComplete ? 'ล้างการติ๊ก' : 'เลือกครบทุกเซต';

      card.querySelectorAll('[data-set-label]').forEach(lbl => {
        const cb = lbl.querySelector('[data-done]');
        const icon = lbl.querySelector('[data-set-icon]');
        const done = !!cb?.checked;
        lbl.classList.toggle('is-done', done);
        if (icon) {
          icon.className = done ? 'inline-flex shrink-0' : 'inline-flex shrink-0 opacity-60';
          icon.innerHTML = iconSvg(done ? 'check-circle' : 'circle', { size: 15 });
        }
      });
    });

    for (const sec of activeSections) {
      const st = secStats[sec] || { total: 0, done: 0 };
      const remaining = Math.max(0, st.total - st.done);
      const countEl = m.el.querySelector(`[data-wa-sec-count="${sec}"]`);
      if (countEl) {
        countEl.textContent = st.done > 0 && !showCompletedCards
          ? `เหลือ ${remaining} / ${st.total} ท่า`
          : `${st.total} ท่า`;
      }
      const doneMsgEl = m.el.querySelector(`[data-wa-sec-done-msg="${sec}"]`);
      if (doneMsgEl) {
        doneMsgEl.classList.toggle('hidden', !(remaining === 0 && st.total > 0 && !showCompletedCards));
      }
    }

    if (toggleDoneCardsBtn) {
      toggleDoneCardsBtn.classList.toggle('hidden', completedCardsCount === 0);
      if (completedCardsCount > 0) {
        toggleDoneCardsBtn.textContent = showCompletedCards
          ? `ซ่อนท่าที่เสร็จแล้ว (${completedCardsCount})`
          : `แสดงท่าที่เสร็จแล้ว (${completedCardsCount})`;
      }
    }
    if (allDoneBanner) {
      allDoneBanner.classList.toggle('hidden', !(completedCardsCount === rows.length && rows.length > 0 && !showCompletedCards));
    }
  };

  function renderReflectStep() {
    const mainIndices = getMainExerciseIndices(rows);

    const exCardsHtml = mainIndices.map(ri => {
      const r = rows[ri];
      const { count, weightText, setRepText } = formatExercisePrescription(r);
      const doneSets = snapshotCheckedCounts[ri] || 0;
      const cur = reflectState.exerciseFeedback[ri] || { rpe: null, rir: null };
      const suggestion = suggestNextProgression({
        rpe: cur.rpe,
        rir: cur.rir,
        completedSets: doneSets,
        plannedSets: count
      });
      const badgeTone = suggestion?.action === 'increase'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : suggestion?.action === 'deload'
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-sky-50 border-sky-200 text-sky-800';

      return `
        <div class="wa-card p-3.5 sm:p-4 lg:p-5 space-y-3 min-w-0">
          <div class="flex flex-wrap items-baseline justify-between gap-2 min-w-0">
            <div class="min-w-0">
              <h5 class="font-bold text-sm sm:text-base lg:text-lg text-slate-800 break-words">${esc(r.name)}</h5>
              <p class="text-xs lg:text-sm text-slate-500 tabular-nums">${weightText ? `${esc(weightText)} · ` : ''}${esc(setRepText)} (ทำแล้ว ${doneSets}/${count} เซต)</p>
            </div>
          </div>

          <div class="space-y-1.5">
            <p class="text-xs lg:text-sm font-semibold text-slate-600">ความเหนื่อยของท่านี้ (RPE)</p>
            <div class="flex flex-wrap gap-1.5">
              ${RPE_CHOICES.map(c => `<button type="button" data-ex-rpe="${ri}:${c.val}" class="wa-eval-btn ${cur.rpe === c.val ? 'is-active' : ''}">${esc(c.label)}</button>`).join('')}
            </div>
          </div>

          <div class="space-y-1.5">
            <p class="text-xs lg:text-sm font-semibold text-slate-600">คาดว่าทำต่อได้อีกกี่ครั้งก่อนหมดแรง (RIR)</p>
            <div class="flex flex-wrap gap-1.5">
              ${RIR_CHOICES.map(c => `<button type="button" data-ex-rir="${ri}:${c.val}" class="wa-eval-btn ${cur.rir === c.val ? 'is-active' : ''}">${esc(c.label)}</button>`).join('')}
            </div>
          </div>

          ${suggestion ? `<div class="rounded-xl border px-3 py-2 text-xs lg:text-sm font-medium ${badgeTone}">💡 แนะนำรอบหน้า: ${esc(suggestion.label)}</div>` : ''}
        </div>`;
    }).join('');

    reflectView.innerHTML = `
      <section class="wa-card p-4 sm:p-5 space-y-4">
        <div>
          <h4 class="font-bold text-sm sm:text-base lg:text-lg text-slate-800">ประเมินผลหลังออกกำลังกาย</h4>
          <p class="text-xs lg:text-sm text-slate-500">เลือกเพื่อบันทึกแนวโน้มและให้ผู้ช่วย AI แนะนำการปรับโหลดรอบหน้า</p>
        </div>

        <div class="space-y-1.5">
          <p class="text-xs lg:text-sm font-semibold text-slate-700">สถานะการฝึก</p>
          <div class="grid grid-cols-2 gap-2 max-w-md">
            ${COMPLETION_STATUSES.map(item => `
              <button type="button" data-wa-comp="${item.id}" class="wa-eval-btn justify-center !py-2.5 ${reflectState.completionStatus === item.id ? 'is-active' : ''}">
                <span>${esc(item.label)}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="space-y-1.5">
          <p class="text-xs lg:text-sm font-semibold text-slate-700">ความเหนื่อย</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${EFFORT_LEVELS.map(item => `
              <button type="button" data-wa-effort="${item.id}" class="wa-eval-btn justify-start !py-2.5 ${reflectState.effortLevel === item.id ? 'is-active' : ''}">
                <span>${esc(item.label)}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="space-y-1.5">
          <p class="text-xs lg:text-sm font-semibold text-slate-700">อาการระหว่างหรือหลังฝึก</p>
          <div class="grid grid-cols-2 gap-2">
            ${WORKOUT_SYMPTOMS.map(item => `
              <button type="button" data-wa-symptom="${item.id}" class="wa-eval-btn justify-center !py-2.5 ${reflectState.postSymptom === item.id ? 'is-active' : ''}">
                <span>${esc(item.label)}</span>
              </button>`).join('')}
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <div>
          <h4 class="font-bold text-sm sm:text-base lg:text-lg text-slate-800">ประเมินรายท่า — เฉพาะท่าหลัก (RPE &amp; จำนวนครั้งที่เหลือ)</h4>
          <p class="text-xs lg:text-sm text-slate-500">ประเมินเฉพาะท่าหลัก (Main Workout) ไม่รวมท่าวอร์มอัพและคูลดาวน์ ระบบจะคำนวณคำแนะนำรอบถัดไปให้อัตโนมัติ</p>
        </div>
        ${mainIndices.length
          ? `<div class="grid grid-cols-1 lg:grid-cols-2 gap-3.5 lg:gap-4">${exCardsHtml}</div>`
          : `<div class="wa-card p-4 text-xs lg:text-sm text-slate-600">รอบนี้ไม่มีท่าในช่วง "ท่าหลัก (Main Workout)" จึงไม่ต้องประเมินรายท่า — สามารถบันทึกผลการประเมินด้านบนได้เลย</div>`}
      </section>`;
  }

  function enterReflectStep() {
    step = 'reflect';
    stopRestTimer('');
    snapshotMinutes = Math.max(1, Math.round((Date.now() - started) / 60000));
    snapshotCheckedCounts = {};
    snapshotDone = [...m.el.querySelectorAll('[data-done]:checked')].map(c => {
      const ri = +c.dataset.ri;
      const si = +c.dataset.si;
      snapshotCheckedCounts[ri] = (snapshotCheckedCounts[ri] || 0) + 1;
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

    titleEl.textContent = 'ประเมินหลังออกกำลังกาย';
    subEl.textContent = `${meta.title || 'บันทึกผลการฝึก'} · ทำแล้ว ${snapshotDone.length} / ${totalSetsAll} เซต · ${snapshotMinutes} นาที`;
    playControls.classList.add('hidden');
    playView.classList.add('hidden');
    playFooter.classList.add('hidden');
    reflectView.classList.remove('hidden');
    reflectFooter.classList.remove('hidden');
    renderReflectStep();
    m.el.querySelector('.wa-body')?.scrollTo({ top: 0, behavior: 'instant' });
  }

  function returnToPlayStep() {
    step = 'play';
    titleEl.textContent = meta.title || 'กำลังออกกำลังกาย';
    subEl.textContent = subtitleParts.join(' · ');
    reflectView.classList.add('hidden');
    reflectFooter.classList.add('hidden');
    playControls.classList.remove('hidden');
    playView.classList.remove('hidden');
    playFooter.classList.remove('hidden');
  }

  async function submitFinish(skipReflection = false) {
    if (saveAllBtn.disabled || skipSaveBtn.disabled) return;
    saveAllBtn.disabled = true;
    skipSaveBtn.disabled = true;
    const activeBtn = skipReflection ? skipSaveBtn : saveAllBtn;
    const prevHtml = activeBtn.innerHTML;
    activeBtn.innerHTML = `${iconSvg('fa-spinner fa-spin', { size: 15 })} กำลังบันทึก...`;

    const exerciseFeedback = skipReflection
      ? []
      : buildExerciseFeedbackSummary(rows, reflectState.exerciseFeedback, snapshotCheckedCounts);
    const feedbackPayload = skipReflection
      ? null
      : buildSessionReflectPayload({
          completionStatus: reflectState.completionStatus,
          effortLevel: reflectState.effortLevel,
          postSymptom: reflectState.postSymptom,
          exerciseFeedback
        });

    try {
      await onFinish(snapshotDone, snapshotMinutes, feedbackPayload);
      clearTimers();
      m.close();
    } catch {
      saveAllBtn.disabled = false;
      skipSaveBtn.disabled = false;
      activeBtn.innerHTML = prevHtml;
    }
  }

  m.el.addEventListener('change', e => {
    if (e.target.matches('[data-done]')) syncProgressUI();
  });

  m.el.addEventListener('click', e => {
    if (e.target.closest('[data-wa-close]')) {
      attemptClose();
      return;
    }

    if (e.target.closest('#wa-toggle-done-cards')) {
      showCompletedCards = !showCompletedCards;
      syncProgressUI();
      return;
    }

    const compBtn = e.target.closest('[data-wa-comp]');
    if (compBtn) {
      const val = compBtn.dataset.waComp;
      reflectState.completionStatus = reflectState.completionStatus === val ? '' : val;
      renderReflectStep();
      return;
    }

    const effortBtn = e.target.closest('[data-wa-effort]');
    if (effortBtn) {
      const val = effortBtn.dataset.waEffort;
      reflectState.effortLevel = reflectState.effortLevel === val ? '' : val;
      renderReflectStep();
      return;
    }

    const symBtn = e.target.closest('[data-wa-symptom]');
    if (symBtn) {
      const val = symBtn.dataset.waSymptom;
      reflectState.postSymptom = reflectState.postSymptom === val ? '' : val;
      renderReflectStep();
      return;
    }

    const exRpeBtn = e.target.closest('[data-ex-rpe]');
    if (exRpeBtn) {
      const [riStr, valStr] = exRpeBtn.dataset.exRpe.split(':');
      const ri = Number(riStr);
      const val = Number(valStr);
      const cur = reflectState.exerciseFeedback[ri] || { rpe: null, rir: null };
      reflectState.exerciseFeedback[ri] = { ...cur, rpe: cur.rpe === val ? null : val };
      renderReflectStep();
      return;
    }

    const exRirBtn = e.target.closest('[data-ex-rir]');
    if (exRirBtn) {
      const [riStr, valStr] = exRirBtn.dataset.exRir.split(':');
      const ri = Number(riStr);
      const val = Number(valStr);
      const cur = reflectState.exerciseFeedback[ri] || { rpe: null, rir: null };
      reflectState.exerciseFeedback[ri] = { ...cur, rir: cur.rir === val ? null : val };
      renderReflectStep();
      return;
    }

    const secTab = e.target.closest('[data-sec-tab]');
    if (secTab) {
      activeSection = secTab.dataset.secTab;
      m.el.querySelectorAll('[data-sec-tab]').forEach(btn => {
        const isOn = btn.dataset.secTab === activeSection;
        btn.classList.toggle('is-active', isOn);
        btn.setAttribute('aria-selected', isOn ? 'true' : 'false');
      });
      m.el.querySelectorAll('[data-wa-section]').forEach(secEl => {
        const show = activeSection === 'all' || secEl.dataset.waSection === activeSection;
        secEl.classList.toggle('hidden', !show);
      });
      return;
    }

    const toggleAllBtn = e.target.closest('[data-toggle-all]');
    if (toggleAllBtn) {
      const card = toggleAllBtn.closest('[data-ex-card]');
      const boxes = [...(card?.querySelectorAll('[data-done]') || [])];
      const allChecked = boxes.length > 0 && boxes.every(b => b.checked);
      boxes.forEach(b => { b.checked = !allChecked; });
      syncProgressUI();
      return;
    }

    if (e.target.closest('#active-rest-stop')) {
      stopRestTimer('');
      return;
    }

    const restBtn = e.target.closest('[data-rest-sec]');
    if (restBtn) {
      const sec = Math.max(5, Number(restBtn.dataset.restSec) || 60);
      clearInterval(restTimer);
      restSeconds = sec;
      activeRestPreset = sec;
      restEl.classList.remove('is-expired');
      m.el.querySelectorAll('[data-rest-sec]').forEach(b => {
        b.classList.toggle('is-active', Number(b.dataset.restSec) === activeRestPreset);
      });
      restStopBtn?.classList.remove('hidden');
      const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      restEl.textContent = `พัก ${fmt(restSeconds)}`;
      restTimer = setInterval(() => {
        restSeconds--;
        if (restSeconds > 0) {
          restEl.textContent = `พัก ${fmt(restSeconds)}`;
        } else {
          stopRestTimer('พักครบแล้ว ✓', { expired: true });
        }
      }, 1000);
      return;
    }

    const zoomBtn = e.target.closest('[data-zoom-img]');
    if (zoomBtn) {
      openModal(
        `<div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h4 class="font-bold text-slate-800 break-words min-w-0">${esc(zoomBtn.dataset.zoomName || 'ภาพประกอบท่า')}</h4>
            <button type="button" data-close class="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
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
    placeholder.className = 'w-full h-full bg-slate-100 text-slate-400 flex flex-col items-center justify-center gap-1 px-1.5 text-center text-[11px] leading-tight';
    placeholder.innerHTML = '<span class="text-xl" aria-hidden="true">🏋️</span><span>เปิดรูปไม่ได้</span>';
    holder?.append(placeholder);
  }, true);

  finishBtn.onclick = () => enterReflectStep();
  backPlayBtn.onclick = () => returnToPlayStep();
  skipSaveBtn.onclick = () => submitFinish(true);
  saveAllBtn.onclick = () => submitFinish(false);
}
