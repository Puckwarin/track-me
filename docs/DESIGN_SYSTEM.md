# Track Me — Design System & Shared UI Components

**Team 1 Deliverable** — Design tokens and reusable UI components for all teams.

## Quick Start

Import the UI module in any feature page:

```js
import { card, button, iconButton, input, select, chip, badge, sectionHeader, tabs, emptyState, loadingState, errorState, successInline, openModal, openBottomSheet, toast, chartContainer } from './ui.js';
```

The design tokens CSS is auto-loaded via `src/app.js` — no additional import needed.

## Design Tokens

### Pastel Blue-Primary Palette (v6.1.0)

| Token | Hex | Role |
|---|---|---|
| `--color-brand` | `#4A90D4` | Pastel Sky Blue — Primary buttons, toggles, active highlights & accents |
| `--color-brand-strong` | `#377BBF` | Hover/Pressed primary blue |
| `--color-mint` | `#CBE5FC` | Soft Pastel Sky — Active Navigation & subtle pills |
| `--color-mint-soft` | `#DCEFFD` | Hover & soft accent surfaces |
| `--color-app-bg` | `#EAF3FD` | Airy Pastel Blue — Main app background |
| `--color-surface` | `#FFFFFF` | Cards and input surfaces |
| `--color-ink` | `#194971` | Deep Slate Blue — High-contrast primary text |

Use semantic tokens for shared UI colors. The app uses one fixed Pastel Blue-Primary palette, and all brand logo marks (login, header, mobile bottom navigation `.nav-plus--logo`, onboarding, dashboard welcome mark, and PWA app icons) share the login logo sky-blue palette (`#e1f5fe` bubble, `#b3e5fc` border/shadow, `#03a9f4` icon); users cannot switch themes or category colors. Checkboxes and radio controls across forms and modals use `accent-brand` consistently.

Shared chart, control, and layout patterns:
- Donut Chart (`src/donutChart.js` + `bindChartInspector` in `src/ui.js`) scales meal arcs relative to `targetKcal` (`mealSlicesToSegments`), shows center `%` labels, and triggers collision-aware floating tooltips (`.tm-chart-float-tip` via `computeTooltipPosition()`). Home (`src/home.js`) and Food (`src/food.js`) both attach `bindChartInspector(..., { showReadout: false })` without below-ring legend pills or hint bars, paired identically with 4 macro tiles: Protein, Carbs (`"คาร์บ"`), Fat, and combined Sugar · Sodium (`"น้ำตาล · โซเดียม"`, showing `Xg · Ymg` and `"เฉพาะรายการที่ระบุ"`), laid out 2×2 on desktop (`>= 1024px`).
- Form controls (`.input`, `select`, text/number/date/time `input`, `textarea`, `.tm-input`, `.tm-select`) use `0.875rem` (`min-height: 2.5rem`) on desktop (`>= 768px`) to match `.btn` typography, and `16px` (`min-height: 2.75rem`) on mobile (`<= 767px`) to prevent iOS Safari auto-zoom without locking `maximum-scale=1` (pinch-to-zoom remains enabled).
- Quick favorite chip strip (`.tm-fav-strip`, `.tm-fav-chip`) caps visible quick items to 5 on `< 1024px` and 10 on desktop.
- Collapsible section toggle `.pl-collapse-btn` is reused in Weekly Planner (`src/home.js`) and Settings (`src/settings.js`).
- Desktop (`>= 1024px`) list/table actions use `.tm-row-action-btn` while mobile (`< 1024px`) preserves `bindSwipeRows()` swipe gestures; mobile lists with swipe actions display `.tm-swipe-hint` (hidden automatically at `>= 1024px` and when empty) across `symptoms.js`, `expense.js`, `care.js`, `inventory.js`, `remindLog.js`, `workout.js`, `period.js`, `body.js`, and `lab.js`.
- Mobile submenus (`#subnav` `.hx-cat`/`.sub-tile` with icon-only `.hx-cat-icon` frame and no outer card border around the label, plus `.sub-chip`), dashboard controls (`.db-range`, `.db-refresh`), workout tabs (`.wa-sec-tab`), and segmented controls (`.tm-seg` / `.tm-seg-btn`) use compact mobile sizing (`<= 767px`), and `.tm-seg--3`/`.tm-seg--4` switch to non-wrapping horizontal scroll at `< 640px` to prevent narrow-screen overflow.
- Desktop navigation elevates **`ประวัติ & รายงาน`** (`overview`, merging monthly `dashboard.js` and `weekly.js` summaries with top segmented toggle to `รายงาน PDF / CSV`) to a top-level item right after **`หน้าหลัก`**, keeping **`สุขภาพ`** focused on daily logging (`workout`, `period`, `symptoms`, `body`). Mobile bottom navigation (`#bottom-nav`, `< 768px`) keeps 5 slots (`หน้าหลัก`, `อาหาร`, brand quick-add sheet `#quick-sheet` with 3×3 quick categories plus a `ประวัติ & รายงาน` shortcut, `ออกกำลัง` via `data-nav="health"` so all Health subtabs stay active, and `ดูแล` via `data-nav="care"`), while surfacing `รายรับ-รายจ่าย` (`expense`) inside the `ดูแล` `#subnav` tiles, clickable Home summary KPI cards (`[data-page-go]`), and configurable `#home-shortcuts` on Home.
- Full-width responsive containers remove artificial desktop `max-width` caps on `.db-page`, `#reminder-banner`, `.preview-banner-inner`, and `#ex-panel-log`, using `.db-charts-grid` (2 columns at `>= 768px`), 2-column desktop layouts (`lg:grid-cols-2` / `lg:grid-cols-5`) in `body.js`, `symptoms.js`, `settings.js`, `expense.js` (`#ex-panel-log`), and `care.js` (`#care-panel-care`, `#care-panel-symptoms`), alongside explicit `label[for]` / `aria-label` associations on form inputs (`expense.js`, `care.js`, `inventory.js`, `lab.js`, `settings.js`, `profile.js`).
- Horizontal multi-week scrollable date strip (`.tm-week-strip`, `.tm-day-pill`, `.tm-day-meta`) and unified week navigator bar (`.pl-week-nav` via `buildWeekStripRange()`, `centerStripPill()`, and `weekNavBarHtml()` in `src/ui.js`) share identical appearance, right-aligned header placement above the strip, `"วันนี้"` (`aria-label="กลับไปวันนี้"`) reset behavior without week arrows (`showArrows: false`), and automatic center-today positioning on entry across Home Weekly Planner (`src/planner.js`), Food (`src/food.js`), and Workout (`src/workout.js`).
- Weekly Planner (`src/planner.js`) and Workout Next-Day Recovery (`src/workout.js`) render immediate inline feedback (`.pl-feedback-pill`, `.pl-feedback-flash`) plus contextual `toast(...)` and double-tap locks during edits, saves, moves, and recovery toggles.
- All interactive controls — modal close buttons (`min-w-[44px] min-h-[44px]`), filter/preset chips, inline edit/delete actions, checkboxes/radios with `<label>`, and drawer icon buttons — follow the minimum `>= 44px` touch target standard (`px` units on `<= 767px` so targets remain `>= 44px` regardless of `14px`/`13.5px` root font scaling across `chatWidget.js`, `reminders.js`, `remindLog.js`, `reports.js`, `hiwpinto.js`, `expense.js`, `care.js`, `inventory.js`, `workout.js`, `workoutActive.js`, `foodHistory.js`, `planner.js`, `period.js`, `lab.js`, `settings.js`, `profile.js`, `backup.js`).
- Layering, backdrops, and contrast (`v6.1.0`): `.modal-backdrop` and `.tm-modal-backdrop` use unified Navy backdrop opacity (`rgb(25 73 113 / ...)`) and `z-index: 85` (above `.sheet-backdrop` `60`, `.ai-chat-drawer` `75`, and `.tm-chart-float-tip` `80`, below `#app-lock` `120` and `.toast` `130`); `Escape` handling targets only the topmost open modal so underlying sheets/drawers stay intact; `.modal-box.is-flush` caps height at `min(90dvh, 56rem)` only on desktop (`>= 641px`) while preserving `94dvh` on mobile; `.tm-select` chevron uses `#4A90D4`; and period calendar cells pair `.cal-period` (`#5E1727` bold on `#F898A4`) with `#194971` `.cal-sel` focus outlines for high readability.

### State Colors

| Token | Usage |
|---|---|
| `--color-success` / `--color-success-fg` / `--color-success-bg` | Positive states, confirmations |
| `--color-warning` / `--color-warning-fg` / `--color-warning-bg` | Cautions, budget warnings |
| `--color-error` / `--color-error-fg` / `--color-error-bg` | Errors, destructive actions |
| `--color-info` / `--color-info-fg` / `--color-info-bg` | Informational badges |

### Spacing

8px base scale: `--space-1` (4px) through `--space-20` (80px).

### Border Radius

`--radius-sm` (0.5rem) · `--radius-md` (0.75rem) · `--radius-lg` (1rem) · `--radius-xl` (1.25rem) · `--radius-2xl` (1.5rem) · `--radius-3xl` (2rem) · `--radius-full`

### Shadows

`--shadow-sm` · `--shadow-md` · `--shadow-lg` · `--shadow-xl` · `--shadow-focus`

### Touch Target

`--touch-min` = 2.75rem (44px) — all interactive components meet this minimum.

### Semantic Tokens

`src/design-tokens.css` defines the single Pastel Blue-Primary palette and reusable tokens for app background, surfaces, text, borders, brand blues, and sky active states. Success, Warning, Error, and Info remain semantic state tokens and should only be used for their respective states.

---

## Components

### Card

```js
import { card } from './ui.js';

// Returns an HTML string
card({ className: '', compact: false, flat: false, raised: false, id: '' })
```

**CSS class**: `.tm-card` (add `.tm-card-compact`, `.tm-card-flat`, `.tm-card-raised`)

| Prop | Type | Default | Description |
|---|---|---|---|
| `className` | string | `''` | Additional classes |
| `compact` | boolean | `false` | Reduced padding |
| `flat` | boolean | `false` | No shadow |
| `raised` | boolean | `false` | Larger shadow |
| `id` | string | `''` | Element ID |

```js
// Usage with innerHTML
const el = document.createElement('div');
el.innerHTML = card() + '<p>Content</p>';
```

Or use CSS directly: `<div class="tm-card">...</div>`

### Button

```js
import { button } from './ui.js';

button({ label, icon, variant, size, full, id, type, disabled, ariaLabel })
```

**CSS class**: `.tm-btn` + `.tm-btn-{variant}`

| Prop | Type | Default | Options |
|---|---|---|---|
| `label` | string | `''` | Button text |
| `icon` | string | `''` | Phosphor Regular icon key in `src/icons.js` (e.g. `'plus'`, `'save'`) |
| `variant` | string | `'primary'` | `primary`, `secondary`, `accent`, `success`, `danger`, `soft`, `ghost` |
| `size` | string | `''` | `''` (default), `'sm'`, `'lg'` |
| `full` | boolean | `false` | Full width |
| `disabled` | boolean | `false` | Disabled state |

```js
button({ label: 'บันทึก', icon: 'save', variant: 'primary', full: true })
// Output renders inline Phosphor Regular SVG via iconSvg('save', { size: 16 })
```

### Icon Button

```js
import { iconButton } from './ui.js';

iconButton({ icon, id, variant, size, ariaLabel, active })
```

**CSS class**: `.tm-icon-btn`

| Prop | Type | Default | Description |
|---|---|---|---|
| `icon` | string | `''` | Phosphor Regular icon key in `src/icons.js` |
| `size` | string | `''` | `''` or `'sm'` (2.25rem) |
| `active` | boolean | `false` | Active/selected state |

### Input

```js
import { input } from './ui.js';

input({ id, type, placeholder, value, label, error, ariaLabel })
```

**CSS class**: `.tm-input` (add `.tm-input-error` for error state)

| Prop | Type | Default | Description |
|---|---|---|---|
| `type` | string | `'text'` | HTML input type |
| `label` | string | `''` | Renders a `.tm-label` above the input |
| `error` | boolean | `false` | Red border for validation errors |

```js
input({ id: 'food-name', label: 'ชื่อเมนู', placeholder: 'เช่น ข้าวมันไก่' })
```

### Select

```js
import { select } from './ui.js';

select({ id, options, label, ariaLabel })
```

**CSS class**: `.tm-select`

| Prop | Type | Description |
|---|---|---|
| `options` | array | `['value1', ...]` or `[{ value, label, selected }]` |

```js
select({
  id: 'meal-type',
  label: 'มื้ออาหาร',
  options: [
    { value: 'breakfast', label: 'เช้า' },
    { value: 'lunch', label: 'กลางวัน', selected: true },
    { value: 'dinner', label: 'เย็น' }
  ]
})
```

### Chip

```js
import { chip } from './ui.js';

chip({ label, icon, variant, id })
```

**CSS class**: `.tm-chip` + `.tm-chip-{variant}`

| Prop | Type | Default | Options |
|---|---|---|---|
| `variant` | string | `'default'` | `default`, `primary`, `secondary`, `accent`, `success`, `warning`, `error` |

### Badge

```js
import { badge } from './ui.js';

badge({ label, variant, dot })
```

**CSS class**: `.tm-badge` + `.tm-badge-{variant}`

| Prop | Type | Default | Options |
|---|---|---|---|
| `variant` | string | `'info'` | `success`, `warning`, `error`, `info` |
| `dot` | boolean | `false` | Shows a colored dot before label |

```js
badge({ label: 'เกินงบ', variant: 'error', dot: true })
```

### Section Header

```js
import { sectionHeader } from './ui.js';

sectionHeader({ title, icon, subtitle })
```

**CSS class**: `.tm-section-header`

```js
sectionHeader({ title: 'สรุปรายสัปดาห์', icon: 'weekly', subtitle: '11–17 พ.ย. 2026' })
```

### Tabs

```js
import { tabs } from './ui.js';

tabs({ items, activeIndex, containerId })
```

**CSS class**: `.tm-tabs` / `.tm-tab`

| Prop | Type | Description |
|---|---|---|
| `items` | array | `[{ label, icon }]` |
| `activeIndex` | number | Index of active tab (0-based) |
| `containerId` | string | ID for the container div |

Tabs emit `data-tab-index` on each button. Listen for clicks:

```js
const tabsHtml = tabs({ items: [{ label: 'วัน' }, { label: 'สัปดาห์' }], activeIndex: 0 });
container.innerHTML = tabsHtml;
container.querySelectorAll('[data-tab-index]').forEach(btn => {
  btn.addEventListener('click', () => {
    const idx = parseInt(btn.dataset.tabIndex);
    // switch view
  });
});
```

### Empty State

```js
import { emptyState } from './ui.js';

emptyState({ icon, title, description })
```

**CSS class**: `.tm-empty`

```js
emptyState({ icon: 'food', title: 'ยังไม่มีมื้ออาหารวันนี้', description: 'กดปุ่ม + เพื่อเพิ่มมื้อแรก' })
```

### Loading State

```js
import { loadingState } from './ui.js';

loadingState({ label })
```

**CSS class**: `.tm-loading` / `.tm-spinner`

```js
loadingState({ label: 'กำลังโหลดข้อมูล…' })
```

### Error State

```js
import { errorState } from './ui.js';

errorState({ message, icon })
```

**CSS class**: `.tm-error`

### Success Inline

```js
import { successInline } from './ui.js';

successInline({ message })
```

**CSS class**: `.tm-success-inline`

### Modal (Programmatic)

```js
import { openModal } from './ui.js';

const { el, close, box } = openModal(innerHtml, { size, flush, staticBackdrop });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `size` | string | `''` | `''`, `'lg'` (42rem), `'xl'` (64rem) |
| `flush` | boolean | `false` | No padding, flex column — for full-height content |
| `staticBackdrop` | boolean | `false` | Prevent close on backdrop click |

- Returns `{ el, close, box }`
- Sets `role="dialog"`, `aria-modal="true"`, auto-wires `aria-labelledby` from the first heading (or `aria-label` fallback), and traps Tab focus via `trapFocus()` (`src/util.js`)
- Auto-closes on Escape (unless `staticBackdrop` / `closeOnEscape: false`) and backdrop click, and returns focus to the trigger element on close
- Elements with `[data-close]` auto-close the modal

```js
const { close } = openModal(`
  <h3 class="tm-section-header">ยืนยันการลบ</h3>
  <p>ต้องการลบรายการนี้ใช่ไหม?</p>
  <div class="flex gap-2 justify-end">
    <button class="tm-btn tm-btn-ghost" data-close>ยกเลิก</button>
    <button class="tm-btn tm-btn-danger" id="confirm-delete">ลบ</button>
  </div>
`, { staticBackdrop: true });

document.getElementById('confirm-delete')?.addEventListener('click', () => {
  // perform delete
  close();
});
```

### Bottom Sheet (Programmatic)

```js
import { openBottomSheet } from './ui.js';

const { el, close, panel } = openBottomSheet(innerHtml);
```

- Slides up from bottom on mobile, centered on desktop
- Sets `role="dialog"`, `aria-modal="true"`, auto-wires `aria-labelledby`, traps Tab focus via `trapFocus()`, and returns focus to the trigger element on close
- Auto-closes on Escape and backdrop click
- Elements with `[data-close]` auto-close

### Toast

```js
import { toast } from './ui.js';

toast(message, kind)
```

| Param | Type | Options |
|---|---|---|
| `message` | string | Toast text |
| `kind` | string | `'ok'` (green), `'err'` (red), `'warn'` (peach) |

Auto-dismisses after 3.2 seconds.

### Chart Container

```js
import { chartContainer } from './ui.js';

chartContainer({ svgContent, legend, id })
```

| Prop | Type | Description |
|---|---|---|
| `svgContent` | string | Raw SVG markup |
| `legend` | array | `[{ label, variant }]` — renders legend items with colored dots |
| `id` | string | Container ID |

```js
chartContainer({
  svgContent: '<svg viewBox="0 0 340 170">...</svg>',
  legend: [{ label: 'น้ำหนัก', variant: 'info' }, { label: 'เป้าหมาย', variant: 'success' }]
})
```

### Number Ticker

```js
import { animateNumberTicker } from './ui.js';

animateNumberTicker(el, targetValue, { decimals: 0, prefix: '', suffix: '', duration: 380 });
```

Animates numeric KPI updates smoothly via `requestAnimationFrame`, respects `prefers-reduced-motion: reduce`, and formats numbers using Thai locale (`th-TH`).

---

## Accessibility

- All interactive elements have `min-height: 2.75rem` (44px touch target)
- Focus-visible outline on all interactive elements
- `aria-label` supported on all button/icon components
- Modals/sheets/drawers: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Tab focus trapping (`trapFocus`), Escape-to-close, and trigger focus restoration
- Screen-reader-only utility: `.tm-sr-only`
- Color is never the sole indicator — badges include icons or dots
- Use charcoal text on neutral/mint surfaces and the dedicated foreground token on status backgrounds; do not use color alone to convey state

### Contrast Pairing

| Surface | Foreground |
|---|---|
| `--color-surface`, `--color-app-bg`, `--color-mint-soft` | `--color-ink` |
| `--color-success-bg` | `--color-success-fg` |
| `--color-warning-bg` | `--color-warning-fg` |
| `--color-error-bg` | `--color-error-fg` |

---

## Responsive Breakpoints

| Breakpoint | Width | Usage |
|---|---|---|
| `--bp-xs` | 380px | Small phones (iPhone SE) |
| `--bp-sm` | 640px | Large phones, small tablets |
| `--bp-md` | 768px | Tablets |
| `--bp-lg` | 1024px | Small desktops |
| `--bp-xl` | 1280px | Standard desktops |
| `--bp-2xl` | 1440px | Large desktops |
| `--bp-3xl` | 1920px | Wide screens |

Key responsive behaviors:
- Input font-size: `16px` (`1rem`) on mobile `<= 767px` (prevents iOS Safari auto-zoom while preserving user pinch-to-zoom) and `0.875rem` on desktop `>= 768px`
- Mobile interactive targets (`<= 767px`): `min-height: 44px` enforced in `px` across `.btn`, `.chip`, `.sub-chip`, `.tm-chip`, `.tm-tab`, `.tm-seg-btn`, `.db-range`, `.db-refresh`, `.wa-sec-tab`, `.icon-btn`, `.tm-icon-btn`, and form inputs
- Modals: centered on desktop `>= 641px` (`.modal-box.is-flush` capped at `min(90dvh, 56rem)`), bottom sheet / `94dvh` flush dialog on mobile `<= 640px`
- Cards: reduced padding on mobile, `1rem` → `1.5rem` on desktop
- Safe-area insets respected via `env(safe-area-inset-*)`

## Icons (Offline 100%)

- **Phosphor Regular (`src/icons.js`)**: ใช้สำหรับไอคอนทุกส่วนทั้งแอป เมนูหลัก, การ์ดหมวดหมู่, แท็บย่อย, แผ่นบันทึกด่วน และหน้าตั้งค่า (`@phosphor-icons/core/assets/regular/*.svg?raw`) แบบ tree-shaken รองรับ `currentColor` และ alias `fa-*`
  - แกลเลอรีหลัก (เลือกน้ำหนัก **Regular**): <https://phosphoricons.com/> หรือ <https://icon-sets.iconify.design/ph/>

---

## Files

| File | Purpose |
|---|---|
| `src/design-tokens.css` | Pastel Blue-Primary semantic tokens (colors, spacing, radius, shadows) + component utility classes |
| `src/ui.js` | Shared UI component factory functions (JS → HTML string), `bindChartInspector`, `bindSwipeRows`, and `animateNumberTicker` |
| `src/icons.js` | Central Phosphor Regular inline SVG registry (`iconSvg`, `iconBubble`, `hydrateStaticIcons`) |
| `docs/DESIGN_SYSTEM.md` | This document |

## Integration Notes

1. **Import CSS**: `src/design-tokens.css` is loaded by `src/app.js` — no manual import needed.
2. **Import components**: `import { ... } from './ui.js'` and `import { iconSvg } from './icons.js'` in any feature module.
3. **Backward compatibility**: Existing `.card`, `.btn`, `.input`, `.chip`, `.modal-backdrop` classes in `style.css` are preserved. New `tm-` prefixed classes are additive — no existing markup breaks.
4. **Brand colors**: There is no theme switcher. Use the fixed semantic tokens in `design-tokens.css`; reserve Success, Warning, Error, and Info tokens for their state meanings.
5. **Icons & Styling**: Uses Tailwind CSS v4 (`@tailwindcss/vite`) and tree-shaken **Phosphor Regular** inline SVGs (`@phosphor-icons/core` via `src/icons.js`); UI markup works 100% offline with zero external CDN webfonts.

## Known Limitations

- `tm-` classes are additive to the existing `style.css` system; full migration to `tm-` only is a future task.
- Chart container is a layout wrapper only — SVG content is generated by feature teams.
- No JS framework; components return HTML strings, not DOM objects. Use `innerHTML` to mount.
