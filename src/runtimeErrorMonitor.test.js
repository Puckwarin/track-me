import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeErrorMonitor } from './runtimeErrorMonitor.js';

describe('runtime error monitor', () => {
  let monitor;

  afterEach(() => {
    monitor?.dispose();
    monitor = null;
    vi.useRealTimers();
  });

  it('deduplicates reports and sends only the privacy-safe metadata in batches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T12:00:00Z'));
    const sink = vi.fn().mockResolvedValue(undefined);
    monitor = createRuntimeErrorMonitor({ sink, isOnline: () => true });
    monitor.setUser('user-1');

    const error = Object.assign(new Error('private health details'), { stack: 'sensitive stack' });
    expect(monitor.report(error, { category: 'api', source: 'food-search' })).toBe(true);
    expect(monitor.report(error, { category: 'api', source: 'food-search' })).toBe(false);
    await expect(monitor.flush()).resolves.toBe(true);

    expect(sink).toHaveBeenCalledOnce();
    expect(sink.mock.calls[0][0]).toBe('user-1');
    expect(sink.mock.calls[0][1]).toEqual([{
      category: 'api',
      code: 'Error',
      source: 'food-search',
      occurredAt: new Date('2026-04-10T12:00:00Z')
    }]);
  });

  it('limits reports per minute and ignores invalid metadata', () => {
    vi.useFakeTimers();
    monitor = createRuntimeErrorMonitor({ sink: vi.fn(), isOnline: () => true });
    monitor.setUser('user-1');

    expect(monitor.report(new Error(), { category: 'unknown', source: 'window' })).toBe(false);
    for (let i = 0; i < 5; i++) {
      expect(monitor.report({ code: `E${i}` }, { category: 'firebase', source: 'sync' })).toBe(true);
    }
    expect(monitor.report({ code: 'E6' }, { category: 'firebase', source: 'sync' })).toBe(false);
  });

  it('buffers while offline and flushes a bounded batch when online', async () => {
    vi.useFakeTimers();
    let online = false;
    const sink = vi.fn().mockResolvedValue(undefined);
    monitor = createRuntimeErrorMonitor({ sink, isOnline: () => online });
    monitor.setUser('user-1');
    for (let i = 0; i < 5; i++) {
      expect(monitor.report({ code: `E${i}` }, { category: 'firebase', source: 'sync' })).toBe(true);
    }

    await expect(monitor.flush()).resolves.toBe(false);
    expect(sink).not.toHaveBeenCalled();
    online = true;
    await expect(monitor.flush()).resolves.toBe(true);
    expect(sink).toHaveBeenCalledOnce();
    expect(sink.mock.calls[0][1]).toHaveLength(5);
  });

  it('contains sink failures and reports them through the safe error callback', async () => {
    vi.useFakeTimers();
    const failure = new Error('transport failed');
    const onSinkError = vi.fn();
    monitor = createRuntimeErrorMonitor({
      sink: vi.fn().mockRejectedValue(failure),
      isOnline: () => true,
      onSinkError
    });
    monitor.setUser('user-1');
    monitor.report({ code: 'permission-denied' }, { category: 'firebase', source: 'sync' });

    await expect(monitor.flush()).resolves.toBe(false);
    expect(onSinkError).toHaveBeenCalledWith(failure);
  });
});
