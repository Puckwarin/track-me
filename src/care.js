import { addDoc, setDoc, updateDoc, deleteDoc, writeBatch, doc } from 'firebase/firestore';
import { db, userCol, userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, toast, openModal } from './util.js';
import { watch } from './sync.js';
import { readPetFoodLabel, explainGeminiError, runImageBatch, formatImageProgress } from './nutrition.js';
import { reportRuntimeError } from './runtimeErrorMonitor.js';
import { iconSvg } from './icons.js';

const PET_SYMPTOMS = [
  ['appetite', 'เบื่ออาหาร / กินน้อย'],
  ['energy', 'ซึม / อ่อนเพลีย'],
  ['stool', 'ท้องเสีย / ถ่ายเหลว'],
  ['vomit', 'อาเจียน / ขย้อน'],
  ['skin', 'คัน / เกา / ผื่น'],
  ['cough', 'ไอ / จาม / น้ำมูก']
];
const PET_SX_LEVELS = ['ปกติ', 'เล็กน้อย', 'ปานกลาง', 'มาก'];
const PET_SX_COLORS = ['bg-slate-100 text-slate-600', 'bg-amber-100 text-amber-800', 'bg-orange-100 text-orange-800', 'bg-rose-100 text-rose-700 font-semibold'];
const DAILY_PET_CARE = [
  { key: 'feeding', label: 'ให้อาหาร', icon: 'fa-bowl-food' },
  { key: 'teeth', label: 'แปรงฟัน', icon: 'fa-tooth' },
  { key: 'walk', label: 'พาเดินเล่น', icon: 'fa-person-walking' },
  { key: 'groom', label: 'แปรงขน', icon: 'fa-brush' }
];
const pendingPetCare = new Set();

let root, petFormDirty = false, editingSxId = null;
let labFeature = null, labMountPromise = null;
let petSxDraft = Object.fromEntries(PET_SYMPTOMS.map(([k]) => [k, 0]));
const $r = s => $(s, root);
const d = s => s ? new Date(`${s}T00:00:00`) : null;
const num = id => { const v = $r('#' + id).value; return v === '' ? null : Number(v); };

export function mountCare(el) {
  root = el;
  root.innerHTML = `
  <section class="card space-y-4 lg:col-span-2">
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div><h2 class="text-lg font-bold text-slate-800">🐾 Pet Health & Care</h2><p class="text-xs text-slate-500">ข้อมูลสุขภาพ น้ำหนัก อาหาร การแพ้ และผลเลือดของน้อง</p></div>
      <span class="text-xs text-slate-600 bg-lav-soft/70 px-2.5 py-1 rounded-lg">📌 ตารางนัด/วัคซีนอยู่ที่เมนู <b>บันทึกเตือน</b></span>
    </header>
    <div id="pet-profile" class="rounded-xl bg-amber-50 border border-amber-200/70 p-3 text-sm tabular-nums text-slate-800"></div>
    <details id="pet-profile-edit" class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3" open>
      <summary class="cursor-pointer text-xs font-semibold text-slate-700 select-none">ข้อมูลน้องและบันทึกน้ำหนัก</summary>
      <div class="mt-3 space-y-3">
        <div class="grid sm:grid-cols-2 gap-3"><input id="pet-name" class="input" placeholder="ชื่อน้อง"><input id="pet-kind" class="input" placeholder="พันธุ์/ชนิด"><label class="text-sm">วันเกิด<input id="pet-birth" type="date" class="input"></label><input id="pet-weight" type="number" min="0.1" step="0.1" class="input" placeholder="น้ำหนัก (kg)"><select id="pet-life" class="input sm:col-span-2"><option value="neutered">โตเต็มวัย ทำหมัน</option><option value="intact">โตเต็มวัย ยังไม่ทำหมัน</option><option value="inactive">กิจกรรมน้อย/น้ำหนักขึ้นง่าย</option><option value="puppy-young">ลูกสุนัขอายุต่ำกว่า 4 เดือน</option><option value="puppy-old">ลูกสุนัข 4 เดือนขึ้นไป</option></select></div>
        <button id="pet-save" class="btn btn-primary">บันทึกข้อมูลน้อง/น้ำหนัก</button>
      </div>
    </details>
    <section id="pet-daily-care" class="rounded-2xl border border-amber-200 bg-amber-50/50 p-3 space-y-3" aria-labelledby="pet-daily-care-title">
      <div class="flex items-start justify-between gap-2"><div><h3 id="pet-daily-care-title" class="font-semibold text-sm text-slate-800">วันนี้ดูแลอะไรแล้วบ้าง</h3><p class="text-xs text-slate-500">แตะครั้งเดียวเพื่อบันทึกงานประจำวัน</p></div><span id="pet-care-done-count" class="shrink-0 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700"></span></div>
      <div id="pet-care-actions" class="grid grid-cols-2 sm:grid-cols-4 gap-2"></div>
      <div id="pet-care-timeline" class="space-y-2"></div>
    </section>
    <div class="rounded-xl border border-slate-200 p-3"><h3 class="font-semibold text-slate-800">แนวโน้มน้ำหนัก</h3><p class="text-xs text-slate-500">บันทึกน้ำหนักได้วันละครั้ง กราฟจะเก็บประวัติไว้กับโปรไฟล์น้อง</p><div id="pet-weight-chart" class="mt-2 overflow-x-auto tabular-nums"></div></div>

    <div class="border-t pt-3 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-semibold text-slate-800">อาหารและแคลอรี</h3>
        <label class="chip bg-lav-soft text-brand-dark cursor-pointer min-h-[40px]">
          <input id="pet-food-scan" type="file" accept="image/*" multiple class="hidden">
          ${iconSvg('camera', { size: 14 })} สแกนซองอาหาร (เลือกได้หลายรูป)
        </label>
      </div>
      <p id="pet-food-scan-status" class="hidden text-xs text-slate-500"></p>
      <p id="pet-calorie-estimate" class="text-xs text-slate-600 tabular-nums"></p>
      <div id="pet-food-presets" class="hidden space-y-1"></div>
      <div class="grid sm:grid-cols-3 gap-2"><input id="pet-food-name" class="input" placeholder="อาหาร/ขนม"><input id="pet-food-grams" type="number" min="0" step="1" class="input" placeholder="ปริมาณ (g)"><input id="pet-food-kcal" type="number" min="0" step="1" class="input" placeholder="kcal ต่อ 100g"></div>
      <div class="grid sm:grid-cols-2 gap-2"><select id="pet-food-allergy" class="input"><option value="unknown">สถานะการแพ้: ยังไม่ทราบ</option><option value="no">ไม่พบอาการแพ้</option><option value="yes">สงสัยว่าแพ้</option></select><input id="pet-food-notes" class="input" placeholder="อาการ/รายละเอียด เช่น คราบน้ำตา, โปรตีน 28%"></div>
      <button id="pet-food-save" class="btn btn-soft">บันทึกอาหาร</button>
      <div id="pet-food-list" class="space-y-1.5 text-sm"></div>
    </div>
    <p class="text-xs text-slate-500">ค่าพลังงานเป็นเพียงจุดเริ่มต้นโดยประมาณ ควรปรับตามสภาพร่างกายและคำแนะนำสัตวแพทย์</p>
  </section>

  <section id="pet-sx-card" class="card space-y-4 lg:col-span-2">
    <header class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 class="text-base sm:text-lg font-bold text-slate-800">🐶 บันทึกอาการน้องหมา</h3>
        <p class="text-xs text-slate-500">ติดตามความผิดปกติรายวัน เช่น กินอาหาร การขับถ่าย ซึม คัน อาเจียน และอุณหภูมิ</p>
      </div>
    </header>
    <div class="grid sm:grid-cols-2 gap-3">
      <div><label class="lbl">วันที่</label><input id="pet-sx-date" type="date" class="input"></div>
      <div><label class="lbl">อุณหภูมิร่างกาย °C (ไม่บังคับ)</label><input id="pet-sx-temp" type="number" min="34" max="43" step="0.1" inputmode="decimal" class="input" placeholder="เช่น 38.5 (ปกติ ~38–39 °C)"></div>
    </div>
    <div id="pet-sx-grid" class="grid sm:grid-cols-2 gap-2.5"></div>
    <div><label class="lbl">รายละเอียดเพิ่มเติม</label><input id="pet-sx-note" class="input" placeholder="เช่น ถ่ายเหลว 2 รอบ, กินยาแล้วดีขึ้น, คันบริเวณหู"></div>
    <div class="flex flex-wrap justify-end gap-2">
      <button type="button" id="pet-sx-cancel" class="btn btn-ghost hidden">ยกเลิกแก้ไข</button>
      <button type="button" id="pet-sx-save" class="btn btn-primary">${iconSvg('plus', { size: 15 })} บันทึกอาการน้องหมา</button>
    </div>
    <div class="border-t pt-3 space-y-2">
      <h4 class="font-semibold text-sm text-slate-700">ประวัติอาการล่าสุด</h4>
      <div id="pet-sx-list" class="space-y-2 text-sm"></div>
    </div>
  </section>

  <div id="care-lab" class="lg:col-span-2 grid grid-cols-1 lg:grid-cols-3 gap-6">
    <section id="care-lab-teaser" class="card lg:col-span-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">${iconSvg('stethoscope', { size: 18, className: 'text-brand shrink-0' })}<span>บันทึกผลตรวจ / ผลเลือด</span></h3>
        <p id="care-lab-summary" class="text-xs text-slate-500">กดเพื่อโหลดฟอร์มบันทึก เทมเพลตผลเลือด และตัวสแกนใบผลตรวจ</p>
      </div>
      <button type="button" id="care-lab-open" class="btn btn-soft text-xs">${iconSvg('folder', { size: 14 })} เปิดผลตรวจ / ผลเลือด</button>
    </section>
  </div>`;

  $r('#pet-save').onclick = savePet;
  $r('#pet-food-save').onclick = savePetFood;
  $r('#pet-food-scan').addEventListener('change', onScanPetFood);
  $r('#pet-food-presets').addEventListener('click', e => {
    const btn = e.target.closest('[data-pf-preset]');
    if (!btn) return;
    const nameKey = btn.dataset.pfPreset;
    const hit = (state.petFoods || [])
      .slice()
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .find(x => String(x.name || '').trim().toLowerCase() === nameKey);
    if (!hit) return;
    $r('#pet-food-name').value = hit.name || '';
    $r('#pet-food-kcal').value = hit.kcalPer100 != null ? String(hit.kcalPer100) : '';
    $r('#pet-food-allergy').value = hit.allergy || 'unknown';
    $r('#pet-food-notes').value = hit.note || '';
    if (!$r('#pet-food-grams').value && hit.grams != null) $r('#pet-food-grams').value = String(hit.grams);
    renderPetEstimate();
    $r('#pet-food-grams').focus();
  });
  ['#pet-name', '#pet-kind', '#pet-birth', '#pet-weight', '#pet-life'].forEach(sel => $r(sel).addEventListener('input', () => { petFormDirty = true; renderPetEstimate(); }));
  $r('#pet-food-kcal').addEventListener('input', renderPetEstimate);
  $r('#pet-sx-date').value = localDateStr();
  $r('#pet-daily-care').addEventListener('click', event => {
    const button = event.target.closest('[data-pet-care-action]');
    const task = DAILY_PET_CARE.find(item => item.key === button?.dataset.petCareAction);
    if (task) void savePetDailyCare(task);
  });
  $r('#pet-sx-save').addEventListener('click', savePetSymptom);
  $r('#pet-sx-cancel').addEventListener('click', resetPetSymptomForm);
  $r('#pet-sx-grid').addEventListener('click', e => {
    const btn = e.target.closest('[data-psx-key]');
    if (!btn) return;
    petSxDraft[btn.dataset.psxKey] = Number(btn.dataset.psxLv) || 0;
    renderPetSymptomGrid();
  });
  $r('#pet-sx-list').addEventListener('click', onPetSymptomListClick);
  $r('#care-lab-open')?.addEventListener('click', () => { void ensureLabMounted(); });
  renderAll();
}

export function ensureLabMounted() {
  if (!root?.isConnected) return Promise.resolve();
  if (!labMountPromise) {
    const openBtn = $r('#care-lab-open');
    if (openBtn) {
      openBtn.disabled = true;
      openBtn.innerHTML = `${iconSvg('fa-spinner fa-spin', { size: 14 })} กำลังโหลด...`;
    }
    labMountPromise = import('./lab.js')
      .then(module => {
        labFeature = module;
        const container = $r('#care-lab');
        if (container) {
          module.mountLab(container);
          module.render?.();
        }
      })
      .catch(error => {
        labMountPromise = null;
        if (openBtn?.isConnected) {
          openBtn.disabled = false;
          openBtn.innerHTML = `${iconSvg('folder', { size: 14 })} เปิดผลตรวจ / ผลเลือด`;
        }
        reportRuntimeError(error, { category: 'chunk', source: 'feature-load' });
        toast('เปิดบันทึกผลตรวจไม่สำเร็จ: ' + (error?.message || 'โหลดโมดูลไม่ได้'), 'err');
      });
  }
  return labMountPromise;
}

export function resetCareToToday() {
  if (root && $r('#pet-sx-date') && !editingSxId) {
    $r('#pet-sx-date').value = localDateStr();
  }
  labFeature?.resetLabToToday?.();
}

export function watchCare(uid) {
  for (const [key, col] of [['petProfiles', 'pet_profiles'], ['petCare', 'pet_care_records'], ['petFoods', 'pet_food_records']]) {
    watch(`care:${col}`, userCol(uid, col), records => { state[key] = records; renderAll(); window.dispatchEvent(new Event('trackme:data-change')); });
  }
}

export function renderCare() { renderAll(); }

export function onLabsUpdated() {
  if (!root?.isConnected) return;
  if (labFeature) {
    labFeature.render?.();
    return;
  }
  const summaryEl = $r('#care-lab-summary');
  if (summaryEl) {
    const count = (state.labs || []).length;
    summaryEl.textContent = count
      ? `มีบันทึกผลตรวจ ${count} รายการ · กดเปิดเพื่อดูผลตรวจ เทมเพลต และสแกนใบผลเลือด`
      : 'กดเพื่อโหลดฟอร์มบันทึก เทมเพลตผลเลือด และตัวสแกนใบผลตรวจ';
  }
}

function renderAll() {
  if (!root?.isConnected) return;
  renderPet(); renderPetDailyCare(); renderPetWeight(); renderPetFoods(); renderPetSymptomGrid(); renderPetSymptomsList();
  onLabsUpdated();
}

function openPetFoodScanModal(results, errors) {
  const pet = (state.petProfiles || [])[0];
  const prepared = results.map(r => {
    const res = r.data || {};
    const fullName = [res.brand, res.name].filter(Boolean).join(' · ') || 'อาหารสัตว์เลี้ยง';
    const info = [];
    if (res.proteinPct != null) info.push(`โปรตีน ${res.proteinPct}%`);
    if (res.fatPct != null) info.push(`ไขมัน ${res.fatPct}%`);
    if (res.fiberPct != null) info.push(`ไฟเบอร์ ${res.fiberPct}%`);
    if (res.moisturePct != null) info.push(`ความชื้น ${res.moisturePct}%`);
    if (res.notes) info.push(res.notes);
    return {
      fileName: r.fileName,
      name: fullName,
      kcalPer100: res.kcalPer100g != null ? Math.round(res.kcalPer100g) : '',
      notes: info.join(' · ')
    };
  });

  const m = openModal(`
    <div class="flex justify-between items-center mb-2">
      <h3 class="font-bold text-lg text-slate-800">🐾 ตรวจสอบผลสแกนซองอาหาร (${prepared.length} รูป)</h3>
      <button data-close class="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <p class="text-xs text-green-700 font-semibold bg-ok-soft rounded-xl px-3 py-2 mb-3">
      ✓ ประมวลผลครบ ${prepared.length} รูป${errors.length ? ` · ไม่สำเร็จ ${errors.length} รูป` : ''} (ไม่เก็บรูปภาพลงระบบ)
    </p>
    ${!pet ? '<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">⚠️ ยังไม่มีโปรไฟล์น้อง: กรุณาบันทึกข้อมูลน้องก่อน หรือกด “นำรายการแรกใส่ฟอร์ม”</p>' : ''}
    ${errors.length ? `<div class="rounded-xl bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700 mb-3">${errors.map(x => `<p>• ${esc(x.fileName)}: ${esc(x.message)}</p>`).join('')}</div>` : ''}
    <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      ${prepared.map((item, i) => `
        <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 space-y-2" data-pfs-row="${i}">
          <label class="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <span class="flex items-center gap-2"><input type="checkbox" class="pfs-chk" checked> รายการที่ ${i + 1} (${esc(item.fileName)})</span>
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div class="sm:col-span-2"><label class="lbl">ชื่ออาหาร/ขนม *</label><input class="input pfs-name text-xs" value="${esc(item.name)}"></div>
            <div><label class="lbl">kcal / 100g</label><input type="number" min="0" step="1" class="input pfs-kcal text-xs" value="${esc(item.kcalPer100)}" placeholder="ถ้ามี"></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="lbl">ปริมาณที่กิน (g) *</label><input type="number" min="0" step="1" class="input pfs-grams text-xs" placeholder="เช่น 50"></div>
            <div><label class="lbl">สถานะการแพ้</label><select class="input pfs-allergy text-xs"><option value="unknown">ยังไม่ทราบ</option><option value="no">ไม่พบอาการแพ้</option><option value="yes">สงสัยว่าแพ้</option></select></div>
          </div>
          <div><label class="lbl">สารอาหาร / หมายเหตุ</label><input class="input pfs-notes text-xs" value="${esc(item.notes)}" placeholder="โปรตีน ไขมัน ไฟเบอร์..."></div>
        </div>`).join('')}
    </div>
    <div class="flex flex-wrap justify-end gap-2 mt-4">
      <button type="button" data-close class="btn btn-ghost">ยกเลิก</button>
      <button type="button" id="pfs-fill" class="btn btn-soft text-xs">นำรายการแรกใส่ฟอร์ม</button>
      <button type="button" id="pfs-save" class="btn btn-primary text-xs">${iconSvg('check', { size: 14 })} ยืนยันบันทึกรายการที่เลือก</button>
    </div>`, { wide: true });

  $('#pfs-fill', m.el).addEventListener('click', () => {
    const firstRow = m.el.querySelector('[data-pfs-row]');
    if (!firstRow) return;
    $r('#pet-food-name').value = firstRow.querySelector('.pfs-name').value.trim();
    $r('#pet-food-grams').value = firstRow.querySelector('.pfs-grams').value;
    $r('#pet-food-kcal').value = firstRow.querySelector('.pfs-kcal').value;
    $r('#pet-food-allergy').value = firstRow.querySelector('.pfs-allergy').value;
    $r('#pet-food-notes').value = firstRow.querySelector('.pfs-notes').value.trim();
    renderPetEstimate();
    const st = $r('#pet-food-scan-status');
    if (st) { st.textContent = ''; st.classList.add('hidden'); }
    m.close();
    toast('นำข้อมูลใส่ฟอร์มแล้ว — กรอกปริมาณและกดบันทึกอาหารได้เลย');
  });

  $('#pfs-save', m.el).addEventListener('click', async () => {
    if (!pet) return toast('กรุณาบันทึกโปรไฟล์น้องด้านบนก่อนบันทึกอาหารค่ะ', 'err');
    const rows = [...m.el.querySelectorAll('[data-pfs-row]')];
    const itemsToSave = [];
    for (const row of rows) {
      if (!row.querySelector('.pfs-chk')?.checked) continue;
      const name = row.querySelector('.pfs-name').value.trim();
      const gramsRaw = row.querySelector('.pfs-grams').value;
      const grams = gramsRaw === '' ? null : Number(gramsRaw);
      const kcalRaw = row.querySelector('.pfs-kcal').value;
      const kcalPer100 = kcalRaw === '' ? null : Number(kcalRaw);
      if (!name || grams === null || !Number.isFinite(grams) || grams < 0) {
        return toast('กรุณากรอกชื่ออาหารและปริมาณ (g) ในรายการที่เลือกก่อนบันทึก', 'err');
      }
      itemsToSave.push({
        petId: pet.id,
        date: localDateStr(),
        name: name.slice(0, 120),
        grams,
        kcalPer100: Number.isFinite(kcalPer100) ? kcalPer100 : null,
        allergy: row.querySelector('.pfs-allergy').value,
        note: row.querySelector('.pfs-notes').value.trim().slice(0, 2000),
        createdAt: new Date()
      });
    }
    if (!itemsToSave.length) return toast('เลือกอย่างน้อย 1 รายการก่อนบันทึก', 'err');

    const btn = $('#pfs-save', m.el);
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก…';
    try {
      const batch = writeBatch(db);
      const colRef = userCol(state.uid, 'pet_food_records');
      itemsToSave.forEach(rec => batch.set(doc(colRef), rec));
      batch.commit().catch(err => toast('บันทึกไม่สำเร็จ: ' + err.message, 'err'));
      const st = $r('#pet-food-scan-status');
      if (st) { st.textContent = ''; st.classList.add('hidden'); }
      m.close();
      toast(`บันทึกอาหารน้อง ${itemsToSave.length} รายการแล้ว 🐾`);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `${iconSvg('check', { size: 14 })} ยืนยันบันทึกรายการที่เลือก`;
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
    }
  });
}

async function onScanPetFood(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  const st = $r('#pet-food-scan-status');
  st.className = 'text-xs text-slate-500 font-medium';
  st.classList.remove('hidden');
  st.textContent = formatImageProgress('กำลังอ่านซองอาหาร', { total: files.length, activeIndex: 1, completed: 0, percent: 0 });
  try {
    const { results, errors } = await runImageBatch(
      files,
      file => readPetFoodLabel(file),
      info => {
        if (st.isConnected) st.textContent = formatImageProgress('กำลังอ่านซองอาหาร', info);
      },
      { concurrency: 2 }
    );
    if (!results.length && errors.length) {
      st.className = 'text-xs text-rose-600 font-medium';
      st.textContent = errors[0].message;
      toast(errors[0].message, 'err');
      return;
    }
    st.className = 'text-xs text-green-700 font-semibold';
    st.textContent = `✓ ประมวลผลครบ ${files.length}/${files.length} รูป (สำเร็จ ${results.length}) — ตรวจสอบและยืนยัน`;
    openPetFoodScanModal(results, errors);
  } catch (err) {
    st.className = 'text-xs text-rose-600 font-medium';
    st.textContent = explainGeminiError(err);
    toast(explainGeminiError(err), 'err');
  }
}

function savePet(){const name=$r('#pet-name').value.trim(),weight=num('pet-weight');if(!name||!weight)return toast('กรอกชื่อน้องและน้ำหนักก่อนค่ะ','err');const old=(state.petProfiles||[])[0],today=localDateStr(),history=(old?.weightHistory||[]).filter(x=>x&&typeof x.date==='string'&&Number.isFinite(Number(x.weightKg))).map(x=>({date:x.date,weightKg:Number(x.weightKg)}));const sameDay=history.findIndex(x=>x.date===today);if(sameDay>=0)history[sameDay]={date:today,weightKg:weight};else history.push({date:today,weightKg:weight});history.sort((a,b)=>a.date.localeCompare(b.date));const data={name,kind:$r('#pet-kind').value.trim(),birthDate:$r('#pet-birth').value||null,weightKg:weight,weightHistory:history.slice(-365),lifeStage:$r('#pet-life').value,updatedAt:new Date()};try{const write=old?setDoc(userDoc(state.uid,'pet_profiles',old.id),data,{merge:true}):addDoc(userCol(state.uid,'pet_profiles'),{...data,createdAt:new Date()});write.catch(e=>toast(e.message,'err'));petFormDirty=false;toast('บันทึกข้อมูลและน้ำหนักแล้ว');}catch(e){toast(e.message,'err');}}
const ageText=birthDate=>{if(!birthDate)return 'ไม่ระบุวันเกิด';const b=d(birthDate),now=d(localDateStr());if(b>now)return 'วันเกิดอยู่ในอนาคต';let years=now.getFullYear()-b.getFullYear(),months=now.getMonth()-b.getMonth();if(now.getDate()<b.getDate())months--;if(months<0){years--;months+=12;}return years?`${years} ปี ${months} เดือน`:`${Math.max(0,months)} เดือน`;};
function renderPet(){const p=(state.petProfiles||[])[0];const editBox=$r('#pet-profile-edit');if(p&&!petFormDirty){$r('#pet-name').value=p.name||'';$r('#pet-kind').value=p.kind||'';$r('#pet-birth').value=p.birthDate||'';$r('#pet-weight').value=p.weightKg||'';$r('#pet-life').value=p.lifeStage||'neutered';}if(editBox&&!petFormDirty)editBox.open=!p;renderPetEstimate();}
function renderPetWeight(){const p=(state.petProfiles||[])[0],chart=$r('#pet-weight-chart');if(!p){chart.innerHTML='<p class="text-xs text-slate-500">เพิ่มข้อมูลน้องก่อนเพื่อเริ่มบันทึกน้ำหนัก</p>';return;}let rows=(p.weightHistory||[]).filter(x=>x&&typeof x.date==='string'&&Number.isFinite(Number(x.weightKg))).map(x=>({date:x.date,weightKg:Number(x.weightKg)}));if(!rows.length&&Number(p.weightKg)>0){const stamp=p.updatedAt?.toDate?.()||p.updatedAt;const date=stamp instanceof Date&&!Number.isNaN(stamp.getTime())?localDateStr(stamp):localDateStr();rows=[{date,weightKg:Number(p.weightKg)}];}rows.sort((a,b)=>a.date.localeCompare(b.date));if(!rows.length){chart.innerHTML='<p class="text-xs text-slate-500">ยังไม่มีข้อมูลน้ำหนัก</p>';return;}const w=Math.max(360,rows.length*74),h=190,pad={l:42,r:14,t:16,b:34},vals=rows.map(x=>x.weightKg),lo=Math.min(...vals),hi=Math.max(...vals),span=Math.max(1,hi-lo),x=i=>pad.l+(rows.length===1?(w-pad.l-pad.r)/2:i*(w-pad.l-pad.r)/(rows.length-1)),y=v=>pad.t+(hi-v+span*.12)/(span*1.24)*(h-pad.t-pad.b),points=rows.map((r,i)=>`${x(i)},${y(r.weightKg)}`).join(' ');chart.innerHTML=`<svg role="img" aria-label="กราฟแนวโน้มน้ำหนัก ${esc(p.name)}" viewBox="0 0 ${w} ${h}" class="block w-full max-w-3xl"><title>แนวโน้มน้ำหนัก ${esc(p.name)}</title><line x1="${pad.l}" y1="${h-pad.b}" x2="${w-pad.r}" y2="${h-pad.b}" stroke="currentColor" opacity=".25"/><polyline points="${points}" fill="none" stroke="#8b5e3c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.weightKg)}" r="4" fill="#8b5e3c"><title>${esc(r.date)} · ${r.weightKg} kg</title></circle><text x="${x(i)}" y="${h-10}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".75">${esc(r.date.slice(5))}</text>`).join('')}<text x="${pad.l-6}" y="${pad.t+8}" text-anchor="end" font-size="11" fill="currentColor">${hi.toFixed(1)} kg</text><text x="${pad.l-6}" y="${h-pad.b-2}" text-anchor="end" font-size="11" fill="currentColor">${lo.toFixed(1)} kg</text></svg>`;}
function renderPetEstimate(){const p=(state.petProfiles||[])[0],weight=num('pet-weight')??p?.weightKg;if(!weight){$r('#pet-profile').textContent='เพิ่มข้อมูลน้องและน้ำหนักเพื่อประเมินพลังงานต่อวัน';$r('#pet-calorie-estimate').textContent='';return;}const name=$r('#pet-name').value.trim()||p?.name||'น้อง',kind=$r('#pet-kind').value.trim()||p?.kind||'ไม่ระบุพันธุ์',birth=$r('#pet-birth').value||p?.birthDate||null;const factors={neutered:1.5,intact:1.7,inactive:1.1,'puppy-young':3,'puppy-old':2};const factor=factors[$r('#pet-life').value]||1.5,rer=70*Math.pow(weight,.75),min=Math.round(rer*factor*.9),max=Math.round(rer*factor*1.1),kcal100=num('pet-food-kcal');const grams=kcal100>0?` · เมื่ออาหารนี้ให้ ${kcal100} kcal/100g: ประมาณ ${Math.round(min*100/kcal100)}–${Math.round(max*100/kcal100)} g/วัน`:'';$r('#pet-profile').textContent=`${name} · ${kind} · วันเกิด ${birth||'ไม่ระบุ'} (${ageText(birth)}) · ${weight} kg`;$r('#pet-calorie-estimate').textContent=`พลังงานเริ่มต้นประเมิน ${min}–${max} kcal/วัน (RER ${Math.round(rer)} × ปัจจัย ${factor}; ปรับตามคำแนะนำสัตวแพทย์)${grams}`;}
function savePetFood(){const p=(state.petProfiles||[])[0],name=$r('#pet-food-name').value.trim(),grams=num('pet-food-grams'),kcal=num('pet-food-kcal');if(!p||!name||grams===null)return toast('กรอกข้อมูลน้อง ชื่ออาหาร และปริมาณก่อนค่ะ','err');try{addDoc(userCol(state.uid,'pet_food_records'),{petId:p.id,date:localDateStr(),name,grams,kcalPer100:kcal,allergy:$r('#pet-food-allergy').value,note:$r('#pet-food-notes').value.trim(),createdAt:new Date()}).catch(e=>toast(e.message,'err'));['#pet-food-name','#pet-food-grams','#pet-food-kcal','#pet-food-notes'].forEach(sel=>{if($r(sel))$r(sel).value='';});if($r('#pet-food-allergy'))$r('#pet-food-allergy').value='unknown';const st=$r('#pet-food-scan-status');if(st){st.textContent='';st.classList.add('hidden');}renderPetEstimate();toast('บันทึกอาหารน้องแล้ว');}catch(e){toast(e.message,'err');}}
function renderPetFoodPresets() {
  const box = $r('#pet-food-presets');
  if (!box) return;
  const sorted = (state.petFoods || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const unique = [];
  const seen = new Set();
  for (const x of sorted) {
    const rawName = String(x.name || '').trim();
    if (!rawName) continue;
    const k = rawName.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(x);
    if (unique.length >= 8) break;
  }
  if (!unique.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `
    <p class="text-[11px] text-slate-500">อาหารที่เคยบันทึก (0 โทเค็น · กดเพื่อกรอกซ้ำ):</p>
    <div class="flex flex-wrap gap-1.5">
      ${unique.map(x => `<button type="button" data-pf-preset="${esc(String(x.name || '').trim().toLowerCase())}" class="chip bg-slate-100 hover:bg-lav-soft text-slate-700 text-[11px]">🐾 ${esc(x.name)}${x.kcalPer100 != null ? ` (${x.kcalPer100} kcal/100g)` : ''}</button>`).join('')}
    </div>
  `;
}

async function savePetDailyCare(task) {
  const pet = (state.petProfiles || [])[0];
  if (!pet) return toast('บันทึกโปรไฟล์น้องก่อนเริ่มบันทึกกิจวัตรค่ะ', 'err');
  const today = localDateStr();
  const pendingKey = `${pet.id}:${task.key}:${today}`;
  if (pendingPetCare.has(pendingKey)) return;
  const existing = (state.petCare || []).find(record => record.petId === pet.id && record.date === today && record.type === task.label && record.recordKind !== 'symptom');
  if (existing?.done) return toast(`บันทึก${task.label}วันนี้แล้ว`);

  pendingPetCare.add(pendingKey);
  renderPetDailyCare();
  try {
    if (existing) {
      await updateDoc(userDoc(state.uid, 'pet_care_records', existing.id), { done: true, dismissedFor: null, updatedAt: new Date() });
      state.petCare = (state.petCare || []).map(record => record.id === existing.id ? { ...record, done: true, dismissedFor: null, updatedAt: new Date() } : record);
    } else {
      const record = { petId: pet.id, category: 'สัตว์เลี้ยง', type: task.label, date: today, nextDate: null, done: true, createdAt: new Date() };
      const saved = await addDoc(userCol(state.uid, 'pet_care_records'), record);
      state.petCare = [...(state.petCare || []), { ...record, id: saved.id }];
    }
    toast(`บันทึก${task.label}แล้ว`);
  } catch (error) {
    toast('บันทึกไม่สำเร็จ: ' + error.message, 'err');
  } finally {
    pendingPetCare.delete(pendingKey);
    renderPetDailyCare();
  }
}

function renderPetDailyCare() {
  const actions = $r('#pet-care-actions');
  if (!actions) return;
  const pet = (state.petProfiles || [])[0];
  const today = localDateStr();
  const doneCount = DAILY_PET_CARE.filter(task => (state.petCare || []).some(record => record.petId === pet?.id && record.date === today && record.type === task.label && record.done)).length;
  $r('#pet-care-done-count').textContent = `${doneCount}/${DAILY_PET_CARE.length} แล้ว`;
  actions.innerHTML = DAILY_PET_CARE.map(task => {
    const key = `${pet?.id || ''}:${task.key}:${today}`;
    const done = (state.petCare || []).some(record => record.petId === pet?.id && record.date === today && record.type === task.label && record.done);
    const pending = pendingPetCare.has(key);
    return `<button type="button" data-pet-care-action="${task.key}" ${!pet || done || pending ? 'disabled' : ''} aria-label="${done ? `บันทึก${task.label}แล้ววันนี้` : `${task.label}วันนี้`}" class="min-h-16 rounded-xl border px-2.5 py-2 text-left transition ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300'} disabled:cursor-default">
      <span class="flex items-center justify-between gap-1">${iconSvg(task.icon, { size: 16, className: 'text-brand' })}<span class="text-[11px] font-semibold ${done ? 'text-emerald-700' : pending ? 'text-amber-700' : 'text-slate-500'}">${done ? '✓ เสร็จ' : pending ? 'บันทึก…' : 'รอทำ'}</span></span>
      <span class="mt-1 block text-xs font-semibold">${task.label}</span>
    </button>`;
  }).join('');
  const timeline = $r('#pet-care-timeline');
  if (!timeline) return;
  if (!pet) {
    timeline.innerHTML = '<p class="text-xs text-slate-500">บันทึกโปรไฟล์น้องเพื่อเริ่มใช้ปุ่มดูแลประจำวัน</p>';
    return;
  }
  const rows = (state.petCare || []).filter(record => record.petId === pet.id && record.recordKind !== 'symptom').slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 4);
  timeline.innerHTML = rows.length ? `<ol class="space-y-1.5" aria-label="กิจกรรมดูแลล่าสุด">${rows.map(record => `<li class="flex items-center gap-2 rounded-xl bg-white/80 px-2.5 py-2 text-xs"><span class="h-2 w-2 shrink-0 rounded-full ${record.done ? 'bg-emerald-500' : 'bg-amber-400'}"></span><span class="font-medium text-slate-700">${esc(record.type || 'ดูแลสัตว์เลี้ยง')}</span><span class="ml-auto whitespace-nowrap text-slate-500 tabular-nums">${esc(fmtDate(record.date))}</span><span class="text-[11px] font-medium ${record.done ? 'text-emerald-700' : 'text-amber-800'}">${record.done ? 'เสร็จแล้ว' : 'รอดำเนินการ'}</span></li>`).join('')}</ol>` : '<p class="text-xs text-slate-500">กิจกรรมที่บันทึกจะแสดงที่นี่</p>';
}

function renderPetFoods() {
  renderPetFoodPresets();
  const rows = (state.petFoods || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 10);
  $r('#pet-food-list').innerHTML = rows.map(record => `<article class="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
    <time datetime="${esc(record.date)}" class="flex w-12 shrink-0 flex-col items-center rounded-lg bg-white px-1 py-1.5 text-center tabular-nums"><span class="text-[10px] text-slate-500">ด.${esc(record.date.slice(5, 7))}</span><b class="text-sm text-slate-700">${esc(record.date.slice(8, 10))}</b></time>
    <div class="min-w-0 flex-1 space-y-1"><div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><b class="text-sm text-slate-800">${esc(record.name)}</b><span class="text-xs font-semibold tabular-nums text-amber-800">${esc(record.grams)} g</span>${record.kcalPer100 != null ? `<span class="text-xs tabular-nums text-slate-600">· ${Math.round(record.kcalPer100 * record.grams / 100)} kcal</span>` : ''}</div><p class="text-[11px] ${record.allergy === 'yes' ? 'text-rose-700 font-semibold' : record.allergy === 'no' ? 'text-emerald-700' : 'text-slate-500'}">${record.allergy === 'yes' ? '⚠️ สงสัยแพ้' : record.allergy === 'no' ? 'ไม่พบอาการแพ้' : 'ยังไม่ทราบการแพ้'}${record.note ? ` · ${esc(record.note)}` : ''}</p></div>
    <button type="button" data-del-pet-food="${esc(record.id)}" class="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50" aria-label="ลบบันทึกอาหาร ${esc(record.name)}">${iconSvg('trash', { size: 14 })}</button>
  </article>`).join('') || '<p class="text-xs text-slate-500">ยังไม่มีบันทึกอาหาร</p>';
  $r('#pet-food-list').onclick = event => {
    const button = event.target.closest('[data-del-pet-food]');
    if (button && confirm('ลบบันทึกอาหารน้องนี้?')) deleteDoc(userDoc(state.uid, 'pet_food_records', button.dataset.delPetFood)).catch(error => toast(error.message, 'err'));
  };
}

function renderPetSymptomGrid() {
  const grid = $r('#pet-sx-grid');
  if (!grid) return;
  grid.innerHTML = PET_SYMPTOMS.map(([key, label]) => {
    const cur = petSxDraft[key] ?? 0;
    return `
      <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-1.5">
        <p class="text-xs font-semibold text-slate-700">${esc(label)}</p>
        <div class="grid grid-cols-4 gap-1">
          ${PET_SX_LEVELS.map((lvText, lv) => `
            <button type="button" data-psx-key="${key}" data-psx-lv="${lv}" class="min-h-[36px] py-1.5 px-1 rounded-lg text-[11px] border transition ${cur === lv ? `${PET_SX_COLORS[lv]} border-slate-300 shadow-xs` : 'bg-white border-slate-200 text-slate-600'}">${lvText}</button>
          `).join('')}
        </div>
      </div>`;
  }).join('');
}

function resetPetSymptomForm() {
  editingSxId = null;
  petSxDraft = Object.fromEntries(PET_SYMPTOMS.map(([k]) => [k, 0]));
  $r('#pet-sx-date').value = localDateStr();
  $r('#pet-sx-temp').value = '';
  $r('#pet-sx-note').value = '';
  $r('#pet-sx-save').innerHTML = `${iconSvg('plus', { size: 15 })} บันทึกอาการน้องหมา`;
  $r('#pet-sx-cancel').classList.add('hidden');
  renderPetSymptomGrid();
}

function savePetSymptom() {
  const date = $r('#pet-sx-date').value;
  if (!date) return toast('กรุณาเลือกวันที่', 'err');
  const tempRaw = $r('#pet-sx-temp').value;
  const tempC = tempRaw === '' ? null : Number(tempRaw);
  if (tempC !== null && (!Number.isFinite(tempC) || tempC < 34 || tempC > 43)) {
    return toast('อุณหภูมิควรอยู่ระหว่าง 34.0 – 43.0 °C', 'err');
  }
  const note = $r('#pet-sx-note').value.trim().slice(0, 2000);
  const hasAnySymptom = Object.values(petSxDraft).some(v => v > 0);
  if (!hasAnySymptom && tempC === null && !note) {
    // อนุญาตให้บันทึกวัน "ปกติทุกด้าน" ได้หากตั้งใจ แต่ถ้าจะชัดเจนให้ระบุหรือยืนยันผ่าน note ก็ได้ — ยอมให้บันทึกปกติทุกด้านได้!
  }
  const pet = (state.petProfiles || [])[0];
  const payload = {
    petId: pet?.id || '',
    recordKind: 'symptom',
    type: 'บันทึกอาการน้องหมา',
    category: 'อาการน้องหมา',
    date,
    nextDate: null,
    done: true,
    symptoms: { ...petSxDraft },
    ...(tempC !== null && { value: Math.round(tempC * 10) / 10 }),
    note,
    updatedAt: new Date()
  };
  try {
    if (editingSxId) {
      updateDoc(userDoc(state.uid, 'pet_care_records', editingSxId), payload)
        .catch(e => toast('แก้ไขไม่สำเร็จ: ' + e.message, 'err'));
      toast('อัปเดตบันทึกอาการน้องหมาแล้ว');
    } else {
      addDoc(userCol(state.uid, 'pet_care_records'), { ...payload, createdAt: new Date() })
        .catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
      toast('บันทึกอาการน้องหมาแล้ว 🐶');
    }
    resetPetSymptomForm();
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'err');
  }
}

function onPetSymptomListClick(e) {
  const editBtn = e.target.closest('[data-edit-pet-sx]');
  if (editBtn) {
    const rec = (state.petCare || []).find(x => x.id === editBtn.dataset.editPetSx && x.recordKind === 'symptom');
    if (!rec) return;
    editingSxId = rec.id;
    petSxDraft = Object.fromEntries(PET_SYMPTOMS.map(([k]) => [k, Number(rec.symptoms?.[k]) || 0]));
    $r('#pet-sx-date').value = rec.date || localDateStr();
    $r('#pet-sx-temp').value = rec.value != null ? String(rec.value) : '';
    $r('#pet-sx-note').value = rec.note || '';
    $r('#pet-sx-save').innerHTML = `${iconSvg('check', { size: 15 })} บันทึกการแก้ไข`;
    $r('#pet-sx-cancel').classList.remove('hidden');
    renderPetSymptomGrid();
    $r('#pet-sx-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const delBtn = e.target.closest('[data-del-pet-sx]');
  if (delBtn && confirm('ลบบันทึกอาการน้องหมานี้?')) {
    deleteDoc(userDoc(state.uid, 'pet_care_records', delBtn.dataset.delPetSx))
      .catch(err => toast(err.message, 'err'));
    if (editingSxId === delBtn.dataset.delPetSx) resetPetSymptomForm();
  }
}

function renderPetSymptomsList() {
  const box = $r('#pet-sx-list');
  if (!box) return;
  const rows = (state.petCare || [])
    .filter(x => x.recordKind === 'symptom')
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (!rows.length) {
    box.innerHTML = '<p class="text-xs text-slate-500">ยังไม่มีบันทึกอาการน้องหมา</p>';
    return;
  }
  box.innerHTML = rows.slice(0, 20).map(r => {
    const badges = PET_SYMPTOMS
      .map(([k, lbl]) => [lbl, Number(r.symptoms?.[k]) || 0])
      .filter(([, lv]) => lv > 0)
      .map(([lbl, lv]) => `<span class="rounded-md px-2 py-0.5 text-[11px] ${PET_SX_COLORS[lv]}">${esc(lbl.split(' / ')[0])}: ${PET_SX_LEVELS[lv]}</span>`)
      .join('');
    return `
      <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 flex items-start justify-between gap-2">
        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-1.5 tabular-nums">
            <span class="font-semibold text-slate-800">${esc(fmtDate(r.date))}</span>
            ${r.value != null ? `<span class="rounded-md bg-sky-soft text-blue-800 px-2 py-0.5 text-[11px]">🌡️ ${r.value} °C</span>` : ''}
            ${badges || '<span class="rounded-md bg-ok-soft text-green-800 px-2 py-0.5 text-[11px]">ปกติทุกด้าน ✓</span>'}
          </div>
          ${r.note ? `<p class="text-xs text-slate-600">${esc(r.note)}</p>` : ''}
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button type="button" data-edit-pet-sx="${esc(r.id)}" class="chip min-h-[36px] bg-sky-soft text-blue-700 text-xs">แก้</button>
          <button type="button" data-del-pet-sx="${esc(r.id)}" class="chip min-h-[36px] bg-pink-soft text-rose-600 text-xs">ลบ</button>
        </div>
      </div>`;
  }).join('');
}
