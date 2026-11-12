import { $, toast } from './util.js';
import { getGeminiKey, setGeminiKey } from './nutrition.js';
import { mountBackup } from './backup.js';
import { mountMigrate } from './migrate.js';
import { checkReminder } from './period.js';
import { signOutUser } from './auth.js';
import { state } from './state.js';

export function mountSettings(el) {
  el.innerHTML = `
  <div class="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-user text-brand"></i> บัญชี</h3>
      <p id="st-user" class="text-sm text-slate-600"></p>
      <button id="st-out" class="btn btn-ghost">ออกจากระบบ</button>
    </div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-wand-magic-sparkles text-brand"></i> Gemini API Key (ตัวเลือก)</h3>
      <p class="text-xs text-slate-500">ใช้กับฟีเจอร์ถ่ายรูปอาหาร/ฉลากและค้นหาโภชนาการ ขอคีย์ฟรีได้ที่ Google AI Studio (ไม่ต้องผูกบัตร) · คีย์เก็บ<b>เฉพาะในเบราว์เซอร์เครื่องนี้</b> ไม่ซิงค์ ไม่อยู่ในไฟล์สำรอง — ต้องใส่ในแต่ละอุปกรณ์เอง</p>
      <input type="password" id="st-key" class="input" placeholder="AIza..." autocomplete="off">
      <button id="st-key-save" class="btn btn-primary">บันทึกคีย์</button>
    </div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-bell text-pink-500"></i> เตือนรอบเดือน</h3>
      <p class="text-xs text-slate-500">แสดงแบนเนอร์เตือน (และการแจ้งเตือนของเครื่องถ้าอนุญาต) <b>เมื่อเปิดแอป</b> — เตือนตอนปิดแอปไม่ได้ เพราะต้องใช้เซิร์ฟเวอร์แบบเสียเงิน · ตั้งค่านี้เก็บในเครื่องนี้</p>
      <select id="st-remind" class="input"><option value="0">ปิด</option><option value="1">เตือนล่วงหน้า 1 วัน</option><option value="2">เตือนล่วงหน้า 2 วัน</option><option value="3">เตือนล่วงหน้า 3 วัน</option></select>
      <button id="st-notif" class="btn btn-soft">อนุญาตการแจ้งเตือนของเครื่อง</button>
      <p id="st-notif-state" class="text-xs text-slate-400"></p>
    </div>

    <div class="card space-y-3" id="st-backup"></div>
    <div class="card space-y-3 lg:col-span-2" id="st-migrate"></div>
  </div>`;
  $('#st-key', el).value = getGeminiKey();
  $('#st-key-save', el).addEventListener('click', () => { setGeminiKey($('#st-key', el).value); toast('บันทึกคีย์แล้ว'); });
  $('#st-out', el).addEventListener('click', signOutUser);
  const sel = $('#st-remind', el);
  sel.value = localStorage.getItem('remind_days') || '0';
  sel.addEventListener('change', () => { localStorage.setItem('remind_days', sel.value); localStorage.removeItem('reminder_dismissed'); checkReminder(); });
  const ns = $('#st-notif-state', el);
  const showNs = () => { ns.textContent = 'Notification' in window ? 'สถานะ: ' + ({ granted: 'อนุญาตแล้ว', denied: 'ถูกบล็อก (แก้ที่การตั้งค่าเบราว์เซอร์)', default: 'ยังไม่ได้อนุญาต' }[Notification.permission]) : 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'; };
  $('#st-notif', el).addEventListener('click', async () => { if ('Notification' in window) { await Notification.requestPermission(); showNs(); } });
  showNs();
  mountBackup($('#st-backup', el));
  mountMigrate($('#st-migrate', el));
}

export function refreshAccount() {
  const el = $('#st-user');
  if (el) el.textContent = state.user ? `${state.user.displayName || ''} ${state.user.email ? '(' + state.user.email + ')' : ''}` : '';
}
