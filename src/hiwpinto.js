import { addDoc, getDocs } from 'firebase/firestore';
import { userCol } from './firebase.js';
import { state } from './state.js';
import { openModal, toast, esc } from './util.js';

const MONTHS = { 'ม.ค.':0,'มกราคม':0,'ก.พ.':1,'กุมภาพันธ์':1,'มี.ค.':2,'มีนาคม':2,'เม.ย.':3,'เมษายน':3,'พ.ค.':4,'พฤษภาคม':4,'มิ.ย.':5,'มิถุนายน':5,'ก.ค.':6,'กรกฎาคม':6,'ส.ค.':7,'สิงหาคม':7,'ก.ย.':8,'กันยายน':8,'ต.ค.':9,'ตุลาคม':9,'พ.ย.':10,'พฤศจิกายน':10,'ธ.ค.':11,'ธันวาคม':11 };
export const cleanHiwpintoName = name => String(name || '').replace(/\s*\((?=[^()]*)(?:[^()]*(?:ข้าว|ขาว|ไรซ์|กล้อง|rice|brown)[^()]*)\)/gi, '').replace(/\s+/g, ' ').trim();
function nextWeekRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() + (7 - weekday));
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const iso = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  return { start: iso(start), end: iso(end) };
}
function parseThaiDate(text) {
  const m = String(text || '').match(/(\d{1,2})\s+([^\s]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month == null) return null;
  const y = +m[3] - (m[3].startsWith('25') ? 543 : 0);
  const d = new Date(y, month, +m[1]);
  return d.getFullYear()===y && d.getMonth()===month ? [y,String(month+1).padStart(2,'0'),String(+m[1]).padStart(2,'0')].join('-') : null;
}
export function parseHiwpintoExport(data, now = new Date()) {
  if (!data || data.source !== 'hiwpinto' || !Array.isArray(data.days)) throw new Error('ข้อมูลไม่ใช่ไฟล์ที่คัดลอกจาก Hiwpinto Sync Helper');
  const range = nextWeekRange(now), entries = [];
  for (const day of data.days) {
    const date = day.date || parseThaiDate(day.dateText);
    if (!date || date < range.start || date > range.end) continue;
    for (const item of day.items || []) {
      const name = cleanHiwpintoName(item.name);
      const nutrition = item.nutrition || {};
      const values = ['calories','protein','carbs','fat'].map(k => Number(nutrition[k]));
      if (!name || values.some(v => !Number.isFinite(v) || v < 0)) continue;
      const [calories, protein, carbs, fat] = values;
      const macroKcal = protein*4 + carbs*4 + fat*9;
      const delta = Math.abs(macroKcal - calories), badEnergy = delta > Math.max(60, calories*.2);
      const rice = /\((?:[^)]*(?:ข้าว|ขาว|ไรซ์|กล้อง|rice|brown)[^)]*)\)/i.test(item.name);
      const brown = /\((?:[^)]*(?:ไรซ์|กล้อง|brown)[^)]*)\)/i.test(item.name);
      entries.push({
        name, date, calories, protein, carbs, fat,
        warning: [badEnergy ? `พลังงานจาก P/C/F ต่างจากค่าร้าน ${Math.round(delta)} kcal` : '', rice ? 'คาร์บส่วนที่มาจากข้าวเป็นค่าประมาณ (สมมติข้าวสุก 180 g)' : ''].filter(Boolean).join(' · '),
        record: {
          name, brand:'Hiwpinto', category:'อาหารคลีน/Hiwpinto', unit:'1 กล่อง', gramsPerUnit:null,
          calories, protein, carbs, fat, favorite:false,
          hiwpinto: { shopCalories:calories, shopProtein:protein, shopCarbs:carbs, shopFat:fat, sideCarbs:null,
            includedRice:rice, riceProfile:brown?'brown':'white', baseRiceGrams:180, riceGrams:180,
            originalRiceGrams:180, kcalWarn: badEnergy ? `Sanity check: P/C/F ให้ ${Math.round(macroKcal)} kcal แต่ร้านระบุ ${calories} kcal` : '' },
          createdAt:new Date()
        }
      });
    }
  }
  return { ...range, entries };
}
const bookmarklet = `javascript:(()=>{const days=[...document.querySelectorAll('.menu-day')].map(d=>({dateText:d.querySelector('h6')?.innerText||'',items:[...d.querySelectorAll('li')].map(li=>{const s=li.querySelector('span'),meta=li.querySelector('.nutrition-meta');const name=[...(s?.childNodes||[])].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();const t=meta?.innerText||'';const n={calories:t.match(/([\\d.]+)\\s*kcal/i)?.[1],protein:t.match(/P\\s*([\\d.]+)/i)?.[1],carbs:t.match(/C\\s*([\\d.]+)/i)?.[1],fat:t.match(/F\\s*([\\d.]+)/i)?.[1]};return name&&Object.values(n).every(v=>v!=null)?{name,nutrition:Object.fromEntries(Object.entries(n).map(([k,v])=>[k,Number(v)]))}:null}).filter(Boolean)}));navigator.clipboard.writeText(JSON.stringify({source:'hiwpinto',days})).then(()=>alert('คัดลอกเมนูที่มีโภชนาการแล้ว กลับไปวางใน Track Me')).catch(()=>alert('คัดลอกไม่ได้ กรุณาอนุญาต clipboard'));})()`;
export function openHiwpintoSync() {
  const m = openModal(`<div class="flex justify-between items-center mb-3"><h3 class="font-bold text-lg">Sync Data Hiwpinto</h3><button data-close class="text-slate-400">ปิด</button></div>
    <p class="text-sm text-slate-600">แอปจะไม่เก็บรหัสผ่าน Hiwpinto ของคุณ ใช้งานง่าย ๆ ใน 2 ขั้นตอน: เปิดหน้าบิลสัปดาห์ถัดไปใน Hiwpinto แล้วกดปุ่ม Bookmark เพื่อดึงข้อมูล จากนั้นกลับมากดวางที่นี่</p>
    <a class="btn btn-soft inline-flex mt-2" href="https://hiwpinto.com/hippinto/customer-portal/" target="_blank" rel="noopener noreferrer">เปิด Hiwpinto</a>
    <div class="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><h4 class="font-semibold">การตั้งค่า Bookmark ครั้งแรก</h4><p class="mt-1 text-slate-600">กด “คัดลอก Sync Helper” แล้วสร้าง Bookmark ชื่อ “Sync Hiwpinto” โดยวางโค้ดในช่อง URL ดูขั้นตอนละเอียดใน SETUP.md</p></div>
    <div class="mt-3 rounded-xl bg-lav-soft/50 p-3 text-sm"><h4 class="font-semibold">การใช้งานทุกสัปดาห์</h4><p class="mt-1 text-slate-600">เปิดบิลสัปดาห์ถัดไปใน Hiwpinto → กด Bookmark “Sync Hiwpinto” → กลับมาวางจาก Clipboard แล้วตรวจรายการก่อนนำเข้า</p></div>
    <div class="mt-3 flex flex-wrap gap-2"><button id="hp-copy-helper" class="btn btn-soft">คัดลอก Sync Helper</button><button id="hp-paste-helper" class="btn btn-soft">วางจาก Clipboard</button></div>
    <textarea id="hp-paste" class="input mt-3 min-h-28" placeholder="หรือวาง JSON ที่คัดลอกมา"></textarea>
    <div class="flex justify-end mt-3"><button id="hp-import" class="btn btn-primary">ตรวจเมนูสัปดาห์ถัดไป</button></div><div id="hp-preview" class="mt-3 text-sm"></div>`, {wide:true});
  m.el.querySelector('#hp-copy-helper').onclick=async()=>{try{await navigator.clipboard.writeText(bookmarklet);toast('คัดลอก Sync Helper แล้ว');}catch{toast('คัดลอกไม่ได้ ให้เลือกและคัดลอกข้อความ helper ด้วยตัวเอง','err');}};
  m.el.querySelector('#hp-paste-helper').onclick=async()=>{try{m.el.querySelector('#hp-paste').value=await navigator.clipboard.readText();toast('วางข้อมูลแล้ว');}catch{toast('เบราว์เซอร์ไม่อนุญาต Clipboard — วางในช่องข้อความได้เลย','err');}};
  m.el.querySelector('#hp-import').onclick=async()=>{
    let parsed;try{parsed=parseHiwpintoExport(JSON.parse(m.el.querySelector('#hp-paste').value));}catch(e){return toast(e.message||'อ่านข้อมูลไม่สำเร็จ','err');}
    const {start,end,entries}=parsed, out=m.el.querySelector('#hp-preview');
    if(!entries.length){out.innerHTML=`<p class="text-amber-800">ไม่พบเมนูที่มีโภชนาการในสัปดาห์ถัดไป (${start}–${end}). ตรวจว่าเลือกบิลสัปดาห์ถัดไปก่อนรัน helper</p>`;return;}
    let library=state.customFoods||[];try{library=(await getDocs(userCol(state.uid,'custom_foods'))).docs.map(d=>d.data());}catch(err){return toast('อ่านคลังอาหารเพื่อตรวจชื่อซ้ำไม่ได้: '+err.message,'err');}
    const existing=new Set(library.map(f=>cleanHiwpintoName(f.name).toLocaleLowerCase('th')));
    const unique=[],dups=[];
    for(const x of entries){const key=x.name.toLocaleLowerCase('th');if(existing.has(key)){dups.push(x.name);continue;}existing.add(key);unique.push(x);}
    out.innerHTML=`<p class="font-semibold">ช่วง ${start}–${end}: พบ ${entries.length} เมนู · ใหม่ ${unique.length} · ซ้ำข้าม ${dups.length}</p><div class="max-h-64 overflow-auto space-y-2 mt-2">${unique.map(x=>`<div class="rounded-lg bg-lav-soft/50 p-2"><b>${esc(x.name)}</b><div>${x.calories} kcal · P ${x.protein} · C ${x.carbs} · F ${x.fat}</div><div class="text-amber-700 text-xs">${esc(x.warning||'ค่าพลังงานและสารอาหารจากร้าน')}</div></div>`).join('')||'<p>ไม่มีรายการใหม่</p>'}${dups.length?`<p class="text-xs text-slate-500">ข้ามรายการชื่อซ้ำ: ${dups.map(esc).join(', ')}</p>`:''}</div><button id="hp-confirm-save" class="btn btn-primary mt-3" ${unique.length?'':'disabled'}>เพิ่ม ${unique.length} รายการเข้าคลังอาหาร</button>`;
    out.querySelector('#hp-confirm-save')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;let count=0;try{for(const x of unique){await addDoc(userCol(state.uid,'custom_foods'),x.record);count++;}toast(`เพิ่ม ${count} เมนู Hiwpinto แล้ว`);m.close();}catch(err){toast(`บันทึกได้ ${count} รายการ แล้วพบข้อผิดพลาด: ${err.message}`,'err');}});
  };
}
