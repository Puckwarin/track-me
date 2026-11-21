// หน้า Home: Daily Overview, Quick Access, Planner, Daily Activity และ Reminders
import { state } from './state.js';
import { isPreviewMode } from './preview.js';
import { $, esc, localDateStr, round1, toast, daysBetween } from './util.js';
import { getTargets } from './profile.js';
import { collectReminders, remindersForDate } from './reminders.js';
import { CATEGORIES } from './categories.js';
import { TYPES } from './workoutConstants.js';
import { bodyLatest } from './body.js';
import { getPushStatus, enablePushNotifications } from './push.js';
import { reportRuntimeError } from './runtimeErrorMonitor.js';
import { iconSvg } from './icons.js';
import { animateNumberTicker } from './ui.js';

export const HOME_WIDGET_IDS = ['planner', 'daily-overview', 'quick-access', 'daily-activity', 'reminders'];
export const HOME_WIDGET_DEFS = [
  { id: 'planner', label: 'Weekly Planner' },
  { id: 'daily-overview', label: 'สรุปภาพรวมวันนี้' },
  { id: 'quick-access', label: 'ทางลัดบันทึกด่วน' },
  { id: 'daily-activity', label: 'กิจกรรม & บันทึกล่าสุด' },
  { id: 'reminders', label: 'แจ้งเตือนที่ต้องดูแล' }
];

const WIDGET_STORAGE_KEY = 'trackme_home_widgets:v1:';

let go = () => {};
let plannerFeature = null;
let plannerMountPromise = null;
let plannerExpanded = true;

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
  plannerExpanded = true;
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

const num = v => (Number.isFinite(+v) ? +v : 0);
const hasNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(+v);
const baht = (v, digits = 0) => `฿${num(v).toLocaleString('th-TH', { maximumFractionDigits: digits })}`;

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'ราตรีสวัสดิ์';
  if (h < 12) return 'อรุณสวัสดิ์';
  if (h < 17) return 'สวัสดีตอนบ่าย';
  if (h < 20) return 'สวัสดีตอนเย็น';
  return 'ราตรีสวัสดิ์';
}

function moodLine(pct, hasFood) {
  if (!hasFood) return ['เริ่มวันใหม่แบบสบาย ๆ', 'จดมื้อแรกของวัน แล้วค่อย ๆ ดูแลตัวเองไปด้วยกัน'];
  if (pct < 40) return ['เริ่มต้นได้ดีแล้ว', 'อย่าลืมกินให้พอดีกับเป้าหมายของวันนี้นะ'];
  if (pct <= 100) return ['วันนี้ดูแลตัวเองได้ดี', 'พลังงานกำลังพอดี ไปต่อแบบนี้เลย'];
  return ['วันนี้กินเกินเป้าเล็กน้อย', 'ไม่เป็นไร ลองขยับร่างกายเพิ่มอีกนิดก็พอ'];
}

function progressRing(pct, label, sub) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct));
  const offset = c - (shown / 100) * c;
  return `
    <div class="hx-ring" role="img" aria-label="${esc(label)} ${pct}% ${esc(sub)}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="hx-ring-track" cx="60" cy="60" r="${r}" />
        <circle class="hx-ring-bar ${pct > 100 ? 'is-over' : ''}" cx="60" cy="60" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" />
      </svg>
      <div class="hx-ring-center">
        <span class="hx-ring-value tabular-nums">${pct}<small>%</small></span>
        <span class="hx-ring-label">${esc(label)}</span>
      </div>
    </div>`;
}

function buildDailyOverviewHtml(today, foods, targets) {
  const foodLoaded = !!state.loaded?.todayFood;
  const sum = k => foods.reduce((a, i) => a + num(i[k]), 0);
  const kcal = Math.round(sum('calories'));
  const goal = num(targets.kcal) || 0;
  const pct = goal ? Math.round((kcal / goal) * 100) : 0;
  const left = goal - kcal;
  const [title, subtitle] = moodLine(pct, foods.length > 0);

  const todayWorkouts = (state.workouts || []).filter(w => w.date === today);
  const doneWorkouts = todayWorkouts.filter(w => w.status !== 'planned');
  const moveMin = doneWorkouts.reduce((a, w) => a + num(w.durationMin), 0);
  const body = bodyLatest(state.body || []);

  const sleepVal = hasNum(body?.sleepHours?.v) ? `${round1(body.sleepHours.v)}` : '—';
  const sleepSub = hasNum(body?.sleepHours?.v) ? 'ชม.' : '';
  const weightVal = hasNum(body?.weight?.v) ? `${body.weight.v}` : '—';
  const weightSub = hasNum(body?.weight?.v) ? 'กก.' : '';

  const stats = [
    { tone: 'is-food', tab: 'food', icon: 'food', label: 'อาหาร', value: foods.length ? `${kcal.toLocaleString()}` : '—', sub: foods.length ? 'kcal' : '' },
    { tone: 'is-workout', tab: 'workout', icon: 'steps', label: 'ขยับ', value: doneWorkouts.length ? `${moveMin || doneWorkouts.length}` : todayWorkouts.length ? `0/${todayWorkouts.length}` : '—', sub: doneWorkouts.length ? (moveMin ? 'นาที' : 'ครั้ง') : todayWorkouts.length ? 'แผน' : '' },
    { tone: 'is-sleep', tab: 'body', icon: 'moon', label: 'นอน', value: sleepVal, sub: sleepSub },
    { tone: 'is-weight', tab: 'body', icon: 'body', label: 'น้ำหนัก', value: weightVal, sub: weightSub }
  ];

  const macroTile = (tone, label, v, g) => {
    const hasGoal = hasNum(g) && num(g) > 0;
    const p = hasGoal ? Math.min(100, Math.round((v / num(g)) * 100)) : 0;
    return `
      <div class="hx-macro ${tone}">
        <span class="hx-macro-label">${label}</span>
        <span class="hx-macro-value tabular-nums">${foods.length ? Math.round(v) : '—'}<small>${hasGoal ? ` / ${num(g)} g` : ''}</small></span>
        <span class="hx-macro-bar" aria-hidden="true"><span style="width:${p}%"></span></span>
      </div>`;
  };

  return `
    <section class="hx-hero" aria-label="สรุปประจำวัน">
      <div class="hx-hero-top">
        <div class="hx-hero-copy">
          <h2 class="hx-hero-title">${esc(title)}</h2>
          <p class="hx-hero-sub">${esc(subtitle)}</p>
          <button type="button" data-go="food" class="hx-hero-kcal tabular-nums">
            ${!foodLoaded && !foods.length
              ? '<span>กำลังโหลด...</span>'
              : `<b id="home-kcal-ticker">${kcal.toLocaleString()}</b><span> / ${goal ? goal.toLocaleString() : '—'} kcal</span>`}
          </button>
          <p class="hx-hero-left tabular-nums ${left < 0 ? 'is-over' : ''}">${goal ? (left >= 0 ? `เหลืออีก ${Math.round(left).toLocaleString()} kcal` : `เกินเป้า ${Math.round(-left).toLocaleString()} kcal`) : 'ยังไม่ได้ตั้งเป้าหมายพลังงาน'}</p>
        </div>
        ${progressRing(pct, 'ของเป้าวันนี้', `${kcal} จาก ${goal} kcal`)}
      </div>
      <div class="hx-stats" role="list">
        ${stats.map(s => `
          <button type="button" role="listitem" data-go="${s.tab}" class="hx-stat ${s.tone}" aria-label="${esc(s.label)} ${esc(s.value)} ${esc(s.sub)}">
            ${iconSvg(s.icon, { size: 17 })}
            <span class="hx-stat-label">${esc(s.label)}</span>
            <span class="hx-stat-value tabular-nums">${esc(s.value)}${s.sub ? `<small> ${esc(s.sub)}</small>` : ''}</span>
          </button>`).join('')}
      </div>
      <div class="hx-macros">
        ${macroTile('is-protein', 'โปรตีน', sum('protein'), targets.protein)}
        ${macroTile('is-carb', 'คาร์บ', sum('carbs'), targets.carbs)}
        ${macroTile('is-fat', 'ไขมัน', sum('fat'), targets.fat)}
      </div>
    </section>`;
}

function buildQuickAccessHtml(config) {
  let items = CATEGORIES;
  if (config.pinnedShortcuts.length) {
    const matched = config.pinnedShortcuts
      .map(key => CATEGORIES.find(c => c.key === key || c.tab === key))
      .filter(Boolean);
    if (matched.length) items = matched;
  }
  return `
    <section class="hx-section" aria-labelledby="hx-cat-title">
      <div class="hx-section-head">
        <h2 id="hx-cat-title" class="hx-section-title">หมวดหมู่</h2>
        <button type="button" data-go="settings" data-focus="st-home-widget-settings" class="hx-link">ปรับแต่ง</button>
      </div>
      <div class="hx-cats">
        ${items.map(c => `
          <button type="button" data-go="${c.tab}" ${c.focus ? `data-focus="${c.focus}"` : ''} class="hx-cat">
            <span class="hx-cat-icon" aria-hidden="true">${iconSvg(c.icon || c.key, { size: 24 })}</span>
            <span class="hx-cat-label">${esc(c.label)}</span>
          </button>`).join('')}
      </div>
    </section>`;
}

const MEAL_SLOTS = [
  { id: 'breakfast', label: 'มื้อเช้า', time: '08:00' },
  { id: 'lunch', label: 'มื้อกลางวัน', time: '12:30' },
  { id: 'snack', label: 'ของว่าง', time: '15:30' },
  { id: 'dinner', label: 'มื้อเย็น', time: '18:30' }
];

function mealSlotOf(food) {
  if (food.mealId && MEAL_SLOTS.some(s => s.id === food.mealId)) return food.mealId;
  const m = String(food.meal || '');
  if (m.includes('เช้า')) return 'breakfast';
  if (m.includes('กลางวัน')) return 'lunch';
  if (m.includes('เย็น') || m.includes('ค่ำ')) return 'dinner';
  return 'snack';
}

function resolveActivityState(itemTime, isDone, nowHhMm) {
  if (isDone) return { key: 'done', badge: 'ทำแล้ว' };
  if (itemTime && /^\d{2}:\d{2}$/.test(itemTime) && itemTime > nowHhMm) {
    return { key: 'upcoming', badge: 'กำลังจะถึง' };
  }
  return { key: 'pending', badge: 'รอทำ' };
}

function buildDailyActivityHtml(today, foods, monthExps, todayExps) {
  const now = new Date();
  const nowHhMm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const rows = [];

  MEAL_SLOTS.forEach(slot => {
    const items = foods.filter(f => mealSlotOf(f) === slot.id);
    if (!items.length && slot.id === 'snack') return;
    const kcal = Math.round(items.reduce((a, f) => a + num(f.calories), 0));
    const st = resolveActivityState(slot.time, items.length > 0, nowHhMm);
    rows.push({
      time: slot.time,
      done: st.key === 'done',
      stateKey: st.key,
      stateBadge: st.badge,
      title: slot.label,
      sub: items.length ? `${items.map(f => f.name).join(' · ')} · ${kcal.toLocaleString()} kcal` : 'ยังไม่ได้บันทึก · แตะเพื่อจด',
      tab: 'food',
      focus: items.length ? null : 'f-name'
    });
  });

  (state.workouts || []).filter(w => w.date === today).forEach(w => {
    const t = w.time || '17:00';
    const st = resolveActivityState(t, w.status !== 'planned', nowHhMm);
    rows.push({
      time: t,
      done: st.key === 'done',
      stateKey: st.key,
      stateBadge: st.badge,
      title: w.title || TYPES[w.type] || 'ออกกำลังกาย',
      sub: `${w.durationMin ? `${w.durationMin} นาที` : 'ออกกำลังกาย'}${w.estKcal ? ` · ~${w.estKcal} kcal` : ''}`,
      tab: 'workout'
    });
  });

  remindersForDate(today).slice(0, 3).forEach(r => {
    const t = r.dueTime || '—';
    const st = resolveActivityState(t, false, nowHhMm);
    rows.push({
      time: t,
      done: false,
      stateKey: st.key,
      stateBadge: st.badge,
      title: r.label,
      sub: r.detail || 'แจ้งเตือนวันนี้',
      tab: r.tab || 'notifications'
    });
  });

  rows.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const doneCount = rows.filter(r => r.done).length;

  const spentMonth = monthExps.filter(x => x.type !== 'income').reduce((a, x) => a + num(x.amount), 0);
  const incomeMonth = monthExps.filter(x => x.type === 'income').reduce((a, x) => a + num(x.amount), 0);
  const spentToday = todayExps.filter(x => x.type !== 'income').reduce((a, x) => a + num(x.amount), 0);

  return `
    <section class="hx-section" aria-labelledby="hx-today-title">
      <div class="hx-section-head">
        <h2 id="hx-today-title" class="hx-section-title">วันนี้</h2>
        <span class="hx-muted tabular-nums">ทำแล้ว ${doneCount}/${rows.length}</span>
      </div>
      <ol class="hx-timeline">
        ${rows.map(r => `
          <li>
            <button type="button" data-go="${esc(r.tab)}" ${r.focus ? `data-focus="${r.focus}"` : ''} class="hx-tl-row is-${r.stateKey}">
              <span class="hx-tl-time tabular-nums">${esc(r.time)}</span>
              <span class="hx-tl-dot" aria-hidden="true">${r.done ? iconSvg('check', { size: 12, strokeWidth: 2.6 }) : ''}</span>
              <span class="hx-tl-body">
                <span class="hx-tl-title-wrap">
                  <span class="hx-tl-title">${esc(r.title)}</span>
                  <span class="hx-tl-status is-${r.stateKey}">${esc(r.stateBadge)}</span>
                </span>
                <span class="hx-tl-sub">${esc(r.sub)}</span>
              </span>
              ${iconSvg('chevron-right', { size: 14, className: 'hx-tl-chev' })}
            </button>
          </li>`).join('')}
      </ol>
    </section>
    <button type="button" data-go="expense" class="hx-money">
      <span class="hx-money-icon" aria-hidden="true">${iconSvg('expense', { size: 20 })}</span>
      <span class="hx-money-body">
        <span class="hx-money-label">การเงินเดือนนี้</span>
        <span class="hx-money-value tabular-nums">${monthExps.length ? `จ่าย ${baht(spentMonth)}` : 'ยังไม่มีรายการ'}${incomeMonth > 0 ? `<small class="is-income"> · รับ ${baht(incomeMonth)}</small>` : ''}</span>
        <span class="hx-money-sub tabular-nums">${todayExps.length ? `วันนี้จ่าย ${baht(spentToday, 2)}` : monthExps.length ? 'วันนี้ยังไม่มีรายจ่าย' : 'แตะเพื่อจดหรือสแกนสลิป'}</span>
      </span>
      ${iconSvg('chevron-right', { size: 14, className: 'hx-tl-chev' })}
    </button>`;
}

function renderPlannerTeaser(host, today) {
  if (!host) return;
  const routines = Array.isArray(state.planner?.routines) ? state.planner.routines : [];
  const todayWorkouts = (state.workouts || []).filter(w => w.date === today);
  const doneMapToday = Array.isArray(state.planner?.doneMap?.[today]) ? state.planner.doneMap[today].length : 0;
  const desc = routines.length
    ? `กิจกรรม ${routines.length} รายการ${doneMapToday ? ` · ทำแล้ว ${doneMapToday}` : ''}${todayWorkouts.length ? ` · ออกกำลังกาย ${todayWorkouts.length}` : ''}`
    : 'วางแผนกิจกรรมและการออกกำลังกายทั้งสัปดาห์ในที่เดียว';

  host.innerHTML = `
    <section class="hx-plan" aria-labelledby="hx-plan-title">
      <div class="hx-plan-copy">
        <span class="hx-eyebrow">Weekly Planner</span>
        <h2 id="hx-plan-title" class="hx-plan-title">วางแผนสัปดาห์นี้<br>ให้สบายขึ้น</h2>
        <p class="hx-plan-sub">${esc(desc)}</p>
        <button type="button" id="home-planner-open" class="hx-plan-btn">
          เปิด Planner ${iconSvg('arrow-right', { size: 15 })}
        </button>
      </div>
      <div class="hx-plan-art" aria-hidden="true">${iconSvg('weekly', { size: 42 })}</div>
    </section>`;
}

function urgencyRank(r, today) {
  if (r.date && r.date < today) return 0;
  if (r.date === today) return 1;
  return 2;
}

function buildRemindersHtml(today, reminders) {
  const formatUrgency = r => {
    if (!r.date) return { text: 'กำหนดการ', cls: '' };
    if (r.date < today) return { text: `เลยกำหนด ${daysBetween(r.date, today)} วัน`, cls: 'is-late' };
    if (r.date === today) return { text: r.dueTime ? `วันนี้ ${r.dueTime} น.` : 'วันนี้', cls: 'is-today' };
    const diff = daysBetween(today, r.date);
    return { text: diff === 1 ? 'พรุ่งนี้' : `อีก ${diff} วัน`, cls: '' };
  };

  const ordered = [...reminders].sort((a, b) => {
    const rankDiff = urgencyRank(a, today) - urgencyRank(b, today);
    if (rankDiff !== 0) return rankDiff;
    return String(a.date || '9999-99-99').localeCompare(String(b.date || '9999-99-99'));
  });

  return `
    <section class="hx-section" aria-labelledby="hx-rem-title">
      <div class="hx-section-head">
        <h2 id="hx-rem-title" class="hx-section-title">ใกล้ถึงกำหนด</h2>
        <button type="button" data-go="notifications" class="hx-link">ดูทั้งหมด</button>
      </div>
      ${ordered.length ? `
        <ul class="hx-list">
          ${ordered.slice(0, 4).map(r => {
            const u = formatUrgency(r);
            const rIcon = CATEGORIES.find(c => c.tab === r.tab)?.icon || 'notifications';
            return `
              <li>
                <button type="button" data-go="${esc(r.tab || 'notifications')}" class="hx-list-row">
                  <span class="hx-list-icon" aria-hidden="true">${iconSvg(rIcon, { size: 18 })}</span>
                  <span class="hx-tl-body">
                    <span class="hx-tl-title">${esc(r.label)}</span>
                    <span class="hx-tl-sub"><span class="hx-due ${u.cls} tabular-nums">${esc(u.text)}</span>${r.detail ? ` · ${esc(r.detail)}` : ''}</span>
                  </span>
                  ${iconSvg('chevron-right', { size: 14, className: 'hx-tl-chev' })}
                </button>
              </li>`;
          }).join('')}
        </ul>`
        : '<p class="hx-empty">ไม่มีรายการเร่งด่วน พักผ่อนได้ตามสบาย</p>'}
    </section>`;
}

export function mountHome(navigate) {
  go = navigate;
  const el = $('#home-today');
  el.innerHTML = `
    <section id="home-head" class="hx-head"></section>
    <div id="home-widgets" class="hx-widgets">
      <div id="home-planner"></div>
      <div id="home-slot-daily-overview"></div>
      <div id="home-slot-quick-access"></div>
      <div id="home-slot-daily-activity" class="hx-stack"></div>
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

export function renderHome() {
  const el = $('#home-today');
  if (!el || !state.uid) return;
  const today = localDateStr();
  const name = (state.profile?.name || (isPreviewMode() ? '' : state.user?.displayName) || '').split(' ')[0];
  const dateText = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });

  const head = $('#home-head', el);
  if (head) {
    head.innerHTML = `
      <div class="hx-head-copy">
        <p class="hx-date">${esc(dateText)}</p>
        <h1 class="hx-hello">${greeting()}${name ? `, ${esc(name)}` : ''}</h1>
      </div>
      <div id="home-push-slot" class="shrink-0"></div>`;
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
    'planner': $('#home-planner', el),
    'daily-overview': $('#home-slot-daily-overview', el),
    'quick-access': $('#home-slot-quick-access', el),
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

  if (slots['planner'] && !config.hidden.has('planner')) {
    if (plannerExpanded && plannerFeature) {
      plannerFeature.mountPlanner(slots['planner'], go);
      plannerFeature.renderPlanner();
    } else if (plannerExpanded) {
      if (!slots['planner'].hasChildNodes()) renderPlannerTeaser(slots['planner'], today);
      void ensureHomePlannerLoaded();
    } else {
      renderPlannerTeaser(slots['planner'], today);
    }
  }
  if (slots['daily-overview'] && !config.hidden.has('daily-overview')) {
    slots['daily-overview'].innerHTML = buildDailyOverviewHtml(today, foods, targets);
    const tickerEl = $('#home-kcal-ticker', el);
    if (foods.length && tickerEl) {
      const totalKcal = Math.round(foods.reduce((a, i) => a + num(i.calories), 0));
      animateNumberTicker(tickerEl, totalKcal);
    }
  }
  if (slots['quick-access'] && !config.hidden.has('quick-access')) {
    slots['quick-access'].innerHTML = buildQuickAccessHtml(config);
  }
  if (slots['daily-activity'] && !config.hidden.has('daily-activity')) {
    slots['daily-activity'].innerHTML = buildDailyActivityHtml(today, foods, monthExps, todayExps);
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
    slot.innerHTML = `<button type="button" data-go="settings" data-focus="st-push-card" class="hx-push">${iconSvg('notifications', { size: 15 })}<span>รับแจ้งเตือนแล้ว</span></button>`;
  } else {
    slot.innerHTML = `<button type="button" id="home-push-btn" class="hx-push">${iconSvg('notifications', { size: 15 })}<span>เปิดรับการแจ้งเตือน</span></button>`;
  }
}