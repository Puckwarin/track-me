import { openModal, esc } from './util.js';
import { safeHttpUrl } from './workoutParser.js';

const SECTION_ORDER = ['warmup', 'main', 'cooldown'];
const SECTION_TITLES = { warmup:'วอร์มอัพ (Warm-up)', main:'ท่าหลัก (Main workout)', cooldown:'คูลดาวน์ (Cool-down)' };
const imageMarkup = r => r.imageUrl
  ? '<img data-exercise-image src="'+esc(r.imageUrl)+'" alt="ตัวอย่างท่า '+esc(r.name)+'" loading="lazy" class="w-full h-full object-cover rounded-2xl">'
  : '<div data-image-placeholder class="w-full h-full min-h-28 rounded-2xl bg-slate-100 text-slate-400 flex flex-col items-center justify-center gap-2 text-xs"><span class="text-3xl">🏋️</span><span>ยังไม่มีภาพตัวอย่าง</span></div>';

function refMarkup(r) {
  const url = safeHttpUrl(r.refUrl);
  const title = (r.refTitle || '').trim();
  if (url) {
    return '<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 rounded-lg bg-sky-soft/80 border border-sky-200 px-2.5 py-1 text-xs text-blue-800 hover:bg-sky-soft"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i><span class="truncate max-w-[240px]">'+esc(title || url)+'</span></a>';
  }
  if (title) {
    const q = 'https://www.google.com/search?q=' + encodeURIComponent(title);
    return '<div class="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600"><span>🔗 '+esc(title)+'</span><a href="'+esc(q)+'" target="_blank" rel="noopener noreferrer" class="text-blue-700 underline font-medium">ค้นหาลิงก์</a></div>';
  }
  return '';
}

export function runActiveWorkout(rows, onFinish) {
  const started = Date.now();
  let restTimer = null, restSeconds = 0;
  const groups = SECTION_ORDER.map(section => {
    const members = rows.map((r,ri)=>({r,ri})).filter(x=>x.r.section===section);
    if (!members.length) return '';
    const cards = members.map(({r,ri}) => {
      const count = Math.max(1, Math.min(30, Number(r.sets)||1));
      const checks = Array.from({length:count},(_,si)=>
        '<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm"><input type="checkbox" data-done data-ri="'+ri+'" data-si="'+si+'" class="accent-brand"> เซต '+(si+1)+'</label>'
      ).join('');
      const weight = r.weightKg != null ? '<span class="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">'+esc(r.weightKg)+' kg'+(r.perSide?'/ข้าง':'')+'</span>' : '';
      const reps = (r.reps ?? '—')+' '+(r.repUnit==='sec'?'วินาที':r.repUnit==='min'?'นาที':'ครั้ง');
      return '<article class="grid grid-cols-[4rem_1fr] gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(9rem,11rem)_1fr] md:gap-5 md:p-5">'+
        '<div class="aspect-square overflow-hidden rounded-2xl bg-slate-100 md:aspect-[4/5]">'+imageMarkup(r)+'</div>'+
        '<div class="min-w-0 space-y-2 md:space-y-3"><h4 class="text-base font-semibold text-slate-800 md:text-xl">'+esc(r.name)+'</h4>'+
        '<div class="flex flex-wrap items-center gap-2">'+weight+'<strong class="text-base md:text-lg">'+count+' × '+esc(reps)+'</strong></div>'+
        refMarkup(r)+
        (r.note?'<p class="text-sm leading-relaxed text-slate-600 md:text-base">'+esc(r.note)+'</p>':'')+
        '<div class="flex flex-wrap gap-2 pt-1">'+checks+'</div></div></article>';
    }).join('');
    return '<section class="space-y-3"><h3 class="font-semibold text-slate-700">'+esc(SECTION_TITLES[section])+'</h3><div class="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5">'+cards+'</div></section>';
  }).join('');
  const m = openModal('<div class="flex justify-between items-start gap-3"><div><h3 class="font-bold text-lg md:text-xl">กำลังออกกำลังกาย</h3><p class="text-sm text-slate-500">แตะเมื่อทำแต่ละเซตเสร็จ</p></div><b id="active-time" class="text-lg tabular-nums">00:00</b></div>'+
    '<div class="flex gap-2 mt-3"><button id="active-rest" class="btn btn-soft">พัก 60 วินาที</button><span id="active-rest-time" class="self-center text-sm text-slate-500"></span></div>'+
    '<div class="max-h-[55vh] overflow-y-auto md:max-h-[65vh] space-y-5 mt-4">'+groups+'</div><div class="flex justify-end mt-4"><button id="active-finish" class="btn btn-primary">จบและบันทึกผล</button></div>',{wide:true});
  const time=m.el.querySelector('#active-time'), rest=m.el.querySelector('#active-rest-time');
  const clock=setInterval(()=>{const n=Math.floor((Date.now()-started)/1000);time.textContent=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');},1000);
  const clear=()=>{clearInterval(clock);clearInterval(restTimer);};
  m.el.addEventListener('click',e=>{if(e.target.closest('[data-close]'))clear();});
  m.el.addEventListener('error',e=>{
    if (!e.target.matches('[data-exercise-image]')) return;
    e.target.remove();
    const placeholder=document.createElement('div');
    placeholder.dataset.imagePlaceholder='';
    placeholder.className='w-full h-full min-h-28 rounded-2xl bg-slate-100 text-slate-400 flex flex-col items-center justify-center gap-2 text-xs';
    placeholder.innerHTML='<span class="text-3xl">🏋️</span><span>ภาพนี้เปิดไม่ได้</span>';
    e.target.parentElement.append(placeholder);
  },true);
  m.el.querySelector('#active-rest').onclick=()=>{clearInterval(restTimer);restSeconds=60;rest.textContent='01:00';restTimer=setInterval(()=>{restSeconds--;rest.textContent=restSeconds>0?'00:'+String(restSeconds).padStart(2,'0'):'พักครบแล้ว';if(restSeconds<=0)clearInterval(restTimer);},1000);};
  m.el.querySelector('#active-finish').onclick=async()=>{
    const done=[...m.el.querySelectorAll('[data-done]:checked')].map(c=>{const ri=+c.dataset.ri,si=+c.dataset.si,r=rows[ri];return {name:r.name,section:r.section,set:si+1,weightKg:r.weightKg??null,reps:r.reps??null,repUnit:r.repUnit||'reps',completed:true};});
    try{await onFinish(done,Math.max(1,Math.round((Date.now()-started)/60000)));clear();m.close();}catch(e){throw e;}
  };
}