/* ============================================================
   Track Me — Shared UI Components
   Team 1: Design System & Shared UI Components
   ============================================================ */

import { esc, trapFocus } from './util.js';
import { iconSvg } from './icons.js';

function renderIcon(icon, size = 16) {
  if (!icon) return '';
  return iconSvg(icon, { size });
}

/* ---- Magic UI-inspired Vanilla JS Number Ticker ---- */
export function animateNumberTicker(el, targetValue, {
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 380
} = {}) {
  if (!el) return;
  const target = Number.isFinite(Number(targetValue)) ? Number(targetValue) : 0;
  const fmt = v => {
    const rounded = decimals > 0
      ? Number(v.toFixed(decimals))
      : Math.round(v);
    return `${prefix}${rounded.toLocaleString('th-TH', decimals > 0 ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : undefined)}${suffix}`;
  };

  const prevRaw = el.dataset.tickerValue;
  const prev = prevRaw !== undefined ? Number(prevRaw) : null;
  el.dataset.tickerValue = String(target);

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prev === null || !Number.isFinite(prev) || prev === target || reduced || typeof requestAnimationFrame !== 'function') {
    el.textContent = fmt(target);
    return;
  }

  if (el._tmTickerRaf) cancelAnimationFrame(el._tmTickerRaf);
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const delta = target - prev;
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(prev + delta * eased);
    if (t < 1) {
      el._tmTickerRaf = requestAnimationFrame(step);
    } else {
      el._tmTickerRaf = null;
      el.textContent = fmt(target);
    }
  };
  el._tmTickerRaf = requestAnimationFrame(step);
}

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
  const inner = icon ? `${renderIcon(icon, 16)} ${esc(label)}` : esc(label);
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
  return `<button type="button" ${attrs.join(' ')}>${renderIcon(icon, 18)}</button>`;
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
  const inner = icon ? `${renderIcon(icon, 14)} ${esc(label)}` : esc(label);
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
    ${renderIcon(icon, 18)}
    <span>${esc(title)}</span>
    ${subtitle ? `<span class="tm-section-header-sub">${esc(subtitle)}</span>` : ''}
  </div>`;
}

/* ---- Tabs ---- */
export function tabs({ items = [], activeIndex = 0, containerId = '' } = {}) {
  const buttons = items.map((item, i) => {
    const cls = ['tm-tab'];
    if (i === activeIndex) cls.push('is-active');
    const icon = renderIcon(item.icon, 16);
    return `<button type="button" class="${cls.join(' ')}" data-tab-index="${i}">${icon}${esc(item.label)}</button>`;
  }).join('');
  const attrs = ['class="tm-tabs"'];
  if (containerId) attrs.push(`id="${esc(containerId)}"`);
  return `<div ${attrs.join(' ')}>${buttons}</div>`;
}

/* ---- Empty State ---- */
export function emptyState({ icon = 'inbox', title = 'ยังไม่มีข้อมูล', description = '' } = {}) {
  return `<div class="tm-empty">
    <div class="tm-empty-icon">${renderIcon(icon, 28)}</div>
    <div class="tm-empty-title">${esc(title)}</div>
    ${description ? `<div class="tm-empty-desc">${esc(description)}</div>` : ''}
  </div>`;
}

/* ---- Loading State ---- */
export function loadingState({ label = 'กำลังโหลด…' } = {}) {
  return `<div class="tm-loading"><span class="tm-spinner"></span>${esc(label)}</div>`;
}

/* ---- Error State ---- */
export function errorState({ message = 'เกิดข้อผิดพลาด', icon = 'alert' } = {}) {
  return `<div class="tm-error"><span class="tm-error-icon">${renderIcon(icon, 22)}</span>${esc(message)}</div>`;
}

/* ---- Success Inline ---- */
export function successInline({ message = '' } = {}) {
  return `<div class="tm-success-inline">${iconSvg('check-circle', { size: 16 })}${esc(message)}</div>`;
}

/* ---- Modal (programmatic) ---- */
export function openModal(innerHtml, { size = '', flush = false, staticBackdrop = false, closeOnEscape = !staticBackdrop } = {}) {
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
  const releaseTrap = trapFocus(box);
  let closed = false;
  const onKey = e => {
    if (e.key === 'Escape' && closeOnEscape) {
      e.preventDefault();
      close();
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    releaseTrap();
    document.removeEventListener('keydown', onKey);
    el.remove();
    if (trigger?.isConnected) trigger.focus();
  };
  document.addEventListener('keydown', onKey);
  if (!staticBackdrop) {
    el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  }
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { el, close, box: el.firstElementChild };
}

/* ---- Bottom Sheet ---- */
export function openBottomSheet(innerHtml) {
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const el = document.createElement('div');
  el.className = 'tm-sheet-backdrop';
  el.innerHTML = `<div class="tm-sheet-panel" role="dialog" aria-modal="true"><div class="tm-sheet-handle" aria-hidden="true"></div>${innerHtml}</div>`;
  const panel = el.querySelector('.tm-sheet-panel');
  const heading = panel.querySelector('h1, h2, h3, h4, h5, h6');
  panel.tabIndex = -1;
  if (heading) {
    if (!heading.id) heading.id = `tm-sheet-title-${crypto.randomUUID()}`;
    panel.setAttribute('aria-labelledby', heading.id);
  } else {
    panel.setAttribute('aria-label', 'แผงตัวเลือก');
  }
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-open'));
  const releaseTrap = trapFocus(panel);
  let closed = false;
  const onKey = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    releaseTrap();
    document.removeEventListener('keydown', onKey);
    el.classList.remove('is-open');
    setTimeout(() => {
      el.remove();
      if (trigger?.isConnected) trigger.focus();
    }, 220);
  };
  document.addEventListener('keydown', onKey);
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { el, close, panel };
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
