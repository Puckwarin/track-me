// หน้า Home: Weekly Planner และ Daily Overview
import { state } from './state.js';
import { isPreviewMode } from './preview.js';
import { $, esc, localDateStr, toast } from './util.js';
import { getTargets, getMeals } from './profile.js';
import { buildMealDonutParts } from './donutChart.js';
import { buildMealCaloriePieData, getMealPiePalette } from './foodCalculations.js';
import { CATEGORIES } from './categories.js';
import { getPushStatus, enablePushNotifications, isIosDevice, isStandalonePwa } from './push.js';
import { openPwaInstallGuideModal } from './pwaInstall.js';
import { reportRuntimeError } from './runtimeErrorMonitor.js';
import { iconSvg } from './icons.js';
import { getHomeShortcuts, readNavigationPreferences } from './navigation.js';
import { animateNumberTicker, bindChartInspector } from './ui.js';

export const HOME_WIDGET_IDS = ['shortcuts', 'daily-overview', 'planner', 'summary'];
export const HOME_WIDGET_DEFS = [
  { id: 'shortcuts', label: 'ทางลัดที่ปักหมุด' },
  { id: 'daily-overview', label: 'สรุปภาพรวมวันนี้' },
  { id: 'planner', label: 'Weekly Planner' },
  { id: 'summary', label: 'สรุปภาพรวมทั้งหมด' }
];

const WIDGET_STORAGE_KEY = 'trackme_home_widgets:v1:';

export const DAILY_ENCOURAGEMENTS = [
  'ค่อย ๆ ไปตามจังหวะของตัวเองก็พอ',
  'ใส่ใจตัวเองวันละนิดก็เก่งมากแล้ว',
  'ทุกก้าวเล็ก ๆ วันนี้มีความหมายเสมอ',
  'ขอบคุณตัวเองที่คอยดูแลสุขภาพนะ',
  'เริ่มต้นวันอย่างสบายใจ ไม่ต้องรีบร้อน',
  'แค่ได้สังเกตตัวเองวันนี้ก็ดีมากแล้ว',
  'ดูแลใจและกายให้พอดีกับวันนี้',
  'จังหวะที่สม่ำเสมอดีกว่าความสมบูรณ์แบบ',
  'ให้กำลังใจตัวเองในทุกเรื่องเล็ก ๆ วันนี้',
  'พักเมื่อเหนื่อย แล้วค่อยเดินต่อนะ',
  'สุขภาพที่ดีเริ่มจากความใส่ใจในวันนี้',
  'ทำเท่าที่ไหว วันนี้คุณทำดีแล้ว',
  'บันทึกเล็ก ๆ วันนี้คือของขวัญให้ตัวเองในวันหน้า',
  'วันนี้ใจดีกับตัวเองอีกนิดนะ',
  'เลือกสิ่งดี ๆ ให้ร่างกายทีละมื้อก็พอ',
  'ไม่ว่าจะมากหรือน้อย แค่เริ่มดูแลตัวเองก็เก่งแล้ว',
  'อย่าลืมดื่มน้ำและพักสายตาระหว่างวันนะ',
  'ทุกวันที่ใส่ใจตัวเองคือกำไรของสุขภาพ',
  'ความคืบหน้าเล็กน้อยทุกวันรวมกันเป็นผลลัพธ์ใหญ่',
  'ฟังเสียงร่างกายของตัวเองให้มากขึ้นอีกนิดนะ',
  'ขอให้วันนี้เป็นอีกวันที่เบาสบายและลงตัว',
  'ไม่จำเป็นต้องเป๊ะทุกวัน แค่กลับมาดูแลตัวเองก็พอ',
  'พลังบวกเล็ก ๆ สร้างวันดี ๆ ได้เสมอ',
  'วันใหม่คือโอกาสดีที่จะดูแลตัวเองอีกครั้ง',
  'ยิ้มให้ตัวเองหน่อย วันนี้คุณกำลังทำได้ดี',
  'ก้าวไปข้างหน้าอย่างอ่อนโยนกับตัวเองนะ',
  'ร่างกายแข็งแรงขึ้นจากความสม่ำเสมอของคุณเอง',
  'วันนี้ดูแลตัวเองได้ดีนะ'
];

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
    renderPlannerLoading(container);
    plannerMountPromise = import('./planner.js')
      .then(module => {
        plannerFeature = module;
        if (plannerExpanded && container.isConnected) {
          module.mountPlanner(container, go);
          container.dataset.plMounted = '1';
        }
      })
      .catch(error => {
        plannerMountPromise = null;
        plannerExpanded = false;
        reportRuntimeError(error, { category: 'chunk', source: 'feature-load' });
        toast('เปิด Planner ไม่สำเร็จ: ' + (error?.message || 'โหลดโมดูลไม่ได้'), 'err');
        renderHome();
      });
  } else if (plannerFeature) {
    if (container.dataset.plMounted !== '1') {
      plannerFeature.mountPlanner(container, go);
      container.dataset.plMounted = '1';
    } else {
      plannerFeature.renderPlanner();
    }
  }
  return plannerMountPromise;
}

const num = v => (Number.isFinite(+v) ? +v : 0);
const hasNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(+v);

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'ราตรีสวัสดิ์';
  if (h < 12) return 'อรุณสวัสดิ์';
  if (h < 17) return 'สวัสดีตอนบ่าย';
  if (h < 20) return 'สวัสดีตอนเย็น';
  return 'ราตรีสวัสดิ์';
}

export function dailyEncouragementForDate(dateStr) {
  const s = String(dateStr || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return DAILY_ENCOURAGEMENTS[(h >>> 0) % DAILY_ENCOURAGEMENTS.length];
}

function dailyOverviewSubtitle(pct, hasFood, goal) {
  if (!hasFood) return 'จดมื้อแรกของวัน แล้วค่อย ๆ ดูแลตัวเองไปด้วยกัน';
  if (!goal) return 'ตั้งเป้าหมายพลังงานเพิ่มได้ในหน้าตั้งค่า เพื่อให้สรุปตรงกับคุณมากขึ้น';
  if (pct < 40) return 'ค่อย ๆ จดมื้ออาหารให้ครบตามจังหวะของวันนะ';
  if (pct <= 100) return 'พลังงานอยู่ในช่วงเป้าหมายที่ตั้งไว้';
  return 'พลังงานวันนี้สูงกว่าเป้าหมายที่ตั้งไว้เล็กน้อย ใช้ดูเป็นข้อมูลภาพรวมได้';
}

function buildDailyOverviewHtml(today, foods, targets) {
  const foodLoaded = !!state.loaded?.todayFood;
  const isFoodLoading = !foodLoaded && foods.length === 0;
  const sum = k => foods.reduce((a, i) => a + num(i[k]), 0);
  const kcal = Math.round(sum('calories'));
  const goal = num(targets.kcal) || 0;
  const pct = goal ? Math.round((kcal / goal) * 100) : 0;
  const left = goal - kcal;
  const title = dailyEncouragementForDate(today);
  const subtitle = isFoodLoading
    ? 'กำลังโหลดข้อมูลมื้ออาหารของวันนี้...'
    : dailyOverviewSubtitle(pct, foods.length > 0, goal);

  const pie = buildMealCaloriePieData(foods, getMeals(), getMealPiePalette());
  const donut = buildMealDonutParts({
    slices: pie.slices,
    totalKcal: pie.totalKcal,
    targetKcal: goal,
    hasData: !isFoodLoading && foods.length > 0 && pie.totalKcal > 0,
    isLoading: isFoodLoading
  });

  const macroTile = (tone, label, v, g, unit = 'g', warnOver = false) => {
    const hasGoal = hasNum(g) && num(g) > 0;
    const goalNum = num(g);
    const p = hasGoal ? Math.min(100, Math.round((v / goalNum) * 100)) : 0;
    const isOver = warnOver && hasGoal && v > goalNum;
    const formattedVal = unit === 'mg' ? Math.round(v).toLocaleString() : Number(v.toFixed(1));
    const formattedGoal = unit === 'mg' ? goalNum.toLocaleString() : goalNum;
    return `
      <div class="hx-macro ${tone}${isOver ? ' is-over' : ''}">
        <div class="hx-macro-head">
          <span class="hx-macro-label">${label}</span>
          <span class="hx-macro-value tabular-nums">${foods.length ? formattedVal : '—'}<small>${hasGoal ? ` / ${formattedGoal} ${unit}` : ''}</small></span>
        </div>
        <span class="hx-macro-bar" aria-hidden="true"><span style="width:${p}%"></span></span>
      </div>`;
  };

  const sugarVal = Number(sum('sugar').toFixed(1));
  const sodiumVal = Math.round(sum('sodium')).toLocaleString();
  const sugarSodiumOver = foods.length > 0 && (sum('sugar') > 36 || sum('sodium') > 2300);

  return `
    <section class="hx-hero" aria-label="สรุปประจำวัน">
      <div class="hx-hero-grid">
        <div class="hx-hero-copy">
          <h2 class="hx-hero-title">${esc(title)}</h2>
          <p class="hx-hero-sub">${esc(subtitle)}</p>
          <button type="button" data-go="food" class="hx-hero-kcal tabular-nums">
            ${isFoodLoading
              ? '<span>กำลังโหลด...</span>'
              : `<b id="home-kcal-ticker">${kcal.toLocaleString()}</b><span>${goal ? ` / ${goal.toLocaleString()} kcal` : (foods.length ? ' kcal' : ' kcal · ยังไม่มีรายการวันนี้')}</span>`}
          </button>
          ${goal
            ? (isFoodLoading
              ? `<p class="hx-hero-left tabular-nums">เป้าหมายวันนี้ ${goal.toLocaleString()} kcal</p>`
              : `<p class="hx-hero-left tabular-nums ${left < 0 ? 'is-over' : ''}">${left >= 0 ? `เหลืออีก ${Math.round(left).toLocaleString()} kcal` : `เกินเป้า ${Math.round(-left).toLocaleString()} kcal`}</p>`)
            : `<button type="button" data-go="settings" class="hx-hero-left is-link">ยังไม่ได้ตั้งเป้าหมายพลังงาน · แตะเพื่อตั้งค่า</button>`}
        </div>
        <div class="hx-hero-ring">
          ${donut.ringHtml}
        </div>
        <div class="hx-macros">
          ${macroTile('is-protein', 'โปรตีน', sum('protein'), targets.protein)}
          ${macroTile('is-carb', 'คาร์บ', sum('carbs'), targets.carbs)}
          ${macroTile('is-fat', 'ไขมัน', sum('fat'), targets.fat)}
          <div class="hx-macro is-sugar-sodium${sugarSodiumOver ? ' is-over' : ''}" title="เกณฑ์แนะนำ: น้ำตาล ≤ 36g · โซเดียม ≤ 2,300mg">
            <div class="hx-macro-head">
              <span class="hx-macro-label">น้ำตาล · โซเดียม</span>
              <span class="hx-macro-value tabular-nums">${foods.length ? `${sugarVal}g · ${sodiumVal}mg` : '—'}</span>
            </div>
            <span class="hx-macro-note">เฉพาะรายการที่ระบุ</span>
          </div>
        </div>
      </div>
    </section>`;
}

function renderPlannerLoading(host) {
  if (!host) return;
  host.innerHTML = `
    <section class="hx-plan-compact" aria-label="Weekly Planner">
      <div class="hx-plan-compact-main">
        <span class="hx-plan-compact-ico" aria-hidden="true">${iconSvg('planner', { size: 18 })}</span>
        <div class="min-w-0">
          <p class="hx-plan-compact-title">Weekly Planner</p>
          <p class="hx-plan-compact-sub">กำลังโหลดแผนประจำสัปดาห์...</p>
        </div>
      </div>
      <span class="hx-plan-compact-spin" aria-hidden="true">${iconSvg('fa-spinner fa-spin', { size: 16 })}</span>
    </section>`;
}

function renderPlannerTeaser(host, today) {
  if (!host) return;
  const routines = Array.isArray(state.planner?.routines) ? state.planner.routines : [];
  const todayWorkouts = (state.workouts || []).filter(w => w.date === today);
  const doneMapToday = Array.isArray(state.planner?.doneMap?.[today]) ? state.planner.doneMap[today].length : 0;
  const desc = routines.length || todayWorkouts.length
    ? `กิจกรรม ${routines.length} รายการ${doneMapToday ? ` · ทำแล้ว ${doneMapToday}` : ''}${todayWorkouts.length ? ` · ออกกำลังกาย ${todayWorkouts.length}` : ''}`
    : 'วางแผนกิจกรรมและการออกกำลังกายประจำสัปดาห์';

  host.innerHTML = `
    <section class="hx-plan-compact" aria-labelledby="hx-plan-title">
      <div class="hx-plan-compact-main">
        <span class="hx-plan-compact-ico" aria-hidden="true">${iconSvg('planner', { size: 18 })}</span>
        <div class="min-w-0">
          <h2 id="hx-plan-title" class="hx-plan-compact-title">Weekly Planner</h2>
          <p class="hx-plan-compact-sub">${esc(desc)}</p>
        </div>
      </div>
      <button type="button" id="home-planner-open" class="pl-collapse-btn" aria-expanded="false" aria-label="กาง Weekly Planner" title="กาง">
        ${iconSvg('chevron-down', { size: 16 })}
      </button>
    </section>`;
}

export function mountHome(navigate) {
  go = navigate;
  const el = $('#home-today');
  const existingShortcuts = $('#home-shortcuts');
  const existingSummary = $('#summary-section');
  el.innerHTML = `
    <section id="home-head" class="hx-head"></section>
    <div id="home-widgets" class="hx-widgets">
      <div id="home-slot-daily-overview"></div>
      <div id="home-planner"></div>
    </div>
    <div id="home-push-slot" class="hx-push-foot"></div>`;
  const widgetsWrap = $('#home-widgets', el);
  if (widgetsWrap && existingShortcuts) widgetsWrap.prepend(existingShortcuts);
  if (widgetsWrap && existingSummary) widgetsWrap.appendChild(existingSummary);

  el.addEventListener('click', async e => {
    const plannerBtn = e.target.closest('#home-planner-open');
    if (plannerBtn) {
      void ensureHomePlannerLoaded();
      return;
    }
    const collapseBtn = e.target.closest('[data-pl-collapse]');
    if (collapseBtn) {
      plannerExpanded = false;
      const slot = $('#home-planner', el);
      if (slot) delete slot.dataset.plMounted;
      renderPlannerTeaser(slot, localDateStr());
      return;
    }
    const pushBtn = e.target.closest('#home-push-btn');
    if (pushBtn) {
      if (isIosDevice() && !isStandalonePwa()) {
        toast('บน iPhone / iPad กรุณาเพิ่มแอปลงหน้าจอโฮมก่อนเปิดรับการแจ้งเตือน');
        openPwaInstallGuideModal();
        return;
      }
      pushBtn.disabled = true;
      try {
        await enablePushNotifications();
        toast('เปิดรับการแจ้งเตือน 12:15 น. เรียบร้อยแล้ว');
        renderHome();
      } catch (err) {
        toast(err.message, 'err');
        if (err.message.includes('เพิ่มไปยังหน้าจอโฮม')) openPwaInstallGuideModal();
        else if (err.message.includes('VAPID')) go('settings', 'st-push-card');
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
      </div>`;
  }
  refreshHomePushBtn();

  const config = getHomeWidgetConfig();
  const foods = state.todayFood || [];
  const targets = getTargets();

  const slots = {
    shortcuts: $('#home-shortcuts'),
    planner: $('#home-planner', el),
    'daily-overview': $('#home-slot-daily-overview', el),
    summary: $('#summary-section')
  };

  const hasShortcuts = getHomeShortcuts(readNavigationPreferences(state.uid)).length > 0;
  const widgetsWrap = $('#home-widgets', el);
  if (widgetsWrap) {
    config.order.forEach(id => {
      const slot = slots[id];
      if (!slot) return;
      widgetsWrap.appendChild(slot);
      const isHidden = id === 'shortcuts'
        ? (config.hidden.has('shortcuts') || !hasShortcuts)
        : config.hidden.has(id);
      slot.classList.toggle('hidden', isHidden);
    });
  }

  if (slots.planner && !config.hidden.has('planner')) {
    if (plannerExpanded && plannerFeature) {
      if (slots.planner.dataset.plMounted !== '1') {
        plannerFeature.mountPlanner(slots.planner, go);
        slots.planner.dataset.plMounted = '1';
      } else {
        plannerFeature.renderPlanner();
      }
    } else if (plannerExpanded) {
      if (!slots.planner.hasChildNodes()) renderPlannerLoading(slots.planner);
      void ensureHomePlannerLoaded();
    } else {
      delete slots.planner.dataset.plMounted;
      renderPlannerTeaser(slots.planner, today);
    }
  }
  if (slots['daily-overview'] && !config.hidden.has('daily-overview')) {
    slots['daily-overview'].innerHTML = buildDailyOverviewHtml(today, foods, targets);
    bindChartInspector(slots['daily-overview'], { showReadout: false });
    const tickerEl = $('#home-kcal-ticker', el);
    if (foods.length && tickerEl) {
      const totalKcal = Math.round(foods.reduce((a, i) => a + num(i.calories), 0));
      animateNumberTicker(tickerEl, totalKcal);
    }
  }
}

async function refreshHomePushBtn() {
  const slot = $('#home-push-slot');
  if (!slot) return;
  const st = await getPushStatus();
  if (!slot.isConnected) return;
  if (!st.supported && !st.needsIosInstall) {
    slot.innerHTML = '';
    slot.classList.add('hidden');
    return;
  }
  slot.classList.remove('hidden');
  if (st.subscribedHere) {
    slot.innerHTML = `<button type="button" data-go="settings" data-focus="st-push-card" class="hx-push is-on" aria-pressed="true" title="เปิดรับแจ้งเตือนอยู่ · แตะเพื่อตั้งค่า"><span class="hx-push-dot" aria-hidden="true"></span>${iconSvg('check-circle', { size: 15 })}<span>เปิดแจ้งเตือนอยู่</span></button>`;
  } else if (st.permission === 'denied') {
    slot.innerHTML = `<button type="button" data-go="settings" data-focus="st-push-card" class="hx-push is-blocked" aria-pressed="false" title="การแจ้งเตือนถูกปิดกั้นในเบราว์เซอร์ · แตะเพื่อดูวิธีตั้งค่า"><span class="hx-push-dot" aria-hidden="true"></span>${iconSvg('notifications', { size: 15 })}<span>แจ้งเตือนถูกปิดกั้น · ตั้งค่า</span></button>`;
  } else {
    slot.innerHTML = `<button type="button" id="home-push-btn" class="hx-push is-off" aria-pressed="false" title="ปิดรับแจ้งเตือนอยู่ · แตะเพื่อเปิด"><span class="hx-push-dot" aria-hidden="true"></span>${iconSvg('notifications', { size: 15 })}<span>ปิดอยู่ · เปิดแจ้งเตือน</span></button>`;
  }
}