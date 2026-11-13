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
import { TAB_ACTIVE, TAB_IDLE, TAB_BASE } from './theme.js';
import { mountFood, watchDay } from './food.js';
import { mountPeriod, render as renderPeriod, checkReminder } from './period.js';
import { mountSymptoms, renderList as renderSymptomList, renderSkinList } from './symptoms.js';
import { mountCare, watchCare } from './care.js';
import { mountInventory, watchInventory } from './inventory.js';
import { mountBody, render as renderBody } from './body.js';
import { mountReport } from './reports.js';
import { mountWorkout, render as renderWorkout } from './workout.js';
import { mountWeekly, renderWeekly } from './weekly.js';
import { mountLab, render as renderLab } from './lab.js';
import { refreshProfile } from './profile.js';
import { mountSettings, refreshAccount } from './settings.js';
import { renderSummary, copySummary } from './summary.js';
import { mountReminders, renderReminders } from './reminders.js';

registerSW({ immediate: true });

const TABS = ['food', 'workout', 'weekly', 'lab', 'period', 'symptoms', 'care', 'inventory', 'body', 'report', 'notifications', 'settings'];
const HEALTH_TABS = ['weekly', 'lab', 'period', 'symptoms', 'body', 'report'];
const CARE_TABS = ['care', 'inventory'];
export function showTab(name) {
  TABS.forEach(t => { const panel=$('#tab-'+t); if(panel)panel.classList.toggle('hidden',t!==name); });
  const health=HEALTH_TABS.includes(name), care=CARE_TABS.includes(name);
  const activeGroup=health?'health':care?'caretools':name;
  ['food','workout','health','caretools','notifications'].forEach(t=>{const b=$('#tabbtn-'+t);if(b)b.className=`${TAB_BASE} ${t===activeGroup?TAB_ACTIVE:TAB_IDLE}`;});
  $('#health-subtab').classList.toggle('hidden',!health); $('#care-subtab').classList.toggle('hidden',!care);
  if(health)$('#health-subtab').value=name; if(care)$('#care-subtab').value=name;
  if (name === 'weekly') renderWeekly();
  if (name === 'notifications') renderReminders();
  try { localStorage.setItem('active_tab', name); } catch (e) {}
}

let mounted = false;
function mountAll() {
  if (mounted) return;
  mounted = true;
  mountFood($('#tab-food'));
  mountWorkout($('#tab-workout'));
  mountWeekly($('#tab-weekly'));
  mountLab($('#tab-lab'));
  mountPeriod($('#tab-period'));
  mountSymptoms($('#tab-symptoms'));
  mountCare($('#tab-care'));
  mountInventory($('#tab-inventory'));
  mountBody($('#tab-body'));
  mountReport($('#tab-report'));
  mountSettings($('#tab-settings'));
  mountReminders($('#tab-notifications'));
}

function startData() {
  const uid = state.uid;
  state.loaded = { period: false, body: false };
  watch('period_records', userCol(uid, 'period_records'), list => { state.period = list; state.loaded.period = true; renderPeriod(); renderSummary(); checkReminder(); renderReminders(); });
  watch('body_records', userCol(uid, 'body_records'), list => { state.body = list; state.loaded.body = true; renderBody(); renderReminders(); renderSummary(); refreshProfile(); emit('profile'); });
  watch('custom_foods', userCol(uid, 'custom_foods'), list => { state.customFoods = list; emit('customFoods'); });
  watchCare(uid);
  watchInventory(uid);
  watch('symptom_records', query(userCol(uid, 'symptom_records'), where('date', '>=', addDays(localDateStr(), -399))), list => { state.symptoms = list; renderSymptomList(); renderPeriod(); renderReminders(); });
  watch('skin_records', query(userCol(uid, 'skin_records'), where('date', '>=', addDays(localDateStr(), -399))), list => { state.skinRecords = list; renderSkinList(); });
  watch('workout_records', query(userCol(uid, 'workout_records'), where('date', '>=', addDays(localDateStr(), -400))), list => { state.workouts = list; renderWorkout(); renderWeekly(); });
  watch('lab_records', userCol(uid, 'lab_records'), list => { state.labs = list; renderLab(); });
  watch('workout_templates', userCol(uid, 'workout_templates'), list => { state.templates = list; renderWorkout(); });
  watch('settings', userCol(uid, 'settings'), list => { state.profile = list.find(x => x.id === 'profile') || null; refreshProfile(); emit('profile'); });
  watchDay();
}

on('auth', user => {
  stopAll();
  state.period = []; state.body = []; state.customFoods = []; state.symptoms = []; state.labs = []; state.workouts = []; state.templates = []; state.profile = null;
  ['skincareProducts','skinRecords','petProfiles','petCare','petFoods','ingredientBlacklist','trackedProducts','replacements'].forEach(k => { state[k] = []; });
  if (user) {
    mountAll();
    refreshAccount();
    renderSummary();
    startData();
    showTab(localStorage.getItem('active_tab') || 'food');
  }
  renderSyncStatus();
});

['food','workout','notifications'].forEach(t => { const b=$('#tabbtn-'+t); if(b)b.addEventListener('click',()=>showTab(t)); });
$('#tabbtn-health').addEventListener('click',()=>showTab($('#health-subtab').value||'weekly'));
$('#health-subtab').addEventListener('change',e=>showTab(e.target.value));
$('#tabbtn-caretools').addEventListener('click',()=>showTab($('#care-subtab').value||'care'));
$('#care-subtab').addEventListener('change',e=>showTab(e.target.value));
$('#btn-settings').addEventListener('click', () => showTab('settings'));
$('#btn-copy-summary').addEventListener('click', copySummary);
window.addEventListener('trackme:show-symptoms', () => showTab('symptoms'));
window.addEventListener('trackme:data-change',renderReminders);
initAuth();
