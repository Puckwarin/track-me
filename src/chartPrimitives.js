/* ============================================================
   Track Me — Shared Token-Driven SVG Chart Primitives
   ============================================================ */

import { esc } from './util.js';

export function cssToken(name, fallback = '') {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined' || !document?.documentElement) {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name)?.trim();
  return value || fallback;
}

export function getChartPalette() {
  return {
    brand: cssToken('--color-brand', '#4A90D4'),
    brandDark: cssToken('--color-brand-dark', '#194971'),
    brandStrong: cssToken('--color-brand-strong', '#377BBF'),
    brandSoft: cssToken('--color-primary-300', '#CBE5FC'),
    primary400: cssToken('--color-primary-400', '#A8D0EF'),
    lavSoft: cssToken('--color-lav-soft', '#DCE6FB'),
    success: cssToken('--color-success', '#217A68'),
    successFg: cssToken('--color-success-fg', '#145245'),
    warning: cssToken('--color-warning', '#C58F1E'),
    error: cssToken('--color-error', '#C95B72'),
    errorFg: cssToken('--color-error-fg', '#86263C'),
    axis: cssToken('--color-ink-muted', '#4E6E8E'),
    axisSubtle: cssToken('--color-ink-subtle', '#6986A3'),
    trackEmpty: cssToken('--color-divider', '#E3ECF7')
  };
}

function formatChartNumber(v, decimals = 0) {
  return decimals === 0 ? Math.round(v).toLocaleString() : Number(v).toFixed(decimals);
}

export function lineChartSvg({
  data = [],
  labelKey = 'label',
  valueKey = 'value',
  color,
  unit = '',
  decimals = 0,
  ariaLabel = 'กราฟแนวโน้ม',
  emptyText = 'ยังไม่มีข้อมูล',
  minPoints = 1,
  width = 340,
  height = 170,
  pad = 36,
  dotRadius = 3.6,
  strokeWidth = 2.4,
  xRatio,
  xAxisMode = 'all',
  xLabelFormatter,
  tipFormatter,
  subFormatter
} = {}) {
  const palette = getChartPalette();
  const strokeColor = color || palette.brandDark;
  const indexedPts = data
    .map((d, idx) => ({ d, idx, val: d?.[valueKey] }))
    .filter(p => typeof p.val === 'number' && Number.isFinite(p.val));

  if (indexedPts.length < minPoints) {
    return `<p class="text-xs text-slate-500">${esc(emptyText)}</p>`;
  }

  const vals = indexedPts.map(p => p.val);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 1) {
    min = Math.max(0, min - 0.5);
    max += 0.5;
  }

  const n = data.length;
  const xAt = (item, idx) => {
    if (typeof xRatio === 'function') {
      const ratio = xRatio(item, idx, data);
      return pad + ratio * (width - 2 * pad);
    }
    return pad + (n <= 1 ? (width - 2 * pad) / 2 : (idx / (n - 1)) * (width - 2 * pad));
  };
  const yAt = v => height - pad - ((v - min) / (max - min || 1)) * (height - 2 * pad);

  const line = indexedPts
    .map(({ d, idx, val }) => `${xAt(d, idx).toFixed(1)},${yAt(val).toFixed(1)}`)
    .join(' ');

  const dots = indexedPts.map(({ d, idx, val }) => {
    const cx = xAt(d, idx).toFixed(1);
    const cy = yAt(val).toFixed(1);
    const rawLabel = typeof xLabelFormatter === 'function' ? xLabelFormatter(d, idx) : String(d?.[labelKey] ?? '');
    const valStr = `${formatChartNumber(val, decimals)}${unit ? ` ${unit}` : ''}`;
    const tipText = typeof tipFormatter === 'function' ? tipFormatter(d, valStr, idx) : `${rawLabel}: ${valStr}`;
    const subText = typeof subFormatter === 'function' ? subFormatter(d, idx) : '';
    return `<g>
      <circle cx="${cx}" cy="${cy}" r="${dotRadius}" fill="${strokeColor}"></circle>
      <circle cx="${cx}" cy="${cy}" r="11" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(tipText)}"${subText ? ` data-chart-sub="${esc(subText)}"` : ''} data-chart-color="${esc(strokeColor)}" aria-label="${esc(tipText)}"><title>${esc(tipText)}</title></circle>
    </g>`;
  }).join('');

  let xLabelsHtml = '';
  if (xAxisMode === 'ends' && data.length >= 2) {
    const first = data[0];
    const last = data[data.length - 1];
    const firstLabel = typeof xLabelFormatter === 'function' ? xLabelFormatter(first, 0) : String(first?.[labelKey] ?? '');
    const lastLabel = typeof xLabelFormatter === 'function' ? xLabelFormatter(last, data.length - 1) : String(last?.[labelKey] ?? '');
    xLabelsHtml = `<text x="${pad}" y="${height - 6}" font-size="10" fill="${palette.axis}">${esc(firstLabel)}</text>
      <text x="${width - pad}" y="${height - 6}" font-size="10" fill="${palette.axis}" text-anchor="end">${esc(lastLabel)}</text>`;
  } else {
    xLabelsHtml = data.map((d, idx) => {
      const lbl = typeof xLabelFormatter === 'function' ? xLabelFormatter(d, idx) : String(d?.[labelKey] ?? '');
      return `<text x="${xAt(d, idx).toFixed(1)}" y="${height - 6}" font-size="9.5" fill="${palette.axisSubtle}" text-anchor="middle">${esc(lbl)}</text>`;
    }).join('');
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" role="img" aria-label="${esc(ariaLabel)}">
    ${indexedPts.length >= 2 ? `<polyline points="${line}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${dots}
    <text x="4" y="${(yAt(max) + 4).toFixed(1)}" font-size="9.5" fill="${palette.axis}">${esc(formatChartNumber(max, decimals))}</text>
    <text x="4" y="${(yAt(min) + 4).toFixed(1)}" font-size="9.5" fill="${palette.axis}">${esc(formatChartNumber(min, decimals))}</text>
    ${xLabelsHtml}
  </svg>`;
}

export function barChartSvg({
  data = [],
  labelKey = 'label',
  valueKey = 'value',
  color,
  barColorFn,
  unit = '',
  decimals = 0,
  ariaLabel = 'กราฟแท่ง',
  emptyText = 'ยังไม่มีข้อมูล',
  width = 340,
  height = 170,
  padL = 36,
  padR = 20,
  padT = 16,
  padB = 34,
  targetValue = null,
  targetLabel = '',
  targetColor,
  showYAxis = true,
  tipFormatter,
  subFormatter,
  xLabelFilter,
  xLabelFormatter
} = {}) {
  const palette = getChartPalette();
  const baseColor = color || palette.brandDark;
  const hasPositive = data.some(d => Number(d?.[valueKey]) > 0);
  if (!hasPositive) {
    return `<p class="text-xs text-slate-500">${esc(emptyText)}</p>`;
  }

  const maxRaw = Math.max(
    ...data.map(d => Number(d?.[valueKey]) || 0),
    targetValue ? Number(targetValue) * 1.15 : 0,
    1
  );
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = Math.max(1, data.length);
  const slotW = plotW / n;
  const gap = n > 14 ? Math.min(2, slotW * 0.2) : Math.min(8, slotW * 0.24);
  const barW = Math.max(1.5, slotW - gap);
  const yAt = v => padT + plotH - (Math.max(0, v) / maxRaw) * plotH;
  const zeroY = yAt(0);

  const barsHtml = data.map((d, i) => {
    const v = Number(d?.[valueKey]) || 0;
    const bx = padL + i * slotW + gap / 2;
    const by = yAt(v);
    const bh = Math.max(0, zeroY - by);
    const fill = v > 0
      ? (typeof barColorFn === 'function' ? barColorFn(d, i, palette) : baseColor)
      : palette.trackEmpty;
    const rawLabel = typeof xLabelFormatter === 'function' ? xLabelFormatter(d, i) : String(d?.[labelKey] ?? '');
    const valStr = `${formatChartNumber(v, decimals)}${unit ? ` ${unit}` : ''}`;
    const tipText = typeof tipFormatter === 'function'
      ? tipFormatter(d, valStr, i)
      : `${rawLabel}: ${v > 0 ? valStr : 'ไม่มีข้อมูล'}`;
    const subText = typeof subFormatter === 'function' ? subFormatter(d, i) : '';
    const tipColor = v > 0 ? fill : palette.axisSubtle;
    const showX = typeof xLabelFilter === 'function' ? xLabelFilter(d, i, n) : true;
    const rx = barW < 5 ? 1.5 : 3;

    return `<g>
      <rect x="${bx.toFixed(1)}" y="${(v > 0 ? by : zeroY - 2).toFixed(1)}" width="${barW.toFixed(1)}" height="${(v > 0 ? bh : 2).toFixed(1)}" rx="${rx}" fill="${fill}" opacity="${v > 0 ? '0.9' : '0.65'}"></rect>
      <rect x="${(padL + i * slotW).toFixed(1)}" y="${padT}" width="${Math.max(slotW, 8).toFixed(1)}" height="${plotH}" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(tipText)}"${subText ? ` data-chart-sub="${esc(subText)}"` : ''} data-chart-color="${esc(tipColor)}" aria-label="${esc(rawLabel)} ${esc(valStr)}"><title>${esc(tipText)}</title></rect>
      ${showX ? `<text x="${(bx + barW / 2).toFixed(1)}" y="${height - 7}" font-size="9.5" fill="${palette.axisSubtle}" text-anchor="middle">${esc(rawLabel)}</text>` : ''}
    </g>`;
  }).join('');

  let targetHtml = '';
  if (typeof targetValue === 'number' && Number.isFinite(targetValue) && targetValue > 0) {
    const ty = yAt(targetValue);
    const tColor = targetColor || palette.error;
    targetHtml = `<line x1="${padL}" x2="${width - padR}" y1="${ty.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${tColor}" stroke-dasharray="4 3" stroke-width="1.2"/>
      ${targetLabel ? `<text x="${width - padR}" y="${Math.max(10, ty - 3).toFixed(1)}" font-size="9" text-anchor="end" fill="${palette.errorFg}">${esc(targetLabel)}</text>` : ''}`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="w-full h-auto" role="img" aria-label="${esc(ariaLabel)}">
    ${barsHtml}
    ${targetHtml}
    ${showYAxis ? `<text x="4" y="${(yAt(maxRaw) + 8).toFixed(1)}" font-size="9.5" fill="${palette.axis}">${esc(formatChartNumber(maxRaw, decimals))}</text>
    <text x="4" y="${zeroY.toFixed(1)}" font-size="9.5" fill="${palette.axisSubtle}">0</text>` : ''}
  </svg>`;
}

export function sparklineSvg({
  points = [],
  color,
  ariaLabel = 'แนวโน้มข้อมูล',
  width = 128,
  height = 34,
  className = 'w-32 h-8 shrink-0',
  tipFormatter,
  subFormatter
} = {}) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const palette = getChartPalette();
  const strokeColor = color || palette.brandDark;
  const vs = points.map(p => Number(p.value));
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const rng = max - min || 1;
  const cx = i => (i / (points.length - 1)) * (width - 10) + 5;
  const cy = v => height - 5 - ((v - min) / rng) * (height - 10);
  const pts = points.map((p, i) => `${cx(i).toFixed(1)},${cy(Number(p.value)).toFixed(1)}`).join(' ');

  const dots = points.map((p, i) => {
    const x = cx(i).toFixed(1);
    const y = cy(Number(p.value)).toFixed(1);
    const tipText = typeof tipFormatter === 'function' ? tipFormatter(p, i) : String(p.label ?? p.value);
    const subText = typeof subFormatter === 'function' ? subFormatter(p, i) : '';
    const dotAria = p.ariaLabel || tipText;
    return `<g>
      <circle cx="${x}" cy="${y}" r="2.6" fill="${strokeColor}"/>
      <circle cx="${x}" cy="${y}" r="9" fill="transparent" tabindex="0" role="button" data-chart-tip="${esc(tipText)}"${subText ? ` data-chart-sub="${esc(subText)}"` : ''} data-chart-color="${esc(strokeColor)}" aria-label="${esc(dotAria)}"><title>${esc(tipText)}</title></circle>
    </g>`;
  }).join('');

  return `<svg role="img" aria-label="${esc(ariaLabel)}" viewBox="0 0 ${width} ${height}" class="${esc(className)}">
    <polyline points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}
