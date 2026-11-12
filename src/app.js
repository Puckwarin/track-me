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
import { renderList as renderSymptomList } from './symptoms.js';
import { mountBody, render as renderBody } from './body.js';
import { mountReport } from './reports.js';
import { mountSettings, refreshAccount } from './settings.js';
import { renderSummary, copySummary } from './summary.js';

registerSW({ immediate: true });

const TABS = ['food', 'period', 'body', 'report', 'settings'];
export function showTab(name) {
  TABS.forEach(t => {
    $('#tab-' + t).classList.toggle('hidden', t !== name);
    const b = $('#tabbtn-' + t);
    if (b) b.className = `${TAB_BASE} ${t === name ? TAB_ACTIVE : TAB_IDLE}`;
  });
  try { localStorage.setItem('active_tab', name); } catch (e) {}
}

let mounted = false;
function mountAll() {
  if (mounted) return;
  mounted = true;
  mountFood($('#tab-food'));
  mountPeriod($('#tab-period'));
  mountBody($('#tab-body'));
  mountReport($('#tab-report'));
  mountSettings($('#tab-settings'));
}

function startData() {
  const uid = state.uid;
  state.loaded = { period: false, body: false };
  watch('period_records', userCol(uid, 'period_records'), list => { state.period = list; state.loaded.period = true; renderPeriod(); renderSummary(); checkReminder(); });
  watch('body_records', userCol(uid, 'body_records'), list => { state.body = list; state.loaded.body = true; renderBody(); renderSummary(); });
  watch('custom_foods', userCol(uid, 'custom_foods'), list => { state.customFoods = list; emit('customFoods'); });
  // อาการ: โหลดย้อนหลัง ~13 เดือน (ช่วงเก่ากว่านั้นดูได้ในรายงาน)
  watch('symptom_records', query(userCol(uid, 'symptom_records'), where('date', '>=', addDays(localDateStr(), -399))), list => { state.symptoms = list; renderSymptomList(); renderPeriod(); });
  watchDay();
}

on('auth', user => {
  stopAll();
  state.period = []; state.body = []; state.customFoods = []; state.symptoms = [];
  if (user) {
    mountAll();
    refreshAccount();
    renderSummary();      // แสดงจากแคชในเครื่องทันที ก่อน Firestore ตอบกลับ
    startData();
    showTab(localStorage.getItem('active_tab') || 'food');
  }
  renderSyncStatus();
});

TABS.forEach(t => { const b = $('#tabbtn-' + t); if (b) b.addEventListener('click', () => showTab(t)); });
$('#btn-settings').addEventListener('click', () => showTab('settings'));
$('#btn-copy-summary').addEventListener('click', copySummary);
initAuth();
