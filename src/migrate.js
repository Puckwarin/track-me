import { collection, getDocs, query, where, writeBatch, deleteDoc, doc } from 'firebase/firestore';
import { db, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, toast } from './util.js';
import { SANITIZERS } from './schema.js';

// ย้ายข้อมูลจากระบบเดิม (collection ระดับบนที่แยกด้วย room code) เข้ามาไว้ใต้บัญชีที่ล็อกอิน
// ต้องทำ "ก่อน" เปลี่ยน Firestore Rules เป็นแบบใหม่ — ขั้นตอนอยู่ใน docs/SETUP.md
const OLD = ['food_records', 'period_records', 'body_records'];
let found = null;

export function mountMigrate(el) {
  el.innerHTML = `
    <h3 class="font-bold text-slate-800"><i class="fa-solid fa-truck-moving text-brand"></i> ย้ายข้อมูลจาก Room Code เดิม</h3>
    <p class="text-xs text-slate-500">ถ้าเคยบันทึกข้อมูลไว้ก่อนมีระบบล็อกอิน ใส่รหัสห้องเดิมเพื่อย้ายข้อมูลเข้าบัญชีนี้ (ย้ายซ้ำได้ ไม่เกิดข้อมูลซ้ำ) — ต้องใช้ Firestore Rules ชุดย้ายข้อมูล (firestore.rules.migration) ก่อน</p>
    <div class="flex gap-2"><input id="mg-room" class="input" placeholder="รหัสห้องเดิม" value="${esc(localStorage.getItem('room_code') || '')}"><button id="mg-scan" class="btn btn-soft whitespace-nowrap">ตรวจสอบ</button></div>
    <div id="mg-out" class="text-sm space-y-2"></div>`;
  $('#mg-scan', el).addEventListener('click', () => scan(el));
}

async function scan(el) {
  const room = $('#mg-room', el).value.trim(), out = $('#mg-out', el);
  if (!room) return;
  out.textContent = 'กำลังตรวจสอบ...';
  try {
    found = {};
    for (const c of OLD) found[c] = (await getDocs(query(collection(db, c), where('room', '==', room)))).docs;
    const total = Object.values(found).reduce((a, l) => a + l.length, 0);
    if (!total) { out.textContent = 'ไม่พบข้อมูลในห้องนี้'; return; }
    out.innerHTML = `<p>พบ: อาหาร ${found.food_records.length} · ประจำเดือน ${found.period_records.length} · น้ำหนัก ${found.body_records.length} รายการ</p>
      <button id="mg-go" class="btn btn-primary">ย้ายเข้าบัญชีนี้</button>
      <button id="mg-del" class="btn btn-ghost hidden">ลบข้อมูลเดิมในห้องนี้ (หลังตรวจว่าย้ายครบแล้ว)</button>`;
    $('#mg-go', out).addEventListener('click', () => run(out));
    $('#mg-del', out).addEventListener('click', () => removeOld(out));
  } catch (e) {
    out.innerHTML = `<p class="text-rose-600">อ่านข้อมูลเดิมไม่ได้ (${esc(e.code || e.message)}) — ต้องเผยแพร่ firestore.rules.migration ชั่วคราวก่อน ตามขั้นตอนใน docs/SETUP.md</p>`;
  }
}

async function run(out) {
  if (!navigator.onLine) return toast('ต้องออนไลน์', 'err');
  const rows = [];
  let skipped = 0;
  for (const c of OLD) for (const d of found[c]) {
    const clean = SANITIZERS[c](d.data());
    clean ? rows.push({ c, id: d.id, data: clean }) : skipped++;
  }
  try {
    for (let i = 0; i < rows.length; i += 400) {
      const b = writeBatch(db);
      // ใช้ id เดิม → ย้ายซ้ำจะทับของเดิมที่เหมือนกัน ไม่เกิดรายการซ้ำ
      rows.slice(i, i + 400).forEach(r => b.set(userDoc(state.uid, r.c, r.id), r.data));
      await b.commit();
    }
    toast(`ย้ายสำเร็จ ${rows.length} รายการ${skipped ? ` (ข้าม ${skipped})` : ''}`);
    $('#mg-del', out).classList.remove('hidden');
  } catch (e) { toast('ย้ายไม่สำเร็จ: ' + e.message, 'err'); }
}

async function removeOld(out) {
  if (!confirm('ลบข้อมูลเดิมในห้องนี้ถาวร? (ข้อมูลที่ย้ายมาแล้วในบัญชีนี้จะไม่ถูกลบ) ควรสำรองข้อมูลเป็นไฟล์ก่อน')) return;
  try {
    for (const c of OLD) for (const d of found[c]) await deleteDoc(doc(db, c, d.id));
    toast('ลบข้อมูลเดิมแล้ว'); out.innerHTML = 'ลบข้อมูลในห้องเดิมเรียบร้อย';
  } catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'err'); }
}
