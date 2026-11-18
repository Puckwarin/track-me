import '@fontsource/prompt/thai-400.css';
import '@fontsource/prompt/thai-500.css';
import '@fontsource/prompt/thai-600.css';
import '@fontsource/prompt/thai-700.css';
import '@fontsource/prompt/latin-400.css';
import '@fontsource/prompt/latin-500.css';
import '@fontsource/prompt/latin-600.css';
import '@fontsource/prompt/latin-700.css';
import '@fortawesome/fontawesome-free/css/fontawesome.min.css';
import '@fortawesome/fontawesome-free/css/solid.min.css';
import '@fortawesome/fontawesome-free/css/regular.min.css';
import './style.css';
import './design-tokens.css';
import { registerSW } from 'virtual:pwa-register';
import { doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';

import { db, userCol, userDoc } from './firebase.js';
import { initRuntimeErrorMonitoring, reportRuntimeError, setRuntimeErrorSink } from './runtimeErrorMonitor.js';
import { state, on, emit } from './state.js';
import { SANITIZERS } from './schema.js';
import { $, localDateStr, addDays, toast } from './util.js';
import { watch, stopAll, renderSyncStatus } from './sync.js';
import { initAuth } from './auth.js';
import { isDemoMode, seedDemoState } from './demo.js';
import './theme.js';
import { CATEGORIES, GROUPS, groupOf } from './categories.js';
import { getHomeShortcuts, getSubnavTabs, readNavigationPreferences } from './navigation.js';
import { mountHome, renderHome, resetHomePlannerState, resetHomePlannerToToday } from './home.js';
import { mountPeriod, render as renderPeriod, checkReminder, resetPeriodToToday } from './period.js';
import { mountSymptoms, renderList as renderSymptomList, renderSkinList, resetSymptomsToToday } from './symptoms.js';
import { mountBody, render as renderBody, resetBodyToToday } from './body.js';
import { refreshProfile } from './profile.js';
import { renderSummary, copySummary } from './summary.js';
import { mountReminders, renderReminders, collectReminders } from './reminders.js';
import { mountOnboarding, unmountOnboarding } from './onboarding.js';

setRuntimeErrorSink((uid, reports) => {
  const batch = writeBatch(db);
  reports.forEach(report => {
    batch.set(doc(userCol(uid, 'runtime_error_logs')), {
      ...report,
      receivedAt: serverTimestamp()
    });
  });
  return batch.commit();
});
initRuntimeErrorMonitoring();
registerSW({ immediate: true });

const CHUNK_RELOAD_KEY = 'trackme-chunk-reloaded';
try {
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    setTimeout(() => sessionStorage.removeItem(CHUNK_RELOAD_KEY), 30_000);
  }
} catch (error) {
  console.warn('Could not access session storage for chunk recovery:', error?.message);
}
window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  reportRuntimeError(event.payload, { category: 'chunk', source: 'chunk-recovery' });
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      toast('โหลดส่วนนี้ไม่สำเร็จหลังรีเฟรช กรุณาลองรีเฟรชหน้าอีกครั้ง', 'err');
      return;
    }
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
  } catch (error) {
    console.error('Could not recover from a stale application chunk:', error);
    toast('โหลดส่วนของแอปไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง', 'err');
  }
});

const TABS = ['home', 'food', 'overview', 'workout', 'weekly', 'period', 'symptoms', 'care', 'remind', 'expense', 'inventory', 'body', 'report', 'notifications', 'settings'];
const lastSub = {};   // จำหน้าย่อยล่าสุดของแต่ละกลุ่ม (เช่น สุขภาพ → ประจำเดือน)

function renderSubnav(group, name) {
  const nav = $('#subnav');
  const preferences = readNavigationPreferences(state.uid);
  const tabs = getSubnavTabs(group, preferences, name);
  nav.classList.toggle('hidden', tabs.length < 2);
  if (tabs.length < 2) { nav.innerHTML = ''; return; }
  nav.innerHTML = `<div class="subnav-row">${tabs.map(item => `<button data-sub="${item.tab}" class="sub-chip ${item.cat} ${item.tab === name ? 'is-active' : ''}" ${item.tab === name ? 'aria-current="page"' : ''}><span>${item.emoji}</span>${item.label}</button>`).join('')}</div>`;
  nav.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function renderHomeShortcuts() {
  const home = $('#tab-home');
  if (!home) return;
  let section = $('#home-shortcuts', home);
  if (!section) {
    section = document.createElement('section');
    section.id = 'home-shortcuts';
    section.className = 'nav-shortcuts';
    const anchor = $('#home-head', home) || $('#home-today', home);
    anchor?.insertAdjacentElement(anchor.id === 'home-head' ? 'afterend' : 'afterbegin', section);
  }
  const shortcuts = getHomeShortcuts(readNavigationPreferences(state.uid));
  section.classList.toggle('hidden', shortcuts.length === 0);
  section.setAttribute('aria-label', 'ทางลัดที่ปักหมุด');
  section.innerHTML = shortcuts.length ? `<h2>ทางลัดที่ปักหมุด</h2><div class="nav-shortcuts-grid">${shortcuts.map(item => `<button type="button" data-go="${item.tab}" class="nav-shortcut"><span aria-hidden="true">${item.emoji}</span><span>${item.label}</span></button>`).join('')}</div>` : '';
}

function makeLazyFeature(loader, onMount, errorLabel) {
  let feature = null;
  let promise = null;
  return {
    get: () => feature,
    ensure: () => {
      if (!promise) {
        promise = loader()
          .then(module => {
            feature = module;
            onMount(module);
            return module;
          })
          .catch(error => {
            promise = null;
            reportRuntimeError(error, { category: 'chunk', source: 'feature-load' });
            console.error(`Could not load ${errorLabel}:`, error);
            toast(`เปิด${errorLabel}ไม่สำเร็จ: ` + (error?.message || 'โหลดโมดูลไม่ได้'), 'err');
            return null;
          });
      }
      return promise;
    }
  };
}

const reportLoader = makeLazyFeature(() => import('./reports.js'), m => m.mountReport($('#tab-report')), 'รายงานสุขภาพ');
const workoutLoader = makeLazyFeature(() => import('./workout.js'), m => m.mountWorkout($('#tab-workout')), 'หน้าออกกำลังกาย');
const overviewLoader = makeLazyFeature(() => import('./overview.js'), m => m.mountOverview($('#tab-overview')), 'แดชบอร์ดภาพรวม');
const expenseLoader = makeLazyFeature(() => import('./expense.js'), m => m.mountExpense($('#tab-expense')), 'หน้ารายรับ-รายจ่าย');
const careLoader = makeLazyFeature(() => import('./care.js'), m => m.mountCare($('#tab-care')), 'หน้าสัตว์เลี้ยง');
const inventoryLoader = makeLazyFeature(() => import('./inventory.js'), m => m.mountInventory($('#tab-inventory')), 'หน้าของใช้ & สต๊อก');
const foodLoader = makeLazyFeature(() => import('./food.js'), m => { m.mountFood($('#tab-food')); m.watchDay(); }, 'หน้าอาหาร');
const weeklyLoader = makeLazyFeature(() => import('./weekly.js'), m => m.mountWeekly($('#tab-weekly')), 'หน้าสรุปสัปดาห์');
const remindLoader = makeLazyFeature(() => import('./remindLog.js'), m => m.mountRemind($('#tab-remind')), 'หน้าบันทึกเตือน');
const settingsLoader = makeLazyFeature(() => import('./settings.js'), m => { m.mountSettings($('#tab-settings')); m.refreshAccount?.(); }, 'หน้าตั้งค่า');

let chatFeature = null;
let chatMountPromise = null;
function ensureChatWidgetMounted(openAfterLoad = false) {
  if (!chatMountPromise) {
    const fab = $('#ai-chat-fab');
    if (fab) fab.disabled = true;
    chatMountPromise = import('./chatWidget.js')
      .then(module => {
        chatFeature = module;
        module.mountChatWidget(goTo);
        if (openAfterLoad) module.openChatWidget();
        return module;
      })
      .catch(error => {
        chatMountPromise = null;
        reportRuntimeError(error, { category: 'chunk', source: 'feature-load' });
        console.error('Could not load AI chat widget:', error);
        toast('เปิดผู้ช่วยแชทไม่สำเร็จ: ' + (error?.message || 'โหลดโมดูลไม่ได้'), 'err');
        return null;
      })
      .finally(() => {
        if (fab) fab.disabled = false;
      });
  } else if (openAfterLoad && chatFeature) {
    chatFeature.toggleChatWidget();
  }
  return chatMountPromise;
}

function mountChatFab() {
  if ($('#ai-chat-fab')) return;
  const host = $('#app-shell') || document.body;
  const wrap = document.createElement('div');
  wrap.className = 'no-print';
  wrap.innerHTML = `
    <button id="ai-chat-fab" type="button" class="ai-chat-fab" data-lazy-managed="1" aria-label="เปิดผู้ช่วย AI Track Me" aria-expanded="false" aria-controls="ai-chat-drawer" title="ผู้ช่วย AI">
      <i class="fa-solid fa-comments"></i>
    </button>`;
  host.appendChild(wrap);
  const fab = $('#ai-chat-fab');
  fab?.addEventListener('click', () => {
    if (chatFeature) chatFeature.toggleChatWidget();
    else void ensureChatWidgetMounted(true);
  });
}

function updateStickyOffsets() {
  const header = $('.app-header');
  const desktopNav = $('#desktop-nav');
  const headerHeight = header?.getBoundingClientRect().height || 0;
  const safeArea = Number.parseFloat(header ? getComputedStyle(header).paddingTop : '0') || 0;
  document.documentElement.style.setProperty('--header-h', `${Math.max(0, headerHeight - safeArea)}px`);
  document.documentElement.style.setProperty('--nav-bar-h', `${desktopNav?.getBoundingClientRect().height || 0}px`);
}

const stickyOffsetObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateStickyOffsets);
const stickyHeader = $('.app-header');
const stickyDesktopNav = $('#desktop-nav');
if (stickyHeader) stickyOffsetObserver?.observe(stickyHeader);
if (stickyDesktopNav) stickyOffsetObserver?.observe(stickyDesktopNav);
window.addEventListener('resize', updateStickyOffsets, { passive: true });
updateStickyOffsets();

export function showTab(name, { preserveDate = false } = {}) {
  if (!TABS.includes(name)) name = 'home';
  TABS.forEach(t => { const panel = $('#tab-' + t); if (panel) panel.classList.toggle('hidden', t !== name); });
  const group = groupOf(name);
  lastSub[group] = name;
  document.querySelectorAll('[data-nav]').forEach(b => { const on_ = b.dataset.nav === group; b.classList.toggle('is-active', on_); if (on_) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#btn-bell').classList.toggle('is-active', name === 'notifications');
  $('#btn-settings').classList.toggle('is-active', name === 'settings');
  document.documentElement.dataset.page = name;
  renderSubnav(group, name);
  if (!preserveDate) {
    if (name === 'home') resetHomePlannerToToday();
    if (name === 'period') resetPeriodToToday();
    if (name === 'symptoms') resetSymptomsToToday();
    if (name === 'body') resetBodyToToday();
  }
  let pending = Promise.resolve();
  if (name === 'home') { renderHome(); renderHomeShortcuts(); }
  if (name === 'food') pending = foodLoader.ensure().then(m => { if (!preserveDate) m?.resetFoodToToday?.(); });
  if (name === 'overview') pending = overviewLoader.ensure().then(m => m?.renderOverview?.());
  if (name === 'weekly') pending = weeklyLoader.ensure().then(m => { if (!preserveDate) m?.resetWeeklyToToday?.(); m?.renderWeekly?.(); });
  if (name === 'care') pending = careLoader.ensure().then(m => { if (!preserveDate) m?.resetCareToToday?.(); });
  if (name === 'remind') pending = remindLoader.ensure().then(m => m?.renderRemind?.());
  if (name === 'expense') pending = expenseLoader.ensure().then(m => { if (!preserveDate) m?.resetExpenseToToday?.(); m?.renderExpense?.(); });
  if (name === 'inventory') pending = inventoryLoader.ensure().then(m => m?.renderInventory?.());
  if (name === 'notifications') renderReminders();
  if (name === 'settings') pending = settingsLoader.ensure().then(m => m?.refreshAccount?.());
  if (name === 'report') pending = reportLoader.ensure().then(m => { if (!preserveDate) m?.resetReportToToday?.(); });
  if (name === 'workout') pending = workoutLoader.ensure().then(m => { if (!preserveDate) m?.resetToToday?.(); });
  try { sessionStorage.setItem('active_tab', name); } catch (e) {}
  return pending;
}

// เปิดกลุ่มเมนูจากแถบนำทางหลัก (จำหน้าย่อยล่าสุดของกลุ่ม)
function goToGroup(group) {
  const target = GROUPS[group] ? (lastSub[group] || GROUPS[group][0]) : group;
  goTo(target);
}

// เปิดหน้าแท็บเจาะจงแล้วเลื่อนไปที่ฟอร์มบันทึก (ไม่เขียนทับด้วย lastSub ของกลุ่ม)
async function goTo(name, focusId) {
  await showTab(name);
  if (name === 'care' && focusId && focusId.startsWith('lb-')) {
    await careLoader.get()?.ensureLabMounted?.();
  }
  if (!focusId) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  requestAnimationFrame(() => {
    const field = document.getElementById(focusId);
    const card = field?.closest('.card');
    if (!card) { window.scrollTo({ top: 0 }); return; }
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.remove('card-flash'); void card.offsetWidth; card.classList.add('card-flash');
    if (matchMedia('(hover: hover)').matches) field.focus({ preventScroll: true });
  });
}

function updateBell() {
  const n = collectReminders().length;
  const badge = $('#bell-badge');
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.classList.toggle('hidden', !n);
}

let quickTrigger = null;
function openQuick() {
  const sheet = $('#quick-sheet');
  quickTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : $('#btn-quick-add');
  $('#quick-grid').innerHTML = CATEGORIES.map(c => `<button data-quick="${c.tab}" data-focus="${c.focus}" class="cat-tile ${c.cat}"><span class="emoji-bubble">${c.emoji}</span><span>${c.label}</span></button>`).join('');
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => sheet.classList.add('is-open'));
  $('#btn-quick-add').setAttribute('aria-expanded', 'true');
  $('#quick-grid button')?.focus({ preventScroll: true });
}
function closeQuick() {
  const sheet = $('#quick-sheet');
  sheet.classList.remove('is-open');
  $('#btn-quick-add').setAttribute('aria-expanded', 'false');
  setTimeout(() => sheet.classList.add('hidden'), 200);
  if (quickTrigger?.isConnected) quickTrigger.focus({ preventScroll: true });
  quickTrigger = null;
}

let mounted = false;
function mountAll() {
  if (mounted) return;
  mounted = true;
  mountHome(goTo);
  renderHomeShortcuts();
  mountPeriod($('#tab-period'));
  mountSymptoms($('#tab-symptoms'));
  mountBody($('#tab-body'));
  mountReminders($('#tab-notifications'));
  mountChatFab();
}

let expenseRecordsLoaded = false;
let migratingLegacyExpenses = false;
let legacyMigrationBlocked = false;
let onboardingCheckedUid = null;

function stableLegacyExpenseId(docId, index) {
  const hash = Array.from(`${docId}_${index}`).reduce(
    (acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0,
    0
  );
  return 'lg' + Math.abs(hash).toString(36).padStart(8, '0');
}

function mergeExpenses() {
  const byId = new Map();
  // ให้ expense_records เป็นแหล่งข้อมูลหลักเสมอ (กันข้อมูลเก่าทับการแก้/ลบใหม่)
  for (const r of state.expenseRecords || []) {
    if (r?.id) byId.set(r.id, r);
  }
  for (const doc of state.legacyExpenseDocs || []) {
    if (doc.migratedAt) continue;
    for (const item of doc.items || []) {
      if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
    }
  }
  state.expenses = [...byId.values()].sort((a, b) =>
    String((b.date || '') + (b.time || '')).localeCompare(String((a.date || '') + (a.time || '')))
  );
}

async function migrateLegacyExpensesIfNeeded(uid) {
  if (migratingLegacyExpenses || legacyMigrationBlocked || !expenseRecordsLoaded || !navigator.onLine) return;
  const legacyDocs = (state.legacyExpenseDocs || []).filter(doc => !doc.migratedAt);
  if (!legacyDocs.length) return;

  migratingLegacyExpenses = true;
  try {
    const snapshot = await getDocs(userCol(uid, 'expense_records'));
    const existingIds = new Set(snapshot.docs.map(doc => doc.id));
    const toWrite = new Map();

    for (const doc of legacyDocs) {
      for (const [itemIndex, item] of (doc.items || []).entries()) {
        const itemId = item?.id && /^[\w-]{1,80}$/.test(item.id)
          ? item.id
          : stableLegacyExpenseId(doc.id, itemIndex);
        if (existingIds.has(itemId) || toWrite.has(itemId)) continue;
        const clean = SANITIZERS.expense_records(item);
        if (clean) toWrite.set(itemId, clean);
      }
    }

    const entries = [...toWrite.entries()];
    for (let i = 0; i < entries.length; i += 400) {
      const batch = writeBatch(db);
      entries.slice(i, i + 400).forEach(([id, data]) => {
        batch.set(userDoc(uid, 'expense_records', id), data);
      });
      await batch.commit();
    }

    for (let i = 0; i < legacyDocs.length; i += 400) {
      const batch = writeBatch(db);
      legacyDocs.slice(i, i + 400).forEach(doc => {
        batch.update(userDoc(uid, 'settings', doc.id), {
          migratedAt: new Date(),
          migratedCount: toWrite.size
        });
      });
      await batch.commit();
    }
  } catch (err) {
    // ถ้าการย้ายหรือทำเครื่องหมายไม่สำเร็จ ให้รอบถัดไปทำซ้ำด้วย ID เดิม
    reportRuntimeError(err, { category: 'firebase', source: 'sync' });
    console.warn('Legacy expense migration deferred:', err?.code || err?.message);
    if (/permission-denied/i.test(String(err?.code || err?.message || ''))) {
      legacyMigrationBlocked = true;
    }
  } finally {
    migratingLegacyExpenses = false;
  }
}

function startData() {
  if (isDemoMode()) return;
  const uid = state.uid;
  expenseRecordsLoaded = false;
  legacyMigrationBlocked = false;
  state.loaded = { period: false, body: false };
  watch('period_records', userCol(uid, 'period_records'), list => { state.period = list; state.loaded.period = true; renderPeriod(); renderSummary(); checkReminder(); renderReminders(); renderHome(); });
  watch('body_records', userCol(uid, 'body_records'), list => { state.body = list; state.loaded.body = true; renderBody(); renderReminders(); renderSummary(); refreshProfile(); emit('profile'); renderHome(); overviewLoader.get()?.renderOverview?.(); });
  watch('custom_foods', userCol(uid, 'custom_foods'), list => { state.customFoods = list; emit('customFoods'); });
  for (const [key, col] of [['petProfiles', 'pet_profiles'], ['petCare', 'pet_care_records'], ['petFoods', 'pet_food_records']]) {
    watch(`care:${col}`, userCol(uid, col), records => {
      state[key] = records;
      careLoader.get()?.renderCare?.();
      window.dispatchEvent(new Event('trackme:data-change'));
    });
  }
  for (const [key, col] of [['trackedProducts', 'tracked_products'], ['replacements', 'replacement_records'], ['skincareProducts', 'skincare_products'], ['ingredientBlacklist', 'ingredient_blacklist']]) {
    watch(`inventory:${col}`, userCol(uid, col), rows => {
      state[key] = rows;
      inventoryLoader.get()?.renderInventory?.();
      window.dispatchEvent(new Event('trackme:data-change'));
    });
  }
  watch('symptom_records', query(userCol(uid, 'symptom_records'), where('date', '>=', addDays(localDateStr(), -399))), list => { state.symptoms = list; renderSymptomList(); renderPeriod(); renderReminders(); renderHome(); });
  watch('skin_records', query(userCol(uid, 'skin_records'), where('date', '>=', addDays(localDateStr(), -399))), list => { state.skinRecords = list; renderSkinList(); });
  watch('workout_records', query(userCol(uid, 'workout_records'), where('date', '>=', addDays(localDateStr(), -400))), list => { state.workouts = list; workoutLoader.get()?.render?.(); weeklyLoader.get()?.renderWeekly?.(); renderHome(); renderSummary(); overviewLoader.get()?.renderOverview?.(); });
  watch('lab_records', userCol(uid, 'lab_records'), list => { state.labs = list; careLoader.get()?.onLabsUpdated?.(); });
  watch('workout_templates', userCol(uid, 'workout_templates'), list => { state.templates = list; workoutLoader.get()?.render?.(); });
  watch('expense_records', userCol(uid, 'expense_records'), list => {
    state.expenseRecords = list;
    expenseRecordsLoaded = true;
    mergeExpenses();
    expenseLoader.get()?.renderExpense?.();
    renderHome();
    weeklyLoader.get()?.renderWeekly?.();
    renderSummary();
    overviewLoader.get()?.renderOverview?.();
    migrateLegacyExpensesIfNeeded(uid);
  });
  watch('settings', userCol(uid, 'settings'), list => {
    state.expenseSettings = list;
    state.profile = list.find(x => x.id === 'profile') || null;
    state.planner = list.find(x => x.id === 'planner') || null;
    state.pushSettings = list.find(x => x.id === 'push') || null;
    state.assistantNotes = list
      .filter(x => x.kind === 'assistant_note' || String(x.id || '').startsWith('note_'))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    state.userFeedback = list
      .filter(x => x.kind === 'user_feedback' || String(x.id || '').startsWith('feedback_'))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (state.uid === uid && onboardingCheckedUid !== uid) {
      onboardingCheckedUid = uid;
      mountOnboarding(state.user, state.profile);
    }
    state.legacyExpenseDocs = list.filter(x => x.kind === 'expense_month' && Array.isArray(x.items));
    mergeExpenses();
    refreshProfile();
    emit('profile');
    emit('pushSettings');
    expenseLoader.get()?.renderExpense?.();
    renderHome();
    weeklyLoader.get()?.renderWeekly?.();
    renderSummary();
    overviewLoader.get()?.renderOverview?.();
    window.dispatchEvent(new Event('trackme:push-change'));
    window.dispatchEvent(new Event('trackme:notes-change'));
    migrateLegacyExpensesIfNeeded(uid);
  });
  watchToday();
  foodLoader.get()?.watchDay?.();
}

// อาหารของ "วันนี้" สำหรับหน้า Home (อ่านอย่างเดียว แยกจากวันที่ที่เลือกในหน้าอาหาร)
let todayKey = null;
function watchToday() {
  if (!state.uid) return;
  todayKey = localDateStr();
  watch('food-today', query(userCol(state.uid, 'food_records'), where('date', '==', todayKey)), list => { state.todayFood = list; renderHome(); renderSummary(); });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.uid && todayKey !== localDateStr()) { watchToday(); renderHome(); renderSummary(); } });

on('auth', user => {
  stopAll();
  onboardingCheckedUid = null;
  unmountOnboarding();
  overviewLoader.get()?.resetOverviewState?.();
  resetHomePlannerState();
  state.period = []; state.body = []; state.customFoods = []; state.demoFoodRecords = []; state.symptoms = []; state.labs = []; state.workouts = []; state.templates = []; state.profile = null; state.homeWidgets = null; state.planner = null; state.pushSettings = null; state.expenses = []; state.expenseRecords = []; state.expenseSettings = []; state.legacyExpenseDocs = []; state.todayFood = [];
  ['skincareProducts','skinRecords','petProfiles','petCare','petFoods','ingredientBlacklist','trackedProducts','replacements','assistantNotes','userFeedback'].forEach(k => { state[k] = []; });
  window.dispatchEvent(new Event('trackme:auth-change'));
  if (user) {
    if (isDemoMode()) seedDemoState();
    mountAll();
    updateStickyOffsets();
    settingsLoader.get()?.refreshAccount?.();
    renderSummary();
    startData();
    let start = null; try { start = sessionStorage.getItem('active_tab'); } catch (e) {}
    const navigationPreferences = readNavigationPreferences(state.uid);
    void showTab(navigationPreferences.customized ? navigationPreferences.landingPage : (start || 'home'));
    if (new URLSearchParams(window.location.search).has('shared-slip')) {
      void expenseLoader.ensure().then(m => m?.handleSharedSlipLaunch?.(showTab));
    }
  }
  renderSyncStatus();
});

document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => goToGroup(b.dataset.nav)));
$('#subnav').addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) goTo(b.dataset.sub); });
$('#btn-logo').addEventListener('click', () => goTo('home'));
$('#btn-bell').addEventListener('click', () => goTo('notifications'));
$('#btn-settings').addEventListener('click', () => goTo('settings'));
$('#btn-copy-summary').addEventListener('click', copySummary);
$('#fab-top')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('#fab-bottom')?.addEventListener('click', () => window.scrollTo({ top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), behavior: 'smooth' }));
$('#btn-quick-add').addEventListener('click', openQuick);
$('#quick-close').addEventListener('click', closeQuick);
$('#quick-sheet').addEventListener('click', e => {
  if (e.target.id === 'quick-sheet') return closeQuick();
  const b = e.target.closest('[data-quick]');
  if (b) { closeQuick(); goTo(b.dataset.quick, b.dataset.focus); }
});
document.addEventListener('keydown', e => {
  const sheet = $('#quick-sheet');
  if (sheet.classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeQuick();
    return;
  }
  if (e.key !== 'Tab') return;
  const nodes = [...sheet.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(node => node.getClientRects().length);
  if (!nodes.length) return;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) {
    e.preventDefault();
    first.focus();
  }
});
window.addEventListener('trackme:show-symptoms', () => showTab('symptoms', { preserveDate: true }));
window.addEventListener('trackme:data-change', () => { remindLoader.get()?.renderRemind?.(); renderReminders(); renderHome(); renderHomeShortcuts(); renderSummary(); });
window.addEventListener('trackme:navigation-change', () => {
  renderHomeShortcuts();
  renderSubnav(groupOf(document.documentElement.dataset.page || 'home'), document.documentElement.dataset.page || 'home');
});
window.addEventListener('trackme:reminders', updateBell);
window.addEventListener('trackme:push-change', () => renderHome());
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type === 'TRACKME_OPEN_TAB') void showTab(e.data.tab);
});
initAuth();
