let catalogue;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ก-๙]+/g,' ').trim();
export async function findExerciseImage(name){
  if(!catalogue) catalogue=fetch('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json').then(r=>{if(!r.ok)throw new Error('โหลดคลังท่าไม่สำเร็จ');return r.json();});
  const list=await catalogue, q=norm(name);
  const exact=list.find(x=>norm(x.name)===q), tokens=q.split(/\s+/).filter(Boolean);
  const best=exact||list.map(x=>({x,score:norm(x.name).split(/\s+/).filter(t=>tokens.includes(t)).length})).sort((a,b)=>b.score-a.score)[0]?.x;
  if(!best?.images?.length)return null;
  return {name:best.name,url:'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'+best.images[0]};
}
