import { setDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state } from './state.js';
import { getPeriodRemindDays } from './period.js';

const VAPID_STORAGE_KEY = 'trackme-vapid-public';

export function hasEnvVapidKey() {
  return Boolean((import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim());
}

export function getVapidPublicKey() {
  const envKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  if (envKey) return envKey;
  return (localStorage.getItem(VAPID_STORAGE_KEY) || state.pushSettings?.vapidPublicKey || '').trim();
}

export function setVapidPublicKey(key) {
  const clean = String(key || '').trim();
  if (clean) localStorage.setItem(VAPID_STORAGE_KEY, clean);
  else localStorage.removeItem(VAPID_STORAGE_KEY);
}

export function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

export function isStandalonePwa() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function getCurrentBrowserSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch (e) {
    return null;
  }
}

export async function getPushStatus() {
  const supported = isPushSupported();
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const sub = await getCurrentBrowserSubscription();
  const savedSubs = Array.isArray(state.pushSettings?.subscriptions) ? state.pushSettings.subscriptions : [];
  const subscribedHere = Boolean(sub && savedSubs.some(s => s.endpoint === sub.endpoint) && state.pushSettings?.enabled !== false);
  return {
    supported,
    permission,
    needsIosInstall: isIosDevice() && !isStandalonePwa(),
    hasVapidKey: Boolean(getVapidPublicKey()),
    subscribedHere,
    totalDevices: savedSubs.length,
    enabled: state.pushSettings?.enabled !== false && savedSubs.length > 0
  };
}

export async function enablePushNotifications(customVapidKey) {
  if (!state.uid) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  if (isIosDevice() && !isStandalonePwa()) {
    throw new Error('บน iPhone/iPad ต้องกดปุ่ม แชร์ (Share) → เพิ่มไปยังหน้าจอโฮม (Add to Home Screen) แล้วเปิดจากไอคอนบนหน้าจอก่อนจึงจะรับ Push Notification ได้');
  }
  if (!isPushSupported()) {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับ Web Push Notification (ต้องเปิดผ่าน HTTPS และใช้เบราว์เซอร์ที่รองรับ)');
  }
  const key = (customVapidKey || getVapidPublicKey()).trim();
  if (!key) {
    throw new Error('ยังไม่ได้ตั้งค่า VAPID Public Key — ใส่ในหน้าตั้งค่า หรือเพิ่มใน GitHub Secrets แล้ว build ใหม่');
  }
  if (customVapidKey) setVapidPublicKey(key);

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied' ? 'การแจ้งเตือนถูกบล็อกอยู่ กรุณาไปเปิดอนุญาตในการตั้งค่าเว็บไซต์ของเบราว์เซอร์' : 'ยังไม่ได้อนุญาตการแจ้งเตือน');
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key)
    });
  }
  const json = sub.toJSON();
  if (!json?.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('ไม่สามารถสร้าง Push Subscription ได้ครบถ้วน');
  }

  const deviceRecord = {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: (navigator.userAgent || '').slice(0, 120),
    updatedAt: new Date().toISOString()
  };

  const existing = Array.isArray(state.pushSettings?.subscriptions) ? state.pushSettings.subscriptions : [];
  const merged = [...existing.filter(s => s.endpoint !== deviceRecord.endpoint).slice(-8), deviceRecord];

  await setDoc(userDoc(state.uid, 'settings', 'push'), {
    enabled: true,
    periodRemindDays: getPeriodRemindDays(),
    subscriptions: merged,
    updatedAt: new Date()
  }, { merge: true });

  window.dispatchEvent(new Event('trackme:push-change'));
  return deviceRecord;
}

export async function disablePushForThisDevice() {
  if (!state.uid) return;
  const sub = await getCurrentBrowserSubscription();
  const endpoint = sub?.endpoint || null;
  if (sub) {
    try { await sub.unsubscribe(); } catch (e) {}
  }
  const existing = Array.isArray(state.pushSettings?.subscriptions) ? state.pushSettings.subscriptions : [];
  const remaining = endpoint ? existing.filter(s => s.endpoint !== endpoint) : existing;
  await setDoc(userDoc(state.uid, 'settings', 'push'), {
    enabled: remaining.length > 0,
    subscriptions: remaining,
    updatedAt: new Date()
  }, { merge: true });
  window.dispatchEvent(new Event('trackme:push-change'));
}

export async function syncPeriodRemindToPush() {
  if (!state.uid || !state.pushSettings?.subscriptions?.length) return;
  try {
    await setDoc(userDoc(state.uid, 'settings', 'push'), {
      periodRemindDays: getPeriodRemindDays(),
      updatedAt: new Date()
    }, { merge: true });
  } catch (e) {}
}

export async function sendTestLocalNotification() {
  if (!('Notification' in window)) throw new Error('เบราว์เซอร์ไม่รองรับการแจ้งเตือน');
  if (Notification.permission !== 'granted') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') throw new Error('ยังไม่ได้รับอนุญาตให้แสดงแจ้งเตือน');
  }
  const title = 'Track Me · ทดสอบแจ้งเตือน';
  const opts = {
    body: 'พร้อมส่งแจ้งเตือน Planner และรายการครบกำหนดเวลา 08:00 น. แล้ว ✨',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'trackme-test'
  };
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, opts);
      return;
    }
  }
  new Notification(title, opts);
}
