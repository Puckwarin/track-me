import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateBackoffMs,
  calculateRetryDelayMs,
  clearProviderCooldown,
  dedupeInFlight,
  discoverGeminiModels,
  discoverGroqModels,
  discoverOpenRouterModels,
  getProviderCooldownMs,
  getRetryAfterMs,
  rememberProviderCooldown,
  requestProviderApi,
  runProviderFallback,
  selectGeminiModels,
  selectGroqModels
} from './aiService.js';

class TestStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new TestStorage()
});

describe('AI service', () => {
  beforeEach(() => {
    localStorage.clear();
    ['Gemini', 'Groq', 'OpenRouter'].forEach(clearProviderCooldown);
    vi.restoreAllMocks();
  });

  it('parses Retry-After and Gemini RetryInfo and bounds jittered backoff', () => {
    expect(getRetryAfterMs({ headers: new Headers({ 'Retry-After': '3' }) })).toBe(3000);
    expect(getRetryAfterMs({}, {
      error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '2.5s' }] }
    })).toBe(2500);
    expect(calculateRetryDelayMs({ headers: new Headers({ 'Retry-After': '8' }) }, {}, 0)).toBe(8000);
    expect(calculateBackoffMs(0, () => 0)).toBe(125);
    expect(calculateBackoffMs(9, () => 1)).toBe(2000);
  });

  it('normalizes quota errors, persists cooldown, and does not retry 429', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'rate limit' } }),
      { status: 429, headers: { 'Retry-After': '4' } }
    ));

    await expect(requestProviderApi('Groq', {
      key: 'test-key',
      operation: 'chat',
      model: 'test-model',
      payload: {},
      retries: 2
    })).rejects.toMatchObject({ status: 429, quotaExceeded: true, cooldownMs: 4000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getProviderCooldownMs('Groq')).toBeGreaterThan(0);
  });

  it('does not send requests while a provider cooldown is active', async () => {
    rememberProviderCooldown('Groq', 60_000);
    globalThis.fetch = vi.fn();

    await expect(requestProviderApi('Groq', {
      key: 'test-key',
      operation: 'models'
    })).rejects.toMatchObject({ quotaExceeded: true });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('normalizes invalid credentials without retrying the same provider', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'unauthorized' } }),
      { status: 401 }
    ));

    await expect(requestProviderApi('OpenRouter', {
      key: 'bad-key',
      operation: 'chat',
      model: 'test-model',
      payload: {},
      retries: 3
    })).rejects.toMatchObject({ status: 401, invalidKey: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('deduplicates only in-flight work and releases the entry after completion', async () => {
    let resolveOperation;
    const operation = vi.fn(() => new Promise(resolve => { resolveOperation = resolve; }));
    const first = dedupeInFlight('same', operation);
    const second = dedupeInFlight('same', operation);

    expect(second).toBe(first);
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);
    resolveOperation('done');
    await expect(first).resolves.toBe('done');

    await expect(dedupeInFlight('same', async () => 'again')).resolves.toBe('again');
  });

  it('cancels a request without retrying or falling through providers', async () => {
    let started;
    const requestStarted = new Promise(resolve => { started = resolve; });
    globalThis.fetch = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      started();
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const controller = new AbortController();
    const request = requestProviderApi('Gemini', {
      key: 'test-key',
      operation: 'generateContent',
      model: 'test-model',
      payload: {},
      signal: controller.signal,
      retries: 2
    });

    await requestStarted;
    controller.abort();
    await expect(request).rejects.toMatchObject({ aborted: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cancels model discovery when its caller is aborted', async () => {
    localStorage.setItem('openrouter_key', 'openrouter-cancel');
    let started;
    const requestStarted = new Promise(resolve => { started = resolve; });
    globalThis.fetch = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      started();
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const controller = new AbortController();
    const discovery = discoverOpenRouterModels({ signal: controller.signal });

    await requestStarted;
    controller.abort();
    await expect(discovery).rejects.toMatchObject({ aborted: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('selects eligible providers, skips active cooldowns, and returns provider metadata', async () => {
    rememberProviderCooldown('Gemini', 60_000);
    const fallback = vi.fn().mockResolvedValue('nutrition');
    const result = await runProviderFallback([
      ['Gemini', 'gemini-key', vi.fn()],
      ['Groq', 'groq-key', fallback],
      ['OpenRouter', '', vi.fn()]
    ], { includeMeta: true, emitFallback: false });

    expect(result).toEqual({ result: 'nutrition', provider: 'Groq' });
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('falls back after quota errors and records a provider cooldown', async () => {
    const gemini = vi.fn().mockRejectedValue(Object.assign(new Error('quota exceeded'), {
      quotaExceeded: true,
      cooldownMs: 4000
    }));
    const groq = vi.fn().mockResolvedValue('fallback result');

    await expect(runProviderFallback([
      ['Gemini', 'gemini-key', gemini],
      ['Groq', 'groq-key', groq]
    ])).resolves.toBe('fallback result');

    expect(gemini).toHaveBeenCalledOnce();
    expect(groq).toHaveBeenCalledOnce();
    expect(getProviderCooldownMs('Gemini')).toBeGreaterThan(0);
  });

  it('does not call providers when no API key is configured', async () => {
    const run = vi.fn();
    await expect(runProviderFallback([['Gemini', '', run]])).rejects.toMatchObject({ message: 'NO_KEY' });
    expect(run).not.toHaveBeenCalled();
  });

  it('discovers and filters models for text, tools, images, and Gemini generation', async () => {
    localStorage.setItem('openrouter_key', 'openrouter-test');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [
        { id: 'vendor/paid', pricing: { prompt: '0.01', completion: '0.01' }, supported_parameters: ['tools'], architecture: { modality: 'text->text' } },
        { id: 'vendor/free-text:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], architecture: { modality: 'text->text' } },
        { id: 'vendor/free-image:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], architecture: { modality: 'text+image->text' } },
        { id: 'vendor/free-audio:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'], architecture: { modality: 'audio->text' } }
      ] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'llama-text' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [
        { name: 'models/gemini-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embed', supportedGenerationMethods: ['embedContent'] }
      ] })));

    await expect(discoverOpenRouterModels({ requireTools: true })).resolves.toEqual([
      'vendor/free-text:free',
      'vendor/free-image:free'
    ]);
    await expect(discoverOpenRouterModels({ requireImage: true })).resolves.toEqual(['vendor/free-image:free']);
    await expect(discoverGroqModels('groq-test')).resolves.toEqual(['llama-text']);
    await expect(discoverGeminiModels('gemini-test')).resolves.toEqual(['gemini-flash']);
    await expect(selectGeminiModels('nutrition', 'gemini-test')).resolves.toEqual(['gemini-flash']);
    await expect(selectGroqModels('text', 'groq-test')).resolves.toEqual(['llama-text']);
    await expect(selectGroqModels('vision', 'groq-test')).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
