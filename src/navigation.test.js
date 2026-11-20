import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultNavigationPreferences,
  getHomeShortcuts,
  getSubnavTabs,
  readNavigationPreferences,
  saveNavigationPreferences
} from './navigation.js';

const store = new Map();

function installStorage() {
  vi.stubGlobal('localStorage', {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  });
}

afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

describe('navigation preferences', () => {
  it('uses familiar defaults without persisting a record', () => {
    installStorage();
    const preferences = readNavigationPreferences('user-1');
    expect(preferences.customized).toBe(false);
    expect(preferences.favorites).toEqual(['food', 'workout', 'period']);
    expect(preferences.landingPage).toBe('home');
    expect(store.size).toBe(0);
    expect(getHomeShortcuts(preferences).map(item => item.tab)).toEqual(['food', 'workout', 'period']);
  });

  it('saves preferences per account and preserves complete submenu ordering', () => {
    installStorage();
    const preferences = defaultNavigationPreferences();
    preferences.favorites = ['care', 'expense'];
    preferences.landingPage = 'weekly';
    preferences.subnavOrder.health = ['body', 'overview', 'workout', 'period', 'symptoms'];
    expect(saveNavigationPreferences('user-1', preferences)).toBe(true);
    expect(readNavigationPreferences('user-1')).toMatchObject({
      customized: true,
      favorites: ['care', 'expense'],
      landingPage: 'weekly',
      subnavOrder: { health: preferences.subnavOrder.health }
    });
    expect(readNavigationPreferences('user-2').customized).toBe(false);
  });

  it('ignores invalid tabs and never hides essential Settings or notifications', () => {
    installStorage();
    store.set('trackme-navigation-v1:user-1', JSON.stringify({
      favorites: ['settings', 'unknown', 'food', 'food'],
      hiddenTabs: ['settings', 'notifications', 'report'],
      landingPage: 'not-a-tab',
      subnavOrder: { health: ['unknown', 'report'] }
    }));
    const preferences = readNavigationPreferences('user-1');
    expect(preferences.favorites).toEqual(['settings', 'food']);
    expect(preferences.landingPage).toBe('home');
    expect(preferences.hiddenTabs).toEqual(['report']);
    expect(getSubnavTabs('more', preferences).map(item => item.tab)).toEqual(['notifications', 'settings']);
    expect(getSubnavTabs('health', preferences).map(item => item.tab)).toEqual(['overview', 'workout', 'period', 'symptoms', 'body']);
  });

  it('keeps weekly summaries and reports accessible outside the compact health submenu', () => {
    const preferences = defaultNavigationPreferences();
    expect(getSubnavTabs('health', preferences).map(item => item.tab)).toEqual(['overview', 'workout', 'period', 'symptoms', 'body']);
    expect(getHomeShortcuts({ favorites: ['weekly', 'report'] }).map(item => item.tab)).toEqual(['weekly', 'report']);
  });
});
