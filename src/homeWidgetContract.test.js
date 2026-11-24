import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_WIDGET_DEFS, HOME_WIDGET_IDS, getHomeWidgetConfig, saveHomeWidgetConfig } from './home.js';
import { state } from './state.js';

describe('home widget customization contract', () => {
  const originalHomeWidgets = state.homeWidgets;
  const originalProfile = state.profile;
  const originalUid = state.uid;
  let values;

  beforeEach(() => {
    state.homeWidgets = null;
    state.profile = null;
    state.uid = 'user-a';
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    });
  });

  afterEach(() => {
    state.homeWidgets = originalHomeWidgets;
    state.profile = originalProfile;
    state.uid = originalUid;
    vi.unstubAllGlobals();
  });

  it('exposes stable widget IDs and definitions matching all slots', () => {
    expect(HOME_WIDGET_IDS).toEqual([
      'planner',
      'daily-overview'
    ]);
    expect(HOME_WIDGET_DEFS.map(def => def.id)).toEqual(HOME_WIDGET_IDS);
  });

  it('returns default order, empty hidden set, and empty shortcuts when unconfigured', () => {
    const cfg = getHomeWidgetConfig();
    expect(cfg.order).toEqual(HOME_WIDGET_IDS);
    expect([...cfg.hidden]).toEqual([]);
    expect(cfg.pinnedShortcuts).toEqual([]);
  });

  it('applies custom order, hidden widgets, and pinnedShortcuts while discarding invalid IDs', () => {
    state.homeWidgets = {
      order: ['daily-overview', 'unknown-widget', 'quick-access'],
      hidden: ['planner'],
      pinnedShortcuts: ['food', 'expense', '', null]
    };

    const cfg = getHomeWidgetConfig();
    expect(cfg.order).toEqual([
      'daily-overview',
      'planner'
    ]);
    expect([...cfg.hidden]).toEqual(['planner']);
    expect(cfg.pinnedShortcuts).toEqual(['food', 'expense']);
  });

  it('reads from state.profile.homeWidgets or localStorage and survives malformed JSON', () => {
    state.profile = {
      homeWidgets: {
        order: ['daily-overview', 'planner'],
        hidden: ['daily-overview'],
        pinnedShortcuts: ['workout']
      }
    };
    let cfg = getHomeWidgetConfig();
    expect(cfg.order[0]).toBe('daily-overview');
    expect(cfg.hidden.has('daily-overview')).toBe(true);
    expect(cfg.pinnedShortcuts).toEqual(['workout']);

    state.profile = null;
    vi.stubGlobal('localStorage', {
      getItem: key => key === 'trackme_home_widgets:v1:user-a' ? '{bad-json' : null,
      setItem: () => {}
    });
    cfg = getHomeWidgetConfig();
    expect(cfg.order).toEqual(HOME_WIDGET_IDS);
    expect([...cfg.hidden]).toEqual([]);
  });

  it('stores widget preferences under the active account and sanitizes values', () => {
    expect(saveHomeWidgetConfig({
      order: ['daily-overview', 'daily-overview', 'invalid'],
      hidden: ['planner', 'invalid'],
      pinnedShortcuts: ['food', 'food', 'invalid']
    })).toBe(true);

    expect(JSON.parse(values.get('trackme_home_widgets:v1:user-a'))).toEqual({
      order: ['daily-overview', 'planner'],
      hidden: ['planner'],
      pinnedShortcuts: ['food']
    });
    state.uid = 'user-b';
    state.homeWidgets = null;
    expect(getHomeWidgetConfig().order).toEqual(HOME_WIDGET_IDS);
  });

  it('does not read or save preferences without a signed-in account', () => {
    state.uid = null;
    values.set('trackme_home_widgets', JSON.stringify({ hidden: ['planner'] }));
    expect(getHomeWidgetConfig().hidden.has('planner')).toBe(false);
    expect(saveHomeWidgetConfig({ hidden: ['planner'] })).toBe(false);
  });
});
