import { GROUPS } from './categories.js';
import { getAllNavigationTabs, readNavigationPreferences, saveNavigationPreferences, isProtectedNavigationTab } from './navigation.js';
import { $, toast } from './util.js';
import { state } from './state.js';
import { iconSvg } from './icons.js';

const GROUP_LABELS = { home: 'หน้าหลัก', food: 'อาหาร', health: 'สุขภาพ', care: 'ดูแล', more: 'เพิ่มเติม' };
const ITEMS = [{ tab: 'home', label: 'หน้าหลัก', emoji: '⌂', group: 'home' }, ...getAllNavigationTabs()];

function render(root, preferences) {
  const landing = $('#st-nav-landing', root);
  landing.innerHTML = ITEMS.map(item => `<option value="${item.tab}">${GROUP_LABELS[item.group]} · ${item.label}</option>`).join('');
  landing.value = preferences.landingPage;

  $('#st-nav-favorites', root).innerHTML = ITEMS.filter(item => item.tab !== 'home').map(item => {
    const index = preferences.favorites.indexOf(item.tab);
    const selected = index >= 0;
    return `<div class="nav-pref-row"><label class="nav-pref-label"><input type="checkbox" data-nav-favorite="${item.tab}" ${selected ? 'checked' : ''}><span aria-hidden="true">${item.emoji}</span><span>${item.label}</span></label><div class="nav-pref-actions"><button type="button" class="nav-pref-move" data-nav-move="favorite" data-tab="${item.tab}" data-direction="-1" aria-label="ย้าย ${item.label} ขึ้น" ${!selected || index === 0 ? 'disabled' : ''}>${iconSvg('chevron-up', { size: 13 })}</button><button type="button" class="nav-pref-move" data-nav-move="favorite" data-tab="${item.tab}" data-direction="1" aria-label="ย้าย ${item.label} ลง" ${!selected || index === preferences.favorites.length - 1 ? 'disabled' : ''}>${iconSvg('chevron-down', { size: 13 })}</button></div></div>`;
  }).join('');

  $('#st-nav-submenus', root).innerHTML = Object.entries(GROUPS).filter(([, tabs]) => tabs.length > 1).map(([group, tabs]) => {
    const order = preferences.subnavOrder[group] || tabs;
    return `<section class="nav-pref-group"><h5 class="text-xs font-semibold uppercase tracking-wide text-slate-500">${GROUP_LABELS[group] || group}</h5>${order.map((tab, index) => {
      const item = ITEMS.find(candidate => candidate.tab === tab);
      const protectedTab = isProtectedNavigationTab(tab);
      const hidden = preferences.hiddenTabs.includes(tab);
      return `<div class="nav-pref-row"><label class="nav-pref-label"><input type="checkbox" data-nav-visible="${tab}" ${!hidden ? 'checked' : ''} ${protectedTab ? 'disabled' : ''}><span aria-hidden="true">${item?.emoji || ''}</span><span>${item?.label || tab}</span>${protectedTab ? '<small class="text-slate-400">จำเป็น</small>' : ''}</label><div class="nav-pref-actions"><button type="button" class="nav-pref-move" data-nav-move="${group}" data-tab="${tab}" data-direction="-1" aria-label="ย้าย ${item?.label || tab} ขึ้น" ${index === 0 ? 'disabled' : ''}>${iconSvg('chevron-up', { size: 13 })}</button><button type="button" class="nav-pref-move" data-nav-move="${group}" data-tab="${tab}" data-direction="1" aria-label="ย้าย ${item?.label || tab} ลง" ${index === order.length - 1 ? 'disabled' : ''}>${iconSvg('chevron-down', { size: 13 })}</button></div></div>`;
    }).join('')}</section>`;
  }).join('');
}

export function mountNavigationSettings(root) {
  if (!root) return;
  let currentUid = state.uid;
  let preferences = readNavigationPreferences(currentUid);
  const refreshForUser = () => {
    if (currentUid === state.uid) return;
    currentUid = state.uid;
    preferences = readNavigationPreferences(currentUid);
    render(root, preferences);
  };
  window.addEventListener('trackme:auth-change', refreshForUser);
  const persist = message => {
    refreshForUser();
    if (!saveNavigationPreferences(state.uid, preferences)) {
      toast('บันทึกเมนูไม่สำเร็จ โปรดตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์', 'err');
      return false;
    }
    render(root, preferences);
    if (message) toast(message);
    return true;
  };

  root.addEventListener('change', event => {
    const target = event.target;
    if (target.id === 'st-nav-landing') {
      preferences.landingPage = target.value;
      persist('บันทึกหน้าเริ่มต้นแล้ว');
      return;
    }
    if (target.matches('[data-nav-favorite]')) {
      const tab = target.dataset.navFavorite;
      if (target.checked && preferences.favorites.length >= 8) {
        target.checked = false;
        return toast('เลือกทางลัดได้สูงสุด 8 รายการ', 'err');
      }
      preferences.favorites = target.checked
        ? [...preferences.favorites, tab]
        : preferences.favorites.filter(item => item !== tab);
      persist('บันทึกทางลัดแล้ว');
      return;
    }
    if (target.matches('[data-nav-visible]')) {
      const tab = target.dataset.navVisible;
      preferences.hiddenTabs = target.checked
        ? preferences.hiddenTabs.filter(item => item !== tab)
        : [...preferences.hiddenTabs, tab];
      persist('บันทึกเมนูย่อยแล้ว');
    }
  });

  root.addEventListener('click', event => {
    const move = event.target.closest('[data-nav-move]');
    if (move) {
      const { navMove, tab, direction } = move.dataset;
      const list = navMove === 'favorite' ? preferences.favorites : preferences.subnavOrder[navMove];
      const from = list.indexOf(tab);
      const to = from + Number(direction);
      if (from < 0 || to < 0 || to >= list.length) return;
      [list[from], list[to]] = [list[to], list[from]];
      persist('บันทึกลำดับเมนูแล้ว');
      return;
    }
    if (event.target.closest('#st-nav-reset')) {
      if (!window.confirm('รีเซ็ตทางลัด ลำดับเมนู และหน้าเริ่มต้นเป็นค่าเริ่มต้นหรือไม่? ข้อมูลอื่นของบัญชีจะไม่เปลี่ยนแปลง')) return;
      preferences = readNavigationPreferences(null);
      preferences.customized = false;
      try {
        if (state.uid) localStorage.removeItem(`trackme-navigation-v1:${state.uid}`);
        try { sessionStorage.removeItem('active_tab'); } catch {}
        window.dispatchEvent(new Event('trackme:navigation-change'));
        render(root, preferences);
        toast('รีเซ็ตเมนูเป็นค่าเริ่มต้นแล้ว');
      } catch {
        toast('รีเซ็ตเมนูไม่สำเร็จ', 'err');
      }
    }
  });

  render(root, preferences);
}
