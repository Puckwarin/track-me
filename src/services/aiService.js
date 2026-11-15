const KEY_NAMES = {
  Gemini: 'gemini_key',
  Groq: 'groq_key',
  OpenRouter: 'openrouter_key'
};
const COOLDOWN_KEY_PREFIX = 'trackme_ai_cooldown_';
const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MODEL_CACHE_MS = 5 * 60 * 1000;
const MAX_RETRIES = 1;
const MAX_RETRY_DELAY_MS = 2000;
const MAX_RETRY_AFTER_DELAY_MS = 30_000;
const GEMINI_MODELS = {
  nutrition: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'],
  chat: ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
};
const GROQ_MODELS = {
  text: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  vision: ['llama-3.2-11b-vision-preview', 'llama-3.2-90b-vision-preview']
};
const cooldowns = new Map();
const modelCache = new Map();
const inFlight = new Map();

export class AiServiceError extends Error {
  constructor(message, properties = {}) {
    super(message);
    this.name = 'AiServiceError';
    Object.assign(this, properties);
  }
}

export const getProviderKey = provider => localStorage.getItem(KEY_NAMES[provider]) || '';
export const setProviderKey = (provider, key) => key
  ? localStorage.setItem(KEY_NAMES[provider], key.trim())
  : localStorage.removeItem(KEY_NAMES[provider]);

export function getProviderCooldownMs(provider) {
  const key = COOLDOWN_KEY_PREFIX + provider.toLowerCase();
  let until = cooldowns.get(key) || 0;
  try {
    until = Math.max(until, Number(localStorage.getItem(key)) || 0);
  } catch (error) {
    console.warn('Could not read AI quota wait:', error?.message);
  }
  const remaining = Math.max(0, until - Date.now());
  if (!remaining) {
    cooldowns.delete(key);
    try { localStorage.removeItem(key); } catch (error) {
      console.warn('Could not clear expired AI quota wait:', error?.message);
    }
  }
  return remaining;
}

export function rememberProviderCooldown(provider, cooldownMs = DEFAULT_COOLDOWN_MS) {
  const key = COOLDOWN_KEY_PREFIX + provider.toLowerCase();
  const until = Date.now() + Math.min(MAX_COOLDOWN_MS, Math.max(1000, Number(cooldownMs) || DEFAULT_COOLDOWN_MS));
  cooldowns.set(key, until);
  try {
    localStorage.setItem(key, String(until));
  } catch (error) {
    console.warn('Could not persist AI quota wait:', error?.message);
  }
}

export function clearProviderCooldown(provider) {
  const key = COOLDOWN_KEY_PREFIX + provider.toLowerCase();
  cooldowns.delete(key);
  try { localStorage.removeItem(key); } catch (error) {
    console.warn('Could not clear AI quota wait:', error?.message);
  }
}

export function getRetryAfterMs(response, data = {}) {
  const retryAfter = response?.headers?.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(MAX_COOLDOWN_MS, Math.max(1000, seconds * 1000));
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) return Math.min(MAX_COOLDOWN_MS, dateDelay);
  }
  const details = Array.isArray(data?.error?.details) ? data.error.details : [];
  const retryInfo = details.find(detail => String(detail?.['@type'] || '').includes('RetryInfo'))?.retryDelay;
  const retryInfoText = String(retryInfo || '').match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/i);
  if (retryInfoText) {
    const multiplier = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[retryInfoText[2].toLowerCase()];
    return Math.min(MAX_COOLDOWN_MS, Math.max(1000, Number(retryInfoText[1]) * multiplier));
  }
  const retryText = String(retryInfo || data?.error?.message || '').match(/(?:retry|try again)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(ms|s|m|h)/i);
  if (retryText) {
    const multiplier = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[retryText[2].toLowerCase()];
    return Math.min(MAX_COOLDOWN_MS, Math.max(1000, Number(retryText[1]) * multiplier));
  }
  return DEFAULT_COOLDOWN_MS;
}

export function calculateBackoffMs(attempt, random = Math.random) {
  const ceiling = Math.min(MAX_RETRY_DELAY_MS, 250 * (2 ** attempt));
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

export function dedupeInFlight(key, operation) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = Promise.resolve().then(operation).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function providerUrl(provider, operation, model) {
  if (provider === 'Gemini') {
    return operation === 'models'
      ? 'https://generativelanguage.googleapis.com/v1beta/models'
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  }
  const base = provider === 'Groq'
    ? 'https://api.groq.com/openai/v1'
    : 'https://openrouter.ai/api/v1';
  return operation === 'models' ? `${base}/models` : `${base}/chat/completions`;
}

function providerHeaders(provider, key, headers = {}) {
  const auth = provider === 'Gemini'
    ? { 'x-goog-api-key': key }
    : { Authorization: 'Bearer ' + key };
  const routerHeaders = provider === 'OpenRouter' ? {
    'HTTP-Referer': globalThis.location?.origin || 'https://puckwarin.github.io/track-me',
    'X-Title': 'Track Me'
  } : {};
  return { ...auth, ...routerHeaders, ...headers };
}

function normalizeProviderError(provider, response, data) {
  const status = response.status;
  const message = data?.error?.message || `${provider} HTTP ${status}`;
  const invalidKey = provider === 'Gemini'
    ? (status === 400 && /api.?key|invalid/i.test(message)) || status === 403
    : status === 401 || status === 403;
  const quotaExceeded = provider === 'Gemini'
    ? status === 429 || /quota|resource.?exhausted/i.test(message)
    : [402, 429].includes(status) || /quota|rate.?limit/i.test(message);
  const serverBusy = status === 503 || /high demand|temporarily unavailable|overloaded/i.test(message);
  const retryable = [500, 502, 503, 504].includes(status) || serverBusy;
  const error = new AiServiceError(message, {
    provider,
    status,
    invalidKey,
    modelNotFound: provider === 'Gemini' && status === 404,
    quotaExceeded,
    serverBusy,
    retryable,
    responseData: data
  });
  if (quotaExceeded) error.cooldownMs = getRetryAfterMs(response, data);
  return error;
}

export function calculateRetryDelayMs(response, data, attempt, random = Math.random) {
  const retryAfter = response.headers?.get('retry-after');
  const retryInfo = data?.error?.details?.some(detail =>
    String(detail?.['@type'] || '').includes('RetryInfo')
  );
  const retryMessage = /(?:retry|try again)[^0-9]{0,20}\d+(?:\.\d+)?\s*(?:ms|s|m|h)/i.test(data?.error?.message || '');
  if (retryAfter || retryInfo || retryMessage) {
    return Math.min(MAX_RETRY_AFTER_DELAY_MS, getRetryAfterMs(response, data));
  }
  return calculateBackoffMs(attempt, random);
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AiServiceError('AI request cancelled', { aborted: true }));
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timer);
      reject(new AiServiceError('AI request cancelled', { aborted: true }));
    }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function requestProviderApi(provider, {
  key = getProviderKey(provider),
  operation = 'chat',
  model,
  payload,
  headers = {},
  signal,
  timeoutMs = 35_000,
  retries = MAX_RETRIES
} = {}) {
  if (!key) throw new AiServiceError('NO_KEY', { provider, invalidKey: true });
  if (signal?.aborted) throw new AiServiceError('AI request cancelled', { provider, aborted: true });
  const cooldownMs = getProviderCooldownMs(provider);
  if (cooldownMs) {
    throw new AiServiceError(`${provider} quota cooldown is active`, {
      provider,
      quotaExceeded: true,
      cooldownMs
    });
  }
  const url = providerUrl(provider, operation, model);
  const method = operation === 'models' ? 'GET' : 'POST';
  const requestHeaders = providerHeaders(provider, key, {
    ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    ...headers
  });

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) throw new AiServiceError('AI request cancelled', { provider, aborted: true });
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        ...(method === 'POST' ? { body: JSON.stringify(payload || {}) } : {}),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = normalizeProviderError(provider, response, data);
        if (error.quotaExceeded) rememberProviderCooldown(provider, error.cooldownMs);
        if (error.retryable && attempt < retries) {
          await wait(calculateRetryDelayMs(response, data, attempt), signal);
          continue;
        }
        throw error;
      }
      return data;
    } catch (cause) {
      if (cause instanceof AiServiceError) throw cause;
      if (signal?.aborted) throw new AiServiceError('AI request cancelled', { provider, aborted: true });
      const isTimeout = timedOut || cause?.name === 'AbortError' || cause?.name === 'TimeoutError';
      const error = new AiServiceError(
        isTimeout ? `หมดเวลารอคำตอบจาก ${provider}` : (cause?.message || `${provider} network error`),
        { provider, timeoutError: isTimeout, networkError: !isTimeout, retryable: true }
      );
      if (attempt < retries) {
        await wait(calculateBackoffMs(attempt), signal);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }
}

export function discoverGeminiModels(key = getProviderKey('Gemini'), { signal } = {}) {
  if (!key) return Promise.resolve([]);
  return discoverRawModels('Gemini', key, signal).then(data => (data.models || [])
    .filter(model => (model.supportedGenerationMethods || []).includes('generateContent'))
    .map(model => String(model.name || '').replace(/^models\//, ''))
    .filter(Boolean));
}

export async function selectGeminiModels(feature = 'nutrition', key = getProviderKey('Gemini'), signal) {
  const primary = GEMINI_MODELS[feature] || GEMINI_MODELS.nutrition;
  let discovered = [];
  try { discovered = await discoverGeminiModels(key, { signal }); } catch (error) {
    if (error.invalidKey || error.quotaExceeded || error.aborted) throw error;
    console.warn('Could not discover Gemini models:', error?.message);
  }
  const eligible = discovered.filter(id =>
    (feature === 'chat' ? /(flash|hydrogen|lite)/i : /(flash|lite)/i).test(id) &&
    !/tts|live|image|audio|embedding|transcribe|thinking|1\.5|2\.0|exp/i.test(id))
  const selectedPrimary = discovered.length
    ? primary.filter(id => eligible.includes(id))
    : primary;
  const base = selectedPrimary.length ? selectedPrimary : eligible.slice(0, 3);
  const extras = eligible.filter(id => !base.includes(id)).slice(0, 3);
  return [...new Set([...base, ...extras])];
}

export function discoverGroqModels(key = getProviderKey('Groq'), { signal } = {}) {
  if (!key) return Promise.resolve([]);
  return discoverRawModels('Groq', key, signal).then(data => (data.data || [])
    .map(model => String(model.id || ''))
    .filter(Boolean)).catch(error => {
    if (error.invalidKey || error.quotaExceeded) throw error;
    console.warn('Could not discover Groq models:', error?.message);
    return [];
  });
}

export async function selectGroqModels(feature = 'text', key = getProviderKey('Groq'), availableModels, signal) {
  const primary = GROQ_MODELS[feature] || GROQ_MODELS.text;
  const discovered = availableModels ?? await discoverGroqModels(key, { signal });
  const eligible = discovered.filter(id => feature === 'vision'
    ? /vision|llava|pixtral/i.test(id)
    : !/whisper|tts|guard|embed|vision|llava|pixtral/i.test(id));
  const selectedPrimary = discovered.length
    ? primary.filter(id => eligible.includes(id))
    : primary;
  const base = selectedPrimary.length ? selectedPrimary : eligible;
  const extras = eligible.filter(id => !base.includes(id));
  return [...new Set([...base, ...extras])].slice(0, 6);
}

export async function discoverOpenRouterModels({ requireTools = false, requireImage = false, signal } = {}) {
  const key = getProviderKey('OpenRouter');
  if (!key) throw new AiServiceError('NO_KEY', { provider: 'OpenRouter', invalidKey: true });
  const data = await discoverRawModels('OpenRouter', key, signal);
  return (data.data || []).filter(model => {
    const hasPricing = model.pricing?.prompt != null && model.pricing?.completion != null;
    const isFree = String(model.id || '').endsWith(':free')
      || (hasPricing && Number(model.pricing.prompt) === 0 && Number(model.pricing.completion) === 0);
    const modality = String(model.architecture?.modality || '');
    const inputModality = modality.split('->')[0];
    return model.id && isFree && (!modality || /(^|[+])text($|[+])/i.test(inputModality));
  })
    .filter(model => !requireTools || (model.supported_parameters || []).includes('tools'))
    .filter(model => !requireImage || /image/i.test(model.architecture?.modality || ''))
    .map(model => model.id);
}

function discoverRawModels(provider, key, signal) {
  const cacheKey = `${provider}:${key}`;
  const cached = modelCache.get(cacheKey);
  if (cached?.until > Date.now()) return Promise.resolve(cached.data);
  const discover = async () => {
    const data = await requestProviderApi(provider, { key, operation: 'models', signal, timeoutMs: 10_000, retries: 0 });
    modelCache.set(cacheKey, { data, until: Date.now() + MODEL_CACHE_MS });
    return data;
  };
  return signal ? discover() : dedupeInFlight(`models:${cacheKey}`, discover);
}

export async function runProviderFallback(providers, {
  includeMeta = false,
  errorMessage,
  emitFallback = true
} = {}) {
  if (!providers.some(([, key]) => key)) throw new AiServiceError('NO_KEY', { invalidKey: true });
  const errors = [];
  let attempted = 0;
  let quotaExceeded = false;
  for (const [name, key, run] of providers) {
    if (!key) continue;
    const cooldownMs = getProviderCooldownMs(name);
    if (cooldownMs) {
      errors.push(`${name}: รอโควตาอีกประมาณ ${Math.max(1, Math.ceil(cooldownMs / 60_000))} นาที`);
      continue;
    }
    attempted++;
    try {
      const result = await run();
      clearProviderCooldown(name);
      if (emitFallback && (attempted > 1 || errors.length) && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('trackme:ai-fallback', {
          detail: { provider: name, failed: errors.length }
        }));
      }
      return includeMeta ? { result, provider: name } : result;
    } catch (error) {
      if (error.aborted) throw error;
      if (error.quotaExceeded) {
        quotaExceeded = true;
        rememberProviderCooldown(name, error.cooldownMs);
      }
      errors.push(`${name}: ${errorMessage ? errorMessage(error) : error.message || 'error'}`);
    }
  }
  const message = attempted
    ? 'AI ทุกแหล่งที่ตั้งค่าไว้ไม่พร้อมใช้งาน — ' + errors.join(' · ')
    : 'AI ทุกแหล่งที่ตั้งค่าไว้กำลังรอโควตา — ' + errors.join(' · ');
  throw new AiServiceError(message, {
    fallbackErrors: errors,
    quotaExceeded: quotaExceeded || errors.some(error => /429|quota|limit|รอโควตา/i.test(error))
  });
}
