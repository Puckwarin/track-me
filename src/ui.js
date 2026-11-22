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

/* ---- Floating Tooltip with Viewport Collision Detection ---- */
let floatingTipEl = null;
let floatingTipContainer = null;
let floatingTipScrollBound = false;

export function computeTooltipPosition(anchorRect, tipSize, viewport, { margin = 8, gap = 10 } = {}) {
  const vw = Math.max(margin * 2 + 1, viewport?.width || 360);
  const vh = Math.max(margin * 2 + 1, viewport?.height || 640);
  const tw = Math.min(tipSize?.width || 0, vw - margin * 2);
  const th = Math.min(tipSize?.height || 0, vh - margin * 2);

  const centerX = (anchorRect?.left || 0) + (anchorRect?.width || 0) / 2;
  const rawLeft = centerX - tw / 2;
  const left = Math.max(margin, Math.min(vw - tw - margin, rawLeft));

  const spaceAbove = (anchorRect?.top || 0) - margin;
  const spaceBelow = vh - (anchorRect?.bottom || 0) - margin;
  let placement = 'top';
  let top = (anchorRect?.top || 0) - th - gap;

  if (top < margin && spaceBelow >= spaceAbove) {
    top = (anchorRect?.bottom || 0) + gap;
    placement = 'bottom';
  }
  top = Math.max(margin, Math.min(vh - th - margin, top));

  return { left: Math.round(left), top: Math.round(top), placement };
}

function getFloatingTipEl() {
  if (typeof document === 'undefined') return null;
  if (!floatingTipEl || !floatingTipEl.isConnected) {
    floatingTipEl = document.createElement('div');
    floatingTipEl.className = 'tm-chart-float-tip hidden';
    floatingTipEl.setAttribute('role', 'tooltip');
    floatingTipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(floatingTipEl);
  }
  return floatingTipEl;
}

function hideFloatingTip() {
  if (!floatingTipEl) return;
  floatingTipEl.classList.add('hidden');
  floatingTipEl.setAttribute('aria-hidden', 'true');
  floatingTipContainer = null;
}

function showFloatingTip(container, target, pointerPos = null) {
  const tip = getFloatingTipEl();
  if (!tip || !target?.isConnected) return;
  const title = target.dataset.chartTip || '';
  const sub = target.dataset.chartSub || '';
  const color = target.dataset.chartColor || '';
  if (!title) {
    hideFloatingTip();
    return;
  }
  floatingTipContainer = container;
  tip.innerHTML = `<div class="tm-chart-float-row">${color ? `<span class="tm-chart-float-dot" style="background:${esc(color)}" aria-hidden="true"></span>` : ''}<span class="tm-chart-float-title">${esc(title)}</span></div>${sub ? `<div class="tm-chart-float-sub">${esc(sub)}</div>` : ''}`;
  tip.classList.remove('hidden');
  tip.setAttribute('aria-hidden', 'false');

  const tipRect = tip.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const usePointer = pointerPos && Number.isFinite(pointerPos.x) && Number.isFinite(pointerPos.y) && (pointerPos.x > 0 || pointerPos.y > 0);
  const anchorRect = usePointer
    ? { left: pointerPos.x, right: pointerPos.x, top: pointerPos.y, bottom: pointerPos.y, width: 0, height: 0 }
    : rect;

  const pos = computeTooltipPosition(
    anchorRect,
    { width: tipRect.width, height: tipRect.height },
    { width: window.innerWidth || document.documentElement.clientWidth, height: window.innerHeight || document.documentElement.clientHeight }
  );
  tip.style.left = `${pos.left}px`;
  tip.style.top = `${pos.top}px`;
  tip.dataset.placement = pos.placement;

  if (!floatingTipScrollBound && typeof window !== 'undefined') {
    floatingTipScrollBound = true;
    window.addEventListener('scroll', hideFloatingTip, { passive: true, capture: true });
    window.addEventListener('resize', hideFloatingTip, { passive: true });
    document.addEventListener('click', e => {
      if (floatingTipContainer && !floatingTipContainer.contains(e.target)) hideFloatingTip();
    });
  }
}

/* ---- Interactive Chart Inspector (Tap/Click to Read Values) ---- */
export function bindChartInspector(container, {
  hint = 'แตะจุดหรือแท่งกราฟเพื่อดูข้อมูลละเอียด',
  readoutEl = null,
  stopSummaryToggle = false,
  onSelect = null
} = {}) {
  if (!container) return;
  const tips = container.querySelectorAll('[data-chart-tip]');
  let out = readoutEl || container.querySelector('[data-chart-readout]');
  if (!tips.length) {
    if (out) out.classList.add('hidden');
    if (floatingTipContainer === container) hideFloatingTip();
    return;
  }
  if (!out) {
    out = document.createElement('div');
    out.className = 'tm-chart-readout is-empty';
    out.setAttribute('data-chart-readout', '');
    out.setAttribute('aria-live', 'polite');
    container.appendChild(out);
  }
  out.classList.remove('hidden');

  const clearSelection = () => {
    container.querySelectorAll('[data-chart-tip].is-selected').forEach(el => el.classList.remove('is-selected'));
  };
  const showHint = () => {
    clearSelection();
    if (floatingTipContainer === container) hideFloatingTip();
    out.className = 'tm-chart-readout is-empty';
    out.innerHTML = `<span>${esc(hint)}</span>`;
  };
  const showTarget = (target, pointerPos = null) => {
    clearSelection();
    const idx = target.dataset.chartIdx;
    if (idx !== undefined && idx !== '') {
      container.querySelectorAll(`[data-chart-idx="${CSS?.escape ? CSS.escape(idx) : idx}"]`).forEach(el => el.classList.add('is-selected'));
    } else {
      target.classList.add('is-selected');
    }
    const title = target.dataset.chartTip || '';
    const sub = target.dataset.chartSub || '';
    const color = target.dataset.chartColor || '';
    out.className = 'tm-chart-readout';
    out.innerHTML = `<span class="inline-flex items-start gap-1.5 font-semibold min-w-0 flex-1">${color ? `<span class="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style="background:${esc(color)}"></span>` : ''}<span class="tm-chart-readout-text">${esc(title)}</span></span>${sub ? `<span class="text-[11px] opacity-80 shrink-0">${esc(sub)}</span>` : ''}`;
    if (target.closest('.hx-ring, .tm-donut-legend')) {
      showFloatingTip(container, target, pointerPos);
    }
    if (typeof onSelect === 'function') onSelect(target);
  };

  showHint();
  if (container.dataset.chartInspectorBound === '1') return;
  container.dataset.chartInspectorBound = '1';

  const activate = e => {
    const target = e.target.closest('[data-chart-tip]');
    if (!target || !container.contains(target)) {
      if (floatingTipContainer === container) hideFloatingTip();
      return;
    }
    if (stopSummaryToggle) {
      e.preventDefault();
      e.stopPropagation();
    }
    showTarget(target, Number.isFinite(e.clientX) ? { x: e.clientX, y: e.clientY } : null);
  };
  container.addEventListener('click', activate);
  container.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      showHint();
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target.closest('[data-chart-tip]');
    if (!target || !container.contains(target)) return;
    e.preventDefault();
    if (stopSummaryToggle) e.stopPropagation();
    showTarget(target);
  });
  // เมาส์บนเดสก์ท็อป: เลื่อนเมาส์ผ่านก็เห็นค่าได้เลย ไม่ต้องกดก่อน (มือถือยังใช้การแตะ/คลิกตามเดิม)
  container.addEventListener('mouseover', e => {
    const target = e.target.closest('[data-chart-tip]');
    if (!target || !container.contains(target)) return;
    showTarget(target, Number.isFinite(e.clientX) ? { x: e.clientX, y: e.clientY } : null);
  });
  container.addEventListener('mouseleave', () => showHint());
  // คีย์บอร์ดบนเดสก์ท็อป: ไล่โฟกัสด้วย Tab แล้วเห็นค่าทันทีโดยไม่ต้องกด Enter ซ้ำ
  container.addEventListener(
    'focus',
    e => {
      const target = e.target.closest ? e.target.closest('[data-chart-tip]') : null;
      if (!target || !container.contains(target)) return;
      showTarget(target);
    },
    true
  );
}

/* ---- Shared Mobile Swipe Rows (< 1024px) ---- */
const boundSwipeContainers = new WeakSet();
const swipeContainerCallbacks = new WeakMap();
let activeSwipeState = null;
let globalSwipeListenersBound = false;

function resetSwipeRow(row) {
  if (!row) return;
  row.classList.remove('is-open-left', 'is-swiping');
  row.removeAttribute('data-swipe-dir');
  row.style.setProperty('--swipe-x', '0px');
}

export function closeAllSwipeRows(scope = document, exceptRow = null) {
  if (!scope?.querySelectorAll) return;
  scope.querySelectorAll('.tm-swipe-row.is-open-left, .tm-swipe-row[data-swipe-dir]').forEach(row => {
    if (row !== exceptRow) resetSwipeRow(row);
  });
}

function setRowSwipeX(row, dx) {
  row.style.setProperty('--swipe-x', `${dx}px`);
  if (dx < -4) row.setAttribute('data-swipe-dir', 'left');
  else if (dx > 4) row.setAttribute('data-swipe-dir', 'right');
  else row.removeAttribute('data-swipe-dir');
}

function ensureGlobalSwipeListeners() {
  if (globalSwipeListenersBound || typeof window === 'undefined' || typeof document === 'undefined') return;
  globalSwipeListenersBound = true;

  window.addEventListener('pointermove', e => {
    const s = activeSwipeState;
    if (!s || e.pointerId !== s.pointerId || s.aborted) return;
    const rawDx = e.clientX - s.startX;
    const rawDy = e.clientY - s.startY;
    if (!s.locked) {
      if (Math.abs(rawDy) > 12 && Math.abs(rawDy) > Math.abs(rawDx)) {
        s.aborted = true;
        return;
      }
      if (Math.abs(rawDx) > 10 && Math.abs(rawDx) > Math.abs(rawDy) * 1.15) {
        s.locked = true;
        s.row.classList.add('is-swiping');
      } else {
        return;
      }
    }
    const minX = -(s.openWidth + 8);
    const maxX = s.allowRight ? 116 : 0;
    const nextX = Math.max(minX, Math.min(maxX, s.baseX + rawDx));
    s.dx = nextX;
    setRowSwipeX(s.row, nextX);
  });

  const finishSwipe = e => {
    const s = activeSwipeState;
    if (!s || e.pointerId !== s.pointerId) return;
    activeSwipeState = null;
    const { row, container, dx, locked, baseX, openWidth } = s;
    row.classList.remove('is-swiping');
    if (locked) {
      row.dataset.justSwiped = '1';
      setTimeout(() => { if (row.isConnected) delete row.dataset.justSwiped; }, 90);
    }
    if (!locked) {
      if (baseX < 0) resetSwipeRow(row);
      return;
    }
    const threshold = Math.min(56, Math.round(openWidth * 0.45));
    if (dx <= -threshold) {
      row.classList.add('is-open-left');
      setRowSwipeX(row, -openWidth);
    } else if (dx >= 68 && s.allowRight) {
      resetSwipeRow(row);
      const cb = swipeContainerCallbacks.get(container)?.onSwipeRight;
      if (typeof cb === 'function') cb(row);
    } else {
      resetSwipeRow(row);
    }
  };

  window.addEventListener('pointerup', finishSwipe);
  window.addEventListener('pointercancel', finishSwipe);
  document.addEventListener('click', e => {
    const target = e.target instanceof Element ? e.target : null;
    document.querySelectorAll('.tm-swipe-row.is-open-left').forEach(row => {
      if (!target || !row.contains(target)) resetSwipeRow(row);
    });
  });
}

export function bindSwipeRows(container, { selector = '.tm-swipe-row', onSwipeRight } = {}) {
  if (!container || typeof window === 'undefined') return;
  swipeContainerCallbacks.set(container, { onSwipeRight });
  if (boundSwipeContainers.has(container)) return;
  boundSwipeContainers.add(container);
  ensureGlobalSwipeListeners();

  container.addEventListener('click', e => {
    const swipedRow = e.target.closest?.(selector);
    if (swipedRow?.dataset.justSwiped === '1') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const actionBtn = e.target.closest?.('.tm-swipe-actions button');
    if (actionBtn) {
      const row = actionBtn.closest(selector);
      requestAnimationFrame(() => resetSwipeRow(row));
    }
  }, true);

  container.addEventListener('pointerdown', e => {
    if (window.matchMedia?.('(min-width: 1024px)').matches) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.tm-swipe-actions, .tm-swipe-fav, .tm-row-actions, .tm-food-row-actions, [data-drag-handle], input, button, a, select, textarea')) return;
    const row = e.target.closest(selector);
    if (!row || !row.querySelector('.tm-swipe-actions')) {
      closeAllSwipeRows(container);
      return;
    }
    closeAllSwipeRows(document, row);
    const actionsEl = row.querySelector('.tm-swipe-actions');
    const isSingle = actionsEl?.classList.contains('tm-swipe-actions--single');
    const openWidth = Math.round(actionsEl?.getBoundingClientRect().width || actionsEl?.offsetWidth || (isSingle ? 72 : 136)) || (isSingle ? 72 : 136);
    const wasOpen = row.classList.contains('is-open-left');
    activeSwipeState = {
      row,
      container,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: wasOpen ? -openWidth : 0,
      dx: wasOpen ? -openWidth : 0,
      openWidth,
      allowRight: Boolean(onSwipeRight || row.querySelector('.tm-swipe-fav')),
      locked: false,
      aborted: false
    };
  });
}