/* ============================================================
   Track Me — Shared UI Components
   Team 1: Design System & Shared UI Components
   ============================================================ */

import { esc } from './util.js';

/* ---- Card ---- */
export function card({ className = '', compact = false, flat = false, raised = false, id = '' } = {}) {
  const cls = ['tm-card'];
  if (compact) cls.push('tm-card-compact');
  if (flat) cls.push('tm-card-flat');
  if (raised) cls.push('tm-card-raised');
  if (className) cls.push(className);
  return `<div class="${cls.join(' ')}"${id ? ` id="${esc(id)}"` : ''}></div>`;
}

/* ---- Button ---- */
export function button({ label = '', icon = '', variant = 'primary', size = '', full = false, id = '', type = 'button', disabled = false, ariaLabel = '' } = {}) {
  const cls = ['tm-btn', `tm-btn-${variant}`];
  if (size === 'sm') cls.push('tm-btn-sm');
  if (size === 'lg') cls.push('tm-btn-lg');
  if (full) cls.push('tm-btn-full');
  const attrs = [
    `class="${cls.join(' ')}"`,
    `type="${esc(type)}"`,
  ];
  if (id) attrs.push(`id="${esc(id)}"`);
  if (disabled) attrs.push('disabled');
  if (ariaLabel) attrs.push(`aria-label="${esc(ariaLabel)}"`);
  const inner = icon ? `<i class="fa-solid ${esc(icon)}"></i> ${esc(label)}` : esc(label);
  return `<button ${attrs.join(' ')}>${inner}</button>`;
}

/* ---- Icon Button ---- */
export function iconButton({ icon = '', id = '', variant = '', size = '', ariaLabel = '', active = false } = {}) {
  const cls = ['tm-icon-btn'];
  if (variant) cls.push(`tm-icon-btn-${variant}`);
  if (size === 'sm') cls.push('tm-icon-btn-sm');
  if (active) cls.push('is-active');
  const attrs = [`class="${cls.join(' ')}"`];
  if (id) attrs.push(`id="${esc(id)}"`);
  if (ariaLabel) attrs.push(`aria-label="${esc(ariaLabel)}"`);
  return `<button type="button" ${attrs.join(' ')}><i class="fa-solid ${esc(icon)}"></i></button>`;
}

/* ---- Input ---- */
export function input({ id = '', type = 'text', placeholder = '', value = '', label = '', error = false, ariaLabel = '' } = {}) {
  const cls = ['tm-input'];
  if (error) cls.push('tm-input-error');
  const attrs = [`class="${cls.join(' ')}"`, `type="${esc(type)}"`];
  if (id) attrs.push(`id="${esc(id)}"`);
  if (placeholder) attrs.push(`placeholder="${esc(placeholder)}"`);
  if (value) attrs.push(`value="${esc(value)}"`);
  if (ariaLabel) attrs.push(`aria-label="${esc(ariaLabel)}"`);
  const labelHtml = label ? `<label class="tm-label" for="${esc(id)}">${esc(label)}</label>` : '';
  return `${labelHtml}<input ${attrs.join(' ')}>`;
}

/* ---- Select ---- */
export function select({ id = '', options = [], label = '', ariaLabel = '' } = {}) {
  const opts = options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const t = typeof o === 'string' ? o : o.label;
    const sel = typeof o === 'object' && o.selected ? ' selected' : '';
    return `<option value="${esc(v)}"${sel}>${esc(t)}</option>`;
  }).join('');
  const attrs = [`class="tm-select"`];
  if (id) attrs.push(`id="${esc(id)}"`);
  if (ariaLabel) attrs.push(`aria-label="${esc(ariaLabel)}"`);
  const labelHtml = label ? `<label class="tm-label" for="${esc(id)}">${esc(label)}</label>` : '';
  return `${labelHtml}<select ${attrs.join(' ')}>${opts}</select>`;
}

/* ---- Chip ---- */
export function chip({ label = '', icon = '', variant = 'default', id = '' } = {}) {
  const cls = ['tm-chip', `tm-chip-${variant}`];
  const attrs = [`class="${cls.join(' ')}"`, 'type="button"'];
  if (id) attrs.push(`id="${esc(id)}"`);
  const inner = icon ? `<i class="fa-solid ${esc(icon)}"></i> ${esc(label)}` : esc(label);
  return `<button ${attrs.join(' ')}>${inner}</button>`;
}

/* ---- Badge ---- */
export function badge({ label = '', variant = 'info', dot = false } = {}) {
  const cls = ['tm-badge', `tm-badge-${variant}`];
  if (dot) {
    return `<span class="${cls.join(' ')}"><span class="tm-badge-dot tm-badge-dot-${variant}"></span>${esc(label)}</span>`;
  }
  return `<span class="${cls.join(' ')}">${esc(label)}</span>`;
}

/* ---- Section Header ---- */
export function sectionHeader({ title = '', icon = '', subtitle = '' } = {}) {
  return `<div class="tm-section-header">
    ${icon ? `<i class="fa-solid ${esc(icon)}"></i>` : ''}
    <span>${esc(title)}</span>
    ${subtitle ? `<span class="tm-section-header-sub">${esc(subtitle)}</span>` : ''}
  </div>`;
}

/* ---- Tabs ---- */
export function tabs({ items = [], activeIndex = 0, containerId = '' } = {}) {
  const buttons = items.map((item, i) => {
    const cls = ['tm-tab'];
    if (i === activeIndex) cls.push('is-active');
    const icon = item.icon ? `<i class="fa-solid ${esc(item.icon)}"></i>` : '';
    return `<button type="button" class="${cls.join(' ')}" data-tab-index="${i}">${icon}${esc(item.label)}</button>`;
  }).join('');
  const attrs = ['class="tm-tabs"'];
  if (containerId) attrs.push(`id="${esc(containerId)}"`);
  return `<div ${attrs.join(' ')}>${buttons}</div>`;
}

/* ---- Empty State ---- */
export function emptyState({ icon = 'fa-inbox', title = 'ยังไม่มีข้อมูล', description = '' } = {}) {
  return `<div class="tm-empty">
    <div class="tm-empty-icon"><i class="fa-solid ${esc(icon)}"></i></div>
    <div class="tm-empty-title">${esc(title)}</div>
    ${description ? `<div class="tm-empty-desc">${esc(description)}</div>` : ''}
  </div>`;
}

/* ---- Loading State ---- */
export function loadingState({ label = 'กำลังโหลด…' } = {}) {
  return `<div class="tm-loading"><span class="tm-spinner"></span>${esc(label)}</div>`;
}

/* ---- Error State ---- */
export function errorState({ message = 'เกิดข้อผิดพลาด', icon = 'fa-circle-exclamation' } = {}) {
  return `<div class="tm-error"><span class="tm-error-icon"><i class="fa-solid ${esc(icon)}"></i></span>${esc(message)}</div>`;
}

/* ---- Success Inline ---- */
export function successInline({ message = '' } = {}) {
  return `<div class="tm-success-inline"><i class="fa-solid fa-check-circle"></i>${esc(message)}</div>`;
}

/* ---- Modal (programmatic) ---- */
export function openModal(innerHtml, { size = '', flush = false, staticBackdrop = false } = {}) {
  const sizeClass = size === 'xl' ? 'tm-modal-xl' : (size === 'lg' ? 'tm-modal-lg' : '');
  const flushClass = flush ? 'tm-modal-flush' : '';
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const el = document.createElement('div');
  el.className = 'tm-modal-backdrop';
  el.innerHTML = `<div class="tm-modal-box ${sizeClass} ${flushClass}" role="dialog" aria-modal="true">${innerHtml}</div>`;
  const box = el.firstElementChild;
  const heading = box.querySelector('h1, h2, h3, h4, h5, h6');
  box.tabIndex = -1;
  if (heading) {
    if (!heading.id) heading.id = `tm-modal-title-${crypto.randomUUID()}`;
    box.setAttribute('aria-labelledby', heading.id);
  } else {
    box.setAttribute('aria-label', 'หน้าต่างโต้ตอบ');
  }
  document.body.appendChild(el);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.remove();
    document.removeEventListener('keydown', onKey);
    if (trigger?.isConnected) trigger.focus();
  };
  const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';
  const onKey = e => {
    if (e.key === 'Escape' && !staticBackdrop) {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = [...box.querySelectorAll(focusableSelector)].filter(node => node.getClientRects().length);
    if (!nodes.length) {
      e.preventDefault();
      box.focus();
      return;
    }
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    const first = [...box.querySelectorAll(focusableSelector)].find(node => node.getClientRects().length);
    (first || box).focus();
  });
  if (!staticBackdrop) {
    el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  }
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { el, close, box: el.firstElementChild };
}

/* ---- Bottom Sheet ---- */
export function openBottomSheet(innerHtml) {
  const el = document.createElement('div');
  el.className = 'tm-sheet-backdrop';
  el.innerHTML = `<div class="tm-sheet-panel"><div class="tm-sheet-handle" aria-hidden="true"></div>${innerHtml}</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-open'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 220);
  };
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  return { el, close, panel: el.querySelector('.tm-sheet-panel') };
}

/* ---- Toast ---- */
export function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  const bgClass = kind === 'err' ? 'tm-chip-error' : (kind === 'warn' ? 'tm-chip-warning' : 'tm-chip-success');
  el.className = `fixed left-1/2 -translate-x-1/2 z-[130] px-4 py-2.5 rounded-full text-sm shadow-lg max-w-[90vw] text-center ${bgClass}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---- Chart Container ---- */
export function chartContainer({ svgContent = '', legend = [], id = '' } = {}) {
  const legendHtml = legend.length
    ? `<div class="tm-chart-legend">${legend.map(l => `<span class="tm-chart-legend-item"><span class="tm-badge-dot tm-badge-dot-${l.variant || 'info'}"></span>${esc(l.label)}</span>`).join('')}</div>`
    : '';
  const attrs = ['class="tm-chart-container"'];
  if (id) attrs.push(`id="${esc(id)}"`);
  return `<div ${attrs.join(' ')}>${svgContent}${legendHtml}</div>`;
}
