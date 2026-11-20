import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.fn();

vi.mock('./util.js', async () => {
  const actual = await vi.importActual('./util.js');
  return {
    ...actual,
    toast: (...args) => toastMock(...args)
  };
});

import { state, on } from './state.js';
import {
  PREVIEW_UID,
  PREVIEW_USER,
  clearPreviewStorage,
  createPreviewDataset,
  getPreviewCollection,
  getPreviewFoodByDate,
  getPreviewRecordsInRange,
  guardPreviewWrite,
  initPreviewStore,
  isPreviewMode,
  previewAddCustomFood,
  previewAddFood,
  previewComputePeriodRoundHint,
  previewDeleteCustomFood,
  previewDeleteFood,
  previewUpdateCustomFood,
  previewUpdateFood,
  registerPreviewFoodWatcher,
  resetPreviewStore
} from './preview.js';

const storageMap = new Map();
const dispatchedEvents = [];

beforeEach(() => {
  toastMock.mockReset();
  storageMap.clear();
  dispatchedEvents.length = 0;

  state.isPreview = false;
  state.todayFood = [];
  state.customFoods = [];

  vi.stubGlobal('localStorage', {
    getItem: key => storageMap.get(key) ?? null,
    setItem: (key, value) => storageMap.set(key, String(value)),
    removeItem: key => storageMap.delete(key)
  });

  vi.stubGlobal('window', {
    dispatchEvent: ev => {
      dispatchedEvents.push(ev?.type || '');
      return true;
    }
  });
});

afterEach(() => {
  resetPreviewStore();
  state.isPreview = false;
  vi.unstubAllGlobals();
});

describe('preview mode state and write guard', () => {
  it('exposes immutable preview user metadata and detects preview mode', () => {
    expect(PREVIEW_UID).toBe('preview-guest');
    expect(PREVIEW_USER).toMatchObject({
      uid: 'preview-guest',
      isAnonymous: true,
      isPreview: true
    });
    expect(Object.isFrozen(PREVIEW_USER)).toBe(true);

    expect(isPreviewMode()).toBe(false);
    expect(guardPreviewWrite('บันทึกรายจ่าย')).toBe(false);
    expect(toastMock).not.toHaveBeenCalled();

    state.isPreview = true;
    expect(isPreviewMode()).toBe(true);
    expect(guardPreviewWrite('บันทึกรายจ่าย')).toBe(true);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toContain('บันทึกรายจ่าย');
  });
});

describe('preview dataset and read helpers', () => {
  it('builds deterministic dataset relative to today across core collections', () => {
    const today = '2026-11-18';
    const dataset = createPreviewDataset(today);

    expect(dataset.food_records.some(r => r.date === today)).toBe(true);
    expect(dataset.custom_foods.length).toBeGreaterThanOrEqual(4);
    expect(dataset.body_records.some(r => r.date === today && r.weight === 56.2)).toBe(true);
    expect(dataset.body_records.some(r => r.id === `zepp_${today}` && r.steps > 0)).toBe(true);
    expect(dataset.expense_records.some(r => r.type === 'income')).toBe(true);
    expect(dataset.settings.some(r => r.id === 'profile')).toBe(true);
    expect(dataset.settings.some(r => r.id === 'planner')).toBe(true);
    expect(dataset.settings.some(r => r.kind === 'expense_budget' && typeof r.category === 'string' && r.amount > 0)).toBe(true);
    expect(dataset.settings.some(r => r.kind === 'expense_rule' && typeof r.keyword === 'string' && typeof r.category === 'string')).toBe(true);
    expect(dataset.pet_profiles[0].name).toBe('โมจิ');
    expect(previewComputePeriodRoundHint()).toBe(28);
  });

  it('returns defensive copies from getPreviewCollection and filters by date range', () => {
    initPreviewStore('2026-11-18');
    const items = getPreviewCollection('food_records');
    expect(items.length).toBeGreaterThan(0);

    const originalName = items[0].name;
    items[0].name = 'แก้ไขชั่วคราว';
    expect(getPreviewCollection('food_records')[0].name).toBe(originalName);

    const range = getPreviewRecordsInRange('food_records', '2026-11-16', '2026-11-18');
    expect(range.length).toBeGreaterThan(0);
    expect(range.every(r => r.date >= '2026-11-16' && r.date <= '2026-11-18')).toBe(true);
    expect(getPreviewCollection('unknown_collection')).toEqual([]);
  });

  it('clears preview-only localStorage keys without touching other accounts', () => {
    storageMap.set(`trackme-navigation-v1:${PREVIEW_UID}`, '{}');
    storageMap.set(`trackme_home_widgets:v1:${PREVIEW_UID}`, '{}');
    storageMap.set(`summary_cache_${PREVIEW_UID}`, '{}');
    storageMap.set('trackme-navigation-v1:real-user', '{"kept":true}');

    clearPreviewStorage();

    expect(storageMap.has(`trackme-navigation-v1:${PREVIEW_UID}`)).toBe(false);
    expect(storageMap.has(`trackme_home_widgets:v1:${PREVIEW_UID}`)).toBe(false);
    expect(storageMap.has(`summary_cache_${PREVIEW_UID}`)).toBe(false);
    expect(storageMap.get('trackme-navigation-v1:real-user')).toBe('{"kept":true}');
  });
});

describe('preview in-memory food and custom food mutations', () => {
  it('supports food CRUD and notifies registered food watcher', async () => {
    const today = '2026-11-18';
    initPreviewStore(today);

    const watchedSnapshots = [];
    registerPreviewFoodWatcher(today, rows => watchedSnapshots.push(rows));
    const initialCount = watchedSnapshots[0].length;
    expect(initialCount).toBe(getPreviewFoodByDate(today).length);

    const added = await previewAddFood({
      date: today,
      mealId: 'dinner',
      meal: 'มื้อเย็น',
      name: 'เต้าหู้ย่างซีอิ๊ว',
      calories: 210,
      protein: 18,
      carbs: 12,
      fat: 9
    });
    expect(added.id).toMatch(/^pf_/);
    expect(getPreviewFoodByDate(today).length).toBe(initialCount + 1);
    expect(dispatchedEvents).toContain('trackme:data-change');

    await previewUpdateFood(added.id, { calories: 250, name: 'เต้าหู้ย่างงา' });
    const updated = getPreviewFoodByDate(today).find(r => r.id === added.id);
    expect(updated).toMatchObject({ calories: 250, name: 'เต้าหู้ย่างงา' });

    await previewDeleteFood(added.id);
    expect(getPreviewFoodByDate(today).some(r => r.id === added.id)).toBe(false);
    expect(watchedSnapshots.at(-1).length).toBe(initialCount);
  });

  it('supports custom food CRUD and updates state.customFoods', async () => {
    initPreviewStore('2026-11-18');
    const events = [];
    const listener = () => events.push('customFoods');
    on('customFoods', listener);

    const initialLen = getPreviewCollection('custom_foods').length;
    const added = await previewAddCustomFood({
      name: 'นมถั่วเหลืองไม่หวาน',
      unit: 'กล่อง',
      gramsPerUnit: 250,
      calories: 110,
      protein: 9,
      carbs: 6,
      fat: 5
    });
    expect(added.id).toMatch(/^pcf_/);
    expect(state.customFoods.length).toBe(initialLen + 1);

    await previewUpdateCustomFood(added.id, { calories: 120 });
    expect(state.customFoods.find(item => item.id === added.id)?.calories).toBe(120);

    await previewDeleteCustomFood(added.id);
    expect(state.customFoods.some(item => item.id === added.id)).toBe(false);
    expect(events.length).toBe(3);
  });
});
