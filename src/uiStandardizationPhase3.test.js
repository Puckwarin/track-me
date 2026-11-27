import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn((colRef, id) => ({ colRef, id: id || 'mock-doc-id' })),
  writeBatch: vi.fn(),
  userCol: vi.fn((uid, name) => ({ path: `users/${uid}/${name}` })),
  userDoc: vi.fn((uid, name, id) => ({ path: `users/${uid}/${name}/${id}`, id })),
  getFoodRecordsInRange: vi.fn(),
  guardPreviewWrite: vi.fn(() => false),
  getMeals: vi.fn(() => [
    { id: 'breakfast', name: 'มื้อเช้า' },
    { id: 'lunch', name: 'มื้อกลางวัน' }
  ])
}));

vi.mock('firebase/firestore', () => ({
  addDoc: mocks.addDoc,
  updateDoc: mocks.updateDoc,
  deleteDoc: mocks.deleteDoc,
  setDoc: mocks.setDoc,
  doc: mocks.doc,
  writeBatch: mocks.writeBatch
}));

vi.mock('./firebase.js', () => ({
  db: {},
  userCol: mocks.userCol,
  userDoc: mocks.userDoc
}));

vi.mock('./sync.js', () => ({
  watch: vi.fn()
}));

vi.mock('./preview.js', () => ({
  guardPreviewWrite: mocks.guardPreviewWrite
}));

vi.mock('./nutrition.js', () => ({
  readPetFoodLabel: vi.fn(),
  explainGeminiError: vi.fn(e => e?.message || 'err'),
  runImageBatch: vi.fn(),
  formatImageProgress: vi.fn(() => '')
}));

vi.mock('./runtimeErrorMonitor.js', () => ({
  reportRuntimeError: vi.fn()
}));

vi.mock('./foodService.js', () => ({
  getFoodRecordsInRange: mocks.getFoodRecordsInRange
}));

vi.mock('./profile.js', () => ({
  getMeals: mocks.getMeals
}));

vi.mock('./period.js', () => ({
  checkReminder: vi.fn()
}));

vi.mock('./push.js', () => ({
  syncPeriodRemindToPush: vi.fn()
}));

import { state } from './state.js';
import { toast } from './util.js';
import { detailsToggleHtml, toast as uiToast } from './ui.js';
import { savePetDailyCare } from './care.js';
import { openFoodHistorySearch } from './foodHistory.js';
import { getNotifPermissionMeta } from './reminders.js';

const readSrc = relPath => readFileSync(resolve(process.cwd(), relPath), 'utf8');

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveFn, rejectFn) => {
    resolvePromise = resolveFn;
    rejectPromise = rejectFn;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function createPhase3DomHarness({ toastHeight = 44 } = {}) {
  const bodyChildren = [];
  const docListeners = new Map();

  class FakeHTMLElement {
    constructor(tag = 'div', attrs = {}) {
      this.tagName = tag.toUpperCase();
      this.id = attrs.id || '';
      this.className = attrs.className || '';
      this.attrs = { ...attrs };
      this.dataset = {};
      this.style = {
        props: {},
        setProperty: (k, v) => { this.style.props[k] = String(v); },
        getPropertyValue: k => this.style.props[k] || ''
      };
      this.listeners = new Map();
      this.children = [];
      this.isConnected = false;
      this.disabled = false;
      this.value = attrs.value || '';
      this.offsetHeight = toastHeight;
      this.scrollLeft = 0;
      this.scrollTop = 0;
      this._textContent = '';
      this._innerHTML = '';
      this._nodesById = new Map();
      this._copyButtons = [];
      this.firstElementChild = null;
    }

    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') this.id = String(v);
    }

    getAttribute(k) {
      return this.attrs[k] ?? null;
    }

    getBoundingClientRect() {
      return { left: 0, top: 0, width: 320, height: this.offsetHeight };
    }

    getClientRects() {
      return this.isConnected ? [{}] : [];
    }

    focus() {}

    contains(node) {
      return node === this || this.children.includes(node);
    }

    closest(sel) {
      if (sel.startsWith('#') && this.id === sel.slice(1)) return this;
      const attrMatch = sel.match(/^\[([^=\]]+)\]$/);
      if (attrMatch && attrMatch[1] in this.attrs) return this;
      return null;
    }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }

    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    }

    dispatch(type, event = {}) {
      const target = event.target || this;
      const ev = {
        target,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() {},
        ...event
      };
      for (const fn of [...(this.listeners.get(type) || [])]) fn(ev);
      return ev;
    }

    remove() {
      this.isConnected = false;
      const idx = bodyChildren.indexOf(this);
      if (idx >= 0) bodyChildren.splice(idx, 1);
    }

    set textContent(val) {
      this._textContent = String(val ?? '');
    }

    get textContent() {
      return this._textContent;
    }

    set innerHTML(html) {
      this._innerHTML = String(html);
      this._textContent = this._innerHTML.replace(/<[^>]+>/g, '').trim();
      if (this.className.includes('modal-backdrop')) {
        const box = new FakeHTMLElement('div');
        box.isConnected = this.isConnected;
        const fhRes = new FakeHTMLElement('div', { id: 'fh-res' });
        const fhQ = new FakeHTMLElement('input', { id: 'fh-q' });
        const fhRange = new FakeHTMLElement('select', { id: 'fh-range', value: '30' });
        const fhStrip = new FakeHTMLElement('div', { id: 'fh-week-strip' });
        const fhNow = new FakeHTMLElement('button', { id: 'fh-wk-now' });
        fhNow.classList = { toggle() {} };
        const closeBtns = [];
        for (const el of [fhRes, fhQ, fhRange, fhStrip, fhNow]) {
          el.isConnected = true;
          this._nodesById.set(el.id, el);
          box._nodesById.set(el.id, el);
        }
        this._nodesById.set('fh-close', closeBtns);
        this.firstElementChild = box;
      } else if (this.id === 'fh-res') {
        this._copyButtons = [];
        const mealRe = /data-copy-meal-idx="(\d+)"[^>]*>([\s\S]*?)<\/button>/g;
        let m;
        while ((m = mealRe.exec(this._innerHTML))) {
          const btn = new FakeHTMLElement('button');
          btn.dataset.copyMealIdx = m[1];
          btn.attrs['data-copy-meal-idx'] = m[1];
          btn._innerHTML = m[2];
          btn._textContent = m[2].replace(/<[^>]+>/g, '').trim();
          this._copyButtons.push(btn);
        }
        const itemRe = /data-copy-item-idx="(\d+)"[^>]*>([\s\S]*?)<\/button>/g;
        while ((m = itemRe.exec(this._innerHTML))) {
          const btn = new FakeHTMLElement('button');
          btn.dataset.copyItemIdx = m[1];
          btn.attrs['data-copy-item-idx'] = m[1];
          btn._innerHTML = m[2];
          btn._textContent = m[2].replace(/<[^>]+>/g, '').trim();
          this._copyButtons.push(btn);
        }
      }
    }

    get innerHTML() {
      return this._innerHTML;
    }

    querySelector(sel) {
      if (sel.startsWith('#')) {
        return this._nodesById.get(sel.slice(1)) || null;
      }
      if (sel === 'h1, h2, h3, h4, h5, h6') {
        return new FakeHTMLElement('h3');
      }
      return null;
    }

    querySelectorAll(sel) {
      if (sel === '[data-copy-meal-idx], [data-copy-item-idx]') {
        return this._copyButtons;
      }
      return [];
    }
  }

  const doc = {
    activeElement: null,
    body: {
      appendChild(node) {
        node.isConnected = true;
        bodyChildren.push(node);
        return node;
      }
    },
    createElement(tag) {
      return new FakeHTMLElement(tag);
    },
    getElementById(id) {
      for (const child of bodyChildren) {
        const hit = child._nodesById?.get(id);
        if (hit) return hit;
      }
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(sel) {
      if (sel.includes('.modal-backdrop')) return bodyChildren.filter(n => n.className.includes('modal-backdrop'));
      return [];
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    }
  };

  vi.stubGlobal('HTMLElement', FakeHTMLElement);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('requestAnimationFrame', () => 1);

  return {
    bodyChildren,
    getToasts: () => bodyChildren.filter(n => n.attrs['data-tm-toast'] !== undefined),
    getModals: () => bodyChildren.filter(n => n.className.includes('modal-backdrop'))
  };
}

describe('Phase 3: Toast Stack, Optimistic UI/Guards, Accessibility & Standards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.uid = 'user-1';
    state.isPreview = false;
    state.petProfiles = [];
    state.petCare = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('1. Dynamic Toast Stack (util.js & ui.js & style.css)', () => {
    it('stacks concurrent toasts upward without overlapping, reflows on dismiss, and caps at 4 visible toasts', () => {
      vi.useFakeTimers();
      const harness = createPhase3DomHarness({ toastHeight: 44 });

      const t1 = toast('รายการที่ 1');
      vi.advanceTimersByTime(500);
      const t2 = uiToast('รายการที่ 2', 'warn');
      vi.advanceTimersByTime(500);
      const t3 = toast('รายการที่ 3', 'err');

      const live3 = harness.getToasts();
      expect(live3).toHaveLength(3);
      // Newest toast (t3) sits at bottom (0px); older stack upwards by 44 + 8 = 52px each
      expect(t3.style.getPropertyValue('--toast-offset')).toBe('0px');
      expect(t2.style.getPropertyValue('--toast-offset')).toBe('52px');
      expect(t1.style.getPropertyValue('--toast-offset')).toBe('104px');
      expect(t2.className).toContain('bg-amber-600');
      expect(t3.className).toContain('z-[130]');
      expect(t3.getAttribute('role')).toBe('alert');
      expect(t2.getAttribute('role')).toBe('status');

      // Expiring t1 (2200ms remaining after 1000ms elapsed) leaves t2 & t3 with unchanged bottom offsets cleanly
      vi.advanceTimersByTime(2200);
      expect(harness.getToasts()).toHaveLength(2);
      expect(t1.isConnected).toBe(false);
      expect(t3.style.getPropertyValue('--toast-offset')).toBe('0px');
      expect(t2.style.getPropertyValue('--toast-offset')).toBe('52px');

      // Firing 4 more rapidly evicts oldest so visible count never exceeds 4
      const t4 = toast('ที่ 4');
      const t5 = toast('ที่ 5');
      const t6 = toast('ที่ 6');
      const liveCap = harness.getToasts();
      expect(liveCap).toHaveLength(4);
      expect(t2.isConnected).toBe(false);
      expect(t3.isConnected).toBe(true);
      expect(t6.style.getPropertyValue('--toast-offset')).toBe('0px');
      expect(t5.style.getPropertyValue('--toast-offset')).toBe('52px');
      expect(t4.style.getPropertyValue('--toast-offset')).toBe('104px');
      expect(t3.style.getPropertyValue('--toast-offset')).toBe('156px');

      // After 3200ms all clear out
      vi.advanceTimersByTime(3200);
      expect(harness.getToasts()).toHaveLength(0);
    });

    it('wires .toast CSS offset transition and 3200ms timing in style.css', () => {
      const css = readSrc('src/style.css');
      expect(css).toContain('bottom: calc(var(--nav-h) + var(--safe-b) + 1rem + var(--toast-offset, 0px));');
      expect(css).toContain('transition: bottom .18s ease-out;');
    });
  });

  describe('2. Optimistic UI & Double-Submit Guards (care.js & foodHistory.js)', () => {
    it('updates state.petCare optimistically before addDoc resolves, prevents concurrent duplicates, and reconciles saved id', async () => {
      const harness = createPhase3DomHarness();
      const pendingWrite = deferred();
      mocks.addDoc.mockReturnValueOnce(pendingWrite.promise);
      state.petProfiles = [{ id: 'pet-1', name: 'Mochi' }];
      state.petCare = [];

      const task = { key: 'feeding', label: 'ให้อาหาร', icon: 'fa-bowl-food' };
      const firstRun = savePetDailyCare(task);
      // Concurrent tap on the same task today should be blocked immediately by pendingPetCare
      const secondRun = savePetDailyCare(task);

      // Optimistic state + success toast are immediate before await resolves
      expect(mocks.addDoc).toHaveBeenCalledTimes(1);
      expect(state.petCare).toHaveLength(1);
      expect(state.petCare[0].done).toBe(true);
      expect(state.petCare[0].id).toMatch(/^optimistic:/);
      expect(harness.getToasts().map(n => n.textContent)).toContain('บันทึกให้อาหารแล้ว');

      pendingWrite.resolve({ id: 'firestore-care-99' });
      await Promise.all([firstRun, secondRun]);

      expect(state.petCare).toHaveLength(1);
      expect(state.petCare[0].id).toBe('firestore-care-99');
    });

    it('rolls back state.petCare and shows error toast if Firestore update fails', async () => {
      const harness = createPhase3DomHarness();
      const pendingUpdate = deferred();
      mocks.updateDoc.mockReturnValueOnce(pendingUpdate.promise);
      state.petProfiles = [{ id: 'pet-1', name: 'Mochi' }];
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      state.petCare = [{
        id: 'care-existing-1',
        petId: 'pet-1',
        date: today,
        type: 'แปรงฟัน',
        done: false
      }];

      const run = savePetDailyCare({ key: 'teeth', label: 'แปรงฟัน', icon: 'fa-tooth' });
      expect(state.petCare[0].done).toBe(true);

      pendingUpdate.reject(new Error('network offline'));
      await run;

      expect(state.petCare[0].done).toBe(false);
      const toastTexts = harness.getToasts().map(n => n.textContent);
      expect(toastTexts.some(t => t.includes('บันทึกไม่สำเร็จ: network offline'))).toBe(true);
    });

    it('guards foodHistory copy buttons against double-submit during batch.commit and re-enables on error', async () => {
      const harness = createPhase3DomHarness();
      mocks.getFoodRecordsInRange.mockResolvedValueOnce({
        docs: [{
          data: () => ({
            id: 'f-1',
            date: '2026-11-25',
            meal: 'มื้อเช้า',
            mealId: 'breakfast',
            name: 'อกไก่ต้ม',
            calories: 165,
            protein: 31,
            carbs: 0,
            fat: 3.6
          })
        }]
      });

      const commitDeferred = deferred();
      const batchMock = {
        set: vi.fn(),
        commit: vi.fn(() => commitDeferred.promise)
      };
      mocks.writeBatch.mockReturnValue(batchMock);

      openFoodHistorySearch();
      // Let initial async search resolve and renderGroups execute
      await new Promise(resolveFn => setTimeout(resolveFn, 0));

      const modalEl = harness.getModals()[0];
      const resEl = modalEl.querySelector('#fh-res');
      const copyButtons = resEl.querySelectorAll('[data-copy-meal-idx], [data-copy-item-idx]');
      expect(copyButtons.length).toBeGreaterThanOrEqual(2);
      const mealBtn = copyButtons.find(b => b.dataset.copyMealIdx === '0');
      const itemBtn = copyButtons.find(b => b.dataset.copyItemIdx === '0');

      // First click starts copy and disables all copy buttons
      resEl.dispatch('click', { target: mealBtn });
      expect(mocks.writeBatch).toHaveBeenCalledTimes(1);
      expect(mealBtn.disabled).toBe(true);
      expect(itemBtn.disabled).toBe(true);
      expect(mealBtn.textContent).toBe('กำลังบันทึก...');

      // Concurrent click on another copy button must be ignored
      resEl.dispatch('click', { target: itemBtn });
      expect(mocks.writeBatch).toHaveBeenCalledTimes(1);

      // Failure shows error toast and restores buttons cleanly
      commitDeferred.reject(new Error('permission denied'));
      await new Promise(resolveFn => setTimeout(resolveFn, 0));

      expect(mealBtn.disabled).toBe(false);
      expect(itemBtn.disabled).toBe(false);
      expect(mealBtn.textContent).toContain('คัดลอกมื้อนี้');
      expect(harness.getToasts().some(t => t.textContent.includes('คัดลอกไม่สำเร็จ: permission denied'))).toBe(true);
    });
  });

  describe('3. Phase 3 UI & Accessibility Standardization', () => {
    it('removes magnifying-glass emoji from all search input placeholders', () => {
      for (const file of ['src/chatWidget.js', 'src/expense.js', 'src/lab.js', 'src/remindLog.js']) {
        const src = readSrc(file);
        expect(src).not.toMatch(/placeholder="[^"]*🔍/);
      }
    });

    it('standardizes notification permission states in reminders.js', () => {
      const granted = getNotifPermissionMeta('granted');
      const denied = getNotifPermissionMeta('denied');
      const promptState = getNotifPermissionMeta('default');
      const unsupported = getNotifPermissionMeta('unsupported');

      expect(granted).toMatchObject({ permission: 'granted', disabled: true, icon: 'check-circle', label: 'แจ้งเตือนบนเครื่องเปิดอยู่' });
      expect(denied).toMatchObject({ permission: 'denied', disabled: false, icon: 'alert', label: 'ถูกบล็อกในเบราว์เซอร์' });
      expect(promptState).toMatchObject({ permission: 'default', disabled: false, icon: 'notifications', label: 'อนุญาตแจ้งเตือน' });
      expect(unsupported).toMatchObject({ permission: 'unsupported', disabled: true, icon: 'close' });
      expect(new Set([granted.className, denied.className, promptState.className, unsupported.className]).size).toBe(4);

      const remSrc = readSrc('src/reminders.js');
      expect(remSrc).toContain('id="nt-notif-perm" type="button" data-perm="${esc(notifMeta.permission)}"');
      expect(remSrc).toContain("toast('การแจ้งเตือนถูกบล็อกอยู่ — กรุณาเปิดอนุญาตในการตั้งค่าเบราว์เซอร์สำหรับเว็บไซต์นี้', 'warn')");
    });

    it('unifies <details>/<summary> and collapse button labels ("หุบ" / "กาง") and icons', () => {
      const compactToggle = detailsToggleHtml({ compact: true });
      expect(compactToggle).toContain('tm-details-state is-compact');
      expect(compactToggle).toContain('>หุบ</span>');
      expect(compactToggle).toContain('>กาง</span>');

      expect(readSrc('src/planner.js')).toContain('aria-label="หุบ Weekly Planner" title="หุบ"');
      expect(readSrc('src/home.js')).toContain('aria-label="กาง Weekly Planner" title="กาง"');
      expect(readSrc('src/settings.js')).toContain("btn.setAttribute('aria-label', `${nextCollapsed ? 'กาง' : 'หุบ'}${baseLabel}`)");
      expect(readSrc('src/dashboard.js')).not.toContain('แตะเพื่อย่อ/ขยาย');
      expect(readSrc('src/dashboard.js')).toContain('detailsToggleHtml()');
      expect(readSrc('src/foodHistory.js')).toContain("data-fh-toggle-all-dates aria-expanded=\"${!allDatesCollapsed}\"");

      for (const file of ['src/care.js', 'src/expense.js', 'src/inventory.js', 'src/lab.js', 'src/remindLog.js', 'src/settings.js', 'src/workout.js']) {
        expect(readSrc(file)).toContain('tm-details-summary');
      }

      const css = readSrc('src/style.css');
      expect(css).toContain('.tm-details > summary::-webkit-details-marker');
      expect(css).toContain('.tm-details > summary');
      expect(css).toContain('min-height: 44px;');
    });

    it('adds missing label/for and aria-label bindings and unifies desktop input height without locking mobile zoom', () => {
      expect(readSrc('src/reports.js')).toContain('for="r-from"');
      expect(readSrc('src/reports.js')).toContain('for="r-to"');
      expect(readSrc('src/reports.js')).toContain('for="r-name"');

      const foodSrc = readSrc('src/food.js');
      for (const id of ['hp-sample', 'hp-name', 'hp-rice-type', 'hp-rice-g', 'fl-amount', 'qb-date', 'qb-meal', 'qb-input']) {
        expect(foodSrc).toContain(`for="${id}"`);
      }
      expect(foodSrc).toContain('aria-label="เลือกหมวดหมู่ใหม่สำหรับเมนูที่เลือก"');

      const workoutSrc = readSrc('src/workout.js');
      for (const id of ['w-date', 'w-status', 'w-type', 'w-dur', 'w-int', 'w-tpl', 'w-title', 'w-muscle', 'w-note', 'w-hist-from', 'w-hist-to', 'wt-name']) {
        expect(workoutSrc).toContain(`for="${id}"`);
      }
      expect(workoutSrc).toContain('aria-label="ชื่อเทมเพลต"');
      expect(workoutSrc).toContain('aria-label="ค้นหาประวัติการออกกำลังกาย"');

      expect(readSrc('src/body.js')).toContain('for="b-date"');
      expect(readSrc('src/body.js')).toContain('aria-label="วันที่สำหรับข้อมูลวันที่ ${idx + 1}"');
      expect(readSrc('src/inventory.js')).toContain('aria-label="ค้นหาของใช้ในสต๊อก"');
      expect(readSrc('src/inventory.js')).toContain('for="inv-expiry"');
      expect(readSrc('src/lab.js')).toContain('for="lbs-date"');
      expect(readSrc('src/remindLog.js')).toContain('aria-label="ค้นหารายการแจ้งเตือน"');
      expect(readSrc('src/reminders.js')).toContain('aria-label="ระยะเวลาแจ้งเตือนล่วงหน้าสำหรับ ${esc(x.label)}"');
      expect(readSrc('src/care.js')).toContain('for="pfs-name-${i}"');

      const jsFiles = readdirSync(resolve(process.cwd(), 'src')).filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));
      for (const file of jsFiles) {
        expect(readSrc(`src/${file}`)).not.toContain('md:!py-');
      }

      const css = readSrc('src/style.css');
      expect(css).toContain('@media (min-width: 768px)');
      expect(css).toContain('height: 2.5rem;');
      expect(css).toContain('@media (max-width: 767px)');
      expect(css).toContain('font-size: 16px;');

      const html = readSrc('index.html');
      expect(html).not.toMatch(/maximum-scale\s*=\s*1/i);
      expect(html).not.toMatch(/user-scalable\s*=\s*no/i);
    });
  });
});
