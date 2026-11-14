import { addDoc, deleteDoc } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, parseLocal, numField, round1, toast } from './util.js';

const CHART_METRICS = [
  { key: 'weight', label: 'น้ำหนัก', unit: 'กก.', color: '#3b82f6' },
  { key: 'waist', label: 'รอบเอว', unit: 'ซม.', color: '#8b5cf6' },
  { key: 'hip', label: 'สะโพก', unit: 'ซม.', color: '#ec4899' },
  { key: 'arm', label: 'รอบแขน', unit: 'ซม.', color: '#10b981' },
  { key: 'thigh', label: 'รอบขา', unit: 'ซม.', color: '#f59e0b' },
  { key: 'bust', label: 'รอบอก', unit: 'ซม.', color: '#06b6d4' }
];

let root;
let activeMetric = 'weight';

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
    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-list text-blue-500"></i> ประวัติ</h3>
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
  </div>`;

  $('#b-date', root).value = localDateStr();
  $('#b-save', root).addEventListener('click', save);
  $('#b-chart-tabs', root).addEventListener('click', e => {
    const b = e.target.closest('[data-metric]');
    if (!b) return;
    activeMetric = b.dataset.metric;
    renderChart();
  });
  $('#b-body', root).addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (b && confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) deleteDoc(userDoc(state.uid, 'body_records', b.dataset.del)).catch(err => toast(err.message, 'err'));
  });
  render();
}

export const sortBodyDesc = items => items.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

export function bodyLatest(items) {
  const desc = sortBodyDesc(items), out = {};
  ['weight', 'bust', 'waist', 'hip', 'arm', 'thigh'].forEach(k => { const f = desc.find(i => typeof i[k] === 'number'); if (f) out[k] = { v: f[k], d: f.date }; });
  return out;
}

export function metricChartSvg(items, metricKey = 'weight') {
  const meta = CHART_METRICS.find(m => m.key === metricKey) || CHART_METRICS[0];
  const pts = items.filter(i => typeof i[meta.key] === 'number' && i.date).sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
  if (pts.length < 2) return `<p class="text-xs text-slate-400">บันทึก${esc(meta.label)}อย่างน้อย 2 ครั้งเพื่อดูกราฟ</p>`;
  const W = 320, H = 165, P = 28;
  const vs = pts.map(p => p[meta.key]);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  const ts = pts.map(p => parseLocal(p.date).getTime());
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const x = t => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = w => H - P - ((w - min) / (max - min)) * (H - 2 * P);
  const line = pts.map((p, i) => `${x(ts[i]).toFixed(1)},${y(p[meta.key]).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(ts[i]).toFixed(1)}" cy="${y(p[meta.key]).toFixed(1)}" r="3.2" fill="${meta.color}"><title>${esc(fmtDate(p.date))}: ${p[meta.key]} ${esc(meta.unit)}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto"><polyline points="${line}" fill="none" stroke="${meta.color}" stroke-width="2.2"/>${dots}
    <text x="4" y="${y(max) + 4}" font-size="10" fill="#64748b">${max.toFixed(1)}</text><text x="4" y="${y(min) + 4}" font-size="10" fill="#64748b">${min.toFixed(1)}</text>
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

export function render() {
  if (!root) return;
  const desc = sortBodyDesc(state.body);
  const cell = v => (typeof v === 'number' ? v : '-');
  $('#b-body', root).innerHTML = desc.length ? desc.map((r, idx) => {
    const prev = desc.slice(idx + 1).find(x => typeof x.weight === 'number');
    let delta = '';
    if (typeof r.weight === 'number' && prev) {
      const d = +(r.weight - prev.weight).toFixed(1);
      if (d) delta = ` <span class="text-xs ${d > 0 ? 'text-rose-500' : 'text-green-600'}">${d > 0 ? '+' : ''}${d}</span>`;
    }
    return `<tr class="hover:bg-sky-soft/30"><td class="p-3 font-medium">${esc(fmtDate(r.date))}${r.note ? `<div class="text-xs text-slate-400 font-normal">${esc(r.note)}</div>` : ''}</td>
      <td class="p-3 text-right">${cell(r.weight)}${delta}</td><td class="p-3 text-right text-slate-600">${cell(r.bust)}</td><td class="p-3 text-right text-slate-600">${cell(r.waist)}</td><td class="p-3 text-right text-slate-600">${cell(r.hip)}</td><td class="p-3 text-right text-slate-600">${cell(r.arm)}</td><td class="p-3 text-right text-slate-600">${cell(r.thigh)}</td>
      <td class="p-3 text-center"><button data-del="${esc(r.id)}" class="text-rose-400 hover:text-rose-600 p-1"><i class="fa-solid fa-trash-can text-xs"></i></button></td></tr>`;
  }).join('') : '<tr><td colspan="8" class="p-4 text-center text-slate-400 text-xs">ยังไม่มีข้อมูล</td></tr>';
  renderChart();
}

function save() {
  const date = $('#b-date', root).value;
  const rec = { weight: numField(root, 'b-weight'), bust: numField(root, 'b-bust'), waist: numField(root, 'b-waist'), hip: numField(root, 'b-hip'), arm: numField(root, 'b-arm'), thigh: numField(root, 'b-thigh') };
  if (!date) return toast('กรุณาเลือกวันที่', 'err');
  if (Object.values(rec).every(v => v === null)) return toast('กรุณากรอกอย่างน้อย 1 ค่า', 'err');
  for (const [k, v] of Object.entries(rec)) if (v !== null && (v <= 0 || v > 400)) return toast('ค่าไม่สมเหตุสมผล: ' + k, 'err');
  addDoc(userCol(state.uid, 'body_records'), { date, ...rec, note: $('#b-note', root).value.trim(), createdAt: new Date() }).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  ['b-weight', 'b-bust', 'b-waist', 'b-hip', 'b-arm', 'b-thigh', 'b-note'].forEach(id => { $('#' + id, root).value = ''; });
}
