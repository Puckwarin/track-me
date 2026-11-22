// กราฟวงแหวน (Donut) แบบใช้ร่วมกันทั้งหน้าแรกและหน้าอาหาร
// ใช้คลาส/ตัวแปรสีเดียวกับวงแหวนหน้าแรก (.hx-ring*, --hx-*) ที่ประกาศไว้ใน home.css
// (โหลดแน่นอนทุกหน้า เพราะ app.js import ตรง ไม่ผ่าน lazy-load) เพื่อให้รูปแบบ
// ความหนา ขนาด ตำแหน่งตัวเลขกลาง สี ระยะห่าง ขอบมน Legend Tooltip และแอนิเมชันเหมือนกัน 100%
import { esc } from './util.js';

const R = 52;                 // รัศมี (ต้องตรงกับ viewBox 0 0 120 120 ที่ .hx-ring ใช้)
const CIRC = 2 * Math.PI * R;
const MIN_HIT_ARC = 22;       // ความยาวขั้นต่ำของพื้นที่แตะ/hover สำหรับส่วนกราฟที่มีขนาดเล็ก

export const DONUT_TOOLTIP_HINT = 'แตะหรือชี้ส่วนของกราฟ หรือรายการด้านล่าง เพื่อดูรายละเอียด';

function clampPct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

/**
 * สร้าง markup ของวงแหวนเดียว ใช้ได้ทั้งหน้าแรกและหน้าอาหาร
 *
 * @param {object} opts
 * @param {Array<{ value:number, color?:string, className?:string, id?:string,
 *                 label?:string, tip?:string, sub?:string }>} opts.segments
 * @param {string} opts.centerValue  ตัวเลข/ข้อความหลักตรงกลางวงแหวน
 * @param {string} opts.centerSmall  หน่วยต่อท้ายตัวเลขหลัก (เช่น "%") ตัวเล็กกว่า
 * @param {string} opts.centerLabel ข้อความบรรทัดเล็กใต้ตัวเลขหลัก
 * @param {string} opts.ariaLabel   คำอธิบายรวมสำหรับโปรแกรมอ่านหน้าจอ
 * @param {boolean} opts.interactive  true = แต่ละส่วนกดโฟกัส/แตะดู tooltip ได้ (ใช้กับ bindChartInspector)
 * @param {boolean} opts.isEmpty    true = ยังไม่มีข้อมูล แสดงวงแหวนจุดประแทน
 * @param {string} opts.emptyLabel ข้อความกลางวงแหวนตอนยังไม่มีข้อมูล
 */
export function buildDonutRing({
  segments = [],
  centerValue = '',
  centerSmall = '',
  centerLabel = '',
  ariaLabel = '',
  interactive = false,
  isEmpty = false,
  emptyLabel = 'ยังไม่มีข้อมูล'
} = {}) {
  if (isEmpty || !segments.length) {
    return `
    <div class="hx-ring" role="img" aria-label="${esc(ariaLabel || emptyLabel)}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="hx-ring-track" cx="60" cy="60" r="${R}" stroke-dasharray="4 6" />
      </svg>
      <div class="hx-ring-center">
        <span class="hx-ring-value hx-ring-value--empty tabular-nums">${esc(centerValue || '—')}${centerSmall && centerValue ? `<small>${esc(centerSmall)}</small>` : ''}</span>
        <span class="hx-ring-label">${esc(centerLabel || emptyLabel)}</span>
      </div>
    </div>`;
  }

  let cumulative = 0;
  const hitTargets = [];
  const bars = segments.map((seg, i) => {
    const pct = Math.min(clampPct(seg.value), Math.max(0, 100 - cumulative));
    const arcLen = (pct / 100) * CIRC;
    const dashOffset = -((cumulative / 100) * CIRC);
    cumulative += pct;
    const styleColor = seg.color ? ` style="stroke:${esc(seg.color)}"` : '';
    const cls = `hx-ring-bar${seg.className ? ' ' + seg.className : ''}`;
    const tip = seg.tip ?? seg.label ?? '';
    const sub = seg.sub ?? '';
    const color = seg.color ?? '';
    const extra = interactive
      ? ` tabindex="0" role="button" data-chart-idx="${i}" data-chart-tip="${esc(tip)}" data-chart-sub="${esc(sub)}" data-chart-color="${esc(color)}" aria-label="${esc(tip)}"`
      : '';
    if (interactive && pct > 0) {
      const hitLen = Math.max(arcLen, MIN_HIT_ARC);
      const hitPad = (hitLen - arcLen) / 2;
      const hitOffset = dashOffset + hitPad;
      hitTargets.push(
        `<circle class="hx-ring-hit" cx="60" cy="60" r="${R}" stroke-dasharray="${hitLen.toFixed(2)} ${CIRC.toFixed(2)}" stroke-dashoffset="${hitOffset.toFixed(2)}" data-chart-idx="${i}" data-chart-tip="${esc(tip)}" data-chart-sub="${esc(sub)}" data-chart-color="${esc(color)}" aria-hidden="true"><title>${esc(tip)}</title></circle>`
      );
    }
    return `<circle class="${cls}" cx="60" cy="60" r="${R}" stroke-dasharray="${arcLen.toFixed(2)} ${CIRC.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}"${styleColor}${extra}><title>${esc(seg.tip ?? '')}</title></circle>`;
  }).join('');

  const ringClass = `hx-ring${segments.length > 1 ? ' hx-ring--multi' : ''}`;
  return `
  <div class="${ringClass}" role="img" aria-label="${esc(ariaLabel)}">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="hx-ring-track" cx="60" cy="60" r="${R}" />
      ${bars}
      ${hitTargets.join('')}
    </svg>
    <div class="hx-ring-center">
      <span class="hx-ring-value tabular-nums">${esc(centerValue)}${centerSmall ? `<small>${esc(centerSmall)}</small>` : ''}</span>
      ${centerLabel ? `<span class="hx-ring-label">${esc(centerLabel)}</span>` : ''}
    </div>
  </div>`;
}

/** สร้างชุด segment ของวงแหวนจากสัดส่วนพลังงานแต่ละมื้อ (ใช้ร่วมกับ buildDonutRing) */
export function mealSlicesToSegments(slices) {
  return slices.filter(s => s.kcal > 0).map(s => ({
    value: s.pct,
    color: s.color,
    label: s.meal,
    tip: `${s.meal}: ${s.pct}% · ${s.kcal.toLocaleString()} kcal · โปรตีน ${s.protein ?? 0} g`,
    sub: `${s.count} รายการ`
  }));
}

/** สร้าง Legend ใต้วงแหวน แสดงชื่อและสีทุกรายการ และแตะ/ชี้ดู Tooltip ได้เหมือนส่วนกราฟ */
export function buildDonutLegend(slices = []) {
  if (!slices.length) {
    return '<p class="tm-donut-empty-note">ยังไม่มีรายการอาหารสำหรับแสดงสัดส่วน</p>';
  }
  let activeIdx = 0;
  return `<div class="tm-donut-legend" role="list" aria-label="คำอธิบายสีแต่ละมื้อ">${slices.map(s => {
    const hasKcal = s.kcal > 0;
    const tip = `${s.meal}: ${s.pct}% · ${s.kcal.toLocaleString()} kcal · โปรตีน ${s.protein ?? 0} g`;
    const sub = `${s.count} รายการ`;
    if (hasKcal) {
      const idx = activeIdx++;
      return `<button type="button" role="listitem" class="tm-donut-legend-item is-active" data-chart-idx="${idx}" data-chart-tip="${esc(tip)}" data-chart-sub="${esc(sub)}" data-chart-color="${esc(s.color)}" aria-label="${esc(tip)}">
        <span class="tm-donut-legend-dot" style="background:${esc(s.color)}" aria-hidden="true"></span>
        <span class="tm-donut-legend-name">${esc(s.meal)}</span>
        <span class="tm-donut-legend-pct tabular-nums">${s.pct}%</span>
      </button>`;
    }
    return `<span role="listitem" class="tm-donut-legend-item is-muted">
      <span class="tm-donut-legend-dot" style="background:${esc(s.color)}" aria-hidden="true"></span>
      <span class="tm-donut-legend-name">${esc(s.meal)}</span>
    </span>`;
  }).join('')}</div>`;
}

/** สร้างชุด Donut Chart + Legend + Tooltip Readout สำหรับทั้งหน้าแรกและหน้าอาหาร */
export function buildMealDonutParts({
  slices = [],
  totalKcal = 0,
  targetKcal = 0,
  hasData = false
} = {}) {
  const hasGoal = Number(targetKcal) > 0;
  const pct = hasGoal ? Math.round((totalKcal / Number(targetKcal)) * 100) : 0;
  const segments = hasData ? mealSlicesToSegments(slices) : [];
  const isEmpty = !hasData || !segments.length;

  const ringHtml = buildDonutRing({
    segments,
    centerValue: isEmpty ? (hasGoal ? '0' : '—') : String(hasGoal ? pct : 100),
    centerSmall: isEmpty ? (hasGoal ? '%' : '') : '%',
    centerLabel: isEmpty ? 'ยังไม่มีข้อมูล' : (hasGoal ? 'ของเป้าวันนี้' : 'สัดส่วนวันนี้'),
    ariaLabel: isEmpty
      ? 'ยังไม่มีข้อมูลพลังงานแต่ละมื้อ'
      : `สรุปพลังงาน ${hasGoal ? `${pct}% ของเป้าวันนี้` : '100% ของวันนี้'} (${totalKcal.toLocaleString()} kcal)`,
    interactive: !isEmpty,
    isEmpty,
    emptyLabel: 'ยังไม่มีข้อมูล'
  });

  const legendHtml = buildDonutLegend(slices);
  const readoutHtml = isEmpty
    ? ''
    : `<div class="tm-chart-readout is-empty" data-chart-readout aria-live="polite"><span>${esc(DONUT_TOOLTIP_HINT)}</span></div>`;

  return { ringHtml, legendHtml, readoutHtml, pct, isEmpty };
}