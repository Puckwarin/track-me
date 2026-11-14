import { getDocs, writeBatch } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, localDateStr, downloadFile, toast } from './util.js';
import { SANITIZERS, COLLECTION_LABELS, docIdFor, isSensitivePushSettingsDoc, isLegacyExpenseMonthDoc } from './schema.js';

const APP = 'Track Me', VERSION = '1.3.0';
const toPlain = v => v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v;
let parsed = null;

export function mountBackup(el) {
  el.innerHTML = `
    <h3 class="font-bold text-slate-800"><i class="fa-solid fa-box-archive text-brand"></i> สำรอง & กู้คืนข้อมูล</h3>
    <p class="text-xs text-slate-500">ไฟล์สำรองเป็น JSON ไม่มี API Key ไม่มีรหัสผ่าน และ <b>ไม่รวม Token Push ของเครื่อง</b> แต่<b>มีข้อมูลสุขภาพส่วนบุคคล</b> โปรดเก็บรักษาให้ปลอดภัย</p>
    <div class="flex flex-wrap gap-3 text-sm" id="bk-cols">${Object.entries(COLLECTION_LABELS).map(([k, t]) => `<label><input type="checkbox" value="${k}" checked> ${t}</label>`).join('')}</div>
    <div class="flex flex-wrap gap-2">
      <button id="bk-export" class="btn btn-primary"><i class="fa-solid fa-download"></i> สำรองข้อมูล (JSON)</button>
      <label class="btn btn-soft cursor-pointer"><i class="fa-solid fa-upload"></i> เลือกไฟล์เพื่อกู้คืน<input id="bk-file" type="file" accept="application/json,.json" class="hidden"></label>
    </div>
    <div id="bk-preview" class="hidden space-y-2 text-sm bg-lav-soft/50 rounded-xl p-3"></div>`;
  $('#bk-export', el).addEventListener('click', () => exportData(el));
  $('#bk-file', el).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) readFile(f, el); });
}

const selected = el => [...el.querySelectorAll('#bk-cols input:checked')].map(i => i.value);

async function exportData(el) {
  const cols = selected(el);
  if (!cols.length) return toast('เลือกอย่างน้อย 1 หมวด', 'err');
  try {
    const out = {};
    const legacyFallbackExpenses = [];
    for (const c of cols) {
      const snap = await getDocs(userCol(state.uid, c));
      if (c === 'settings') {
        const cleanDocs = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (isSensitivePushSettingsDoc(data, d.id)) continue; // ไม่ส่งออก endpoint & subscription keys
          if (isLegacyExpenseMonthDoc(data, d.id)) {
            if (Array.isArray(data.items)) {
              for (const item of data.items) {
                if (item && typeof item === 'object') legacyFallbackExpenses.push(item);
              }
            }
            continue;
          }
          cleanDocs.push({ id: d.id, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toPlain(v)])) });
        }
        out[c] = cleanDocs;
      } else {
        out[c] = snap.docs.map(d => ({ id: d.id, ...Object.fromEntries(Object.entries(d.data()).map(([k, v]) => [k, toPlain(v)])) }));
      }
    }
    if (cols.includes('expense_records') && legacyFallbackExpenses.length) {
      const byId = new Map((out.expense_records || []).map(r => [r.id, r]));
      for (const item of legacyFallbackExpenses) {
        if (item.id && !byId.has(item.id)) byId.set(item.id, item);
      }
      out.expense_records = [...byId.values()];
    }
    downloadFile(`trackme-backup-${localDateStr()}.json`, JSON.stringify({ app: APP, version: VERSION, exportDate: localDateStr(), data: out }, null, 2), 'application/json');
    toast('สำรองข้อมูลแล้ว — เก็บไฟล์นี้ให้ปลอดภัย');
  } catch (e) { toast('สำรองไม่สำเร็จ: ' + e.message, 'err'); }
}

async function readFile(file, el) {
  const box = $('#bk-preview', el);
  box.classList.remove('hidden');
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกินไป');
    const json = JSON.parse(await file.text());
    if (json?.app !== APP || typeof json.data !== 'object') throw new Error('ไม่ใช่ไฟล์สำรองของ Track Me');
    const plan = Object.fromEntries(Object.keys(SANITIZERS).map(k => [k, []]));
    let bad = 0;

    for (const c of Object.keys(SANITIZERS)) {
      const list = Array.isArray(json.data[c]) ? json.data[c] : [];
      for (const o of list) {
        if (!o || typeof o !== 'object') { bad++; continue; }
        if (c === 'settings') {
          if (isSensitivePushSettingsDoc(o, o.id)) continue; // ข้าม settings/push เสมอ
          if (isLegacyExpenseMonthDoc(o, o.id)) {
            // แตกข้อมูลรายจ่ายแบบเก่าจากไฟล์สำรองเวอร์ชันก่อนหน้าเข้า expense_records อัตโนมัติ
            const items = Array.isArray(o.items) ? o.items : [];
            for (const item of items) {
              const cleanExp = item && typeof item === 'object' ? SANITIZERS.expense_records(item) : null;
              const expId = typeof item?.id === 'string' && /^[\w-]{1,80}$/.test(item.id) ? item.id : null;
              if (!cleanExp || !expId) { bad++; continue; }
              if (!plan.expense_records.some(r => r.id === expId)) {
                plan.expense_records.push({ id: expId, data: cleanExp });
              }
            }
            continue;
          }
        }
        const clean = SANITIZERS[c](o);
        const id = typeof o?.id === 'string' && /^[\w-]{1,80}$/.test(o.id) ? o.id : null;
        const resolvedId = docIdFor(c, o, id);
        if (!clean || !resolvedId) { bad++; continue; }
        if (!plan[c].some(r => r.id === resolvedId)) {
          plan[c].push({ id: resolvedId, data: clean });
        }
      }
    }
    // ตรวจว่ามีอยู่แล้วกี่รายการ (กันนำเข้าซ้ำ)
    for (const c of Object.keys(plan)) {
      if (!plan[c].length) continue;
      const have = new Set((await getDocs(userCol(state.uid, c))).docs.map(d => d.id));
      plan[c].forEach(r => { r.exists = have.has(r.id); });
    }
    parsed = plan;
    box.innerHTML = `<p class="font-semibold">ไฟล์สำรองวันที่ ${esc(json.exportDate || '-')} (v${esc(json.version || '?')})</p>
      <table class="text-xs"><tbody>${Object.entries(plan).filter(([, l]) => l.length).map(([c, l]) => `<tr><td class="pr-4">${COLLECTION_LABELS[c]}</td><td class="pr-4">ทั้งหมด ${l.length}</td><td class="pr-4 text-green-700">ใหม่ ${l.filter(r => !r.exists).length}</td><td class="text-amber-700">มีอยู่แล้ว ${l.filter(r => r.exists).length}</td></tr>`).join('') || '<tr><td>ไม่พบข้อมูลที่นำเข้าได้</td></tr>'}</tbody></table>
      ${bad ? `<p class="text-xs text-amber-700">ข้าม ${bad} รายการที่รูปแบบไม่ถูกต้อง</p>` : ''}
      <label class="block text-xs"><input type="radio" name="bk-mode" value="skip" checked> เพิ่มเฉพาะรายการใหม่ (แนะนำ — ไม่ทับของเดิม)</label>
      <label class="block text-xs"><input type="radio" name="bk-mode" value="overwrite"> เขียนทับรายการที่มีอยู่ด้วยข้อมูลในไฟล์</label>
      <p class="text-xs text-slate-500">จะนำเข้าเฉพาะหมวดที่ติ๊กไว้ด้านบน</p>
      <button id="bk-go" class="btn btn-primary">เริ่มกู้คืน</button>`;
    $('#bk-go', box).addEventListener('click', () => restore(el, box));
  } catch (e) { parsed = null; box.innerHTML = `<p class="text-rose-600">${esc(e.message)}</p>`; }
}

async function restore(el, box) {
  if (!navigator.onLine) return toast('ต้องออนไลน์ระหว่างกู้คืน', 'err');
  const mode = box.querySelector('input[name="bk-mode"]:checked').value;
  const cols = selected(el);
  const rows = cols.flatMap(c => (parsed[c] || []).filter(r => mode === 'overwrite' || !r.exists).map(r => ({ c, ...r })));
  if (!rows.length) return toast('ไม่มีรายการที่ต้องนำเข้า');
  if (!confirm(`นำเข้า ${rows.length} รายการ${mode === 'overwrite' ? ' (รวมเขียนทับของเดิม)' : ''} ยืนยันหรือไม่?`)) return;
  try {
    for (let i = 0; i < rows.length; i += 400) {
      const b = writeBatch(db);
      rows.slice(i, i + 400).forEach(r => b.set(userDoc(state.uid, r.c, r.id), r.data));
      await b.commit();
    }
    toast(`กู้คืนสำเร็จ ${rows.length} รายการ`);
    box.classList.add('hidden'); parsed = null;
  } catch (e) { toast('กู้คืนไม่สำเร็จ: ' + e.message, 'err'); }
}
