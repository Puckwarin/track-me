import { setDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state, emit } from './state.js';
import { $, esc, toNum, round1, toast } from './util.js';
import { bodyLatest } from './body.js';

export const ACTIVITY = [
  ['sedentary', 'นั่งทำงานเป็นหลัก แทบไม่ออกกำลังกาย', 1.2],
  ['light', 'ออกกำลังกายเบา 1–3 วัน/สัปดาห์', 1.375],
  ['moderate', 'ออกกำลังกายปานกลาง 3–5 วัน/สัปดาห์', 1.55],
  ['active', 'ออกกำลังกายหนัก 6–7 วัน/สัปดาห์', 1.725],
  ['very', 'หนักมาก / งานใช้แรงทั้งวัน', 1.9]
];
export const GOAL_PRESETS = [['-500', 'ลดน้ำหนัก (−500 kcal)'], ['-300', 'ลดน้ำหนักช้า ๆ (−300 kcal)'], ['0', 'คงน้ำหนัก'], ['300', 'เพิ่มน้ำหนัก/กล้ามเนื้อ (+300 kcal)']];
export const DEFAULT_MEALS = [{ id: 'breakfast', name: 'มื้อเช้า', pct: 30 }, { id: 'lunch', name: 'มื้อกลางวัน', pct: 40 }, { id: 'dinner', name: 'มื้อเย็น', pct: 30 }];
const FALLBACK = { kcal: 2000, protein: 100, carbs: 200, fat: 60 };

export const getMeals = () => (state.profile?.meals?.length ? state.profile.meals : DEFAULT_MEALS);
const currentWeight = p => bodyLatest(state.body).weight?.v ?? p?.weightKg ?? null;

// BMR: Mifflin-St Jeor · TDEE = BMR × ตัวคูณกิจกรรม
export function calcBody(p, weightOverride) {
  const w = weightOverride ?? currentWeight(p), h = p?.heightCm, age = p?.birthYear ? new Date().getFullYear() - p.birthYear : null;
  if (!w || !h || !age || age < 10 || age > 100) return null;
  const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === 'male' ? 5 : -161);
  const tdee = bmr * (ACTIVITY.find(a => a[0] === p.activity)?.[2] ?? 1.375);
  const bmi = w / ((h / 100) ** 2);
  return { w, h, age, bmr, tdee, bmi };
}
// เกณฑ์ BMI สำหรับคนเอเชีย (WHO Asia-Pacific / กรมอนามัยไทย)
export function bmiLabel(b) {
  return b < 18.5 ? 'น้ำหนักน้อย' : b < 23 ? 'สมส่วน' : b < 25 ? 'น้ำหนักเกิน (ท้วม)' : b < 30 ? 'โรคอ้วนระดับ 1' : 'โรคอ้วนระดับ 2';
}

export function getTargets(p = state.profile) {
  const c = calcBody(p);
  if (!p || !c) return { ...FALLBACK, source: 'default' };
  const kcal = Math.round(p.kcalOverride || c.tdee + (p.adjust || 0));
  const protein = Math.round((p.proteinPerKg ?? 1.4) * c.w);
  const fat = Math.round(kcal * ((p.fatPct ?? 25) / 100) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat, source: 'profile' };
}

let root, dirty = false, meals = [];

export function mountProfile(el) {
  root = el;
  root.innerHTML = `
    <h3 class="font-bold text-slate-800"><i class="fa-solid fa-bullseye text-brand"></i> เป้าหมายพลังงาน (BMI / TDEE)</h3>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="lbl">เพศ (ใช้ในสูตร BMR)</label><select id="pf-sex" class="input"><option value="female">หญิง</option><option value="male">ชาย</option></select></div>
      <div><label class="lbl">ปีเกิด (ค.ศ.)</label><input id="pf-birth" type="number" inputmode="numeric" placeholder="เช่น 1995" class="input"></div>
      <div><label class="lbl">ส่วนสูง (ซม.)</label><input id="pf-height" type="number" inputmode="decimal" class="input"></div>
      <div><label class="lbl">น้ำหนัก (กก.)</label><input id="pf-weight" type="number" inputmode="decimal" class="input"><p id="pf-wnote" class="text-[11px] text-slate-400 mt-0.5"></p></div>
      <div class="col-span-2"><label class="lbl">ระดับกิจกรรม</label><select id="pf-act" class="input">${ACTIVITY.map(a => `<option value="${a[0]}">${a[1]}</option>`).join('')}</select></div>
      <div class="col-span-2"><label class="lbl">เป้าหมาย</label><select id="pf-goal" class="input">${GOAL_PRESETS.map(g => `<option value="${g[0]}">${g[1]}</option>`).join('')}<option value="custom">กำหนดส่วนต่างเอง</option></select></div>
      <div><label class="lbl">ส่วนต่างจาก TDEE (kcal/วัน)</label><input id="pf-adj" type="number" inputmode="numeric" class="input"></div>
      <div><label class="lbl">หรือตั้งแคลอรี่เป้าหมายเอง</label><input id="pf-kcal" type="number" inputmode="numeric" placeholder="เว้นว่าง = คำนวณให้" class="input"></div>
      <div><label class="lbl">โปรตีน (g ต่อ กก.)</label><input id="pf-prot" type="number" step="0.1" inputmode="decimal" class="input"></div>
      <div><label class="lbl">ไขมัน (% ของพลังงาน)</label><input id="pf-fat" type="number" inputmode="numeric" class="input"></div>
    </div>
    <div id="pf-result" class="rounded-xl bg-lav-soft/50 p-3 text-sm space-y-1"></div>
    <p class="text-xs text-slate-400">ค่าที่คำนวณเป็นค่าประมาณทั่วไป (สูตร Mifflin-St Jeor) ไม่ใช่คำแนะนำทางการแพทย์ — มีโรคประจำตัว ตั้งครรภ์ หรือต้องการลดน้ำหนักมาก ควรปรึกษาแพทย์/นักกำหนดอาหาร</p>
    <hr class="border-lav-soft">
    <h3 class="font-bold text-slate-800"><i class="fa-solid fa-utensils text-brand"></i> มื้ออาหารของฉัน</h3>
    <p class="text-xs text-slate-500">เพิ่ม/ลด/เปลี่ยนชื่อมื้อได้ (เช่น มื้อสาย มื้อบ่าย) และกำหนดสัดส่วนพลังงานของแต่ละมื้อ — หน้าอาหารจะแสดงว่าแต่ละมื้อกินไปเท่าไรเทียบกับเป้า</p>
    <div id="pf-meals" class="space-y-2"></div>
    <div class="flex items-center justify-between text-xs"><button id="pf-add-meal" class="chip bg-lav-soft text-brand-dark"><i class="fa-solid fa-plus"></i> เพิ่มมื้อ</button><span id="pf-pct-sum"></span></div>
    <div class="flex justify-end"><button id="pf-save" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> บันทึกการตั้งค่า</button></div>`;
  root.addEventListener('input', e => { dirty = true; if (e.target.closest('#pf-meals')) readMeals(); preview(); });
  root.addEventListener('change', e => {
    if (e.target.id === 'pf-goal') { const v = e.target.value; if (v !== 'custom') $('#pf-adj', root).value = v; }
    if (e.target.id === 'pf-adj') $('#pf-goal', root).value = GOAL_PRESETS.some(g => g[0] === e.target.value) ? e.target.value : 'custom';
    dirty = true; preview();
  });
  $('#pf-add-meal', root).addEventListener('click', () => { readMeals(); meals.push({ id: 'm' + Date.now().toString(36), name: 'มื้อใหม่', pct: 0 }); dirty = true; renderMeals(); });
  $('#pf-meals', root).addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    if (meals.length <= 1) return toast('ต้องมีอย่างน้อย 1 มื้อ', 'err');
    readMeals(); meals.splice(+b.dataset.rm, 1); dirty = true; renderMeals();
  });
  $('#pf-save', root).addEventListener('click', save);
  fill();
}

function fill() {
  if (!root) return;
  const p = state.profile || {};
  const set = (id, v) => { $('#' + id, root).value = v ?? ''; };
  set('pf-sex', p.sex || 'female'); set('pf-birth', p.birthYear); set('pf-height', p.heightCm); set('pf-weight', p.weightKg);
  set('pf-act', p.activity || 'light'); set('pf-adj', p.adjust ?? -300); set('pf-kcal', p.kcalOverride); set('pf-prot', p.proteinPerKg ?? 1.4); set('pf-fat', p.fatPct ?? 25);
  $('#pf-goal', root).value = GOAL_PRESETS.some(g => g[0] === String(p.adjust ?? -300)) ? String(p.adjust ?? -300) : 'custom';
  meals = getMeals().map(m => ({ ...m }));
  renderMeals();
}

// เรียกเมื่อข้อมูลโปรไฟล์/น้ำหนักเปลี่ยน — ไม่เขียนทับสิ่งที่กำลังพิมพ์
export function refreshProfile() { if (root && !dirty) fill(); else preview(); }

function renderMeals() {
  $('#pf-meals', root).innerHTML = meals.map((m, i) => `
    <div class="flex items-center gap-2">
      <input data-k="name" data-i="${i}" class="input" value="${esc(m.name)}" maxlength="30" aria-label="ชื่อมื้อ">
      <div class="flex items-center gap-1 shrink-0"><input data-k="pct" data-i="${i}" type="number" inputmode="numeric" min="0" max="100" class="input !w-20 text-right" value="${m.pct}" aria-label="เปอร์เซ็นต์พลังงาน"><span class="text-xs text-slate-500">%</span></div>
      <button data-rm="${i}" class="text-rose-400 hover:text-rose-600 p-2" aria-label="ลบมื้อ"><i class="fa-solid fa-trash-can text-xs"></i></button>
    </div>`).join('');
  preview();
}
function readMeals() {
  $('#pf-meals', root).querySelectorAll('input[data-k]').forEach(inp => {
    const m = meals[+inp.dataset.i]; if (!m) return;
    m[inp.dataset.k] = inp.dataset.k === 'pct' ? (toNum(inp.value) ?? 0) : inp.value;
  });
}

function draft() {
  const g = id => $('#' + id, root).value;
  return {
    sex: g('pf-sex'), birthYear: toNum(g('pf-birth')), heightCm: toNum(g('pf-height')), weightKg: toNum(g('pf-weight')),
    activity: g('pf-act'), adjust: toNum(g('pf-adj')) ?? 0, kcalOverride: toNum(g('pf-kcal')),
    proteinPerKg: toNum(g('pf-prot')) ?? 1.4, fatPct: toNum(g('pf-fat')) ?? 25
  };
}

function preview() {
  if (!root) return;
  const p = draft(), live = bodyLatest(state.body).weight;
  $('#pf-wnote', root).textContent = live ? `ใช้น้ำหนักล่าสุดจากแท็บน้ำหนักเป็นหลัก (${live.v} กก.)` : 'ยังไม่มีน้ำหนักในแท็บน้ำหนัก จึงใช้ค่านี้';
  const c = calcBody(p), box = $('#pf-result', root);
  const sum = meals.reduce((a, m) => a + (m.pct || 0), 0);
  $('#pf-pct-sum', root).innerHTML = `<span class="${sum === 100 ? 'text-green-700' : 'text-amber-700'}">รวม ${sum}%${sum === 100 ? ' ✓' : ' (ควรรวม 100%)'}</span>`;
  if (!c) { box.innerHTML = '<span class="text-slate-500">กรอกเพศ ปีเกิด ส่วนสูง และน้ำหนัก เพื่อคำนวณ BMI / BMR / TDEE (ตอนนี้ใช้ค่าเริ่มต้น 2,000 kcal)</span>'; return; }
  const t = getTargets({ ...p });
  const warn = t.kcal < 1200 ? '<p class="text-xs text-rose-600">⚠️ เป้าหมายต่ำกว่า 1,200 kcal/วัน ซึ่งต่ำมากสำหรับคนส่วนใหญ่ — ควรปรึกษาแพทย์หรือนักกำหนดอาหารก่อน</p>' : '';
  box.innerHTML = `<p><b>BMI ${round1(c.bmi)}</b> · ${bmiLabel(c.bmi)} <span class="text-[11px] text-slate-400">(เกณฑ์เอเชีย: 18.5–22.9 สมส่วน)</span></p>
    <p>BMR ${Math.round(c.bmr)} kcal · <b>TDEE ${Math.round(c.tdee)} kcal</b>/วัน</p>
    <p class="font-semibold text-brand-dark">เป้าหมายต่อวัน: ${t.kcal.toLocaleString()} kcal · โปรตีน ${t.protein} g · คาร์บ ${t.carbs} g · ไขมัน ${t.fat} g</p>${warn}`;
}

function save() {
  readMeals();
  const p = draft();
  if (!meals.every(m => String(m.name).trim())) return toast('ตั้งชื่อมื้อให้ครบ', 'err');
  const rec = { ...p, meals: meals.map(m => ({ id: m.id, name: String(m.name).trim(), pct: m.pct || 0 })), updatedAt: new Date() };
  for (const k of Object.keys(rec)) if (rec[k] === null || rec[k] === undefined) delete rec[k];
  setDoc(userDoc(state.uid, 'settings', 'profile'), rec).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  dirty = false;
  toast('บันทึกแล้ว');
}
