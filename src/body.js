import { addDoc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, isDateStr, localDateStr, parseLocal, numField, openModal, round1, toast } from './util.js';
import { parseZeppCsv, mergeZeppDayRecords } from './zeppParser.js';
import { readZeppScreenshot, runImageBatch, formatImageProgress, explainGeminiError } from './nutrition.js';

const CHART_METRICS = [
  { key: 'weight', label: 'น้ำหนัก', unit: 'กก.', color: '#3b82f6' },
  { key: 'waist', label: 'รอบเอว', unit: 'ซม.', color: '#8b5cf6' },
  { key: 'hip', label: 'สะโพก', unit: 'ซม.', color: '#ec4899' },
  { key: 'arm', label: 'รอบแขน', unit: 'ซม.', color: '#10b981' },
  { key: 'thigh', label: 'รอบขา', unit: 'ซม.', color: '#f59e0b' },
  { key: 'bust', label: 'รอบอก', unit: 'ซม.', color: '#06b6d4' }
];

const SLEEP_STEPS_METRICS = [
  { key: 'sleepHours', label: 'การนอน (ชม.)', unit: 'ชม.', color: '#6366f1', decimals: 1 },
  { key: 'steps', label: 'ก้าวเดิน', unit: 'ก้าว', color: '#10b981', decimals: 0 }
];

const BODY_MEASUREMENT_KEYS = ['weight', 'bust', 'waist', 'hip', 'arm', 'thigh'];

let root;
let activeMetric = 'weight';
let activeSleepStepsMetric = 'sleepHours';

const hasBodyMeasurement = r => BODY_MEASUREMENT_KEYS.some(k => typeof r?.[k] === 'number');
const hasSleepOrSteps = r => r && (typeof r.sleepHours === 'number' || typeof r.sleepMinutes === 'number' || typeof r.steps === 'number');
const resolvedSleepHours = r => typeof r?.sleepHours === 'number'
  ? r.sleepHours
  : (typeof r?.sleepMinutes === 'number' ? Math.round((r.sleepMinutes / 60) * 100) / 100 : null);

function sourceBadgeLabel(src) {
  if (src === 'zepp_csv') return 'Zepp CSV';
  if (src === 'zepp_ai') return 'Zepp AI';
  if (src === 'zepp') return 'Zepp';
  return 'กรอกเอง';
}

function formatDurationTh(hours, minutes) {
  const totalMin = typeof minutes === 'number' && minutes > 0
    ? Math.round(minutes)
    : (typeof hours === 'number' && hours > 0 ? Math.round(hours * 60) : 0);
  if (!totalMin) return '';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} ชม. ${m} น.` : `${h} ชม.`;
}

export function mountBody(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-2 space-y-6">
    <div class="card space-y-4">
      <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-weight-scale text-blue-500"></i> บันทึกน้ำหนัก & สัดส่วน</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div><label class="lbl">วันที่</label><input type="date" id="b-date" class="input"></div>
        <div><label class="lbl">น้ำหนัก (กก.)</label><input type="number" step="0.1" inputmode="decimal" id="b-weight" class="input"></div>
        <div><label class="lbl">รอบอก (ซม.)</label><input type="number" step="0.1" inputmode="decimal" id="b-bust" class="input"></div>
        <div><label class="lbl">รอบเอว (ซม.)</label><input type="number" step="0.1" inputmode="decimal" id="b-waist" class="input"></div>
        <div><label class="lbl">รอบสะโพก (ซม.)</label><input type="number" step="0.1" inputmode="decimal" id="b-hip" class="input"></div>
        <div><label class="lbl">รอบแขน (ซม.)</label><input type="number" step="0.1" inputmode="decimal" id="b-arm" class="input"></div>
        <div><label class="lbl">รอบขา (ซม.)</label><input type="number" step="0.1" inputmode="decimal" id="b-thigh" class="input"></div>
        <div class="sm:col-span-2"><label class="lbl">หมายเหตุ</label><input id="b-note" class="input" placeholder="ไม่บังคับ"></div>
      </div>
      <p class="text-xs text-slate-400">กรอกเฉพาะค่าที่วัดได้ในวันนั้น เช่น ชั่งน้ำหนักอย่างเดียวก็ได้</p>
      <div class="flex justify-end"><button id="b-save" class="btn btn-sky"><i class="fa-solid fa-plus"></i> บันทึก</button></div>
    </div>

    <div class="card space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-bed text-indigo-500"></i> การนอน & 👣 ก้าวเดิน <span class="text-xs font-medium text-indigo-600">(รองรับ Zepp)</span></h2>
          <p class="text-xs text-slate-500 mt-0.5">เว็บแอปบนเบราว์เซอร์ไม่สามารถเชื่อมต่อเข้าแอป Zepp บนมือถือโดยตรงได้ — เลือกบันทึกเอง, นำเข้าไฟล์ CSV ที่ Export จาก Zepp, หรือสแกนภาพแคปหน้าจอจาก Zepp ได้ทันที</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <label class="btn btn-soft text-xs cursor-pointer">
          <i class="fa-solid fa-file-csv text-emerald-600"></i> นำเข้า Zepp CSV (ACTIVITY / SLEEP)
          <input type="file" id="bz-csv" accept=".csv,text/csv" multiple class="hidden">
        </label>
        <label class="btn btn-soft text-xs cursor-pointer">
          <i class="fa-solid fa-camera text-indigo-600"></i> สแกนรูปจากแอป Zepp
          <input type="file" id="bz-scan" accept="image/*" multiple class="hidden">
        </label>
      </div>
      <p id="bz-status" class="text-xs text-slate-500 hidden"></p>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div><label class="lbl">วันที่</label><input type="date" id="bz-date" class="input"></div>
        <div><label class="lbl">ชั่วโมงนอน (ชม.)</label><input type="number" step="0.1" min="0" max="24" inputmode="decimal" id="bz-sleep" class="input" placeholder="เช่น 7.5"></div>
        <div><label class="lbl">จำนวนก้าว</label><input type="number" step="1" min="0" inputmode="numeric" id="bz-steps" class="input" placeholder="เช่น 8420"></div>
        <div><label class="lbl">เวลาเข้านอน</label><input type="time" id="bz-bed" class="input"></div>
        <div><label class="lbl">เวลาตื่นนอน</label><input type="time" id="bz-wake" class="input"></div>
        <div><label class="lbl">หมายเหตุ</label><input id="bz-note" class="input" placeholder="หลับสบาย / เดินออกกำลัง"></div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-[11px] text-slate-400">นำเข้า CSV พร้อมกันทั้ง SLEEP.csv และ ACTIVITY.csv ระบบจะรวมข้อมูลวันเดียวกันให้อัตโนมัติ</span>
        <button id="bz-save" class="btn btn-primary text-xs"><i class="fa-solid fa-plus"></i> บันทึกนอน / ก้าวเดิน</button>
      </div>

      <div class="border-t border-slate-100 pt-3 space-y-2">
        <h3 class="text-sm font-bold text-slate-700">ประวัติการนอน & ก้าวเดินล่าสุด</h3>
        <div id="bz-list" class="space-y-2"></div>
      </div>
    </div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-list text-blue-500"></i> ประวัติน้ำหนัก & สัดส่วน</h3>
      <div class="overflow-x-auto"><table class="w-full text-left text-sm">
        <thead class="bg-sky-soft/50 text-slate-600"><tr><th class="p-3">วันที่</th><th class="p-3 text-right">น้ำหนัก</th><th class="p-3 text-right">อก</th><th class="p-3 text-right">เอว</th><th class="p-3 text-right">สะโพก</th><th class="p-3 text-right">แขน</th><th class="p-3 text-right">ขา</th><th class="p-3 text-center">ลบ</th></tr></thead>
        <tbody id="b-body" class="divide-y divide-slate-100"></tbody></table></div>
    </div>
  </div>
  <div class="space-y-6">
    <div class="card space-y-3">
      <h3 id="b-chart-title" class="font-bold text-slate-800"><i class="fa-solid fa-chart-line text-blue-500"></i> แนวโน้มน้ำหนัก & สัดส่วน</h3>
      <div id="b-chart-tabs" class="flex flex-wrap gap-1.5"></div>
      <div id="b-chart-meta" class="text-xs text-slate-600"></div>
      <div id="b-chart"></div>
    </div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-moon text-indigo-500"></i> แนวโน้มการนอน & ก้าวเดิน</h3>
      <div id="bz-chart-tabs" class="flex flex-wrap gap-1.5"></div>
      <div id="bz-chart-meta" class="text-xs text-slate-600"></div>
      <div id="bz-chart"></div>
    </div>
  </div>`;

  $('#b-date', root).value = localDateStr();
  $('#bz-date', root).value = localDateStr();
  $('#b-save', root).addEventListener('click', save);
  $('#bz-save', root).addEventListener('click', saveSleepSteps);
  $('#bz-csv', root).addEventListener('change', handleCsvImport);
  $('#bz-scan', root).addEventListener('change', handleScreenshotScan);

  $('#b-chart-tabs', root).addEventListener('click', e => {
    const b = e.target.closest('[data-metric]');
    if (!b) return;
    activeMetric = b.dataset.metric;
    renderChart();
  });
  $('#bz-chart-tabs', root).addEventListener('click', e => {
    const b = e.target.closest('[data-ss-metric]');
    if (!b) return;
    activeSleepStepsMetric = b.dataset.ssMetric;
    renderSleepStepsChart();
  });
  $('#b-body', root).addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (b && confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) deleteDoc(userDoc(state.uid, 'body_records', b.dataset.del)).catch(err => toast(err.message, 'err'));
  });
  $('#bz-list', root).addEventListener('click', e => {
    const b = e.target.closest('[data-ss-del]');
    if (b && confirm('ต้องการลบข้อมูลการนอน/ก้าวเดินวันนี้ใช่หรือไม่?')) deleteDoc(userDoc(state.uid, 'body_records', b.dataset.ssDel)).catch(err => toast(err.message, 'err'));
  });
  render();
}

export function resetBodyToToday() {
  if (!root) return;
  const today = localDateStr();
  const dateEl = $('#b-date', root);
  if (dateEl) dateEl.value = today;
  const zDateEl = $('#bz-date', root);
  if (zDateEl) zDateEl.value = today;
}

export const sortBodyDesc = items => items.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

export function bodyLatest(items) {
  const desc = sortBodyDesc(items), out = {};
  BODY_MEASUREMENT_KEYS.forEach(k => {
    const f = desc.find(i => typeof i[k] === 'number');
    if (f) out[k] = { v: f[k], d: f.date };
  });
  const sRec = desc.find(i => resolvedSleepHours(i) !== null);
  if (sRec) out.sleepHours = { v: resolvedSleepHours(sRec), d: sRec.date };
  const stepRec = desc.find(i => typeof i.steps === 'number');
  if (stepRec) out.steps = { v: stepRec.steps, d: stepRec.date };
  return out;
}

export function metricChartSvg(items, metricKey = 'weight') {
  const meta = CHART_METRICS.find(m => m.key === metricKey) || SLEEP_STEPS_METRICS.find(m => m.key === metricKey) || CHART_METRICS[0];
  const valOf = i => (metricKey === 'sleepHours' ? resolvedSleepHours(i) : (typeof i[meta.key] === 'number' ? i[meta.key] : null));
  const pts = items.map(i => ({ date: i.date, val: valOf(i) })).filter(i => typeof i.val === 'number' && i.date).sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
  if (pts.length < 2) return `<p class="text-xs text-slate-400">บันทึก${esc(meta.label)}อย่างน้อย 2 ครั้งเพื่อดูกราฟ</p>`;
  const W = 320, H = 165, P = 34;
  const vs = pts.map(p => p.val);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (max - min < 1) { min = Math.max(0, min - 0.5); max += 0.5; }
  const ts = pts.map(p => parseLocal(p.date).getTime());
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const x = t => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = w => H - P - ((w - min) / (max - min)) * (H - 2 * P);
  const decimals = meta.decimals ?? 1;
  const fmtVal = v => decimals === 0 ? Math.round(v).toLocaleString() : v.toFixed(decimals);
  const line = pts.map((p, i) => `${x(ts[i]).toFixed(1)},${y(p.val).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(ts[i]).toFixed(1)}" cy="${y(p.val).toFixed(1)}" r="3.2" fill="${meta.color}"><title>${esc(fmtDate(p.date))}: ${fmtVal(p.val)} ${esc(meta.unit)}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto"><polyline points="${line}" fill="none" stroke="${meta.color}" stroke-width="2.2"/>${dots}
    <text x="4" y="${y(max) + 4}" font-size="9.5" fill="#64748b">${esc(fmtVal(max))}</text><text x="4" y="${y(min) + 4}" font-size="9.5" fill="#64748b">${esc(fmtVal(min))}</text>
    <text x="${P}" y="${H - 6}" font-size="10" fill="#94a3b8">${esc(fmtDate(pts[0].date))}</text>
    <text x="${W - P}" y="${H - 6}" font-size="10" fill="#94a3b8" text-anchor="end">${esc(fmtDate(pts[pts.length - 1].date))}</text></svg>`;
}

export function weightChartSvg(items) {
  return metricChartSvg(items, 'weight');
}

function renderChart() {
  if (!root) return;
  const meta = CHART_METRICS.find(m => m.key === activeMetric) || CHART_METRICS[0];
  $('#b-chart-tabs', root).innerHTML = CHART_METRICS.map(m => {
    const on_ = m.key === meta.key;
    return `<button type="button" data-metric="${m.key}" class="chip text-xs ${on_ ? 'bg-brand text-white font-semibold' : 'bg-slate-100 text-slate-600'}">${esc(m.label)}</button>`;
  }).join('');

  const pts = state.body.filter(i => typeof i[meta.key] === 'number' && i.date).sort((a, b) => a.date.localeCompare(b.date));
  const metaEl = $('#b-chart-meta', root);
  if (pts.length) {
    const first = pts[0][meta.key];
    const last = pts[pts.length - 1][meta.key];
    const diffAll = round1(last - first);
    const diffStr = pts.length > 1 && diffAll !== 0
      ? ` · เปลี่ยนจากครั้งแรก <b class="${diffAll > 0 ? 'text-rose-600' : 'text-emerald-700'}">${diffAll > 0 ? '+' : ''}${diffAll} ${esc(meta.unit)}</b>`
      : '';
    metaEl.innerHTML = `${esc(meta.label)}ล่าสุด: <b>${last} ${esc(meta.unit)}</b> (${esc(fmtDate(pts[pts.length - 1].date))})${diffStr}`;
  } else {
    metaEl.innerHTML = `<span class="text-slate-400">ยังไม่มีข้อมูล${esc(meta.label)}</span>`;
  }

  $('#b-chart', root).innerHTML = metricChartSvg(state.body, meta.key);
}

function renderSleepStepsChart() {
  if (!root) return;
  const meta = SLEEP_STEPS_METRICS.find(m => m.key === activeSleepStepsMetric) || SLEEP_STEPS_METRICS[0];
  $('#bz-chart-tabs', root).innerHTML = SLEEP_STEPS_METRICS.map(m => {
    const on_ = m.key === meta.key;
    return `<button type="button" data-ss-metric="${m.key}" class="chip text-xs ${on_ ? 'bg-brand text-white font-semibold' : 'bg-slate-100 text-slate-600'}">${esc(m.label)}</button>`;
  }).join('');

  const pts = state.body
    .map(i => ({ date: i.date, val: meta.key === 'sleepHours' ? resolvedSleepHours(i) : (typeof i.steps === 'number' ? i.steps : null) }))
    .filter(i => typeof i.val === 'number' && i.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const metaEl = $('#bz-chart-meta', root);
  if (pts.length) {
    const recent7 = pts.slice(-7);
    const avg7 = recent7.reduce((s, p) => s + p.val, 0) / recent7.length;
    const latest = pts[pts.length - 1];
    const fmt = v => meta.key === 'steps' ? Math.round(v).toLocaleString() : round1(v);
    metaEl.innerHTML = `ล่าสุด: <b>${fmt(latest.val)} ${esc(meta.unit)}</b> (${esc(fmtDate(latest.date))}) · เฉลี่ย ${recent7.length} วันล่าสุด <b>${fmt(avg7)} ${esc(meta.unit)}</b>`;
  } else {
    metaEl.innerHTML = `<span class="text-slate-400">ยังไม่มีข้อมูล${esc(meta.label)}</span>`;
  }

  $('#bz-chart', root).innerHTML = metricChartSvg(state.body, meta.key);
}

function renderSleepStepsList(desc) {
  const listEl = $('#bz-list', root);
  if (!listEl) return;
  const rows = desc.filter(hasSleepOrSteps).slice(0, 20);
  if (!rows.length) {
    listEl.innerHTML = '<p class="text-xs text-slate-400 py-2">ยังไม่มีบันทึกการนอนหรือก้าวเดิน (กรอกเอง นำเข้า CSV หรือสแกนภาพจาก Zepp ได้เลย)</p>';
    return;
  }
  listEl.innerHTML = rows.map(r => {
    const sh = resolvedSleepHours(r);
    const durText = formatDurationTh(sh, r.sleepMinutes);
    const stageParts = [
      typeof r.deepSleepMin === 'number' ? `ลึก ${r.deepSleepMin}น.` : '',
      typeof r.lightSleepMin === 'number' ? `ตื้น ${r.lightSleepMin}น.` : '',
      typeof r.remSleepMin === 'number' ? `REM ${r.remSleepMin}น.` : ''
    ].filter(Boolean);
    const timeRange = r.bedTime || r.wakeTime ? `${r.bedTime || '?'}–${r.wakeTime || '?'}` : '';

    return `
      <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 flex items-start justify-between gap-2 text-xs">
        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="font-bold text-slate-800">${esc(fmtDate(r.date))}</span>
            <span class="chip bg-white border border-slate-200 text-slate-500 text-[10px]">${esc(sourceBadgeLabel(r.source))}</span>
          </div>
          <div class="flex flex-wrap gap-2 text-slate-700">
            ${durText ? `<span class="inline-flex items-center gap-1 font-medium text-indigo-700">😴 นอน ${esc(durText)}${timeRange ? ` <span class="text-slate-500 font-normal">(${esc(timeRange)})</span>` : ''}</span>` : ''}
            ${typeof r.steps === 'number' ? `<span class="inline-flex items-center gap-1 font-medium text-emerald-700">👣 ${r.steps.toLocaleString()} ก้าว${typeof r.distanceKm === 'number' ? ` · ${r.distanceKm} กม.` : ''}${typeof r.activeKcal === 'number' ? ` · ${r.activeKcal} kcal` : ''}</span>` : ''}
          </div>
          ${stageParts.length ? `<p class="text-[11px] text-slate-500">${esc(stageParts.join(' · '))}</p>` : ''}
          ${r.note ? `<p class="text-[11px] text-slate-500">${esc(r.note)}</p>` : ''}
        </div>
        <button type="button" data-ss-del="${esc(r.id)}" class="text-rose-400 hover:text-rose-600 p-1 shrink-0" aria-label="ลบ"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
  }).join('');
}

export function render() {
  if (!root) return;
  const desc = sortBodyDesc(state.body);
  const weightRows = desc.filter(hasBodyMeasurement);
  const cell = v => (typeof v === 'number' ? v : '-');
  $('#b-body', root).innerHTML = weightRows.length ? weightRows.map((r, idx) => {
    const prev = weightRows.slice(idx + 1).find(x => typeof x.weight === 'number');
    let delta = '';
    if (typeof r.weight === 'number' && prev) {
      const d = +(r.weight - prev.weight).toFixed(1);
      if (d) delta = ` <span class="text-xs ${d > 0 ? 'text-rose-500' : 'text-green-600'}">${d > 0 ? '+' : ''}${d}</span>`;
    }
    return `<tr class="hover:bg-sky-soft/30"><td class="p-3 font-medium">${esc(fmtDate(r.date))}${r.note ? `<div class="text-xs text-slate-400 font-normal">${esc(r.note)}</div>` : ''}</td>
      <td class="p-3 text-right">${cell(r.weight)}${delta}</td><td class="p-3 text-right text-slate-600">${cell(r.bust)}</td><td class="p-3 text-right text-slate-600">${cell(r.waist)}</td><td class="p-3 text-right text-slate-600">${cell(r.hip)}</td><td class="p-3 text-right text-slate-600">${cell(r.arm)}</td><td class="p-3 text-right text-slate-600">${cell(r.thigh)}</td>
      <td class="p-3 text-center"><button data-del="${esc(r.id)}" class="text-rose-400 hover:text-rose-600 p-1"><i class="fa-solid fa-trash-can text-xs"></i></button></td></tr>`;
  }).join('') : '<tr><td colspan="8" class="p-4 text-center text-slate-400 text-xs">ยังไม่มีข้อมูล</td></tr>';
  renderSleepStepsList(desc);
  renderChart();
  renderSleepStepsChart();
}

function buildSleepStepsPayload(item, fallbackSource = 'manual') {
  const out = {
    date: item.date,
    source: item.source || fallbackSource,
    updatedAt: new Date()
  };
  const numericFields = ['sleepHours', 'sleepMinutes', 'deepSleepMin', 'lightSleepMin', 'remSleepMin', 'steps', 'distanceKm', 'activeKcal'];
  for (const k of numericFields) {
    if (typeof item[k] === 'number' && Number.isFinite(item[k])) out[k] = item[k];
  }
  if (typeof out.sleepHours === 'number' && out.sleepMinutes == null) {
    out.sleepMinutes = Math.round(out.sleepHours * 60);
  } else if (typeof out.sleepMinutes === 'number' && out.sleepHours == null) {
    out.sleepHours = Math.round((out.sleepMinutes / 60) * 100) / 100;
  }
  if (typeof item.bedTime === 'string' && /^\d{1,2}:\d{2}$/.test(item.bedTime)) out.bedTime = item.bedTime.padStart(5, '0');
  if (typeof item.wakeTime === 'string' && /^\d{1,2}:\d{2}$/.test(item.wakeTime)) out.wakeTime = item.wakeTime.padStart(5, '0');
  if (typeof item.note === 'string' && item.note.trim()) out.note = item.note.trim().slice(0, 200);
  return out;
}

function openZeppImportPreviewModal(records, defaultSource = 'zepp_csv') {
  if (!records.length) {
    toast('ไม่พบข้อมูลการนอนหรือก้าวเดินที่นำเข้าได้', 'err');
    return;
  }
  const items = records.map(r => ({
    checked: true,
    date: isDateStr(r.date) ? r.date : localDateStr(),
    sleepHours: resolvedSleepHours(r),
    sleepMinutes: r.sleepMinutes ?? null,
    deepSleepMin: r.deepSleepMin ?? null,
    lightSleepMin: r.lightSleepMin ?? null,
    remSleepMin: r.remSleepMin ?? null,
    bedTime: r.bedTime || null,
    wakeTime: r.wakeTime || null,
    steps: typeof r.steps === 'number' ? Math.round(r.steps) : null,
    distanceKm: typeof r.distanceKm === 'number' ? r.distanceKm : null,
    activeKcal: typeof r.activeKcal === 'number' ? Math.round(r.activeKcal) : null,
    note: r.note || '',
    source: r.source || defaultSource
  }));

  const box = openModal(`
    <div class="flex justify-between items-center mb-2">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-file-import text-indigo-500"></i> ตรวจสอบข้อมูลก่อนนำเข้า (${items.length} วัน)</h3>
      <button type="button" data-close class="icon-btn !w-9 !h-9 text-slate-400"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <p class="text-xs text-slate-500 mb-3">ติ๊กเลือกวันและตรวจดูตัวเลข (ถ้ามีข้อมูล Zepp ของวันนั้นอยู่แล้ว ระบบจะรวม/อัปเดตให้อัตโนมัติ)</p>
    <div class="space-y-2 max-h-72 overflow-y-auto pr-0.5">
      ${items.map((it, idx) => `
        <label class="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs cursor-pointer">
          <input type="checkbox" data-zp-chk="${idx}" class="mt-0.5" checked>
          <div class="flex-1 min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <input type="date" data-zp-date="${idx}" value="${esc(it.date)}" class="input !py-1 !px-2 text-xs w-auto">
              <span class="chip bg-white border border-slate-200 text-[10px] text-slate-500">${esc(sourceBadgeLabel(it.source))}</span>
            </div>
            <div class="flex flex-wrap gap-3 text-slate-700">
              ${it.sleepHours != null ? `<span>😴 นอน <b>${it.sleepHours}</b> ชม.${it.bedTime || it.wakeTime ? ` (${esc(it.bedTime || '?')}–${esc(it.wakeTime || '?')})` : ''}</span>` : ''}
              ${it.steps != null ? `<span>👣 <b>${it.steps.toLocaleString()}</b> ก้าว${it.distanceKm != null ? ` · ${it.distanceKm} กม.` : ''}</span>` : ''}
              ${it.activeKcal != null ? `<span>🔥 ${it.activeKcal} kcal</span>` : ''}
            </div>
            ${it.note ? `<p class="text-[11px] text-slate-500">${esc(it.note)}</p>` : ''}
          </div>
        </label>
      `).join('')}
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <button type="button" data-close class="btn btn-ghost text-xs">ยกเลิก</button>
      <button type="button" id="zp-confirm" class="btn btn-primary text-xs">ยืนยันนำเข้า (${items.length})</button>
    </div>
  `);

  const updateCount = () => {
    const count = items.filter(x => x.checked).length;
    const btn = $('#zp-confirm', box);
    if (btn) {
      btn.textContent = `ยืนยันนำเข้า (${count})`;
      btn.disabled = count === 0;
    }
  };

  box.querySelectorAll('[data-zp-chk]').forEach(chk => {
    chk.addEventListener('change', () => {
      items[Number(chk.dataset.zpChk)].checked = chk.checked;
      updateCount();
    });
  });
  box.querySelectorAll('[data-zp-date]').forEach(inp => {
    inp.addEventListener('change', () => {
      if (isDateStr(inp.value)) items[Number(inp.dataset.zpDate)].date = inp.value;
    });
  });

  $('#zp-confirm', box).addEventListener('click', async () => {
    const picked = items.filter(x => x.checked && isDateStr(x.date));
    if (!picked.length || !state.uid) return;
    const confirmBtn = $('#zp-confirm', box);
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'กำลังบันทึก…';
    try {
      for (let i = 0; i < picked.length; i += 400) {
        const batch = writeBatch(db);
        for (const item of picked.slice(i, i + 400)) {
          const docId = 'zepp_' + item.date;
          const existing = state.body.find(b => b.id === docId);
          const payload = buildSleepStepsPayload(item, defaultSource);
          if (!existing) payload.createdAt = new Date();
          batch.set(userDoc(state.uid, 'body_records', docId), payload, { merge: true });
        }
        await batch.commit();
      }
      box.querySelector('[data-close]')?.click();
      toast(`นำเข้าข้อมูลนอน & ก้าวเดิน ${picked.length} วันแล้ว`);
    } catch (err) {
      toast('นำเข้าไม่สำเร็จ: ' + err.message, 'err');
      confirmBtn.disabled = false;
      updateCount();
    }
  });
}

async function handleCsvImport(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  try {
    const parsedLists = [];
    let skipped = 0;
    for (const f of files) {
      const text = await f.text();
      const parsed = parseZeppCsv(text, f.name);
      parsedLists.push(parsed.records);
      skipped += parsed.skipped || 0;
    }
    const merged = mergeZeppDayRecords(parsedLists);
    if (!merged.length) {
      return toast('ไม่พบคอลัมน์วันที่/การนอน/ก้าวเดินในไฟล์ CSV นี้', 'err');
    }
    if (skipped > 0) {
      toast(`อ่านได้ ${merged.length} วัน (ข้ามแถวว่าง ${skipped} แถว)`);
    }
    openZeppImportPreviewModal(merged, 'zepp_csv');
  } catch (err) {
    toast('อ่านไฟล์ CSV ไม่สำเร็จ: ' + err.message, 'err');
  }
}

async function handleScreenshotScan(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  const statusEl = $('#bz-status', root);
  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.textContent = `กำลังอ่านภาพจาก Zepp (0/${files.length})…`;
  }
  try {
    const { results, errors } = await runImageBatch(
      files,
      file => readZeppScreenshot(file),
      prog => {
        if (statusEl) statusEl.textContent = formatImageProgress('อ่านภาพจาก Zepp', prog);
      }
    );
    if (statusEl) {
      statusEl.textContent = errors.length
        ? `อ่านสำเร็จ ${results.length}/${files.length} ภาพ · ไม่สำเร็จ ${errors.length} (${explainGeminiError(errors[0].error || errors[0])})`
        : '';
      if (!errors.length) statusEl.classList.add('hidden');
    }
    const today = localDateStr();
    const valid = results
      .map(res => {
        const d = res?.result || res || {};
        return {
          date: isDateStr(d.date) ? d.date : today,
          sleepHours: typeof d.sleepHours === 'number' ? round1(d.sleepHours) : null,
          sleepMinutes: typeof d.sleepMinutes === 'number' ? Math.round(d.sleepMinutes) : null,
          deepSleepMin: typeof d.deepSleepMin === 'number' ? Math.round(d.deepSleepMin) : null,
          lightSleepMin: typeof d.lightSleepMin === 'number' ? Math.round(d.lightSleepMin) : null,
          remSleepMin: typeof d.remSleepMin === 'number' ? Math.round(d.remSleepMin) : null,
          bedTime: typeof d.bedTime === 'string' ? d.bedTime : null,
          wakeTime: typeof d.wakeTime === 'string' ? d.wakeTime : null,
          steps: typeof d.steps === 'number' ? Math.round(d.steps) : null,
          distanceKm: typeof d.distanceKm === 'number' ? Math.round(d.distanceKm * 100) / 100 : null,
          activeKcal: typeof d.activeKcal === 'number' ? Math.round(d.activeKcal) : null,
          note: d.note || '',
          source: 'zepp_ai'
        };
      })
      .filter(x => x.sleepHours != null || x.sleepMinutes != null || x.steps != null);

    if (!valid.length) {
      return toast(errors[0] ? explainGeminiError(errors[0].error || errors[0]) : 'ไม่พบตัวเลขการนอนหรือก้าวเดินในภาพ', 'err');
    }
    openZeppImportPreviewModal(mergeZeppDayRecords([valid]), 'zepp_ai');
  } catch (err) {
    if (statusEl) statusEl.classList.add('hidden');
    toast(explainGeminiError(err), 'err');
  }
}

function saveSleepSteps() {
  const date = $('#bz-date', root).value;
  const sleepHours = numField(root, 'bz-sleep');
  const steps = numField(root, 'bz-steps');
  const bedTime = ($('#bz-bed', root).value || '').trim();
  const wakeTime = ($('#bz-wake', root).value || '').trim();
  const note = ($('#bz-note', root).value || '').trim();

  if (!date) return toast('กรุณาเลือกวันที่', 'err');
  if (sleepHours === null && steps === null) return toast('กรุณากรอกชั่วโมงนอน หรือจำนวนก้าวอย่างน้อย 1 อย่าง', 'err');
  if (sleepHours !== null && (sleepHours <= 0 || sleepHours > 24)) return toast('ชั่วโมงนอนต้องอยู่ระหว่าง 0.1–24 ชม.', 'err');
  if (steps !== null && (steps < 0 || steps > 200000)) return toast('จำนวนก้าวไม่สมเหตุสมผล', 'err');

  const docId = 'zepp_' + date;
  const existing = state.body.find(b => b.id === docId);
  const payload = buildSleepStepsPayload({
    date,
    sleepHours,
    steps: steps !== null ? Math.round(steps) : null,
    bedTime: bedTime || null,
    wakeTime: wakeTime || null,
    note,
    source: existing?.source || 'manual'
  }, 'manual');
  if (!existing) payload.createdAt = new Date();

  setDoc(userDoc(state.uid, 'body_records', docId), payload, { merge: true })
    .catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));

  ['bz-sleep', 'bz-steps', 'bz-bed', 'bz-wake', 'bz-note'].forEach(id => { $('#' + id, root).value = ''; });
  $('#bz-date', root).value = localDateStr();
  toast('บันทึกการนอน & ก้าวเดินแล้ว');
}

function save() {
  const date = $('#b-date', root).value;
  const rec = { weight: numField(root, 'b-weight'), bust: numField(root, 'b-bust'), waist: numField(root, 'b-waist'), hip: numField(root, 'b-hip'), arm: numField(root, 'b-arm'), thigh: numField(root, 'b-thigh') };
  if (!date) return toast('กรุณาเลือกวันที่', 'err');
  if (Object.values(rec).every(v => v === null)) return toast('กรุณากรอกอย่างน้อย 1 ค่า', 'err');
  for (const [k, v] of Object.entries(rec)) if (v !== null && (v <= 0 || v > 400)) return toast('ค่าไม่สมเหตุสมผล: ' + k, 'err');
  addDoc(userCol(state.uid, 'body_records'), { date, ...rec, note: $('#b-note', root).value.trim(), createdAt: new Date() }).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  ['b-weight', 'b-bust', 'b-waist', 'b-hip', 'b-arm', 'b-thigh', 'b-note'].forEach(id => { $('#' + id, root).value = ''; });
  $('#b-date', root).value = localDateStr();
  toast('บันทึกน้ำหนัก/สัดส่วนแล้ว');
}
