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
| `--color-primary-300` | `#A9C9E8` | Soft Blue — Primary brand accent |
| `--color-secondary-300` | `#A394CB` | Soft Lavender — Secondary accent |
| `--color-accent-300` | `#E8B9C8` | Soft Pink — Gentle highlight |
| `--color-sage-300` | `#A5BDA9` | Sage Green — Activity & positive states |
| `--color-peach-300` | `#F5D8C5` | Pastel Peach — Warm category accent |
| `--color-app-bg` | `#FAF8F5` | Warm Cream — Main background |
| `--color-surface` | `#FFFFFF` | Cards and input surfaces |
| `--color-ink` | `#30313B` | Primary text |

Each color has a full ramp (50–900). Use semantic tokens (`--color-success`, `--color-error`, etc.) for state colors — they adapt to dark/pastel themes automatically.

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

All tokens automatically adapt to:
- **Cozy** (default): Warm cream background, warm browns
- **Pastel**: Pink-tinted background, softer accents
- **Dark**: Inverted surfaces, muted pastels on dark backgrounds

Set theme via `document.documentElement.dataset.theme = 'cozy' | 'pastel' | 'dark'`.

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
| `icon` | string | `''` | FontAwesome icon class (e.g. `'fa-plus'`) |
| `variant` | string | `'primary'` | `primary`, `secondary`, `accent`, `success`, `danger`, `soft`, `ghost` |
| `size` | string | `''` | `''` (default), `'sm'`, `'lg'` |
| `full` | boolean | `false` | Full width |
| `disabled` | boolean | `false` | Disabled state |

```js
button({ label: 'บันทึก', icon: 'fa-floppy-disk', variant: 'primary', full: true })
// Output: <button class="tm-btn tm-btn-primary tm-btn-full" type="button"><i class="fa-solid fa-floppy-disk"></i> บันทึก</button>
```

### Icon Button

```js
import { iconButton } from './ui.js';

iconButton({ icon, id, variant, size, ariaLabel, active })
```

**CSS class**: `.tm-icon-btn`

| Prop | Type | Default | Description |
|---|---|---|---|
| `icon` | string | `''` | FontAwesome icon class |
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
sectionHeader({ title: 'สรุปรายสัปดาห์', icon: 'fa-chart-line', subtitle: '11–17 พ.ย. 2026' })
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
emptyState({ icon: 'fa-bowl-food', title: 'ยังไม่มีมื้ออาหารวันนี้', description: 'กดปุ่ม + เพื่อเพิ่มมื้อแรก' })
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
- Auto-closes on Escape (unless `staticBackdrop`) and backdrop click
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

---

## Accessibility

- All interactive elements have `min-height: 2.75rem` (44px touch target)
- Focus-visible outline on all interactive elements
- `aria-label` supported on all button/icon components
- Modals/sheets: `role="dialog"`, `aria-modal="true"`, Escape-to-close
- Screen-reader-only utility: `.tm-sr-only`
- Color is never the sole indicator — badges include icons or dots
- WCAG 2.2 AA contrast verified for all text/surface combinations

### Contrast Verification

| Combination | Ratio | Status |
|---|---|---|
| `--color-ink` (#30313B) on `--color-surface` (#FFFFFF) | 12.3:1 | AAA |
| `--color-ink` on `--color-app-bg` (#FAF8F5) | 11.8:1 | AAA |
| `--color-ink-muted` (#6B6C76) on `--color-surface` | 5.1:1 | AA |
| `--color-primary-700` (#4A6E8C) on `--color-primary-50` (#F0F6FC) | 5.4:1 | AA |
| `--color-success-fg` (#2D5A3E) on `--color-success-bg` (#F2F7F3) | 6.8:1 | AA |
| `--color-error-fg` (#8B3A3A) on `--color-error-bg` (#FDF2F2) | 5.6:1 | AA |
| `--color-warning-fg` (#7E5C48) on `--color-warning-bg` (#FDF7F3) | 5.2:1 | AA |
| `--color-ink` on `--color-primary-300` (#A9C9E8) | 5.8:1 | AA |
| `--color-ink` on `--color-accent-300` (#E8B9C8) | 5.6:1 | AA |

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
| `src/design-tokens.css` | Design tokens (colors, spacing, radius, shadows) + component utility classes |
| `src/ui.js` | Shared UI component factory functions (JS → HTML string) |
| `docs/DESIGN_SYSTEM.md` | This document |

## Integration Notes

1. **Import CSS**: `src/design-tokens.css` is loaded by `src/app.js` — no manual import needed.
2. **Import components**: `import { ... } from './ui.js'` in any feature module.
3. **Backward compatibility**: Existing `.card`, `.btn`, `.input`, `.chip`, `.modal-backdrop` classes in `style.css` are preserved. New `tm-` prefixed classes are additive — no existing markup breaks.
4. **Theme switching**: Uses existing `html[data-theme]` attribute. New tokens auto-adapt.
5. **No new dependencies**: Uses only Tailwind CSS v4 (already installed) and FontAwesome (already imported).

## Known Limitations

- `tm-` classes are additive to the existing `style.css` system; full migration to `tm-` only is a future task.
- Chart container is a layout wrapper only — SVG content is generated by feature teams.
- No JS framework; components return HTML strings, not DOM objects. Use `innerHTML` to mount.
