import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmDialog } from './util.js';

const readSrc = relPath => readFileSync(resolve(process.cwd(), relPath), 'utf8');

function createConfirmDomHarness() {
  class FakeHTMLElement {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.className = '';
      this.attrs = {};
      this.listeners = new Map();
      this.isConnected = false;
      this.focused = false;
      this.removed = false;
      this.children = [];
      this._innerHTML = '';
    }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    }
    dispatch(type, event = {}) {
      const ev = {
        target: this,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() {},
        ...event
      };
      for (const fn of [...(this.listeners.get(type) || [])]) fn(ev);
      return ev;
    }
    focus() { this.focused = true; }
    remove() {
      this.removed = true;
      this.isConnected = false;
      const idx = bodyChildren.indexOf(this);
      if (idx >= 0) bodyChildren.splice(idx, 1);
    }
    getClientRects() { return this.isConnected ? [{}] : []; }
    contains(node) { return node === this || this.children.includes(node); }
    querySelectorAll(sel) {
      if (sel === '[data-close]') return [];
      if (sel.includes('button:not(:disabled)')) return [this._noBtn, this._yesBtn].filter(Boolean);
      return [];
    }
    querySelector(sel) {
      if (sel === '[data-confirm-yes]') return this._yesBtn;
      if (sel === '[data-confirm-no]') return this._noBtn;
      if (sel === 'h1, h2, h3, h4, h5, h6') return this._heading;
      return null;
    }
    set innerHTML(html) {
      this._innerHTML = String(html);
      const headingMatch = this._innerHTML.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
      const noBtn = new FakeHTMLElement('button');
      const yesBtn = new FakeHTMLElement('button');
      const yesMatch = this._innerHTML.match(/data-confirm-yes\s+class="([^"]*)"/);
      const noMatch = this._innerHTML.match(/data-confirm-no\s+class="([^"]*)"/);
      if (yesMatch) yesBtn.className = yesMatch[1];
      if (noMatch) noBtn.className = noMatch[1];
      this._yesBtn = yesBtn;
      this._noBtn = noBtn;
      this._heading = headingMatch ? new FakeHTMLElement('h3') : null;
      const box = new FakeHTMLElement('div');
      box._innerHTML = this._innerHTML;
      box._yesBtn = yesBtn;
      box._noBtn = noBtn;
      box._heading = this._heading;
      box.children = [yesBtn, noBtn];
      this.firstElementChild = box;
    }
    get innerHTML() {
      return this._innerHTML;
    }
  }

  const bodyChildren = [];
  const docListeners = new Map();
  const triggerBtn = new FakeHTMLElement('button');
  triggerBtn.isConnected = true;

  const doc = {
    activeElement: triggerBtn,
    body: {
      appendChild(node) {
        node.isConnected = true;
        if (node._yesBtn) node._yesBtn.isConnected = true;
        if (node._noBtn) node._noBtn.isConnected = true;
        bodyChildren.push(node);
      }
    },
    createElement(tag) { return new FakeHTMLElement(tag); },
    querySelectorAll(sel) {
      if (sel.includes('.modal-backdrop')) return bodyChildren;
      return [];
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    dispatchKey(key) {
      const ev = {
        key,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() {}
      };
      for (const fn of [...(docListeners.get('keydown') || [])]) fn(ev);
      return ev;
    }
  };

  vi.stubGlobal('HTMLElement', FakeHTMLElement);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('requestAnimationFrame', fn => { fn(); return 1; });

  return { bodyChildren, doc, docListeners, triggerBtn };
}

describe('Phase 2 confirmDialog behavior & migration contracts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves true on confirm click, false on cancel/Escape/backdrop, and formats danger & multiline content safely', async () => {
    const harness = createConfirmDomHarness();

    const pConfirm = confirmDialog({
      title: 'ลบรายการ<script>',
      message: 'บรรทัด 1\nบรรทัด 2',
      confirmText: 'ลบเลย',
      cancelText: 'ไม่ลบ',
      danger: true
    });

    const modalEl = harness.bodyChildren[0];
    expect(modalEl).toBeTruthy();
    expect(modalEl.innerHTML).toContain('ลบรายการ&lt;script&gt;');
    expect(modalEl.innerHTML).toContain('whitespace-pre-line');
    expect(modalEl._yesBtn.className).toContain('btn-pink');
    expect(modalEl._noBtn.focused).toBe(true);

    modalEl._yesBtn.dispatch('click');
    expect(await pConfirm).toBe(true);
    expect(modalEl.removed).toBe(true);
    expect(harness.triggerBtn.focused).toBe(true);
    expect(harness.docListeners.get('keydown')?.size ?? 0).toBe(0);

    const pCancel = confirmDialog({ title: 'เปลี่ยนหมวดหมู่?', danger: false });
    const modalCancel = harness.bodyChildren[0];
    expect(modalCancel._yesBtn.className).toContain('btn-primary');
    modalCancel._noBtn.dispatch('click');
    expect(await pCancel).toBe(false);
    expect(modalCancel.removed).toBe(true);

    const pEsc = confirmDialog({ title: 'ยกเลิกด้วย Esc' });
    const modalEsc = harness.bodyChildren[0];
    harness.doc.dispatchKey('Escape');
    expect(await pEsc).toBe(false);
    expect(modalEsc.removed).toBe(true);
    expect(harness.docListeners.get('keydown')?.size ?? 0).toBe(0);

    const pBackdrop = confirmDialog({ title: 'คลิกนอกกล่อง' });
    const modalBackdrop = harness.bodyChildren[0];
    modalBackdrop.dispatch('mousedown', { target: modalBackdrop });
    expect(await pBackdrop).toBe(false);
    expect(modalBackdrop.removed).toBe(true);
  });

  it('leaves zero native confirm() or window.confirm() calls across all runtime modules in src/', () => {
    const jsFiles = readdirSync(resolve(process.cwd(), 'src'))
      .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));

    for (const file of jsFiles) {
      const content = readSrc(`src/${file}`);
      expect(content, `${file} should not call native confirm()`).not.toMatch(/\b(?:window\.)?confirm\(/);
    }
  });

  it('migrates all 16 modules (28 confirmation flows) to confirmDialog() from util.js', () => {
    const expectations = [
      ['src/food.js', 4],
      ['src/symptoms.js', 4],
      ['src/expense.js', 3],
      ['src/body.js', 2],
      ['src/period.js', 2],
      ['src/care.js', 2],
      ['src/chatWidget.js', 2],
      ['src/lab.js', 1],
      ['src/inventory.js', 1],
      ['src/remindLog.js', 1],
      ['src/backup.js', 1],
      ['src/migrate.js', 1],
      ['src/homeWidgetSettings.js', 1],
      ['src/navigationSettings.js', 1],
      ['src/auth.js', 1],
      ['src/settings.js', 1]
    ];

    for (const [relPath, count] of expectations) {
      const src = readSrc(relPath);
      expect(src, `${relPath} should import confirmDialog`).toMatch(/import\s*\{[^}]*\bconfirmDialog\b[^}]*\}\s*from\s*'\.\/util\.js'/);
      const calls = src.match(/\bawait\s+confirmDialog\s*\(/g) || [];
      expect(calls, `${relPath} confirmDialog call count`).toHaveLength(count);
    }

    const backupSrc = readSrc('src/backup.js');
    expect(backupSrc).toContain("danger: mode === 'overwrite'");

    const foodSrc = readSrc('src/food.js');
    expect(foodSrc).toContain('danger: false');
    expect(foodSrc).toContain('danger: true');

    const expenseSrc = readSrc('src/expense.js');
    expect(expenseSrc).toContain('danger: false');
    expect(expenseSrc).toContain('danger: true');

    const periodSrc = readSrc('src/period.js');
    expect(periodSrc).toContain('danger: false');
    expect(periodSrc).toContain('danger: true');
  });
});
