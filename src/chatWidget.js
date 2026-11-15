import { $, esc, toast } from './util.js';
import { getGeminiKey, getGroqKey, getOpenRouterKey, explainGeminiError } from './nutrition.js';
import { CHAT_ROLES, getChatRole } from './services/chatRoles.js';

const STORAGE_KEYS = {
  history: 'trackme_ai_chat_history',
  role: 'trackme_ai_chat_role',
  customRole: 'trackme_ai_chat_custom_role'
};
const MAX_SAVED_MESSAGES = 30;

let isOpen = false;
let isBusy = false;
let isRolePanelOpen = false;
let activeRequestController = null;
let goToFn = () => {};
let activeRoleId = loadStoredString(STORAGE_KEYS.role, 'general');
let customInstruction = loadStoredString(STORAGE_KEYS.customRole, '');
const messages = loadStoredHistory();

function loadStoredString(key, fallback = '') {
  try {
    const val = localStorage.getItem(key);
    return typeof val === 'string' && val ? val : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredString(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Ignore storage quota errors
  }
}

function loadStoredHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
      .slice(-MAX_SAVED_MESSAGES)
      .map(m => ({
        role: m.role,
        text: m.text,
        ...(m.provider && { provider: String(m.provider) }),
        ...(m.model && { model: String(m.model) }),
        ...(m.roleId && { roleId: String(m.roleId) }),
        ...(Array.isArray(m.receipts) && m.receipts.length && {
          receipts: m.receipts.map(r => ({
            icon: r.icon || '✅',
            title: String(r.title || ''),
            subtitle: String(r.subtitle || ''),
            undone: Boolean(r.undone)
          }))
        }),
        ...(Array.isArray(m.pendingActions) && m.pendingActions.length && {
          pendingActions: m.pendingActions.map(a => ({
            icon: a.icon || '📝',
            title: String(a.title || ''),
            subtitle: String(a.subtitle || ''),
            riskReason: a.riskReason ? String(a.riskReason) : '',
            status: a.status === 'confirmed' ? 'confirmed' : 'cancelled'
          }))
        })
      }));
  } catch {
    return [];
  }
}

function persistHistory() {
  try {
    const serializable = messages
      .filter(m => !m.pending && typeof m.text === 'string' && m.text.trim())
      .slice(-MAX_SAVED_MESSAGES)
      .map(m => ({
        role: m.role,
        text: m.text,
        ...(m.provider && { provider: m.provider }),
        ...(m.model && { model: m.model }),
        ...(m.roleId && { roleId: m.roleId }),
        ...(Array.isArray(m.receipts) && m.receipts.length && {
          receipts: m.receipts.map(r => ({
            icon: r.icon || '✅',
            title: r.title,
            subtitle: r.subtitle,
            undone: Boolean(r.undone)
          }))
        }),
        ...(Array.isArray(m.pendingActions) && m.pendingActions.length && {
          pendingActions: m.pendingActions.map(a => ({
            icon: a.icon || '📝',
            title: a.title,
            subtitle: a.subtitle,
            riskReason: a.riskReason || '',
            status: a.status
          }))
        })
      }));
    if (serializable.length) {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(serializable));
    } else {
      localStorage.removeItem(STORAGE_KEYS.history);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function formatInlineMarkdown(escapedLine) {
  const inlineCodes = [];
  let line = escapedLine.replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `\u0000IC${inlineCodes.length}\u0000`;
    inlineCodes.push(`<code class="ai-inline-code">${code}</code>`);
    return token;
  });

  line = line.replace(/\*\*([^\n*](?:[^\n]*?[^\n*])?)\*\*/g, '<strong>$1</strong>');
  line = line.replace(/(^|[\s(>])\*([^\s*](?:[^\n*]*?[^\s*])?)\*(?=$|[\s).,!?:;<])/g, '$1<em>$2</em>');

  return line.replace(/\u0000IC(\d+)\u0000/g, (_, idx) => inlineCodes[Number(idx)] || '');
}

export function formatMessageHtml(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n');
  const codeBlocks = [];
  const withPlaceholders = raw.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const token = `\u0000CB${codeBlocks.length}\u0000`;
    const cleanCode = code.replace(/\n$/, '');
    const langAttr = lang ? ` data-lang="${esc(lang)}"` : '';
    codeBlocks.push(`<pre class="ai-code-block"${langAttr}><code>${esc(cleanCode)}</code></pre>`);
    return `\n${token}\n`;
  });

  const lines = withPlaceholders.split('\n');
  const out = [];
  let listType = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p class="ai-md-p">${paragraph.map(l => formatInlineMarkdown(esc(l))).join('<br>')}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType) return;
    out.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const blockMatch = trimmed.match(/^\u0000CB(\d+)\u0000$/);
    if (blockMatch) {
      flushParagraph();
      flushList();
      out.push(codeBlocks[Number(blockMatch[1])] || '');
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      out.push(`<h4 class="ai-md-h">${formatInlineMarkdown(esc(headingMatch[2]))}</h4>`);
      continue;
    }

    const ulMatch = trimmed.match(/^(?:[-*•])\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        out.push('<ul class="ai-md-list">');
      }
      out.push(`<li>${formatInlineMarkdown(esc(ulMatch[1]))}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        out.push('<ol class="ai-md-list is-ordered">');
      }
      out.push(`<li>${formatInlineMarkdown(esc(olMatch[1]))}</li>`);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return out.join('');
}

function autoResizeInput() {
  const el = $('#ai-chat-input');
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(112, Math.max(40, el.scrollHeight))}px`;
}

function updateBusyUi() {
  const sendBtn = $('#ai-chat-send');
  const stopBtn = $('#ai-chat-stop');
  if (sendBtn) {
    sendBtn.disabled = isBusy;
    sendBtn.classList.toggle('hidden', isBusy);
  }
  if (stopBtn) {
    stopBtn.classList.toggle('hidden', !isBusy);
  }
}

function renderRolesBar() {
  const bar = $('#ai-chat-roles');
  const current = getChatRole(activeRoleId);
  if (bar) {
    bar.innerHTML = CHAT_ROLES.map(r => {
      const isActive = r.id === current.id;
      return `<button type="button" data-ai-role="${esc(r.id)}" aria-pressed="${isActive}" class="ai-role-btn whitespace-nowrap shrink-0 ${isActive ? 'is-active' : ''}">${r.icon} ${esc(r.label)}</button>`;
    }).join('');
  }

  const desc = $('#ai-chat-role-desc');
  if (desc) {
    desc.textContent = `${current.icon} ${current.label} — ${current.description}`;
  }

  const roleToggle = $('#ai-chat-role-toggle');
  if (roleToggle) {
    roleToggle.classList.toggle('is-active', Boolean(customInstruction.trim()) || isRolePanelOpen);
  }

  const quickBar = $('#ai-chat-quick');
  if (quickBar) {
    const prompts = current.quickPrompts || [];
    quickBar.innerHTML = prompts
      .map((q, i) => `<button type="button" data-ai-prompt="${i}" class="ai-quick-btn whitespace-nowrap shrink-0">${esc(q)}</button>`)
      .join('');
  }
}

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
            <p id="ai-chat-subtitle" class="text-[11px] text-slate-500 truncate">คุยได้ทุกเรื่อง + ช่วยดูแลข้อมูล</p>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button id="ai-chat-role-toggle" type="button" class="icon-btn !w-10 !h-10 text-xs" title="ตั้งค่าคำสั่งบทบาทเพิ่มเติม" aria-label="ตั้งค่าคำสั่งบทบาทเพิ่มเติม" aria-expanded="false">
            <i class="fa-solid fa-sliders"></i>
          </button>
          <button id="ai-chat-clear" type="button" class="icon-btn !w-10 !h-10 text-xs" title="เริ่มบทสนทนาใหม่" aria-label="เริ่มบทสนทนาใหม่">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
          <button id="ai-chat-close" type="button" class="icon-btn !w-10 !h-10" aria-label="ปิดหน้าต่างแชท">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </header>

      <div id="ai-chat-roles" class="ai-chat-roles" role="toolbar" aria-label="เลือกบทบาทผู้ช่วย"></div>

      <div id="ai-chat-role-panel" class="ai-chat-role-panel hidden">
        <p id="ai-chat-role-desc" class="text-[11px] font-medium text-slate-600"></p>
        <label for="ai-chat-custom-input" class="block text-[11px] font-semibold text-slate-700 mt-1.5">คำสั่งบุคลิกหรือหัวข้อเฉพาะ (ไม่บังคับ)</label>
        <textarea id="ai-chat-custom-input" rows="2" maxlength="500" class="input text-xs mt-1 w-full resize-none" placeholder="เช่น ตอบแบบเพื่อนสนิท เป็นกันเอง, ช่วยฝึกคุยภาษาอังกฤษพร้อมคำแปล, โฟกัสอาหารคลีน"></textarea>
        <div class="flex items-center justify-end gap-1.5 mt-1.5">
          <button id="ai-chat-custom-clear" type="button" class="btn btn-ghost !py-1 !px-2.5 !min-h-8 text-xs">ล้าง</button>
          <button id="ai-chat-custom-save" type="button" class="btn btn-primary !py-1 !px-3 !min-h-8 text-xs">บันทึกคำสั่ง</button>
        </div>
      </div>

      <div id="ai-chat-nokey" class="hidden mx-3 mt-2 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-2">
        <p class="font-semibold">ยังไม่ได้ตั้งค่า AI API Key</p>
        <p class="text-amber-800">ใส่คีย์ในหน้าตั้งค่าก่อน เพื่อให้ผู้ช่วย AI ตอบคำถามและช่วยบันทึกข้อมูลบนเครื่องนี้</p>
        <button id="ai-chat-go-settings" type="button" class="btn btn-soft !py-1.5 !px-3 !min-h-9 text-xs">ไปหน้าตั้งค่า</button>
      </div>

      <div id="ai-chat-messages" class="ai-chat-messages" aria-live="polite"></div>

      <div id="ai-chat-quick" class="ai-chat-quick"></div>

      <form id="ai-chat-form" class="ai-chat-form">
        <textarea id="ai-chat-input" rows="1" class="input ai-chat-textarea flex-1 min-w-0" placeholder="คุยได้ทุกเรื่อง หรือสั่งจดข้อมูล Track Me…" autocomplete="off"></textarea>
        <button id="ai-chat-send" type="submit" class="btn btn-primary !px-3.5 !min-h-11 !min-w-11 shrink-0" aria-label="ส่งข้อความ">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
        <button id="ai-chat-stop" type="button" class="btn btn-soft !px-3.5 !min-h-11 !min-w-11 shrink-0 hidden text-rose-600" aria-label="หยุดการตอบ">
          <i class="fa-solid fa-stop"></i>
        </button>
      </form>
    </section>
  `;
  host.appendChild(wrap);

  const customInput = $('#ai-chat-custom-input');
  if (customInput) customInput.value = customInstruction;
}

function renderKeyBanner() {
  const hasKey = Boolean(getGeminiKey() || getGroqKey() || getOpenRouterKey());
  $('#ai-chat-nokey')?.classList.toggle('hidden', hasKey);
  const sub = $('#ai-chat-subtitle');
  if (sub) {
    const role = getChatRole(activeRoleId);
    const active = [getGeminiKey() && 'Gemini', getGroqKey() && 'Groq', getOpenRouterKey() && 'OpenRouter'].filter(Boolean);
    const customMark = customInstruction.trim() ? ' · มีคำสั่งเฉพาะ' : '';
    sub.textContent = active.length
      ? `${role.icon} ${role.label}${customMark} · ${active.join(' + ')}`
      : 'ยังไม่ได้ตั้งค่า API Key';
  }
}

function renderMessages() {
  const box = $('#ai-chat-messages');
  if (!box) return;

  if (!messages.length) {
    const role = getChatRole(activeRoleId);
    box.innerHTML = `
      <div class="ai-msg-empty">
        <p class="text-sm font-semibold text-slate-700">${role.icon} โหมด${esc(role.label)} — สวัสดีค่ะ คุยเรื่องอะไรดีคะ?</p>
        <p class="text-xs text-slate-500 mt-1">${esc(role.description)}</p>
        <p class="text-[11px] text-slate-400 mt-1.5">ถามเรื่องทั่วไป ระดมไอเดีย ร่างข้อความ แปลภาษา หรือถาม/สั่งจดข้อมูล Track Me ได้เลยค่ะ</p>
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
                ? '<span class="text-[11px] text-green-700 font-semibold">✅ บันทึกแล้ว</span>'
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

    const metaParts = [m.provider, m.model].filter(Boolean);
    const metaHtml = !m.pending && metaParts.length
      ? `<p class="ai-msg-meta">${esc(metaParts.join(' · '))}</p>`
      : '';

    return `
      <div class="ai-msg-row is-assistant">
        <div class="ai-bubble is-assistant">
          ${m.pending
            ? '<span class="inline-flex items-center gap-2 text-xs text-slate-500"><i class="fa-solid fa-spinner fa-spin"></i> กำลังคิดและเตรียมคำตอบ…</span>'
            : `<div class="ai-md-body text-sm leading-relaxed break-words">${formatMessageHtml(m.text)}</div>`
          }
          ${pendingHtml}
          ${cardsHtml}
          ${metaHtml}
        </div>
      </div>
    `;
  }).join('');

  box.scrollTop = box.scrollHeight;
}

function setOpen(next) {
  isOpen = next;
  if (!next) activeRequestController?.abort();
  const drawer = $('#ai-chat-drawer');
  const fab = $('#ai-chat-fab');
  if (!drawer || !fab) return;
  drawer.classList.toggle('hidden', !isOpen);
  fab.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    renderKeyBanner();
    renderRolesBar();
    renderMessages();
    autoResizeInput();
    if (matchMedia('(hover: hover)').matches) {
      setTimeout(() => $('#ai-chat-input')?.focus({ preventScroll: true }), 50);
    }
  }
}

async function handleSend(rawText) {
  const text = String(rawText || '').trim();
  if (!text || isBusy) return;

  if (!getGeminiKey() && !getGroqKey() && !getOpenRouterKey()) {
    renderKeyBanner();
    toast('กรุณาใส่ Gemini, Groq หรือ OpenRouter API Key ในหน้าตั้งค่าก่อน', 'err');
    return;
  }

  const inputEl = $('#ai-chat-input');
  if (inputEl) {
    inputEl.value = '';
    autoResizeInput();
  }

  const historySnapshot = messages
    .filter(m => !m.pending && m.text)
    .map(m => ({ role: m.role, text: m.text }));

  messages.push({ role: 'user', text });
  const pendingMsg = { role: 'assistant', text: '', pending: true };
  messages.push(pendingMsg);
  isBusy = true;
  activeRequestController = new AbortController();
  updateBusyUi();
  renderMessages();

  try {
    const { runAssistantTurn } = await import('./services/aiAssistant.js');
    const res = await runAssistantTurn(historySnapshot, text, {
      signal: activeRequestController.signal,
      role: activeRoleId,
      customInstruction
    });
    pendingMsg.pending = false;
    pendingMsg.text = res.text;
    pendingMsg.provider = res.provider || '';
    pendingMsg.model = res.model || '';
    pendingMsg.roleId = res.role || activeRoleId;
    pendingMsg.receipts = (res.receipts || []).map(r => ({ ...r, undone: false }));
    pendingMsg.pendingActions = (res.pendingActions || []).map(a => ({ ...a, status: a.status || 'pending' }));
  } catch (err) {
    pendingMsg.pending = false;
    pendingMsg.text = err.aborted
      ? 'ยกเลิกคำขอแล้ว'
      : `ขออภัยค่ะ เกิดข้อผิดพลาด: ${explainGeminiError(err)}`;
  } finally {
    isBusy = false;
    activeRequestController = null;
    updateBusyUi();
    persistHistory();
    renderMessages();
  }
}

export function mountChatWidget(goTo) {
  if (typeof goTo === 'function') goToFn = goTo;
  ensureShell();
  renderKeyBanner();
  renderRolesBar();
  renderMessages();

  if ($('#ai-chat-fab')?.dataset.bound) return;
  $('#ai-chat-fab').dataset.bound = '1';

  $('#ai-chat-fab').addEventListener('click', () => setOpen(!isOpen));
  $('#ai-chat-close').addEventListener('click', () => setOpen(false));
  $('#ai-chat-clear').addEventListener('click', () => {
    if (isBusy) return;
    messages.length = 0;
    persistHistory();
    renderMessages();
    toast('ล้างบทสนทนาแล้ว');
  });
  $('#ai-chat-go-settings').addEventListener('click', () => {
    setOpen(false);
    goToFn('settings');
  });

  $('#ai-chat-role-toggle').addEventListener('click', () => {
    isRolePanelOpen = !isRolePanelOpen;
    $('#ai-chat-role-panel')?.classList.toggle('hidden', !isRolePanelOpen);
    $('#ai-chat-role-toggle')?.setAttribute('aria-expanded', String(isRolePanelOpen));
    renderRolesBar();
    if (isRolePanelOpen) {
      $('#ai-chat-custom-input')?.focus({ preventScroll: true });
    }
  });

  $('#ai-chat-custom-save').addEventListener('click', () => {
    const val = String($('#ai-chat-custom-input')?.value || '').trim().slice(0, 500);
    customInstruction = val;
    saveStoredString(STORAGE_KEYS.customRole, val);
    isRolePanelOpen = false;
    $('#ai-chat-role-panel')?.classList.add('hidden');
    $('#ai-chat-role-toggle')?.setAttribute('aria-expanded', 'false');
    renderKeyBanner();
    renderRolesBar();
    toast(val ? 'บันทึกคำสั่งบทบาทเพิ่มเติมแล้ว' : 'ล้างคำสั่งบทบาทเพิ่มเติมแล้ว');
  });

  $('#ai-chat-custom-clear').addEventListener('click', () => {
    const input = $('#ai-chat-custom-input');
    if (input) input.value = '';
    customInstruction = '';
    saveStoredString(STORAGE_KEYS.customRole, '');
    renderKeyBanner();
    renderRolesBar();
    toast('ล้างคำสั่งเพิ่มเติมแล้ว');
  });

  $('#ai-chat-roles').addEventListener('click', e => {
    const btn = e.target.closest('[data-ai-role]');
    if (!btn) return;
    const role = getChatRole(btn.dataset.aiRole);
    activeRoleId = role.id;
    saveStoredString(STORAGE_KEYS.role, role.id);
    renderKeyBanner();
    renderRolesBar();
    if (!messages.length) renderMessages();
  });

  $('#ai-chat-quick').addEventListener('click', e => {
    const btn = e.target.closest('[data-ai-prompt]');
    if (!btn) return;
    const prompts = getChatRole(activeRoleId).quickPrompts || [];
    const prompt = prompts[Number(btn.dataset.aiPrompt)];
    if (prompt) handleSend(prompt);
  });

  const inputEl = $('#ai-chat-input');
  inputEl.addEventListener('input', autoResizeInput);
  inputEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    if (matchMedia('(pointer: coarse)').matches) return;
    e.preventDefault();
    handleSend(inputEl.value);
  });

  $('#ai-chat-form').addEventListener('submit', e => {
    e.preventDefault();
    handleSend($('#ai-chat-input')?.value);
  });

  $('#ai-chat-stop').addEventListener('click', () => {
    activeRequestController?.abort();
  });

  $('#ai-chat-messages').addEventListener('click', async e => {
    const confirmBtn = e.target.closest('[data-confirm-msg]');
    if (confirmBtn) {
      const m = messages[Number(confirmBtn.dataset.confirmMsg)];
      const action = m?.pendingActions?.[Number(confirmBtn.dataset.confirmIdx)];
      if (!m || !action || action.status !== 'pending' || !action.writePlan) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'กำลังบันทึก…';
      try {
        const { executeConfirmedAction } = await import('./services/aiAssistant.js');
        const out = await executeConfirmedAction(action);
        action.status = 'confirmed';
        if (out.receipt) {
          m.receipts = [...(m.receipts || []), { ...out.receipt, undone: false }];
        }
        persistHistory();
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
      persistHistory();
      renderMessages();
      toast('ยกเลิกการบันทึกรายการนี้แล้ว');
      return;
    }

    const confirmAllBtn = e.target.closest('[data-confirm-all-msg]');
    if (confirmAllBtn) {
      const m = messages[Number(confirmAllBtn.dataset.confirmAllMsg)];
      const pendingItems = (m?.pendingActions || []).filter(a => a.status === 'pending' && a.writePlan);
      if (!pendingItems.length) return;
      confirmAllBtn.disabled = true;
      confirmAllBtn.textContent = 'กำลังบันทึกทั้งหมด…';
      let savedCount = 0;
      try {
        const { executeConfirmedAction } = await import('./services/aiAssistant.js');
        for (const action of pendingItems) {
          const out = await executeConfirmedAction(action);
          action.status = 'confirmed';
          if (out.receipt) {
            m.receipts = [...(m.receipts || []), { ...out.receipt, undone: false }];
          }
          savedCount++;
        }
        persistHistory();
        renderMessages();
        toast(`บันทึกครบทั้ง ${savedCount} รายการแล้ว`);
      } catch (err) {
        persistHistory();
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
      persistHistory();
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
      const { undoAssistantAction } = await import('./services/aiAssistant.js');
      await undoAssistantAction(rec.undo);
      rec.undone = true;
      persistHistory();
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
