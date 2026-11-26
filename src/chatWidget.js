import { deleteDoc, setDoc } from 'firebase/firestore';
import { userDoc } from './firebase.js';
import { state } from './state.js';
import { $, esc, fmtDate, localDateStr, openModal, toast, trapFocus } from './util.js';
import { getGeminiKey, getGroqKey, getOpenRouterKey, explainGeminiError } from './nutrition.js';
import { CHAT_ROLES, LOCAL_ROLE, LOCAL_HELP_TEXT, getAnyChatRole } from './services/chatRoles.js';
import { iconSvg } from './icons.js';
import { guardPreviewWrite } from './preview.js';

const STORAGE_KEYS = {
  history: 'trackme_ai_chat_history',
  role: 'trackme_ai_chat_role',
  customRole: 'trackme_ai_chat_custom_role',
  preferLocal: 'trackme_ai_chat_prefer_local'
};
const MAX_SAVED_MESSAGES = 30;

let isOpen = false;
let isBusy = false;
let isRolePanelOpen = false;
let activeRequestController = null;
let goToFn = () => {};
let drawerTrigger = null;
let releaseDrawerTrap = () => {};
let activeRoleId = loadStoredString(STORAGE_KEYS.role, 'general');
let customInstruction = loadStoredString(STORAGE_KEYS.customRole, '');
let preferLocalPatterns = loadStoredString(STORAGE_KEYS.preferLocal, '1') !== '0';
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
            syncStatus: ['synced', 'pending_sync', 'failed'].includes(r.syncStatus) ? r.syncStatus : 'synced',
            ...(r.error && { error: String(r.error) }),
            undone: Boolean(r.undone),
            ...(r.undoStatus && { undoStatus: String(r.undoStatus) })
          }))
        }),
        ...(Array.isArray(m.pendingActions) && m.pendingActions.length && {
          pendingActions: m.pendingActions.map(a => ({
            icon: a.icon || '📝',
            title: String(a.title || ''),
            subtitle: String(a.subtitle || ''),
            riskReason: a.riskReason ? String(a.riskReason) : '',
            ...(a.error && { error: String(a.error) }),
            status: ['confirmed', 'pending_sync', 'failed', 'cancelled'].includes(a.status) ? a.status : 'cancelled'
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
            ...(r.syncStatus && { syncStatus: r.syncStatus }),
            ...(r.error && { error: r.error }),
            undone: Boolean(r.undone),
            ...(r.undoStatus && { undoStatus: r.undoStatus })
          }))
        }),
        ...(Array.isArray(m.pendingActions) && m.pendingActions.length && {
          pendingActions: m.pendingActions.map(a => ({
            icon: a.icon || '📝',
            title: a.title,
            subtitle: a.subtitle,
            riskReason: a.riskReason || '',
            ...(a.error && { error: a.error }),
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
  const current = getAnyChatRole(activeRoleId);
  const allRoles = [LOCAL_ROLE, ...CHAT_ROLES];
  if (bar) {
    bar.innerHTML = allRoles.map(r => {
      const isActive = r.id === current.id;
      return `<button type="button" data-ai-role="${esc(r.id)}" aria-pressed="${isActive}" class="ai-role-btn whitespace-nowrap shrink-0 ${isActive ? 'is-active' : ''}">${r.icon} ${esc(r.label)}</button>`;
    }).join('');
  }

  const desc = $('#ai-chat-role-desc');
  if (desc) {
    desc.textContent = `${current.icon} ${current.label} — ${current.description}`;
  }

  const preferChk = $('#ai-chat-prefer-local');
  if (preferChk) preferChk.checked = preferLocalPatterns;

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
  if ($('#ai-chat-drawer')) return;
  const host = $('#app-shell') || document.body;
  const hasFab = Boolean($('#ai-chat-fab'));

  const wrap = document.createElement('div');
  wrap.className = 'no-print';
  wrap.innerHTML = `
    ${hasFab ? '' : `<button id="ai-chat-fab" type="button" class="icon-btn ai-chat-header-btn" aria-label="เปิดผู้ช่วย AI Track Me" aria-expanded="false" aria-controls="ai-chat-drawer" title="ผู้ช่วย AI">
      ${iconSvg('chat', { size: 18 })}
    </button>`}

    <section id="ai-chat-drawer" class="ai-chat-drawer hidden" role="dialog" aria-modal="true" aria-labelledby="ai-chat-title" tabindex="-1">
      <header class="ai-chat-header">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="emoji-bubble emoji-sm !mr-0">${iconSvg('chat', { size: 17 })}</span>
          <div class="min-w-0">
            <h2 id="ai-chat-title" class="text-sm font-bold text-slate-800 truncate">ผู้ช่วย Track Me</h2>
            <p id="ai-chat-subtitle" class="text-[11px] text-slate-500 truncate">คุยได้ทุกเรื่อง + ช่วยดูแลข้อมูล</p>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button id="ai-chat-notes-btn" type="button" class="icon-btn !w-11 !h-11 text-xs" title="โน้ตที่จดไว้ & ส่ง Feedback" aria-label="โน้ตที่จดไว้และส่ง Feedback">
            ${iconSvg('note', { size: 16 })}
          </button>
          <button id="ai-chat-role-toggle" type="button" class="icon-btn !w-11 !h-11 text-xs" title="ตั้งค่าคำสั่งบทบาทเพิ่มเติม" aria-label="ตั้งค่าคำสั่งบทบาทเพิ่มเติม" aria-expanded="false">
            ${iconSvg('sliders', { size: 16 })}
          </button>
          <button id="ai-chat-clear" type="button" class="icon-btn !w-11 !h-11 text-xs" title="เริ่มบทสนทนาใหม่" aria-label="เริ่มบทสนทนาใหม่">
            ${iconSvg('rotate-right', { size: 16 })}
          </button>
          <button id="ai-chat-close" type="button" class="icon-btn !w-11 !h-11" aria-label="ปิดหน้าต่างแชท">
            ${iconSvg('close', { size: 18 })}
          </button>
        </div>
      </header>

      <div id="ai-chat-roles" class="ai-chat-roles" role="toolbar" aria-label="เลือกบทบาทผู้ช่วย"></div>

      <div id="ai-chat-role-panel" class="ai-chat-role-panel hidden">
        <p id="ai-chat-role-desc" class="text-[11px] font-medium text-slate-600"></p>
        <label class="flex items-center gap-2 min-h-[44px] text-[11px] font-medium text-slate-700 mt-1 cursor-pointer">
          <input id="ai-chat-prefer-local" type="checkbox" class="w-4 h-4 accent-brand shrink-0">
          <span>ใช้แพตเทิร์นในเครื่องก่อนเรียก AI (ประหยัด 0 โทเค็นสำหรับจดและเช็กสรุป)</span>
        </label>
        <label for="ai-chat-custom-input" class="block text-[11px] font-semibold text-slate-700 mt-2">คำสั่งบุคลิกหรือหัวข้อเฉพาะสำหรับโหมด AI (ไม่บังคับ)</label>
        <textarea id="ai-chat-custom-input" rows="2" maxlength="500" class="input text-xs mt-1 w-full resize-none" placeholder="เช่น ตอบแบบเพื่อนสนิท เป็นกันเอง, ช่วยฝึกคุยภาษาอังกฤษพร้อมคำแปล, โฟกัสอาหารคลีน"></textarea>
        <div class="flex items-center justify-end gap-1.5 mt-1.5">
          <button id="ai-chat-custom-clear" type="button" class="btn btn-ghost !py-1.5 !px-3 min-h-[44px] text-xs">ล้าง</button>
          <button id="ai-chat-custom-save" type="button" class="btn btn-primary !py-1.5 !px-3.5 min-h-[44px] text-xs">บันทึกคำสั่ง</button>
        </div>
      </div>

      <div id="ai-chat-nokey" class="hidden mx-3 mt-2 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-2">
        <p class="font-semibold">ยังไม่ได้ตั้งค่า AI API Key</p>
        <p class="text-amber-800">จดและเช็กข้อมูลได้ทันที หรือใส่คีย์ในตั้งค่าเพื่อคุยถาม-ตอบอิสระ</p>
        <button id="ai-chat-go-settings" type="button" class="btn btn-soft !py-1.5 !px-3 min-h-[44px] text-xs">ไปหน้าตั้งค่า</button>
      </div>

      <div id="ai-chat-messages" class="ai-chat-messages" aria-live="polite"></div>

      <div id="ai-chat-quick" class="ai-chat-quick"></div>

      <form id="ai-chat-form" class="ai-chat-form">
        <textarea id="ai-chat-input" rows="1" class="input ai-chat-textarea flex-1 min-w-0" placeholder="คุยได้ทุกเรื่อง หรือสั่งจดข้อมูล Track Me…" autocomplete="off"></textarea>
        <button id="ai-chat-send" type="submit" class="btn btn-primary !px-3.5 !min-h-11 !min-w-11 shrink-0" aria-label="ส่งข้อความ">
          ${iconSvg('send', { size: 17 })}
        </button>
        <button id="ai-chat-stop" type="button" class="btn btn-soft !px-3.5 !min-h-11 !min-w-11 shrink-0 hidden text-rose-600" aria-label="หยุดการตอบ">
          ${iconSvg('stop', { size: 16 })}
        </button>
      </form>
    </section>
  `;
  host.appendChild(wrap);

  const customInput = $('#ai-chat-custom-input');
  if (customInput) customInput.value = customInstruction;
  const preferChk = $('#ai-chat-prefer-local');
  if (preferChk) preferChk.checked = preferLocalPatterns;
}

function renderKeyBanner() {
  const hasKey = Boolean(getGeminiKey() || getGroqKey() || getOpenRouterKey());
  const isLocalOnly = activeRoleId === LOCAL_ROLE.id;
  $('#ai-chat-nokey')?.classList.toggle('hidden', hasKey || isLocalOnly);
  const sub = $('#ai-chat-subtitle');
  if (sub) {
    const role = getAnyChatRole(activeRoleId);
    if (isLocalOnly) {
      sub.textContent = `${role.icon} ${role.label} · ฟรี ไม่ใช้ AI`;
      return;
    }
    const active = [getGeminiKey() && 'Gemini', getGroqKey() && 'Groq', getOpenRouterKey() && 'OpenRouter'].filter(Boolean);
    const customMark = customInstruction.trim() ? ' · มีคำสั่งเฉพาะ' : '';
    sub.textContent = active.length
      ? `${role.icon} ${role.label}${customMark} · ${active.join(' + ')}`
      : `${role.icon} ${role.label} · โหมดแพตเทิร์นพร้อมใช้ (ยังไม่มี AI Key)`;
  }
}

function renderMessages() {
  const box = $('#ai-chat-messages');
  if (!box) return;

  if (!messages.length) {
    const role = getAnyChatRole(activeRoleId);
    box.innerHTML = `
      <div class="ai-msg-empty">
        <p class="text-sm font-semibold text-slate-700">${role.icon} โหมด${esc(role.label)} — สวัสดีค่ะ คุยเรื่องอะไรดีคะ?</p>
        <p class="text-xs text-slate-500 mt-1">${esc(role.description)}</p>
        <p class="text-[11px] text-slate-400 mt-1.5">${activeRoleId === LOCAL_ROLE.id
          ? 'พิมพ์คำสั่งจดหรือเช็กสรุปได้เลย 0 โทเค็น เช่น จดค่ากาแฟ 60 บาท หรือ สรุปค่าใช้จ่ายเดือนนี้'
          : 'คำสั่งจดและเช็กสรุปพื้นฐานจะทำงานในเครื่องก่อนอัตโนมัติ (0 โทเค็น) และเรียก AI เฉพาะคำถามอิสระ'}</p>
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
                <button type="button" data-confirm-msg="${msgIdx}" data-confirm-idx="${aIdx}" class="btn btn-primary !py-1.5 !px-3 min-h-[44px] text-xs">✅ ยืนยันบันทึก</button>
                <button type="button" data-cancel-msg="${msgIdx}" data-cancel-idx="${aIdx}" class="btn btn-ghost !py-1.5 !px-3 min-h-[44px] text-xs text-rose-600">❌ ยกเลิก</button>
              ` : a.status === 'confirmed'
                ? '<span class="text-[11px] text-green-700 font-semibold">✅ บันทึกแล้ว</span>'
                : a.status === 'pending_sync'
                  ? '<span class="text-[11px] text-amber-700 font-semibold">⏳ บันทึกในเครื่องแล้ว · รอซิงค์เมื่อออนไลน์</span>'
                  : a.status === 'failed'
                    ? `<span class="text-[11px] text-rose-600 font-semibold">❌ บันทึกไม่สำเร็จ${a.error ? `: ${esc(a.error)}` : ''}</span>`
                    : '<span class="text-[11px] text-slate-500 font-medium">❌ ยกเลิกแล้ว — ไม่ได้บันทึกลงระบบ</span>'
              }
            </div>
          </div>
        `).join('')}
        ${stillPendingCount > 1 ? `
          <div class="flex flex-wrap justify-end gap-1.5 pt-1">
            <button type="button" data-confirm-all-msg="${msgIdx}" class="btn btn-primary !py-1.5 !px-3.5 min-h-[44px] text-xs">✅ ยืนยันทั้งหมด (${stillPendingCount})</button>
            <button type="button" data-cancel-all-msg="${msgIdx}" class="btn btn-ghost !py-1.5 !px-3 min-h-[44px] text-xs text-rose-600">ยกเลิกทั้งหมด</button>
          </div>
        ` : ''}
      </div>
    ` : '';

    const cardsHtml = (m.receipts || []).map((r, rIdx) => {
      const iconChar = r.undone
        ? (r.undoStatus === 'pending_sync' ? '⏳' : '↩️')
        : r.syncStatus === 'failed'
          ? '❌'
          : r.syncStatus === 'pending_sync'
            ? '⏳'
            : '✅';
      const statusHint = !r.undone && r.syncStatus === 'pending_sync'
        ? '<p class="text-[10px] text-amber-700 font-semibold mt-0.5">เก็บในคิวออฟไลน์แล้ว · รอซิงค์กับเซิร์ฟเวอร์</p>'
        : !r.undone && r.syncStatus === 'failed'
          ? `<p class="text-[10px] text-rose-600 font-semibold mt-0.5">ซิงค์ไม่สำเร็จ${r.error ? `: ${esc(r.error)}` : ''}</p>`
          : '';
      return `
      <div class="ai-action-card ${r.undone ? 'is-undone' : ''}">
        <div class="flex items-start gap-2">
          <span class="text-base leading-none mt-0.5">${iconChar}</span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-slate-800">${esc(r.title)}</p>
            <p class="text-[11px] text-slate-600 mt-0.5">${esc(r.subtitle)}</p>
            ${statusHint}
          </div>
        </div>
        ${r.undo && r.syncStatus !== 'failed' ? `
          <div class="mt-2 flex justify-end">
            ${r.undone
              ? `<span class="text-[11px] ${r.undoStatus === 'pending_sync' ? 'text-amber-700' : 'text-slate-500'} font-medium">${r.undoStatus === 'pending_sync' ? '⏳ ส่งคำขอยกเลิกไว้ในคิวออฟไลน์แล้ว…' : 'ยกเลิก/ลบรายการนี้แล้ว'}</span>`
              : `<button type="button" data-undo-msg="${msgIdx}" data-undo-rec="${rIdx}" class="btn btn-ghost !py-1.5 !px-3 min-h-[44px] text-xs text-rose-600">ยกเลิก/ลบรายการนี้</button>`
            }
          </div>
        ` : ''}
      </div>
    `;
    }).join('');

    const metaParts = [m.provider, m.model].filter(Boolean);
    const metaHtml = !m.pending && metaParts.length
      ? `<p class="ai-msg-meta">${esc(metaParts.join(' · '))}</p>`
      : '';

    return `
      <div class="ai-msg-row is-assistant">
        <div class="ai-bubble is-assistant">
          ${m.pending
            ? `<span class="inline-flex items-center gap-2 text-xs text-slate-500">${iconSvg('fa-spinner fa-spin', { size: 14 })} กำลังคิดและเตรียมคำตอบ…</span>`
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

function attachReceiptSyncWatcher(receipt, action = null) {
  const syncPromise = receipt?.syncPromise;
  if (!syncPromise || typeof syncPromise.then !== 'function') return;
  syncPromise.then(finalRes => {
    if (!finalRes) return;
    if (finalRes.status === 'synced') {
      if (receipt && !receipt.undone) {
        receipt.syncStatus = 'synced';
        delete receipt.error;
      }
      if (action && action.status === 'pending_sync') {
        action.status = 'confirmed';
        delete action.error;
      }
    } else if (finalRes.status === 'failed') {
      const errMsg = finalRes.error || 'ซิงค์ไม่สำเร็จ';
      if (receipt) {
        receipt.syncStatus = 'failed';
        receipt.error = errMsg;
      }
      if (action) {
        action.status = 'failed';
        action.error = errMsg;
      }
      toast('ซิงค์ข้อมูลไม่สำเร็จ: ' + errMsg, 'err');
    }
    if (receipt) delete receipt.syncPromise;
    persistHistory();
    renderMessages();
  });
}

function setOpen(next) {
  isOpen = next;
  if (!next) activeRequestController?.abort();
  const drawer = $('#ai-chat-drawer');
  const fab = $('#ai-chat-fab');
  if (!drawer || !fab) return;
  if (isOpen) {
    drawerTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : fab;
  }
  drawer.classList.toggle('hidden', !isOpen);
  fab.setAttribute('aria-expanded', String(isOpen));
  fab.classList.toggle('is-active', isOpen);
  releaseDrawerTrap();
  releaseDrawerTrap = () => {};
  if (isOpen) {
    renderKeyBanner();
    renderRolesBar();
    renderMessages();
    autoResizeInput();
    releaseDrawerTrap = trapFocus(drawer, { autoFocus: false });
    if (matchMedia('(hover: hover)').matches) {
      setTimeout(() => $('#ai-chat-input')?.focus({ preventScroll: true }), 50);
    } else {
      drawer.focus({ preventScroll: true });
    }
  } else {
    if (drawerTrigger?.isConnected) drawerTrigger.focus({ preventScroll: true });
    drawerTrigger = null;
  }
}

async function handleSend(rawText) {
  const text = String(rawText || '').trim();
  if (!text || isBusy) return;

  const hasKey = Boolean(getGeminiKey() || getGroqKey() || getOpenRouterKey());
  const tryLocalFirst = activeRoleId === LOCAL_ROLE.id || preferLocalPatterns;

  if (!hasKey && !tryLocalFirst) {
    renderKeyBanner();
    toast('กรุณาใส่ Gemini, Groq หรือ OpenRouter API Key หรือสลับเป็นโหมดแพตเทิร์น', 'err');
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

  const applyAssistantResult = res => {
    pendingMsg.pending = false;
    pendingMsg.text = res.text;
    pendingMsg.provider = res.provider || '';
    pendingMsg.model = res.model || '';
    pendingMsg.roleId = res.role || activeRoleId;
    pendingMsg.receipts = (res.receipts || []).map(r => {
      const receipt = { ...r, syncStatus: r.syncStatus || 'synced', undone: false };
      if (receipt.syncStatus === 'pending_sync' && receipt.syncPromise) {
        attachReceiptSyncWatcher(receipt, null);
      }
      return receipt;
    });
    pendingMsg.pendingActions = (res.pendingActions || []).map(a => ({ ...a, status: a.status || 'pending' }));
  };

  try {
    if (tryLocalFirst) {
      const { runLocalAssistantCommand } = await import('./services/localAssistant.js');
      const localRes = await runLocalAssistantCommand(text);
      if (localRes?.handled) {
        applyAssistantResult(localRes);
        return;
      }
    }

    if (activeRoleId === LOCAL_ROLE.id) {
      applyAssistantResult({
        text: `ยังไม่ตรงกับแพตเทิร์นคำสั่งด่วนค่ะ ลองเลือกใช้ตามตัวอย่างด้านล่าง หรือสลับเป็นโหมด **💬 คุยทั่วไป / ⚡ ตอบไว** เพื่อให้ AI ช่วยตอบ:\n\n${LOCAL_HELP_TEXT}`,
        provider: 'แพตเทิร์นในเครื่อง',
        model: '0 โทเค็น',
        role: LOCAL_ROLE.id,
        receipts: [],
        pendingActions: []
      });
      return;
    }

    if (!hasKey) {
      renderKeyBanner();
      applyAssistantResult({
        text: `คำถามนี้ยังไม่ตรงกับแพตเทิร์นในเครื่อง และยังไม่ได้ตั้งค่า AI API Key ค่ะ\n- ใส่คีย์ในหน้า **ตั้งค่า** เพื่อถาม-ตอบอิสระกับ AI\n- หรือใช้คำสั่งแพตเทิร์น 0 โทเค็นด้านล่างได้ทันที:\n\n${LOCAL_HELP_TEXT}`,
        provider: 'แพตเทิร์นในเครื่อง',
        model: '0 โทเค็น',
        role: activeRoleId,
        receipts: [],
        pendingActions: []
      });
      return;
    }

    const { runAssistantTurn } = await import('./services/aiAssistant.js');
    const res = await runAssistantTurn(historySnapshot, text, {
      signal: activeRequestController.signal,
      role: activeRoleId,
      customInstruction
    });
    applyAssistantResult(res);
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

export function openChatWidget() {
  setOpen(true);
}

export function toggleChatWidget() {
  setOpen(!isOpen);
}

export function mountChatWidget(goTo) {
  if (typeof goTo === 'function') goToFn = goTo;
  ensureShell();
  renderKeyBanner();
  renderRolesBar();
  renderMessages();

  const drawer = $('#ai-chat-drawer');
  if (drawer?.dataset.bound) return;
  if (drawer) drawer.dataset.bound = '1';

  const fab = $('#ai-chat-fab');
  if (fab && !fab.dataset.lazyManaged && !fab.dataset.bound) {
    fab.dataset.bound = '1';
    fab.addEventListener('click', () => setOpen(!isOpen));
  }
  $('#ai-chat-close').addEventListener('click', () => setOpen(false));
  $('#ai-chat-notes-btn')?.addEventListener('click', () => openNotesAndFeedbackModal('notes'));
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

  $('#ai-chat-prefer-local')?.addEventListener('change', e => {
    preferLocalPatterns = e.target.checked;
    saveStoredString(STORAGE_KEYS.preferLocal, preferLocalPatterns ? '1' : '0');
    toast(preferLocalPatterns ? 'เปิดใช้แพตเทิร์นในเครื่องก่อนเรียก AI แล้ว' : 'ปิดการเช็กแพตเทิร์นก่อนเรียก AI');
  });

  $('#ai-chat-roles').addEventListener('click', e => {
    const btn = e.target.closest('[data-ai-role]');
    if (!btn) return;
    const role = getAnyChatRole(btn.dataset.aiRole);
    activeRoleId = role.id;
    saveStoredString(STORAGE_KEYS.role, role.id);
    renderKeyBanner();
    renderRolesBar();
    if (!messages.length) renderMessages();
  });

  $('#ai-chat-quick').addEventListener('click', e => {
    const btn = e.target.closest('[data-ai-prompt]');
    if (!btn) return;
    const prompts = getAnyChatRole(activeRoleId).quickPrompts || [];
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
        if (out.status === 'failed' || (!out.ok && !out.pendingSync)) {
          toast('บันทึกไม่สำเร็จ: ' + (out.error || 'เกิดข้อผิดพลาด'), 'err');
          confirmBtn.disabled = false;
          confirmBtn.textContent = '✅ ยืนยันบันทึก';
          return;
        }
        action.status = out.status === 'pending_sync' ? 'pending_sync' : 'confirmed';
        if (out.receipt) {
          const receipt = { ...out.receipt, syncStatus: out.status, undone: false };
          m.receipts = [...(m.receipts || []), receipt];
          if (out.status === 'pending_sync') {
            attachReceiptSyncWatcher(receipt, action);
          }
        }
        persistHistory();
        renderMessages();
        toast(out.status === 'pending_sync' ? 'บันทึกในเครื่องแล้ว รอซิงค์เมื่อออนไลน์' : 'ยืนยันและบันทึกข้อมูลแล้ว');
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
      let syncedCount = 0;
      let pendingSyncCount = 0;
      const failedErrors = [];
      try {
        const { executeConfirmedAction } = await import('./services/aiAssistant.js');
        for (const action of pendingItems) {
          const out = await executeConfirmedAction(action);
          if (out.status === 'failed' || (!out.ok && !out.pendingSync)) {
            failedErrors.push(out.error || 'เกิดข้อผิดพลาด');
            continue;
          }
          action.status = out.status === 'pending_sync' ? 'pending_sync' : 'confirmed';
          if (out.receipt) {
            const receipt = { ...out.receipt, syncStatus: out.status, undone: false };
            m.receipts = [...(m.receipts || []), receipt];
            if (out.status === 'pending_sync') {
              attachReceiptSyncWatcher(receipt, action);
            }
          }
          if (out.status === 'pending_sync') pendingSyncCount++;
          else syncedCount++;
        }
        persistHistory();
        renderMessages();
        if (failedErrors.length) {
          toast(`สำเร็จ ${syncedCount + pendingSyncCount} รายการ · ไม่สำเร็จ ${failedErrors.length} รายการ: ${failedErrors[0]}`, 'err');
        } else if (pendingSyncCount > 0 && syncedCount === 0) {
          toast(`บันทึกในเครื่องครบ ${pendingSyncCount} รายการแล้ว รอซิงค์เมื่อออนไลน์`);
        } else if (pendingSyncCount > 0) {
          toast(`บันทึกแล้ว ${syncedCount} รายการ · รอซิงค์ ${pendingSyncCount} รายการ`);
        } else {
          toast(`บันทึกครบทั้ง ${syncedCount} รายการแล้ว`);
        }
      } catch (err) {
        persistHistory();
        renderMessages();
        toast(`บันทึกสำเร็จ ${syncedCount + pendingSyncCount} รายการ · เกิดข้อผิดพลาด: ${err.message}`, 'err');
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
      const out = await undoAssistantAction(rec.undo);
      if (out?.status === 'failed') {
        toast('ยกเลิกไม่สำเร็จ: ' + (out.error || 'เกิดข้อผิดพลาด'), 'err');
        undoBtn.disabled = false;
        undoBtn.textContent = 'ยกเลิก/ลบรายการนี้';
        return;
      }
      if (out?.status === 'pending_sync') {
        rec.undone = true;
        rec.undoStatus = 'pending_sync';
        out.syncPromise?.then(finalRes => {
          if (!finalRes) return;
          if (finalRes.status === 'synced') {
            rec.undoStatus = 'synced';
          } else if (finalRes.status === 'failed') {
            rec.undone = false;
            delete rec.undoStatus;
            toast('ยกเลิกไม่สำเร็จหลังซิงค์: ' + (finalRes.error || 'เกิดข้อผิดพลาด'), 'err');
          }
          persistHistory();
          renderMessages();
        });
        persistHistory();
        renderMessages();
        toast('ส่งคำขอยกเลิกไว้ในคิวออฟไลน์แล้ว รอซิงค์เมื่อออนไลน์');
        return;
      }
      rec.undone = true;
      rec.undoStatus = 'synced';
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
    if (e.key === 'Escape' && isOpen && !document.querySelector('.modal-backdrop, .tm-modal-backdrop')) {
      setOpen(false);
    }
  });
}

const NOTE_CATS = ['ทั่วไป', 'สุขภาพ', 'น้องหมา', 'การงาน', 'ไอเดีย', 'การเงิน'];
const FB_CATS = [
  ['bug', '🐛 แจ้งปัญหา (Bug)'],
  ['feature', '✨ ขอฟีเจอร์ใหม่'],
  ['ux', '🎨 การใช้งาน / UI'],
  ['praise', '💜 คำชม / ถูกใจ'],
  ['other', '💬 อื่น ๆ']
];
const FB_LABEL = Object.fromEntries(FB_CATS);

export function openNotesAndFeedbackModal(initialTab = 'notes') {
  let tab = initialTab === 'feedback' ? 'feedback' : 'notes';
  let searchQuery = '';
  let editNoteId = null;
  let fbRating = 5;

  let boxEl = null;
  const onNotesChange = () => { if (boxEl?.isConnected) renderModal(); };
  const modal = openModal(`
    <div class="flex justify-between items-center mb-3">
      <h3 class="font-bold text-slate-800 inline-flex items-center gap-2">${iconSvg('note', { size: 17, className: 'text-brand' })}<span>โน้ตผู้ช่วย &amp; Feedback</span></h3>
      <button type="button" data-close class="icon-btn !w-11 !h-11 text-slate-400" aria-label="ปิด">${iconSvg('close', { size: 18 })}</button>
    </div>
    <div class="flex gap-2 mb-3">
      <button type="button" id="nf-tab-notes" class="chip min-h-[44px] text-xs"></button>
      <button type="button" id="nf-tab-feedback" class="chip min-h-[44px] text-xs"></button>
    </div>
    <div id="nf-body" class="space-y-3"></div>
  `, {
    onClose: () => window.removeEventListener('trackme:notes-change', onNotesChange)
  });
  const box = modal.box;
  boxEl = box;

  const renderModal = () => {
    if (!box.isConnected) return;
    const notes = state.assistantNotes || [];
    const feedbacks = state.userFeedback || [];
    $('#nf-tab-notes', box).className = `chip min-h-[44px] text-xs ${tab === 'notes' ? 'bg-brand text-white font-semibold' : 'bg-slate-100 text-slate-600'}`;
    $('#nf-tab-notes', box).textContent = `📝 โน้ต (${notes.length})`;
    $('#nf-tab-feedback', box).className = `chip min-h-[44px] text-xs ${tab === 'feedback' ? 'bg-brand text-white font-semibold' : 'bg-slate-100 text-slate-600'}`;
    $('#nf-tab-feedback', box).textContent = `💬 ส่ง Feedback (${feedbacks.length})`;

    const body = $('#nf-body', box);
    if (tab === 'notes') {
      const editing = editNoteId ? notes.find(n => n.id === editNoteId) : null;
      const q = searchQuery.trim().toLowerCase();
      const filtered = q
        ? notes.filter(n =>
            String(n.name || n.title || '').toLowerCase().includes(q) ||
            String(n.note || n.content || '').toLowerCase().includes(q) ||
            String(n.category || '').toLowerCase().includes(q)
          )
        : notes;

      body.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
          <p class="text-xs font-semibold text-slate-700">${editing ? '✏️ แก้ไขโน้ต' : '➕ จดโน้ตใหม่'} <span class="font-normal text-slate-500">(หรือพิมพ์สั่งในแชท "จดโน้ตว่า..." ได้เลย)</span></p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input id="nf-n-title" class="input text-xs sm:col-span-2" maxlength="120" aria-label="หัวข้อโน้ต" placeholder="หัวข้อโน้ต" value="${esc(editing?.name || editing?.title || '')}">
            <select id="nf-n-cat" class="input text-xs" aria-label="หมวดหมู่โน้ต">
              ${NOTE_CATS.map(c => `<option value="${esc(c)}" ${(editing?.category || 'ทั่วไป') === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </div>
          <textarea id="nf-n-content" rows="2" maxlength="1200" class="input text-xs w-full" aria-label="รายละเอียดโน้ต" placeholder="รายละเอียดโน้ตที่ต้องการจำ…">${esc(editing?.note || editing?.content || '')}</textarea>
          <div class="flex justify-end gap-2">
            ${editing ? '<button type="button" id="nf-n-cancel" class="btn btn-ghost text-xs !py-1.5">ยกเลิก</button>' : ''}
            <button type="button" id="nf-n-save" class="btn btn-primary text-xs !py-1.5">${editing ? 'บันทึกการแก้ไข' : 'บันทึกโน้ต'}</button>
          </div>
        </div>
        <input id="nf-search" class="input text-xs" aria-label="ค้นหาโน้ต" placeholder="🔍 ค้นหาโน้ต..." value="${esc(searchQuery)}">
        <div class="space-y-2 max-h-64 overflow-y-auto pr-0.5">
          ${filtered.length ? filtered.map(n => `
            <div class="rounded-xl border border-slate-100 bg-white p-2.5 text-xs space-y-1">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <span class="font-bold text-slate-800">${esc(n.name || n.title || 'โน้ต')}</span>
                  <span class="chip bg-lav-soft text-brand-dark text-[10px] ml-1">${esc(n.category || 'ทั่วไป')}</span>
                  ${n.date ? `<span class="text-[11px] text-slate-400 ml-1">${esc(fmtDate(n.date))}</span>` : ''}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button type="button" data-note-edit="${esc(n.id)}" class="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-brand hover:bg-slate-100" aria-label="แก้ไข">${iconSvg('edit', { size: 15 })}</button>
                  <button type="button" data-note-del="${esc(n.id)}" class="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-rose-400 hover:text-rose-600 hover:bg-rose-50" aria-label="ลบ">${iconSvg('trash', { size: 15 })}</button>
                </div>
              </div>
              <p class="text-slate-600 whitespace-pre-wrap break-words">${esc(n.note || n.content || '')}</p>
            </div>
          `).join('') : '<p class="text-xs text-center text-slate-400 py-4">ยังไม่มีโน้ตที่จดไว้</p>'}
        </div>
      `;

      $('#nf-search', body)?.addEventListener('input', e => {
        searchQuery = e.target.value;
        const pos = e.target.selectionStart;
        renderModal();
        const nextSearch = $('#nf-search', box);
        if (nextSearch) {
          nextSearch.focus();
          if (typeof pos === 'number') nextSearch.setSelectionRange(pos, pos);
        }
      });
      $('#nf-n-cancel', body)?.addEventListener('click', () => { editNoteId = null; renderModal(); });
      $('#nf-n-save', body)?.addEventListener('click', async () => {
        if (!state.uid) return toast('กรุณาเข้าสู่ระบบก่อน', 'err');
        if (guardPreviewWrite('การบันทึกโน้ต')) return;
        const title = ($('#nf-n-title', body)?.value || '').trim() || 'โน้ต';
        const category = $('#nf-n-cat', body)?.value || 'ทั่วไป';
        const content = ($('#nf-n-content', body)?.value || '').trim();
        if (!content) return toast('กรุณากรอกรายละเอียดโน้ต', 'err');
        const nowIso = new Date().toISOString();
        const docId = editNoteId || ('note_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
        const existing = editNoteId ? notes.find(n => n.id === editNoteId) : null;
        const payload = {
          kind: 'assistant_note',
          name: title.slice(0, 120),
          category,
          note: content.slice(0, 1200),
          date: existing?.date || localDateStr(),
          source: existing?.source || 'manual',
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso
        };
        try {
          await setDoc(userDoc(state.uid, 'settings', docId), payload);
          state.assistantNotes = [{ id: docId, ...payload }, ...notes.filter(x => x.id !== docId)];
          editNoteId = null;
          window.dispatchEvent(new Event('trackme:notes-change'));
          toast('บันทึกโน้ตแล้ว');
          renderModal();
        } catch (err) {
          toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
        }
      });
      body.querySelectorAll('[data-note-edit]').forEach(btn => {
        btn.addEventListener('click', () => { editNoteId = btn.dataset.noteEdit; renderModal(); });
      });
      body.querySelectorAll('[data-note-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (guardPreviewWrite('การลบโน้ต')) return;
          if (!confirm('ต้องการลบโน้ตนี้?')) return;
          const id = btn.dataset.noteDel;
          try {
            await deleteDoc(userDoc(state.uid, 'settings', id));
            state.assistantNotes = (state.assistantNotes || []).filter(x => x.id !== id);
            if (editNoteId === id) editNoteId = null;
            window.dispatchEvent(new Event('trackme:notes-change'));
            toast('ลบโน้ตแล้ว');
            renderModal();
          } catch (err) {
            toast('ลบไม่สำเร็จ: ' + err.message, 'err');
          }
        });
      });
    } else {
      body.innerHTML = `
        <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
          <p class="text-xs font-semibold text-slate-700">ส่งความคิดเห็น / แจ้งปัญหาให้ Track Me <span class="font-normal text-slate-500">(เก็บไว้ดูย้อนหลังและใช้ปรับปรุงแอป)</span></p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select id="nf-fb-cat" class="input text-xs" aria-label="หมวดหมู่ Feedback">
              ${FB_CATS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
            </select>
            <input id="nf-fb-ctx" class="input text-xs" maxlength="80" aria-label="หน้าที่ใช้งาน" placeholder="หน้าที่ใช้งาน (เช่น แชท AI, ออกกำลังกาย)">
          </div>
          <div class="flex flex-wrap items-center gap-1.5 text-xs">
            <span class="text-slate-600">คะแนนความพึงพอใจ:</span>
            ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-fb-rate="${n}" class="min-w-[44px] min-h-[44px] inline-flex items-center justify-center px-2.5 py-1 rounded-xl border text-xs ${fbRating === n ? 'bg-amber-100 border-amber-400 font-bold text-amber-800' : 'bg-white border-slate-200 text-slate-500'}">⭐ ${n}</button>`).join('')}
          </div>
          <textarea id="nf-fb-msg" rows="3" maxlength="1200" class="input text-xs w-full" aria-label="ข้อความ Feedback" placeholder="เล่าปัญหาที่พบ ฟีเจอร์ที่อยากได้ หรือความประทับใจ…"></textarea>
          <div class="flex justify-end">
            <button type="button" id="nf-fb-save" class="btn btn-primary text-xs !py-1.5">ส่ง Feedback</button>
          </div>
        </div>
        <div class="space-y-2 max-h-56 overflow-y-auto pr-0.5">
          ${feedbacks.length ? feedbacks.map(f => `
            <div class="rounded-xl border border-slate-100 bg-white p-2.5 text-xs space-y-1">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <span class="chip bg-sky-soft text-slate-700 text-[10px]">${esc(FB_LABEL[f.category] || f.category || 'ทั่วไป')}</span>
                  ${f.value != null ? `<span class="text-amber-600 font-semibold ml-1">⭐ ${f.value}/5</span>` : ''}
                  ${f.type ? `<span class="text-[11px] text-slate-500 ml-1">· ${esc(f.type)}</span>` : ''}
                  ${f.date ? `<span class="text-[11px] text-slate-400 ml-1">(${esc(fmtDate(f.date))})</span>` : ''}
                </div>
                <button type="button" data-fb-del="${esc(f.id)}" class="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-rose-400 hover:text-rose-600 hover:bg-rose-50 shrink-0" aria-label="ลบ">${iconSvg('trash', { size: 15 })}</button>
              </div>
              <p class="text-slate-600 whitespace-pre-wrap break-words">${esc(f.note || '')}</p>
            </div>
          `).join('') : '<p class="text-xs text-center text-slate-400 py-4">ยังไม่มี Feedback ที่ส่งไว้</p>'}
        </div>
      `;

      body.querySelectorAll('[data-fb-rate]').forEach(btn => {
        btn.addEventListener('click', () => {
          fbRating = Number(btn.dataset.fbRate) || 5;
          body.querySelectorAll('[data-fb-rate]').forEach(b => {
            const on = Number(b.dataset.fbRate) === fbRating;
            b.className = `min-w-[44px] min-h-[44px] inline-flex items-center justify-center px-2.5 py-1 rounded-xl border text-xs ${on ? 'bg-amber-100 border-amber-400 font-bold text-amber-800' : 'bg-white border-slate-200 text-slate-500'}`;
          });
        });
      });
      $('#nf-fb-save', body)?.addEventListener('click', async () => {
        if (!state.uid) return toast('กรุณาเข้าสู่ระบบก่อน', 'err');
        if (guardPreviewWrite('การส่ง Feedback')) return;
        const category = $('#nf-fb-cat', body)?.value || 'other';
        const context = ($('#nf-fb-ctx', body)?.value || '').trim();
        const message = ($('#nf-fb-msg', body)?.value || '').trim();
        if (!message) return toast('กรุณากรอกข้อความ Feedback', 'err');
        const nowIso = new Date().toISOString();
        const docId = 'feedback_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const payload = {
          kind: 'user_feedback',
          category,
          value: fbRating,
          note: message.slice(0, 1200),
          ...(context ? { type: context.slice(0, 80) } : {}),
          date: localDateStr(),
          status: 'new',
          source: 'manual',
          createdAt: nowIso,
          updatedAt: nowIso
        };
        try {
          await setDoc(userDoc(state.uid, 'settings', docId), payload);
          state.userFeedback = [{ id: docId, ...payload }, ...(state.userFeedback || []).filter(x => x.id !== docId)];
          window.dispatchEvent(new Event('trackme:notes-change'));
          toast('บันทึก Feedback ขอบคุณสำหรับความคิดเห็นค่ะ 💬');
          renderModal();
        } catch (err) {
          toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
        }
      });
      body.querySelectorAll('[data-fb-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (guardPreviewWrite('การลบ Feedback')) return;
          if (!confirm('ต้องการลบ Feedback นี้?')) return;
          const id = btn.dataset.fbDel;
          try {
            await deleteDoc(userDoc(state.uid, 'settings', id));
            state.userFeedback = (state.userFeedback || []).filter(x => x.id !== id);
            window.dispatchEvent(new Event('trackme:notes-change'));
            toast('ลบ Feedback แล้ว');
            renderModal();
          } catch (err) {
            toast('ลบไม่สำเร็จ: ' + err.message, 'err');
          }
        });
      });
    }
  };

  $('#nf-tab-notes', box).addEventListener('click', () => { tab = 'notes'; renderModal(); });
  $('#nf-tab-feedback', box).addEventListener('click', () => { tab = 'feedback'; renderModal(); });
  window.addEventListener('trackme:notes-change', onNotesChange);
  renderModal();
}
