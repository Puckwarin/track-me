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
export async function findExerciseImage(name) {
  if (!catalogue) catalogue = fetch('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json').then(r => {
    if (!r.ok) throw new Error('โหลดคลังท่าไม่สำเร็จ');
    return r.json();
  }).catch(err => { catalogue = null; throw err; });
  const list = await catalogue;
  const ranked = list.map(x => ({ item:x, score:scoreName(name, x.name) }))
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score);
  const best = ranked[0]?.item;
  if (!best?.images?.length) return null;
  return { name:best.name, url:'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'+best.images[0] };
}