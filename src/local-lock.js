import { $ } from './util.js';

const keyFor = uid => `trackme-device-pin:${uid}`;
const getRecord = uid => { try { return JSON.parse(localStorage.getItem(keyFor(uid)) || 'null'); } catch { return null; } };
export const hasDevicePin = uid => Boolean(uid && getRecord(uid)?.hash && getRecord(uid)?.salt);

async function digest(pin, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function saveDevicePin(uid, pin) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(keyFor(uid), JSON.stringify({ salt, hash: await digest(pin, salt) }));
}
export function removeDevicePin(uid) { localStorage.removeItem(keyFor(uid)); }

export async function verifyDevicePin(uid, pin) {
  const record = getRecord(uid);
  return Boolean(record && await digest(pin, record.salt) === record.hash);
}

export function showDeviceLock(uid, onUnlock, onSignOut, onReset) {
  const screen = $('#app-lock'), form = $('#lock-form'), input = $('#lock-pin'), error = $('#lock-error');
  $('#app-shell').classList.add('hidden');
  screen.classList.remove('hidden');
  input.value = ''; error.textContent = '';
  input.focus();
  form.onsubmit = async event => {
    event.preventDefault();
    if (!/^\d{4}$/.test(input.value)) { error.textContent = 'กรุณากรอก PIN 4 หลัก'; return; }
    const button = $('#lock-submit'); button.disabled = true;
    try {
      if (!await verifyDevicePin(uid, input.value)) { error.textContent = 'PIN ไม่ถูกต้อง ลองอีกครั้ง'; input.select(); return; }
      screen.classList.add('hidden'); onUnlock();
    } catch (cause) { error.textContent = `ปลดล็อกไม่สำเร็จ: ${cause.message}`; }
    finally { button.disabled = false; }
  };
  $('#lock-signout').onclick = onSignOut;
  $('#lock-reset').onclick = async () => {
    const button = $('#lock-reset'); button.disabled = true;
    try { await onReset(); }
    catch (cause) { error.textContent = `ยืนยันบัญชีไม่สำเร็จ: ${cause.message}`; }
    finally { button.disabled = false; }
  };
}
