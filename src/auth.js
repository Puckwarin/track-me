import { onAuthStateChanged, signInWithPopup, reauthenticateWithPopup, signOut } from 'firebase/auth';
import { auth, provider } from './firebase.js';
import { state, emit } from './state.js';
import { $, toast } from './util.js';
import { clearSummaryCache } from './summary.js';
import { hasDevicePin, showDeviceLock, removeDevicePin } from './local-lock.js';

let signedInUser = null;

async function resetPinWithGoogle(user) {
  await reauthenticateWithPopup(user, provider);
  removeDevicePin(user.uid);
  $('#app-lock').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  emit('auth', user);
}

export function lockCurrentApp() {
  if (!signedInUser || !hasDevicePin(signedInUser.uid)) return;
  const user = signedInUser;
  showDeviceLock(user.uid, () => { $('#app-shell').classList.remove('hidden'); emit('auth', user); }, signOutUser, () => resetPinWithGoogle(user));
}

export function initAuth() {
  $('#btn-google').addEventListener('click', async () => {
    $('#login-error').textContent = '';
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      const msg = {
        'auth/popup-blocked': 'เบราว์เซอร์บล็อกหน้าต่างล็อกอิน — อนุญาต pop-up แล้วลองใหม่',
        'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้เพิ่มใน Firebase → Authentication → Settings → Authorized domains (ดู docs/SETUP.md)',
        'auth/operation-not-allowed': 'ยังไม่ได้เปิด Google Sign-in ใน Firebase Console (ดู docs/SETUP.md)',
        'auth/network-request-failed': 'ไม่มีอินเทอร์เน็ต — ล็อกอินครั้งแรกต้องออนไลน์',
        'auth/invalid-api-key': 'ยังไม่ได้ตั้งค่า Firebase API Key ใน .env',
        'auth/popup-closed-by-user': ''
      }[e.code];
      $('#login-error').textContent = msg ?? 'ล็อกอินไม่สำเร็จ: ' + (e.code || e.message);
    }
  });
  // Firebase เก็บ session ในเครื่อง → เปิดแอปตอนออฟไลน์ก็ยังถือว่าล็อกอินอยู่
  onAuthStateChanged(auth, user => {
    signedInUser = user;
    state.user = user;
    state.uid = user ? user.uid : null;
    if (!user) {
      $('#app-lock').classList.add('hidden');
      $('#login-screen').classList.remove('hidden');
      $('#app-shell').classList.add('hidden');
      emit('auth', null);
      return;
    }
    $('#login-screen').classList.add('hidden');
    if (hasDevicePin(user.uid)) {
      const unlock = () => { $('#app-shell').classList.remove('hidden'); emit('auth', user); };
      $('#app-shell').classList.add('hidden');
      showDeviceLock(user.uid, unlock, signOutUser, () => resetPinWithGoogle(user));
      return;
    }
    $('#app-lock').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
    emit('auth', user);
  });
}

export async function signOutUser() {
  if (!confirm('ออกจากระบบ?')) return;
  clearSummaryCache();
  try { await signOut(auth); } catch (e) { toast(e.message, 'err'); }
}
