import { getDocs, query, where } from 'firebase/firestore';
import { userCol } from './firebase.js';
import { state } from './state.js';
import { auth } from './firebase.js';
import { $, esc, fmtDate, fmtDateTime, localDateStr, addDays, daysBetween, round1, toCsv, downloadFile, toast } from './util.js';
import { periodStats } from './period.js';
import { sortBodyDesc, weightChartSvg } from './body.js';
import { SYMPTOMS, SEVERITY, MOODS, STRESS } from './symptoms.js';
import { syncLineText } from './sync.js';
import { TYPES, SECTIONS, repLabel } from './workout.js';
import { labFlag, refText } from './lab.js';

let root, data = null;

export function mountReport(el) {
  root = el;
  root.innerHTML = `
  <div class="lg:col-span-3 space-y-6">
    <div class="card space-y-4 no-print">
      <h2 class="text-lg font-bold text-slate-800"><i class="fa-solid fa-file-medical text-brand"></i> รายงานสุขภาพ (Health Report)</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label class="lbl">ตั้งแต่วันที่</label><input type="date" id="r-from" class="input"></div>
        <div><label class="lbl">ถึงวันที่</label><input type="date" id="r-to" class="input"></div>
        <div class="col-span-2"><label class="lbl">ชื่อบนรายงาน</label><input id="r-name" class="input" placeholder="ไม่บังคับ"></div>
      </div>
      <div class="flex flex-wrap gap-4 text-sm">
        <label><input type="checkbox" id="r-inc-period" checked> ประจำเดือน</label>
        <label><input type="checkbox" id="r-inc-sym" checked> อาการรายวัน</label>
        <label><input type="checkbox" id="r-inc-body" checked> น้ำหนัก/สัดส่วน</label>
        <label><input type="checkbox" id="r-inc-food" checked> อาหาร/สารอาหาร</label>
        <label><input type="checkbox" id="r-inc-workout" checked> ออกกำลังกาย</label>
        <label><input type="checkbox" id="r-inc-lab" checked> ผลตรวจ</label>
      </div>
      <div class="flex flex-wrap gap-2">
        <button id="r-gen" class="btn btn-primary"><i class="fa-solid fa-file-lines"></i> สร้างรายงาน</button>
        <button id="r-print" class="btn btn-soft" disabled><i class="fa-solid fa-print"></i> พิมพ์ / บันทึกเป็น PDF</button>
        <select id="r-csv-kind" class="input !w-auto"><option value="period">CSV: ประจำเดือน</option><option value="symptoms">CSV: อาการ</option><option value="body">CSV: น้ำหนัก/สัดส่วน</option><option value="food">CSV: อาหาร</option><option value="workout">CSV: ออกกำลังกาย</option><option value="lab">CSV: ผลตรวจ</option></select>
        <button id="r-csv" class="btn btn-ghost"><i class="fa-solid fa-file-csv"></i> ดาวน์โหลด CSV</button>
      </div>
      <p class="text-xs text-slate-400">PDF: กด "พิมพ์" แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ของเบราว์เซอร์ (รองรับภาษาไทย ไม่ต้องติดตั้งอะไรเพิ่ม) · CSV เปิดด้วย Excel ได้</p>
    </div>
    <div id="report-preview" class="card"><p class="text-sm text-slate-400">เลือกช่วงวันที่แล้วกด "สร้างรายงาน"</p></div>
  </div>`;
  $('#r-from', root).value = addDays(localDateStr(), -90);
  $('#r-to', root).value = localDateStr();
  $('#r-name', root).value = auth.currentUser?.displayName || '';
  $('#r-gen', root).addEventListener('click', generate);
  $('#r-print', root).addEventListener('click', () => window.print());
  $('#r-csv', root).addEventListener('click', csv);
}

async function load() {
  const from = $('#r-from', root).value, to = $('#r-to', root).value;
  if (!from || !to || from > to) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
  const range = name => getDocs(query(userCol(state.uid, name), where('date', '>=', from), where('date', '<=', to)))
    .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
  // ประจำเดือน/น้ำหนักอยู่ในหน่วยความจำแล้ว; อาหาร/อาการดึงตามช่วงวันที่ (ตอนออฟไลน์จะอ่านจากแคชในเครื่อง)
  const [food, symptoms, workouts] = await Promise.all([range('food_records'), range('symptom_records'), range('workout_records')]);
  const period = state.period.filter(p => p.start <= to && (p.end || p.start) >= from).sort((a, b) => a.start.localeCompare(b.start));
  const body = state.body.filter(b => b.date >= from && b.date <= to);
  return { from, to, food, symptoms, workouts, period, body };
}

async function generate() {
  try { data = await load(); } catch (e) { return toast(e.message, 'err'); }
  const d = data, inc = k => $('#r-inc-' + k, root).checked;
  const name = $('#r-name', root).value.trim();
  const sec = (title, body) => `<section class="report-section mt-6"><h3 class="font-bold text-slate-800 border-b border-lav-soft pb-1 mb-2">${title}</h3>${body}</section>`;
  const tbl = (head, rows) => `<table class="w-full text-left text-sm"><thead class="bg-lav-soft/50"><tr>${head.map(h => `<th class="p-2">${h}</th>`).join('')}</tr></thead><tbody class="divide-y divide-slate-100">${rows.map(r => `<tr>${r.map(c => `<td class="p-2">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  let h = `<div><h2 class="text-xl font-bold text-brand-dark">รายงานสุขภาพ Track Me</h2>
    <p class="text-sm text-slate-600">${name ? 'ชื่อ: ' + esc(name) + ' · ' : ''}ช่วงข้อมูล: ${esc(fmtDate(d.from))} – ${esc(fmtDate(d.to))}</p>
    <p class="text-xs text-slate-500">ออกรายงานเมื่อ ${esc(fmtDateTime(Date.now()))} · ${esc(syncLineText())}</p></div>`;

  if (inc('period')) {
    const s = periodStats(state.period);
    const all = state.period.slice().sort((a, b) => a.start.localeCompare(b.start));
    h += sec('ประจำเดือน', (s ? `<p class="text-sm mb-2"><b>ครั้งล่าสุด (LMP):</b> ${esc(fmtDate(s.lastStart))} (${daysBetween(s.lastStart, localDateStr())} วันที่แล้ว) · <b>รอบเฉลี่ย:</b> ${s.avgCycle ? s.avgCycle + ' วัน' : '-'} · <b>มาเฉลี่ย:</b> ${s.avgDur ? s.avgDur + ' วัน' : '-'}</p>` : '') +
      (d.period.length ? tbl(['เริ่ม', 'สิ้นสุด', 'มา (วัน)', 'รอบ (วัน)', 'ปริมาณ/หมายเหตุ'], d.period.map(p => {
        const i = all.findIndex(x => x.id === p.id);
        return [esc(fmtDate(p.start)), esc(fmtDate(p.end)), p.end ? daysBetween(p.start, p.end) + 1 : '-', i > 0 ? daysBetween(all[i - 1].start, p.start) : '-', esc([p.flow, p.note].filter(Boolean).join(' · '))];
      })) : '<p class="text-sm text-slate-400">ไม่มีข้อมูลในช่วงนี้</p>'));
  }
  if (inc('sym')) {
    const rows = d.symptoms.slice().sort((a, b) => a.date.localeCompare(b.date)).map(r => [esc(fmtDate(r.date)),
      esc(SYMPTOMS.filter(([k]) => r.symptoms?.[k] > 0).map(([k, t]) => `${t} (${SEVERITY[r.symptoms[k]]})`).join(', ') || '-'),
      esc(MOODS[r.mood] || '-'), esc(STRESS[r.stress] || '-'), esc(r.note || '')]);
    h += sec('อาการรายวัน', rows.length ? tbl(['วันที่', 'อาการ (ความรุนแรง)', 'อารมณ์', 'เครียด', 'หมายเหตุ'], rows) : '<p class="text-sm text-slate-400">ไม่มีข้อมูลในช่วงนี้</p>');
  }
  if (inc('body')) {
    const desc = sortBodyDesc(d.body), c = v => (typeof v === 'number' ? v : '-');
    h += sec('น้ำหนักและสัดส่วน', (desc.length ? `<div class="max-w-md">${weightChartSvg(d.body)}</div>` + tbl(['วันที่', 'น้ำหนัก (กก.)', 'อก', 'เอว', 'สะโพก (ซม.)'], desc.map(r => [esc(fmtDate(r.date)), c(r.weight), c(r.bust), c(r.waist), c(r.hip)])) : '<p class="text-sm text-slate-400">ไม่มีข้อมูลในช่วงนี้</p>'));
  }
  if (inc('food')) {
    const by = {};
    d.food.forEach(f => { const x = by[f.date] ||= { cal: 0, p: 0, c: 0, f: 0, n: 0 }; x.cal += f.calories || 0; x.p += f.protein || 0; x.c += f.carbs || 0; x.f += f.fat || 0; x.n++; });
    const days = Object.keys(by).sort(), n = days.length || 1, avg = k => round1(days.reduce((a, k2) => a + by[k2][k], 0) / n);
    h += sec('อาหารและสารอาหาร', days.length ? `<p class="text-sm mb-2">บันทึก ${days.length} วัน · <b>เฉลี่ยต่อวัน:</b> ${Math.round(avg('cal'))} kcal · โปรตีน ${avg('p')} g · คาร์บ ${avg('c')} g · ไขมัน ${avg('f')} g</p>` +
      tbl(['วันที่', 'รายการ', 'kcal', 'โปรตีน', 'คาร์บ', 'ไขมัน'], days.map(k => [esc(fmtDate(k)), by[k].n, Math.round(by[k].cal), round1(by[k].p), round1(by[k].c), round1(by[k].f)])) : '<p class="text-sm text-slate-400">ไม่มีข้อมูลในช่วงนี้</p>');
  }
  if (inc('workout')) {
    const ws = d.workouts.slice().sort((a, b) => a.date.localeCompare(b.date)), by = {};
    ws.forEach(w => { by[w.type] = (by[w.type] || 0) + 1; });
    const rowT = r => `${esc(r.name)} — ${r.weightKg != null ? r.weightKg + ' kg' + (r.perSide ? '/ข้าง' : '') + ' · ' : ''}${r.sets || 1} × ${r.reps ?? '-'} ${repLabel(r.repUnit)}`;
    h += sec('ออกกำลังกาย', ws.length ? `<p class="text-sm mb-2">${ws.length} ครั้ง · ${Object.entries(by).map(([t, n]) => `${esc(TYPES[t] || t)} ${n}`).join(' · ')}</p>` +
      tbl(['วันที่', 'ประเภท', 'นาที', 'รายละเอียด'], ws.map(w => [esc(fmtDate(w.date)), esc(TYPES[w.type] || w.type), w.durationMin ?? '-',
        SECTIONS.map(([k, t]) => (w.sections?.[k]?.length ? `<b>${t.split(' ')[0]}:</b> ` + w.sections[k].map(rowT).join('; ') : '')).filter(Boolean).join('<br>') || '-'])) : '<p class="text-sm text-slate-400">ไม่มีข้อมูลในช่วงนี้</p>');
  }
  if (inc('lab')) {
    const labs = state.labs.filter(l => l.date >= d.from && l.date <= d.to).sort((a, b) => a.name.localeCompare(b.name, 'th') || a.date.localeCompare(b.date));
    const FL = { low: 'ต่ำกว่าเกณฑ์', high: 'สูงกว่าเกณฑ์', ok: 'ในเกณฑ์' };
    h += sec('ผลตรวจทางห้องปฏิบัติการ', labs.length ? tbl(['วันที่', 'รายการ', 'ผล', 'ค่าอ้างอิง', 'เทียบเกณฑ์'], labs.map(l => [esc(fmtDate(l.date)), esc(l.name), `<b>${esc(l.value)}</b> ${esc(l.unit)}`, esc(refText(l)), esc(FL[labFlag(l)] || '-')])) + '<p class="text-xs text-slate-400 mt-1">ค่าอ้างอิงตามที่ผู้ใช้กรอกจากใบผลตรวจ — ให้แพทย์เป็นผู้แปลผล</p>' : '<p class="text-sm text-slate-400">ไม่มีข้อมูลในช่วงนี้</p>');
  }
  h += `<p class="text-xs text-slate-400 mt-6">ข้อมูลนี้ผู้ใช้บันทึกเอง ค่าคาดการณ์เป็นการประมาณ ไม่ใช่การวินิจฉัยทางการแพทย์</p>`;
  $('#report-preview', root).innerHTML = h;
  $('#r-print', root).disabled = false;
}

async function csv() {
  let d; try { d = await load(); } catch (e) { return toast(e.message, 'err'); }
  const kind = $('#r-csv-kind', root).value;
  const rows = {
    period: [['เริ่ม', 'สิ้นสุด', 'ปริมาณ', 'หมายเหตุ'], ...d.period.map(p => [p.start, p.end || '', p.flow || '', p.note || ''])],
    symptoms: [['วันที่', ...SYMPTOMS.map(s => s[1]), 'อารมณ์(1-5)', 'เครียด(1-5)', 'หมายเหตุ'], ...d.symptoms.sort((a, b) => a.date.localeCompare(b.date)).map(r => [r.date, ...SYMPTOMS.map(([k]) => r.symptoms?.[k] ?? 0), r.mood ?? '', r.stress ?? '', r.note || ''])],
    body: [['วันที่', 'น้ำหนัก(กก.)', 'อก(ซม.)', 'เอว(ซม.)', 'สะโพก(ซม.)', 'หมายเหตุ'], ...d.body.slice().sort((a, b) => a.date.localeCompare(b.date)).map(r => [r.date, r.weight ?? '', r.bust ?? '', r.waist ?? '', r.hip ?? '', r.note || ''])],
    lab: [['วันที่', 'รายการ', 'ผล', 'หน่วย', 'อ้างอิงต่ำสุด', 'อ้างอิงสูงสุด', 'หมายเหตุ'], ...state.labs.filter(l => l.date >= d.from && l.date <= d.to).sort((a, b) => a.date.localeCompare(b.date)).map(l => [l.date, l.name, l.value, l.unit || '', l.refLow ?? '', l.refHigh ?? '', l.note || ''])],
    workout: [['วันที่', 'ประเภท', 'นาทีรวม', 'ช่วง', 'ท่า', 'น้ำหนัก(kg)', 'ต่อข้าง', 'เซต', 'จำนวน', 'หน่วย', 'โน้ต'], ...d.workouts.sort((a, b) => a.date.localeCompare(b.date)).flatMap(w => SECTIONS.flatMap(([k, t]) => (w.sections?.[k] || []).map(r => [w.date, TYPES[w.type] || w.type, w.durationMin ?? '', t.split(' ')[0], r.name, r.weightKg ?? '', r.perSide ? 'ใช่' : '', r.sets ?? '', r.reps ?? '', repLabel(r.repUnit), r.note || ''])))],
    food: [['วันที่', 'มื้อ', 'เมนู', 'kcal', 'โปรตีน', 'คาร์บ', 'ไขมัน', 'น้ำตาล', 'โซเดียม(mg)'], ...d.food.sort((a, b) => a.date.localeCompare(b.date)).map(r => [r.date, r.meal, r.name, r.calories, r.protein, r.carbs, r.fat, r.sugar ?? '', r.sodium ?? ''])]
  }[kind];
  downloadFile(`trackme-${kind}-${d.from}_${d.to}.csv`, toCsv(rows), 'text/csv');
}
