import { openModal, esc } from './util.js';
export function runActiveWorkout(rows, onFinish) {
  const started=Date.now();
  let restTimer=null, restSeconds=0;
  const cards=rows.map((r,ri)=>{
    const sets=Array.from({length:Math.max(1,Math.min(30,Number(r.sets)||1))},(_,si)=>
      '<div class="grid grid-cols-[auto_1fr_1fr] gap-2 items-center"><label class="text-xs"><input type="checkbox" data-done data-ri="'+ri+'" data-si="'+si+'"> เซต '+(si+1)+'</label><input class="input" type="number" step=".5" aria-label="น้ำหนัก" data-weight data-ri="'+ri+'" data-si="'+si+'" placeholder="kg" value="'+(r.weightKg??'')+'"><input class="input" type="number" aria-label="จำนวนครั้ง" data-reps data-ri="'+ri+'" data-si="'+si+'" placeholder="ครั้ง" value="'+(r.reps??'')+'"></div>').join('');
    return '<section class="rounded-xl border p-3 space-y-2"><div class="flex items-center gap-3">'+(r.imageUrl?'<img src="'+esc(r.imageUrl)+'" alt="" class="w-16 h-16 object-contain rounded-lg">':'')+'<b>'+esc(r.name)+'</b></div><p class="text-xs text-slate-500">'+esc(r.sectionLabel)+' · แผน '+r.sets+' เซต</p><div class="space-y-2">'+sets+'</div></section>';
  }).join('');
  const m=openModal('<div class="flex justify-between"><h3 class="font-bold text-lg">กำลังออกกำลังกาย</h3><b id="active-time">00:00</b></div><div class="flex gap-2 mt-2"><button id="active-rest" class="btn btn-soft">พัก 60 วินาที</button><span id="active-rest-time" class="self-center text-sm"></span></div><div class="max-h-[55vh] overflow-y-auto space-y-3 mt-3">'+cards+'</div><div class="flex justify-end mt-3"><button id="active-finish" class="btn btn-primary">จบและบันทึก</button></div>',{wide:true});
  const time=m.el.querySelector('#active-time'), rest=m.el.querySelector('#active-rest-time');
  const clock=setInterval(()=>{const n=Math.floor((Date.now()-started)/1000);time.textContent=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');},1000);
  const clear=()=>{clearInterval(clock);clearInterval(restTimer);};
  m.el.addEventListener('click',e=>{if(e.target.closest('[data-close]'))clear();});
  m.el.querySelector('#active-rest').onclick=()=>{clearInterval(restTimer);restSeconds=60;rest.textContent='01:00';restTimer=setInterval(()=>{restSeconds--;rest.textContent=restSeconds>0?'00:'+String(restSeconds).padStart(2,'0'):'พักครบแล้ว';if(restSeconds<=0)clearInterval(restTimer);},1000);};
  m.el.querySelector('#active-finish').onclick=async()=>{
    const done=[...m.el.querySelectorAll('[data-done]:checked')].map(c=>{const ri=+c.dataset.ri,si=+c.dataset.si;return {name:rows[ri].name,section:rows[ri].section,set:si+1,weightKg:Number(m.el.querySelector('[data-weight][data-ri="'+ri+'"][data-si="'+si+'"]').value)||null,reps:Number(m.el.querySelector('[data-reps][data-ri="'+ri+'"][data-si="'+si+'"]').value)||null,completed:true};});
    try{await onFinish(done,Math.max(1,Math.round((Date.now()-started)/60000)));clear();m.close();}catch(e){throw e;}
  };
}
