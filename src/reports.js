import { getDocs, query, where } from 'firebase/firestore';
import { userCol, auth } from './firebase.js';
import { state } from './state.js';
import { getPreviewRecordsInRange, isPreviewMode } from './preview.js';
import { $, esc, fmtDate, fmtDateTime, localDateStr, addDays, daysBetween, round1, toCsv, downloadFile, toast } from './util.js';
import { periodStats } from './periodStats.js';
import { sortBodyDesc, weightChartSvg } from './body.js';
import { SYMPTOMS, SEVERITY, MOODS, STRESS } from './symptoms.js';
import { syncLineText } from './sync.js';
import {
  TYPES,
  SECTIONS,
  repLabel,
  formatIntensityLabel,
  formatWorkoutEvaluationParts,
  countMainCompletedSets,
  computeWorkoutTotalMinutes,
  buildWorkoutNotesText,
  summarizeWorkoutCollection,
  formatIntensityBreakdown,
  buildWorkoutCsvRows
} from './workoutConstants.js';
import { labFlag, refText } from './lab.js';
import { iconSvg } from './icons.js';

let root, data = null;

export function mountReport(el) {
  root = el;
  root.innerHTML = `
  <div class="db-page space-y-5">
    <header class="db-header no-print">
      <div class="db-heading">
        <div class="db-eyebrow">TRACK ME · HISTORY &amp; REPORTS</div>
        <h2>ประวัติ &amp; รายงาน</h2>
        <p>รวมสรุปรายสัปดาห์/รายเดือน และแนวโน้มระยะยาวครบทุกหมวด พร้อมส่งออกรายงานในที่เดียว</p>
      </div>
      <div class="db-controls">
        <div class="tm-seg tm-seg--2" role="tablist" aria-label="สลับมุมมองประวัติและรายงาน">
          <button type="button" role="tab" data-page-go="overview" aria-pressed="false" aria-selected="false" class="tm-seg-btn">ภาพรวม &amp; สรุป</button>
          <button type="button" role="tab" data-page-go="report" aria-pressed="true" aria-selected="true" class="tm-seg-btn is-active">${iconSvg('report', { size: 14 })}<span>รายงาน (PDF / CSV)</span></button>
        </div>
      </div>
    </header>
    <div class="card space-y-4 no-print">
      <h3 class="text-lg font-bold text-slate-800 inline-flex items-center gap-1.5">${iconSvg('file-heart', { size: 19, className: 'text-brand' })}<span>รายงานสุขภาพ (Health Report)</span></h3>
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
        <button id="r-gen" class="btn btn-primary">${iconSvg('report', { size: 15 })} สร้างรายงาน</button>
        <button id="r-print" class="btn btn-soft" disabled>${iconSvg('printer', { size: 15 })} พิมพ์ / บันทึกเป็น PDF</button>
        <select id="r-csv-kind" class="input !w-auto"><option value="period">CSV: ประจำเดือน</option><option value="symptoms">CSV: อาการ</option><option value="body">CSV: น้ำหนัก/สัดส่วน</option><option value="food">CSV: อาหาร</option><option value="workout">CSV: ออกกำลังกาย</option><option value="lab">CSV: ผลตรวจ</option></select>
        <button id="r-csv" class="btn btn-ghost">${iconSvg('csv', { size: 15 })} ดาวน์โหลด CSV</button>
      </div>
      <p class="text-xs text-slate-500">PDF: กด "พิมพ์" แล้วเลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ของเบราว์เซอร์ (รองรับภาษาไทย ไม่ต้องติดตั้งอะไรเพิ่ม) · CSV เปิดด้วย Excel ได้</p>
    </div>
    <div id="report-preview" class="card"><p class="text-sm text-slate-500">เลือกช่วงวันที่แล้วกด "สร้างรายงาน"</p></div>
  </div>`;
  $('#r-from', root).value = addDays(localDateStr(), -90);
  $('#r-to', root).value = localDateStr();
  $('#r-name', root).value = isPreviewMode() ? 'ตัวอย่างผู้ใช้งาน (Preview)' : (auth.currentUser?.displayName || '');
  $('#r-gen', root).addEventListener('click', generate);
  $('#r-print', root).addEventListener('click', () => window.print());
  $('#r-csv', root).addEventListener('click', csv);
}

export function resetReportToToday() {
  if (!root) return;
  const today = localDateStr();
  if ($('#r-from', root)) $('#r-from', root).value = addDays(today, -90);
  if ($('#r-to', root)) $('#r-to', root).value = today;
}

async function load() {
  const from = $('#r-from', root).value, to = $('#r-to', root).value;
  if (!from || !to || from > to) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
  const range = name => isPreviewMode()
    ? Promise.resolve(getPreviewRecordsInRange(name, from, to))
    : getDocs(query(userCol(state.uid, name), where('date', '>=', from), where('date', '<=', to)))
        .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
  // ประจำเดือน/น้ำหนักอยู่ในหน่วยความจำแล้ว; อาหาร/อาการดึงตามช่วงวันที่ (ตอนออฟไลน์จะอ่านจากแคชในเครื่อง)
  const [food, symptoms, workouts] = isPreviewMode()
    ? [
      (state.demoFoodRecords || []).filter(item => item.date >= from && item.date <= to),
      state.symptoms.filter(item => item.date >= from && item.date <= to),
      state.workouts.filter(item => item.date >= from && item.date <= to)
    ]
    : await Promise.all([range('food_records'), range('symptom_records'), range('workout_records')]);
  const period = state.period.filter(p => p.start <= to && (p.end || p.start) >= from).sort((a, b) => a.start.localeCompare(b.start));
  const body = state.body.filter(b => b.date >= from && b.date <= to);
  return { from, to, food, symptoms, workouts, period, body };
}

async function generate() {
  const btn = $('#r-gen', root);
  const preview = $('#report-preview', root);
  const prevHtml = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `${iconSvg('fa-spinner fa-spin', { size: 15 })} กำลังสร้างรายงาน...`;
  }
  if (preview) {
    preview.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center inline-flex items-center justify-center gap-1.5 w-full">${iconSvg('fa-spinner fa-spin', { size: 15 })}<span>กำลังดึงข้อมูลและจัดเตรียมรายงาน...</span></p>`;
  }
  try {
    data = await load();
  } catch (e) {
    if (preview) preview.innerHTML = `<p class="text-sm text-rose-700 bg-rose-50 rounded-xl p-3">โหลดข้อมูลไม่สำเร็จ: ${esc(e.message)}</p>`;
    toast(e.message, 'err');
    return;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = prevHtml;
    }
  }
  const d = data, inc = k => $('#r-inc-' + k, root).checked;
  const name = $('#r-name', root).value.trim();
  const sec = (title, body) => `<section class="report-section mt-6"><h3 class="font-bold text-slate-800 border-b border-slate-200 pb-1 mb-2">${title}</h3>${body}</section>`;
  const tbl = (head, rows) => `<div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead class="bg-white border border-slate-100"><tr>${head.map(h => `<th class="p-2 whitespace-nowrap">${h}</th>`).join('')}</tr></thead><tbody class="divide-y divide-slate-100 tabular-nums">${rows.map(r => `<tr>${r.map(c => `<td class="p-2">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  let h = `<div><h2 class="text-xl font-bold text-brand-dark">รายงานสุขภาพ Track Me</h2>
    <p class="text-sm text-slate-600 tabular-nums">${name ? 'ชื่อ: ' + esc(name) + ' · ' : ''}ช่วงข้อมูล: ${esc(fmtDate(d.from))} – ${esc(fmtDate(d.to))}</p>
    <p class="text-xs text-slate-500 tabular-nums">ออกรายงานเมื่อ ${esc(fmtDateTime(Date.now()))} · ${esc(syncLineText())}</p></div>`;

  if (inc('period')) {
    const s = periodStats(state.period);
    const all = state.period.slice().sort((a, b) => a.start.localeCompare(b.start));
    h += sec('ประจำเดือน', (s ? `<p class="text-sm mb-2 tabular-nums"><b>ครั้งล่าสุด (LMP):</b> ${esc(fmtDate(s.lastStart))} (${daysBetween(s.lastStart, localDateStr())} วันที่แล้ว) · <b>รอบเฉลี่ย:</b> ${s.avgCycle ? s.avgCycle + ' วัน' : '—'} · <b>มาเฉลี่ย:</b> ${s.avgDur ? s.avgDur + ' วัน' : '—'}</p>` : '') +
      (d.period.length ? tbl(['เริ่ม', 'สิ้นสุด', 'มา (วัน)', 'รอบ (วัน)', 'ปริมาณ/หมายเหตุ'], d.period.map(p => {
        const i = all.findIndex(x => x.id === p.id);
        return [esc(fmtDate(p.start)), esc(fmtDate(p.end)), p.end ? daysBetween(p.start, p.end) + 1 : '—', i > 0 ? daysBetween(all[i - 1].start, p.start) : '—', esc([p.flow, p.note].filter(Boolean).join(' · '))];
      })) : '<p class="text-sm text-slate-500">ไม่มีข้อมูลในช่วงนี้</p>'));
  }
  if (inc('sym')) {
    const rows = d.symptoms.slice().sort((a, b) => a.date.localeCompare(b.date)).map(r => [esc(fmtDate(r.date)),
      esc(SYMPTOMS.filter(([k]) => r.symptoms?.[k] > 0).map(([k, t]) => `${t} (${SEVERITY[r.symptoms[k]]})`).join(', ') || '—'),
      esc(MOODS[r.mood] || '—'), esc(STRESS[r.stress] || '—'), esc(r.note || '')]);
    h += sec('อาการรายวัน', rows.length ? tbl(['วันที่', 'อาการ (ความรุนแรง)', 'อารมณ์', 'เครียด', 'หมายเหตุ'], rows) : '<p class="text-sm text-slate-500">ไม่มีข้อมูลในช่วงนี้</p>');
  }
  if (inc('body')) {
    const desc = sortBodyDesc(d.body), c = v => (typeof v === 'number' ? v : '—');
    h += sec('น้ำหนักและสัดส่วน', (desc.length ? `<div class="max-w-md">${weightChartSvg(d.body)}</div>` + tbl(['วันที่', 'น้ำหนัก (กก.)', 'อก', 'เอว', 'สะโพก', 'แขน', 'ขา (ซม.)'], desc.map(r => [esc(fmtDate(r.date)), c(r.weight), c(r.bust), c(r.waist), c(r.hip), c(r.arm), c(r.thigh)])) : '<p class="text-sm text-slate-500">ไม่มีข้อมูลในช่วงนี้</p>'));
  }
  if (inc('food')) {
    const by = {};
    d.food.forEach(f => { const x = by[f.date] ||= { cal: 0, p: 0, c: 0, f: 0, n: 0 }; x.cal += f.calories || 0; x.p += f.protein || 0; x.c += f.carbs || 0; x.f += f.fat || 0; x.n++; });
    const days = Object.keys(by).sort(), n = days.length || 1, avg = k => round1(days.reduce((a, k2) => a + by[k2][k], 0) / n);
    h += sec('อาหารและสารอาหาร', days.length ? `<p class="text-sm mb-2 tabular-nums">บันทึก ${days.length} วัน · <b>เฉลี่ยต่อวัน:</b> ${Math.round(avg('cal')).toLocaleString()} kcal · โปรตีน ${avg('p')} g · คาร์บ ${avg('c')} g · ไขมัน ${avg('f')} g</p>` +
      tbl(['วันที่', 'รายการ', 'kcal', 'โปรตีน', 'คาร์บ', 'ไขมัน'], days.map(k => [esc(fmtDate(k)), by[k].n, Math.round(by[k].cal), round1(by[k].p), round1(by[k].c), round1(by[k].f)])) : '<p class="text-sm text-slate-500">ไม่มีข้อมูลในช่วงนี้</p>');
  }
  if (inc('workout')) {
    const ws = d.workouts.filter(w => w.status !== 'planned').slice().sort((a, b) => a.date.localeCompare(b.date));
    const wSum = summarizeWorkoutCollection(ws);
    const intensitySummary = formatIntensityBreakdown(wSum.byIntensity);
    const fmtCounts = obj => Object.entries(obj || {}).map(([lbl, cnt]) => `${lbl} ${cnt}`).join(' · ');
    const completionSummary = fmtCounts(wSum.byCompletion);
    const effortSummary = fmtCounts(wSum.byEffort);
    const feelingSummary = fmtCounts(wSum.byFeeling);
    const symptomSummary = fmtCounts(wSum.bySymptom);
    const recoverySummary = fmtCounts(wSum.byRecovery);
    const rowT = (r, fb = null) => {
      const base = `${esc(r.name)} — ${r.weightKg != null ? r.weightKg + ' kg' + (r.perSide ? '/ข้าง' : '') + ' · ' : ''}${r.sets || 1} × ${r.reps ?? '-'} ${repLabel(r.repUnit)}`;
      if (!fb) return base;
      const fbParts = [fb.rpe != null ? `RPE ${fb.rpe}` : '', fb.rir != null ? `เหลือ ${fb.rir}` : ''].filter(Boolean).join('/');
      return `${base}${fbParts ? ` (${esc(fbParts)})` : ''}${fb.nextLabel ? ` → ${esc(fb.nextLabel)}` : ''}`;
    };
    const workoutHeadSummary = [
      `${wSum.count} ครั้ง`,
      wSum.totalMinutes ? `${wSum.totalMinutes} นาที รวม` : '',
      wSum.totalMainSets ? `ทำจริง ${wSum.totalMainSets} เซต (ท่าหลัก)` : '',
      wSum.totalKcal ? `~${wSum.totalKcal} kcal` : '',
      intensitySummary ? `ความหนัก: ${intensitySummary}` : '',
      completionSummary,
      effortSummary ? `ความเหนื่อย: ${effortSummary}` : '',
      wSum.avgSessionRpe != null ? `RPE เฉลี่ย ${wSum.avgSessionRpe}/10` : '',
      feelingSummary,
      symptomSummary ? `อาการ: ${symptomSummary}` : '',
      recoverySummary ? `ฟื้นตัววันถัดไป: ${recoverySummary}` : ''
    ].filter(Boolean).join(' · ');
    h += sec('ออกกำลังกาย', ws.length ? `<p class="text-sm mb-2 tabular-nums">${esc(workoutHeadSummary)}</p>` +
      `<p class="text-xs text-slate-600 mb-2 tabular-nums">${Object.entries(wSum.byType).map(([t, n]) => `${esc(TYPES[t] || t)} ${n}`).join(' · ')}</p>` +
      tbl(['วันที่', 'กิจกรรม / ประเภท', 'เวลา & ความหนัก', 'ประเมินหลังฝึก', 'รายละเอียด'], ws.map(w => {
        const totalMin = computeWorkoutTotalMinutes(w);
        const intLabel = formatIntensityLabel(w.intensity);
        const mainSets = countMainCompletedSets(w);
        const kcalVal = Math.round(Number(w.estKcal ?? w.caloriesBurn) || 0);
        const evalParts = formatWorkoutEvaluationParts(w);
        const notesText = buildWorkoutNotesText(w);
        const fbList = Array.isArray(w.exerciseFeedback) ? w.exerciseFeedback : [];
        const fbByName = Object.fromEntries(
          fbList
            .filter(x => !x?.section || x.section === 'main')
            .map(x => [String(x.name || '').trim().toLowerCase(), x])
        );
        const typeText = TYPES[w.type] || w.typeLabel || w.type || '—';
        const activityCol = w.title
          ? `<b>${esc(w.title)}</b><div class="text-xs text-slate-500">${esc(typeText)}${w.muscleGroup ? ` · ${esc(w.muscleGroup)}` : ''}</div>`
          : `<b>${esc(typeText)}</b>${w.muscleGroup ? `<div class="text-xs text-slate-500">${esc(w.muscleGroup)}</div>` : ''}`;
        const metricsCol = [
          totalMin ? `<b>${totalMin} นาที รวม</b>` : '—',
          intLabel ? `ความหนัก: ${esc(intLabel)}` : '',
          kcalVal ? `~${kcalVal} kcal` : '',
          mainSets ? `ทำจริง ${mainSets} เซต` : ''
        ].filter(Boolean).join('<br>');
        const evalCol = [
          ...evalParts.map(p => esc(p)),
          notesText ? `<span class="text-xs text-slate-500">${esc(notesText)}</span>` : ''
        ].filter(Boolean).join('<br>') || '—';
        const detailCol = SECTIONS.map(([k, t]) => (w.sections?.[k]?.length
          ? `<b>${t.split(' ')[0]}:</b> ` + w.sections[k].map(r => {
              const fb = k === 'main' ? fbByName[String(r.name || '').trim().toLowerCase()] : null;
              return rowT(r, fb);
            }).join('; ')
          : '')).filter(Boolean).join('<br>') || '—';
        return [esc(fmtDate(w.date)), activityCol, metricsCol, evalCol, detailCol];
      })) : '<p class="text-sm text-slate-500">ไม่มีข้อมูลในช่วงนี้</p>');
  }
  if (inc('lab')) {
    const labs = state.labs.filter(l => l.date >= d.from && l.date <= d.to).sort((a, b) => a.name.localeCompare(b.name, 'th') || a.date.localeCompare(b.date));
    const FL = { low: 'ต่ำกว่าเกณฑ์', high: 'สูงกว่าเกณฑ์', ok: 'ในเกณฑ์' };
    h += sec('ผลตรวจทางห้องปฏิบัติการ', labs.length ? tbl(['วันที่', 'รายการ', 'ผล', 'ค่าอ้างอิง', 'เทียบเกณฑ์'], labs.map(l => [esc(fmtDate(l.date)), esc(l.name), `<b>${esc(l.value)}</b> ${esc(l.unit)}`, esc(refText(l)), esc(FL[labFlag(l)] || '—')])) + '<p class="text-xs text-slate-500 mt-1">ค่าอ้างอิงตามที่ผู้ใช้กรอกจากใบผลตรวจ — ให้แพทย์เป็นผู้แปลผล</p>' : '<p class="text-sm text-slate-500">ไม่มีข้อมูลในช่วงนี้</p>');
  }
  h += `<p class="text-xs text-slate-500 mt-6">ข้อมูลนี้ผู้ใช้บันทึกเอง ค่าคาดการณ์เป็นการประมาณ ไม่ใช่การวินิจฉัยทางการแพทย์</p>`;
  $('#report-preview', root).innerHTML = h;
  $('#r-print', root).disabled = false;
}

async function csv() {
  const btn = $('#r-csv', root);
  const prevHtml = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `${iconSvg('fa-spinner fa-spin', { size: 15 })} กำลังเตรียม CSV...`;
  }
  let d;
  try {
    d = await load();
  } catch (e) {
    toast(e.message, 'err');
    return;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = prevHtml;
    }
  }
  const kind = $('#r-csv-kind', root).value;
  const rows = {
    period: [['เริ่ม', 'สิ้นสุด', 'ปริมาณ', 'หมายเหตุ'], ...d.period.map(p => [p.start, p.end || '', p.flow || '', p.note || ''])],
    symptoms: [['วันที่', ...SYMPTOMS.map(s => s[1]), 'อารมณ์(1-5)', 'เครียด(1-5)', 'หมายเหตุ'], ...d.symptoms.sort((a, b) => a.date.localeCompare(b.date)).map(r => [r.date, ...SYMPTOMS.map(([k]) => r.symptoms?.[k] ?? 0), r.mood ?? '', r.stress ?? '', r.note || ''])],
    body: [['วันที่', 'น้ำหนัก(กก.)', 'อก(ซม.)', 'เอว(ซม.)', 'สะโพก(ซม.)', 'แขน(ซม.)', 'ขา(ซม.)', 'หมายเหตุ'], ...d.body.slice().sort((a, b) => a.date.localeCompare(b.date)).map(r => [r.date, r.weight ?? '', r.bust ?? '', r.waist ?? '', r.hip ?? '', r.arm ?? '', r.thigh ?? '', r.note || ''])],
    lab: [['วันที่', 'รายการ', 'ผล', 'หน่วย', 'อ้างอิงต่ำสุด', 'อ้างอิงสูงสุด', 'หมายเหตุ'], ...state.labs.filter(l => l.date >= d.from && l.date <= d.to).sort((a, b) => a.date.localeCompare(b.date)).map(l => [l.date, l.name, l.value, l.unit || '', l.refLow ?? '', l.refHigh ?? '', l.note || ''])],
    workout: buildWorkoutCsvRows(d.workouts),
    food: [['วันที่', 'มื้อ', 'เมนู', 'kcal', 'โปรตีน', 'คาร์บ', 'ไขมัน', 'น้ำตาล', 'โซเดียม(mg)'], ...d.food.sort((a, b) => a.date.localeCompare(b.date)).map(r => [r.date, r.meal, r.name, r.calories, r.protein, r.carbs, r.fat, r.sugar ?? '', r.sodium ?? ''])]
  }[kind];
  downloadFile(`trackme-${kind}-${d.from}_${d.to}.csv`, toCsv(rows), 'text/csv');
}
