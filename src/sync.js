import { onSnapshot } from 'firebase/firestore';
import { $, fmtDateTime } from './util.js';
import { reportRuntimeError } from './runtimeErrorMonitor.js';
import { isDemoMode } from './demo.js';

export const syncState = {
  pending: {},
  error: null,
  lastSync: Number((typeof localStorage !== 'undefined' ? localStorage.getItem('last_sync') : 0) || 0)
};
const unsubs = new Map();

export function watch(key, q, cb) {
  if (unsubs.has(key)) unsubs.get(key)();   // เปลี่ยน query ของ key เดิม (เช่น เปลี่ยนวันที่) ให้เลิกฟังอันเก่าก่อน
  const un = onSnapshot(q, { includeMetadataChanges: true }, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    reportSnapshot(key, snap);
  }, onSyncError);
  unsubs.set(key, un);
  return un;
}
export function stopAll() { unsubs.forEach(u => u()); unsubs.clear(); syncState.pending = {}; }

function reportSnapshot(key, snap) {
  const m = snap.metadata;
  syncState.pending[key] = m.hasPendingWrites;
  syncState.error = null;
  // fromCache=false และไม่มีรายการรอเขียน = ข้อมูลตรงกับเซิร์ฟเวอร์จริง
  if (!m.fromCache && !m.hasPendingWrites) {
    syncState.lastSync = Date.now();
    try { localStorage.setItem('last_sync', String(syncState.lastSync)); } catch (e) {}
  }
  renderSyncStatus();
}
function onSyncError(err) {
  reportRuntimeError(err, { category: 'firebase', source: 'sync' });
  syncState.error = err.code || err.message || 'unknown';
  renderSyncStatus();
}

export function syncLineText() {
  if (isDemoMode()) return 'โหมดตัวอย่าง · แสดงข้อมูลสมมติและไม่ได้ซิงค์กับบัญชี';
  const pending = Object.values(syncState.pending).some(Boolean);
  let t = syncState.lastSync ? `ซิงค์กับเซิร์ฟเวอร์ล่าสุด: ${fmtDateTime(syncState.lastSync)}` : 'ยังไม่เคยซิงค์กับเซิร์ฟเวอร์';
  if (!navigator.onLine) t += ' · ออฟไลน์ (แสดงข้อมูลที่จำไว้ในเครื่อง)';
  if (pending) t += ' · มีข้อมูลที่ยังรอซิงค์';
  return t;
}

export function renderSyncStatus() {
  const online = navigator.onLine;
  if (isDemoMode()) {
    const dot = $('#sync-dot'), text = $('#sync-text');
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400';
    if (text) text.textContent = 'โหมดตัวอย่าง';
    const line = $('#sum-sync');
    if (line) line.textContent = '🔄 ' + syncLineText();
    return;
  }
  const pending = Object.values(syncState.pending).some(Boolean);
  const dot = $('#sync-dot'), text = $('#sync-text');
  if (!dot || !text) return;
  if (syncState.error) { dot.className = 'w-2 h-2 rounded-full bg-rose-400'; text.textContent = 'เชื่อมต่อไม่ได้ (' + syncState.error + ')'; }
  else if (!online) { dot.className = 'w-2 h-2 rounded-full bg-slate-300'; text.textContent = pending ? 'ออฟไลน์ · รอซิงค์' : 'ออฟไลน์'; }
  else if (pending) { dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse'; text.textContent = 'กำลังซิงค์...'; }
  else { dot.className = 'w-2 h-2 rounded-full bg-green-400'; text.textContent = 'ซิงค์แล้ว'; }
  const line = $('#sum-sync');
  if (line) line.textContent = '🔄 ' + syncLineText();
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', renderSyncStatus);
  window.addEventListener('offline', renderSyncStatus);
}
