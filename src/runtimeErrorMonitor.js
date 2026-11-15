const CATEGORIES = new Set(['global', 'unhandled_rejection', 'api', 'ai', 'firebase', 'chunk']);
const SOURCES = new Set(['window', 'sync', 'auth', 'ai-service', 'food-search', 'exercise-media', 'chunk-recovery', 'feature-load']);
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REPORTS_PER_WINDOW = 5;
const MAX_BUFFERED_REPORTS = 20;
const MAX_BATCH_SIZE = 10;

export function createRuntimeErrorMonitor({
  sink,
  now = Date.now,
  isOnline = () => true,
  onSinkError = () => {},
  flushDelayMs = 10_000
} = {}) {
  const queue = [];
  const recent = [];
  const seen = new Map();
  let userId = null;
  let timer = null;
  let flushPromise = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const scheduleFlush = () => {
    if (!userId || !sink || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, flushDelayMs);
  };

  const setSink = nextSink => {
    sink = typeof nextSink === 'function' ? nextSink : undefined;
    if (queue.length) scheduleFlush();
  };

  const setUser = nextUserId => {
    const next = typeof nextUserId === 'string' && nextUserId ? nextUserId : null;
    if (next !== userId) {
      clearTimer();
      queue.length = 0;
      userId = next;
    }
    if (queue.length) scheduleFlush();
  };

  const report = (error, { category, source } = {}) => {
    if (!userId || !CATEGORIES.has(category) || !SOURCES.has(source)) return false;

    const timestamp = now();
    for (const [key, seenAt] of seen) {
      if (timestamp - seenAt >= DEDUPE_WINDOW_MS) seen.delete(key);
    }
    while (recent.length && timestamp - recent[0] >= RATE_WINDOW_MS) recent.shift();
    if (recent.length >= MAX_REPORTS_PER_WINDOW) return false;

    let rawCode;
    try {
      rawCode = typeof error?.code === 'string' ? error.code
        : typeof error?.name === 'string' ? error.name
          : 'Error';
    } catch {
      rawCode = 'Error';
    }
    const code = /^[A-Za-z0-9_./-]{1,64}$/.test(rawCode) ? rawCode : 'Error';
    const key = `${category}:${source}:${code}`;
    if (seen.has(key)) return false;

    seen.set(key, timestamp);
    recent.push(timestamp);
    queue.push({ category, code, source, occurredAt: new Date(timestamp) });
    if (queue.length > MAX_BUFFERED_REPORTS) queue.shift();
    scheduleFlush();
    return true;
  };

  const flush = () => {
    if (!userId || !sink || !queue.length || !isOnline()) return Promise.resolve(false);
    if (flushPromise) return flushPromise;

    const batch = queue.splice(0, MAX_BATCH_SIZE);
    const batchUserId = userId;
    flushPromise = Promise.resolve()
      .then(() => sink(batchUserId, batch))
      .then(() => true)
      .catch(error => {
        try {
          onSinkError(error);
        } catch {
          // Monitoring failures must never affect application behavior.
        }
        return false;
      })
      .finally(() => {
        flushPromise = null;
        if (queue.length) scheduleFlush();
      });
    return flushPromise;
  };

  const dispose = () => {
    clearTimer();
    queue.length = 0;
    recent.length = 0;
    seen.clear();
    userId = null;
  };

  return { report, setSink, setUser, flush, dispose };
}

const monitor = createRuntimeErrorMonitor({
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  onSinkError: error => {
    let code = error?.code || error?.name || 'unknown';
    if (typeof code !== 'string' || !/^[A-Za-z0-9_./-]{1,64}$/.test(code)) code = 'unknown';
    console.warn('Runtime error report could not be sent:', code);
  }
});

export const reportRuntimeError = (error, metadata) => monitor.report(error, metadata);
export const setRuntimeErrorSink = sink => monitor.setSink(sink);
export const setRuntimeErrorUser = userId => monitor.setUser(userId);

let initialized = false;
export function initRuntimeErrorMonitoring() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('error', event => {
    reportRuntimeError(event.error, { category: 'global', source: 'window' });
  });
  window.addEventListener('unhandledrejection', event => {
    reportRuntimeError(event.reason, { category: 'unhandled_rejection', source: 'window' });
  });
  window.addEventListener('online', () => { void monitor.flush(); });
  window.addEventListener('pagehide', () => { void monitor.flush(); });
}
