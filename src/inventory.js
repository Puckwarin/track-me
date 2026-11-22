import { addDoc, setDoc, updateDoc, deleteDoc, writeBatch, doc } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, localDateStr, round1, toast, openModal, isDateStr, addMonthsLocal, daysBetween } from './util.js';
import { watch } from './sync.js';
import { estimateStockFromPhotos, explainGeminiError, formatImageProgress } from './nutrition.js';
import { REMIND_OPTIONS, remindLabel } from './period.js';
import { iconSvg } from './icons.js';
import { guardPreviewWrite } from './preview.js';
import { bindSwipeRows } from './ui.js';

const categories = ['คน · อาหาร/ขนม','สัตว์เลี้ยง · อาหาร/ขนม','สกินแคร์/ของใช้คน','ของใช้สัตว์เลี้ยง','ของใช้ในบ้าน','อื่น ๆ'];
const $r = s => $(s, root);
let root, editingId = null, activeInvTab = 'stock';
const pendingQuantityById = new Map();
const leftDays = s => (s ? daysBetween(localDateStr(), s) : 0);

function setInvTab(tab) {
  if (!root) return;
  activeInvTab = ['stock', 'form', 'blacklist'].includes(tab) ? tab : 'stock';
  root.querySelectorAll('[data-inv-tab]').forEach(btn => {
    const on = btn.dataset.invTab === activeInvTab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#inv-panel-stock', root)?.classList.toggle('hidden', activeInvTab !== 'stock');
  $('#inv-panel-form', root)?.classList.toggle('hidden', activeInvTab !== 'form');
  $('#inv-panel-blacklist', root)?.classList.toggle('hidden', activeInvTab !== 'blacklist');
}

function normalizeScannedDate(raw) {
  if (!raw) return '';
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  let y = Number(m[1]);
  if (y >= 2400) y -= 543;
  const candidate = `${y}-${m[2]}-${m[3]}`;
  return isDateStr(candidate) ? candidate : '';
}

function guessInventoryCategory(name) {
  const s = String(name || '').toLowerCase();
  if (/สุนัข|หมา|แมว|pet|ขนม.*หมา|อาหาร.*แมว|อาหาร.*สุนัข|ทรายแมว/.test(s)) return /อาหาร|ขนม|treat/.test(s) ? 'สัตว์เลี้ยง · อาหาร/ขนม' : 'ของใช้สัตว์เลี้ยง';
  if (/ครีม|เซรั่ม|โลชั่น|กันแดด|โทนเนอร์|ลิป|โฟมล้างหน้า|แชมพู|สกินแคร์|cream|serum|cleanser|sunscreen/.test(s)) return 'สกินแคร์/ของใช้คน';
  if (/กระดาษ|ทิชชู่|น้ำยา|ผงซักฟอก|ถุงขยะ|ล้างจาน|ไส้กรอง|ผ้าอนามัย/.test(s)) return 'ของใช้ในบ้าน';
  if (/นม|ขนม|ซอส|กาแฟ|ชา|ข้าว|น้ำมัน|เครื่องปรุง|อาหาร/.test(s)) return 'คน · อาหาร/ขนม';
  return 'อื่น ๆ';
}

export function mountInventory(el) {
  root=el;
  activeInvTab = 'stock';
  root.innerHTML=`
  <section class="card space-y-4 lg:col-span-2">
    <header class="flex flex-wrap items-start justify-between gap-2"><div><h2 class="text-lg font-bold text-slate-800">📦 ของใช้ & สต๊อก</h2><p class="text-xs text-slate-500">อาหาร/ขนมของคนและสัตว์เลี้ยง สกินแคร์ และของใช้ในบ้าน · กด − / + ปรับสต๊อกได้ทันที</p></div><span class="text-xs text-slate-600 bg-lav-soft/70 px-2.5 py-1 rounded-lg">📌 รอบเปลี่ยนของย้ายไปที่เมนู <b>บันทึกเตือน</b></span></header>
    <div id="inventory-summary" class="grid grid-cols-3 gap-2" aria-live="polite"></div>
    <div class="tm-seg tm-seg--3" role="tablist" aria-label="หมวดคลังของใช้">
      <button type="button" role="tab" data-inv-tab="stock" aria-selected="true" class="tm-seg-btn is-active">สต๊อก & ซื้อของ</button>
      <button type="button" role="tab" data-inv-tab="form" aria-selected="false" class="tm-seg-btn">เพิ่ม / สแกน</button>
      <button type="button" role="tab" data-inv-tab="blacklist" aria-selected="false" class="tm-seg-btn">ส่วนผสมที่เลี่ยง</button>
    </div>

    <div id="inv-panel-stock" class="space-y-3">
      <div class="flex flex-col sm:flex-row gap-2"><input id="inv-search" class="input" placeholder="ค้นหาของที่บันทึกไว้"><select id="inv-filter" class="input sm:max-w-xs"><option value="">ทุกหมวดหมู่</option>${categories.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
      <div id="shopping-list" class="hidden rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2"></div>
      <div id="inv-list" class="grid grid-cols-1 sm:grid-cols-2 gap-3 tm-swipe-list--grid"></div>
    </div>

    <div id="inv-panel-form" class="hidden space-y-4">
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3"><input id="inv-name" class="input col-span-2 sm:col-span-1" placeholder="ชื่อของ เช่น ผ้าอนามัย 30cm"><select id="inv-category" class="input">${categories.map(x=>`<option>${esc(x)}</option>`).join('')}</select><input id="inv-qty" type="number" min="0" step="0.1" class="input" placeholder="จำนวนคงเหลือ"><input id="inv-unit" class="input" placeholder="หน่วย เช่น ห่อ, หลอด, ชิ้น"><input id="inv-low" type="number" min="0" step="0.1" class="input col-span-2 sm:col-span-1" placeholder="เตือนเมื่อเหลือไม่เกิน"></div>
      <details id="inv-more-fields" class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
        <summary class="cursor-pointer text-xs font-semibold text-slate-700 select-none">วันหมดอายุ PAO ส่วนผสม และบันทึกเพิ่มเติม (ไม่บังคับ)</summary>
        <div class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label class="text-xs text-slate-600">วันหมดอายุ/ควรใช้ก่อน<input id="inv-expiry" type="date" class="input mt-0.5" aria-label="วันหมดอายุ/ควรใช้ก่อน"></label>
          <label class="text-xs text-slate-600">วันที่เปิดใช้<input id="inv-open" type="date" class="input mt-0.5" aria-label="วันที่เปิดใช้"></label>
          <label class="text-xs text-slate-600">PAO หลังเปิด (เดือน)<input id="inv-pao" type="number" min="1" max="120" class="input mt-0.5" placeholder="เช่น 12"></label>
          <select id="inv-remind" class="input col-span-2 sm:col-span-3" aria-label="เตือนก่อนหมดอายุ">${REMIND_OPTIONS.map(([v, t]) => `<option value="${v}" ${v === 30 ? 'selected' : ''}>เตือนหมดอายุ: ${t}</option>`).join('')}</select>
          <input id="inv-ingredients" class="input col-span-2 sm:col-span-3" placeholder="ส่วนผสม (ไม่บังคับ)">
          <textarea id="inv-pros" class="input col-span-2 sm:col-span-1" placeholder="ความรู้สึก/ข้อดี (ไม่บังคับ)"></textarea>
          <textarea id="inv-cons" class="input col-span-2" placeholder="ข้อเสีย (ไม่บังคับ)"></textarea>
        </div>
      </details>
      <div class="rounded-2xl border-2 border-dashed border-brand/35 bg-lav-soft/30 p-3.5">
        <label class="flex items-center justify-center sm:justify-start gap-2.5 text-sm font-semibold text-brand-dark cursor-pointer min-h-11">
          ${iconSvg('images', { size: 18, className: 'text-brand shrink-0' })}
          <span>📷 ถ่ายหรือเลือกรูปสินค้า/วันหมดอายุ (เลือกได้หลายรูปพร้อมกัน)</span>
          <input id="inv-photo" type="file" accept="image/*" multiple class="hidden">
        </label>
        <p class="text-xs text-slate-500 mt-1">ย่อภาพในเครื่องแล้วส่งวิเคราะห์ชั่วคราว (ไม่บันทึกรูปลงระบบ) · หลังประมวลผลเสร็จจะมีหน้าต่างให้ตรวจสอบและยืนยันก่อนบันทึก</p>
        <p id="inv-photo-status" class="hidden text-xs mt-1.5" aria-live="polite"></p>
      </div>
      <div class="flex gap-2 justify-end"><button id="inv-cancel" class="btn btn-ghost hidden">ยกเลิกแก้ไข</button><button id="inv-save" class="btn btn-primary">บันทึกสต๊อก</button></div>
    </div>

    <div id="inv-panel-blacklist" class="hidden space-y-2">
      <div class="rounded-xl bg-rose-50 p-3 space-y-2"><label class="lbl">Ingredient Blacklist · ส่วนผสมที่ต้องการหลีกเลี่ยง</label><textarea id="inv-blacklist" class="input" placeholder="เช่น fragrance, alcohol (คั่นด้วยจุลภาค)"></textarea><button id="inv-blacklist-save" class="btn btn-soft">บันทึกรายการ</button></div>
    </div>
  </section>`;
  root.addEventListener('click', e => {
    const tabBtn = e.target.closest('[data-inv-tab]');
    if (tabBtn) setInvTab(tabBtn.dataset.invTab);
  });
  window.addEventListener('trackme:focus', e => {
    if (!root?.isConnected || e.detail?.tab !== 'inventory') return;
    const fid = String(e.detail?.focusId || '');
    if (fid === 'inv-blacklist') setInvTab('blacklist');
    else if (['inv-name', 'inv-qty', 'inv-photo', 'inv-more-fields'].includes(fid)) setInvTab('form');
    else setInvTab('stock');
  });
  $r('#inv-save').onclick=saveProduct; $r('#inv-cancel').onclick=resetForm; $r('#inv-photo').onchange=scanPhoto;
  $r('#inv-search').oninput=render; $r('#inv-filter').onchange=render; $r('#inv-blacklist-save').onclick=saveBlacklist;
  $r('#shopping-list').onclick=async e=>{if(e.target.closest('[data-copy-shopping]')){const rows=listProducts().filter(p=>p.quantity!=null&&p.lowAt!=null&&p.quantity<=p.lowAt);const text=rows.map(p=>`□ ${p.name} — เหลือ ${p.quantity} ${p.unit||'หน่วย'}`).join('\n');try{await navigator.clipboard.writeText(text);toast('คัดลอกรายการซื้อของแล้ว');}catch{toast(text,'info');}}else{const b=e.target.closest('[data-shopping-edit]');if(b){const p=(state.trackedProducts||[]).find(x=>x.id===b.dataset.shoppingEdit);if(p)editProduct(p);}}};
  $r('#inv-list').onclick=onInventoryClick;
  setInvTab('stock');
  render();
}

export function watchInventory(uid) {
  for (const [key,col] of [['trackedProducts','tracked_products'],['replacements','replacement_records'],['skincareProducts','skincare_products'],['ingredientBlacklist','ingredient_blacklist']])
    watch(`inventory:${col}`,userCol(uid,col),rows=>{state[key]=rows;render();window.dispatchEvent(new Event('trackme:data-change'));});
}
export function renderInventory() { render(); }

function listProducts(){
  const modern=(state.trackedProducts||[]).map(p=>({...p,legacy:false}));
  const modernNames=new Set(modern.map(p=>p.name?.trim().toLocaleLowerCase('th')));
  const old=(state.skincareProducts||[]).filter(p=>!modernNames.has(p.name?.trim().toLocaleLowerCase('th'))).map(p=>({...p,category:'สกินแคร์/ของใช้คน',quantity:null,legacy:true}));
  return [...modern,...old];
}
function render(){if(!root?.isConnected)return;const q=($r('#inv-search')?.value||'').trim().toLowerCase(),cat=$r('#inv-filter')?.value||'';
  const blacklist=(state.ingredientBlacklist||[])[0]?.ingredients?.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)||[];
  const allRows=listProducts();
  const rows=allRows.filter(p=>(!q||String(p.name).toLowerCase().includes(q)||String(p.ingredients||'').toLowerCase().includes(q))&&(!cat||p.category===cat));
  const listEl = $r('#inv-list');
  listEl.innerHTML=rows.map(p=>{const checkBlacklist=p.category==='สกินแคร์/ของใช้คน'||p.legacy;const matches=checkBlacklist?blacklist.filter(i=>String(p.ingredients||'').toLowerCase().includes(i)):[];const low=p.quantity!=null&&p.lowAt!=null&&p.quantity<=p.lowAt;const exp=p.expiryDate||null;const pao=p.openedDate&&p.paoMonths?addMonthsLocal(p.openedDate,Number(p.paoMonths)):p.paoExpiry;const remDays=p.remindDays!==undefined&&p.remindDays!==null?Number(p.remindDays):30;const expiryDays=[exp,pao].filter(Boolean).map(leftDays);const expiryStatus=expiryDays.length?(Math.min(...expiryDays)<0?'หมดอายุแล้ว':Math.min(...expiryDays)===0?'หมดอายุวันนี้':Math.min(...expiryDays)<=30?`อีก ${Math.min(...expiryDays)} วัน`:''):'';
    const cardBody = `<div class="flex flex-wrap justify-between items-start gap-2"><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5"><b class="text-sm sm:text-base text-slate-800">${esc(p.name)}</b><span class="text-xs text-slate-500">· ${esc(p.category||'อื่น ๆ')}</span>${low?'<span class="rounded-md bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-bold">ใกล้หมด</span>':''}${expiryStatus?`<span class="rounded-md ${Math.min(...expiryDays)<0?'bg-rose-100 text-rose-700':'bg-amber-100 text-amber-800'} px-2 py-0.5 text-[11px] font-semibold">${expiryStatus}</span>`:''}</div><details class="mt-1 text-xs text-slate-600"><summary class="cursor-pointer text-slate-500 underline decoration-dotted underline-offset-2">วันเปิดใช้และอายุสินค้า</summary><p class="mt-1">${p.openedDate?`เปิดใช้ ${esc(p.openedDate)} · `:''}${p.paoMonths?`PAO ${esc(p.paoMonths)} เดือน · หมดอายุหลังเปิด ${pao?`${esc(pao)} (${leftDays(pao)<0?'เลยกำหนด':`อีก ${leftDays(pao)} วัน`})`:'-'} · `:''}${exp?`ควรใช้ก่อน ${esc(exp)} (${leftDays(exp)<0?'เลยกำหนด':`อีก ${leftDays(exp)} วัน`}) · `:''}${(exp||pao)?`เตือนหมดอายุ: ${esc(remindLabel(remDays))}`:''}</p></details></div>${!p.legacy?`<div class="flex items-center gap-2 shrink-0 bg-slate-50 border border-slate-200 rounded-2xl p-1"><button type="button" data-step-product="${esc(p.id)}" data-delta="-1" class="w-11 h-11 rounded-xl bg-white border border-slate-200 text-rose-600 font-bold text-lg flex items-center justify-center active:scale-95 shadow-xs" aria-label="ลดจำนวน ${esc(p.name)}">−</button><div class="min-w-[3.75rem] text-center px-1"><b class="text-base text-slate-800 block leading-tight">${p.quantity==null?'-':esc(p.quantity)}</b><span class="text-[11px] text-slate-500 block truncate max-w-[4.5rem]">${esc(p.unit||'หน่วย')}</span></div><button type="button" data-step-product="${esc(p.id)}" data-delta="1" class="w-11 h-11 rounded-xl bg-brand text-white font-bold text-lg flex items-center justify-center active:scale-95 shadow-xs" aria-label="เพิ่มจำนวน ${esc(p.name)}">+</button></div>`:''}</div>${p.lowAt!=null?`<p class="text-[11px] text-slate-500">เตือนซื้อเพิ่มเมื่อเหลือ ≤ ${esc(p.lowAt)} ${esc(p.unit||'หน่วย')}</p>`:''}${matches.length?`<p class="text-xs font-semibold text-rose-700">⚠️ ส่วนผสมใน blacklist: ${esc(matches.join(', '))}</p>`:''}${p.ingredients?`<p class="text-xs">ส่วนผสม: ${esc(p.ingredients)}</p>`:''}${p.pros?`<p class="text-xs text-green-700">ข้อดี: ${esc(p.pros)}</p>`:''}${p.cons?`<p class="text-xs text-rose-700">ข้อเสีย: ${esc(p.cons)}</p>`:''}`;
    if (p.legacy) {
      return `<article class="rounded-2xl border ${low||matches.length?'border-rose-300 bg-rose-50':'border-slate-200 bg-white/70'} p-3.5 space-y-2 tabular-nums">${cardBody}<div class="pt-1"><span class="text-xs text-slate-500">รายการเดิมจากสกินแคร์</span></div></article>`;
    }
    return `<article class="tm-swipe-row ${low||matches.length?'is-rose':''} tabular-nums">
      <div class="tm-swipe-actions">
        <button type="button" data-edit-product="${esc(p.id)}" class="tm-swipe-action-btn is-edit" aria-label="แก้ไข ${esc(p.name)}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไข</span></button>
        <button type="button" data-delete-product="${esc(p.id)}" class="tm-swipe-action-btn is-del" aria-label="ลบ ${esc(p.name)}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
      </div>
      <div class="tm-swipe-card tm-swipe-card--stack !p-3.5 space-y-2">
        ${cardBody}
        <div class="tm-row-actions pt-1">
          <button type="button" data-edit-product="${esc(p.id)}" class="tm-row-action-btn" aria-label="แก้ไข ${esc(p.name)}">${iconSvg('edit-square', { size: 15 })}<span>แก้ไขรายละเอียด</span></button>
          <button type="button" data-delete-product="${esc(p.id)}" class="tm-row-action-btn is-del" aria-label="ลบ ${esc(p.name)}">${iconSvg('trash', { size: 15 })}<span>ลบ</span></button>
        </div>
      </div>
    </article>`;
  }).join('')||`<p class="text-sm text-slate-500 sm:col-span-2 py-4 text-center">${allRows.length?'ไม่พบรายการที่ตรงกับคำค้นหาหรือหมวดหมู่':'ยังไม่มีของในสต๊อก'}</p>`;
  bindSwipeRows(listEl);
  renderInventorySummary();
  renderShoppingList();
}
function renderInventorySummary() {
  const summary = $r('#inventory-summary');
  if (!summary) return;
  const products = listProducts();
  const lowCount = products.filter(product => product.quantity != null && product.lowAt != null && product.quantity <= product.lowAt).length;
  const expiringCount = products.filter(product => {
    const paoExpiry = product.openedDate && product.paoMonths ? addMonthsLocal(product.openedDate, Number(product.paoMonths)) : product.paoExpiry;
    return [paoExpiry, product.expiryDate].filter(Boolean).some(expiry => leftDays(expiry) <= 30);
  }).length;
  summary.innerHTML = `<div class="rounded-xl border border-slate-200 bg-white px-2.5 py-2 tabular-nums"><p class="text-[10px] text-slate-500">รายการทั้งหมด</p><b class="text-sm text-slate-800">${products.length}</b></div><div class="rounded-xl border ${lowCount ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'} px-2.5 py-2 tabular-nums"><p class="text-[10px] ${lowCount ? 'text-rose-700' : 'text-emerald-700'}">สต๊อกต่ำ</p><b class="text-sm ${lowCount ? 'text-rose-800' : 'text-emerald-800'}">${lowCount}</b></div><div class="rounded-xl border ${expiringCount ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'} px-2.5 py-2 tabular-nums"><p class="text-[10px] ${expiringCount ? 'text-amber-800' : 'text-slate-500'}">ใกล้หมดอายุ</p><b class="text-sm ${expiringCount ? 'text-amber-900' : 'text-slate-800'}">${expiringCount}</b></div>`;
}
function renderShoppingList(){const box=$r('#shopping-list');if(!box)return;const low=listProducts().filter(p=>p.quantity!=null&&p.lowAt!=null&&p.quantity<=p.lowAt);box.classList.toggle('hidden',low.length===0);if(!low.length){box.innerHTML='';return;}box.innerHTML=`<div class="flex flex-wrap justify-between items-center gap-2"><div><h3 class="font-semibold">🛒 รายการซื้อของ · ${low.length} รายการ</h3><p class="text-xs">สร้างให้อัตโนมัติจากของที่ถึงเกณฑ์เตือน</p></div><button data-copy-shopping class="btn btn-soft !px-3 !py-2 text-xs">คัดลอกรายการ</button></div><ul class="space-y-1">${low.map(p=>`<li class="flex justify-between items-center gap-2 rounded-lg bg-white/70 px-2 py-1 text-sm tabular-nums"><span>□ <b>${esc(p.name)}</b> · เหลือ ${esc(p.quantity)} ${esc(p.unit||'หน่วย')}</span><button data-shopping-edit="${esc(p.id)}" class="chip min-h-[36px] bg-sky-soft text-blue-700">เติมสต๊อก</button></li>`).join('')}</ul>`;}
function resetForm(){editingId=null;['name','qty','unit','low','expiry','open','pao','ingredients','pros','cons'].forEach(k=>$r('#inv-'+k).value='');$r('#inv-category').value=categories[0];$r('#inv-remind').value='30';const more=$r('#inv-more-fields');if(more)more.open=false;$r('#inv-save').textContent='บันทึกสต๊อก';$r('#inv-cancel').classList.add('hidden');const st=$r('#inv-photo-status');if(st){st.textContent='';st.classList.add('hidden');}}
function editProduct(p){setInvTab('form');editingId=p.id;for(const [key,value] of Object.entries({name:p.name,category:p.category,qty:p.quantity,unit:p.unit,low:p.lowAt,expiry:p.expiryDate,open:p.openedDate,pao:p.paoMonths,ingredients:p.ingredients,pros:p.pros,cons:p.cons}))$r('#inv-'+key).value=value??'';$r('#inv-remind').value=String(p.remindDays!==undefined&&p.remindDays!==null?p.remindDays:30);const more=$r('#inv-more-fields');if(more)more.open=Boolean(p.expiryDate||p.openedDate||p.paoMonths||p.ingredients||p.pros||p.cons||(p.remindDays!=null&&Number(p.remindDays)!==30));$r('#inv-save').textContent='บันทึกการแก้ไข';$r('#inv-cancel').classList.remove('hidden');root.scrollIntoView({behavior:'smooth',block:'start'});}
function saveProduct(){if(guardPreviewWrite('การบันทึกสต๊อก'))return;const name=$r('#inv-name').value.trim(),qty=Number($r('#inv-qty').value),category=$r('#inv-category').value;if(!name)return toast('กรอกชื่อของก่อนค่ะ','err');if($r('#inv-qty').value===''||qty<0)return toast('กรอกจำนวนคงเหลือให้ถูกต้องก่อนบันทึก','err');const duplicate=(state.trackedProducts||[]).find(x=>x.id!==editingId&&x.name.trim().toLocaleLowerCase('th')===name.toLocaleLowerCase('th')&&x.category===category);if(duplicate)return toast(`มี “${duplicate.name}” ในหมวดนี้แล้ว ใช้แก้ไข/เติมสต๊อกที่รายการเดิมได้ค่ะ`,'err');const openedDate=$r('#inv-open').value||null,paoMonths=$r('#inv-pao').value?Number($r('#inv-pao').value):null;const expiryDate=$r('#inv-expiry').value||null;const remindDays=Number($r('#inv-remind').value);const p={name,category,quantity:qty,unit:$r('#inv-unit').value.trim(),lowAt:$r('#inv-low').value===''?null:Number($r('#inv-low').value),expiryDate,openedDate,paoMonths,...(openedDate&&paoMonths?{paoExpiry:addMonthsLocal(openedDate,paoMonths)}:{}),remindDays,dismissedFor:null,lowDismissed:false,ingredients:$r('#inv-ingredients').value.trim(),pros:$r('#inv-pros').value.trim(),cons:$r('#inv-cons').value.trim(),updatedAt:new Date()};try{const wasEditing=Boolean(editingId);const write=wasEditing?updateDoc(userDoc(state.uid,'tracked_products',editingId),p):addDoc(userCol(state.uid,'tracked_products'),{...p,createdAt:new Date()});write.catch(e=>toast('บันทึกไม่สำเร็จ: '+e.message,'err'));toast(wasEditing?'อัปเดตสต๊อกแล้ว':'บันทึกสต๊อกแล้ว');resetForm();if(wasEditing)setInvTab('stock');}catch(e){toast('บันทึกไม่สำเร็จ: '+e.message,'err');}}
async function onInventoryClick(e){
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.stepProduct){
    if(guardPreviewWrite('การปรับจำนวนสต๊อก'))return;
    const p=(state.trackedProducts||[]).find(x=>x.id===b.dataset.stepProduct);if(!p)return;
    const delta=Number(b.dataset.delta)||0;
    const pendingKey=`${state.uid}:${p.id}`;
    const cur=pendingQuantityById.get(pendingKey)??(Number(p.quantity)||0);
    const nextQty=Math.max(0,round1(cur+delta));
    if(nextQty===cur)return;
    pendingQuantityById.set(pendingKey,nextQty);
    try{
      const lowDismissed=(p.lowAt!=null&&nextQty>p.lowAt)?false:(p.lowDismissed??false);
      updateDoc(userDoc(state.uid,'tracked_products',p.id),{quantity:nextQty,lowDismissed,updatedAt:new Date()})
        .then(()=>{
          if(pendingQuantityById.get(pendingKey)===nextQty)pendingQuantityById.delete(pendingKey);
        })
        .catch(err=>{
          if(pendingQuantityById.get(pendingKey)===nextQty)pendingQuantityById.delete(pendingKey);
          toast('อัปเดตไม่สำเร็จ: '+err.message,'err');
        });
      toast(`${p.name}: ${nextQty} ${p.unit||'หน่วย'}`);
    }catch(err){
      if(pendingQuantityById.get(pendingKey)===nextQty)pendingQuantityById.delete(pendingKey);
      toast('อัปเดตไม่สำเร็จ: '+err.message,'err');
    }
    return;
  }
  const id=b.dataset.editProduct||b.dataset.deleteProduct;
  if(b.dataset.editProduct){const p=(state.trackedProducts||[]).find(x=>x.id===id);if(p)editProduct(p);}
  else if(b.dataset.deleteProduct){if(guardPreviewWrite('การลบสินค้าในสต๊อก'))return;if(confirm('ลบรายการนี้ออกจากสต๊อก?'))try{deleteDoc(userDoc(state.uid,'tracked_products',id)).catch(err=>toast(err.message,'err'));toast('ลบรายการแล้ว');}catch(err){toast(err.message,'err');}}
}

function openBatchInventoryModal(results, errors) {
  const m = openModal(`
    <div class="flex justify-between items-center mb-2">
      <h3 class="font-bold text-lg text-slate-800">📦 ตรวจสอบผลสแกนสต๊อก (${results.length} รูป)</h3>
      <button data-close class="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <p class="text-xs text-green-700 font-semibold bg-ok-soft rounded-xl px-3 py-2 mb-3">
      ✓ ประมวลผลภาพเสร็จสิ้น ${results.length} รายการ${errors.length ? ` · อ่านไม่สำเร็จ ${errors.length} รูป` : ''} (ไม่เก็บไฟล์รูปภาพในระบบ)
    </p>
    ${errors.length ? `<div class="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 mb-3">${errors.map(x => `<p>• ${esc(x.fileName)}: ${esc(x.message)}</p>`).join('')}</div>` : ''}
    <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      ${results.map((r, i) => {
        const exp = normalizeScannedDate(r.expiryDate);
        const qty = r.remainingQuantity ?? r.totalQuantity ?? 1;
        const low = r.totalQuantity ? Math.max(1, Math.round(r.totalQuantity * 0.2)) : 1;
        const cat = guessInventoryCategory(r.name);
        return `<div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 space-y-2" data-bi-row="${i}">
          <label class="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <span class="flex items-center gap-2"><input type="checkbox" class="bi-chk" data-i="${i}" checked> รายการที่ ${i + 1} (${esc(r.fileName)})</span>
            <span class="text-[11px] text-slate-500">ความมั่นใจ: ${esc(r.confidence || 'medium')}</span>
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input class="input bi-name text-xs" placeholder="ชื่อสินค้า *" value="${esc(r.name || '')}">
            <select class="input bi-cat text-xs">${categories.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="lbl">คงเหลือ</label><input type="number" min="0" step="0.1" class="input bi-qty text-xs" value="${esc(qty)}"></div>
            <div><label class="lbl">หน่วย</label><input class="input bi-unit text-xs" placeholder="ชิ้น/ห่อ" value="${esc(r.unit || 'ชิ้น')}"></div>
            <div><label class="lbl">เตือน ≤</label><input type="number" min="0" step="0.1" class="input bi-low text-xs" value="${esc(low)}"></div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><label class="lbl">วันหมดอายุ (ถ้ามี)</label><input type="date" class="input bi-exp text-xs" value="${esc(exp)}"></div>
            <div><label class="lbl">หมายเหตุสภาพสินค้า</label><input class="input bi-note text-xs" value="${esc(r.notes || '')}" placeholder="สภาพ / ข้อสังเกต"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <button type="button" data-close class="btn btn-ghost">ยกเลิก</button>
      <button type="button" id="bi-save" class="btn btn-primary">${iconSvg('check', { size: 15 })} บันทึกรายการที่เลือก</button>
    </div>`, { wide: true });

  $('#bi-save', m.el).addEventListener('click', async () => {
    if (guardPreviewWrite('การบันทึกสต๊อกจากรูปภาพ')) return;
    const rows = [...m.el.querySelectorAll('[data-bi-row]')];
    const items = [];
    for (const row of rows) {
      if (!row.querySelector('.bi-chk')?.checked) continue;
      const name = row.querySelector('.bi-name').value.trim();
      const qty = Number(row.querySelector('.bi-qty').value);
      const unit = row.querySelector('.bi-unit').value.trim() || 'ชิ้น';
      const category = row.querySelector('.bi-cat').value;
      const lowRaw = row.querySelector('.bi-low').value;
      const expiryDate = row.querySelector('.bi-exp').value || null;
      const pros = row.querySelector('.bi-note').value.trim();
      if (!name || !Number.isFinite(qty) || qty < 0) return toast('ตรวจสอบชื่อและจำนวนสินค้าในรายการที่เลือกก่อนบันทึก', 'err');
      items.push({ name, category, quantity: qty, unit, lowAt: lowRaw === '' ? null : Number(lowRaw), expiryDate, pros });
    }
    if (!items.length) return toast('เลือกอย่างน้อย 1 รายการก่อนบันทึก', 'err');

    const btn = $('#bi-save', m.el);
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      const batch = writeBatch(db);
      const colRef = userCol(state.uid, 'tracked_products');
      const now = new Date();
      let updated = 0, added = 0;
      items.forEach(item => {
        const dup = (state.trackedProducts || []).find(x => x.name.trim().toLocaleLowerCase('th') === item.name.toLocaleLowerCase('th') && x.category === item.category);
        if (dup) {
          batch.update(userDoc(state.uid, 'tracked_products', dup.id), {
            quantity: item.quantity, unit: item.unit,
            ...(item.expiryDate && { expiryDate: item.expiryDate }),
            ...(item.lowAt != null && { lowAt: item.lowAt }),
            lowDismissed: false, dismissedFor: null, updatedAt: now
          });
          updated++;
        } else {
          batch.set(doc(colRef), {
            ...item, openedDate: null, paoMonths: null, remindDays: 30,
            dismissedFor: null, lowDismissed: false, ingredients: '', cons: '',
            createdAt: now, updatedAt: now
          });
          added++;
        }
      });
      batch.commit().catch(err=>toast('บันทึกไม่สำเร็จ: '+err.message,'err'));
      const st = $r('#inv-photo-status');
      if (st) { st.textContent = ''; st.classList.add('hidden'); }
      m.close();
      toast(`บันทึกสต๊อกแล้ว (เพิ่มใหม่ ${added}${updated ? `, อัปเดตเดิม ${updated}` : ''})`);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `${iconSvg('check', { size: 15 })} บันทึกรายการที่เลือก`;
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
    }
  });
}

async function scanPhoto(e) {
  const input = e.target;
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;
  const st = $r('#inv-photo-status');
  st.className = 'text-xs mt-1.5 text-slate-500 font-medium';
  st.classList.remove('hidden');
  st.textContent = formatImageProgress('กำลังประมวลผล', { total: files.length, activeIndex: 1, completed: 0, percent: 0 });

  try {
    const { results, errors } = await estimateStockFromPhotos(files, (_done, _total, info) => {
      if (st.isConnected) st.textContent = formatImageProgress('กำลังประมวลผล', info);
    });
    if (!results.length && errors.length) {
      st.className = 'text-xs mt-1.5 text-rose-600 font-medium';
      st.textContent = errors[0].message;
      toast(errors[0].message, 'err');
      return;
    }
    st.className = 'text-xs mt-1.5 text-green-700 font-semibold';
    st.textContent = `✓ ประมวลผลครบ ${files.length}/${files.length} รูป (สำเร็จ ${results.length}) — ตรวจสอบและยืนยัน`;
    openBatchInventoryModal(results, errors);
  } catch (err) {
    st.className = 'text-xs mt-1.5 text-rose-600 font-medium';
    st.textContent = explainGeminiError(err);
    toast(explainGeminiError(err), 'err');
  }
}
function saveBlacklist(){if(guardPreviewWrite('การบันทึก Ingredient Blacklist'))return;try{setDoc(userDoc(state.uid,'ingredient_blacklist','list'),{ingredients:$r('#inv-blacklist').value.trim(),updatedAt:new Date()}).catch(e=>toast(e.message,'err'));toast('บันทึกส่วนผสมที่ต้องการเลี่ยงแล้ว');}catch(e){toast(e.message,'err');}}
