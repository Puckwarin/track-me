import { $, toast } from './util.js';
import { getGeminiKey, setGeminiKey } from './nutrition.js';
import { getUsdaKey, setUsdaKey } from './foodsearch.js';
import { mountProfile } from './profile.js';
import { mountBackup } from './backup.js';
import { mountMigrate } from './migrate.js';
import { checkReminder } from './period.js';
import { signOutUser, lockCurrentApp } from './auth.js';
import { state } from './state.js';
import { applyTheme, THEMES } from './theme.js';
import { hasDevicePin, saveDevicePin, removeDevicePin } from './local-lock.js';

export function mountSettings(el) {
  el.innerHTML = `
  <div class="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-user text-brand"></i> บัญชี</h3>
      <p id="st-user" class="text-sm text-slate-600"></p>
      <button id="st-out" class="btn btn-ghost">ออกจากระบบ</button>
    </div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-palette text-brand"></i> ธีมแอป</h3>
      <p class="text-xs text-slate-500">เลือกสีพาสเทล มินิมอล หรือโหมดมืด เก็บการตั้งค่าไว้ในอุปกรณ์นี้</p>
      <select id="st-theme" class="input">${Object.entries(THEMES).map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}</select>
    </div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-lock text-brand"></i> ล็อกแอปด้วย PIN</h3>
      <p class="text-xs text-slate-500">ใช้ PIN 4 หลักล็อกหน้าจอเมื่อให้คนอื่นยืมมือถือ · PIN เก็บเฉพาะอุปกรณ์นี้ และไม่ได้เข้ารหัสข้อมูลในบัญชี</p>
      <div class="grid grid-cols-2 gap-2"><input id="st-pin" type="password" inputmode="numeric" maxlength="4" class="input text-center tracking-[.4em]" placeholder="PIN 4 หลัก"><input id="st-pin-confirm" type="password" inputmode="numeric" maxlength="4" class="input text-center tracking-[.4em]" placeholder="ยืนยัน PIN"></div>
      <div class="flex flex-wrap gap-2"><button id="st-pin-save" class="btn btn-primary">ตั้ง / เปลี่ยน PIN</button><button id="st-lock-now" class="btn btn-soft">ล็อกตอนนี้</button><button id="st-pin-remove" class="btn btn-ghost">ปิด PIN</button></div>
      <p id="st-pin-state" class="text-xs text-slate-500"></p>
    </div>

    <div class="card space-y-3 lg:col-span-2" id="st-profile"></div>

    <div class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-bell text-pink-500"></i> เตือนรอบเดือน</h3>
      <p class="text-xs text-slate-500">แสดงแบนเนอร์เตือน (และการแจ้งเตือนของเครื่องถ้าอนุญาต) <b>เมื่อเปิดแอป</b> — เตือนตอนปิดแอปไม่ได้ เพราะต้องใช้เซิร์ฟเวอร์แบบเสียเงิน · ตั้งค่านี้เก็บในเครื่องนี้</p>
      <select id="st-remind" class="input"><option value="0">ปิด</option><option value="1">เตือนล่วงหน้า 1 วัน</option><option value="2">เตือนล่วงหน้า 2 วัน</option><option value="3">เตือนล่วงหน้า 3 วัน</option></select>
      <button id="st-notif" class="btn btn-soft">อนุญาตการแจ้งเตือนของเครื่อง</button>
      <p id="st-notif-state" class="text-xs text-slate-400"></p>
    </div>

    <div class="card space-y-3" id="st-backup"></div>
    <div class="card space-y-3 lg:col-span-2" id="st-migrate"></div>
    <div class="card space-y-4 lg:col-span-2" id="st-api-keys">
      <header><h3 class="font-bold text-slate-800"><i class="fa-solid fa-key text-brand"></i> คีย์เชื่อมต่อ (ตัวเลือก)</h3><p class="text-xs text-slate-500 mt-1">จัดคีย์ที่นี่เป็นหมวดเดียวกัน · เก็บเฉพาะเบราว์เซอร์อุปกรณ์นี้ ไม่ซิงค์และไม่อยู่ในไฟล์สำรอง</p></header>
      <section class="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-2"><h4 class="font-semibold text-sm"><i class="fa-solid fa-wand-magic-sparkles text-violet-500"></i> Gemini</h4><p class="text-xs text-slate-500">ใช้ถ่ายรูปอาหาร/ฉลากและประมาณโภชนาการ · ตั้งค่าได้ใน Google AI Studio · ใช้โควตาฟรีเมื่อมีให้บริการ</p><input type="password" id="st-key" class="input" placeholder="Gemini API Key" autocomplete="off"><button id="st-key-save" class="btn btn-primary">บันทึกคีย์ Gemini</button></section>
      <section class="rounded-xl border border-sky-100 bg-sky-50/40 p-3 space-y-2"><h4 class="font-semibold text-sm"><i class="fa-solid fa-database text-sky-500"></i> USDA FoodData Central</h4><p class="text-xs text-slate-500">ใช้ค้นหาวัตถุดิบ · ขอ API key ฟรีที่ <a class="underline" href="https://fdc.nal.usda.gov/api-key-signup/" target="_blank" rel="noopener noreferrer">fdc.nal.usda.gov</a></p><input type="password" id="st-usda" class="input" placeholder="USDA API Key" autocomplete="off"><button id="st-usda-save" class="btn btn-primary">บันทึกคีย์ USDA</button></section>
      <p class="text-xs text-slate-500">Google Search เปิดแยกเป็นลิงก์; Google Custom Search API ปิดรับผู้ใช้ใหม่. ChatGPT API ไม่รวมในแผน ChatGPT ฟรีและอาจมีค่าใช้จ่าย จึงไม่เรียกจากแอปนี้ · ไม่มีการสร้างหรือใส่คีย์ให้แทน</p>
    </div>
  </div>`;
  $('#st-key', el).value = getGeminiKey();
  $('#st-key-save', el).addEventListener('click', () => { setGeminiKey($('#st-key', el).value); toast('บันทึกคีย์แล้ว'); });
  $('#st-out', el).addEventListener('click', signOutUser);
  $('#st-usda', el).value = getUsdaKey();
  $('#st-usda-save', el).addEventListener('click', () => { setUsdaKey($('#st-usda', el).value); toast('บันทึกคีย์ USDA แล้ว'); });
  mountProfile($('#st-profile', el));
  const theme = $('#st-theme', el);
  theme.value = localStorage.getItem('trackme-theme') || 'pastel';
  theme.addEventListener('change', () => applyTheme(theme.value));
  const pinState = $('#st-pin-state', el), updatePinState = () => { const active = hasDevicePin(state.uid); pinState.textContent = active ? 'เปิดใช้ PIN บนอุปกรณ์นี้แล้ว' : 'ยังไม่ได้ตั้ง PIN'; $('#st-lock-now', el).disabled = !active; $('#st-pin-remove', el).disabled = !active; };
  $('#st-pin-save', el).addEventListener('click', async () => {
    const pin = $('#st-pin', el).value, confirmPin = $('#st-pin-confirm', el).value;
    if (!/^\d{4}$/.test(pin)) return toast('PIN ต้องเป็นตัวเลข 4 หลัก', 'err');
    if (pin !== confirmPin) return toast('PIN ทั้งสองช่องไม่ตรงกัน', 'err');
    try { await saveDevicePin(state.uid, pin); $('#st-pin', el).value = ''; $('#st-pin-confirm', el).value = ''; updatePinState(); toast('ตั้ง PIN บนอุปกรณ์นี้แล้ว'); }
    catch (error) { toast('ตั้ง PIN ไม่สำเร็จ: ' + error.message, 'err'); }
  });
  $('#st-lock-now', el).addEventListener('click', lockCurrentApp);
  $('#st-pin-remove', el).addEventListener('click', () => { if (confirm('ปิด PIN บนอุปกรณ์นี้?')) { removeDevicePin(state.uid); updatePinState(); toast('ปิด PIN แล้ว'); } });
  updatePinState();
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
