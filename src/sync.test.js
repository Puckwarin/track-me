import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map();
const unsubMocks = [];

vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn((q, _opts, onNext, onError) => {
    const unsub = vi.fn();
    unsubMocks.push(unsub);
    listeners.set(q, { onNext, onError, unsub });
    return unsub;
  })
}));

vi.mock('./runtimeErrorMonitor.js', () => ({
  reportRuntimeError: vi.fn()
}));

function installDomAndStorageMocks({ online = true } = {}) {
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear()
    }
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: online }
  });
  const nodes = {
    '#sync-dot': { className: '' },
    '#sync-text': { textContent: '' },
    '#sum-sync': { textContent: '' }
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector: sel => nodes[sel] || null
    }
  });
  return { store, nodes };
}

describe('sync watch, snapshot metadata, and offline status indicator', () => {
  beforeEach(() => {
    vi.resetModules();
    listeners.clear();
    unsubMocks.length = 0;
  });

  it('replaces existing listener on same key, maps docs, and updates lastSync only on confirmed server snapshots', async () => {
    const { store, nodes } = installDomAndStorageMocks({ online: true });
    const { watch, stopAll, syncState } = await import('./sync.js');

    const cb = vi.fn();
    const q1 = { name: 'food-day-1' };
    const q2 = { name: 'food-day-2' };

    watch('food', q1, cb);
    expect(unsubMocks).toHaveLength(1);

    // Cache-only or pending snapshots must not mark lastSync as server-synced
    listeners.get(q1).onNext({
      metadata: { fromCache: false, hasPendingWrites: true },
      docs: [{ id: 'd1', data: () => ({ name: 'ข้าวต้ม' }) }]
    });
    expect(cb).toHaveBeenCalledWith([{ id: 'd1', name: 'ข้าวต้ม' }]);
    expect(syncState.pending.food).toBe(true);
    expect(syncState.lastSync).toBe(0);
    expect(nodes['#sync-text'].textContent).toBe('กำลังซิงค์...');

    // Replacing query on same key must unsubscribe the old listener first
    watch('food', q2, cb);
    expect(unsubMocks[0]).toHaveBeenCalledTimes(1);

    // Server-confirmed snapshot (!fromCache && !hasPendingWrites) updates lastSync & storage
    listeners.get(q2).onNext({
      metadata: { fromCache: false, hasPendingWrites: false },
      docs: []
    });
    expect(syncState.pending.food).toBe(false);
    expect(syncState.lastSync).toBeGreaterThan(0);
    expect(Number(store.get('last_sync'))).toBe(syncState.lastSync);
    expect(nodes['#sync-text'].textContent).toBe('ซิงค์แล้ว');

    stopAll();
    expect(unsubMocks[1]).toHaveBeenCalledTimes(1);
    expect(syncState.pending).toEqual({});
  });

  it('records and reports sync errors cleanly and renders offline/pending status text', async () => {
    const { nodes } = installDomAndStorageMocks({ online: false });
    const { reportRuntimeError } = await import('./runtimeErrorMonitor.js');
    const { watch, syncState, syncLineText, renderSyncStatus } = await import('./sync.js');

    syncState.lastSync = 0;
    syncState.pending = { expense_records: true };
    syncState.error = null;
    renderSyncStatus();

    expect(nodes['#sync-text'].textContent).toBe('ออฟไลน์ · รอซิงค์');
    expect(syncLineText()).toContain('ยังไม่เคยซิงค์กับเซิร์ฟเวอร์');
    expect(syncLineText()).toContain('ออฟไลน์ (แสดงข้อมูลที่จำไว้ในเครื่อง)');
    expect(syncLineText()).toContain('มีข้อมูลที่ยังรอซิงค์');
    expect(nodes['#sum-sync'].textContent).toContain('🔄 ');

    const q = { name: 'err-query' };
    watch('body', q, () => {});
    const err = Object.assign(new Error('denied'), { code: 'permission-denied' });
    listeners.get(q).onError(err);

    expect(reportRuntimeError).toHaveBeenCalledWith(err, { category: 'firebase', source: 'sync' });
    expect(syncState.error).toBe('permission-denied');
    expect(nodes['#sync-text'].textContent).toBe('เชื่อมต่อไม่ได้ (permission-denied)');
    expect(nodes['#sync-dot'].className).toContain('bg-rose-400');
  });
});
