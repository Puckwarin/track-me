import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, daysBetween, toast } from './util.js';
import { periodStats } from './period.js';
import { bodyLatest } from './body.js';
import { syncLineText, renderSyncStatus } from './sync.js';

let current = null;
const cacheKey = () => 'summary_cache_' + state.uid;

export function clearSummaryCache() { if (state.uid) localStorage.removeItem(cacheKey()); }

// การ์ดสรุปสำหรับแสดงหมอ: คำนวณจากข้อมูลจริงเมื่อโหลดครบ ไม่เช่นนั้นใช้ค่าที่จำไว้ในเครื่องทันที (ใช้ได้ตอนออฟไลน์)
export function renderSummary() {
  const live = state.loaded.period && state.loaded.body;
  let s = null;
  if (live) {
    s = { period: periodStats(state.period), body: bodyLatest(state.body) };
    try { localStorage.setItem(cacheKey(), JSON.stringify(s)); } catch (e) {}
  } else {
    try { s = JSON.parse(localStorage.getItem(cacheKey()) || 'null'); } catch (e) { s = null; }
  }
  current = s;

  const card = (icon, title, main, sub) => `<div class="bg-lav-soft/50 border border-lav-soft rounded-xl p-3">
    <div class="text-xs text-slate-500 mb-1"><i class="${icon}"></i> ${title}</div><div class="text-base font-bold text-slate-800">${main}</div><div class="text-xs text-slate-500 mt-0.5">${sub}</div></div>`;
  const empty = '<span class="text-slate-400 font-normal text-sm">ยังไม่มีข้อมูล</span>';
  const p = s?.period, b = s?.body || {};
  let c1, c2;
  if (p) {
    c1 = card('fa-solid fa-droplet text-pink-500', 'ประจำเดือนครั้งล่าสุด (LMP)', esc(fmtDate(p.lastStart)),
      `${daysBetween(p.lastStart, localDateStr())} วันที่แล้ว${p.lastEnd ? ' · มา ' + (daysBetween(p.lastStart, p.lastEnd) + 1) + ' วัน' : ''}`);
    c2 = card('fa-solid fa-rotate text-pink-500', 'รอบเฉลี่ย', p.avgCycle ? p.avgCycle + ' วัน' : empty, p.next ? 'คาดรอบหน้า ~ ' + esc(fmtDate(p.next)) : 'ต้องมีอย่างน้อย 2 รอบ');
  } else {
    c1 = card('fa-solid fa-droplet text-pink-500', 'ประจำเดือนครั้งล่าสุด (LMP)', empty, 'ไปที่แท็บประจำเดือนเพื่อบันทึก');
    c2 = card('fa-solid fa-rotate text-pink-500', 'รอบเฉลี่ย', empty, '');
  }
  const c3 = card('fa-solid fa-weight-scale text-blue-500', 'น้ำหนักล่าสุด', b.weight ? b.weight.v + ' กก.' : empty, b.weight ? esc(fmtDate(b.weight.d)) : '');
  const m = [['อก', 'bust'], ['เอว', 'waist'], ['สะโพก', 'hip']].map(([t, k]) => `${t} ${b[k] ? b[k].v : '-'}`).join(' / ');
  const c4 = card('fa-solid fa-ruler text-blue-500', 'สัดส่วนล่าสุด (ซม.)', (b.bust || b.waist || b.hip) ? `<span class="text-sm">${m}</span>` : empty, '');
  $('#summary-grid').innerHTML = c1 + c2 + c3 + c4;
  renderSyncStatus();
}

export function copySummary() {
  const s = current;
  if (!s) return toast('ยังไม่มีข้อมูลให้คัดลอก', 'err');
  const p = s.period, b = s.body || {};
  const L = [`สรุปสุขภาพ (ณ ${fmtDate(localDateStr())})`];
  if (p) {
    L.push(`ประจำเดือนครั้งล่าสุด (LMP): ${fmtDate(p.lastStart)} (${daysBetween(p.lastStart, localDateStr())} วันที่แล้ว)`);
    if (p.avgCycle) L.push(`รอบเฉลี่ย: ${p.avgCycle} วัน`);
    if (p.avgDur) L.push(`มาเฉลี่ย: ${p.avgDur} วัน`);
  }
  if (b.weight) L.push(`น้ำหนักล่าสุด: ${b.weight.v} กก. (${fmtDate(b.weight.d)})`);
  const m = [['อก', b.bust], ['เอว', b.waist], ['สะโพก', b.hip]].filter(x => x[1]).map(x => `${x[0]} ${x[1].v}`);
  if (m.length) L.push(`สัดส่วน: ${m.join(' / ')} ซม.`);
  L.push(syncLineText());
  const text = L.join('\n');
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast('คัดลอกแล้ว'), () => prompt('คัดลอกข้อความนี้:', text));
}
