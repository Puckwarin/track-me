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
import { registerSW } from 'virtual:pwa-register';
import { doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';

import { db, userCol, userDoc } from './firebase.js';
import { initRuntimeErrorMonitoring, reportRuntimeError, setRuntimeErrorSink } from './runtimeErrorMonitor.js';
import { state, on, emit } from './state.js';
import { SANITIZERS } from './schema.js';
import { $, localDateStr, addDays, toast } from './util.js';
import { watch, stopAll, renderSyncStatus } from './sync.js';
import { initAuth } from './auth.js';
import './theme.js';
import { CATEGORIES, GROUPS, SUBTABS, groupOf } from './categories.js';
import { mountHome, renderHome } from './home.js';
import { resetPlannerToToday } from './planner.js';
import { mountFood, watchDay, resetFoodToToday } from './food.js';
import { mountPeriod, render as renderPeriod, checkReminder, resetPeriodToToday } from './period.js';
import { mountSymptoms, renderList as renderSymptomList, renderSkinList, resetSymptomsToToday } from './symptoms.js';
import { mountCare, watchCare, resetCareToToday } from './care.js';
import { mountInventory, watchInventory } from './inventory.js';
import { mountBody, render as renderBody, resetBodyToToday } from './body.js';
import { mountWeekly, renderWeekly, resetWeeklyToToday } from './weekly.js';
import { render as renderLab } from './lab.js';
import { mountRemind, renderRemind } from './remindLog.js';
import { refreshProfile } from './profile.js';
import { mountSettings, refreshAccount } from './settings.js';
import { renderSummary, copySummary } from './summary.js';
import { mountReminders, renderReminders, collectReminders } from './reminders.js';
import { mountExpense, renderExpense, handleSharedSlipLaunch, resetExpenseToToday } from './expense.js';
import { mountChatWidget } from './chatWidget.js';
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

const TABS = ['home', 'food', 'workout', 'weekly', 'period', 'symptoms', 'care', 'remind', 'expense', 'inventory', 'body', 'report', 'notifications', 'settings'];
const lastSub = {};   // จำหน้าย่อยล่าสุดของแต่ละกลุ่ม (เช่น สุขภาพ → ประจำเดือน)

function renderSubnav(group, name) {
  const nav = $('#subnav');
  const tabs = GROUPS[group] || [];
  nav.classList.toggle('hidden', tabs.length < 2);
  if (tabs.length < 2) { nav.innerHTML = ''; return; }
  nav.innerHTML = `<div class="subnav-row">${tabs.map(t => { const x = SUBTABS[t]; return `<button data-sub="${t}" class="sub-chip ${x.cat} ${t === name ? 'is-active' : ''}" ${t === name ? 'aria-current="page"' : ''}><span>${x.emoji}</span>${x.label}</button>`; }).join('')}</div>`;
  nav.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

let reportFeature = null;
let reportMountPromise = null;
function ensureReportMounted() {
  if (!reportMountPromise) {
    reportMountPromise = import('./reports.js')
      .then(module => {
        reportFeature = module;
        module.mountReport($('#tab-report'));
      })
      .catch(error => {
        reportMountPromise = null;
        reportRuntimeError(error, { category: 'chunk', source: 'feature-load' });
        console.error('Could not load health report:', error);
        toast('เปิดรายงานสุขภาพไม่สำเร็จ: ' + (error?.message || 'โหลดโมดูลไม่ได้'), 'err');
      });
  }
  return reportMountPromise;
}

let workoutFeature = null;
let workoutMountPromise = null;
function ensureWorkoutMounted() {
  if (!workoutMountPromise) {
    workoutMountPromise = import('./workout.js')
      .then(module => {
        workoutFeature = module;
        module.mountWorkout($('#tab-workout'));
      })
      .catch(error => {
        workoutMountPromise = null;
        reportRuntimeError(error, { category: 'chunk', source: 'feature-load' });
        console.error('Could not load workout feature:', error);
        toast('เปิดหน้าออกกำลังกายไม่สำเร็จ: ' + (error?.message || 'โหลดโมดูลไม่ได้'), 'err');
      });
  }
  return workoutMountPromise;
}

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
    if (name === 'home') resetPlannerToToday();
    if (name === 'food') resetFoodToToday();
    if (name === 'weekly') resetWeeklyToToday();
    if (name === 'period') resetPeriodToToday();
    if (name === 'symptoms') resetSymptomsToToday();
    if (name === 'care') resetCareToToday();
    if (name === 'body') resetBodyToToday();
    if (name === 'expense') resetExpenseToToday();
  }
  if (name === 'home') renderHome();
  if (name === 'weekly') renderWeekly();
  if (name === 'expense') renderExpense();
  if (name === 'notifications') renderReminders();
  if (name === 'report') void ensureReportMounted().then(() => { if (!preserveDate) reportFeature?.resetReportToToday?.(); });
  if (name === 'workout') void ensureWorkoutMounted().then(() => { if (!preserveDate) workoutFeature?.resetToToday?.(); });
  try { sessionStorage.setItem('active_tab', name); } catch (e) {}
}

// เปิดกลุ่มเมนูจากแถบนำทางหลัก (จำหน้าย่อยล่าสุดของกลุ่ม)
function goToGroup(group) {
  const target = GROUPS[group] ? (lastSub[group] || GROUPS[group][0]) : group;
  goTo(target);
}

// เปิดหน้าแท็บเจาะจงแล้วเลื่อนไปที่ฟอร์มบันทึก (ไม่เขียนทับด้วย lastSub ของกลุ่ม)
function goTo(name, focusId) {
  showTab(name);
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

function openQuick() {
  const sheet = $('#quick-sheet');
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
}

let mounted = false;
function mountAll() {
  if (mounted) return;
  mounted = true;
  mountHome(goTo);
  mountFood($('#tab-food'));
  mountWeekly($('#tab-weekly'));
  mountPeriod($('#tab-period'));
  mountSymptoms($('#tab-symptoms'));
  mountCare($('#tab-care'));
  mountRemind($('#tab-remind'));
  mountExpense($('#tab-expense'));
  mountInventory($('#tab-inventory'));
  mountBody($('#tab-body'));
  mountSettings($('#tab-settings'));
  mountReminders($('#tab-notifications'));
  mountChatWidget(goTo);
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
  const uid = state.uid;
  expenseRecordsLoaded = false;
  legacyMigrationBlocked = false;
  state.loaded = { period: false, body: false };
  watch('period_records', userCol(uid, 'period_records'), list => { state.period = list; state.loaded.period = true; renderPeriod(); renderSummary(); checkReminder(); renderReminders(); renderHome(); });
  watch('body_records', userCol(uid, 'body_records'), list => { state.body = list; state.loaded.body = true; renderBody(); renderReminders(); renderSummary(); refreshProfile(); emit('profile'); renderHome(); });
  watch('custom_foods', userCol(uid, 'custom_foods'), list => { state.customFoods = list; emit('customFoods'); });
  watchCare(uid);
  watchInventory(uid);
  watch('symptom_records', query(userCol(uid, 'symptom_records'), where('date', '>=', addDays(localDateStr(), -399))), list => { state.symptoms = list; renderSymptomList(); renderPeriod(); renderReminders(); renderHome(); });
  watch('skin_records', query(userCol(uid, 'skin_records'), where('date', '>=', addDays(localDateStr(), -399))), list => { state.skinRecords = list; renderSkinList(); });
  watch('workout_records', query(userCol(uid, 'workout_records'), where('date', '>=', addDays(localDateStr(), -400))), list => { state.workouts = list; workoutFeature?.render(); renderWeekly(); renderHome(); renderSummary(); });
  watch('lab_records', userCol(uid, 'lab_records'), list => { state.labs = list; renderLab(); });
  watch('workout_templates', userCol(uid, 'workout_templates'), list => { state.templates = list; workoutFeature?.render(); });
  watch('expense_records', userCol(uid, 'expense_records'), list => {
    state.expenseRecords = list;
    expenseRecordsLoaded = true;
    mergeExpenses();
    renderExpense();
    renderHome();
    renderWeekly();
    renderSummary();
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
    renderExpense();
    renderHome();
    renderWeekly();
    renderSummary();
    window.dispatchEvent(new Event('trackme:push-change'));
    window.dispatchEvent(new Event('trackme:notes-change'));
    migrateLegacyExpensesIfNeeded(uid);
  });
  watchToday();
  watchDay();
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
  state.period = []; state.body = []; state.customFoods = []; state.symptoms = []; state.labs = []; state.workouts = []; state.templates = []; state.profile = null; state.planner = null; state.pushSettings = null; state.expenses = []; state.expenseRecords = []; state.expenseSettings = []; state.legacyExpenseDocs = []; state.todayFood = [];
  ['skincareProducts','skinRecords','petProfiles','petCare','petFoods','ingredientBlacklist','trackedProducts','replacements','assistantNotes','userFeedback'].forEach(k => { state[k] = []; });
  if (user) {
    mountAll();
    refreshAccount();
    renderSummary();
    startData();
    let start = null; try { start = sessionStorage.getItem('active_tab'); } catch (e) {}
    showTab(start || 'home');
    handleSharedSlipLaunch(showTab);
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
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#quick-sheet').classList.contains('hidden')) closeQuick(); });
window.addEventListener('trackme:show-symptoms', () => showTab('symptoms', { preserveDate: true }));
window.addEventListener('trackme:data-change', () => { renderRemind(); renderReminders(); renderHome(); renderSummary(); });
window.addEventListener('trackme:reminders', updateBell);
window.addEventListener('trackme:push-change', () => renderHome());
navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type === 'TRACKME_OPEN_TAB') showTab(e.data.tab);
});
initAuth();
