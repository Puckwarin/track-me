import { HOME_WIDGET_DEFS, getHomeWidgetConfig, saveHomeWidgetConfig } from './home.js';
import { getHomeShortcuts, readNavigationPreferences } from './navigation.js';
import { state } from './state.js';
import { toast, confirmDialog } from './util.js';
import { iconSvg } from './icons.js';

function render(root, config) {
  const shortcutCount = getHomeShortcuts(readNavigationPreferences(state.uid)).length;
  root.innerHTML = `
    <div class="space-y-4">
      <div>
        <h4 class="text-sm font-semibold text-slate-700">ส่วนประกอบหน้าแรก</h4>
        <p class="text-xs text-slate-500 mt-1">เลือกส่วนที่ต้องการแสดง ลากสลับลำดับหรือใช้ปุ่มลูกศรได้ การตั้งค่านี้แยกตามบัญชีและเก็บในอุปกรณ์นี้</p>
      </div>
      <div class="nav-pref-list">
        ${config.order.map((id, index) => {
          const widget = HOME_WIDGET_DEFS.find(item => item.id === id);
          if (!widget) return '';
          const hidden = config.hidden.has(id);
          const subNote = id === 'shortcuts'
            ? `<span class="block text-[11px] font-normal text-slate-500">${shortcutCount ? `ปักหมุดไว้ ${shortcutCount} รายการ` : 'ยังไม่ได้เลือกทางลัด · เลือกได้ที่การ์ด เมนูและทางลัด ด้านล่าง'}</span>`
            : '';
          return `<div class="nav-pref-row" data-widget-row="${id}">
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
              <span class="tm-drag-handle !w-8 !min-h-[44px]" data-widget-drag="${id}" draggable="true" title="ลากเพื่อสลับลำดับ" aria-label="ลาก ${widget.label} เพื่อสลับลำดับ">${iconSvg('drag', { size: 15 })}</span>
              <label class="nav-pref-label flex-1 cursor-pointer"><input type="checkbox" data-widget-visible="${id}" ${hidden ? '' : 'checked'}><span class="min-w-0">${widget.label}${subNote}</span></label>
            </div>
            <div class="nav-pref-actions">
              <button type="button" class="nav-pref-move" data-widget-move="${id}" data-direction="-1" aria-label="ย้าย ${widget.label} ขึ้น" ${index === 0 ? 'disabled' : ''}>${iconSvg('chevron-up', { size: 13 })}</button>
              <button type="button" class="nav-pref-move" data-widget-move="${id}" data-direction="1" aria-label="ย้าย ${widget.label} ลง" ${index === config.order.length - 1 ? 'disabled' : ''}>${iconSvg('chevron-down', { size: 13 })}</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <button type="button" id="st-home-widgets-reset" class="btn btn-ghost text-sm">รีเซ็ตหน้าแรกเป็นค่าเริ่มต้น</button>
    </div>`;
}

export function mountHomeWidgetSettings(root) {
  if (!root) return;
  let config = getHomeWidgetConfig();
  let draggingId = null;
  let pointerDrag = null;

  const persist = message => {
    const active = document.activeElement;
    const focusTarget = active?.matches('[data-widget-visible]')
      ? `[data-widget-visible="${active.dataset.widgetVisible}"]`
      : active?.matches('[data-widget-move]')
        ? `[data-widget-move="${active.dataset.widgetMove}"][data-direction="${active.dataset.direction}"]`
        : active?.id === 'st-home-widgets-reset' ? '#st-home-widgets-reset' : null;
    if (!saveHomeWidgetConfig(config)) {
      toast('บันทึกการตั้งค่าหน้าแรกไม่สำเร็จ โปรดตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์', 'err');
      return;
    }
    config = getHomeWidgetConfig();
    render(root, config);
    if (focusTarget) root.querySelector(focusTarget)?.focus({ preventScroll: true });
    if (message) toast(message);
  };
  const refresh = () => {
    config = getHomeWidgetConfig();
    render(root, config);
  };
  const reorder = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    const from = config.order.indexOf(fromId);
    const to = config.order.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...config.order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    config.order = next;
    persist('บันทึกลำดับหน้าแรกแล้ว');
  };
  const clearDragStyles = () => {
    root.querySelectorAll('.nav-pref-row.is-dragging, .nav-pref-row.is-drop-target').forEach(el => {
      el.classList.remove('is-dragging', 'is-drop-target');
    });
  };

  root.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-widget-visible]')) {
      const id = target.dataset.widgetVisible;
      config.hidden = target.checked ? new Set([...config.hidden].filter(item => item !== id)) : new Set([...config.hidden, id]);
      persist('บันทึกการจัดหน้าแรกแล้ว');
    }
  });

  root.addEventListener('click', async event => {
    const move = event.target.closest('[data-widget-move]');
    if (move) {
      const from = config.order.indexOf(move.dataset.widgetMove);
      const to = from + Number(move.dataset.direction);
      if (from < 0 || to < 0 || to >= config.order.length) return;
      [config.order[from], config.order[to]] = [config.order[to], config.order[from]];
      persist('บันทึกลำดับหน้าแรกแล้ว');
      return;
    }
    if (event.target.closest('#st-home-widgets-reset')) {
      const ok = await confirmDialog({
        title: 'รีเซ็ตส่วนประกอบหน้าแรก?',
        message: 'รีเซ็ตการแสดงผลและลำดับหน้าแรกเป็นค่าเริ่มต้นหรือไม่?',
        confirmText: 'รีเซ็ตหน้าแรก',
        cancelText: 'ยกเลิก',
        danger: true
      });
      if (!ok) return;
      config = { order: HOME_WIDGET_DEFS.map(item => item.id), hidden: new Set(), pinnedShortcuts: config.pinnedShortcuts || [] };
      persist('รีเซ็ตหน้าแรกเป็นค่าเริ่มต้นแล้ว');
    }
  });

  root.addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-widget-drag]');
    const row = handle?.closest('[data-widget-row]');
    if (!handle || !row) return;
    draggingId = row.dataset.widgetRow;
    row.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggingId || '');
      event.dataTransfer.setDragImage?.(row, 20, 20);
    }
  });

  root.addEventListener('dragover', event => {
    if (!draggingId) return;
    const row = event.target.closest('[data-widget-row]');
    if (!row) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    root.querySelectorAll('.nav-pref-row.is-drop-target').forEach(el => {
      if (el !== row) el.classList.remove('is-drop-target');
    });
    if (row.dataset.widgetRow !== draggingId) row.classList.add('is-drop-target');
  });

  root.addEventListener('dragleave', event => {
    const row = event.target.closest('[data-widget-row]');
    if (row && !row.contains(event.relatedTarget)) row.classList.remove('is-drop-target');
  });

  root.addEventListener('drop', event => {
    const row = event.target.closest('[data-widget-row]');
    if (!row) return;
    event.preventDefault();
    const fromId = draggingId || event.dataTransfer?.getData('text/plain');
    const toId = row.dataset.widgetRow;
    draggingId = null;
    clearDragStyles();
    reorder(fromId, toId);
  });

  root.addEventListener('dragend', () => {
    draggingId = null;
    clearDragStyles();
  });

  root.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-widget-drag]');
    if (!handle || event.pointerType === 'mouse') return;
    const row = handle.closest('[data-widget-row]');
    if (!row) return;
    event.preventDefault();
    const id = row.dataset.widgetRow;
    const label = HOME_WIDGET_DEFS.find(item => item.id === id)?.label || '';
    const ghost = document.createElement('div');
    ghost.className = 'tm-drag-ghost';
    ghost.textContent = label;
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    document.body.appendChild(ghost);
    row.classList.add('is-dragging');
    pointerDrag = { id, ghost, pointerId: event.pointerId, targetId: null };
    handle.setPointerCapture?.(event.pointerId);
  });

  window.addEventListener('pointermove', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    pointerDrag.ghost.style.left = `${event.clientX}px`;
    pointerDrag.ghost.style.top = `${event.clientY}px`;
    const hit = document.elementsFromPoint(event.clientX, event.clientY)
      .find(el => el.closest?.('[data-widget-row]'))
      ?.closest('[data-widget-row]');
    root.querySelectorAll('.nav-pref-row.is-drop-target').forEach(el => {
      if (el !== hit) el.classList.remove('is-drop-target');
    });
    const hitId = hit?.dataset.widgetRow || null;
    if (hit && hitId !== pointerDrag.id) hit.classList.add('is-drop-target');
    pointerDrag.targetId = hitId;
  });

  const finishPointerDrag = event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    const { id, ghost, targetId } = pointerDrag;
    pointerDrag = null;
    ghost.remove();
    clearDragStyles();
    if (targetId && targetId !== id) reorder(id, targetId);
  };
  window.addEventListener('pointerup', finishPointerDrag);
  window.addEventListener('pointercancel', finishPointerDrag);

  window.addEventListener('trackme:auth-change', refresh);
  window.addEventListener('trackme:navigation-change', refresh);
  render(root, config);
}
