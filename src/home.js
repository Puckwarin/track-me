// หน้า Home: Weekly Planner & To-Do List + ภาพรวมวันนี้ + ทางลัดแจ้งเตือน
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, round1, toast } from './util.js';
import { getTargets } from './profile.js';
import { collectReminders } from './reminders.js';
import { CATEGORIES } from './categories.js';
import { mountPlanner, renderPlanner } from './planner.js';
import { getPushStatus, enablePushNotifications } from './push.js';

let go = () => {};

export function mountHome(navigate) {
  go = navigate;
  const el = $('#home-today');
  el.innerHTML = `
    <section id="home-head" class="space-y-2"></section>
    <div id="home-planner"></div>
    <div id="home-rest" class="space-y-4"></div>`;

  mountPlanner($('#home-planner', el), navigate);

  el.addEventListener('click', async e => {
    const pushBtn = e.target.closest('#home-push-btn');
    if (pushBtn) {
      pushBtn.disabled = true;
      try {
        await enablePushNotifications();
        toast('เปิดรับการแจ้งเตือน 08:00 น. เรียบร้อยแล้ว 🔔');
        renderHome();
      } catch (err) {
        toast(err.message, 'err');
        if (err.message.includes('VAPID')) go('settings', 'st-push-card');
      } finally {
        pushBtn.disabled = false;
      }
      return;
    }
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

export function renderHome() {
  const el = $('#home-today');
  if (!el || !state.uid) return;
  const today = localDateStr();
  const [hello, sun] = greeting();
  const name = (state.user?.displayName || '').split(' ')[0];
  const dateText = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });

  const head = $('#home-head', el);
  if (head) {
    head.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="home-hello">
          <p class="text-sm text-slate-500">${esc(dateText)}</p>
          <h1 class="text-2xl font-bold text-slate-800">${hello}${name ? ', ' + esc(name) : ''} ${sun}</h1>
        </div>
        <div id="home-push-slot" class="shrink-0"></div>
      </div>`;
    refreshHomePushBtn();
  }

  renderPlanner();

  const foods = state.todayFood || [];
  const t = getTargets();
  const sum = k => foods.reduce((a, i) => a + num(i[k]), 0);
  const kcal = Math.round(sum('calories')), pct = t.kcal ? Math.min(100, Math.round(kcal / t.kcal * 100)) : 0;
  const left = t.kcal - kcal;
  const macro = (label, v, goal) => `<div class="macro"><span>${label}</span><b>${round1(v)}<small>/${goal ?? '-'}g</small></b></div>`;

  const reminders = collectReminders().slice(0, 3);

  const rest = $('#home-rest', el);
  if (rest) {
    rest.innerHTML = `
      <button data-go="food" class="card food-today cat-food w-full text-left">
        <div class="flex items-center justify-between gap-3">
          <span class="tile-head"><span class="emoji-bubble emoji-sm">🍙</span><span>อาหารวันนี้</span></span>
          <span class="text-xs text-slate-500">${foods.length} รายการ</span>
        </div>
        <div class="flex items-end justify-between gap-3 mt-2">
          <div><span class="text-2xl sm:text-3xl font-bold text-slate-800">${kcal.toLocaleString()}</span><span class="text-sm text-slate-500"> / ${t.kcal.toLocaleString()} kcal</span></div>
          <span class="text-xs font-medium ${left >= 0 ? 'text-slate-600' : 'text-amber-700'}">${left >= 0 ? `เหลืออีก ${Math.round(left).toLocaleString()}` : `เกินเป้า ${Math.round(-left).toLocaleString()}`} kcal</span>
        </div>
        <div class="progress mt-2.5"><span style="width:${pct}%"></span></div>
        <div class="grid grid-cols-3 gap-2 mt-2.5">${macro('โปรตีน', sum('protein'), t.protein)}${macro('คาร์บ', sum('carbs'), t.carbs)}${macro('ไขมัน', sum('fat'), t.fat)}</div>
      </button>

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
}

async function refreshHomePushBtn() {
  const slot = $('#home-push-slot');
  if (!slot) return;
  const st = await getPushStatus();
  if (!slot.isConnected) return;
  if (!st.supported && !st.needsIosInstall) {
    slot.innerHTML = '';
    return;
  }
  if (st.subscribedHere) {
    slot.innerHTML = `<button type="button" data-go="settings" data-focus="st-push-card" class="chip bg-ok-soft text-green-800"><i class="fa-solid fa-bell"></i> รับแจ้งเตือนแล้ว</button>`;
  } else {
    slot.innerHTML = `<button type="button" id="home-push-btn" class="chip bg-pink-soft text-rose-800 border border-pink-200"><i class="fa-regular fa-bell"></i> เปิดรับการแจ้งเตือน</button>`;
  }
}
