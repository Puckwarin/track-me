export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const z = n => String(n).padStart(2, '0');
// วันที่ท้องถิ่น (toISOString เป็น UTC ทำให้ช่วงเช้าในไทยได้วันเมื่อวาน)
export function localDateStr(d = new Date()) { return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
export function parseLocal(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${z(dt.getUTCMonth() + 1)}-${z(dt.getUTCDate())}`;
}
export function fmtDate(s) { return s ? parseLocal(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'; }
export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const isDateStr = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export function isValidCalendarDate(s) {
  if (!isDateStr(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function addMonthsLocal(ymd, months) {
  const [y, m, d] = ymd.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + Number(months || 0);
  const targetYear = Math.floor(total / 12);
  const targetMonth1 = ((total % 12) + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth1, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${z(targetMonth1)}-${z(Math.min(d, lastDay))}`;
}
export function mondayOf(dateStr = localDateStr()) {
  const s = dateStr || localDateStr();
  const [y, m, d] = s.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(s, -wd);
}
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + Number(delta || 0);
  const targetYear = Math.floor(total / 12);
  const targetMonth1 = ((total % 12) + 12) % 12 + 1;
  return `${String(targetYear).padStart(4, '0')}-${z(targetMonth1)}`;
}
export function monthEndDate(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, '0')}-${z(m)}-${z(lastDay)}`;
}
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

export function trapFocus(el, { autoFocus = true } = {}) {
  const sel = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';
  const getNodes = () => [...el.querySelectorAll(sel)].filter(node => node.getClientRects().length);
  if (autoFocus) {
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const nodes = getNodes();
      (nodes[0] || el).focus();
    });
  }
  const handler = e => {
    if (e.key !== 'Tab') return;
    const nodes = getNodes();
    if (!nodes.length) {
      e.preventDefault();
      el.focus();
      return;
    }
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  };
  el.addEventListener('keydown', handler);
  return () => el.removeEventListener('keydown', handler);
}

// Modal เล็ก ๆ ใช้ซ้ำได้
export function openModal(innerHtml, { wide = false, size = '', flush = false, staticBackdrop = false, closeOnEscape = !staticBackdrop, onClose = null, boxClass = '' } = {}) {
  const widthClass = size === 'xl' ? 'max-w-5xl' : (size === 'lg' || wide ? 'max-w-2xl' : 'max-w-lg');
  const bodyClass = flush ? 'is-flush p-0 overflow-hidden flex flex-col' : 'overflow-y-auto p-6';
  const extraClass = boxClass ? ` ${boxClass}` : '';
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const el = document.createElement('div');
  el.className = 'modal-backdrop fixed inset-0 z-[85] flex items-center justify-center p-4';
  el.innerHTML = `<div class="modal-box bg-white w-full ${widthClass} ${bodyClass}${extraClass}" role="dialog" aria-modal="true">${innerHtml}</div>`;
  const box = el.firstElementChild;
  const heading = box.querySelector('h1, h2, h3, h4, h5, h6');
  box.tabIndex = -1;
  if (heading) {
    if (!heading.id) heading.id = `modal-title-${crypto.randomUUID()}`;
    box.setAttribute('aria-labelledby', heading.id);
  } else {
    box.setAttribute('aria-label', 'หน้าต่างโต้ตอบ');
  }
  document.body.appendChild(el);
  const releaseTrap = trapFocus(box);
  let closed = false;
  const onKey = e => {
    if (e.key === 'Escape' && closeOnEscape) {
      const modals = document.querySelectorAll('.modal-backdrop, .tm-modal-backdrop');
      if (modals.length && modals[modals.length - 1] !== el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    releaseTrap();
    document.removeEventListener('keydown', onKey);
    el.remove();
    if (typeof onClose === 'function') {
      try { onClose(); } catch {}
    }
    if (trigger?.isConnected) trigger.focus();
  };
  document.addEventListener('keydown', onKey);
  if (!staticBackdrop) {
    el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  }
  $$('[data-close]', el).forEach(b => b.addEventListener('click', close));
  return { el, close, box: el.firstElementChild };
}

export function confirmDialog({
  title = 'ยืนยันการทำรายการ',
  message = '',
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  danger = false
} = {}) {
  return new Promise(resolve => {
    let settled = false;
    let onEsc = null;
    const finish = result => {
      if (settled) return;
      settled = true;
      if (onEsc) document.removeEventListener('keydown', onEsc);
      close();
      resolve(result);
    };
    const { el, close } = openModal(`
      <div class="space-y-4">
        <div class="space-y-1.5">
          <h3 class="text-base font-bold text-slate-800">${esc(title)}</h3>
          ${message ? `<p class="text-sm text-slate-600 leading-relaxed break-words">${esc(message)}</p>` : ''}
        </div>
        <div class="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" data-confirm-no class="btn btn-ghost min-h-[44px]">${esc(cancelText)}</button>
          <button type="button" data-confirm-yes class="btn ${danger ? 'btn-pink' : 'btn-primary'} min-h-[44px]">${esc(confirmText)}</button>
        </div>
      </div>`, { staticBackdrop: true, closeOnEscape: false });
    const yesBtn = $('[data-confirm-yes]', el);
    const noBtn = $('[data-confirm-no]', el);
    yesBtn?.addEventListener('click', () => finish(true));
    noBtn?.addEventListener('click', () => finish(false));
    el.addEventListener('mousedown', e => { if (e.target === el) finish(false); });
    onEsc = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };
    document.addEventListener('keydown', onEsc);
    requestAnimationFrame(() => noBtn?.focus());
  });
}
