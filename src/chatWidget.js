import { $, esc, toast } from './util.js';
import { getGeminiKey, getGroqKey, explainGeminiError } from './nutrition.js';
import { runAssistantTurn, executeConfirmedAction, undoAssistantAction } from './services/aiAssistant.js';

const QUICK_PROMPTS = [
  '💸 เดือนนี้ค่ากินเท่าไหร่?',
  '📦 ในสต๊อกมีอะไรใกล้หมดบ้าง?',
  '☕ จดค่ากาแฟ 60 บาท',
  '📅 วันนี้มีนัดอะไรบ้าง?'
];

let isOpen = false;
let isBusy = false;
let goToFn = () => {};
const messages = []; // { role: 'user'|'assistant', text, receipts?: [{ icon, title, subtitle, undo, undone }] }

function ensureShell() {
  if ($('#ai-chat-fab')) return;
  const host = $('#app-shell') || document.body;

  const wrap = document.createElement('div');
  wrap.className = 'no-print';
  wrap.innerHTML = `
    <button id="ai-chat-fab" type="button" class="ai-chat-fab" aria-label="เปิดผู้ช่วย AI Track Me" aria-expanded="false" aria-controls="ai-chat-drawer" title="ผู้ช่วย AI">
      <i class="fa-solid fa-comments"></i>
    </button>

    <section id="ai-chat-drawer" class="ai-chat-drawer hidden" role="dialog" aria-modal="false" aria-labelledby="ai-chat-title">
      <header class="ai-chat-header">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="emoji-bubble emoji-sm cat-symptoms !mr-0">🤖</span>
          <div class="min-w-0">
            <h2 id="ai-chat-title" class="text-sm font-bold text-slate-800 truncate">ผู้ช่วย Track Me</h2>
            <p id="ai-chat-subtitle" class="text-[11px] text-slate-500 truncate">ถามข้อมูลหรือสั่งบันทึกได้ทันที</p>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button id="ai-chat-clear" type="button" class="icon-btn !w-10 !h-10 text-xs" title="เริ่มบทสนทนาใหม่" aria-label="เริ่มบทสนทนาใหม่">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
          <button id="ai-chat-close" type="button" class="icon-btn !w-10 !h-10" aria-label="ปิดหน้าต่างแชท">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </header>

      <div id="ai-chat-nokey" class="hidden mx-3 mt-2 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-2">
        <p class="font-semibold">ยังไม่ได้ตั้งค่า Gemini หรือ Groq API Key</p>
        <p class="text-amber-800">ใส่คีย์ในหน้าตั้งค่าก่อน เพื่อให้ผู้ช่วย AI อ่านและบันทึกข้อมูลให้คุณบนเครื่องนี้</p>
        <button id="ai-chat-go-settings" type="button" class="btn btn-soft !py-1.5 !px-3 !min-h-9 text-xs">ไปหน้าตั้งค่า</button>
      </div>

      <div id="ai-chat-messages" class="ai-chat-messages" aria-live="polite"></div>

      <div id="ai-chat-quick" class="ai-chat-quick">
        ${QUICK_PROMPTS.map((q, i) => `<button type="button" data-ai-prompt="${i}" class="ai-quick-btn whitespace-nowrap shrink-0">${esc(q)}</button>`).join('')}
      </div>

      <form id="ai-chat-form" class="ai-chat-form">
        <input id="ai-chat-input" type="text" class="input !rounded-full !py-2.5 text-sm flex-1 min-w-0" placeholder="พิมพ์คำถาม หรือสั่งบันทึก เช่น จดค่าข้าว 55 บาท" autocomplete="off">
        <button id="ai-chat-send" type="submit" class="btn btn-primary !px-4 !min-h-11 shrink-0" aria-label="ส่งข้อความ">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </form>
    </section>
  `;
  host.appendChild(wrap);
}

function renderKeyBanner() {
  const hasKey = Boolean(getGeminiKey() || getGroqKey());
  $('#ai-chat-nokey')?.classList.toggle('hidden', hasKey);
  const sub = $('#ai-chat-subtitle');
  if (sub) {
    const active = [getGeminiKey() && 'Gemini', getGroqKey() && 'Groq'].filter(Boolean);
    sub.textContent = active.length
      ? `ทำงานในเครื่องด้วย ${active.join(' + ')}`
      : 'ยังไม่ได้ตั้งค่า API Key';
  }
}

function formatMessageHtml(text) {
  return esc(text).replace(/\n/g, '<br>');
}

function renderMessages() {
  const box = $('#ai-chat-messages');
  if (!box) return;

  if (!messages.length) {
    box.innerHTML = `
      <div class="ai-msg-empty">
        <p class="text-sm font-semibold text-slate-700">สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ?</p>
        <p class="text-xs text-slate-500 mt-1">ลองแตะคำถามแนะนำด้านล่าง หรือพิมพ์สั่งจดรายจ่าย อาหาร สต๊อก และนัดเตือนได้เลย</p>
      </div>
    `;
    return;
  }

  box.innerHTML = messages.map((m, msgIdx) => {
    if (m.role === 'user') {
      return `<div class="ai-msg-row is-user"><div class="ai-bubble is-user">${formatMessageHtml(m.text)}</div></div>`;
    }
    const pendingList = m.pendingActions || [];
    const stillPendingCount = pendingList.filter(a => a.status === 'pending').length;
    const pendingHtml = pendingList.length ? `
      <div class="ai-confirm-wrap space-y-2 mt-2.5">
        <p class="text-[11px] font-bold text-amber-800">⏳ ตรวจสอบก่อนบันทึกลงฐานข้อมูล (${stillPendingCount}/${pendingList.length} รายการ)</p>
        ${pendingList.map((a, aIdx) => `
          <div class="ai-confirm-card ${a.status === 'cancelled' ? 'is-cancelled' : a.status === 'confirmed' ? 'is-confirmed' : ''}">
            <div class="flex items-start gap-2">
              <span class="text-base leading-none mt-0.5">${a.icon || '📝'}</span>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-slate-800">${esc(a.title)}</p>
                <p class="text-[11px] text-slate-600 mt-0.5">${esc(a.subtitle)}</p>
                ${a.riskReason ? `<p class="text-[10px] text-amber-800 font-semibold mt-0.5">⚠️ ${esc(a.riskReason)}</p>` : ''}
              </div>
            </div>
            <div class="mt-2 flex flex-wrap justify-end gap-1.5">
              ${a.status === 'pending' ? `
                <button type="button" data-confirm-msg="${msgIdx}" data-confirm-idx="${aIdx}" class="btn btn-primary !py-1.5 !px-3 !min-h-9 text-xs">✅ ยืนยันบันทึก</button>
                <button type="button" data-cancel-msg="${msgIdx}" data-cancel-idx="${aIdx}" class="btn btn-ghost !py-1.5 !px-3 !min-h-9 text-xs text-rose-600">❌ ยกเลิก</button>
              ` : a.status === 'confirmed'
                ? '<span class="text-[11px] text-green-700 font-semibold">✅ บันทึกแล้ว (ดูปุ่มยกเลิกด้านล่าง)</span>'
                : '<span class="text-[11px] text-slate-500 font-medium">❌ ยกเลิกแล้ว — ไม่ได้บันทึกลงระบบ</span>'
              }
            </div>
          </div>
        `).join('')}
        ${stillPendingCount > 1 ? `
          <div class="flex flex-wrap justify-end gap-1.5 pt-1">
            <button type="button" data-confirm-all-msg="${msgIdx}" class="btn btn-primary !py-1.5 !px-3.5 !min-h-9 text-xs">✅ ยืนยันทั้งหมด (${stillPendingCount})</button>
            <button type="button" data-cancel-all-msg="${msgIdx}" class="btn btn-ghost !py-1.5 !px-3 !min-h-9 text-xs text-rose-600">ยกเลิกทั้งหมด</button>
          </div>
        ` : ''}
      </div>
    ` : '';

    const cardsHtml = (m.receipts || []).map((r, rIdx) => `
      <div class="ai-action-card ${r.undone ? 'is-undone' : ''}">
        <div class="flex items-start gap-2">
          <span class="text-base leading-none mt-0.5">${r.undone ? '↩️' : '✅'}</span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-slate-800">${esc(r.title)}</p>
            <p class="text-[11px] text-slate-600 mt-0.5">${esc(r.subtitle)}</p>
          </div>
        </div>
        ${r.undo ? `
          <div class="mt-2 flex justify-end">
            ${r.undone
              ? '<span class="text-[11px] text-slate-500 font-medium">ยกเลิก/ลบรายการนี้แล้ว</span>'
              : `<button type="button" data-undo-msg="${msgIdx}" data-undo-rec="${rIdx}" class="btn btn-ghost !py-1 !px-3 !min-h-9 text-xs text-rose-600">ยกเลิก/ลบรายการนี้</button>`
            }
          </div>
        ` : ''}
      </div>
    `).join('');

    return `
      <div class="ai-msg-row is-assistant">
        <div class="ai-bubble is-assistant">
          ${m.pending
            ? '<span class="inline-flex items-center gap-2 text-xs text-slate-500"><i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจข้อมูลและตอบกลับ…</span>'
            : `<div class="text-sm leading-relaxed break-words">${formatMessageHtml(m.text)}</div>`
          }
          ${pendingHtml}
          ${cardsHtml}
        </div>
      </div>
    `;
  }).join('');

  box.scrollTop = box.scrollHeight;
}

function setOpen(next) {
  isOpen = next;
  const drawer = $('#ai-chat-drawer');
  const fab = $('#ai-chat-fab');
  if (!drawer || !fab) return;
  drawer.classList.toggle('hidden', !isOpen);
  fab.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    renderKeyBanner();
    renderMessages();
    if (matchMedia('(hover: hover)').matches) {
      setTimeout(() => $('#ai-chat-input')?.focus({ preventScroll: true }), 50);
    }
  }
}

async function handleSend(rawText) {
  const text = String(rawText || '').trim();
  if (!text || isBusy) return;

  if (!getGeminiKey() && !getGroqKey()) {
    renderKeyBanner();
    toast('กรุณาใส่ Gemini หรือ Groq API Key ในหน้าตั้งค่าก่อน', 'err');
    return;
  }

  const inputEl = $('#ai-chat-input');
  const sendBtn = $('#ai-chat-send');
  if (inputEl) inputEl.value = '';

  const historySnapshot = messages
    .filter(m => !m.pending && m.text)
    .map(m => ({ role: m.role, text: m.text }));

  messages.push({ role: 'user', text });
  const pendingMsg = { role: 'assistant', text: '', pending: true };
  messages.push(pendingMsg);
  isBusy = true;
  if (sendBtn) sendBtn.disabled = true;
  renderMessages();

  try {
    const res = await runAssistantTurn(historySnapshot, text);
    pendingMsg.pending = false;
    pendingMsg.text = res.text;
    pendingMsg.receipts = (res.receipts || []).map(r => ({ ...r, undone: false }));
    pendingMsg.pendingActions = (res.pendingActions || []).map(a => ({ ...a, status: a.status || 'pending' }));
  } catch (err) {
    pendingMsg.pending = false;
    pendingMsg.text = `ขออภัยค่ะ เกิดข้อผิดพลาด: ${explainGeminiError(err)}`;
  } finally {
    isBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    renderMessages();
  }
}

export function mountChatWidget(goTo) {
  if (typeof goTo === 'function') goToFn = goTo;
  ensureShell();
  renderKeyBanner();
  renderMessages();

  if ($('#ai-chat-fab')?.dataset.bound) return;
  $('#ai-chat-fab').dataset.bound = '1';

  $('#ai-chat-fab').addEventListener('click', () => setOpen(!isOpen));
  $('#ai-chat-close').addEventListener('click', () => setOpen(false));
  $('#ai-chat-clear').addEventListener('click', () => {
    if (isBusy) return;
    messages.length = 0;
    renderMessages();
    toast('ล้างบทสนทนาแล้ว');
  });
  $('#ai-chat-go-settings').addEventListener('click', () => {
    setOpen(false);
    goToFn('settings');
  });

  $('#ai-chat-quick').addEventListener('click', e => {
    const btn = e.target.closest('[data-ai-prompt]');
    if (!btn) return;
    const prompt = QUICK_PROMPTS[Number(btn.dataset.aiPrompt)];
    if (prompt) handleSend(prompt);
  });

  $('#ai-chat-form').addEventListener('submit', e => {
    e.preventDefault();
    handleSend($('#ai-chat-input')?.value);
  });

  $('#ai-chat-messages').addEventListener('click', async e => {
    const confirmBtn = e.target.closest('[data-confirm-msg]');
    if (confirmBtn) {
      const m = messages[Number(confirmBtn.dataset.confirmMsg)];
      const action = m?.pendingActions?.[Number(confirmBtn.dataset.confirmIdx)];
      if (!m || !action || action.status !== 'pending') return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'กำลังบันทึก…';
      try {
        const out = await executeConfirmedAction(action);
        action.status = 'confirmed';
        if (out.receipt) {
          m.receipts = [...(m.receipts || []), { ...out.receipt, undone: false }];
        }
        renderMessages();
        toast('ยืนยันและบันทึกข้อมูลแล้ว');
      } catch (err) {
        toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '✅ ยืนยันบันทึก';
      }
      return;
    }

    const cancelBtn = e.target.closest('[data-cancel-msg]');
    if (cancelBtn) {
      const m = messages[Number(cancelBtn.dataset.cancelMsg)];
      const action = m?.pendingActions?.[Number(cancelBtn.dataset.cancelIdx)];
      if (!action || action.status !== 'pending') return;
      action.status = 'cancelled';
      renderMessages();
      toast('ยกเลิกการบันทึกรายการนี้แล้ว');
      return;
    }

    const confirmAllBtn = e.target.closest('[data-confirm-all-msg]');
    if (confirmAllBtn) {
      const m = messages[Number(confirmAllBtn.dataset.confirmAllMsg)];
      const pendingItems = (m?.pendingActions || []).filter(a => a.status === 'pending');
      if (!pendingItems.length) return;
      confirmAllBtn.disabled = true;
      confirmAllBtn.textContent = 'กำลังบันทึกทั้งหมด…';
      let savedCount = 0;
      try {
        for (const action of pendingItems) {
          const out = await executeConfirmedAction(action);
          action.status = 'confirmed';
          if (out.receipt) {
            m.receipts = [...(m.receipts || []), { ...out.receipt, undone: false }];
          }
          savedCount++;
        }
        renderMessages();
        toast(`บันทึกครบทั้ง ${savedCount} รายการแล้ว`);
      } catch (err) {
        renderMessages();
        toast(`บันทึกสำเร็จ ${savedCount} รายการ · เกิดข้อผิดพลาด: ${err.message}`, 'err');
      }
      return;
    }

    const cancelAllBtn = e.target.closest('[data-cancel-all-msg]');
    if (cancelAllBtn) {
      const m = messages[Number(cancelAllBtn.dataset.cancelAllMsg)];
      if (!m?.pendingActions) return;
      m.pendingActions.forEach(a => { if (a.status === 'pending') a.status = 'cancelled'; });
      renderMessages();
      toast('ยกเลิกทุกรายการที่รอยืนยันแล้ว');
      return;
    }

    const undoBtn = e.target.closest('[data-undo-msg]');
    if (!undoBtn) return;
    const mIdx = Number(undoBtn.dataset.undoMsg);
    const rIdx = Number(undoBtn.dataset.undoRec);
    const rec = messages[mIdx]?.receipts?.[rIdx];
    if (!rec || rec.undone || !rec.undo) return;

    undoBtn.disabled = true;
    undoBtn.textContent = 'กำลังยกเลิก…';
    try {
      await undoAssistantAction(rec.undo);
      rec.undone = true;
      renderMessages();
      toast('ยกเลิก/ลบรายการที่บันทึกแล้ว');
    } catch (err) {
      toast('ยกเลิกไม่สำเร็จ: ' + err.message, 'err');
      undoBtn.disabled = false;
      undoBtn.textContent = 'ยกเลิก/ลบรายการนี้';
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) setOpen(false);
  });
}
