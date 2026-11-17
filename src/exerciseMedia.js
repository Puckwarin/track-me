import { reportRuntimeError } from './runtimeErrorMonitor.js';

let catalogue;
const STOP_WORDS = new Set(['in','on','of','with','and','to','from','the','a','an','at','by']);
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ก-๙]+/g,' ').trim();
const tokens=s=>norm(s).split(/\s+/).filter(t=>t && !STOP_WORDS.has(t));
function scoreName(query, candidate) {
  const q = tokens(query), c = tokens(candidate);
  if (!q.length || !c.length) return 0;
  if (norm(query) === norm(candidate)) return 1;
  // A single generic word is too ambiguous to match safely.
  if (q.length === 1) return 0;
  const overlap = q.filter(t => c.includes(t)).length;
  const precision = overlap / q.length;
  const recall = overlap / c.length;
  const jaccard = overlap / new Set([...q, ...c]).size;
  return precision >= .8 && recall >= .5 && jaccard >= .6 ? .7 * precision + .3 * recall : 0;
}
const EX_CACHE = 'trackme_eximg_v1';
const EX_CACHE_MAX = 300;

function readExCache() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const parsed = JSON.parse(localStorage.getItem(EX_CACHE) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeExCache(key, value) {
  try {
    if (typeof localStorage === 'undefined' || !key || !value?.url) return;
    const cache = readExCache();
    cache[key] = { ...value, t: Date.now() };
    const keys = Object.keys(cache).sort((a, b) => (cache[a]?.t || 0) - (cache[b]?.t || 0));
    keys.slice(0, Math.max(0, keys.length - EX_CACHE_MAX)).forEach(k => delete cache[k]);
    localStorage.setItem(EX_CACHE, JSON.stringify(cache));
  } catch {
    // Ignore storage quota errors
  }
}

export async function findExerciseImage(name) {
  const key = norm(name) || String(name || '').toLowerCase().trim();
  if (!key) return null;
  const cached = readExCache()[key];
  if (cached?.url) return { name: cached.name, url: cached.url };

  if (!catalogue) catalogue = fetch('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json').then(r => {
    if (!r.ok) throw new Error('โหลดคลังท่าไม่สำเร็จ');
    return r.json();
  }).catch(err => {
    catalogue = null;
    reportRuntimeError(err, { category: 'api', source: 'exercise-media' });
    throw err;
  });
  const list = await catalogue;
  const ranked = list.map(x => ({ item:x, score:scoreName(name, x.name) }))
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score);
  const best = ranked[0]?.item;
  if (!best?.images?.length) return null;
  const result = { name:best.name, url:'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'+best.images[0] };
  writeExCache(key, result);
  return result;
}