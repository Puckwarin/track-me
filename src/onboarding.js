import { setDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state } from './state.js';
import { isPreviewMode } from './preview.js';
import { $, toast, trapFocus } from './util.js';
import { iconSvg, iconBubble } from './icons.js';
import { ACTIVITY, GOAL_PRESETS, refreshProfile } from './profile.js';
import {
  getGeminiKey, setGeminiKey, testGeminiConnection,
  getGroqKey, setGroqKey, testGroqConnection,
  getOpenRouterKey, setOpenRouterKey, testOpenRouterConnection
} from './nutrition.js';
import { enablePushNotifications } from './push.js';
import {
  createOnboardingProgressStore,
  ONBOARDING_STEP_COUNT,
  runNotificationSetup,
  shouldShowOnboarding,
  validateOnboardingProfile
} from './onboardingState.js';

const storage = {
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value)
};
const progressStore = createOnboardingProgressStore(storage);
const AI_PROVIDERS = {
  gemini: {
    label: 'Gemini',
    getKey: getGeminiKey,
    setKey: setGeminiKey,
    test: testGeminiConnection,
    url: 'https://aistudio.google.com/apikey',
    urlLabel: 'Google AI Studio'
  },
  groq: {
    label: 'Groq',
    getKey: getGroqKey,
    setKey: setGroqKey,
    test: testGroqConnection,
    url: 'https://console.groq.com/keys',
    urlLabel: 'Groq Console'
  },
  openrouter: {
    label: 'OpenRouter',
    getKey: getOpenRouterKey,
    setKey: setOpenRouterKey,
    test: testOpenRouterConnection,
    url: 'https://openrouter.ai/keys',
    urlLabel: 'OpenRouter'
  }
};

let activeUid = null;
let currentStep = 1;
let profileDraft = {};
let aiDrafts = {};
let selectedAiProvider = 'gemini';
let releaseFocusTrap = () => {};
let escHandler = null;
let triggerEl = null;

function cleanupAccessibilityHandlers() {
  releaseFocusTrap();
  releaseFocusTrap = () => {};
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
}

function setStatus(element, message, kind = 'info') {
  element.className = `text-xs ${kind === 'error' ? 'text-rose-600' : kind === 'success' ? 'text-green-700' : 'text-slate-500'}`;
  element.textContent = message;
}

function persistStep(step) {
  if (!progressStore.setStep(activeUid, step)) {
    toast('บันทึกความคืบหน้าไม่ได้ อาจแสดงหน้านี้อีกครั้งเมื่อเปิดแอปใหม่', 'err');
  }
  currentStep = step;
  render();
}

function advance() {
  if (currentStep < ONBOARDING_STEP_COUNT) persistStep(currentStep + 1);
}

function render() {
  cleanupAccessibilityHandlers();
  const root = $('#onboarding-root');
  const year = new Date().getFullYear();
  const progressPercent = Math.round(currentStep / ONBOARDING_STEP_COUNT * 100);
  const welcomeIllustration = `
    <div class="w-16 h-16 rounded-2xl bg-sky-soft/80 border border-sky-200/80 flex items-center justify-center text-brand-dark" aria-hidden="true">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="17" fill="#E8F4FE" stroke="#93CEFA" stroke-width="1.5"/>
        <path d="M20 30s-9-5.6-11.5-11.1C6.5 14.6 9.3 10.5 13.8 10.5c2.6 0 4.7 1.35 6.2 3.35 1.5-2 3.6-3.35 6.2-3.35 4.5 0 7.3 4.1 5.3 8.4C29 24.4 20 30 20 30Z" fill="#BAE2FF" stroke="#276594" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M13.2 19h2.8l1.9-3.2 2.4 5.8 1.9-2.6h4.6" stroke="#276594" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>`;
  const readyIllustration = `
    <div class="w-16 h-16 mx-auto rounded-2xl bg-ok-soft border border-emerald-200 flex items-center justify-center text-emerald-700" aria-hidden="true">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="17" fill="#DCFCE7" stroke="#86EFAC" stroke-width="1.5"/>
        <path d="M13 20.5 17.8 25 27.5 15" stroke="#15803D" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>`;
  const stepContent = [
    `<div class="space-y-4">
      ${welcomeIllustration}
      <h2 id="onboarding-title" class="text-xl font-bold text-slate-800">ยินดีต้อนรับสู่ Track Me</h2>
      <p class="text-sm text-slate-600">ดูแลตัวเองได้ในที่เดียว ทั้งอาหาร สุขภาพ การออกกำลังกาย การเงิน และการดูแลสัตว์เลี้ยง</p>
      <ul class="grid grid-cols-2 gap-2 text-xs text-slate-700">
        <li class="rounded-xl bg-lav-soft/60 p-3 flex items-center gap-2">${iconBubble('food', { small: true, cat: 'cat-food' })}<span>บันทึกอาหารและโภชนาการ</span></li>
        <li class="rounded-xl bg-lav-soft/60 p-3 flex items-center gap-2">${iconBubble('period', { small: true, cat: 'cat-period' })}<span>สุขภาพและรอบเดือน</span></li>
        <li class="rounded-xl bg-lav-soft/60 p-3 flex items-center gap-2">${iconBubble('workout', { small: true, cat: 'cat-workout' })}<span>ออกกำลังกายและน้ำหนัก</span></li>
        <li class="rounded-xl bg-lav-soft/60 p-3 flex items-center gap-2">${iconBubble('care', { small: true, cat: 'cat-care' })}<span>สัตว์เลี้ยงและของใช้</span></li>
      </ul>
      <p class="text-xs text-slate-500">ตั้งค่าแต่ละอย่างได้ตามสะดวก หรือข้ามไปเริ่มใช้งานได้เลย</p>
    </div>`,
    `<div class="space-y-3">
      <h2 id="onboarding-title" class="text-xl font-bold text-slate-800">ตั้งค่าโปรไฟล์พื้นฐาน</h2>
      <p class="text-sm text-slate-600">ข้อมูลนี้ใช้คำนวณ BMI, BMR และเป้าหมายพลังงาน ไม่บังคับกรอก หากยังไม่สะดวกสามารถข้ามได้</p>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="lbl" for="onb-sex">เพศสำหรับสูตรคำนวณ</label><select id="onb-sex" class="input"><option value="">เลือกหรือข้าม</option><option value="female">หญิง</option><option value="male">ชาย</option></select></div>
        <div><label class="lbl" for="onb-birth">ปีเกิด (ค.ศ.)</label><input id="onb-birth" class="input" type="number" inputmode="numeric" min="${year - 100}" max="${year - 10}" placeholder="เช่น 1995"></div>
        <div><label class="lbl" for="onb-height">ส่วนสูง (ซม.)</label><input id="onb-height" class="input" type="number" inputmode="decimal" min="50" max="250" placeholder="เช่น 165"></div>
        <div><label class="lbl" for="onb-weight">น้ำหนัก (กก.)</label><input id="onb-weight" class="input" type="number" inputmode="decimal" min="15" max="500" placeholder="เช่น 60"></div>
        <div class="col-span-2"><label class="lbl" for="onb-activity">ระดับกิจกรรม</label><select id="onb-activity" class="input">${ACTIVITY.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
        <div class="col-span-2"><label class="lbl" for="onb-goal">เป้าหมายพลังงาน</label><select id="onb-goal" class="input">${GOAL_PRESETS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
      </div>
      <p id="onb-profile-status" class="text-xs text-rose-600" aria-live="polite"></p>
      <p class="text-[11px] text-slate-500">ค่าคำนวณเป็นค่าประมาณทั่วไป ไม่ใช่คำแนะนำทางการแพทย์</p>
    </div>`,
    `<div class="space-y-3">
      <h2 id="onboarding-title" class="text-xl font-bold text-slate-800">ตั้งค่า AI (ไม่บังคับ)</h2>
      <p class="text-sm text-slate-600">AI ช่วยอ่านฉลากอาหาร สรุปข้อมูล และค้นหาโภชนาการ ตั้งค่าคีย์จากผู้ให้บริการที่เลือกได้ หรือข้ามไปใช้ฟีเจอร์หลักโดยไม่ต้องใช้ AI</p>
      <div><label class="lbl" for="onb-ai-provider">ผู้ให้บริการ</label><select id="onb-ai-provider" class="input"><option value="gemini">Gemini</option><option value="groq">Groq</option><option value="openrouter">OpenRouter</option></select></div>
      <div><label class="lbl" for="onb-ai-key">API Key</label><input id="onb-ai-key" class="input" type="password" autocomplete="off" placeholder="วาง API Key ที่สร้างด้วยตนเอง"></div>
      <p class="text-xs text-slate-500">ขอคีย์ได้ที่ <a id="onb-ai-link" class="underline" target="_blank" rel="noopener noreferrer"></a> คีย์เก็บในเบราว์เซอร์อุปกรณ์นี้เท่านั้น ไม่ซิงค์และไม่อยู่ในไฟล์สำรอง</p>
      <p class="text-xs text-amber-700">โควตาและเงื่อนไขอาจเปลี่ยนแปลง ผู้ให้บริการบางรายอาจคิดค่าใช้จ่ายเมื่อเกินโควตาฟรี โปรดตรวจนโยบายและราคาเองก่อนใช้งาน การทดสอบจะเรียก API เมื่อกดปุ่มเท่านั้น</p>
      <div class="flex flex-wrap gap-2"><button id="onb-ai-save" class="btn btn-soft">บันทึกคีย์</button><button id="onb-ai-test" class="btn btn-primary">ทดสอบคีย์</button></div>
      <p id="onb-ai-status" class="text-xs text-slate-500" aria-live="polite"></p>
    </div>`,
    `<div class="space-y-4">
      <h2 id="onboarding-title" class="text-xl font-bold text-slate-800">การแจ้งเตือน (ไม่บังคับ)</h2>
      <p class="text-sm text-slate-600">เปิด Web Push เพื่อรับการเตือน Planner และนัดหมายเวลา 12:15 น. ระบบจะขอสิทธิ์จากเบราว์เซอร์เมื่อคุณกดปุ่มด้านล่างเท่านั้น</p>
      <div class="rounded-xl bg-sky-50 p-3 text-xs text-slate-600">ต้องใช้เบราว์เซอร์ที่รองรับและเปิดผ่าน HTTPS หากใช้ iPhone/iPad ต้องเพิ่มแอปลงหน้าจอโฮมก่อน การไม่อนุญาตยังสามารถใช้ Track Me ได้ตามปกติ</div>
      <button id="onb-push-enable" class="btn btn-primary">${iconSvg('notifications', { size: 15 })} เปิดการแจ้งเตือน</button>
      <p id="onb-push-status" class="text-xs text-slate-500" aria-live="polite"></p>
    </div>`,
    `<div class="space-y-4 text-center">
      ${readyIllustration}
      <h2 id="onboarding-title" class="text-xl font-bold text-slate-800">พร้อมเริ่มใช้งานแล้ว</h2>
      <p class="text-sm text-slate-600">คุณสามารถแก้ไขโปรไฟล์ คีย์ AI และการแจ้งเตือนได้ภายหลังในหน้า “ตั้งค่า”</p>
      <p class="rounded-xl bg-lav-soft/60 p-3 text-xs text-slate-600">ข้อมูลโปรไฟล์จะซิงค์กับบัญชีของคุณ ส่วนความคืบหน้า onboarding เก็บไว้ในอุปกรณ์นี้</p>
    </div>`
  ][currentStep - 1];

  root.innerHTML = `<div class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-3 sm:p-6">
    <section id="onb-dialog" class="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" tabindex="-1">
      <div class="mb-5 space-y-2">
        <div class="flex items-center justify-between text-xs text-slate-500"><span>เริ่มต้นใช้งาน</span><span>ขั้น ${currentStep} จาก ${ONBOARDING_STEP_COUNT}</span></div>
        <div class="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="ความคืบหน้า onboarding" aria-valuemin="1" aria-valuemax="${ONBOARDING_STEP_COUNT}" aria-valuenow="${currentStep}">
          <div class="h-full rounded-full bg-brand transition-all" style="width:${progressPercent}%"></div>
        </div>
      </div>
      ${stepContent}
      <div class="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <button id="onb-back" type="button" class="btn btn-ghost" ${currentStep === 1 ? 'disabled' : ''}>ย้อนกลับ</button>
        <div class="ml-auto flex flex-wrap justify-end gap-2">
          ${currentStep > 1 && currentStep < ONBOARDING_STEP_COUNT ? '<button id="onb-skip" type="button" class="btn btn-ghost">ข้ามขั้นตอนนี้</button>' : ''}
          <button id="onb-next" type="button" class="btn btn-primary">${currentStep === ONBOARDING_STEP_COUNT ? 'เริ่มใช้งาน' : 'ถัดไป'}</button>
        </div>
      </div>
    </section>
  </div>`;

  $('#onb-back', root).addEventListener('click', () => {
    if (currentStep > 1) persistStep(currentStep - 1);
  });
  $('#onb-skip', root)?.addEventListener('click', advance);
  $('#onb-next', root).addEventListener('click', handleNext);

  if (currentStep === 2) mountProfileFields(root);
  if (currentStep === 3) mountAiSetup(root);
  if (currentStep === 4) mountNotifications(root);

  const dialog = $('#onb-dialog', root);
  if (dialog) {
    releaseFocusTrap = trapFocus(dialog, { autoFocus: false });
  }
  escHandler = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (currentStep < ONBOARDING_STEP_COUNT) advance();
      else unmountOnboarding();
    }
  };
  document.addEventListener('keydown', escHandler);
  $('#onb-next', root).focus();
}

function mountProfileFields(root) {
  const fields = {
    sex: '#onb-sex',
    birthYear: '#onb-birth',
    heightCm: '#onb-height',
    weightKg: '#onb-weight',
    activity: '#onb-activity',
    adjust: '#onb-goal'
  };
  for (const [key, selector] of Object.entries(fields)) {
    $(selector, root).value = profileDraft[key] ?? (key === 'activity' ? 'light' : key === 'adjust' ? '0' : '');
    $(selector, root).addEventListener('input', () => { profileDraft[key] = $(selector, root).value; });
    $(selector, root).addEventListener('change', () => { profileDraft[key] = $(selector, root).value; });
  }
}

function mountAiSetup(root) {
  const providerSelect = $('#onb-ai-provider', root);
  const keyInput = $('#onb-ai-key', root);
  const link = $('#onb-ai-link', root);
  const status = $('#onb-ai-status', root);

  const updateProvider = () => {
    selectedAiProvider = providerSelect.value;
    const provider = AI_PROVIDERS[selectedAiProvider];
    keyInput.value = aiDrafts[selectedAiProvider] ?? provider.getKey();
    link.href = provider.url;
    link.textContent = provider.urlLabel;
    status.textContent = '';
  };
  providerSelect.value = selectedAiProvider;
  providerSelect.addEventListener('change', updateProvider);
  keyInput.addEventListener('input', () => { aiDrafts[selectedAiProvider] = keyInput.value; });
  updateProvider();

  $('#onb-ai-save', root).addEventListener('click', () => {
    try {
      AI_PROVIDERS[selectedAiProvider].setKey(keyInput.value);
      aiDrafts[selectedAiProvider] = keyInput.value.trim();
      setStatus(status, keyInput.value.trim() ? 'บันทึกคีย์ไว้ในเบราว์เซอร์อุปกรณ์นี้แล้ว' : 'ลบคีย์ที่บันทึกไว้ออกจากอุปกรณ์นี้แล้ว', 'success');
    } catch (error) {
      setStatus(status, 'บันทึกคีย์ไม่สำเร็จ: ' + error.message, 'error');
    }
  });
  $('#onb-ai-test', root).addEventListener('click', async event => {
    const provider = AI_PROVIDERS[selectedAiProvider];
    const button = event.currentTarget;
    if (!keyInput.value.trim()) {
      setStatus(status, 'ใส่ API Key ก่อนทดสอบ หรือข้ามขั้นตอนนี้ได้', 'error');
      return;
    }
    button.disabled = true;
    setStatus(status, `กำลังทดสอบ ${provider.label}...`);
    try {
      provider.setKey(keyInput.value);
      aiDrafts[selectedAiProvider] = keyInput.value.trim();
      const result = await provider.test();
      setStatus(status, `เชื่อมต่อสำเร็จ${result.model ? ` (โมเดล ${result.model})` : ''}`, 'success');
    } catch (error) {
      setStatus(status, error.message === 'NO_KEY' ? 'ยังไม่ได้ใส่ API Key' : `ทดสอบไม่สำเร็จ: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

function mountNotifications(root) {
  const button = $('#onb-push-enable', root);
  const status = $('#onb-push-status', root);
  button.addEventListener('click', async () => {
    button.disabled = true;
    setStatus(status, 'กำลังตั้งค่าการแจ้งเตือน...');
    const result = await runNotificationSetup(() => enablePushNotifications());
    if (result.ok) setStatus(status, 'เปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว', 'success');
    else setStatus(status, result.message || 'เปิดการแจ้งเตือนไม่สำเร็จ คุณยังข้ามขั้นตอนนี้ได้', 'error');
    button.disabled = false;
  });
}

function handleNext() {
  if (currentStep === 2) {
    const fields = {
      sex: $('#onb-sex').value,
      birthYear: $('#onb-birth').value,
      heightCm: $('#onb-height').value,
      weightKg: $('#onb-weight').value,
      activity: $('#onb-activity').value,
      adjust: $('#onb-goal').value
    };
    const result = validateOnboardingProfile(fields);
    if (!result.ok) {
      setStatus($('#onb-profile-status'), result.error, 'error');
      return;
    }
    if (result.profile) {
      const profile = { ...result.profile, updatedAt: new Date() };
      state.profile = { ...(state.profile || {}), ...profile };
      refreshProfile();
      setDoc(userDoc(activeUid, 'settings', 'profile'), profile, { merge: true })
        .catch(error => toast('บันทึกโปรไฟล์ไม่สำเร็จ: ' + error.message, 'err'));
    }
    advance();
    return;
  }
  if (currentStep === ONBOARDING_STEP_COUNT) {
    if (!progressStore.complete(activeUid)) {
      toast('บันทึกสถานะเสร็จสิ้นไม่ได้ อาจแสดง onboarding อีกครั้งเมื่อเปิดแอปใหม่', 'err');
    }
    unmountOnboarding();
    return;
  }
  advance();
}

export function mountOnboarding(user, profile) {
  const uid = user?.uid;
  if (!uid || isPreviewMode() || !shouldShowOnboarding({ uid, metadata: user.metadata, profile, progressStore })) {
    unmountOnboarding();
    return;
  }
  triggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeUid = uid;
  if (!progressStore.begin(uid)) {
    toast('เบราว์เซอร์ไม่อนุญาตให้บันทึกความคืบหน้า onboarding; หากปิดแอปอาจต้องเริ่มขั้นตอนใหม่', 'err');
  }
  currentStep = progressStore.read(uid)?.step || 1;
  profileDraft = {
    sex: profile?.sex || '',
    birthYear: profile?.birthYear ?? '',
    heightCm: profile?.heightCm ?? '',
    weightKg: profile?.weightKg ?? '',
    activity: profile?.activity || 'light',
    adjust: profile?.adjust ?? 0
  };
  aiDrafts = {};
  selectedAiProvider = 'gemini';
  $('#onboarding-root').classList.remove('hidden');
  render();
}

export function unmountOnboarding() {
  cleanupAccessibilityHandlers();
  const root = $('#onboarding-root');
  root.classList.add('hidden');
  root.replaceChildren();
  activeUid = null;
  if (triggerEl?.isConnected) triggerEl.focus();
  triggerEl = null;
}
