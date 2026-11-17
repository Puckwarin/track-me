import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_WIDGET_DEFS, HOME_WIDGET_IDS, getHomeWidgetConfig } from './home.js';
import { state } from './state.js';

describe('home widget customization contract', () => {
  const originalHomeWidgets = state.homeWidgets;
  const originalProfile = state.profile;

  beforeEach(() => {
    state.homeWidgets = null;
    state.profile = null;
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {}
    });
  });

  afterEach(() => {
    state.homeWidgets = originalHomeWidgets;
    state.profile = originalProfile;
    vi.unstubAllGlobals();
  });

  it('exposes stable widget IDs and definitions matching all slots', () => {
    expect(HOME_WIDGET_IDS).toEqual([
      'daily-overview',
      'quick-access',
      'planner',
      'daily-activity',
      'reminders'
    ]);
    expect(HOME_WIDGET_DEFS.map(def => def.id)).toEqual(HOME_WIDGET_IDS);
  });

  it('returns default order, empty hidden set, and empty shortcuts when unconfigured', () => {
    const cfg = getHomeWidgetConfig();
    expect(cfg.order).toEqual(HOME_WIDGET_IDS);
    expect([...cfg.hidden]).toEqual([]);
    expect(cfg.pinnedShortcuts).toEqual([]);
  });

  it('applies Team 2 order, hidden widgets, and pinnedShortcuts while discarding invalid IDs', () => {
    state.homeWidgets = {
      order: ['reminders', 'unknown-widget', 'quick-access'],
      hidden: ['planner'],
      pinnedShortcuts: ['food', 'expense', '', null]
    };

    const cfg = getHomeWidgetConfig();
    expect(cfg.order).toEqual([
      'reminders',
      'quick-access',
      'daily-overview',
      'planner',
      'daily-activity'
    ]);
    expect([...cfg.hidden]).toEqual(['planner']);
    expect(cfg.pinnedShortcuts).toEqual(['food', 'expense']);
  });

  it('reads from state.profile.homeWidgets or localStorage and survives malformed JSON', () => {
    state.profile = {
      homeWidgets: {
        order: ['daily-activity', 'daily-overview'],
        hidden: ['reminders'],
        pinnedShortcuts: ['workout']
      }
    };
    let cfg = getHomeWidgetConfig();
    expect(cfg.order[0]).toBe('daily-activity');
    expect(cfg.hidden.has('reminders')).toBe(true);
    expect(cfg.pinnedShortcuts).toEqual(['workout']);

    state.profile = null;
    vi.stubGlobal('localStorage', {
      getItem: key => key === 'trackme_home_widgets' ? '{bad-json' : null
    });
    cfg = getHomeWidgetConfig();
    expect(cfg.order).toEqual(HOME_WIDGET_IDS);
    expect([...cfg.hidden]).toEqual([]);
  });
});
