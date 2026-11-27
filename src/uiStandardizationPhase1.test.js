import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iconSvg } from './icons.js';
import { buildWeekStripRange, weekNavBarHtml } from './ui.js';

const readSrc = relPath => readFileSync(resolve(process.cwd(), relPath), 'utf8');

describe('Phase 1 UI & control standardization', () => {
  it('renders every Phosphor icon key standardized across Phase 1 action controls', () => {
    const phase1Icons = [
      'plus', 'close', 'check', 'save', 'trash', 'edit-square',
      'search', 'upload', 'external-link', 'zap', 'arrow-right',
      'sliders', 'list-checks', 'eraser', 'notifications', 'lock',
      'copy', 'note'
    ];
    for (const key of phase1Icons) {
      const svg = iconSvg(key, { size: 15 });
      expect(svg).toContain('viewBox="0 0 256 256"');
      expect(svg).toContain('<path');
    }
  });

  it('standardizes foodHistory.js to reuse shared weekNavBarHtml ("วันนี้") and buildWeekStripRange', () => {
    const src = readSrc('src/foodHistory.js');
    expect(src).toContain("import { buildWeekStripRange, centerStripPill, weekNavBarHtml } from './ui.js';");
    expect(src).toContain('weekNavBarHtml({ isToday: activeDate === today, todayAttrs: \'id="fh-wk-now"\', showArrows: false })');
    expect(src).toContain('buildWeekStripRange(today, activeDate)');
    expect(src).toContain("centerStripPill(stripEl, '.is-active'");
    expect(src).toContain("$('#fh-wk-now', m.el)?.addEventListener('click'");
    expect(src).not.toContain("const DOW = ['อา'");

    const navHtml = weekNavBarHtml({ isToday: false, todayAttrs: 'id="fh-wk-now"', showArrows: false });
    expect(navHtml).toContain('id="fh-wk-now"');
    expect(navHtml).toContain('>วันนี้</button>');
    expect(navHtml).not.toContain('pl-week-nav-btn');

    const days = buildWeekStripRange('2026-11-26', '2026-11-26');
    expect(days.some(d => d.date === '2026-11-26' && d.isToday)).toBe(true);
  });

  it('replaces plain text "+" action labels with iconSvg("plus") and aligns planner reschedule modal buttons', () => {
    const plannerSrc = readSrc('src/planner.js');
    expect(plannerSrc).not.toContain('>+ เพิ่มงาน</button>');
    expect(plannerSrc).toContain("iconSvg('plus', { size: 13 })} เพิ่มงาน");
    expect(plannerSrc).toContain('id="pl-modal-edit" class="tm-row-action-btn"');
    expect(plannerSrc).toContain('id="pl-modal-skip" class="tm-row-action-btn is-del"');
    expect(plannerSrc).not.toContain('class="tm-food-action-btn');

    const expenseSrc = readSrc('src/expense.js');
    expect(expenseSrc).not.toContain('>+ ตั้งเป็นประจำ</button>');
    expect(expenseSrc).toContain("iconSvg('plus', { size: 14 })} ตั้งเป็นประจำ");
  });

  it('adds standard icons to primary, secondary, and cancel actions in expense, hiwpinto, lab, backup, migrate, onboarding, and settings', () => {
    const expenseSrc = readSrc('src/expense.js');
    expect(expenseSrc).toMatch(/id="ex-cancel"[^>]*>.*iconSvg\('close'/s);
    expect(expenseSrc).toMatch(/id="ex-statement-parse"[^>]*>.*iconSvg\('list-checks'/s);
    expect(expenseSrc).toMatch(/id="ex-pending-clear"[^>]*>.*iconSvg\('eraser'/s);
    expect(expenseSrc).toMatch(/id="ex-pending-import"[^>]*>.*iconSvg\('check'/s);
    expect(expenseSrc).toMatch(/id="ex-budget-edit"[^>]*>.*iconSvg\('sliders'/s);
    expect(expenseSrc).toMatch(/id="ex-recurring-add"[^>]*>.*iconSvg\('plus'/s);
    expect(expenseSrc).toMatch(/data-recurring-record=[^>]*>.*iconSvg\('check'/s);
    expect(expenseSrc).toContain('data-pending-remove="\' + esc(item.id) + \'" class="tm-row-action-btn is-del shrink-0"');

    const hiwpintoSrc = readSrc('src/hiwpinto.js');
    expect(hiwpintoSrc).toMatch(/id="hp-copy-helper"[^>]*>.*iconSvg\('copy'/);
    expect(hiwpintoSrc).toMatch(/id="hp-paste-helper"[^>]*>.*iconSvg\('note'/);
    expect(hiwpintoSrc).toMatch(/id="hp-import"[^>]*>.*iconSvg\('search'/);
    expect(hiwpintoSrc).toMatch(/id="hp-confirm-save"[^>]*>.*iconSvg\('plus'/);

    const labSrc = readSrc('src/lab.js');
    expect(labSrc).toMatch(/data-close class="btn btn-ghost min-h-\[44px\]">\$\{iconSvg\('close'/);
    expect(labSrc).toMatch(/id="lbp-next"[^>]*>.*iconSvg\('check'/);

    const backupSrc = readSrc('src/backup.js');
    expect(backupSrc).toMatch(/id="bk-go"[^>]*>.*iconSvg\('upload'/);

    const migrateSrc = readSrc('src/migrate.js');
    expect(migrateSrc).toMatch(/id="mg-scan"[^>]*>.*iconSvg\('search'/);
    expect(migrateSrc).toMatch(/id="mg-go"[^>]*>.*iconSvg\('check'/);
    expect(migrateSrc).toMatch(/id="mg-del"[^>]*>.*iconSvg\('trash'/);

    const onboardingSrc = readSrc('src/onboarding.js');
    expect(onboardingSrc).toMatch(/id="onb-ai-save"[^>]*>.*iconSvg\('save'/);
    expect(onboardingSrc).toMatch(/id="onb-ai-test"[^>]*>.*iconSvg\('zap'/);
    expect(onboardingSrc).toMatch(/id="onb-next"[^>]*>.*iconSvg\('check'.*iconSvg\('arrow-right'/);

    const settingsSrc = readSrc('src/settings.js');
    expect(settingsSrc).toMatch(/id="st-lock-now"[^>]*>.*iconSvg\('lock'/);
    expect(settingsSrc).toMatch(/id="st-pin-remove"[^>]*>.*iconSvg\('close'/);
    expect(settingsSrc).toMatch(/id="st-push-disable"[^>]*>.*iconSvg\('close'/);
    expect(settingsSrc).toMatch(/id="st-push-test"[^>]*>.*iconSvg\('notifications'/);
    for (const testBtnId of ['st-key-test', 'st-groq-test', 'st-openrouter-test', 'st-usda-test']) {
      expect(settingsSrc).toMatch(new RegExp(`id="${testBtnId}"[^>]*>.*iconSvg\\('zap'`));
    }
  });

  it('unifies check (new log) vs save (edit/settings), close (cancel), and trash (delete) across care, inventory, symptoms, and remindLog', () => {
    const careSrc = readSrc('src/care.js');
    expect(careSrc).toMatch(/id="pet-save"[^>]*>.*iconSvg\('save'/);
    expect(careSrc).toMatch(/id="pet-food-save"[^>]*>.*iconSvg\('check'/);
    expect(careSrc).toMatch(/id="pet-sx-cancel"[^>]*>.*iconSvg\('close'/);
    expect(careSrc).toMatch(/id="pet-sx-save"[^>]*>.*iconSvg\('check'/);
    expect(careSrc).toContain("$r('#pet-sx-save').innerHTML = `${iconSvg('save', { size: 15 })} บันทึกการแก้ไข`;");

    const invSrc = readSrc('src/inventory.js');
    expect(invSrc).toMatch(/id="inv-cancel"[^>]*>.*iconSvg\('close'/);
    expect(invSrc).toMatch(/id="inv-save"[^>]*>.*iconSvg\('check'/);
    expect(invSrc).toMatch(/id="inv-blacklist-save"[^>]*>.*iconSvg\('save'/);
    expect(invSrc).toContain("$r('#inv-save').innerHTML=`${iconSvg('check',{size:15})} บันทึก`;");
    expect(invSrc).toContain("$r('#inv-save').innerHTML=`${iconSvg('save',{size:15})} บันทึกการแก้ไข`;");

    const symSrc = readSrc('src/symptoms.js');
    expect(symSrc).toMatch(/id="s-save"[^>]*>.*iconSvg\('check'/);
    expect(symSrc).toMatch(/id="skin-save"[^>]*>.*iconSvg\('check'/);
    expect(symSrc).toMatch(/id="s-del" class="btn btn-ghost text-rose-700 border-rose-200[^>]*>.*iconSvg\('trash'/);
    expect(symSrc).toMatch(/id="skin-del" class="btn btn-ghost text-rose-700 border-rose-200[^>]*>.*iconSvg\('trash'/);

    const remSrc = readSrc('src/remindLog.js');
    expect(remSrc).toMatch(/id="rm-cancel"[^>]*>.*iconSvg\('close'/);
    expect(remSrc).toMatch(/id="rm-save"[^>]*>.*iconSvg\('check'/);
    expect(remSrc).toContain("$r('#rm-save').innerHTML = `${iconSvg('save', { size: 15 })} บันทึกการแก้ไข`;");
  });

  it('standardizes workout cancel buttons and inline row-action buttons across workout, profile, and chatWidget', () => {
    const workoutSrc = readSrc('src/workout.js');
    expect(workoutSrc).toMatch(/id="w-tpl-edit-cancel" class="btn btn-ghost btn-sm min-h-\[44px\] mr-auto">\$\{iconSvg\('close'/);
    expect(workoutSrc).toMatch(/id="w-edit-cancel" class="btn btn-ghost hidden mr-auto">\$\{iconSvg\('close'/);
    expect(workoutSrc).toContain('data-imp-rm="${k}:${idx}" class="tm-row-action-btn is-del shrink-0"');
    expect(workoutSrc).toContain('data-rm="${k}:${i}" class="tm-row-action-btn is-del shrink-0"');

    const profileSrc = readSrc('src/profile.js');
    expect(profileSrc).toContain('data-rm="${i}" class="tm-row-action-btn is-del shrink-0"');

    const chatSrc = readSrc('src/chatWidget.js');
    expect(chatSrc).toMatch(/id="nf-n-cancel" class="btn btn-ghost btn-sm min-h-\[44px\]">\$\{iconSvg\('close'/);
    expect(chatSrc).toContain('data-note-edit="${esc(n.id)}" class="tm-row-action-btn"');
    expect(chatSrc).toContain("iconSvg('edit-square', { size: 15 })");
    expect(chatSrc).toContain('data-note-del="${esc(n.id)}" class="tm-row-action-btn is-del"');
    expect(chatSrc).toContain('data-fb-del="${esc(f.id)}" class="tm-row-action-btn is-del shrink-0"');
  });
});
