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
import { query, where } from 'firebase/firestore';

import { userCol } from './firebase.js';
import { state, on, emit } from './state.js';
import { $, localDateStr, addDays } from './util.js';
import { watch, stopAll, renderSyncStatus } from './sync.js';
import { initAuth } from './auth.js';
import './theme.js';
import { CATEGORIES, GROUPS, SUBTABS, groupOf } from './categories.js';
import { mountHome, renderHome } from './home.js';
import { mountFood, watchDay } from './food.js';
import { mountPeriod, render as renderPeriod, checkReminder } from './period.js';
import { mountSymptoms, renderList as renderSymptomList, renderSkinList } from './symptoms.js';
import { mountCare, watchCare } from './care.js';
import { mountInventory, watchInventory } from './inventory.js';
import { mountBody, render as renderBody } from './body.js';
import { mountReport } from './reports.js';
import { mountWorkout, render as renderWorkout } from './workout.js';
import { mountWeekly, renderWeekly } from './weekly.js';
import { render as renderLab } from './lab.js';
import { mountRemind, renderRemind } from './remindLog.js';
import { refreshProfile } from './profile.js';
import { mountSettings, refreshAccount } from './settings.js';
import { renderSummary, copySummary } from './summary.js';
import { mountReminders, renderReminders, collectReminders } from './reminders.js';

registerSW({ immediate: true });

const TABS = ['home', 'food', 'workout', 'weekly', 'period', 'symptoms', 'care', 'remind', 'inventory', 'body', 'report', 'notifications', 'settings'];
const lastSub = {};   // จำหน้าย่อยล่าสุดของแต่ละกลุ่ม (เช่น สุขภาพ → ประจำเดือน)

function renderSubnav(group, name) {
  const nav = $('#subnav');
  const tabs = GROUPS[group] || [];
  nav.classList.toggle('hidden', tabs.length < 2);
  if (tabs.length < 2) { nav.innerHTML = ''; return; }
  nav.innerHTML = `<div class="subnav-row">${tabs.map(t => { const x = SUBTABS[t]; return `<button data-sub="${t}" class="sub-chip ${x.cat} ${t === name ? 'is-active' : ''}" ${t === name ? 'aria-current="page"' : ''}><span>${x.emoji}</span>${x.label}</button>`; }).join('')}</div>`;
  nav.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

export function showTab(name) {
  if (!TABS.includes(name)) name = 'home';
  TABS.forEach(t => { const panel = $('#tab-' + t); if (panel) panel.classList.toggle('hidden', t !== name); });
  const group = groupOf(name);
  lastSub[group] = name;
  document.querySelectorAll('[data-nav]').forEach(b => { const on_ = b.dataset.nav === group; b.classList.toggle('is-active', on_); if (on_) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#btn-bell').classList.toggle('is-active', name === 'notifications');
  $('#btn-settings').classList.toggle('is-active', name === 'settings');
  document.documentElement.dataset.page = name;
  renderSubnav(group, name);
  if (name === 'home') renderHome();
  if (name === 'weekly') renderWeekly();
  if (name === 'notifications') renderReminders();
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
  mountWorkout($('#tab-workout'));
  mountWeekly($('#tab-weekly'));
  mountPeriod($('#tab-period'));
  mountSymptoms($('#tab-symptoms'));
  mountCare($('#tab-care'));
  mountRemind($('#tab-remind'));
  mountInventory($('#tab-inventory'));
  mountBody($('#tab-body'));
  mountReport($('#tab-report'));
  mountSettings($('#tab-settings'));
  mountReminders($('#tab-notifications'));
}

function startData() {
  const uid = state.uid;
  state.loaded = { period: false, body: false };
  watch('period_records', userCol(uid, 'period_records'), list => { state.period = list; state.loaded.period = true; renderPeriod(); renderSummary(); checkReminder(); renderReminders(); renderHome(); });
  watch('body_records', userCol(uid, 'body_records'), list => { state.body = list; state.loaded.body = true; renderBody(); renderReminders(); renderSummary(); refreshProfile(); emit('profile'); renderHome(); });
  watch('custom_foods', userCol(uid, 'custom_foods'), list => { state.customFoods = list; emit('customFoods'); });
  watchCare(uid);
  watchInventory(uid);
  watch('symptom_records', query(userCol(uid, 'symptom_records'), where('date', '>=', addDays(localDateStr(), -399))), list => { state.symptoms = list; renderSymptomList(); renderPeriod(); renderReminders(); renderHome(); });
  watch('skin_records', query(userCol(uid, 'skin_records'), where('date', '>=', addDays(localDateStr(), -399))), list => { state.skinRecords = list; renderSkinList(); });
  watch('workout_records', query(userCol(uid, 'workout_records'), where('date', '>=', addDays(localDateStr(), -400))), list => { state.workouts = list; renderWorkout(); renderWeekly(); renderHome(); });
  watch('lab_records', userCol(uid, 'lab_records'), list => { state.labs = list; renderLab(); });
  watch('workout_templates', userCol(uid, 'workout_templates'), list => { state.templates = list; renderWorkout(); });
  watch('settings', userCol(uid, 'settings'), list => { state.profile = list.find(x => x.id === 'profile') || null; refreshProfile(); emit('profile'); renderHome(); });
  watchToday();
  watchDay();
}

// อาหารของ "วันนี้" สำหรับหน้า Home (อ่านอย่างเดียว แยกจากวันที่ที่เลือกในหน้าอาหาร)
let todayKey = null;
function watchToday() {
  if (!state.uid) return;
  todayKey = localDateStr();
  watch('food-today', query(userCol(state.uid, 'food_records'), where('date', '==', todayKey)), list => { state.todayFood = list; renderHome(); });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.uid && todayKey !== localDateStr()) { watchToday(); renderHome(); } });

on('auth', user => {
  stopAll();
  state.period = []; state.body = []; state.customFoods = []; state.symptoms = []; state.labs = []; state.workouts = []; state.templates = []; state.profile = null; state.todayFood = [];
  ['skincareProducts','skinRecords','petProfiles','petCare','petFoods','ingredientBlacklist','trackedProducts','replacements'].forEach(k => { state[k] = []; });
  if (user) {
    mountAll();
    refreshAccount();
    renderSummary();
    startData();
    let start = null; try { start = sessionStorage.getItem('active_tab'); } catch (e) {}
    showTab(start || 'home');
  }
  renderSyncStatus();
});

document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => goToGroup(b.dataset.nav)));
$('#subnav').addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) goTo(b.dataset.sub); });
$('#btn-logo').addEventListener('click', () => goTo('home'));
$('#btn-bell').addEventListener('click', () => goTo('notifications'));
$('#btn-settings').addEventListener('click', () => goTo('settings'));
$('#btn-copy-summary').addEventListener('click', copySummary);
$('#btn-quick-add').addEventListener('click', openQuick);
$('#quick-close').addEventListener('click', closeQuick);
$('#quick-sheet').addEventListener('click', e => {
  if (e.target.id === 'quick-sheet') return closeQuick();
  const b = e.target.closest('[data-quick]');
  if (b) { closeQuick(); goTo(b.dataset.quick, b.dataset.focus); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#quick-sheet').classList.contains('hidden')) closeQuick(); });
window.addEventListener('trackme:show-symptoms', () => showTab('symptoms'));
window.addEventListener('trackme:data-change', () => { renderRemind(); renderReminders(); renderHome(); });
window.addEventListener('trackme:reminders', updateBell);
initAuth();
