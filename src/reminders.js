import { state } from './state.js';
import { $, esc, localDateStr, addDays } from './util.js';
import { periodStats } from './period.js';

let root;
const monthsAfter = (date, months) => {
  const d = new Date(date + 'T00:00:00'), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + months); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
};
export function mountReminders(el) { root = el; renderReminders(); }
export function renderReminders() {
  if (!root?.isConnected) return;
  const today = localDateStr(), rows = [];
  for (const x of state.petCare || []) if (x.nextDate) rows.push({ date:x.nextDate, icon:'🐾', label:`${x.type || 'นัดสัตว์เลี้ยง'} · ${(state.petProfiles || []).find(p=>p.id===x.petId)?.name || 'สัตว์เลี้ยง'}`, detail:x.note || 'ตารางนัดและดูแล' });
  for (const p of state.trackedProducts || []) {
    const exp=p.expiryDate || (p.openedDate && p.paoMonths ? monthsAfter(p.openedDate,Number(p.paoMonths)) : p.paoExpiry);
    if (exp && exp <= addDays(today,30)) rows.push({date:exp,icon:'📅',label:`${p.name} · ใกล้หมดอายุ`,detail:exp<today?'เลยกำหนดแล้ว':'ควรใช้ก่อน'});
    if (p.quantity!=null && p.lowAt!=null && Number(p.quantity)<=Number(p.lowAt)) rows.push({date:today,icon:'📦',label:`${p.name} · สต๊อกใกล้หมด`,detail:`เหลือ ${p.quantity} ${p.unit||'หน่วย'}`});
  }
  for (const x of state.replacements || []) if (x.nextDate && x.nextDate <= addDays(today,30)) rows.push({date:x.nextDate,icon:'🔄',label:`${x.name} · ถึงรอบเปลี่ยน`,detail:x.note || 'บันทึกการเปลี่ยนของ'});
  const cycle=periodStats(state.period || []);
  if (cycle?.next && cycle.next <= addDays(today,14)) rows.push({date:cycle.next,icon:'🌸',label:'ประจำเดือนใกล้ถึงรอบ',detail:'วันที่คาดการณ์จากรอบก่อนหน้า เป็นการประมาณ'});
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  const cards=rows.map(x=>`<article class="rounded-xl bg-white/80 border border-slate-100 p-3 flex gap-3"><span class="text-xl">${x.icon}</span><div><b class="text-sm">${esc(x.label)}</b><p class="text-xs text-slate-600">${esc(x.date)} · ${esc(x.detail)}</p></div></article>`).join('');
  root.innerHTML=`<div class="lg:col-span-3 space-y-4"><section class="card space-y-3"><h2 class="text-lg font-bold"><i class="fa-regular fa-bell text-brand"></i> แจ้งเตือนและรายการใกล้ถึงรอบ</h2><p class="text-xs text-slate-500">รวมตารางนัดสัตว์เลี้ยง ของใกล้หมดอายุ/หมดสต๊อก รอบเปลี่ยนของ และรอบเดือน ไว้ที่เดียว</p>${cards || '<p class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">ยังไม่มีรายการที่ใกล้ถึงกำหนดค่ะ</p>'}<p class="text-[11px] text-slate-400">รายการอัปเดตเมื่อเปิดแอปและซิงค์ข้อมูลสำเร็จ การแจ้งเตือนนี้ไม่ใช่การแจ้งเตือนจากเซิร์ฟเวอร์เมื่อปิดแอป</p></section></div>`;
}
