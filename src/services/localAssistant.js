import { addDays, fmtDate, localDateStr, round1 } from '../util.js';
import { getPresets } from '../foodConstants.js';
import { parseSmartReminder } from '../reminderParser.js';
import { LOCAL_ROLE, LOCAL_HELP_TEXT } from './chatRoles.js';
import {
  assessWriteConfirmation,
  executeAssistantTool,
  executeConfirmedAction,
  matchExpenseCategory,
  prepareWriteAction,
  resolveDateRange,
  resolveNaturalDate,
  sanitizeDataText
} from './aiAssistant.js';

export { LOCAL_ROLE, LOCAL_HELP_TEXT };

const LEADING_DECOR_RE = /^(?:[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]+\s*)+/u;

function stripLeadingDecor(text) {
  return String(text || '').trim().replace(LEADING_DECOR_RE, '').trim();
}

function isGenerativeQuestion(clean) {
  return /(?:ช่วยคิด|ช่วยร่าง|ช่วยแต่ง|ช่วยแปล|ช่วยออกแบบ|ช่วยเปรียบเทียบ|วางแผนแก้ปัญหา|ออกท่า.*นาที|จัดตารางเวลา.*ลงตัว|จัดเมนู.*ให้ถึงเป้า|ข้อดี-ข้อเสีย)/.test(clean);
}

function extractTrailingDateToken(text, today) {
  const m = text.match(/\s+(วันนี้|เมื่อวาน|พรุ่งนี้|มะรืน|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s*$/);
  if (!m) return { rest: text.trim(), date: today, matched: false };
  return {
    rest: text.slice(0, m.index).trim(),
    date: resolveNaturalDate(m[1], today),
    matched: true
  };
}

function parseExpenseOrIncome(clean, today) {
  const isIncome = /^(?:จดรายรับ|รายรับ|รับเงิน)(?=\s|[:：]|$)/i.test(clean);
  const expTrigger = /^(?:จดค่า|บันทึกรายจ่าย|จดรายจ่าย|จ่ายค่า|จ่ายเงินค่า|รายจ่าย)\s*(.+)$/i;
  const expCurrencyTrigger = /^(?:ซื้อ|ค่า)\s*(.+)$/i;
  const incTrigger = /^(?:จดรายรับ|รายรับ|รับเงิน)\s*[:：]?\s*(.+)$/i;

  let body = null;
  let requireCurrencyWord = false;
  if (isIncome) {
    const m = clean.match(incTrigger);
    if (!m) return null;
    body = m[1];
  } else if (expTrigger.test(clean)) {
    body = clean.match(expTrigger)[1];
  } else if (expCurrencyTrigger.test(clean)) {
    body = clean.match(expCurrencyTrigger)[1];
    requireCurrencyWord = true;
  } else {
    return null;
  }

  const { rest, date } = extractTrailingDateToken(body, today);
  const amtRe = requireCurrencyWord
    ? /^(.+?)\s+(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|บ\.|฿)\s*$/i
    : /^(.+?)\s+(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|บ\.|฿)?\s*$/i;
  const m = rest.match(amtRe);
  if (!m) return null;

  const title = sanitizeDataText(m[1].replace(/^[:：\-\s]+/, ''), 120);
  const amount = Number(String(m[2]).replace(/,/g, ''));
  if (!title || !Number.isFinite(amount) || amount <= 0) return null;

  return {
    matched: true,
    kind: 'write',
    toolName: 'addExpense',
    args: {
      title,
      amount,
      date,
      type: isIncome ? 'income' : 'expense',
      category: isIncome ? 'รายรับ' : matchExpenseCategory('', title)
    }
  };
}

function parseInventoryCommand(clean) {
  let m = clean.match(/^(?:ใช้|ตัดสต๊อก|เบิก|ลดสต๊อก)\s*(.+?)\s*(?:ไป|ออก|จำนวน)?\s*(\d+(?:\.\d+)?)\s*(?:ชิ้น|ห่อ|อัน|ขวด|หลอด|กล่อง|ซอง|ถุง|หน่วย|กระปุก|ม้วน|แผ่น|กรัม|g|มล\.?|ml)?\s*$/i);
  let sign = -1;
  if (!m) {
    m = clean.match(/^(?:เติม|เพิ่มสต๊อก|ซื้อเข้า)\s*(.+?)\s*(?:เข้า|จำนวน)?\s*(\d+(?:\.\d+)?)\s*(?:ชิ้น|ห่อ|อัน|ขวด|หลอด|กล่อง|ซอง|ถุง|หน่วย|กระปุก|ม้วน|แผ่น|กรัม|g|มล\.?|ml)?\s*$/i);
    sign = 1;
  }
  if (!m) return null;
  const itemName = sanitizeDataText(m[1].replace(/(?:ไป|จำนวน)$/i, ''), 80);
  const qty = Number(m[2]);
  if (!itemName || !Number.isFinite(qty) || qty <= 0) return null;
  return {
    matched: true,
    kind: 'write',
    toolName: 'updateInventory',
    args: { itemName, changeAmount: sign * qty }
  };
}

function parseFoodCommand(clean, presets = []) {
  const m = clean.match(/^(?:จดมื้อ|บันทึกมื้อ|จดอาหาร|บันทึกอาหาร|กิน)\s*(เช้า|กลางวัน|เที่ยง|เย็น|ค่ำ|ว่าง|ขนม|เบรก)?\s*[:：]?\s*(.+)$/i);
  if (!m) return null;

  const mealType = m[1] ? m[1] : '';
  let rest = m[2].trim();
  if (!rest || /\?$|เท่าไหร่|กี่แคล|ไหม$/.test(rest)) return null;

  // Extract optional explicit P/C/F and kcal
  let protein = null;
  let carbs = null;
  let fat = null;
  let calories = null;

  const pMatch = rest.match(/\bP\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g?\b/i);
  if (pMatch) { protein = Number(pMatch[1]); rest = rest.replace(pMatch[0], ' '); }
  const cMatch = rest.match(/\bC\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g?\b/i);
  if (cMatch) { carbs = Number(cMatch[1]); rest = rest.replace(cMatch[0], ' '); }
  const fMatch = rest.match(/\bF\s*[:=]?\s*(\d+(?:\.\d+)?)\s*g?\b/i);
  if (fMatch) { fat = Number(fMatch[1]); rest = rest.replace(fMatch[0], ' '); }

  const calMatch = rest.match(/(\d+(?:\.\d+)?)\s*(?:kcal|กิโลแคลอรี|แคล(?:อรี่|อรี)?)(?=\s|$|\/)/i);
  if (calMatch) {
    calories = Math.round(Number(calMatch[1]));
    rest = rest.replace(calMatch[0], ' ');
  }

  // Strip trailing quantity+unit for preset lookup (e.g. "ไข่ต้ม 2 ฟอง" -> name="ไข่ต้ม", qty=2)
  const rawFoodText = rest.replace(/\s+/g, ' ').trim();
  if (!rawFoodText) return null;

  let qtyMultiplier = 1;
  let baseLookupName = rawFoodText;
  const qtyMatch = rawFoodText.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(ฟอง|ชิ้น|จาน|ชาม|ทัพพี|แก้ว|ขวด|กล่อง|ถ้วย|ซอง|อัน|ลูก|ไม้|ที่|แผ่น|หน่วย)\s*$/i);
  if (qtyMatch) {
    baseLookupName = qtyMatch[1].trim();
    const parsedQty = Number(qtyMatch[2]);
    if (Number.isFinite(parsedQty) && parsedQty > 0) qtyMultiplier = parsedQty;
  }

  if (calories === null && Array.isArray(presets) && presets.length) {
    const q1 = rawFoodText.toLowerCase();
    const q2 = baseLookupName.toLowerCase();
    const hit = presets.find(p => String(p.name || '').toLowerCase() === q1)
      || presets.find(p => String(p.name || '').toLowerCase() === q2)
      || presets.find(p => String(p.name || '').toLowerCase().includes(q2) || q2.includes(String(p.name || '').toLowerCase()));
    if (hit) {
      const unitQty = (hit.defaultQuantity || 1) * (hit.name.toLowerCase() === q1 ? 1 : qtyMultiplier);
      calories = Math.round((Number(hit.calories) || 0) * unitQty);
      if (protein === null) protein = round1((Number(hit.protein) || 0) * unitQty);
      if (carbs === null) carbs = round1((Number(hit.carbs) || 0) * unitQty);
      if (fat === null) fat = round1((Number(hit.fat) || 0) * unitQty);
    }
  }

  if (calories === null) {
    return {
      matched: true,
      kind: 'food_missing_kcal',
      foodName: sanitizeDataText(rawFoodText, 120),
      mealType
    };
  }

  return {
    matched: true,
    kind: 'write',
    toolName: 'addFoodLog',
    args: {
      foodName: sanitizeDataText(rawFoodText, 120),
      ...(mealType && { mealType }),
      calories,
      protein: protein ?? 0,
      carbs: carbs ?? 0,
      fat: fat ?? 0
    }
  };
}

function parseNoteCommand(clean) {
  const writeMatch = clean.match(/^(?:จดโน้ต|บันทึกโน้ต|ช่วยจำ|โน้ตไว้ว่า)\s*(?:\[([^\]]+)\])?\s*[:：]?\s*(.+)$/i);
  if (writeMatch) {
    const category = sanitizeDataText(writeMatch[1] || 'ทั่วไป', 40) || 'ทั่วไป';
    const body = writeMatch[2].trim();
    if (!body) return null;
    const colonIdx = body.indexOf(':');
    const title = colonIdx > 0 && colonIdx <= 40
      ? sanitizeDataText(body.slice(0, colonIdx), 120)
      : sanitizeDataText(body.slice(0, 36) + (body.length > 36 ? '…' : ''), 120);
    const content = colonIdx > 0 && colonIdx <= 40 ? body.slice(colonIdx + 1).trim() : body;
    return {
      matched: true,
      kind: 'write',
      toolName: 'saveNote',
      args: { title: title || 'โน้ต', content, category }
    };
  }

  const readMatch = clean.match(/^(?:ดูโน้ต|อ่านโน้ต|ค้นหาโน้ต|โน้ตทั้งหมด|มีโน้ตอะไร)(?:\s+(.+))?$/i);
  if (readMatch) {
    const query = sanitizeDataText((readMatch[1] || '').replace(/^(?:ทั้งหมด|ที่จดไว้|เกี่ยวกับ|เรื่อง)\s*/i, ''), 80);
    return {
      matched: true,
      kind: 'read',
      toolName: 'getNotes',
      args: { ...(query && { query }), limit: 10 }
    };
  }
  return null;
}

function parseFeedbackCommand(clean) {
  const m = clean.match(/^(?:ส่ง\s*feedback|ส่งฟีดแบ็ก|ฟีดแบ็ก|แจ้งปัญหา|ขอฟีเจอร์|ติชม)\s*[:：]?\s*(.+)$/i);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  let category = 'other';
  if (/แจ้งปัญหา|บั๊ก|bug|ค้าง|พัง|error/i.test(clean)) category = 'bug';
  else if (/ขอฟีเจอร์|อยากให้เพิ่ม|feature/i.test(clean)) category = 'feature';
  else if (/หน้าตา|ui|ux|ใช้งาน/i.test(clean)) category = 'ux';
  else if (/ชอบ|ดีมาก|ขอบคุณ|ถูกใจ|เยี่ยม/i.test(clean)) category = 'praise';

  return {
    matched: true,
    kind: 'write',
    toolName: 'submitFeedback',
    args: { message: raw, category }
  };
}

function parseReminderCommand(clean, today) {
  const m = clean.match(/^(?:เตือน|แจ้งเตือน|ตั้งเตือน|นัด)\s*(.+)$/i);
  if (!m) return null;
  if (/(?:อะไรบ้าง|มีนัดอะไร|กี่โมง|วันไหน|ไหม\??|บ้าง\??)$/.test(clean)) return null;
  const rawBody = m[1].trim();
  if (!rawBody) return null;

  const parsed = parseSmartReminder(rawBody, [], today);
  return {
    matched: true,
    kind: 'write',
    toolName: 'addReminder',
    args: {
      title: sanitizeDataText(parsed?.title || rawBody, 120),
      date: parsed?.nextDate || today,
      ...(parsed?.dueTime && { time: parsed.dueTime }),
      ...(parsed?.remindDays != null && { advanceNotice: parsed.remindDays }),
      rawRuleText: rawBody
    }
  };
}

function parseReadQuery(clean, today) {
  // Expenses
  if (/(?:ค่าใช้จ่าย|รายจ่าย|รายรับ|ค่ากิน|ค่ากาแฟ|ค่าเดินทาง|จ่ายไปเท่าไหร่|ใช้เงินไปเท่าไหร่)/.test(clean)) {
    let startDate = 'เดือนนี้';
    let endDate = '';
    if (/วันนี้/.test(clean)) { startDate = today; endDate = today; }
    else if (/เมื่อวาน/.test(clean)) { startDate = addDays(today, -1); endDate = startDate; }
    else if (/7\s*วัน|สัปดาห์นี้|อาทิตย์นี้/.test(clean)) { startDate = addDays(today, -6); endDate = today; }
    let category = '';
    if (/ค่ากิน|อาหาร/.test(clean)) category = 'ค่ากิน';
    else if (/กาแฟ|คาเฟ่|เครื่องดื่ม/.test(clean)) category = 'เครื่องดื่ม/คาเฟ่';
    else if (/เดินทาง/.test(clean)) category = 'เดินทาง';
    else if (/สัตว์เลี้ยง|น้องหมา|แมว/.test(clean)) category = 'สัตว์เลี้ยง';
    return {
      matched: true,
      kind: 'read',
      toolName: 'getExpenses',
      args: { startDate, ...(endDate && { endDate }), ...(category && { category }) }
    };
  }

  // Inventory
  if (/(?:ในสต๊อก|สต๊อก|ของใช้.*ใกล้หมด|อะไรใกล้หมด|เช็กของ|ดูของใช้|ของใกล้หมด)/.test(clean)) {
    const lowStockOnly = /ใกล้หมด|หมด/.test(clean);
    return {
      matched: true,
      kind: 'read',
      toolName: 'getInventory',
      args: { lowStockOnly }
    };
  }

  // Reminders & Planner
  if (/(?:มีนัดและแผน|มีแผนอะไร|มีนัดอะไร|แผนวันนี้|นัดวันนี้|นัดหมายวันนี้|กิจวัตรวันนี้|แผนพรุ่งนี้|นัดพรุ่งนี้|เช็กนัด)/.test(clean)) {
    const date = /พรุ่งนี้/.test(clean) ? addDays(today, 1) : /เมื่อวาน/.test(clean) ? addDays(today, -1) : today;
    return {
      matched: true,
      kind: 'read',
      toolName: 'getRemindersAndPlanner',
      args: { date }
    };
  }

  // Nutrition
  if (/(?:กินไปกี่แคล|แคลอรีวันนี้|แคลวันนี้|สรุปอาหาร|สารอาหารวันนี้|โปรตีนวันนี้|เมื่อวานกิน|วันนี้กินอะไร)/.test(clean)) {
    const target = /เมื่อวาน/.test(clean) ? addDays(today, -1) : today;
    return {
      matched: true,
      kind: 'read',
      toolName: 'getNutritionSummary',
      args: { startDate: target, endDate: target }
    };
  }

  // Workouts
  if (/(?:สรุปการออกกำลัง|ออกกำลังกายล่าสุด|ประวัติออกกำลัง|เทมเพลตออกกำลัง|ออกกำลังช่วงนี้)/.test(clean)) {
    return {
      matched: true,
      kind: 'read',
      toolName: 'getWorkouts',
      args: { includeTemplates: true }
    };
  }

  // Body / Sleep / Steps / Wellness
  if (/(?:น้ำหนัก|สัดส่วน|เมื่อคืนนอน|นอนกี่ชั่วโมง|การนอน|ก้าวเดิน|เดินกี่ก้าว|อาการน้องหมา|ผลตรวจเลือด|ผลแล็บ|รอบเดือน)/.test(clean)) {
    let focus = 'all';
    if (/นอน|ก้าวเดิน|เดินกี่ก้าว/.test(clean)) focus = 'sleep_steps';
    else if (/น้ำหนัก|สัดส่วน/.test(clean)) focus = 'body';
    else if (/น้องหมา/.test(clean)) focus = 'pet';
    else if (/ผลตรวจ|แล็บ/.test(clean)) focus = 'lab';
    else if (/รอบเดือน/.test(clean)) focus = 'period';
    return {
      matched: true,
      kind: 'read',
      toolName: 'getBodyAndWellness',
      args: { limit: 7 },
      focus
    };
  }

  return null;
}

export function parseLocalAssistantIntent(rawText, { today = localDateStr(), presets = [] } = {}) {
  const clean = stripLeadingDecor(rawText);
  if (!clean) return { matched: false };

  if (/^(?:\/help|แพตเทิร์น|คำสั่งแพตเทิร์น|ดูคำสั่ง|วิธีใช้แพตเทิร์น|ช่วยอะไรได้บ้าง)$/i.test(clean) || /แพตเทิร์นทั้งหมด/.test(clean)) {
    return { matched: true, kind: 'help' };
  }

  if (isGenerativeQuestion(clean)) {
    return { matched: false };
  }

  return (
    parseNoteCommand(clean)
    || parseFeedbackCommand(clean)
    || parseExpenseOrIncome(clean, today)
    || parseInventoryCommand(clean)
    || parseFoodCommand(clean, presets)
    || parseReminderCommand(clean, today)
    || parseReadQuery(clean, today)
    || { matched: false }
  );
}

function formatReadSummary(toolName, payload, intent = {}) {
  if (payload?.error) return `⚠️ ${payload.error}`;
  const d = payload?.data || payload || {};

  switch (toolName) {
    case 'getExpenses': {
      const label = d.categoryFilter ? `หมวด${d.categoryFilter}` : 'ทั้งหมด';
      const range = d.startDate === d.endDate ? fmtDate(d.startDate) : `${fmtDate(d.startDate)} – ${fmtDate(d.endDate)}`;
      const lines = [
        `💸 **สรุปรายรับ-รายจ่าย (${label})** · ${range}`,
        `- รายจ่ายรวม: **${Number(d.expenseTotal || 0).toLocaleString('th-TH')} บาท** (${d.count || 0} รายการ)`
      ];
      if (d.incomeTotal > 0) {
        lines.push(`- รายรับรวม: **${Number(d.incomeTotal).toLocaleString('th-TH')} บาท** · คงเหลือ **${Number(d.netBalance || 0).toLocaleString('th-TH')} บาท**`);
      }
      const topCats = Object.entries(d.byCategory || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (topCats.length && !d.categoryFilter) {
        lines.push(`- แยกหมวด: ${topCats.map(([c, v]) => `${c} ${Number(v).toLocaleString('th-TH')}฿`).join(' · ')}`);
      }
      const recent = (d.recentItems || []).slice(0, 4);
      if (recent.length) {
        lines.push(`- ล่าสุด: ${recent.map(x => `${x.title} ${Number(x.amount).toLocaleString('th-TH')}฿`).join(', ')}`);
      }
      return lines.join('\n');
    }

    case 'getInventory': {
      const items = d.items || [];
      if (!d.totalProducts) return '📦 ยังไม่มีรายการของใช้ในสต๊อกเลยค่ะ';
      if (d.lowStockOnly && !items.length) {
        return `📦 **สต๊อกของใช้ (${d.totalProducts} รายการ)**: ยังไม่มีรายการใกล้หมดค่ะ ✓`;
      }
      const lines = [
        `📦 **สต๊อกของใช้** (ทั้งหมด ${d.totalProducts} · ใกล้หมด ${d.lowStockCount}${d.expiringWithin30Days ? ` · ใกล้หมดอายุ ${d.expiringWithin30Days}` : ''})`
      ];
      items.slice(0, 8).forEach(it => {
        lines.push(`- ${it.isLow ? '⚠️ ' : ''}**${it.name}**: เหลือ ${it.quantity ?? '-'} ${it.unit}${it.expiryDate ? ` (หมดอายุ ${fmtDate(it.expiryDate)})` : ''}`);
      });
      return lines.join('\n');
    }

    case 'getRemindersAndPlanner': {
      const tasks = d.plannerTasks || [];
      const rems = d.remindersOnDate || [];
      const upcoming = d.upcomingAlerts || [];
      const lines = [`📅 **แผนและนัดหมาย (${d.dateFormatted || fmtDate(d.date)})**`];
      if (tasks.length) {
        tasks.slice(0, 6).forEach(t => {
          lines.push(`- ${t.done ? '✅' : '⬜'} [${t.kind}] ${t.title}${t.time ? ` (${t.time} น.)` : ''}`);
        });
      } else {
        lines.push('- ยังไม่มีแผน/กิจวัตรในวันนี้');
      }
      if (rems.length) {
        rems.slice(0, 5).forEach(r => {
          lines.push(`- 🔔 **${r.title}** (${r.status}${r.time ? ` ${r.time} น.` : ''})`);
        });
      } else if (upcoming.length) {
        lines.push(`- แจ้งเตือนที่ใกล้ถึง: ${upcoming.slice(0, 3).map(u => `${u.title} (${fmtDate(u.dueDate)})`).join(', ')}`);
      }
      return lines.join('\n');
    }

    case 'getNutritionSummary': {
      const t = d.totals || {};
      const g = d.dailyTargets || {};
      const lines = [
        `🍽️ **สรุปโภชนาการ (${fmtDate(d.startDate)})**`,
        `- พลังงาน: **${t.calories || 0} / ${g.calories || 2000} kcal** (${d.itemCount || 0} รายการ)`,
        `- มาโคร: **P ${t.protein || 0}g**${g.protein ? `/${g.protein}g` : ''} · **C ${t.carbs || 0}g** · **F ${t.fat || 0}g**`
      ];
      const items = (d.items || []).slice(0, 5);
      if (items.length) {
        lines.push(`- รายการ: ${items.map(x => `${x.name} (${x.calories} kcal)`).join(', ')}`);
      }
      return lines.join('\n');
    }

    case 'getWorkouts': {
      const recent = d.recentWorkouts || [];
      const tpls = d.savedTemplates || [];
      const lines = [
        `🏋️ **สรุปการออกกำลังกาย (30 วันล่าสุด)**`,
        `- ทำแล้ว **${d.completedCount || 0} ครั้ง** · รวม ${d.totalDurationMin || 0} นาที · เผาผลาญ ~${d.totalEstKcal || 0} kcal${d.totalVolumeKg ? ` · เวทรวม ${d.totalVolumeKg.toLocaleString('th-TH')} kg` : ''}`
      ];
      recent.slice(0, 4).forEach(w => {
        lines.push(`- ${fmtDate(w.date)}: **${w.title}** (${w.status === 'planned' ? 'วางแผนไว้' : `${w.durationMin || 0} นาที`}${w.sessionRpe != null ? ` · RPE ${w.sessionRpe}/10` : ''})`);
      });
      if (tpls.length) {
        lines.push(`- เทมเพลตที่บันทึกไว้: ${tpls.slice(0, 4).map(t => t.name).join(', ')}`);
      }
      return lines.join('\n');
    }

    case 'getBodyAndWellness': {
      const focus = intent.focus || 'all';
      const lines = [];
      const body = d.bodySummary || {};
      const ss = d.sleepAndStepsSummary || {};

      if (focus === 'all' || focus === 'body') {
        if (body.latestWeightKg != null) {
          const deltaStr = body.weightDeltaFromPrevKg != null && body.weightDeltaFromPrevKg !== 0
            ? ` (${body.weightDeltaFromPrevKg > 0 ? '+' : ''}${body.weightDeltaFromPrevKg} กก. จากครั้งก่อน)`
            : '';
          lines.push(`⚖️ **น้ำหนักล่าสุด**: **${body.latestWeightKg} กก.**${deltaStr}`);
          const latest = body.recent?.[0];
          const dims = [latest?.waist && `เอว ${latest.waist}`, latest?.hip && `สะโพก ${latest.hip}`].filter(Boolean);
          if (dims.length) lines.push(`- สัดส่วนล่าสุด (${fmtDate(latest.date)}): ${dims.join(' · ')} ซม.`);
        } else if (focus === 'body') {
          lines.push('⚖️ ยังไม่มีข้อมูลน้ำหนักหรือสัดส่วน');
        }
      }

      if (focus === 'all' || focus === 'sleep_steps') {
        const latestSs = ss.recent?.[0];
        if (latestSs) {
          lines.push(`😴 **การนอน & ก้าวเดินล่าสุด (${fmtDate(latestSs.date)})**: นอน ${latestSs.sleepHours ?? '-'} ชม. · 👣 ${latestSs.steps != null ? latestSs.steps.toLocaleString('th-TH') : '-'} ก้าว`);
          if (ss.avgSleepHoursRecent7 != null || ss.avgStepsRecent7 != null) {
            lines.push(`- เฉลี่ย 7 วันล่าสุด: นอน ${ss.avgSleepHoursRecent7 ?? '-'} ชม./คืน · เดิน ${ss.avgStepsRecent7 != null ? ss.avgStepsRecent7.toLocaleString('th-TH') : '-'} ก้าว/วัน`);
          }
        } else if (focus === 'sleep_steps') {
          lines.push('😴 ยังไม่มีข้อมูลการนอนหรือก้าวเดิน (กรอกเองหรือนำเข้า Zepp CSV ได้ในแท็บน้ำหนัก)');
        }
      }

      if (focus === 'pet') {
        const p = (d.petSymptomSummary || [])[0];
        lines.push(p
          ? `🐶 **อาการน้องหมาล่าสุด (${fmtDate(p.date)})**: ${p.activeSymptoms?.length ? p.activeSymptoms.join(', ') : 'ปกติทุกด้าน'}${p.tempC ? ` · 🌡️ ${p.tempC}°C` : ''}${p.note ? ` · ${p.note}` : ''}`
          : '🐶 ยังไม่มีบันทึกอาการน้องหมา');
      }

      if (focus === 'lab') {
        const labs = (d.labResults || []).slice(0, 5);
        if (labs.length) {
          lines.push('🩸 **ผลตรวจล่าสุด**');
          labs.forEach(l => lines.push(`- ${fmtDate(l.date)} · **${l.name}**: ${l.value} ${l.unit}`));
        } else {
          lines.push('🩸 ยังไม่มีผลตรวจแล็บที่บันทึกไว้');
        }
      }

      if (focus === 'period') {
        const p = (d.periodSummary?.recent || [])[0];
        lines.push(p
          ? `🌸 **รอบเดือนล่าสุด**: เริ่ม ${fmtDate(p.start)}${p.end ? ` – ${fmtDate(p.end)}` : ''}${d.periodSummary?.lastCycleSpanDays ? ` (รอบล่าสุด ${d.periodSummary.lastCycleSpanDays} วัน)` : ''}`
          : '🌸 ยังไม่มีบันทึกรอบเดือน');
      }

      return lines.length ? lines.join('\n') : '📊 ยังไม่มีข้อมูลสุขภาพในช่วงนี้ค่ะ';
    }

    case 'getNotes': {
      const notes = d.notes || [];
      if (!notes.length) return '📝 ยังไม่มีโน้ตที่ตรงกับคำค้นหาค่ะ';
      const lines = [`📝 **โน้ตที่จดไว้ (${notes.length}/${d.totalNotes} รายการ)**`];
      notes.slice(0, 8).forEach(n => {
        lines.push(`- **[${n.category}] ${n.title}**: ${n.content}${n.date ? ` _(${fmtDate(n.date)})_` : ''}`);
      });
      return lines.join('\n');
    }

    default:
      return '⚡ ประมวลผลเรียบร้อยค่ะ';
  }
}

export async function runLocalAssistantCommand(userText, { today = localDateStr(), presets = getPresets() } = {}) {
  const intent = parseLocalAssistantIntent(userText, { today, presets });
  if (!intent.matched) return { handled: false };

  const meta = { provider: 'แพตเทิร์นในเครื่อง', model: '0 โทเค็น', role: 'local' };

  if (intent.kind === 'help') {
    return { handled: true, text: LOCAL_HELP_TEXT, receipts: [], pendingActions: [], ...meta };
  }

  if (intent.kind === 'food_missing_kcal') {
    return {
      handled: true,
      text: `🍽️ ยังไม่พบ "${intent.foodName}" ในคลังอาหารค่ะ\n- ระบุแคลอรี่ต่อท้ายเพื่อบันทึกทันที (0 โทเค็น) เช่น \`จดมื้อ${intent.mealType || 'เช้า'} ${intent.foodName} 250 kcal\`\n- หรือสลับเป็นโหมด **คุยทั่วไป / โค้ชสุขภาพ** เพื่อให้ AI ประมาณค่าให้`,
      receipts: [],
      pendingActions: [],
      ...meta
    };
  }

  if (intent.kind === 'read') {
    const out = await executeAssistantTool(intent.toolName, intent.args || {});
    return {
      handled: true,
      text: formatReadSummary(intent.toolName, out.payload, intent),
      receipts: [],
      pendingActions: [],
      ...meta
    };
  }

  if (intent.kind === 'write') {
    const prep = await prepareWriteAction(intent.toolName, intent.args || {});
    if (prep.error) {
      return {
        handled: true,
        text: `⚠️ ${prep.error}`,
        receipts: [],
        pendingActions: [],
        ...meta
      };
    }

    const { requiresConfirmation, reason } = assessWriteConfirmation([prep.prepared], 0);
    if (requiresConfirmation) {
      return {
        handled: true,
        text: `⏳ รายการนี้เข้าเกณฑ์ต้องตรวจสอบ (${reason || 'ยอดหรือจำนวนสูง'}) กดปุ่ม **ยืนยันบันทึก** ด้านล่างก่อนนะคะ`,
        receipts: [],
        pendingActions: [{ ...prep.prepared, status: 'pending' }],
        ...meta
      };
    }

    const res = await executeConfirmedAction(prep.prepared);
    if (res.status === 'failed') {
      return {
        handled: true,
        text: `❌ บันทึกไม่สำเร็จ: ${res.error || 'เกิดข้อผิดพลาด'}`,
        receipts: [],
        pendingActions: [],
        ...meta
      };
    }

    const statusLine = res.status === 'pending_sync'
      ? `⏳ บันทึกไว้ในเครื่องแล้ว (รอซิงค์เมื่อออนไลน์): **${prep.prepared.title}**`
      : `✅ บันทึกเรียบร้อย: **${prep.prepared.title}**`;

    return {
      handled: true,
      text: statusLine,
      receipts: res.receipt ? [res.receipt] : [],
      pendingActions: [],
      ...meta
    };
  }

  return { handled: false };
}

// Re-export helpers for direct unit tests if needed
export { resolveDateRange };
