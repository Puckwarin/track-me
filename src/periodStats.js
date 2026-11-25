import { addDays, daysBetween } from './util.js';

export const REMIND_OPTIONS = [
  [-1, 'ปิดแจ้งเตือน'],
  [0, 'วันครบกำหนด'],
  [1, 'ล่วงหน้า 1 วัน'],
  [2, 'ล่วงหน้า 2 วัน'],
  [3, 'ล่วงหน้า 3 วัน'],
  [7, 'ล่วงหน้า 1 วีค (7 วัน)'],
  [14, 'ล่วงหน้า 2 วีค (14 วัน)'],
  [30, 'ล่วงหน้า 1 เดือน'],
  [60, 'ล่วงหน้า 2 เดือน']
];

export const remindLabel = d => REMIND_OPTIONS.find(x => x[0] === Number(d))?.[1] || `ล่วงหน้า ${d} วัน`;

export function getPeriodRemindDays() {
  const v2 = localStorage.getItem('period_remind_days');
  if (v2 !== null) {
    const n = Number(v2);
    return Number.isFinite(n) ? n : -1;
  }
  const legacy = localStorage.getItem('remind_days');
  if (legacy === '1' || legacy === '2' || legacy === '3') return Number(legacy);
  return -1;
}

export function setPeriodRemindDays(val) {
  const n = Number(val);
  const safe = Number.isFinite(n) ? n : -1;
  localStorage.setItem('period_remind_days', String(safe));
  localStorage.setItem('remind_days', safe > 0 ? String(safe) : '0');
  localStorage.removeItem('reminder_dismissed');
  window.dispatchEvent(new Event('trackme:reminders'));
}

export function periodStats(items) {
  const asc = (items || []).filter(i => i?.start).slice().sort((a, b) => a.start.localeCompare(b.start));
  if (!asc.length) return null;
  const last = asc[asc.length - 1];
  const cycles = [];
  for (let i = 1; i < asc.length; i++) cycles.push(daysBetween(asc[i - 1].start, asc[i].start));
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  const recent = cycles.slice(-6);
  const avgCycle = recent.length ? avg(recent) : null;
  const durs = asc.filter(i => i.end).map(i => daysBetween(i.start, i.end) + 1).slice(-6);
  const avgDur = durs.length ? avg(durs) : null;
  return {
    lastStart: last.start,
    lastEnd: last.end || null,
    avgCycle,
    avgDur,
    next: avgCycle ? addDays(last.start, avgCycle) : null,
    count: asc.length
  };
}
