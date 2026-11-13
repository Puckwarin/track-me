export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const z = n => String(n).padStart(2, '0');
// วันที่ท้องถิ่น (toISOString เป็น UTC ทำให้ช่วงเช้าในไทยได้วันเมื่อวาน)
export function localDateStr(d = new Date()) { return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
export function parseLocal(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function daysBetween(a, b) { return Math.round((parseLocal(b) - parseLocal(a)) / 86400000); }
export function addDays(s, n) { const d = parseLocal(s); d.setDate(d.getDate() + n); return localDateStr(d); }
export function fmtDate(s) { return s ? parseLocal(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'; }
export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const isDateStr = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const toNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
export const numField = (root, id) => toNum(root.querySelector('#' + id).value);
export const round1 = n => Math.round(n * 10) / 10;

export function downloadFile(name, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// BOM ให้ Excel อ่านภาษาไทย (UTF-8) ถูกต้อง
export function toCsv(rows) { return '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'); }

export function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast fixed left-1/2 -translate-x-1/2 z-[130] px-4 py-2.5 rounded-full text-sm shadow-lg max-w-[90vw] text-center ${kind === 'err' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// Modal เล็ก ๆ ใช้ซ้ำได้
export function openModal(innerHtml, { wide = false } = {}) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4';
  el.innerHTML = `<div class="modal-box bg-white w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto p-6" role="dialog" aria-modal="true">${innerHtml}</div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  $$('[data-close]', el).forEach(b => b.addEventListener('click', close));
  return { el, close, box: el.firstElementChild };
}
