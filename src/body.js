import { addDoc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, isDateStr, localDateStr, parseLocal, numField, openModal, round1, toast } from './util.js';
import { parseZeppCsv, mergeZeppDayRecords } from './zeppParser.js';
import { iconSvg } from './icons.js';
import { guardPreviewWrite } from './preview.js';
import { bindChartInspector, bindSwipeRows } from './ui.js';

const CHART_METRICS = [
  { key: 'weight', label: 'น้ำหนัก', unit: 'กก.', color: '#1F4A74' },
  { key: 'waist', label: 'รอบเอว', unit: 'ซม.', color: '#4A7FAE' },
  { key: 'hip', label: 'สะโพก', unit: 'ซม.', color: '#C95B72' },
  { key: 'arm', label: 'รอบแขน', unit: 'ซม.', color: '#217A68' },
  { key: 'thigh', label: 'รอบขา', unit: 'ซม.', color: '#C58F1E' },
  { key: 'bust', label: 'รอบอก', unit: 'ซม.', color: '#647F9C' }
];

const SLEEP_STEPS_METRICS = [
  { key: 'sleepHours', label: 'การนอน (ชม.)', unit: 'ชม.', color: '#1F4A74', decimals: 1 },
  { key: 'steps', label: 'ก้าวเดิน', unit: 'ก้าว', color: '#217A68', decimals: 0 }
];

const BODY_MEASUREMENT_KEYS = ['weight', 'bust', 'waist', 'hip', 'arm', 'thigh'];

let root;
let activeBodyTab = 'body';
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

function setBodyTab(tab) {
  if (!root) return;
  activeBodyTab = tab === 'sleep' ? 'sleep' : 'body';
  root.querySelectorAll('[data-body-tab]').forEach(btn => {
    const on = btn.dataset.bodyTab === activeBodyTab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#b-panel-body', root)?.classList.toggle('hidden', activeBodyTab !== 'body');
  $('#b-panel-sleep', root)?.classList.toggle('hidden', activeBodyTab !== 'sleep');
}

export function mountBody(el) {
  root = el;
  activeBodyTab = 'body';
  root.innerHTML = `
  <div class="md:col-span-2 space-y-3">
    <div id="b-snapshot" class="grid grid-cols-3 gap-2.5"></div>
    <div class="tm-seg tm-seg--2" role="tablist" aria-label="หมวดบันทึกข้อมูลร่างกาย">
      <button type="button" role="tab" data-body-tab="body" aria-selected="true" class="tm-seg-btn is-active">น้ำหนัก & สัดส่วน</button>
      <button type="button" role="tab" data-body-tab="sleep" aria-selected="false" class="tm-seg-btn">นอน & ก้าวเดิน (Zepp)</button>
    </div>
  </div>
  <div id="b-panel-body" class="md:col-span-2 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] gap-4 md:gap-6 lg:gap-8">
    <div class="space-y-6">
      <div class="card space-y-4">
        <h2 class="text-lg font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('body', { size: 19, className: 'text-brand' })}<span>บันทึกน้ำหนัก & สัดส่วน</span></h2>
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
        <p class="text-xs text-slate-500">กรอกเฉพาะค่าที่วัดได้ในวันนั้น เช่น ชั่งน้ำหนักอย่างเดียวก็ได้</p>
        <div class="flex justify-end"><button id="b-save" class="btn btn-sky">${iconSvg('plus', { size: 15 })} บันทึก</button></div>
      </div>

      <div class="card space-y-3">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('list', { size: 17, className: 'text-brand' })}<span>ประวัติน้ำหนัก & สัดส่วน</span></h3>
        <div id="b-history-wrap">
          <div id="b-mobile-list" class="lg:hidden tm-swipe-list tm-swipe-list--cards tabular-nums"></div>
          <div class="hidden lg:block overflow-x-auto"><table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-slate-600"><tr><th class="p-3">วันที่</th><th class="p-3 text-right">น้ำหนัก</th><th class="p-3 text-right">อก</th><th class="p-3 text-right">เอว</th><th class="p-3 text-right">สะโพก</th><th class="p-3 text-right">แขน</th><th class="p-3 text-right">ขา</th><th class="p-3 text-center">ลบ</th></tr></thead>
            <tbody id="b-body" class="divide-y divide-slate-100 tabular-nums"></tbody></table></div>
        </div>
      </div>
    </div>
    <div class="space-y-6">
      <div class="card space-y-3">
        <h3 id="b-chart-title" class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('health', { size: 17, className: 'text-brand' })}<span>แนวโน้มน้ำหนัก & สัดส่วน</span></h3>
        <div id="b-chart-tabs" class="tm-seg tm-seg--scroll" role="tablist" aria-label="เลือกสัดส่วน"></div>
        <div id="b-chart-meta" class="text-xs text-slate-600 tabular-nums"></div>
        <div id="b-chart"></div>
      </div>
    </div>
  </div>
  <div id="b-panel-sleep" class="hidden md:col-span-2 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] gap-4 md:gap-6 lg:gap-8">
    <div class="space-y-6">
      <div class="card space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="text-lg font-bold text-slate-800 inline-flex items-center gap-2 flex-wrap">${iconSvg('sleep', { size: 19, className: 'text-brand' })}<span>การนอน & ก้าวเดิน</span> <span class="text-xs font-medium text-blue-700">(รองรับ Zepp CSV)</span></h2>
            <p class="text-xs text-slate-500 mt-0.5">นำเข้าไฟล์ CSV จาก Zepp ได้หลายไฟล์พร้อมกัน (ระบบรวมวันเดียวกันให้อัตโนมัติ) หรือกดปุ่มบันทึกเอง</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="btn btn-soft text-xs cursor-pointer">
            ${iconSvg('csv', { size: 15, className: 'text-emerald-600' })} นำเข้า Zepp CSV (ฟรี · ไม่ใช้ AI)
            <input type="file" id="bz-csv" accept=".csv,text/csv" multiple class="hidden">
          </label>
          <button type="button" id="bz-open-manual" class="btn btn-primary text-xs">
            ${iconSvg('plus', { size: 15 })} กรอกเอง (นอน / ก้าวเดิน)
          </button>
        </div>
        <p class="text-[11px] text-slate-500 leading-relaxed">รองรับ Zepp CSV 3 แบบ: ระยะการนอนรายนาที (stage/hr/respiratory_rate), สรุปการนอน (SLEEP) และกิจกรรม (ACTIVITY)</p>

        <div class="border-t border-slate-100 pt-3 space-y-2">
          <h3 class="text-sm font-bold text-slate-700">ประวัติการนอน & ก้าวเดินล่าสุด</h3>
          <div id="bz-list" class="tm-swipe-list tm-swipe-list--cards"></div>
        </div>
      </div>
    </div>
    <div class="space-y-6">
      <div class="card space-y-3">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('moon', { size: 17, className: 'text-brand' })}<span>แนวโน้มการนอน & ก้าวเดิน</span></h3>
        <div id="bz-chart-tabs" class="tm-seg tm-seg--2" role="tablist" aria-label="เลือกกราฟการนอนและก้าวเดิน"></div>
        <div id="bz-chart-meta" class="text-xs text-slate-600 tabular-nums"></div>
        <div id="bz-chart"></div>
      </div>
    </div>
  </div>`;

  $('#b-date', root).value = localDateStr();
  root.addEventListener('click', e => {
    const tabBtn = e.target.closest('[data-body-tab]');
    if (tabBtn) setBodyTab(tabBtn.dataset.bodyTab);
  });
  window.addEventListener('trackme:focus', e => {
    if (!root?.isConnected || e.detail?.tab !== 'body') return;
    const fid = String(e.detail?.focusId || '');
    setBodyTab(fid.startsWith('bz-') ? 'sleep' : 'body');
    if (fid.startsWith('bz-') && fid !== 'bz-csv') {
      requestAnimationFrame(() => $('#bz-open-manual', root)?.focus?.());
    }
  });
  $('#b-save', root).addEventListener('click', save);
  $('#bz-open-manual', root).addEventListener('click', () => openSleepStepsModal());
  $('#bz-csv', root).addEventListener('change', handleCsvImport);

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
  $('#b-history-wrap', root).addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    if (guardPreviewWrite('การลบข้อมูลสัดส่วน')) return;
    if (confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) deleteDoc(userDoc(state.uid, 'body_records', b.dataset.del)).catch(err => toast(err.message, 'err'));
  });
  $('#bz-list', root).addEventListener('click', e => {
    const editBtn = e.target.closest('[data-ss-edit]');
    if (editBtn) {
      const rec = (state.body || []).find(x => x.id === editBtn.dataset.ssEdit);
      openSleepStepsModal(rec || null);
      return;
    }
    const b = e.target.closest('[data-ss-del]');
    if (!b) return;
    if (guardPreviewWrite('การลบข้อมูลการนอน/ก้าวเดิน')) return;
    if (confirm('ต้องการลบข้อมูลการนอน/ก้าวเดินวันนี้ใช่หรือไม่?')) deleteDoc(userDoc(state.uid, 'body_records', b.dataset.ssDel)).catch(err => toast(err.message, 'err'));
  });
  setBodyTab('body');
  render();
}

export function resetBodyToToday() {
  if (!root) return;
  const today = localDateStr();
  const dateEl = $('#b-date', root);
  if (dateEl) dateEl.value = today;
  const modalDateEl = document.getElementById('bz-date');
  if (modalDateEl) modalDateEl.value = today;
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
  if (pts.length < 2) return `<p class="text-xs text-slate-500">บันทึก${esc(meta.label)}อย่างน้อย 2 ครั้งเพื่อดูกราฟ</p>`;
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
  const dots = pts.map((p, i) => {
    const cx = x(ts[i]).toFixed(1);
    const cy = y(p.val).toFixed(1);
    const valStr = `${fmtVal(p.val)} ${meta.unit}`;
    return `<g>
      <circle cx="${cx}" cy="${cy}" r="3.4" fill="${meta.color}"></circle>
      <circle cx="${cx}" cy="${cy}" r="11" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(fmtDate(p.date))}: ${esc(valStr)}" data-chart-sub="${esc(meta.label)}" data-chart-color="${meta.color}" aria-label="${esc(fmtDate(p.date))} ${esc(valStr)}"><title>${esc(fmtDate(p.date))}: ${esc(valStr)}</title></circle>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="กราฟแนวโน้ม${esc(meta.label)}"><polyline points="${line}" fill="none" stroke="${meta.color}" stroke-width="2.2"/>${dots}
    <text x="4" y="${y(max) + 4}" font-size="9.5" fill="#4A6685">${esc(fmtVal(max))}</text><text x="4" y="${y(min) + 4}" font-size="9.5" fill="#4A6685">${esc(fmtVal(min))}</text>
    <text x="${P}" y="${H - 6}" font-size="10" fill="#4A6685">${esc(fmtDate(pts[0].date))}</text>
    <text x="${W - P}" y="${H - 6}" font-size="10" fill="#4A6685" text-anchor="end">${esc(fmtDate(pts[pts.length - 1].date))}</text></svg>`;
}

export function weightChartSvg(items) {
  return metricChartSvg(items, 'weight');
}

export function sleepCandlestickSvg(items) {
  const pts = (items || [])
    .map(r => {
      const h = resolvedSleepHours(r);
      return h !== null && r.date ? { ...r, hours: h } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);
  if (!pts.length) return '<p class="text-xs text-slate-500">บันทึกการนอนอย่างน้อย 1 ครั้งเพื่อดูกราฟแท่งเทียน</p>';

  const W = 340, H = 185, PL = 34, PR = 12, PT = 16, PB = 28;
  const maxHours = Math.max(9.5, ...pts.map(p => p.hours)) + 0.5;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const colW = plotW / Math.max(1, pts.length);
  const candleW = Math.max(7, Math.min(18, colW * 0.56));
  const xCenter = i => PL + (i + 0.5) * colW;
  const yOf = h => PT + plotH - (Math.max(0, h) / maxHours) * plotH;
  const targetY = yOf(7);

  const candles = pts.map((r, i) => {
    const cx = xCenter(i);
    const xLeft = cx - candleW / 2;
    const totalMin = typeof r.sleepMinutes === 'number' && r.sleepMinutes > 0 ? r.sleepMinutes : Math.round(r.hours * 60);
    const deep = Math.max(0, Number(r.deepSleepMin) || 0);
    const rem = Math.max(0, Number(r.remSleepMin) || 0);
    const light = Math.max(0, Number(r.lightSleepMin) || 0);
    const stageSum = deep + rem + light;
    const hasStages = stageSum > 0;
    const yTop = yOf(r.hours);
    const yBottom = yOf(0);

    let bodyHtml = `<line x1="${cx.toFixed(1)}" y1="${Math.max(PT, yTop - 3).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yBottom.toFixed(1)}" stroke="#647F9C" stroke-width="1.3"/>
      <line x1="${(cx - 3).toFixed(1)}" y1="${Math.max(PT, yTop - 3).toFixed(1)}" x2="${(cx + 3).toFixed(1)}" y2="${Math.max(PT, yTop - 3).toFixed(1)}" stroke="#647F9C" stroke-width="1.2"/>`;

    if (hasStages) {
      const denom = Math.max(totalMin, stageSum, 1);
      const bodyH = Math.max(4, yBottom - yTop);
      const segs = [
        { min: deep, color: '#194971' },
        { min: rem, color: '#C95B72' },
        { min: light, color: '#A8D0EF' },
        { min: Math.max(0, totalMin - stageSum), color: '#D0DBF7' }
      ].filter(s => s.min > 0);
      let cursorY = yBottom;
      segs.forEach(seg => {
        const sh = (seg.min / denom) * bodyH;
        const sy = cursorY - sh;
        bodyHtml += `<rect x="${xLeft.toFixed(1)}" y="${sy.toFixed(1)}" width="${candleW.toFixed(1)}" height="${Math.max(1.5, sh).toFixed(1)}" rx="1.5" fill="${seg.color}"/>`;
        cursorY = sy;
      });
    } else {
      const fill = r.hours >= 7 ? '#217A68' : '#C58F1E';
      bodyHtml += `<rect x="${xLeft.toFixed(1)}" y="${yTop.toFixed(1)}" width="${candleW.toFixed(1)}" height="${Math.max(4, yBottom - yTop).toFixed(1)}" rx="3" fill="${fill}" opacity="0.9"/>`;
    }

    const durLabel = formatDurationTh(r.hours, r.sleepMinutes) || `${round1(r.hours)} ชม.`;
    const stageSub = hasStages
      ? `ลึก ${Math.round(deep)}น. · ตื้น ${Math.round(light)}น.${rem ? ` · REM ${Math.round(rem)}น.` : ''}`
      : (r.bedTime || r.wakeTime ? `${r.bedTime || '?'}–${r.wakeTime || '?'}` : sourceBadgeLabel(r.source));
    const tipColor = hasStages ? '#1F4A74' : (r.hours >= 7 ? '#217A68' : '#C58F1E');
    const showX = pts.length <= 7 || i === 0 || i === pts.length - 1 || i % Math.ceil(pts.length / 5) === 0;
    const xLabel = showX ? `<text x="${cx.toFixed(1)}" y="${H - 7}" font-size="9" text-anchor="middle" fill="#4A6685">${esc(r.date.slice(8))}/${esc(r.date.slice(5, 7))}</text>` : '';

    return `<g>
      ${bodyHtml}
      ${xLabel}
      <rect x="${(PL + i * colW).toFixed(1)}" y="${PT}" width="${colW.toFixed(1)}" height="${plotH}" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(fmtDate(r.date))}: นอน ${esc(durLabel)}" data-chart-sub="${esc(stageSub)}" data-chart-color="${tipColor}" aria-label="${esc(fmtDate(r.date))} นอน ${esc(durLabel)}"><title>${esc(fmtDate(r.date))}: นอน ${esc(durLabel)} (${esc(stageSub)})</title></rect>
    </g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="กราฟแท่งเทียนการนอนและระยะหลับลึกตื้น">
      <line x1="${PL}" x2="${W - PR}" y1="${targetY.toFixed(1)}" y2="${targetY.toFixed(1)}" stroke="#4A7FAE" stroke-dasharray="4 3" stroke-width="1.1" opacity="0.75"/>
      <text x="${W - PR}" y="${Math.max(11, targetY - 3).toFixed(1)}" font-size="8.5" text-anchor="end" fill="#194971">เป้า 7 ชม.</text>
      <text x="4" y="${PT + 6}" font-size="9" fill="#4A6685">${Math.round(maxHours)}ชม.</text>
      <text x="4" y="${yOf(0) + 3}" font-size="9" fill="#4A6685">0</text>
      ${candles}
    </svg>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 mt-1">
      <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-[#194971]"></span>หลับลึก</span>
      <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-[#C95B72]"></span>REM</span>
      <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-[#A8D0EF]"></span>หลับตื้น</span>
      <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-[#217A68]"></span>ไม่มีข้อมูลระยะ (≥7ชม.)</span>
    </div>`;
}

export function stepsCandlestickSvg(items) {
  const pts = (items || [])
    .filter(r => typeof r.steps === 'number' && r.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);
  if (!pts.length) return '<p class="text-xs text-slate-500">บันทึกก้าวเดินอย่างน้อย 1 ครั้งเพื่อดูกราฟแท่งเทียน</p>';

  const W = 340, H = 185, PL = 38, PR = 12, PT = 16, PB = 28;
  const maxSteps = Math.max(9000, ...pts.map(p => p.steps)) * 1.08;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const colW = plotW / Math.max(1, pts.length);
  const candleW = Math.max(7, Math.min(18, colW * 0.56));
  const xCenter = i => PL + (i + 0.5) * colW;
  const yOf = s => PT + plotH - (Math.max(0, s) / maxSteps) * plotH;
  const targetY = yOf(8000);

  const candles = pts.map((r, i) => {
    const cx = xCenter(i);
    const prev = i > 0 ? pts[i - 1].steps : Math.round(r.steps * 0.88);
    const open = prev;
    const close = r.steps;
    const bull = close >= open;
    const color = bull ? '#217A68' : '#C95B72';
    const topV = Math.max(open, close);
    const botV = Math.min(open, close);
    const wickLow = Math.max(0, Math.round(botV * 0.8));
    const yHigh = yOf(topV);
    const yLow = yOf(wickLow);
    const yBodyTop = yOf(topV);
    const bodyH = Math.max(5, yOf(botV) - yBodyTop);

    const diff = i > 0 ? close - prev : null;
    const diffStr = diff === null
      ? 'วันแรกของช่วง'
      : `${diff >= 0 ? '+' : ''}${diff.toLocaleString()} ก้าวเทียบวันก่อน`;
    const sub = `${diffStr}${typeof r.distanceKm === 'number' ? ` · ${r.distanceKm} กม.` : ''}`;
    const showX = pts.length <= 7 || i === 0 || i === pts.length - 1 || i % Math.ceil(pts.length / 5) === 0;
    const xLabel = showX ? `<text x="${cx.toFixed(1)}" y="${H - 7}" font-size="9" text-anchor="middle" fill="#4A6685">${esc(r.date.slice(8))}/${esc(r.date.slice(5, 7))}</text>` : '';

    return `<g>
      <line x1="${cx.toFixed(1)}" y1="${yHigh.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yLow.toFixed(1)}" stroke="${color}" stroke-width="1.5"/>
      <rect x="${(cx - candleW / 2).toFixed(1)}" y="${yBodyTop.toFixed(1)}" width="${candleW.toFixed(1)}" height="${bodyH.toFixed(1)}" rx="2.5" fill="${color}" opacity="0.9"/>
      ${xLabel}
      <rect x="${(PL + i * colW).toFixed(1)}" y="${PT}" width="${colW.toFixed(1)}" height="${plotH}" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(fmtDate(r.date))}: ${r.steps.toLocaleString()} ก้าว" data-chart-sub="${esc(sub)}" data-chart-color="${color}" aria-label="${esc(fmtDate(r.date))} ${r.steps.toLocaleString()} ก้าว"><title>${esc(fmtDate(r.date))}: ${r.steps.toLocaleString()} ก้าว (${esc(sub)})</title></rect>
    </g>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="กราฟแท่งเทียนก้าวเดินรายวัน">
      <line x1="${PL}" x2="${W - PR}" y1="${targetY.toFixed(1)}" y2="${targetY.toFixed(1)}" stroke="#217A68" stroke-dasharray="4 3" stroke-width="1.1" opacity="0.7"/>
      <text x="${W - PR}" y="${Math.max(11, targetY - 3).toFixed(1)}" font-size="8.5" text-anchor="end" fill="#145245">เป้า 8,000 ก้าว</text>
      <text x="4" y="${PT + 6}" font-size="9" fill="#4A6685">${Math.round(maxSteps / 1000)}k</text>
      <text x="4" y="${yOf(0) + 3}" font-size="9" fill="#4A6685">0</text>
      ${candles}
    </svg>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 mt-1">
      <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-[#217A68]"></span>เพิ่ม / คงที่จากวันก่อน</span>
      <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-[#C95B72]"></span>ลดลงจากวันก่อน</span>
    </div>`;
}

function renderChart() {
  if (!root) return;
  const meta = CHART_METRICS.find(m => m.key === activeMetric) || CHART_METRICS[0];
  $('#b-chart-tabs', root).innerHTML = CHART_METRICS.map(m => {
    const on_ = m.key === meta.key;
    return `<button type="button" role="tab" aria-selected="${on_}" data-metric="${m.key}" class="tm-seg-btn ${on_ ? 'is-active' : ''}">${esc(m.label)}</button>`;
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

  const chartEl = $('#b-chart', root);
  chartEl.innerHTML = metricChartSvg(state.body, meta.key);
  bindChartInspector(chartEl, { hint: 'แตะจุดบนกราฟเพื่อดูค่าแต่ละวัน' });
}

function renderSleepStepsChart() {
  if (!root) return;
  const meta = SLEEP_STEPS_METRICS.find(m => m.key === activeSleepStepsMetric) || SLEEP_STEPS_METRICS[0];
  $('#bz-chart-tabs', root).innerHTML = SLEEP_STEPS_METRICS.map(m => {
    const on_ = m.key === meta.key;
    return `<button type="button" role="tab" aria-selected="${on_}" data-ss-metric="${m.key}" class="tm-seg-btn ${on_ ? 'is-active' : ''}">${esc(m.label)}</button>`;
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

  const chartEl = $('#bz-chart', root);
  chartEl.innerHTML = meta.key === 'steps' ? stepsCandlestickSvg(state.body) : sleepCandlestickSvg(state.body);
  bindChartInspector(chartEl, { hint: 'แตะแท่งเทียนเพื่อดูรายละเอียดแต่ละวัน' });
}

function renderSleepStepsList(desc) {
  const listEl = $('#bz-list', root);
  if (!listEl) return;
  const rows = desc.filter(hasSleepOrSteps).slice(0, 20);
  if (!rows.length) {
    listEl.innerHTML = '<p class="text-xs text-slate-400 py-2">ยังไม่มีบันทึกการนอนหรือก้าวเดิน (นำเข้า Zepp CSV หรือกด "กรอกเอง" ได้เลย)</p>';
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
      <div class="tm-swipe-row is-soft tabular-nums">
        <div class="tm-swipe-actions">
          <button type="button" data-ss-edit="${esc(r.id)}" class="tm-swipe-action-btn is-edit" aria-label="แก้ไข ${esc(fmtDate(r.date))}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
          <button type="button" data-ss-del="${esc(r.id)}" class="tm-swipe-action-btn is-del" aria-label="ลบ ${esc(fmtDate(r.date))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
        </div>
        <div class="tm-swipe-card tm-swipe-card--stack !p-2.5">
          <div class="flex items-start justify-between gap-2 text-xs">
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="font-bold text-slate-800">${esc(fmtDate(r.date))}</span>
                <span class="text-[11px] text-slate-500">· ${esc(sourceBadgeLabel(r.source))}</span>
              </div>
              <div class="flex flex-wrap gap-2 text-slate-700">
                ${durText ? `<span class="inline-flex items-center gap-1 font-medium text-blue-700">นอน ${esc(durText)}${timeRange ? ` <span class="text-slate-500 font-normal">(${esc(timeRange)})</span>` : ''}</span>` : ''}
                ${typeof r.steps === 'number' ? `<span class="inline-flex items-center gap-1 font-medium text-primary-700">${r.steps.toLocaleString()} ก้าว${typeof r.distanceKm === 'number' ? ` · ${r.distanceKm} กม.` : ''}${typeof r.activeKcal === 'number' ? ` · ${r.activeKcal} kcal` : ''}</span>` : ''}
              </div>
              ${stageParts.length ? `<p class="text-[11px] text-slate-500">${esc(stageParts.join(' · '))}</p>` : ''}
              ${r.note ? `<p class="text-[11px] text-slate-500">${esc(r.note)}</p>` : ''}
            </div>
            <div class="tm-row-actions">
              <button type="button" data-ss-edit="${esc(r.id)}" class="tm-row-action-btn" aria-label="แก้ไข ${esc(fmtDate(r.date))}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
              <button type="button" data-ss-del="${esc(r.id)}" class="tm-row-action-btn is-del" aria-label="ลบ ${esc(fmtDate(r.date))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  bindSwipeRows(listEl);
}

export function render() {
  if (!root) return;
  const snap = $('#b-snapshot', root);
  if (snap) {
    const latest = bodyLatest(state.body || []);
    const snapTile = (label, val, sub, iconName, colorCls) => `
      <div class="card !p-3 space-y-1 tabular-nums">
        <div class="flex items-center justify-between gap-1 text-[11px] text-slate-500"><span class="truncate">${esc(label)}</span><span class="${colorCls}">${iconSvg(iconName, { size: 14 })}</span></div>
        <p class="text-sm sm:text-base font-bold text-slate-800 truncate">${esc(val)}</p>
        <p class="text-[10px] text-slate-500 truncate">${esc(sub)}</p>
      </div>`;
    snap.innerHTML =
      snapTile('น้ำหนักล่าสุด', latest.weight ? `${latest.weight.v} กก.` : 'ยังไม่บันทึก', latest.weight ? fmtDate(latest.weight.d) : 'ชั่งและจดได้เลย', 'body', 'text-brand') +
      snapTile('การนอนล่าสุด', latest.sleepHours ? `${round1(latest.sleepHours.v)} ชม.` : 'ยังไม่บันทึก', latest.sleepHours ? fmtDate(latest.sleepHours.d) : 'นำเข้า CSV หรือกรอกเอง', 'sleep', 'text-brand') +
      snapTile('ก้าวเดินล่าสุด', latest.steps ? `${Math.round(latest.steps.v).toLocaleString()} ก้าว` : 'ยังไม่บันทึก', latest.steps ? fmtDate(latest.steps.d) : 'ติดตามการเดินรายวัน', 'steps', 'text-emerald-600');
  }
  const desc = sortBodyDesc(state.body);
  const weightRows = desc.filter(hasBodyMeasurement);
  const cell = v => (typeof v === 'number' ? v : '—');
  const rowsWithMeta = weightRows.map((r, idx) => {
    const prev = weightRows.slice(idx + 1).find(x => typeof x.weight === 'number');
    let deltaVal = null;
    if (typeof r.weight === 'number' && prev) {
      const d = +(r.weight - prev.weight).toFixed(1);
      if (d) deltaVal = d;
    }
    return { r, deltaVal };
  });

  $('#b-body', root).innerHTML = rowsWithMeta.length ? rowsWithMeta.map(({ r, deltaVal }) => {
    const delta = deltaVal !== null
      ? ` <span class="text-xs ${deltaVal > 0 ? 'text-rose-600' : 'text-green-700'}">${deltaVal > 0 ? '+' : ''}${deltaVal}</span>`
      : '';
    return `<tr class="hover:bg-sky-soft/30"><td class="p-3 font-medium whitespace-nowrap">${esc(fmtDate(r.date))}${r.note ? `<div class="text-xs text-slate-500 font-normal">${esc(r.note)}</div>` : ''}</td>
      <td class="p-3 text-right">${cell(r.weight)}${delta}</td><td class="p-3 text-right text-slate-600">${cell(r.bust)}</td><td class="p-3 text-right text-slate-600">${cell(r.waist)}</td><td class="p-3 text-right text-slate-600">${cell(r.hip)}</td><td class="p-3 text-right text-slate-600">${cell(r.arm)}</td><td class="p-3 text-right text-slate-600">${cell(r.thigh)}</td>
      <td class="p-3 text-center"><button data-del="${esc(r.id)}" class="text-rose-500 hover:text-rose-700 p-2 min-w-[36px] min-h-[36px]" aria-label="ลบบันทึก">${iconSvg('trash', { size: 14 })}</button></td></tr>`;
  }).join('') : '<tr><td colspan="8" class="p-5 text-center text-slate-500 text-xs">ยังไม่มีข้อมูลน้ำหนักหรือสัดส่วน</td></tr>';

  const mobileList = $('#b-mobile-list', root);
  if (mobileList) {
    const partBadges = r => [
      ['อก', r.bust],
      ['เอว', r.waist],
      ['สะโพก', r.hip],
      ['แขน', r.arm],
      ['ขา', r.thigh]
    ].filter(([, v]) => typeof v === 'number');
    mobileList.innerHTML = rowsWithMeta.length ? rowsWithMeta.map(({ r, deltaVal }) => {
      const parts = partBadges(r);
      const deltaBadge = deltaVal !== null
        ? `<span class="text-[11px] font-semibold ${deltaVal > 0 ? 'text-rose-600' : 'text-emerald-700'}">${deltaVal > 0 ? '+' : ''}${deltaVal}</span>`
        : '';
      return `
        <div class="tm-swipe-row is-soft text-xs">
          <div class="tm-swipe-actions tm-swipe-actions--single">
            <button type="button" data-del="${esc(r.id)}" class="tm-swipe-action-btn is-del" aria-label="ลบบันทึก ${esc(fmtDate(r.date))}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
          </div>
          <div class="tm-swipe-card tm-swipe-card--stack !p-2.5 space-y-1.5">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
              <span class="font-bold text-slate-800">${esc(fmtDate(r.date))}</span>
              ${typeof r.weight === 'number' ? `<span class="inline-flex items-center gap-1 rounded-md bg-sky-soft/70 px-2 py-0.5 font-bold text-blue-700">${r.weight} กก.${deltaBadge ? ` ${deltaBadge}` : ''}</span>` : ''}
            </div>
            ${parts.length ? `<div class="grid grid-cols-3 gap-1.5 text-[11px] text-slate-600">${parts.map(([lbl, val]) => `<div class="rounded-lg bg-white/80 px-2 py-1 flex items-center justify-between gap-1 border border-slate-100"><span class="text-slate-500">${lbl}</span><b class="text-slate-800">${val}</b></div>`).join('')}</div>` : ''}
            ${r.note ? `<p class="text-[11px] text-slate-500">${esc(r.note)}</p>` : ''}
          </div>
        </div>`;
    }).join('') : '<p class="py-4 text-center text-slate-500 text-xs">ยังไม่มีข้อมูลน้ำหนักหรือสัดส่วน</p>';
    bindSwipeRows(mobileList);
  }

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

  const modalRes = openModal(`
    <div id="zepp-preview-box">
      <div class="flex justify-between items-center mb-2">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('upload', { size: 17, className: 'text-brand' })}<span>ตรวจสอบข้อมูลก่อนนำเข้า (${items.length} วัน)</span></h3>
        <button type="button" data-close class="icon-btn !w-9 !h-9 text-slate-400" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
      </div>
      <p class="text-xs text-slate-500 mb-3">ติ๊กเลือกวันและตรวจดูตัวเลข (ถ้ามีข้อมูล Zepp ของวันนั้นอยู่แล้ว ระบบจะรวม/อัปเดตให้อัตโนมัติ)</p>
      <div class="space-y-2 max-h-72 overflow-y-auto pr-0.5">
        ${items.map((it, idx) => `
          <label class="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs cursor-pointer">
            <input type="checkbox" data-zp-chk="${idx}" class="mt-0.5" checked>
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <input type="date" data-zp-date="${idx}" value="${esc(it.date)}" class="input !py-1 !px-2 text-xs w-auto">
                <span class="text-[11px] text-slate-500">· ${esc(sourceBadgeLabel(it.source))}</span>
              </div>
              <div class="flex flex-wrap gap-3 text-slate-700 tabular-nums">
                ${it.sleepHours != null ? `<span>นอน <b>${it.sleepHours}</b> ชม.${it.bedTime || it.wakeTime ? ` (${esc(it.bedTime || '?')}–${esc(it.wakeTime || '?')})` : ''}</span>` : ''}
                ${it.steps != null ? `<span><b>${it.steps.toLocaleString()}</b> ก้าว${it.distanceKm != null ? ` · ${it.distanceKm} กม.` : ''}</span>` : ''}
                ${it.activeKcal != null ? `<span>${it.activeKcal} kcal</span>` : ''}
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
    </div>
  `);

  // ดึงกล่อง HTML Element จริงๆ ออกมา (รองรับทั้งกรณี openModal คืนค่าเป็น Element, Object หรือ undefined)
  const box = (modalRes instanceof HTMLElement ? modalRes : modalRes?.el) || document.getElementById('zepp-preview-box') || document;

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

  $('#zp-confirm', box)?.addEventListener('click', async () => {
    if (guardPreviewWrite('การนำเข้าข้อมูลจาก Zepp')) return;
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


function openSleepStepsModal(prefill = null) {
  const initDate = isDateStr(prefill?.date) ? prefill.date : localDateStr();
  const findByDate = d => (state.body || []).find(b => b.id === 'zepp_' + d);
  const initialRec = prefill || findByDate(initDate) || null;
  const initHours = resolvedSleepHours(initialRec);

  const modal = openModal(`
    <div id="bz-manual-box" class="space-y-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('sleep', { size: 18, className: 'text-brand' })}<span>บันทึกการนอน & ก้าวเดิน</span></h3>
        <button type="button" data-close class="icon-btn !w-9 !h-9 text-slate-400" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2 sm:col-span-1"><label class="lbl" for="bz-date">วันที่</label><input type="date" id="bz-date" class="input" value="${esc(initDate)}"></div>
        <div class="col-span-2 sm:col-span-1"><label class="lbl" for="bz-steps">จำนวนก้าว</label><input type="number" step="1" min="0" inputmode="numeric" id="bz-steps" class="input" placeholder="เช่น 8420" value="${typeof initialRec?.steps === 'number' ? initialRec.steps : ''}"></div>
        <div class="col-span-2">
          <div class="flex items-center justify-between gap-2">
            <label class="lbl !mb-0" for="bz-sleep">ชั่วโมงนอน (ชม.)</label>
            <span id="bz-sleep-badge" class="text-xs font-semibold text-indigo-600 tabular-nums">${initHours !== null ? `${round1(initHours)} ชม.` : 'ยังไม่ระบุ'}</span>
          </div>
          <div class="grid grid-cols-[minmax(0,1fr)_96px] gap-2 items-center mt-1">
            <input type="range" id="bz-sleep-slider" class="tm-slider !mt-0" min="0" max="14" step="0.5" value="${initHours !== null ? Math.max(0, Math.min(14, Math.round(initHours * 2) / 2)) : 0}" aria-label="ปรับชั่วโมงนอนแบบเลื่อน">
            <input type="number" step="0.1" min="0" max="24" inputmode="decimal" id="bz-sleep" class="input text-center" placeholder="7.5" value="${initHours !== null ? initHours : ''}">
          </div>
        </div>
        <div><label class="lbl" for="bz-bed">เวลาเข้านอน</label><input type="time" id="bz-bed" class="input" value="${esc(initialRec?.bedTime || '')}"></div>
        <div><label class="lbl" for="bz-wake">เวลาตื่นนอน</label><input type="time" id="bz-wake" class="input" value="${esc(initialRec?.wakeTime || '')}"></div>
        <div class="col-span-2"><label class="lbl" for="bz-note">หมายเหตุ</label><input id="bz-note" class="input" placeholder="หลับสบาย / เดินออกกำลัง" value="${esc(initialRec?.note || '')}"></div>
      </div>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" data-close class="btn btn-ghost text-xs">ยกเลิก</button>
        <button type="button" id="bz-save" class="btn btn-primary text-xs">${iconSvg('plus', { size: 15 })} บันทึกนอน / ก้าวเดิน</button>
      </div>
    </div>
  `);

  const box = modal?.box || document.getElementById('bz-manual-box');
  if (!box) return;
  const sleepInp = $('#bz-sleep', box);
  const sleepSlider = $('#bz-sleep-slider', box);
  const sleepBadge = $('#bz-sleep-badge', box);
  const syncBadge = v => {
    const n = Number(v);
    if (sleepBadge) sleepBadge.textContent = Number.isFinite(n) && n > 0 ? `${round1(n)} ชม.` : 'ยังไม่ระบุ';
  };

  sleepSlider?.addEventListener('input', e => {
    const val = Number(e.target.value) > 0 ? e.target.value : '';
    if (sleepInp) sleepInp.value = val;
    syncBadge(val);
  });
  sleepInp?.addEventListener('input', e => {
    const v = Number(e.target.value);
    if (sleepSlider) sleepSlider.value = Number.isFinite(v) ? String(Math.max(0, Math.min(14, Math.round(v * 2) / 2))) : '0';
    syncBadge(e.target.value);
  });
  $('#bz-date', box)?.addEventListener('change', e => {
    const rec = findByDate(e.target.value);
    if (!rec) return;
    const sh = resolvedSleepHours(rec);
    if (sleepInp) sleepInp.value = sh !== null ? String(sh) : '';
    if (sleepSlider) sleepSlider.value = sh !== null ? String(Math.max(0, Math.min(14, Math.round(sh * 2) / 2))) : '0';
    syncBadge(sh);
    if ($('#bz-steps', box)) $('#bz-steps', box).value = typeof rec.steps === 'number' ? String(rec.steps) : '';
    if ($('#bz-bed', box)) $('#bz-bed', box).value = rec.bedTime || '';
    if ($('#bz-wake', box)) $('#bz-wake', box).value = rec.wakeTime || '';
    if ($('#bz-note', box)) $('#bz-note', box).value = rec.note || '';
  });
  $('#bz-save', box)?.addEventListener('click', () => saveSleepSteps(box, () => modal?.close?.()));
}

function saveSleepSteps(container = root, onDone = null) {
  if (guardPreviewWrite('การบันทึกการนอนและก้าวเดิน')) return;
  const date = $('#bz-date', container).value;
  const sleepHours = numField(container, 'bz-sleep');
  const steps = numField(container, 'bz-steps');
  const bedTime = ($('#bz-bed', container).value || '').trim();
  const wakeTime = ($('#bz-wake', container).value || '').trim();
  const note = ($('#bz-note', container).value || '').trim();

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

  toast('บันทึกการนอน & ก้าวเดินแล้ว');
  if (typeof onDone === 'function') onDone();
}

function save() {
  if (guardPreviewWrite('การบันทึกน้ำหนักและสัดส่วน')) return;
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
