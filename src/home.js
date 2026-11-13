// หน้า Home: ภาพรวมของวันนี้ (อ่านข้อมูลอย่างเดียว ไม่เขียนลงฐานข้อมูล)
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, daysBetween, round1 } from './util.js';
import { periodStats } from './period.js';
import { bodyLatest, sortBodyDesc } from './body.js';
import { getTargets } from './profile.js';
import { collectReminders } from './reminders.js';
import { MOODS } from './symptoms.js';
import { CATEGORIES } from './categories.js';

let go = () => {};
export function mountHome(navigate) {
  go = navigate;
  $('#home-today').addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go, b.dataset.focus || null);
  });
}

const num = v => (Number.isFinite(+v) ? +v : 0);
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return ['ราตรีสวัสดิ์', '🌙'];
  if (h < 12) return ['อรุณสวัสดิ์', '☀️'];
  if (h < 17) return ['สวัสดีตอนบ่าย', '🌤️'];
  if (h < 20) return ['สวัสดีตอนเย็น', '🌇'];
  return ['ราตรีสวัสดิ์', '🌙'];
}

function periodLine(p, today) {
  if (!p) return ['ยังไม่มีข้อมูล', 'แตะเพื่อบันทึกรอบแรก'];
  const sinceStart = daysBetween(p.lastStart, today);
  const ongoing = p.lastEnd ? today <= p.lastEnd : sinceStart <= (p.avgDur || 7) - 1;
  if (sinceStart >= 0 && ongoing) return [`วันที่ ${sinceStart + 1}`, 'ของประจำเดือนรอบนี้'];
  if (p.next) {
    const until = daysBetween(today, p.next);
    if (until > 0) return [`อีก ${until} วัน`, `คาดว่าจะมา ~${esc(fmtDate(p.next))}`];
    if (until === 0) return ['วันนี้', 'คาดว่าจะมา (ค่าประมาณ)'];
    return [`เลยมา ${-until} วัน`, 'จากวันที่คาดการณ์'];
  }
  return [`${sinceStart} วัน`, 'นับจากครั้งล่าสุด'];
}

export function renderHome() {
  const el = $('#home-today');
  if (!el || !state.uid) return;
  const today = localDateStr();
  const [hello, sun] = greeting();
  const name = (state.user?.displayName || '').split(' ')[0];
  const dateText = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });

  // อาหารวันนี้
  const foods = state.todayFood || [];
  const t = getTargets();
  const sum = k => foods.reduce((a, i) => a + num(i[k]), 0);
  const kcal = Math.round(sum('calories')), pct = t.kcal ? Math.min(100, Math.round(kcal / t.kcal * 100)) : 0;
  const left = t.kcal - kcal;
  const macro = (label, v, goal) => `<div class="macro"><span>${label}</span><b>${round1(v)}<small>/${goal ?? '-'}g</small></b></div>`;

  // ออกกำลังกายวันนี้
  const wk = (state.workouts || []).filter(w => w.date === today);
  const mins = wk.reduce((a, w) => a + (w.durationMin || 0), 0), burn = wk.reduce((a, w) => a + (w.estKcal || 0), 0);

  const p = periodStats(state.period || []);
  const [pMain, pSub] = periodLine(p, today);

  const b = bodyLatest(state.body || []);
  const weights = sortBodyDesc(state.body || []).filter(r => typeof r.weight === 'number');
  const diff = weights.length > 1 ? round1(weights[0].weight - weights[1].weight) : null;

  const sym = (state.symptoms || []).find(r => (r.date || r.id) === today);
  const symCount = sym ? Object.values(sym.symptoms || {}).filter(v => +v > 0).length : 0;

  const reminders = collectReminders().filter(r => r.date <= today || daysBetween(today, r.date) <= 7).slice(0, 3);

  const tile = (cat, emoji, title, main, sub, goTo, focus = '') => `<button data-go="${goTo}" data-focus="${focus}" class="tile ${cat}">
      <span class="tile-head"><span class="emoji-bubble emoji-sm">${emoji}</span><span>${title}</span></span>
      <span class="tile-main">${main}</span><span class="tile-sub">${sub}</span></button>`;

  el.innerHTML = `
    <section class="home-hello">
      <p class="text-sm text-slate-500">${esc(dateText)}</p>
      <h1 class="text-2xl font-bold text-slate-800">${hello}${name ? ', ' + esc(name) : ''} ${sun}</h1>
      <p class="text-sm text-slate-500">ภาพรวมของวันนี้ ค่อย ๆ ดูแลตัวเองนะ</p>
    </section>

    <button data-go="food" class="card food-today cat-food w-full text-left">
      <div class="flex items-center justify-between gap-3">
        <span class="tile-head"><span class="emoji-bubble emoji-sm">🍙</span><span>อาหารวันนี้</span></span>
        <span class="text-xs text-slate-500">${foods.length} รายการ</span>
      </div>
      <div class="flex items-end justify-between gap-3 mt-2">
        <div><span class="text-3xl font-bold text-slate-800">${kcal.toLocaleString()}</span><span class="text-sm text-slate-500"> / ${t.kcal.toLocaleString()} kcal</span></div>
        <span class="text-xs font-medium ${left >= 0 ? 'text-slate-600' : 'text-amber-700'}">${left >= 0 ? `เหลืออีก ${Math.round(left).toLocaleString()}` : `เกินเป้า ${Math.round(-left).toLocaleString()}`} kcal</span>
      </div>
      <div class="progress mt-3"><span style="width:${pct}%"></span></div>
      <div class="grid grid-cols-3 gap-2 mt-3">${macro('โปรตีน', sum('protein'), t.protein)}${macro('คาร์บ', sum('carbs'), t.carbs)}${macro('ไขมัน', sum('fat'), t.fat)}</div>
    </button>

    <div class="grid grid-cols-2 gap-3">
      ${tile('cat-workout', '🏃‍♀️', 'ออกกำลังกาย', wk.length ? `${mins} นาที` : 'ยังไม่ได้ขยับ', wk.length ? `${wk.length} ครั้ง${burn ? ` · ~${burn} kcal` : ''}` : 'แตะเพื่อบันทึก', 'workout', 'w-type')}
      ${tile('cat-period', '🌸', 'ประจำเดือน', pMain, pSub, 'period')}
      ${tile('cat-body', '⚖️', 'น้ำหนักล่าสุด', b.weight ? `${b.weight.v} กก.` : 'ยังไม่มีข้อมูล', b.weight ? `${esc(fmtDate(b.weight.d))}${diff ? ` · ${diff > 0 ? '+' : ''}${diff}` : ''}` : 'แตะเพื่อบันทึก', 'body', 'b-weight')}
      ${tile('cat-symptoms', '🌿', 'อาการวันนี้', sym ? (sym.mood ? esc(MOODS[sym.mood]) : symCount ? `${symCount} อาการ` : 'สบายดี') : 'ยังไม่ได้บันทึก', sym ? (symCount ? `${symCount} อาการที่บันทึก` : 'บันทึกแล้ว') : 'แตะเพื่อบันทึก', 'symptoms')}
    </div>

    <section class="card space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-slate-800"><span class="emoji-bubble emoji-sm cat-body">🔔</span> ใกล้ถึงกำหนด</h2>
        <button data-go="notifications" class="text-xs text-slate-500 underline">ดูทั้งหมด</button>
      </div>
      ${reminders.length ? reminders.map(r => `<div class="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"><span class="emoji-bubble emoji-sm">${r.icon}</span><div class="min-w-0"><b class="text-sm block truncate">${esc(r.label)}</b><span class="text-xs text-slate-500">${esc(fmtDate(r.date))} · ${esc(r.detail)}</span></div></div>`).join('')
        : '<p class="rounded-2xl bg-ok-soft p-3 text-sm text-green-800">🌼 ไม่มีอะไรต้องรีบทำ พักผ่อนได้เลย</p>'}
    </section>

    <section class="space-y-2">
      <h2 class="font-bold text-slate-800 px-1">ไปที่หมวด</h2>
      <div class="grid grid-cols-4 gap-3">${CATEGORIES.map(c => `<button data-go="${c.tab}" class="cat-tile ${c.cat}"><span class="emoji-bubble">${c.emoji}</span><span>${c.label}</span></button>`).join('')}</div>
    </section>`;
}
