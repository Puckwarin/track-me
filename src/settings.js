import { $, toast } from './util.js';
import { getGeminiKey, setGeminiKey, getGroqKey, setGroqKey, testGeminiConnection, testGroqConnection, explainGeminiError } from './nutrition.js';
import { getUsdaKey, setUsdaKey, testUsdaConnection } from './foodsearch.js';
import { mountProfile } from './profile.js';
import { mountBackup } from './backup.js';
import { mountMigrate } from './migrate.js';
import { checkReminder, REMIND_OPTIONS, getPeriodRemindDays, setPeriodRemindDays } from './period.js';
import { signOutUser, lockCurrentApp } from './auth.js';
import { state } from './state.js';
import { applyTheme, THEMES } from './theme.js';
import { hasDevicePin, saveDevicePin, removeDevicePin } from './local-lock.js';
import {
  hasEnvVapidKey,
  getVapidPublicKey,
  setVapidPublicKey,
  isIosDevice,
  isStandalonePwa,
  getPushStatus,
  enablePushNotifications,
  disablePushForThisDevice,
  syncPeriodRemindToPush,
  sendTestLocalNotification
} from './push.js';

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  window.dispatchEvent(new Event('trackme:install-ready'));
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  window.dispatchEvent(new Event('trackme:install-ready'));
});

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
      <p class="text-xs text-slate-500">เลือก Cozy, Pastel หรือ Dark mode เก็บการตั้งค่าไว้ในอุปกรณ์นี้</p>
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

    <div id="st-push-card" class="card space-y-3">
      <h3 class="font-bold text-slate-800"><i class="fa-solid fa-bell text-pink-500"></i> การแจ้งเตือนอัตโนมัติ (08:00 น.) & รอบเดือน</h3>
      <p class="text-xs text-slate-500">รับ Web Push แจ้งเตือน Planner, ตารางนัด และรอบเดือนทุกเช้าเวลา 08:00 น. แม้ไม่ได้เปิดแอปค้างไว้ (ส่งผ่าน GitHub Actions ฟรี)</p>
      <div>
        <label class="lbl">แจ้งเตือนรอบเดือนล่วงหน้า</label>
        <select id="st-remind" class="input">${REMIND_OPTIONS.map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}</select>
      </div>
      <div id="st-ios-guide" class="hidden rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
        📱 <b>สำหรับ iPhone / iPad (iOS 16.4+):</b> กรุณากดปุ่ม <b>แชร์ (Share)</b> → <b>เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)</b> แล้วเปิดแอปจากไอคอนบนหน้าจอก่อนจึงจะกดเปิดรับการแจ้งเตือนได้
      </div>
      <div id="st-vapid-wrap" class="hidden space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <label class="lbl !mb-0">VAPID Public Key (ใส่กรณีไม่ได้ตั้งใน GitHub Secrets)</label>
        <div class="flex gap-2">
          <input id="st-vapid" class="input text-xs flex-1" placeholder="วาง VAPID Public Key ที่สร้างจาก web-push">
          <button type="button" id="st-vapid-save" class="btn btn-soft text-xs whitespace-nowrap">บันทึกคีย์</button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" id="st-push-enable" class="btn btn-primary"><i class="fa-solid fa-bell"></i> เปิดรับการแจ้งเตือน</button>
        <button type="button" id="st-push-disable" class="btn btn-ghost hidden">ปิดเครื่องนี้</button>
        <button type="button" id="st-push-test" class="btn btn-soft">ทดสอบแจ้งเตือน</button>
        <button type="button" id="st-pwa-install" class="btn btn-soft hidden"><i class="fa-solid fa-mobile-screen-button"></i> ติดตั้งเป็นแอป</button>
      </div>
      <p id="st-notif-state" class="text-xs text-slate-500"></p>
    </div>

    <div class="card space-y-3" id="st-backup"></div>
    <div class="card space-y-3 lg:col-span-2" id="st-migrate"></div>
    <div class="card space-y-4 lg:col-span-2" id="st-api-keys">
      <header><h3 class="font-bold text-slate-800"><i class="fa-solid fa-key text-brand"></i> คีย์เชื่อมต่อ (ตัวเลือก)</h3><p class="text-xs text-slate-500 mt-1">จัดคีย์ที่นี่เป็นหมวดเดียวกัน · เก็บเฉพาะเบราว์เซอร์อุปกรณ์นี้ ไม่ซิงค์และไม่อยู่ในไฟล์สำรอง</p></header>
      <section class="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-2"><h4 class="font-semibold text-sm"><i class="fa-solid fa-wand-magic-sparkles text-violet-500"></i> Gemini</h4><p class="text-xs text-slate-500">ใช้ถ่ายรูปอาหาร/ฉลาก สแกนซองอาหารสัตว์เลี้ยง อ่านผลตรวจ และประมาณโภชนาการ · ตั้งค่าได้ใน Google AI Studio</p><input type="password" id="st-key" class="input" placeholder="Gemini API Key" autocomplete="off"><div class="flex flex-wrap gap-2"><button id="st-key-save" class="btn btn-primary">บันทึกคีย์ Gemini</button><button id="st-key-test" class="btn btn-soft">ทดสอบการเชื่อมต่อ</button></div><p id="st-key-status" class="text-xs text-slate-500"></p></section>
      <section class="rounded-xl border border-orange-100 bg-orange-50/40 p-3 space-y-2"><h4 class="font-semibold text-sm">Groq Vision (สำรอง)</h4><p class="text-xs text-slate-500">สลับมาใช้เมื่อ Gemini ใช้ไม่ได้/โควตาเต็ม · ฟรีตาม rate limit และเงื่อนไขปัจจุบันของผู้ให้บริการ</p><input type="password" id="st-groq" class="input" placeholder="Groq API Key" autocomplete="off"><div class="flex flex-wrap gap-2"><button id="st-groq-save" class="btn btn-primary">บันทึกคีย์ Groq</button><button id="st-groq-test" class="btn btn-soft">ทดสอบการเชื่อมต่อ</button></div><p id="st-groq-status" class="text-xs text-slate-500"></p></section>
      <p class="text-xs text-amber-700">คีย์เก็บในเบราว์เซอร์นี้เท่านั้น แต่คำขอภาพ/ข้อความจะส่งตรงไปยังผู้ให้บริการตามลำดับ Gemini → Groq เมื่อแหล่งก่อนหน้าล้มเหลว กรุณาตรวจนโยบายข้อมูลและโควตาของแต่ละรายก่อนใช้รูปส่วนตัว</p>
      <section class="rounded-xl border border-sky-100 bg-sky-50/40 p-3 space-y-2"><h4 class="font-semibold text-sm"><i class="fa-solid fa-database text-sky-500"></i> USDA FoodData Central</h4><p class="text-xs text-slate-500">ใช้ค้นหาวัตถุดิบ · ขอ API key ฟรีที่ <a class="underline" href="https://fdc.nal.usda.gov/api-key-signup/" target="_blank" rel="noopener noreferrer">fdc.nal.usda.gov</a></p><input type="password" id="st-usda" class="input" placeholder="USDA API Key" autocomplete="off"><div class="flex flex-wrap gap-2"><button id="st-usda-save" class="btn btn-primary">บันทึกคีย์ USDA</button><button id="st-usda-test" class="btn btn-soft">ทดสอบการเชื่อมต่อ</button></div><p id="st-usda-status" class="text-xs text-slate-500"></p></section>
      <p class="text-xs text-slate-500">Google Search เปิดแยกเป็นลิงก์; Google Custom Search API ปิดรับผู้ใช้ใหม่. ChatGPT API ไม่รวมในแผน ChatGPT ฟรีและอาจมีค่าใช้จ่าย จึงไม่เรียกจากแอปนี้ · ไม่มีการสร้างหรือใส่คีย์ให้แทน</p>
    </div>
  </div>`;
  $('#st-key', el).value = getGeminiKey();
  $('#st-key-save', el).addEventListener('click', () => { setGeminiKey($('#st-key', el).value); $('#st-key-status', el).textContent = ''; toast('บันทึกคีย์ Gemini แล้ว'); });
  $('#st-key-test', el).addEventListener('click', async () => {
    const val = $('#st-key', el).value.trim();
    if (val) setGeminiKey(val);
    const st = $('#st-key-status', el), btn = $('#st-key-test', el);
    btn.disabled = true; st.className = 'text-xs text-slate-500'; st.textContent = 'กำลังทดสอบโมเดล Gemini...';
    try {
      const res = await testGeminiConnection();
      st.className = 'text-xs text-green-700';
      st.textContent = `เชื่อมต่อสำเร็จ (ใช้โมเดล ${res.model})`;
    } catch (e) {
      st.className = 'text-xs text-rose-600';
      st.textContent = explainGeminiError(e);
    } finally { btn.disabled = false; }
  });
  $('#st-groq', el).value = getGroqKey();
  $('#st-groq-save', el).addEventListener('click', () => { setGroqKey($('#st-groq', el).value); $('#st-groq-status', el).textContent = ''; toast('บันทึกคีย์ Groq แล้ว'); });
  $('#st-groq-test', el).addEventListener('click', async () => {
    const val = $('#st-groq', el).value.trim();
    if (val) setGroqKey(val);
    const st = $('#st-groq-status', el), btn = $('#st-groq-test', el);
    btn.disabled = true; st.className = 'text-xs text-slate-500'; st.textContent = 'กำลังทดสอบการเชื่อมต่อ Groq...';
    try {
      const res = await testGroqConnection();
      st.className = 'text-xs text-green-700';
      st.textContent = `เชื่อมต่อสำเร็จ (โมเดล ${res.model})`;
    } catch (e) {
      st.className = 'text-xs text-rose-600';
      st.textContent = e.message === 'NO_KEY' ? 'ยังไม่ได้ใส่ Groq API Key' : (e.invalidKey ? 'คีย์ Groq ไม่ถูกต้องหรือไม่มีสิทธิ์: ' + e.message : 'เชื่อมต่อ Groq ไม่สำเร็จ: ' + e.message);
    } finally { btn.disabled = false; }
  });
  $('#st-out', el).addEventListener('click', signOutUser);
  $('#st-usda', el).value = getUsdaKey();
  $('#st-usda-save', el).addEventListener('click', () => { setUsdaKey($('#st-usda', el).value); $('#st-usda-status', el).textContent = ''; toast('บันทึกคีย์ USDA แล้ว'); });
  $('#st-usda-test', el).addEventListener('click', async () => {
    const val = $('#st-usda', el).value.trim();
    if (val) setUsdaKey(val);
    const st = $('#st-usda-status', el), btn = $('#st-usda-test', el);
    btn.disabled = true; st.className = 'text-xs text-slate-500'; st.textContent = 'กำลังทดสอบการเชื่อมต่อ USDA...';
    try {
      const res = await testUsdaConnection();
      st.className = 'text-xs text-green-700';
      st.textContent = `เชื่อมต่อสำเร็จ (พบฐานข้อมูล ${res.totalHits.toLocaleString()} รายการ)`;
    } catch (e) {
      st.className = 'text-xs text-rose-600';
      st.textContent = e.message || 'เชื่อมต่อ USDA ไม่สำเร็จ';
    } finally { btn.disabled = false; }
  });
  mountProfile($('#st-profile', el));
  const theme = $('#st-theme', el);
  const savedTheme = localStorage.getItem('trackme-theme');
  theme.value = savedTheme === 'minimal' ? 'cozy' : (savedTheme && Object.hasOwn(THEMES, savedTheme) ? savedTheme : 'cozy');
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
  sel.value = String(getPeriodRemindDays());
  sel.addEventListener('change', () => {
    setPeriodRemindDays(sel.value);
    checkReminder();
    syncPeriodRemindToPush();
    window.dispatchEvent(new Event('trackme:data-change'));
  });
  window.addEventListener('trackme:reminders', () => { if (sel.isConnected) sel.value = String(getPeriodRemindDays()); });

  const ns = $('#st-notif-state', el);
  const enableBtn = $('#st-push-enable', el);
  const disableBtn = $('#st-push-disable', el);
  const vapidWrap = $('#st-vapid-wrap', el);
  const vapidInput = $('#st-vapid', el);
  const iosGuide = $('#st-ios-guide', el);
  const installBtn = $('#st-pwa-install', el);

  const updateInstallBtn = () => {
    if (!installBtn?.isConnected) return;
    installBtn.classList.toggle('hidden', !deferredInstallPrompt || isStandalonePwa());
  };
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch (e) {}
    deferredInstallPrompt = null;
    updateInstallBtn();
  });
  window.addEventListener('trackme:install-ready', updateInstallBtn);
  updateInstallBtn();

  if (vapidInput) vapidInput.value = hasEnvVapidKey() ? '' : getVapidPublicKey();
  if (vapidWrap) vapidWrap.classList.toggle('hidden', hasEnvVapidKey());
  $('#st-vapid-save', el).addEventListener('click', () => {
    setVapidPublicKey(vapidInput.value);
    toast('บันทึก VAPID Public Key แล้ว');
    showPushStatus();
  });

  const showPushStatus = async () => {
    if (!ns?.isConnected) return;
    const st = await getPushStatus();
    if (!ns.isConnected) return;
    if (iosGuide) iosGuide.classList.toggle('hidden', !(isIosDevice() && !isStandalonePwa()));
    if (!st.supported) {
      ns.className = 'text-xs text-slate-500';
      ns.textContent = st.needsIosInstall
        ? 'ต้องเพิ่มแอปลงหน้าจอโฮม (Add to Home Screen) ก่อนเปิดรับแจ้งเตือนบน iOS'
        : 'เบราว์เซอร์นี้ไม่รองรับ Web Push Notification (ต้องเปิดผ่าน HTTPS)';
      disableBtn.classList.add('hidden');
      return;
    }
    if (st.subscribedHere) {
      ns.className = 'text-xs text-green-700 font-medium';
      ns.textContent = `✅ เปิดรับแจ้งเตือน 08:00 น. บนอุปกรณ์นี้แล้ว (ลงทะเบียนรวม ${st.totalDevices} อุปกรณ์)`;
      enableBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> อัปเดตการรับแจ้งเตือน';
      disableBtn.classList.remove('hidden');
    } else {
      const permMsg = st.permission === 'denied' ? 'ถูกบล็อกในเบราว์เซอร์ (เปิดอนุญาตใน Settings ก่อน)' : 'ยังไม่ได้เปิดรับแจ้งเตือนบนเครื่องนี้';
      ns.className = st.permission === 'denied' ? 'text-xs text-rose-600' : 'text-xs text-slate-500';
      ns.textContent = `สถานะ: ${permMsg}${st.totalDevices ? ` · มีอุปกรณ์อื่นลงทะเบียนไว้ ${st.totalDevices} เครื่อง` : ''}`;
      enableBtn.innerHTML = '<i class="fa-solid fa-bell"></i> เปิดรับการแจ้งเตือน';
      disableBtn.classList.toggle('hidden', st.totalDevices === 0);
    }
  };

  enableBtn.addEventListener('click', async () => {
    enableBtn.disabled = true;
    try {
      const customKey = !hasEnvVapidKey() ? vapidInput?.value.trim() : '';
      await enablePushNotifications(customKey);
      toast('เปิดรับการแจ้งเตือน 08:00 น. เรียบร้อยแล้ว 🔔');
      await showPushStatus();
    } catch (err) {
      if (vapidWrap && err.message.includes('VAPID')) vapidWrap.classList.remove('hidden');
      toast(err.message, 'err');
      await showPushStatus();
    } finally {
      enableBtn.disabled = false;
    }
  });

  disableBtn.addEventListener('click', async () => {
    disableBtn.disabled = true;
    try {
      await disablePushForThisDevice();
      toast('ปิดรับการแจ้งเตือนสำหรับเครื่องนี้แล้ว');
      await showPushStatus();
    } catch (err) {
      toast('ดำเนินการไม่สำเร็จ: ' + err.message, 'err');
    } finally {
      disableBtn.disabled = false;
    }
  });

  $('#st-push-test', el).addEventListener('click', async () => {
    try {
      await sendTestLocalNotification();
      toast('ส่งการแจ้งเตือนทดสอบแล้ว');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  window.addEventListener('trackme:push-change', showPushStatus);
  showPushStatus();
  mountBackup($('#st-backup', el));
  mountMigrate($('#st-migrate', el));
}

export function refreshAccount() {
  const el = $('#st-user');
  if (el) el.textContent = state.user ? `${state.user.displayName || ''} ${state.user.email ? '(' + state.user.email + ')' : ''}` : '';
}
