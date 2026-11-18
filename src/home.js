// หน้า Home: Daily Overview, Quick Access, Planner, Daily Activity และ Reminders
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, round1, toast, daysBetween } from './util.js';
import { getTargets } from './profile.js';
import { collectReminders, remindersForDate } from './reminders.js';
import { CATEGORIES } from './categories.js';
import { TYPES } from './workoutConstants.js';
import { bodyLatest } from './body.js';
import { getPushStatus, enablePushNotifications } from './push.js';
import { reportRuntimeError } from './runtimeErrorMonitor.js';
import { iconSvg, iconBubble } from './icons.js';
import { animateNumberTicker } from './ui.js';

export const HOME_WIDGET_IDS = ['daily-overview', 'quick-access', 'planner', 'daily-activity', 'reminders'];
export const HOME_WIDGET_DEFS = [
  { id: 'daily-overview', label: 'สรุปภาพรวมวันนี้' },
  { id: 'quick-access', label: 'ทางลัดบันทึกด่วน' },
  { id: 'planner', label: 'Weekly Planner & กิจวัตร' },
  { id: 'daily-activity', label: 'กิจกรรม & บันทึกล่าสุด' },
  { id: 'reminders', label: 'แจ้งเตือนที่ต้องดูแล' }
];

const WIDGET_STORAGE_KEY = 'trackme_home_widgets:v1:';

let go = () => {};
let plannerFeature = null;
let plannerMountPromise = null;
let plannerExpanded = false;

export function getHomeWidgetConfig() {
  let raw = null;
  if (state.uid && typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(WIDGET_STORAGE_KEY + state.uid);
      if (stored) raw = JSON.parse(stored);
    } catch { raw = null; }
  }
  raw ||= state.homeWidgets || state.profile?.homeWidgets || null;
  const hiddenSet = new Set(Array.isArray(raw?.hidden) ? raw.hidden.filter(id => HOME_WIDGET_IDS.includes(id)) : []);
  const requestedOrder = Array.isArray(raw?.order) ? [...new Set(raw.order.filter(id => HOME_WIDGET_IDS.includes(id)))] : [];
  const order = [...requestedOrder, ...HOME_WIDGET_IDS.filter(id => !requestedOrder.includes(id))];
  const validShortcuts = new Set(CATEGORIES.flatMap(category => [category.key, category.tab]));
  const pinnedShortcuts = Array.isArray(raw?.pinnedShortcuts)
    ? [...new Set(raw.pinnedShortcuts.filter(item => validShortcuts.has(item)))]
    : [];
  return { order, hidden: hiddenSet, pinnedShortcuts };
}

export function saveHomeWidgetConfig(config) {
  if (!state.uid || typeof localStorage === 'undefined') return false;
  const requestedOrder = Array.isArray(config?.order) ? [...new Set(config.order.filter(id => HOME_WIDGET_IDS.includes(id)))] : [];
  const validShortcuts = new Set(CATEGORIES.flatMap(category => [category.key, category.tab]));
  const safe = {
    order: [...requestedOrder, ...HOME_WIDGET_IDS.filter(id => !requestedOrder.includes(id))],
    hidden: [...new Set(Array.isArray(config?.hidden) ? config.hidden.filter(id => HOME_WIDGET_IDS.includes(id)) : [])],
    pinnedShortcuts: Array.isArray(config?.pinnedShortcuts)
      ? [...new Set(config.pinnedShortcuts.filter(item => validShortcuts.has(item)))]
      : []
  };
  try {
    localStorage.setItem(WIDGET_STORAGE_KEY + state.uid, JSON.stringify(safe));
  } catch {
    return false;
  }
  state.homeWidgets = safe;
  if (typeof document !== 'undefined') renderHome();
  return true;
}

export function resetHomePlannerToToday() {
  plannerFeature?.resetPlannerToToday?.();
}

export function resetHomePlannerState() {
  plannerExpanded = false;
}

export function ensureHomePlannerLoaded() {
  plannerExpanded = true;
  const container = $('#home-planner');
  if (!container) return Promise.resolve();
  if (!plannerMountPromise) {
    const btn = $('#home-planner-open', container);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${iconSvg('fa-spinner fa-spin', { size: 15 })} กำลังโหลด Planner...`;
    }
    plannerMountPromise = import('./planner.js')
      .then(module => {
        plannerFeature = module;
        module.mountPlanner(container, go);
        module.renderPlanner();
      })
      .catch(error => {
        plannerMountPromise = null;
        plannerExpanded = false;
        reportRuntimeError(error, { category: 'chunk', source: 'feature-load' });
        toast('เปิด Planner ไม่สำเร็จ: ' + (error?.message || 'โหลดโมดูลไม่ได้'), 'err');
        renderHome();
      });
  } else if (plannerFeature) {
    plannerFeature.mountPlanner(container, go);
    plannerFeature.renderPlanner();
  }
  return plannerMountPromise;
}

function renderPlannerTeaser(host, today) {
  if (!host) return;
  const routines = Array.isArray(state.planner?.routines) ? state.planner.routines : [];
  const todayWorkouts = (state.workouts || []).filter(w => w.date === today);
  const doneWorkouts = todayWorkouts.filter(w => w.status !== 'planned').length;
  const dayReminders = remindersForDate(today);
  const doneMapToday = Array.isArray(state.planner?.doneMap?.[today]) ? state.planner.doneMap[today].length : 0;

  const metaParts = [esc(fmtDate(today))];
  if (todayWorkouts.length) metaParts.push(`ออกกำลังกาย ${doneWorkouts}/${todayWorkouts.length}`);
  if (routines.length) metaParts.push(`กิจวัตร ${routines.length} รายการ${doneMapToday ? ` · ทำแล้ว ${doneMapToday}` : ''}`);
  if (!todayWorkouts.length && !routines.length) metaParts.push('ตั้งกิจวัตรประจำวันและแผนออกกำลังกายได้ที่นี่');

  host.innerHTML = `
  <section class="card space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
          ${iconBubble('planner', { small: true, cat: 'cat-workout' })}
          <span>Weekly Planner & กิจวัตร</span>
        </h2>
        <p class="text-xs text-slate-600 mt-1 tabular-nums">${metaParts.join(' · ')}</p>
      </div>
      <button type="button" id="home-planner-open" class="btn btn-primary text-xs shrink-0 whitespace-nowrap">
        ${iconSvg('planner', { size: 15 })} เปิดเช็กลิสต์ Planner
      </button>
    </div>
    ${dayReminders.length ? `
    <div class="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-xs space-y-1.5">
      <p class="font-semibold text-amber-900">นัดหมายและเตือนวันนี้ (${dayReminders.length})</p>
      <ul class="space-y-1 text-amber-950">
        ${dayReminders.slice(0, 3).map(r => `<li class="flex items-center gap-2 min-w-0"><span aria-hidden="true">${r.icon}</span><span class="truncate font-medium">${esc(r.label)}</span>${r.dueTime ? `<span class="text-amber-800 tabular-nums shrink-0">${esc(r.dueTime)} น.</span>` : ''}</li>`).join('')}
      </ul>
    </div>` : ''}
  </section>`;
}

export function mountHome(navigate) {
  go = navigate;
  const el = $('#home-today');
  el.innerHTML = `
    <section id="home-head" class="space-y-2"></section>
    <div id="home-widgets" class="space-y-4">
      <div id="home-slot-daily-overview"></div>
      <div id="home-slot-quick-access"></div>
      <div id="home-planner"></div>
      <div id="home-slot-daily-activity"></div>
      <div id="home-slot-reminders"></div>
    </div>`;

  el.addEventListener('click', async e => {
    const plannerBtn = e.target.closest('#home-planner-open');
    if (plannerBtn) {
      void ensureHomePlannerLoaded();
      return;
    }
    const pushBtn = e.target.closest('#home-push-btn');
    if (pushBtn) {
      pushBtn.disabled = true;
      try {
        await enablePushNotifications();
        toast('เปิดรับการแจ้งเตือน 12:15 น. เรียบร้อยแล้ว');
        renderHome();
      } catch (err) {
        toast(err.message, 'err');
        if (err.message.includes('VAPID')) go('settings', 'st-push-card');
      } finally {
        pushBtn.disabled = false;
      }
      return;
    }
    const b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go, b.dataset.focus || null);
  });
}

const num = v => (Number.isFinite(+v) ? +v : 0);
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return ['ราตรีสวัสดิ์', 'moon'];
  if (h < 12) return ['อรุณสวัสดิ์', 'sun'];
  if (h < 17) return ['สวัสดีตอนบ่าย', 'sun'];
  if (h < 20) return ['สวัสดีตอนเย็น', 'moon'];
  return ['ราตรีสวัสดิ์', 'moon'];
}

function buildDailyOverviewHtml(today, foods, targets, monthExps, todayExps, allReminders) {
  const foodLoaded = !!state.loaded?.todayFood;
  const kcal = Math.round(foods.reduce((a, i) => a + num(i.calories), 0));
  const todayWorkouts = (state.workouts || []).filter(w => w.date === today);
  const doneWorkouts = todayWorkouts.filter(w => w.status !== 'planned');
  const latestBody = bodyLatest(state.body || []);
  const overdueCount = allReminders.filter(r => r.date && r.date < today).length;
  const dueTodayCount = allReminders.filter(r => r.date === today).length;
  const spentToday = todayExps.filter(x => x.type !== 'income').reduce((a, x) => a + num(x.amount), 0);

  const pulseItems = [];

  if (!foodLoaded && !foods.length) {
    pulseItems.push({
      tab: 'food',
      label: 'อาหารวันนี้',
      value: 'กำลังโหลด...',
      sub: `เป้า ${targets.kcal.toLocaleString()} kcal`,
      tone: 'bg-slate-50 border-slate-100'
    });
  } else if (foods.length > 0) {
    const left = targets.kcal - kcal;
    pulseItems.push({
      tab: 'food',
      label: 'พลังงานวันนี้',
      value: `${kcal.toLocaleString()} kcal`,
      sub: left >= 0 ? `เหลือ ${Math.round(left).toLocaleString()} kcal · ${foods.length} รายการ` : `เกินเป้า ${Math.round(-left).toLocaleString()} kcal · ${foods.length} รายการ`,
      tone: 'cat-food bg-white border-slate-100'
    });
  } else {
    pulseItems.push({
      tab: 'food',
      label: 'อาหารวันนี้',
      value: 'ยังไม่บันทึก',
      sub: `เป้า ${targets.kcal.toLocaleString()} kcal · แตะเพื่อจดมื้อแรก`,
      tone: 'bg-slate-50 border-slate-100'
    });
  }

  if (doneWorkouts.length > 0) {
    const mins = doneWorkouts.reduce((a, w) => a + num(w.durationMin), 0);
    pulseItems.push({
      tab: 'workout',
      label: 'ออกกำลังกายวันนี้',
      value: `${doneWorkouts.length} ครั้ง`,
      sub: mins ? `รวม ${mins} นาที` : 'บันทึกแล้ววันนี้',
      tone: 'bg-white border-slate-100'
    });
  } else if (todayWorkouts.length > 0) {
    pulseItems.push({
      tab: 'workout',
      label: 'แผนออกกำลังกาย',
      value: `${todayWorkouts.length} แผนวันนี้`,
      sub: 'แตะเพื่อเริ่มบันทึก',
      tone: 'bg-white border-slate-100'
    });
  } else if (latestBody.weight) {
    pulseItems.push({
      tab: 'body',
      label: 'น้ำหนักล่าสุด',
      value: `${latestBody.weight.v} กก.`,
      sub: fmtDate(latestBody.weight.d),
      tone: 'bg-white border-slate-100'
    });
  } else {
    pulseItems.push({
      tab: 'workout',
      label: 'ออกกำลังกาย',
      value: 'ยังไม่บันทึกวันนี้',
      sub: 'เริ่มบันทึกหรือตั้งแผนได้ที่นี่',
      tone: 'bg-slate-50 border-slate-100'
    });
  }

  if (todayExps.length > 0) {
    pulseItems.push({
      tab: 'expense',
      label: 'ใช้จ่ายวันนี้',
      value: `฿${spentToday.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`,
      sub: `${todayExps.length} รายการวันนี้`,
      tone: 'bg-white border-slate-100'
    });
  } else if (monthExps.length > 0) {
    const spentMonth = monthExps.filter(x => x.type !== 'income').reduce((a, x) => a + num(x.amount), 0);
    pulseItems.push({
      tab: 'expense',
      label: 'ใช้จ่ายเดือนนี้',
      value: `฿${spentMonth.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`,
      sub: `วันนี้ยังไม่จ่าย · ${monthExps.length} รายการเดือนนี้`,
      tone: 'bg-white border-slate-100'
    });
  } else {
    pulseItems.push({
      tab: 'expense',
      label: 'รายรับ-จ่าย',
      value: 'ยังไม่มีรายการ',
      sub: 'จดหรือสแกนสลิปในเครื่อง',
      tone: 'bg-slate-50 border-slate-100'
    });
  }

  pulseItems.push({
    tab: 'notifications',
    label: 'รายการเตือน',
    value: allReminders.length ? `${allReminders.length} รายการ` : 'เรียบร้อยดี',
    sub: overdueCount ? `เลยกำหนด ${overdueCount} · วันนี้ ${dueTodayCount}` : dueTodayCount ? `ถึงกำหนดวันนี้ ${dueTodayCount} รายการ` : 'ไม่มีรายการเร่งด่วน',
    tone: overdueCount ? 'bg-rose-50/70 border-rose-200' : 'bg-white border-slate-100'
  });

  const kcalGoal = Math.max(0, num(targets?.kcal));
  const rawPct = kcalGoal > 0 ? Math.round((kcal / kcalGoal) * 100) : 0;
  const ringPct = Math.max(0, Math.min(100, rawPct));
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ringPct / 100);
  const isOver = kcalGoal > 0 && kcal > kcalGoal;
  const ringStroke = !foods.length ? '#CBDCEB' : isOver ? '#F59E0B' : '#3E8FCF';

  return `
    <section class="card cozy-hero card-shine space-y-3.5" aria-label="สรุปประจำวัน">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 space-y-0.5">
          <span class="text-xs font-medium text-slate-600">ภาพรวมวันนี้ · ข้อมูลจริงจากการบันทึก</span>
          <div class="flex items-baseline gap-2 flex-wrap tabular-nums">
            <span class="text-2xl sm:text-3xl font-bold tm-gradient-text">${foods.length ? `${rawPct}%` : 'พร้อมดูแล'}</span>
            <span class="text-xs text-slate-600">${foods.length && kcalGoal ? `ของเป้า ${kcalGoal.toLocaleString()} kcal` : (kcalGoal ? `เป้าพลังงาน ${kcalGoal.toLocaleString()} kcal` : 'บันทึกสุขภาพประจำวันได้ทันที')}</span>
          </div>
        </div>
        <div class="relative shrink-0 w-[78px] h-[78px] flex items-center justify-center" aria-hidden="true">
          <svg class="tm-ring-svg w-[78px] h-[78px]" viewBox="0 0 78 78">
            <circle cx="39" cy="39" r="${radius}" fill="none" stroke="rgba(96,178,236,0.22)" stroke-width="6.5"/>
            <circle cx="39" cy="39" r="${radius}" fill="none" stroke="${ringStroke}" stroke-width="6.5" stroke-linecap="round"
              stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${dashOffset.toFixed(1)}"
              transform="rotate(-90 39 39)"/>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center leading-tight tabular-nums">
            <span id="home-kcal-ticker" class="text-sm font-bold text-slate-800">${foods.length ? kcal.toLocaleString('th-TH') : '—'}</span>
            <span class="text-[10px] text-slate-500">kcal</span>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        ${pulseItems.map(item => `
          <button type="button" data-go="${item.tab}" class="text-left rounded-2xl border p-3 min-h-[44px] transition-colors hover:bg-lav-soft/40 ${item.tone}">
            <span class="block text-xs text-slate-600 truncate">${esc(item.label)}</span>
            <span class="block text-base font-bold text-slate-800 mt-0.5 tabular-nums truncate">${esc(item.value)}</span>
            <span class="block text-[11px] text-slate-500 mt-0.5 truncate">${esc(item.sub)}</span>
          </button>`).join('')}
      </div>
    </section>`;
}

function buildQuickAccessHtml(config) {
  let items = CATEGORIES;
  let isCustom = false;
  if (config.pinnedShortcuts.length) {
    const matched = config.pinnedShortcuts
      .map(key => CATEGORIES.find(c => c.key === key || c.tab === key))
      .filter(Boolean);
    if (matched.length) {
      items = matched;
      isCustom = true;
    }
  }
  return `
    <section class="space-y-2.5" aria-label="ทางลัดหมวดหมู่">
      <div class="flex items-center justify-between gap-2 px-1">
        <h2 class="text-base font-bold text-slate-800">ไปที่หมวด</h2>
        <span class="text-xs text-slate-500">${isCustom ? `ทางลัดที่ปักหมุด (${items.length})` : `ครบทั้ง ${items.length} หมวดหลัก`}</span>
      </div>
      <div class="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        ${items.map(c => `
          <button type="button" data-go="${c.tab}" ${c.focus ? `data-focus="${c.focus}"` : ''} class="cat-tile ${c.cat} min-h-[44px]">
            ${iconBubble(c.icon || c.key)}
            <span class="truncate max-w-full px-1">${esc(c.label)}</span>
          </button>`).join('')}
      </div>
    </section>`;
}

function buildDailyActivityHtml(today, foods, targets, monthExps, todayExps) {
  const foodLoaded = !!state.loaded?.todayFood;
  const sum = k => foods.reduce((a, i) => a + num(i[k]), 0);
  const kcal = Math.round(sum('calories'));
  const pct = targets.kcal ? Math.min(100, Math.round((kcal / targets.kcal) * 100)) : 0;
  const left = targets.kcal - kcal;
  const macro = (label, v, goal) => `<div class="macro"><span>${label}</span><b class="tabular-nums">${foods.length ? round1(v) : '—'}<small>/${goal ?? '-'}g</small></b></div>`;

  const foodCard = `
    <button type="button" data-go="food" class="card food-today cat-food w-full text-left flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="tile-head">${iconBubble('food', { small: true })}<span>อาหารวันนี้</span></span>
          <span class="text-xs text-slate-600 tabular-nums">${!foodLoaded && !foods.length ? 'กำลังโหลด...' : foods.length ? `${foods.length} รายการ` : 'ยังไม่บันทึก'}</span>
        </div>
        ${foods.length ? `
          <div class="flex items-baseline justify-between gap-2 mt-2.5">
            <div class="tabular-nums"><span class="text-2xl font-bold text-slate-800">${kcal.toLocaleString()}</span><span class="text-sm text-slate-600"> / ${targets.kcal.toLocaleString()} kcal</span></div>
            <span class="text-xs font-medium tabular-nums ${left >= 0 ? 'text-slate-600' : 'text-amber-800'}">${left >= 0 ? `เหลือ ${Math.round(left).toLocaleString()}` : `เกิน ${Math.round(-left).toLocaleString()}`}</span>
          </div>
          <div class="progress mt-2.5" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <p class="text-xs text-slate-600 mt-2 truncate">ล่าสุด: ${esc(foods.slice(0, 2).map(f => f.name).join(' · '))}</p>
        ` : `
          <div class="mt-2.5 space-y-1">
            <p class="text-base font-bold text-slate-800">${foodLoaded ? 'ยังไม่ได้บันทึกอาหารวันนี้' : 'กำลังซิงค์รายการอาหาร...'}</p>
            <p class="text-xs text-slate-600 tabular-nums">เป้าหมายวันนี้ ${targets.kcal.toLocaleString()} kcal · แตะเพื่อเพิ่มมื้ออาหาร</p>
          </div>
          <div class="progress mt-2.5" aria-hidden="true"><span style="width:0%"></span></div>
        `}
      </div>
      <div class="grid grid-cols-3 gap-2 mt-3">${macro('โปรตีน', sum('protein'), targets.protein)}${macro('คาร์บ', sum('carbs'), targets.carbs)}${macro('ไขมัน', sum('fat'), targets.fat)}</div>
    </button>`;

  const recentWorkouts = (state.workouts || [])
    .filter(w => w.status !== 'planned')
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const latestWorkout = recentWorkouts[0] || null;
  const plannedToday = (state.workouts || []).filter(w => w.date === today && w.status === 'planned');
  const body = bodyLatest(state.body || []);
  const bodySignals = [
    body.weight ? `น้ำหนัก ${body.weight.v} กก. (${fmtDate(body.weight.d)})` : '',
    body.sleepHours ? `นอน ${round1(body.sleepHours.v)} ชม.` : '',
    body.steps ? `${Math.round(body.steps.v).toLocaleString()} ก้าว` : ''
  ].filter(Boolean);

  const activityCard = `
    <div class="card cat-workout flex flex-col justify-between space-y-3">
      <div class="flex items-center justify-between gap-2">
        <span class="tile-head">${iconBubble('workout', { small: true })}<span>กิจกรรม & ร่างกาย</span></span>
        <button type="button" data-go="workout" class="text-xs font-medium text-brand-dark underline min-h-[32px]">เปิดบันทึก</button>
      </div>
      <div class="space-y-2 text-sm">
        ${latestWorkout ? `
          <button type="button" data-go="workout" class="w-full text-left rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 hover:bg-lav-soft/40 transition-colors">
            <span class="block text-xs text-slate-500">ออกกำลังกายล่าสุด · ${esc(fmtDate(latestWorkout.date))}</span>
            <span class="block font-semibold text-slate-800 mt-0.5 truncate">${esc(TYPES[latestWorkout.type] || latestWorkout.type || 'ออกกำลังกาย')}${latestWorkout.title ? ` — ${esc(latestWorkout.title)}` : ''}</span>
            <span class="block text-xs text-slate-600 tabular-nums mt-0.5">${latestWorkout.durationMin ? `${latestWorkout.durationMin} นาที` : 'บันทึกแล้ว'}${latestWorkout.estKcal ? ` · ~${latestWorkout.estKcal} kcal` : ''}</span>
          </button>
        ` : plannedToday.length ? `
          <button type="button" data-go="workout" class="w-full text-left rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 hover:bg-lav-soft/40 transition-colors">
            <span class="block text-xs text-slate-500">แผนวันนี้</span>
            <span class="block font-semibold text-slate-800 mt-0.5 truncate">${esc(plannedToday[0].title || TYPES[plannedToday[0].type] || 'ออกกำลังกายตามแผน')}</span>
            <span class="block text-xs text-slate-600 mt-0.5">รอทำอีก ${plannedToday.length} รายการ</span>
          </button>
        ` : `
          <button type="button" data-go="workout" class="w-full text-left rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 hover:bg-lav-soft/40 transition-colors">
            <span class="block font-medium text-slate-700">ยังไม่มีบันทึกออกกำลังกาย</span>
            <span class="block text-xs text-slate-500 mt-0.5">แตะเพื่อบันทึกการเคลื่อนไหวหรือสร้างแผน</span>
          </button>
        `}
        ${bodySignals.length ? `
          <button type="button" data-go="body" class="w-full text-left rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 hover:bg-lav-soft/40 transition-colors">
            <span class="block text-xs text-slate-500">อัปเดตร่างกายล่าสุด</span>
            <span class="block text-xs font-medium text-slate-800 mt-0.5 tabular-nums">${esc(bodySignals.join(' · '))}</span>
          </button>
        ` : `
          <button type="button" data-go="body" class="w-full text-left rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 hover:bg-lav-soft/40 transition-colors">
            <span class="block text-xs text-slate-500">ยังไม่มีบันทึกน้ำหนัก · นอน · ก้าวเดิน</span>
          </button>
        `}
      </div>
    </div>`;

  const spentMonth = monthExps.filter(x => x.type !== 'income').reduce((a, x) => a + num(x.amount), 0);
  const incomeMonth = monthExps.filter(x => x.type === 'income').reduce((a, x) => a + num(x.amount), 0);
  const spentToday = todayExps.filter(x => x.type !== 'income').reduce((a, x) => a + num(x.amount), 0);
  const latestExp = monthExps.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;

  const financeCard = `
    <button type="button" data-go="expense" class="card cat-body sm:col-span-2 w-full text-left flex flex-wrap items-center justify-between gap-3">
      <div class="space-y-1 min-w-0">
        <span class="tile-head">${iconBubble('expense', { small: true })}<span>การเงินเดือนนี้ & สแกนสลิป</span></span>
        ${monthExps.length ? `
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-1 tabular-nums">
            <span class="text-xl font-bold text-rose-700">จ่าย ฿${spentMonth.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</span>
            ${incomeMonth > 0 ? `<span class="text-sm font-semibold text-emerald-700">รับ ฿${incomeMonth.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</span>` : ''}
          </div>
          <p class="text-xs text-slate-600 tabular-nums">
            ${todayExps.length ? `วันนี้จ่าย ฿${spentToday.toLocaleString('th-TH', { maximumFractionDigits: 2 })}` : 'วันนี้ยังไม่มีรายจ่าย'}${latestExp ? ` · ล่าสุด: ${esc(latestExp.note || latestExp.category || 'รายการ')} ฿${num(latestExp.amount).toLocaleString('th-TH')}` : ''}
          </p>
        ` : `
          <p class="text-base font-bold text-slate-800 pt-1">ยังไม่มีรายการรายรับ-รายจ่ายเดือนนี้</p>
          <p class="text-xs text-slate-600">แตะเพื่อจดรายจ่าย หรือสแกนสลิปโอนเงินในเครื่อง</p>
        `}
      </div>
      <span class="text-xs font-medium text-slate-600 shrink-0 tabular-nums">${monthExps.length ? `${monthExps.length} รายการเดือนนี้` : 'เริ่มจดรายการ →'}</span>
    </button>`;

  return `
    <section class="space-y-2.5" aria-label="กิจกรรมและบันทึกล่าสุด">
      <div class="flex items-center justify-between gap-2 px-1">
        <h2 class="text-base font-bold text-slate-800">กิจกรรมและบันทึกวันนี้</h2>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${foodCard}
        ${activityCard}
        ${financeCard}
      </div>
    </section>`;
}

function buildRemindersHtml(today, reminders) {
  const formatUrgency = r => {
    if (!r.date) return { text: 'กำหนดการ', cls: 'text-slate-600' };
    if (r.date < today) return { text: `เลยกำหนด ${daysBetween(r.date, today)} วัน`, cls: 'text-rose-700 font-semibold' };
    if (r.date === today) return { text: r.dueTime ? `วันนี้ ${r.dueTime} น.` : 'วันนี้', cls: 'text-amber-800 font-semibold' };
    const diff = daysBetween(today, r.date);
    return { text: diff === 1 ? 'พรุ่งนี้' : `อีก ${diff} วัน`, cls: 'text-slate-600' };
  };

  return `
    <section class="card space-y-3" aria-label="แจ้งเตือนและรายการสำคัญ">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-bold text-slate-800 flex items-center gap-2">
          ${iconBubble('notifications', { small: true, cat: 'cat-lab' })}
          <span>ใกล้ถึงกำหนด</span>
        </h2>
        <div class="flex items-center gap-3 text-xs">
          <button type="button" data-go="remind" data-focus="rm-smart" class="text-brand-dark font-medium underline min-h-[32px]">+ เพิ่มเตือน</button>
          <button type="button" data-go="notifications" class="text-slate-600 underline min-h-[32px]">ดูทั้งหมด</button>
        </div>
      </div>
      ${reminders.length ? `
        <div class="divide-y divide-slate-100">
          ${reminders.slice(0, 4).map(r => {
            const u = formatUrgency(r);
            const rIcon = CATEGORIES.find(c => c.tab === r.tab)?.icon || 'notifications';
            const rCat = CATEGORIES.find(c => c.tab === r.tab)?.cat || 'cat-lab';
            return `
              <button type="button" data-go="${esc(r.tab || 'notifications')}" class="w-full text-left flex items-center gap-3 py-2.5 first:pt-1 last:pb-1 hover:bg-lav-soft/30 rounded-xl px-1.5 transition-colors">
                ${iconBubble(rIcon, { small: true, cat: rCat })}
                <span class="min-w-0 flex-1">
                  <span class="text-sm font-semibold text-slate-800 block truncate">${esc(r.label)}</span>
                  <span class="text-xs text-slate-600 block truncate">
                    <span class="${u.cls} tabular-nums">${esc(u.text)}</span>
                    ${r.detail ? ` · ${esc(r.detail)}` : ''}
                  </span>
                </span>
              </button>`;
          }).join('')}
        </div>`
        : '<p class="rounded-2xl bg-ok-soft p-3 text-sm text-green-800">ไม่มีรายการเร่งด่วนที่ใกล้ถึงกำหนด พักผ่อนได้ตามสบาย</p>'}
    </section>`;
}

export function renderHome() {
  const el = $('#home-today');
  if (!el || !state.uid) return;
  const today = localDateStr();
  const [hello, sun] = greeting();
  const name = (state.user?.displayName || '').split(' ')[0];
  const dateText = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });

  const head = $('#home-head', el);
  if (head) {
    head.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="home-hello">
          <p class="text-sm text-slate-600 flex items-center gap-1.5">${esc(dateText)}</p>
          <h1 class="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2 flex-wrap">
            <span>${hello}${name ? ', ' + esc(name) : ''}</span>
            <span class="text-brand inline-flex items-center" aria-hidden="true">${iconSvg(sun, { size: 22 })}</span>
          </h1>
        </div>
        <div id="home-push-slot" class="shrink-0"></div>
      </div>`;
    refreshHomePushBtn();
  }

  const config = getHomeWidgetConfig();
  const foods = state.todayFood || [];
  const targets = getTargets();
  const reminders = collectReminders();
  const thisMonth = today.slice(0, 7);
  const monthExps = (state.expenses || []).filter(x => (x.date || '').slice(0, 7) === thisMonth);
  const todayExps = monthExps.filter(x => x.date === today);

  const slots = {
    'daily-overview': $('#home-slot-daily-overview', el),
    'quick-access': $('#home-slot-quick-access', el),
    'planner': $('#home-planner', el),
    'daily-activity': $('#home-slot-daily-activity', el),
    'reminders': $('#home-slot-reminders', el)
  };

  const widgetsWrap = $('#home-widgets', el);
  if (widgetsWrap) {
    config.order.forEach(id => {
      const slot = slots[id];
      if (!slot) return;
      widgetsWrap.appendChild(slot);
      slot.classList.toggle('hidden', config.hidden.has(id));
    });
  }

  if (slots['daily-overview'] && !config.hidden.has('daily-overview')) {
    slots['daily-overview'].innerHTML = buildDailyOverviewHtml(today, foods, targets, monthExps, todayExps, reminders);
    const tickerEl = $('#home-kcal-ticker', el);
    if (foods.length && tickerEl) {
      const totalKcal = Math.round(foods.reduce((a, i) => a + num(i.calories), 0));
      animateNumberTicker(tickerEl, totalKcal);
    }
  }
  if (slots['quick-access'] && !config.hidden.has('quick-access')) {
    slots['quick-access'].innerHTML = buildQuickAccessHtml(config);
  }
  if (slots['planner'] && !config.hidden.has('planner')) {
    if (plannerExpanded && plannerFeature) {
      plannerFeature.renderPlanner();
    } else if (plannerExpanded) {
      void ensureHomePlannerLoaded();
    } else {
      renderPlannerTeaser(slots['planner'], today);
    }
  }
  if (slots['daily-activity'] && !config.hidden.has('daily-activity')) {
    slots['daily-activity'].innerHTML = buildDailyActivityHtml(today, foods, targets, monthExps, todayExps);
  }
  if (slots['reminders'] && !config.hidden.has('reminders')) {
    slots['reminders'].innerHTML = buildRemindersHtml(today, reminders);
  }
}

async function refreshHomePushBtn() {
  const slot = $('#home-push-slot');
  if (!slot) return;
  const st = await getPushStatus();
  if (!slot.isConnected) return;
  if (!st.supported && !st.needsIosInstall) {
    slot.innerHTML = '';
    return;
  }
  if (st.subscribedHere) {
    slot.innerHTML = `<button type="button" data-go="settings" data-focus="st-push-card" class="chip bg-ok-soft text-green-800 min-h-[40px]">${iconSvg('notifications', { size: 15 })}<span>รับแจ้งเตือนแล้ว</span></button>`;
  } else {
    slot.innerHTML = `<button type="button" id="home-push-btn" class="chip bg-sky-soft text-brand-dark border border-sky-200 min-h-[40px]">${iconSvg('notifications', { size: 15 })}<span>เปิดรับการแจ้งเตือน</span></button>`;
  }
}
