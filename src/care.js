import { addDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, localDateStr, toast } from './util.js';
import { watch } from './sync.js';
import { readPetFoodLabel, explainGeminiError } from './nutrition.js';
import { mountLab, render as renderLab } from './lab.js';

let root, petFormDirty = false;
const $r = s => $(s, root);
const d = s => s ? new Date(`${s}T00:00:00`) : null;
const num = id => { const v = $r('#' + id).value; return v === '' ? null : Number(v); };

export function mountCare(el) {
  root = el;
  root.innerHTML = `
  <section class="card space-y-4 lg:col-span-2">
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div><h2 class="text-lg font-bold">🐾 Pet Health & Care</h2><p class="text-xs text-slate-500">ข้อมูลสุขภาพ น้ำหนัก อาหาร การแพ้ และผลเลือดของน้อง</p></div>
      <span class="text-xs text-slate-500 bg-lav-soft px-3 py-1 rounded-full">📌 ตารางนัด/วัคซีนอยู่ที่เมนู <b>บันทึกเตือน</b></span>
    </header>
    <div class="grid sm:grid-cols-2 gap-3"><input id="pet-name" class="input" placeholder="ชื่อน้อง"><input id="pet-kind" class="input" placeholder="พันธุ์/ชนิด"><label class="text-sm">วันเกิด<input id="pet-birth" type="date" class="input"></label><input id="pet-weight" type="number" min="0.1" step="0.1" class="input" placeholder="น้ำหนัก (kg)"><select id="pet-life" class="input"><option value="neutered">โตเต็มวัย ทำหมัน</option><option value="intact">โตเต็มวัย ยังไม่ทำหมัน</option><option value="inactive">กิจกรรมน้อย/น้ำหนักขึ้นง่าย</option><option value="puppy-young">ลูกสุนัขอายุต่ำกว่า 4 เดือน</option><option value="puppy-old">ลูกสุนัข 4 เดือนขึ้นไป</option></select></div>
    <button id="pet-save" class="btn btn-primary">บันทึกข้อมูลน้อง/น้ำหนัก</button>
    <div id="pet-profile" class="rounded-xl bg-amber-50 p-3 text-sm"></div>
    <div class="rounded-xl border border-slate-200 p-3"><h3 class="font-semibold">แนวโน้มน้ำหนัก</h3><p class="text-xs text-slate-500">บันทึกน้ำหนักได้วันละครั้ง กราฟจะเก็บประวัติไว้กับโปรไฟล์น้อง</p><div id="pet-weight-chart" class="mt-2 overflow-x-auto"></div></div>

    <div class="border-t pt-3 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-semibold">อาหารและแคลอรี</h3>
        <label class="chip bg-lav-soft text-brand-dark cursor-pointer">
          <input id="pet-food-scan" type="file" accept="image/*" class="hidden">
          <i class="fa-solid fa-camera"></i> สแกนจากซองอาหาร
        </label>
      </div>
      <p id="pet-food-scan-status" class="hidden text-xs text-slate-500"></p>
      <p id="pet-calorie-estimate" class="text-xs text-slate-600"></p>
      <div class="grid sm:grid-cols-3 gap-2"><input id="pet-food-name" class="input" placeholder="อาหาร/ขนม"><input id="pet-food-grams" type="number" min="0" step="1" class="input" placeholder="ปริมาณ (g)"><input id="pet-food-kcal" type="number" min="0" step="1" class="input" placeholder="kcal ต่อ 100g"></div>
      <div class="grid sm:grid-cols-2 gap-2"><select id="pet-food-allergy" class="input"><option value="unknown">สถานะการแพ้: ยังไม่ทราบ</option><option value="no">ไม่พบอาการแพ้</option><option value="yes">สงสัยว่าแพ้</option></select><input id="pet-food-notes" class="input" placeholder="อาการ/รายละเอียด เช่น คราบน้ำตา, โปรตีน 28%"></div>
      <button id="pet-food-save" class="btn btn-soft">บันทึกอาหาร</button>
      <div id="pet-food-list" class="space-y-1 text-sm"></div>
    </div>
    <p class="text-xs text-slate-400">ค่าพลังงานเป็นเพียงจุดเริ่มต้นโดยประมาณ ควรปรับตามสภาพร่างกายและคำแนะนำสัตวแพทย์</p>
  </section>
  <div id="care-lab" class="lg:col-span-2 grid grid-cols-1 lg:grid-cols-3 gap-6"></div>`;

  $r('#pet-save').onclick = savePet;
  $r('#pet-food-save').onclick = savePetFood;
  $r('#pet-food-scan').addEventListener('change', onScanPetFood);
  ['#pet-name', '#pet-kind', '#pet-birth', '#pet-weight', '#pet-life'].forEach(sel => $r(sel).addEventListener('input', () => { petFormDirty = true; renderPetEstimate(); }));
  $r('#pet-food-kcal').addEventListener('input', renderPetEstimate);
  mountLab($r('#care-lab'));
  renderAll();
}

export function watchCare(uid) {
  for (const [key, col] of [['petProfiles', 'pet_profiles'], ['petCare', 'pet_care_records'], ['petFoods', 'pet_food_records']]) {
    watch(`care:${col}`, userCol(uid, col), records => { state[key] = records; renderAll(); window.dispatchEvent(new Event('trackme:data-change')); });
  }
}

function renderAll() {
  if (!root?.isConnected) return;
  renderPet(); renderPetWeight(); renderPetFoods(); renderLab();
}

async function onScanPetFood(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  const st = $r('#pet-food-scan-status');
  st.className = 'text-xs text-slate-500';
  st.textContent = 'กำลังอ่านข้อมูลจากซองอาหารด้วย AI...';
  try {
    const res = await readPetFoodLabel(f);
    const fullName = [res.brand, res.name].filter(Boolean).join(' · ');
    if (fullName) $r('#pet-food-name').value = fullName;
    if (res.kcalPer100g != null) $r('#pet-food-kcal').value = Math.round(res.kcalPer100g);
    const info = [];
    if (res.proteinPct != null) info.push(`โปรตีน ${res.proteinPct}%`);
    if (res.fatPct != null) info.push(`ไขมัน ${res.fatPct}%`);
    if (res.fiberPct != null) info.push(`ไฟเบอร์ ${res.fiberPct}%`);
    if (res.moisturePct != null) info.push(`ความชื้น ${res.moisturePct}%`);
    if (info.length && !$r('#pet-food-notes').value.trim()) $r('#pet-food-notes').value = info.join(' · ');
    renderPetEstimate();
    st.className = 'text-xs text-green-700';
    st.textContent = `อ่านจากซองแล้ว: ${fullName || 'อาหารสัตว์เลี้ยง'}${res.kcalPer100g != null ? ` · ${Math.round(res.kcalPer100g)} kcal/100g` : ' · ไม่พบตัวเลข kcal บนรูป (กรอกเพิ่มเองได้)'}${info.length ? ` · ${info.join(', ')}` : ''}`;
  } catch (err) {
    st.className = 'text-xs text-rose-600';
    st.textContent = explainGeminiError(err);
  }
}

async function savePet(){const name=$r('#pet-name').value.trim(),weight=num('pet-weight');if(!name||!weight)return toast('กรอกชื่อน้องและน้ำหนักก่อนค่ะ','err');const old=(state.petProfiles||[])[0],today=localDateStr(),history=(old?.weightHistory||[]).filter(x=>x&&typeof x.date==='string'&&Number.isFinite(Number(x.weightKg))).map(x=>({date:x.date,weightKg:Number(x.weightKg)}));const sameDay=history.findIndex(x=>x.date===today);if(sameDay>=0)history[sameDay]={date:today,weightKg:weight};else history.push({date:today,weightKg:weight});history.sort((a,b)=>a.date.localeCompare(b.date));const data={name,kind:$r('#pet-kind').value.trim(),birthDate:$r('#pet-birth').value||null,weightKg:weight,weightHistory:history.slice(-365),lifeStage:$r('#pet-life').value,updatedAt:new Date()};try{if(old)await setDoc(userDoc(state.uid,'pet_profiles',old.id),data,{merge:true});else await addDoc(userCol(state.uid,'pet_profiles'),{...data,createdAt:new Date()});petFormDirty=false;toast('บันทึกข้อมูลและน้ำหนักแล้ว');}catch(e){toast(e.message,'err');}}
const ageText=birthDate=>{if(!birthDate)return 'ไม่ระบุวันเกิด';const b=d(birthDate),now=d(localDateStr());if(b>now)return 'วันเกิดอยู่ในอนาคต';let years=now.getFullYear()-b.getFullYear(),months=now.getMonth()-b.getMonth();if(now.getDate()<b.getDate())months--;if(months<0){years--;months+=12;}return years?`${years} ปี ${months} เดือน`:`${Math.max(0,months)} เดือน`;};
function renderPet(){const p=(state.petProfiles||[])[0];if(p&&!petFormDirty){$r('#pet-name').value=p.name||'';$r('#pet-kind').value=p.kind||'';$r('#pet-birth').value=p.birthDate||'';$r('#pet-weight').value=p.weightKg||'';$r('#pet-life').value=p.lifeStage||'neutered';}renderPetEstimate();}
function renderPetWeight(){const p=(state.petProfiles||[])[0],chart=$r('#pet-weight-chart');if(!p){chart.innerHTML='<p class="text-xs text-slate-500">เพิ่มข้อมูลน้องก่อนเพื่อเริ่มบันทึกน้ำหนัก</p>';return;}let rows=(p.weightHistory||[]).filter(x=>x&&typeof x.date==='string'&&Number.isFinite(Number(x.weightKg))).map(x=>({date:x.date,weightKg:Number(x.weightKg)}));if(!rows.length&&Number(p.weightKg)>0){const stamp=p.updatedAt?.toDate?.()||p.updatedAt;const date=stamp instanceof Date&&!Number.isNaN(stamp.getTime())?stamp.toISOString().slice(0,10):localDateStr();rows=[{date,weightKg:Number(p.weightKg)}];}rows.sort((a,b)=>a.date.localeCompare(b.date));if(!rows.length){chart.innerHTML='<p class="text-xs text-slate-500">ยังไม่มีข้อมูลน้ำหนัก</p>';return;}const w=Math.max(360,rows.length*74),h=190,pad={l:42,r:14,t:16,b:34},vals=rows.map(x=>x.weightKg),lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(1,hi-lo),x=i=>pad.l+(rows.length===1?(w-pad.l-pad.r)/2:i*(w-pad.l-pad.r)/(rows.length-1)),y=v=>pad.t+(hi-v+span*.12)/(span*1.24)*(h-pad.t-pad.b),points=rows.map((r,i)=>`${x(i)},${y(r.weightKg)}`).join(' ');chart.innerHTML=`<svg role="img" aria-label="กราฟแนวโน้มน้ำหนัก ${esc(p.name)}" viewBox="0 0 ${w} ${h}" class="block w-full max-w-3xl"><title>แนวโน้มน้ำหนัก ${esc(p.name)}</title><line x1="${pad.l}" y1="${h-pad.b}" x2="${w-pad.r}" y2="${h-pad.b}" stroke="currentColor" opacity=".25"/><polyline points="${points}" fill="none" stroke="#8b5e3c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.weightKg)}" r="4" fill="#8b5e3c"><title>${esc(r.date)} · ${r.weightKg} kg</title></circle><text x="${x(i)}" y="${h-10}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".75">${esc(r.date.slice(5))}</text>`).join('')}<text x="${pad.l-6}" y="${pad.t+8}" text-anchor="end" font-size="11" fill="currentColor">${hi.toFixed(1)} kg</text><text x="${pad.l-6}" y="${h-pad.b-2}" text-anchor="end" font-size="11" fill="currentColor">${lo.toFixed(1)} kg</text></svg>`;}
function renderPetEstimate(){const p=(state.petProfiles||[])[0],weight=num('pet-weight')??p?.weightKg;if(!weight){$r('#pet-profile').textContent='เพิ่มข้อมูลน้องและน้ำหนักเพื่อประเมินพลังงานต่อวัน';$r('#pet-calorie-estimate').textContent='';return;}const name=$r('#pet-name').value.trim()||p?.name||'น้อง',kind=$r('#pet-kind').value.trim()||p?.kind||'ไม่ระบุพันธุ์',birth=$r('#pet-birth').value||p?.birthDate||null;const factors={neutered:1.5,intact:1.7,inactive:1.1,'puppy-young':3,'puppy-old':2};const factor=factors[$r('#pet-life').value]||1.5,rer=70*Math.pow(weight,.75),min=Math.round(rer*factor*.9),max=Math.round(rer*factor*1.1),kcal100=num('pet-food-kcal');const grams=kcal100>0?` · เมื่ออาหารนี้ให้ ${kcal100} kcal/100g: ประมาณ ${Math.round(min*100/kcal100)}–${Math.round(max*100/kcal100)} g/วัน`:'';$r('#pet-profile').textContent=`${name} · ${kind} · วันเกิด ${birth||'ไม่ระบุ'} (${ageText(birth)}) · ${weight} kg`;$r('#pet-calorie-estimate').textContent=`พลังงานเริ่มต้นประเมิน ${min}–${max} kcal/วัน (RER ${Math.round(rer)} × ปัจจัย ${factor}; ปรับตามคำแนะนำสัตวแพทย์)${grams}`;}
async function savePetFood(){const p=(state.petProfiles||[])[0],name=$r('#pet-food-name').value.trim(),grams=num('pet-food-grams'),kcal=num('pet-food-kcal');if(!p||!name||grams===null)return toast('กรอกข้อมูลน้อง ชื่ออาหาร และปริมาณก่อนค่ะ','err');try{await addDoc(userCol(state.uid,'pet_food_records'),{petId:p.id,date:localDateStr(),name,grams,kcalPer100:kcal,allergy:$r('#pet-food-allergy').value,note:$r('#pet-food-notes').value.trim(),createdAt:new Date()});toast('บันทึกอาหารน้องแล้ว');}catch(e){toast(e.message,'err');}}
function renderPetFoods(){const rows=(state.petFoods||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);$r('#pet-food-list').innerHTML=rows.map(x=>`<div class="rounded-lg bg-slate-50 p-2 flex justify-between items-start gap-2"><div>${esc(x.date)} · <b>${esc(x.name)}</b> ${esc(x.grams)} g${x.kcalPer100!=null?` · ${Math.round(x.kcalPer100*x.grams/100)} kcal`:''} · ${x.allergy==='yes'?'⚠️ สงสัยแพ้':x.allergy==='no'?'ไม่พบอาการแพ้':'ยังไม่ทราบ'}<small class="block text-slate-500">${esc(x.note||'')}</small></div><button data-del-pet-food="${esc(x.id)}" class="text-rose-400 text-xs p-1">ลบ</button></div>`).join('')||'<p class="text-xs text-slate-400">ยังไม่มีบันทึกอาหาร</p>';$r('#pet-food-list').onclick=e=>{const b=e.target.closest('[data-del-pet-food]');if(b&&confirm('ลบบันทึกอาหารน้องนี้?'))deleteDoc(userDoc(state.uid,'pet_food_records',b.dataset.delPetFood)).catch(err=>toast(err.message,'err'));};}
