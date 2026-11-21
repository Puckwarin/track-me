import { CATEGORIES, GROUPS, SUBTABS, groupOf } from './categories.js';

const DEFAULT_FAVORITES = ['food', 'workout', 'period'];
const PROTECTED_TABS = new Set(['home', 'settings', 'notifications']);
const ALL_TABS = [...new Set([...Object.values(GROUPS).flat(), 'weekly', 'report'])];
const STORAGE_PREFIX = 'trackme-navigation-v1:';

function tabMetadata(tab) {
  const item = SUBTABS[tab];
  if (item) return item;
  const category = CATEGORIES.find(candidate => candidate.tab === tab);
  return category ? { label: category.label, emoji: category.emoji, icon: category.icon } : {};
}

function uniqueAllowedTabs(values, allowed = ALL_TABS) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(value => typeof value === 'string' && allowed.includes(value)))];
}

export function defaultNavigationPreferences() {
  return {
    favorites: [...DEFAULT_FAVORITES],
    landingPage: 'home',
    hiddenTabs: [],
    subnavOrder: Object.fromEntries(Object.entries(GROUPS).map(([group, tabs]) => [group, [...tabs]]))
  };
}

export function readNavigationPreferences(uid) {
  const defaults = defaultNavigationPreferences();
  if (!uid || typeof localStorage === 'undefined') return { ...defaults, customized: false };

  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + uid);
    if (!raw) return { ...defaults, customized: false };
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return { ...defaults, customized: false };

    const favorites = uniqueAllowedTabs(saved.favorites, ALL_TABS.filter(tab => tab !== 'home'));
    const hiddenTabs = uniqueAllowedTabs(saved.hiddenTabs, ALL_TABS.filter(tab => !PROTECTED_TABS.has(tab)));
    const subnavOrder = Object.fromEntries(Object.entries(GROUPS).map(([group, tabs]) => {
      const requested = uniqueAllowedTabs(saved.subnavOrder?.[group], tabs);
      return [group, [...requested, ...tabs.filter(tab => !requested.includes(tab))]];
    }));
    const landingPage = ALL_TABS.includes(saved.landingPage) ? saved.landingPage : 'home';
    return { favorites, hiddenTabs, subnavOrder, landingPage, customized: true };
  } catch {
    return { ...defaults, customized: false };
  }
}

export function saveNavigationPreferences(uid, preferences) {
  if (!uid || typeof localStorage === 'undefined') return false;
  const safe = {
    favorites: uniqueAllowedTabs(preferences?.favorites, ALL_TABS.filter(tab => tab !== 'home')).slice(0, 8),
    hiddenTabs: uniqueAllowedTabs(preferences?.hiddenTabs, ALL_TABS.filter(tab => !PROTECTED_TABS.has(tab))),
    landingPage: ALL_TABS.includes(preferences?.landingPage) ? preferences.landingPage : 'home',
    subnavOrder: Object.fromEntries(Object.entries(GROUPS).map(([group, tabs]) => {
      const requested = uniqueAllowedTabs(preferences?.subnavOrder?.[group], tabs);
      return [group, [...requested, ...tabs.filter(tab => !requested.includes(tab))]];
    }))
  };
  try {
    localStorage.setItem(STORAGE_PREFIX + uid, JSON.stringify(safe));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('trackme:navigation-change'));
    return true;
  } catch {
    return false;
  }
}

export function getSubnavTabs(group, preferences, activeTab) {
  const ordered = preferences?.subnavOrder?.[group] || GROUPS[group] || [];
  const visible = ordered.filter(tab => !preferences?.hiddenTabs?.includes(tab));
  if (activeTab && ordered.includes(activeTab) && !visible.includes(activeTab)) visible.push(activeTab);
  return visible.map(tab => ({ tab, ...tabMetadata(tab) })).filter(item => item.label);
}

export function getHomeShortcuts(preferences) {
  return (preferences?.favorites || DEFAULT_FAVORITES)
    .filter(tab => ALL_TABS.includes(tab) && tab !== 'home')
    .map(tab => ({ tab, group: groupOf(tab), ...tabMetadata(tab) }))
    .filter(item => item.label);
}

export function getAllNavigationTabs() {
  return ALL_TABS.filter(tab => tab !== 'home').map(tab => ({ tab, group: groupOf(tab), ...tabMetadata(tab) }));
}

export function isProtectedNavigationTab(tab) {
  return PROTECTED_TABS.has(tab);
}
