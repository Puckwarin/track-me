import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, provider } from './firebase.js';
import { state, emit } from './state.js';
import { $, toast } from './util.js';
import { clearSummaryCache } from './summary.js';

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
        'auth/popup-closed-by-user': ''
      }[e.code];
      $('#login-error').textContent = msg ?? 'ล็อกอินไม่สำเร็จ: ' + (e.code || e.message);
    }
  });
  // Firebase เก็บ session ในเครื่อง → เปิดแอปตอนออฟไลน์ก็ยังถือว่าล็อกอินอยู่
  onAuthStateChanged(auth, user => {
    state.user = user;
    state.uid = user ? user.uid : null;
    $('#login-screen').classList.toggle('hidden', !!user);
    $('#app-shell').classList.toggle('hidden', !user);
    emit('auth', user);
  });
}

export async function signOutUser() {
  if (!confirm('ออกจากระบบ?')) return;
  clearSummaryCache();
  try { await signOut(auth); } catch (e) { toast(e.message, 'err'); }
}
