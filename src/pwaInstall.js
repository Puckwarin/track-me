import { esc, openModal, toast } from './util.js';
import { iconSvg } from './icons.js';

let initialized = false;
let deferredInstallPrompt = null;
let installedInSession = false;

export function detectInstallPlatform(env) {
  const win = typeof window !== 'undefined' ? window : undefined;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const loc = typeof location !== 'undefined' ? location : undefined;

  const ua = String(env?.userAgent ?? nav?.userAgent ?? '');
  const platform = String(env?.platform ?? nav?.platform ?? '');
  const maxTouchPoints = Number(env?.maxTouchPoints ?? nav?.maxTouchPoints ?? 0);
  const standaloneMatch = env?.matchMedia
    ? Boolean(env.matchMedia('(display-mode: standalone)')?.matches)
    : Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches);
  const navStandalone = Boolean(env?.standalone ?? nav?.standalone);
  const isStandalone = standaloneMatch || navStandalone;

  let inIframe = false;
  if (typeof env?.inIframe === 'boolean') {
    inIframe = env.inIframe;
  } else if (win) {
    try {
      inIframe = win.self !== win.top;
    } catch {
      inIframe = true;
    }
  }

  const protocol = String(env?.protocol ?? loc?.protocol ?? '');
  const hostname = String(env?.hostname ?? loc?.hostname ?? '');
  const isSecureOrigin = protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';

  const isIos = /iphone|ipad|ipod/i.test(ua) || (/macintel/i.test(platform) && maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isInAppBrowser = /\b(Line|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|wv)\b/i.test(ua)
    || (isAndroid && /; wv\)/i.test(ua));
  const isEdge = /edg\//i.test(ua);
  const isFirefox = /firefox|fxios/i.test(ua);
  const isChrome = /chrome|crios/i.test(ua) && !isEdge && !/opr\//i.test(ua);
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios|edg\//i.test(ua);

  return {
    isStandalone,
    isIos,
    isAndroid,
    isInAppBrowser,
    isEdge,
    isFirefox,
    isChrome,
    isSafari,
    inIframe,
    isSecureOrigin
  };
}

export function buildInstallGuideContent(platform = detectInstallPlatform(), canPrompt = false) {
  if (platform.isStandalone) {
    return {
      headline: 'กำลังใช้งาน Track Me ในโหมดแอปแล้ว',
      badge: 'ติดตั้งแล้ว',
      note: 'แอปถูกเพิ่มบนอุปกรณ์นี้เรียบร้อยแล้วและพร้อมใช้งานเต็มหน้าจอ',
      steps: []
    };
  }

  if (canPrompt) {
    return {
      headline: 'พร้อมติดตั้ง Track Me เป็นแอป',
      badge: 'ติดตั้งอัตโนมัติได้',
      note: 'กดปุ่ม "ติดตั้งเป็นแอป" แล้วเลือก "ติดตั้ง (Install)" ในหน้าต่างยืนยันของเบราว์เซอร์',
      steps: [
        'กดปุ่ม "ติดตั้งเป็นแอป" ในหน้าการตั้งค่า',
        'ยืนยัน "ติดตั้ง / Install" ในหน้าต่างที่เบราว์เซอร์แสดงขึ้นมา',
        'เปิดใช้งานจากไอคอน Track Me บนหน้าจอหลักหรือเดสก์ท็อปได้ทันที'
      ]
    };
  }

  if (platform.isInAppBrowser) {
    return {
      headline: 'กรุณาเปิดในเบราว์เซอร์หลักก่อนติดตั้ง',
      badge: 'เปิดผ่านแอปอื่นอยู่',
      note: 'เบราว์เซอร์ภายในแอป (เช่น LINE, Facebook หรือ Instagram) ไม่รองรับการติดตั้งเป็นแอปโดยตรง',
      steps: [
        'แตะปุ่มเมนู ⋮ หรือไอคอน "แชร์ (Share)" ที่มุมหน้าจอ',
        platform.isIos
          ? 'เลือก "เปิดใน Safari" (Open in Safari)'
          : 'เลือก "เปิดในเบราว์เซอร์" / "Open in Chrome"',
        'กลับมาที่หน้า ตั้งค่า → การแจ้งเตือน แล้วกด "ติดตั้งเป็นแอป" อีกครั้ง'
      ]
    };
  }

  if (platform.isIos) {
    return {
      headline: 'วิธีติดตั้งบน iPhone / iPad',
      badge: 'iOS / iPadOS Safari',
      note: 'Apple กำหนดให้ติดตั้งเว็บแอปผ่านเมนู "เพิ่มไปยังหน้าจอโฮม" ของ Safari เพื่อรับแจ้งเตือนและเปิดเต็มหน้าจอ',
      steps: [
        platform.isSafari
          ? 'แตะปุ่ม "แชร์ (Share)" (ไอคอนสี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบเครื่องมือของ Safari'
          : 'เปิดหน้านี้ในแอป Safari แล้วแตะปุ่ม "แชร์ (Share)"',
        'เลื่อนลงแล้วเลือก "เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)"',
        'แตะ "เพิ่ม (Add)" ที่มุมขวาบน แล้วเปิด Track Me จากไอคอนบนหน้าจอโฮม'
      ]
    };
  }

  if (platform.isAndroid) {
    return {
      headline: 'วิธีติดตั้งบน Android',
      badge: platform.isEdge ? 'Android Edge' : 'Android Chrome',
      note: platform.inIframe
        ? 'หน้าต่างนี้เปิดอยู่ในกรอบพรีวิว — เปิดลิงก์แอปในแท็บเบราว์เซอร์โดยตรงเพื่อแสดงเมนูติดตั้ง'
        : 'หากเบราว์เซอร์ยังไม่แสดงป๊อปอัปติดตั้งอัตโนมัติ สามารถกดติดตั้งได้จากเมนูของเบราว์เซอร์โดยตรง',
      steps: [
        'แตะปุ่มเมนู ⋮ ที่มุมขวาบนของเบราว์เซอร์ (Chrome หรือ Edge)',
        'เลือก "ติดตั้งแอป (Install app)" หรือ "เพิ่มลงหน้าจอหลัก (Add to Home screen)"',
        'แตะยืนยัน "ติดตั้ง" เพื่อสร้างไอคอนแอปบนหน้าจอหลัก'
      ]
    };
  }

  if (platform.isFirefox) {
    return {
      headline: 'วิธีติดตั้ง Track Me บนคอมพิวเตอร์',
      badge: 'เบราว์เซอร์ปัจจุบันไม่รองรับ Auto-Install',
      note: 'Firefox เวอร์ชันเดสก์ท็อปยังไม่รองรับการติดตั้งเว็บแอปอัตโนมัติ แนะนำให้เปิดผ่าน Google Chrome หรือ Microsoft Edge',
      steps: [
        'คัดลอกลิงก์ของ Track Me แล้วเปิดใน Google Chrome หรือ Microsoft Edge',
        'คลิกไอคอน "ติดตั้ง (Install)" ทางด้านขวาของช่องใส่ URL',
        'ยืนยันการติดตั้ง เพื่อเปิดใช้งาน Track Me เป็นหน้าต่างแอปแยก'
      ]
    };
  }

  return {
    headline: 'วิธีติดตั้ง Track Me บนคอมพิวเตอร์',
    badge: platform.isEdge ? 'Microsoft Edge' : 'Google Chrome',
    note: platform.inIframe
      ? 'หน้าต่างนี้กำลังแสดงผลอยู่ในกรอบตัวอย่าง (iframe) เบราว์เซอร์จึงไม่แสดงปุ่มติดตั้งอัตโนมัติ กรุณาเปิดแอปในแท็บใหม่โดยตรงก่อน'
      : 'สามารถติดตั้งได้ทันทีจากแถบ URL หรือเมนูของเบราว์เซอร์ (หากเพิ่งกดยกเลิกไป เบราว์เซอร์จะซ่อนป๊อปอัปชั่วคราว)',
    steps: [
      platform.inIframe
        ? 'เปิด Track Me ในหน้าต่าง/แท็บเบราว์เซอร์หลัก (Chrome หรือ Edge)'
        : 'มองหาไอคอน "ติดตั้ง (Install)" (รูปหน้าจอมีลูกศรลง) ทางขวาสุดของแถบ URL',
      'หรือเปิดเมนู ⋮ มุมขวาบน → เลือก "แคสต์ บันทึก และแชร์ (Save and share)" → "ติดตั้ง Track Me"',
      'คลิก "ติดตั้ง (Install)" เพื่อเพิ่มแอปไว้บนเดสก์ท็อป/Dock'
    ]
  };
}

function emitInstallChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('trackme:install-ready'));
  }
}

export function initPwaInstall() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    emitInstallChange();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installedInSession = true;
    emitInstallChange();
    toast('ติดตั้งแอป Track Me เรียบร้อยแล้ว ✨');
  });

  try {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', () => emitInstallChange());
  } catch {}
}

export function getPwaInstallState(env) {
  const platform = detectInstallPlatform(env);
  const canPrompt = Boolean(deferredInstallPrompt) && !platform.isStandalone && !installedInSession;
  const alreadyInstalled = platform.isStandalone || installedInSession;

  let statusText = '';
  let buttonLabel = 'ติดตั้งเป็นแอป';

  if (alreadyInstalled) {
    statusText = 'ใช้งานในโหมดแอปแล้ว (ติดตั้งบนอุปกรณ์นี้แล้ว)';
  } else if (canPrompt) {
    statusText = 'เบราว์เซอร์พร้อมติดตั้ง — กดปุ่มเพื่อติดตั้ง Track Me เป็นแอป';
    buttonLabel = 'ติดตั้งเป็นแอป';
  } else if (platform.isInAppBrowser) {
    statusText = 'เปิดอยู่ในเบราว์เซอร์ภายในแอป — กดดูวิธีเปิดใน Safari / Chrome เพื่อติดตั้ง';
    buttonLabel = 'วิธีติดตั้งเป็นแอป';
  } else if (platform.isIos) {
    statusText = 'บน iPhone / iPad ติดตั้งผ่าน Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม';
    buttonLabel = 'วิธีติดตั้งเป็นแอป';
  } else if (platform.inIframe) {
    statusText = 'กำลังเปิดในกรอบพรีวิว — เปิดในแท็บหลักของเบราว์เซอร์เพื่อติดตั้งเป็นแอป';
    buttonLabel = 'วิธีติดตั้งเป็นแอป';
  } else {
    statusText = 'ยังไม่ได้รับสัญญาณติดตั้งอัตโนมัติจากเบราว์เซอร์ — กดดูวิธีติดตั้งจากเมนูเบราว์เซอร์ได้';
    buttonLabel = 'วิธีติดตั้งเป็นแอป';
  }

  return {
    canPrompt,
    alreadyInstalled,
    showButton: !alreadyInstalled,
    buttonLabel,
    statusText,
    platform
  };
}

export function openPwaInstallGuideModal() {
  const st = getPwaInstallState();
  const guide = buildInstallGuideContent(st.platform, st.canPrompt);
  const stepsHtml = guide.steps.length
    ? `<ol class="space-y-2 text-xs sm:text-sm text-slate-700">
        ${guide.steps.map((step, idx) => `
          <li class="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <span class="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold inline-flex items-center justify-center shrink-0">${idx + 1}</span>
            <span class="leading-relaxed">${esc(step)}</span>
          </li>`).join('')}
      </ol>`
    : '';

  const m = openModal(`
    <div class="flex justify-between items-center mb-3 gap-2">
      <h3 class="font-bold text-base sm:text-lg text-slate-800 inline-flex items-center gap-2 min-w-0">
        ${iconSvg('smartphone', { size: 18, className: 'text-brand shrink-0' })}
        <span class="truncate">${esc(guide.headline)}</span>
      </h3>
      <button data-close type="button" class="tm-modal-close shrink-0" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <div class="space-y-3">
      <div class="inline-flex items-center gap-1.5 rounded-full bg-sky-soft px-3 py-1 text-xs font-semibold text-brand-dark">
        ${iconSvg('lightbulb', { size: 14 })}
        <span>${esc(guide.badge)}</span>
      </div>
      <p class="text-xs sm:text-sm text-slate-600 leading-relaxed">${esc(guide.note)}</p>
      ${stepsHtml}
      <div class="flex flex-wrap justify-end gap-2 pt-2">
        <button type="button" data-close class="btn btn-primary min-h-[44px]">เข้าใจแล้ว</button>
      </div>
    </div>
  `);
  return m;
}

export async function triggerPwaInstall() {
  const st = getPwaInstallState();
  if (st.alreadyInstalled) {
    toast('แอป Track Me ติดตั้งและกำลังใช้งานอยู่แล้ว');
    return { outcome: 'already-installed' };
  }

  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      deferredInstallPrompt = null;
      if (choice?.outcome === 'accepted') {
        installedInSession = true;
        emitInstallChange();
        toast('กำลังติดตั้ง Track Me เป็นแอป...');
        return { outcome: 'accepted' };
      }
      emitInstallChange();
      toast('ยกเลิกการติดตั้ง — กดติดตั้งใหม่ผ่านเมนูเบราว์เซอร์ได้ทุกเมื่อ');
      return { outcome: 'dismissed' };
    } catch {
      deferredInstallPrompt = null;
      emitInstallChange();
      toast('เบราว์เซอร์ยังไม่เปิดหน้าต่างติดตั้งอัตโนมัติ — ดูวิธีติดตั้งด้านล่าง');
      openPwaInstallGuideModal();
      return { outcome: 'manual' };
    }
  }

  openPwaInstallGuideModal();
  return { outcome: 'manual' };
}
