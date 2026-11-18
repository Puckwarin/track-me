# Track Me — Design System & Shared UI Components

**Team 1 Deliverable** — Design tokens and reusable UI components for all teams.

## Quick Start

Import the UI module in any feature page:

```js
import { card, button, iconButton, input, select, chip, badge, sectionHeader, tabs, emptyState, loadingState, errorState, successInline, openModal, openBottomSheet, toast, chartContainer } from './ui.js';
```

The design tokens CSS is auto-loaded via `src/app.js` — no additional import needed.

## Design Tokens

### Color Palette

| Token | Hex | Role |
|---|---|---|
| `--color-primary-300` | `#8ECDF7` | Baby Blue — Primary soft accent |
| `--color-secondary-300` | `#B39EDB` | Soft Lavender — Secondary accent |
| `--color-accent-300` | `#EDAFC0` | Soft Pink — Gentle highlight |
| `--color-sage-300` | `#94D0B2` | Soft Mint — Activity & positive states |
| `--color-peach-300` | `#F4C39E` | Pastel Peach — Warm category accent |
| `--color-app-bg` | `#F4F8FC` | Ice Mist — Main background (Baby Blue default) |
| `--color-surface` | `#FFFFFF` | Cards and input surfaces |
| `--color-ink` | `#1E293B` | Slate 800 — Primary text |

Each color has a full ramp (50–900). Use semantic tokens (`--color-success`, `--color-error`, etc.) for state colors — they adapt across all themes automatically.

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

### Theme Compatibility

All tokens automatically adapt to 4 themes (`src/theme.js`, `src/design-tokens.css`):
- **Baby Blue** (`baby-blue`, default; legacy `'minimal'` maps here): Ice Mist background (`#F4F8FC`), Baby Blue accents (`#8ECDF7` / `#4A9AD6`), Slate text
- **Pastel** (`pastel`): Soft pink-lavender background (`#FCF6FB`), muted rose/lavender accents
- **Cozy** (`cozy`): Warm cream background (`#FAF6F0`), warm surface (`#FFFDF9`), brown accents (`#C7956D` / `#8B5E3C`)
- **Dark** (`dark`): Deep slate-navy surfaces (`#0F1622` / `#182232`), accessible light text and softened accents

Set theme via `applyTheme('baby-blue' | 'pastel' | 'cozy' | 'dark')` or `document.documentElement.dataset.theme = 'baby-blue' | 'pastel' | 'cozy' | 'dark'`.

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
| `icon` | string | `''` | Lucide icon key in `src/icons.js` (e.g. `'plus'`, `'save'`) |
| `variant` | string | `'primary'` | `primary`, `secondary`, `accent`, `success`, `danger`, `soft`, `ghost` |
| `size` | string | `''` | `''` (default), `'sm'`, `'lg'` |
| `full` | boolean | `false` | Full width |
| `disabled` | boolean | `false` | Disabled state |

```js
button({ label: 'บันทึก', icon: 'save', variant: 'primary', full: true })
// Output renders inline Lucide SVG via iconSvg('save', { size: 16 })
```

### Icon Button

```js
import { iconButton } from './ui.js';

iconButton({ icon, id, variant, size, ariaLabel, active })
```

**CSS class**: `.tm-icon-btn`

| Prop | Type | Default | Description |
|---|---|---|---|
| `icon` | string | `''` | Lucide icon key in `src/icons.js` |
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
- WCAG 2.2 AA contrast verified for text/surface combinations across themes

### Contrast Verification (Default Baby Blue Theme)

| Combination | Foreground / Background | Status |
|---|---|---|
| `--color-ink` on `--color-surface` | `#1E293B` on `#FFFFFF` | Pass (AAA) |
| `--color-ink` on `--color-app-bg` | `#1E293B` on `#F4F8FC` | Pass (AAA) |
| `--color-ink-muted` on `--color-surface` | `#526277` on `#FFFFFF` | Pass (AA) |
| `--color-primary-700` on `--color-primary-50` | `#276594` on `#EFF7FE` | Pass (AA) |
| `--color-success-fg` on `--color-success-bg` | `#22563E` on `#F0FAF4` | Pass (AAA) |
| `--color-error-fg` on `--color-error-bg` | `#8B2F3D` on `#FDF2F4` | Pass (AA) |
| `--color-warning-fg` on `--color-warning-bg` | `#7D421B` on `#FFF8F2` | Pass (AA) |
| `--color-ink` on `--color-primary-300` | `#1E293B` on `#8ECDF7` | Pass (AA) |
| `--color-ink` on `--color-accent-300` | `#1E293B` on `#EDAFC0` | Pass (AA) |

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
- Input font-size: 16px on mobile (prevents iOS auto-zoom)
- Modals: centered on desktop ≥768px, bottom sheet on mobile <768px
- Cards: reduced padding on mobile, `1rem` → `1.5rem` on desktop
- Safe-area insets respected via `env(safe-area-inset-*)`

---

## Files

| File | Purpose |
|---|---|
| `src/design-tokens.css` | Design tokens (colors, spacing, radius, shadows, 4-theme overrides) + component utility classes |
| `src/ui.js` | Shared UI component factory functions (JS → HTML string) and `animateNumberTicker` |
| `src/icons.js` | Central Lucide inline SVG registry (`iconSvg`, `iconBubble`) |
| `src/theme.js` | 4-theme switcher (`baby-blue`, `pastel`, `cozy`, `dark`) + legacy `'minimal'` mapping |
| `docs/DESIGN_SYSTEM.md` | This document |

## Integration Notes

1. **Import CSS**: `src/design-tokens.css` is loaded by `src/app.js` — no manual import needed.
2. **Import components**: `import { ... } from './ui.js'` and `import { iconSvg } from './icons.js'` in any feature module.
3. **Backward compatibility**: Existing `.card`, `.btn`, `.input`, `.chip`, `.modal-backdrop` classes in `style.css` are preserved. New `tm-` prefixed classes are additive — no existing markup breaks.
4. **Theme switching**: Uses `html[data-theme]` attribute (`baby-blue`, `pastel`, `cozy`, `dark`). Tokens in `design-tokens.css` and utilities in `style.css` adapt per theme.
5. **Icons & Styling**: Uses Tailwind CSS v4 (`@tailwindcss/vite`) and tree-shaken `lucide` inline SVGs (`src/icons.js`); UI markup does not depend on FontAwesome webfonts.

## Known Limitations

- `tm-` classes are additive to the existing `style.css` system; full migration to `tm-` only is a future task.
- Chart container is a layout wrapper only — SVG content is generated by feature teams.
- No JS framework; components return HTML strings, not DOM objects. Use `innerHTML` to mount.
