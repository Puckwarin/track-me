import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map();

class FakeElement {
  constructor({ control = false, navigation = false } = {}) {
    this.control = control;
    this.navigation = navigation;
  }

  closest(selector) {
    if (selector === 'button, a, [role="button"]') return this.control ? this : null;
    if (selector.includes('[data-nav]')) return this.navigation ? this : null;
    return null;
  }
}

describe('demo preview mode', () => {
  beforeEach(() => {
    vi.resetModules();
    listeners.clear();
    globalThis.Element = FakeElement;
    globalThis.document = {
      documentElement: { dataset: {} },
      addEventListener: (type, listener) => listeners.set(type, listener)
    };
  });

  it('seeds sample data and removes demo mode on exit', async () => {
    const { state } = await import('./state.js');
    const { enterDemoMode, exitDemoMode, isPreviewMode, seedDemoState } = await import('./demo.js');

    expect(enterDemoMode()).toBe(true);
    expect(isPreviewMode()).toBe(true);
    expect(document.documentElement.dataset.demoMode).toBe('true');

    seedDemoState();
    expect(state.user).toBeNull();
    expect(state.uid).toBeNull();
    expect(state.demoFoodRecords).toHaveLength(41);
    expect(state.period).toHaveLength(3);
    expect(state.loaded.todayFood).toBe(true);

    exitDemoMode();
    expect(isPreviewMode()).toBe(false);
    expect(document.documentElement.dataset.demoMode).toBeUndefined();
  });

  it('blocks demo data actions but allows navigation', async () => {
    const { enterDemoMode } = await import('./demo.js');
    enterDemoMode();

    const saveEvent = {
      target: new FakeElement({ control: true }),
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn()
    };
    listeners.get('click')(saveEvent);
    expect(saveEvent.preventDefault).toHaveBeenCalledOnce();
    expect(saveEvent.stopImmediatePropagation).toHaveBeenCalledOnce();

    const navigationEvent = {
      target: new FakeElement({ control: true, navigation: true }),
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn()
    };
    listeners.get('click')(navigationEvent);
    expect(navigationEvent.preventDefault).not.toHaveBeenCalled();
    expect(navigationEvent.stopImmediatePropagation).not.toHaveBeenCalled();
  });
});
