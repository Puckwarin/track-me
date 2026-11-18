import { CATEGORIES } from './categories.js';
import { HOME_WIDGET_DEFS, getHomeWidgetConfig, saveHomeWidgetConfig } from './home.js';
import { toast } from './util.js';
import { iconSvg } from './icons.js';

function render(root, config) {
  root.innerHTML = `
    <div class="space-y-4">
      <div>
        <h4 class="text-sm font-semibold text-slate-700">ส่วนประกอบหน้าแรก</h4>
        <p class="text-xs text-slate-500 mt-1">เลือกส่วนที่ต้องการแสดง และใช้ปุ่มลูกศรจัดลำดับ การตั้งค่านี้แยกตามบัญชีและเก็บในอุปกรณ์นี้</p>
      </div>
      <div class="nav-pref-list">
        ${config.order.map((id, index) => {
          const widget = HOME_WIDGET_DEFS.find(item => item.id === id);
          if (!widget) return '';
          const hidden = config.hidden.has(id);
          return `<div class="nav-pref-row">
            <label class="nav-pref-label"><input type="checkbox" data-widget-visible="${id}" ${hidden ? '' : 'checked'}><span>${widget.label}</span></label>
            <div class="nav-pref-actions">
              <button type="button" class="nav-pref-move" data-widget-move="${id}" data-direction="-1" aria-label="ย้าย ${widget.label} ขึ้น" ${index === 0 ? 'disabled' : ''}>${iconSvg('chevron-up', { size: 13 })}</button>
              <button type="button" class="nav-pref-move" data-widget-move="${id}" data-direction="1" aria-label="ย้าย ${widget.label} ลง" ${index === config.order.length - 1 ? 'disabled' : ''}>${iconSvg('chevron-down', { size: 13 })}</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div>
        <h4 class="text-sm font-semibold text-slate-700">ปักหมุดทางลัดบันทึกด่วน</h4>
        <p class="text-xs text-slate-500 mt-1">เลือกหมวดที่ต้องการให้แสดงในส่วนทางลัดบนหน้าแรก หากไม่เลือกจะแสดงทุกหมวด</p>
        <div class="nav-pref-list mt-2">
          ${CATEGORIES.map(category => `<div class="nav-pref-row"><label class="nav-pref-label"><input type="checkbox" data-widget-shortcut="${category.key}" ${config.pinnedShortcuts.includes(category.key) || config.pinnedShortcuts.includes(category.tab) ? 'checked' : ''}><span aria-hidden="true">${category.emoji}</span><span>${category.label}</span></label></div>`).join('')}
        </div>
      </div>
      <button type="button" id="st-home-widgets-reset" class="btn btn-ghost text-sm">รีเซ็ตหน้าแรกเป็นค่าเริ่มต้น</button>
    </div>`;
}

export function mountHomeWidgetSettings(root) {
  if (!root) return;
  let config = getHomeWidgetConfig();
  const persist = message => {
    const active = document.activeElement;
    const focusTarget = active?.matches('[data-widget-visible]')
      ? `[data-widget-visible="${active.dataset.widgetVisible}"]`
      : active?.matches('[data-widget-shortcut]')
        ? `[data-widget-shortcut="${active.dataset.widgetShortcut}"]`
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

  root.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-widget-visible]')) {
      const id = target.dataset.widgetVisible;
      config.hidden = target.checked ? new Set([...config.hidden].filter(item => item !== id)) : new Set([...config.hidden, id]);
      persist('บันทึกการจัดหน้าแรกแล้ว');
      return;
    }
    if (target.matches('[data-widget-shortcut]')) {
      const key = target.dataset.widgetShortcut;
      config.pinnedShortcuts = target.checked
        ? [...config.pinnedShortcuts.filter(item => item !== key), key]
        : config.pinnedShortcuts.filter(item => item !== key && item !== CATEGORIES.find(category => category.key === key)?.tab);
      persist('บันทึกทางลัดแล้ว');
    }
  });

  root.addEventListener('click', event => {
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
      if (!window.confirm('รีเซ็ตการแสดงผล ลำดับ และทางลัดหน้าแรกเป็นค่าเริ่มต้นหรือไม่?')) return;
      config = { order: HOME_WIDGET_DEFS.map(item => item.id), hidden: new Set(), pinnedShortcuts: [] };
      persist('รีเซ็ตหน้าแรกเป็นค่าเริ่มต้นแล้ว');
    }
  });
  window.addEventListener('trackme:auth-change', refresh);
  render(root, config);
}
