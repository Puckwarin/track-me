import { addDoc, deleteDoc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { userCol, userDoc } from '../firebase.js';
import { state } from '../state.js';
import { addDays, daysBetween, fmtDate, isDateStr, localDateStr, round1 } from '../util.js';
import { getGeminiKey, getGroqKey, explainGeminiError, lookupPer100g } from '../nutrition.js';
import { getMeals, getTargets } from '../profile.js';
import { getPresets } from '../food.js';
import { EXPENSE_CATEGORIES } from '../expense.js';
import { parseSmartReminder, inferCategory, resolveRuleNextDate } from '../reminderParser.js';
import { itemsForDate } from '../planner.js';
import { trackedSources, collectReminders } from '../reminders.js';

const GEMINI_CHAT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];
const GROQ_CHAT_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const REQUEST_TIMEOUT_MS = 35000;
const MAX_TOOL_ROUNDS = 5;

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function resolveNaturalDate(input, today = localDateStr()) {
  const raw = String(input || '').trim();
  if (!raw) return today;
  if (isDateStr(raw)) return raw;

  const lower = raw.toLowerCase();
  if (/วันนี้|today/.test(lower)) return today;
  if (/เมื่อวาน|yesterday/.test(lower)) return addDays(today, -1);
  if (/พรุ่งนี้|tomorrow/.test(lower)) return addDays(today, 1);
  if (/มะรืน/.test(lower)) return addDays(today, 2);

  // รูปแบบ DD/MM/YYYY หรือ DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = dmy[3] ? Number(dmy[3]) : Number(today.slice(0, 4));
    if (year < 100) year += year >= 55 ? 2443 : 2000;
    else if (year >= 2400) year -= 543;
    const cand = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isDateStr(cand)) return cand;
  }

  return today;
}

export function resolveDateRange(startDate, endDate, today = localDateStr()) {
  const rawStart = String(startDate || '').trim();
  const rawEnd = String(endDate || '').trim();
  if (/เดือนนี้|this_month|this month/i.test(rawStart) || (!rawStart && !rawEnd)) {
    const ym = today.slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
      start: `${ym}-01`,
      end: rawEnd ? resolveNaturalDate(rawEnd, today) : `${ym}-${String(last).padStart(2, '0')}`
    };
  }
  const start = resolveNaturalDate(rawStart || today, today);
  const end = resolveNaturalDate(rawEnd || start, today);
  return start <= end ? { start, end } : { start: end, end: start };
}

export function matchExpenseCategory(input, title = '') {
  const s = `${input || ''} ${title || ''}`.toLowerCase();
  if (input && EXPENSE_CATEGORIES.includes(input)) return input;
  if (/กาแฟ|ชา|คาเฟ่|โกโก้|มัทฉะ|ลาเต้|อเมริกาโน่|ชานม|เครื่องดื่ม|อเมซอน|starbucks/.test(s)) return 'เครื่องดื่ม/คาเฟ่';
  if (/ข้าว|ก๋วยเตี๋ยว|ส้มตำ|อาหาร|มื้อ|ขนม|หมูกระทะ|ชาบู|บุฟเฟ่ต์|7-eleven|เซเว่น|grabfood|lineman/.test(s)) return 'อาหาร';
  if (/bts|mrt|แท็กซี่|แกร็บ|น้ำมัน|ทางด่วน|รถไฟฟ้า|รถเมล์|เดินทาง|ตั๋ว/.test(s)) return 'เดินทาง';
  if (/ค่าไฟ|ค่าน้ำ|ค่าเน็ต|ค่าโทรศัพท์|บิล|ค่าเช่า|ผ่อน|ค่าบัตร/.test(s)) return 'บิล/ค่าใช้จ่ายประจำ';
  if (/ยา|หมอ|โรงพยาบาล|คลินิก|วิตามิน|ทำฟัน|สุขภาพ/.test(s)) return 'สุขภาพ';
  if (/หมา|แมว|สัตว์|อาหารหมา|อาหารแมว|ทรายแมว|อาบน้ำน้อง|วัคซีน/.test(s)) return 'สัตว์เลี้ยง';
  if (/ทิชชู่|น้ำยา|ผงซักฟอก|ของใช้|สบู่|แชมพู|ยาสีฟัน/.test(s)) return 'ของใช้ในบ้าน';
  if (/เสื้อ|กางเกง|รองเท้า|กระเป๋า|ช้อป|shopee|lazada|ของขวัญ/.test(s)) return 'ช้อปปิ้ง';
  return 'อื่น ๆ';
}

export function parseAdvanceNoticeDays(advanceNotice) {
  if (typeof advanceNotice === 'number' && Number.isFinite(advanceNotice)) {
    return Math.max(0, Math.min(365, Math.round(advanceNotice)));
  }
  const s = String(advanceNotice || '').trim();
  if (!s) return 7;
  if (/วันจริง|ไม่ต้องล่วงหน้า/.test(s)) return 0;
  const m = s.match(/(\d+)\s*(วัน|สัปดาห์|อาทิตย์|วีค|เดือน)?/);
  if (!m) return 7;
  const n = Number(m[1]) || 1;
  const unit = m[2] || 'วัน';
  const mult = /สัปดาห์|อาทิตย์|วีค/.test(unit) ? 7 : /เดือน/.test(unit) ? 30 : 1;
  return Math.max(0, Math.min(365, n * mult));
}

function matchMeal(mealType) {
  const meals = getMeals();
  const s = String(mealType || '').trim().toLowerCase();
  if (!s) {
    const h = new Date().getHours();
    const fallbackKey = h < 11 ? 'เช้า' : h < 16 ? 'กลางวัน' : 'เย็น';
    const byHour = meals.find(m => m.name.toLowerCase().includes(fallbackKey));
    return byHour || meals[0] || { id: 'breakfast', name: 'มื้อเช้า' };
  }
  const direct = meals.find(m =>
    m.id.toLowerCase() === s ||
    m.name.toLowerCase() === s ||
    m.name.toLowerCase().includes(s) ||
    s.includes(m.name.replace(/^มื้อ/, '').toLowerCase())
  );
  if (direct) return direct;
  if (/เช้า|breakfast/.test(s)) return meals.find(m => /เช้า|breakfast/i.test(m.name + m.id)) || meals[0];
  if (/กลางวัน|เที่ยง|lunch/.test(s)) return meals.find(m => /กลางวัน|เที่ยง|lunch/i.test(m.name + m.id)) || meals[0];
  if (/เย็น|ค่ำ|dinner/.test(s)) return meals.find(m => /เย็น|dinner/i.test(m.name + m.id)) || meals[meals.length - 1];
  if (/ว่าง|เบรก|กาแฟ|ขนม|snack/.test(s)) return meals.find(m => /ว่าง|ขนม|snack/i.test(m.name + m.id)) || meals[meals.length - 1];
  return meals[0] || { id: 'breakfast', name: 'มื้อเช้า' };
}

async function readMonthExpenseItems(uid, monthStr) {
  try {
    const snap = await getDoc(userDoc(uid, 'settings', `exp_${monthStr}`));
    if (snap.exists() && Array.isArray(snap.data()?.items)) {
      return snap.data().items;
    }
  } catch {
    // ตกไปใช้ state.expenses ในแคชเมื่อออฟไลน์
  }
  return (state.expenses || []).filter(x => (x.date || '').slice(0, 7) === monthStr);
}

// ---------- นิยาม Tools 8 ตัว (4 Read + 4 Write) ----------
const TOOL_DEFS = [
  {
    name: 'getExpenses',
    description: 'ดึงรายการรายรับ-รายจ่ายจาก Firestore ตามช่วงวันที่หรือหมวดหมู่ พร้อมยอดรวมแยกหมวด (ใช้ตอบคำถามเรื่องค่าใช้จ่าย ค่ากิน รายเดือน)',
    parameters: {
      type: 'OBJECT',
      properties: {
        startDate: { type: 'STRING', description: 'วันเริ่มต้น (YYYY-MM-DD หรือ "วันนี้", "เมื่อวาน", "เดือนนี้") ถ้าไม่ระบุจะใช้ต้นเดือนนี้' },
        endDate: { type: 'STRING', description: 'วันสิ้นสุด (YYYY-MM-DD หรือ "วันนี้")' },
        category: { type: 'STRING', description: 'กรองตามหมวดหมู่ เช่น อาหาร, เครื่องดื่ม/คาเฟ่, เดินทาง, ช้อปปิ้ง, สัตว์เลี้ยง, ของใช้ในบ้าน, บิล/ค่าใช้จ่ายประจำ, สุขภาพ, ค่ากิน (optional)' }
      }
    }
  },
  {
    name: 'getInventory',
    description: 'ดึงรายการของใช้และสต๊อกในบ้าน/สัตว์เลี้ยง/สกินแคร์ สามารถกรองเฉพาะของที่ใกล้หมดได้',
    parameters: {
      type: 'OBJECT',
      properties: {
        lowStockOnly: { type: 'BOOLEAN', description: 'ถ้า true จะส่งกลับเฉพาะรายการที่จำนวนคงเหลือต่ำกว่าหรือเท่ากับจุดเตือนใกล้หมด' }
      }
    }
  },
  {
    name: 'getNutritionSummary',
    description: 'ดึงข้อมูลสรุปแคลอรี่และสารอาหาร (โปรตีน คาร์บ ไขมัน) จากบันทึกอาหารตามช่วงวันที่ เทียบกับเป้าหมายของผู้ใช้',
    parameters: {
      type: 'OBJECT',
      properties: {
        startDate: { type: 'STRING', description: 'วันเริ่มต้น (YYYY-MM-DD หรือ "วันนี้", "เมื่อวาน")' },
        endDate: { type: 'STRING', description: 'วันสิ้นสุด (YYYY-MM-DD หรือ "วันนี้")' }
      }
    }
  },
  {
    name: 'getRemindersAndPlanner',
    description: 'ดึงตาราง Weekly Planner (แผนออกกำลังกายและกิจวัตรประจำวัน รวมสลับสัปดาห์ A/B) และรายการแจ้งเตือนนัดหมายในวันที่ระบุ',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'วันที่ต้องการดู (YYYY-MM-DD หรือ "วันนี้", "พรุ่งนี้") ค่าเริ่มต้นคือวันนี้' }
      }
    }
  },
  {
    name: 'addExpense',
    description: 'บันทึกรายจ่ายใหม่ลง Firestore ทันที (รองรับวันที่ภาษาธรรมชาติ เช่น วันนี้, เมื่อวาน)',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'ชื่อรายการ ร้านค้า หรือสิ่งที่จ่าย เช่น กาแฟ, ข้าวมันไก่, ค่าBTS' },
        amount: { type: 'NUMBER', description: 'จำนวนเงินเป็นบาท (มากกว่า 0)' },
        category: { type: 'STRING', description: 'หมวดหมู่รายจ่าย เช่น อาหาร, เครื่องดื่ม/คาเฟ่, เดินทาง, ช้อปปิ้ง, บิล/ค่าใช้จ่ายประจำ, สุขภาพ, สัตว์เลี้ยง, ของใช้ในบ้าน, อื่น ๆ' },
        date: { type: 'STRING', description: 'วันที่ (YYYY-MM-DD หรือ "วันนี้", "เมื่อวาน")' }
      },
      required: ['title', 'amount']
    }
  },
  {
    name: 'addFoodLog',
    description: 'บันทึกมื้ออาหารลง Firestore ทันที ค้นจากคลังอาหารในเครื่องก่อน หรือใช้ค่าแคลอรี่/มาโครที่ระบุหรือประมาณให้',
    parameters: {
      type: 'OBJECT',
      properties: {
        foodName: { type: 'STRING', description: 'ชื่อเมนูอาหาร เช่น ข้าวผัดกะเพรา, อเมริกาโน่เย็น, ไข่ต้ม 2 ฟอง' },
        mealType: { type: 'STRING', description: 'มื้ออาหาร เช่น มื้อเช้า, มื้อกลางวัน, มื้อเย็น, ของว่าง' },
        calories: { type: 'NUMBER', description: 'แคลอรี่รวม (kcal) — ถ้าผู้ใช้ไม่บอก ให้ประมาณค่ามาตรฐานมาให้เลยหรือเว้นว่างเพื่อให้ระบบค้นในคลัง' },
        protein: { type: 'NUMBER', description: 'โปรตีน (กรัม)' },
        carbs: { type: 'NUMBER', description: 'คาร์โบไฮเดรต (กรัม)' },
        fat: { type: 'NUMBER', description: 'ไขมัน (กรัม)' }
      },
      required: ['foodName']
    }
  },
  {
    name: 'updateInventory',
    description: 'เพิ่มหรือลด (ตัดสต๊อก) จำนวนของใช้ในสต๊อกตามชื่อรายการ',
    parameters: {
      type: 'OBJECT',
      properties: {
        itemName: { type: 'STRING', description: 'ชื่อของใช้ในสต๊อกที่ต้องการปรับจำนวน' },
        changeAmount: { type: 'NUMBER', description: 'จำนวนที่เปลี่ยนแปลง (ค่าบวก = เติมสต๊อก เช่น +2, ค่าลบ = ใช้ไป/ตัดสต๊อก เช่น -1)' }
      },
      required: ['itemName', 'changeAmount']
    }
  },
  {
    name: 'addReminder',
    description: 'สร้างรายการแจ้งเตือนนัดหมายใหม่ลง Firestore',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'หัวข้อแจ้งเตือนหรือนัดหมาย' },
        date: { type: 'STRING', description: 'วันที่ครบกำหนด (YYYY-MM-DD หรือ "วันนี้", "พรุ่งนี้")' },
        time: { type: 'STRING', description: 'เวลาในรูปแบบ HH:MM (ถ้ามี เช่น 14:30)' },
        advanceNotice: { type: 'STRING', description: 'การเตือนล่วงหน้า เช่น "3 วัน", "1 สัปดาห์", "วันจริง" หรือจำนวนวัน' }
      },
      required: ['title']
    }
  }
];

function toGeminiSchema(node) {
  if (!node || typeof node !== 'object') return node;
  const out = { ...node };
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, toGeminiSchema(v)])
    );
  }
  return out;
}

function toOpenAISchema(node) {
  if (!node || typeof node !== 'object') return node;
  const out = { ...node };
  if (typeof out.type === 'string') out.type = out.type.toLowerCase();
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, toOpenAISchema(v)])
    );
  }
  return out;
}

const GEMINI_TOOLS = [{ functionDeclarations: TOOL_DEFS.map(t => ({ ...t, parameters: toGeminiSchema(t.parameters) })) }];
const OPENAI_TOOLS = TOOL_DEFS.map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: toOpenAISchema(t.parameters)
  }
}));

// ---------- รัน Tool ฝั่ง Client กับ Firebase Firestore ----------
export async function executeAssistantTool(name, args = {}) {
  const uid = state.uid;
  if (!uid) return { payload: { error: 'ผู้ใช้ยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบก่อน' } };
  const today = localDateStr();

  switch (name) {
    case 'getExpenses': {
      const { start, end } = resolveDateRange(args.startDate, args.endDate, today);
      const catQuery = String(args.category || '').trim().toLowerCase();
      let list = (state.expenses || []).filter(x => x.date >= start && x.date <= end);

      if (catQuery) {
        if (/ค่ากิน|food|กิน|อาหารและเครื่องดื่ม/.test(catQuery)) {
          list = list.filter(x => ['อาหาร', 'เครื่องดื่ม/คาเฟ่'].includes(x.category));
        } else {
          list = list.filter(x =>
            String(x.category || '').toLowerCase().includes(catQuery) ||
            String(x.merchant || '').toLowerCase().includes(catQuery)
          );
        }
      }

      const expenses = list.filter(x => x.type !== 'income');
      const incomes = list.filter(x => x.type === 'income');
      const expenseTotal = Math.round(expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0) * 100) / 100;
      const incomeTotal = Math.round(incomes.reduce((s, x) => s + (Number(x.amount) || 0), 0) * 100) / 100;

      const byCategory = {};
      expenses.forEach(x => {
        const c = x.category || 'อื่น ๆ';
        byCategory[c] = Math.round(((byCategory[c] || 0) + (Number(x.amount) || 0)) * 100) / 100;
      });

      return {
        payload: {
          startDate: start,
          endDate: end,
          categoryFilter: args.category || null,
          count: list.length,
          expenseTotal,
          incomeTotal,
          netBalance: Math.round((incomeTotal - expenseTotal) * 100) / 100,
          byCategory,
          recentItems: list.slice(0, 15).map(x => ({
            date: x.date,
            type: x.type === 'income' ? 'รายรับ' : 'รายจ่าย',
            title: x.merchant || x.category,
            category: x.category,
            amount: x.amount
          }))
        }
      };
    }

    case 'getInventory': {
      const lowOnly = Boolean(args.lowStockOnly);
      const all = (state.trackedProducts || []).map(p => {
        const qty = p.quantity != null ? Number(p.quantity) : null;
        const lowAt = p.lowAt != null ? Number(p.lowAt) : null;
        const isLow = qty !== null && lowAt !== null && qty <= lowAt;
        return {
          name: p.name,
          category: p.category || 'อื่น ๆ',
          quantity: qty,
          unit: p.unit || 'หน่วย',
          lowAt,
          isLow,
          expiryDate: p.expiryDate || p.paoExpiry || null
        };
      });
      const items = lowOnly ? all.filter(x => x.isLow) : all;
      const expiringSoon = all.filter(x => x.expiryDate && daysBetween(today, x.expiryDate) <= 30).length;
      return {
        payload: {
          lowStockOnly: lowOnly,
          totalProducts: all.length,
          lowStockCount: all.filter(x => x.isLow).length,
          expiringWithin30Days: expiringSoon,
          items: items.slice(0, 30)
        }
      };
    }

    case 'getNutritionSummary': {
      const { start, end } = resolveDateRange(args.startDate || today, args.endDate || args.startDate || today, today);
      let rows = [];
      if (start === today && end === today && Array.isArray(state.todayFood)) {
        rows = state.todayFood;
      } else {
        const snap = await getDocs(
          query(userCol(uid, 'food_records'), where('date', '>=', start), where('date', '<=', end))
        );
        rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      const totals = rows.reduce(
        (acc, x) => ({
          calories: acc.calories + (Number(x.calories) || 0),
          protein: acc.protein + (Number(x.protein) || 0),
          carbs: acc.carbs + (Number(x.carbs) || 0),
          fat: acc.fat + (Number(x.fat) || 0)
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
      const targets = getTargets();
      const daySet = new Set(rows.map(r => r.date).filter(Boolean));
      return {
        payload: {
          startDate: start,
          endDate: end,
          daysWithLogs: daySet.size,
          itemCount: rows.length,
          totals: {
            calories: Math.round(totals.calories),
            protein: round1(totals.protein),
            carbs: round1(totals.carbs),
            fat: round1(totals.fat)
          },
          dailyTargets: {
            calories: targets.kcal,
            protein: targets.protein,
            carbs: targets.carbs,
            fat: targets.fat
          },
          items: rows.slice(0, 25).map(r => ({
            date: r.date,
            meal: r.meal || '',
            name: r.name,
            calories: r.calories,
            protein: r.protein,
            carbs: r.carbs,
            fat: r.fat
          }))
        }
      };
    }

    case 'getRemindersAndPlanner': {
      const targetDate = resolveNaturalDate(args.date || today, today);
      const plannerItems = itemsForDate(targetDate);
      const allSources = trackedSources();
      const dueOrToday = allSources.filter(x => x.date === targetDate || (targetDate === today && x.date < today));
      const notified = collectReminders().filter(x => x.col !== 'period');

      return {
        payload: {
          date: targetDate,
          dateFormatted: fmtDate(targetDate),
          plannerTasks: plannerItems.map(p => ({
            kind: p.kind === 'workout' ? 'ออกกำลังกาย' : 'กิจวัตร',
            title: p.title,
            time: p.time || null,
            done: Boolean(p.done),
            note: p.sub || ''
          })),
          remindersOnDate: dueOrToday.map(r => ({
            title: r.label,
            dueDate: r.date,
            time: r.dueTime || null,
            status: r.date < today ? 'เลยกำหนด' : 'วันนี้',
            detail: r.detail
          })),
          activeAlertsCount: notified.length,
          upcomingAlerts: notified.slice(0, 10).map(r => ({
            title: r.label,
            dueDate: r.date,
            time: r.dueTime || null,
            detail: r.detail
          }))
        }
      };
    }

    case 'addExpense': {
      const title = String(args.title || '').trim() || 'รายจ่าย';
      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { payload: { error: 'จำนวนเงินต้องมากกว่า 0 บาท' } };
      }
      const roundedAmount = Math.round(amount * 100) / 100;
      const date = resolveNaturalDate(args.date || today, today);
      const monthStr = date.slice(0, 7);
      const category = matchExpenseCategory(args.category, title);
      const id = 'ex' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const record = {
        id,
        type: 'expense',
        amount: roundedAmount,
        category,
        date,
        time: nowTimeStr(),
        merchant: title.slice(0, 120),
        note: 'บันทึกโดย AI Assistant',
        source: 'manual',
        createdAt: new Date().toISOString()
      };

      const existing = await readMonthExpenseItems(uid, monthStr);
      const nextItems = [record, ...existing]
        .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
        .slice(0, 1000);
      await setDoc(userDoc(uid, 'settings', `exp_${monthStr}`), {
        kind: 'expense_month',
        month: monthStr,
        items: nextItems,
        updatedAt: new Date()
      });

      const receipt = {
        icon: '💸',
        title: `บันทึกรายจ่าย: ${title} ${roundedAmount.toLocaleString('th-TH')} บาท`,
        subtitle: `หมวด${category} · ${fmtDate(date)}`,
        undo: { kind: 'expense', id, date, label: `${title} ${roundedAmount} บาท` }
      };
      return {
        payload: { success: true, id, title, amount: roundedAmount, category, date },
        receipt
      };
    }

    case 'addFoodLog': {
      const foodName = String(args.foodName || '').trim();
      if (!foodName) return { payload: { error: 'กรุณาระบุชื่ออาหาร' } };
      const mealObj = matchMeal(args.mealType);

      let calories = args.calories != null && Number.isFinite(Number(args.calories)) ? Math.round(Number(args.calories)) : null;
      let protein = args.protein != null && Number.isFinite(Number(args.protein)) ? round1(Number(args.protein)) : null;
      let carbs = args.carbs != null && Number.isFinite(Number(args.carbs)) ? round1(Number(args.carbs)) : null;
      let fat = args.fat != null && Number.isFinite(Number(args.fat)) ? round1(Number(args.fat)) : null;
      let nutritionSource = 'manual_or_ai';

      const qLower = foodName.toLowerCase();
      const presets = getPresets();
      const matchedPreset = presets.find(p => String(p.name || '').toLowerCase() === qLower)
        || presets.find(p => String(p.name || '').toLowerCase().includes(qLower) || qLower.includes(String(p.name || '').toLowerCase()));

      if (calories === null && matchedPreset) {
        const qty = matchedPreset.defaultQuantity || 1;
        calories = Math.round((Number(matchedPreset.calories) || 0) * qty);
        protein = round1((Number(matchedPreset.protein) || 0) * qty);
        carbs = round1((Number(matchedPreset.carbs) || 0) * qty);
        fat = round1((Number(matchedPreset.fat) || 0) * qty);
        nutritionSource = 'local_library';
      } else if (calories === null) {
        try {
          const est = await lookupPer100g(foodName);
          if (est && Number.isFinite(Number(est.calories))) {
            calories = Math.round(Number(est.calories));
            protein = round1(Number(est.protein) || 0);
            carbs = round1(Number(est.carbs) || 0);
            fat = round1(Number(est.fat) || 0);
            nutritionSource = 'ai_estimated';
          }
        } catch {
          // ใช้ 0 ถ้าไม่สามารถประมาณค่าได้
        }
      }

      const finalCal = Math.max(0, calories ?? 0);
      const finalPro = Math.max(0, protein ?? 0);
      const finalCarb = Math.max(0, carbs ?? 0);
      const finalFat = Math.max(0, fat ?? 0);

      const rec = {
        date: today,
        mealId: mealObj.id,
        meal: mealObj.name,
        name: foodName.slice(0, 120),
        quantity: 1,
        unitNutrition: {
          calories: finalCal,
          protein: finalPro,
          carbs: finalCarb,
          fat: finalFat
        },
        calories: finalCal,
        protein: finalPro,
        carbs: finalCarb,
        fat: finalFat,
        createdAt: new Date()
      };
      const ref = await addDoc(userCol(uid, 'food_records'), rec);

      const receipt = {
        icon: '🍽️',
        title: `บันทึกอาหาร: ${foodName} (${finalCal} kcal)`,
        subtitle: `${mealObj.name} · P ${finalPro}g · C ${finalCarb}g · F ${finalFat}g`,
        undo: { kind: 'food', docId: ref.id, label: foodName }
      };
      return {
        payload: {
          success: true,
          docId: ref.id,
          foodName,
          meal: mealObj.name,
          date: today,
          calories: finalCal,
          protein: finalPro,
          carbs: finalCarb,
          fat: finalFat,
          nutritionSource
        },
        receipt
      };
    }

    case 'updateInventory': {
      const itemName = String(args.itemName || '').trim();
      const delta = Number(args.changeAmount);
      if (!itemName || !Number.isFinite(delta) || delta === 0) {
        return { payload: { error: 'กรุณาระบุชื่อรายการและจำนวนที่ปรับให้ถูกต้อง' } };
      }
      const list = state.trackedProducts || [];
      const q = itemName.toLowerCase();
      const target = list.find(p => String(p.name || '').toLowerCase() === q)
        || list.find(p => String(p.name || '').toLowerCase().includes(q) || q.includes(String(p.name || '').toLowerCase()));
      if (!target) {
        return { payload: { error: `ไม่พบรายการ "${itemName}" ในสต๊อกของใช้` } };
      }

      const prevQty = Number(target.quantity) || 0;
      const prevLowDismissed = target.lowDismissed ?? false;
      const nextQty = Math.max(0, round1(prevQty + delta));
      const lowDismissed = (target.lowAt != null && nextQty > target.lowAt) ? false : prevLowDismissed;

      await updateDoc(userDoc(uid, 'tracked_products', target.id), {
        quantity: nextQty,
        lowDismissed,
        updatedAt: new Date()
      });

      const unit = target.unit || 'หน่วย';
      const receipt = {
        icon: '📦',
        title: `อัปเดตสต๊อก: ${target.name} (${delta > 0 ? `+${delta}` : delta} ${unit})`,
        subtitle: `คงเหลือ ${nextQty} ${unit} (เดิม ${prevQty} ${unit})`,
        undo: { kind: 'inventory', docId: target.id, prevQty, prevLowDismissed, label: target.name }
      };
      return {
        payload: {
          success: true,
          itemName: target.name,
          unit,
          previousQuantity: prevQty,
          newQuantity: nextQty,
          isLowStock: target.lowAt != null && nextQty <= target.lowAt
        },
        receipt
      };
    }

    case 'addReminder': {
      const title = String(args.title || '').trim();
      if (!title) return { payload: { error: 'กรุณาระบุหัวข้อแจ้งเตือน' } };
      const parsed = parseSmartReminder(`${title} ${args.date || ''} ${args.time || ''}`, [
        ...(state.petCare || []).map(x => ({ ...x, col: 'pet_care_records', title: x.type || '' })),
        ...(state.replacements || []).map(x => ({ ...x, col: 'replacement_records', title: x.name || '' }))
      ], today);

      const nextDate = args.date ? resolveNaturalDate(args.date, today) : (parsed?.nextDate || today);
      const dueTime = typeof args.time === 'string' && /^\d{1,2}:\d{2}$/.test(args.time.trim())
        ? args.time.trim().padStart(5, '0')
        : (parsed?.dueTime || null);
      const remindDays = args.advanceNotice != null
        ? parseAdvanceNoticeDays(args.advanceNotice)
        : (parsed?.remindDays ?? 7);
      const kind = inferCategory(title);
      const isPet = kind === 'สัตว์เลี้ยง';
      const targetCol = isPet ? 'pet_care_records' : 'replacement_records';
      const petId = (state.petProfiles || [])[0]?.id || '';

      const rule = parsed?.rule && parsed.rule.kind !== 'once' ? parsed.rule : { kind: 'once', summary: 'ครั้งเดียว' };
      const resolvedDate = rule.kind !== 'once'
        ? (resolveRuleNextDate(rule, [], today, true) || nextDate)
        : nextDate;

      const payload = isPet
        ? {
            petId,
            type: title.slice(0, 80),
            category: 'สัตว์เลี้ยง',
            date: today,
            nextDate: resolvedDate,
            ...(dueTime && { dueTime }),
            repeatMonths: parsed?.repeatMonths ?? null,
            intervalDays: parsed?.intervalDays ?? null,
            remindDays,
            rawText: title.slice(0, 300),
            rule,
            note: 'เพิ่มโดย AI Assistant',
            done: false,
            dismissedFor: null,
            createdAt: new Date()
          }
        : {
            name: title.slice(0, 120),
            category: kind,
            date: today,
            nextDate: resolvedDate,
            ...(dueTime && { dueTime }),
            repeatMonths: parsed?.repeatMonths ?? null,
            intervalDays: parsed?.intervalDays ?? null,
            remindDays,
            rawText: title.slice(0, 300),
            rule,
            note: 'เพิ่มโดย AI Assistant',
            done: false,
            dismissedFor: null,
            createdAt: new Date()
          };

      const ref = await addDoc(userCol(uid, targetCol), payload);
      window.dispatchEvent(new Event('trackme:data-change'));

      const receipt = {
        icon: '🔔',
        title: `เพิ่มแจ้งเตือน: ${title}`,
        subtitle: `${fmtDate(resolvedDate)}${dueTime ? ` เวลา ${dueTime} น.` : ''} · เตือนล่วงหน้า ${remindDays} วัน`,
        undo: { kind: 'reminder', col: targetCol, docId: ref.id, label: title }
      };
      return {
        payload: {
          success: true,
          col: targetCol,
          docId: ref.id,
          title,
          category: kind,
          nextDate: resolvedDate,
          dueTime,
          remindDays
        },
        receipt
      };
    }

    default:
      return { payload: { error: `ไม่รู้จักเครื่องมือ "${name}"` } };
  }
}

export async function undoAssistantAction(undo) {
  const uid = state.uid;
  if (!uid || !undo) throw new Error('ไม่สามารถยกเลิกรายการได้');

  if (undo.kind === 'expense') {
    const monthStr = (undo.date || localDateStr()).slice(0, 7);
    const existing = await readMonthExpenseItems(uid, monthStr);
    const nextItems = existing.filter(x => x.id !== undo.id);
    await setDoc(userDoc(uid, 'settings', `exp_${monthStr}`), {
      kind: 'expense_month',
      month: monthStr,
      items: nextItems,
      updatedAt: new Date()
    });
    return;
  }
  if (undo.kind === 'food') {
    await deleteDoc(userDoc(uid, 'food_records', undo.docId));
    return;
  }
  if (undo.kind === 'inventory') {
    await updateDoc(userDoc(uid, 'tracked_products', undo.docId), {
      quantity: undo.prevQty,
      lowDismissed: undo.prevLowDismissed ?? false,
      updatedAt: new Date()
    });
    return;
  }
  if (undo.kind === 'reminder') {
    await deleteDoc(userDoc(uid, undo.col, undo.docId));
    window.dispatchEvent(new Event('trackme:data-change'));
  }
}

// ---------- Multi-Provider Function Calling Loop ----------
function buildSystemPrompt() {
  const today = localDateStr();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  return [
    'คุณคือ "ผู้ช่วย Track Me" ผู้ช่วยส่วนตัวในแอป Track Me',
    `วันที่ปัจจุบัน: ${today} (เมื่อวานคือ ${yesterday}, พรุ่งนี้คือ ${tomorrow})`,
    'หน้าที่ของคุณ:',
    '- ตอบคำถามและช่วยบันทึกข้อมูลให้ผู้ใช้เป็นภาษาไทยที่สุภาพ กระชับ อ่านง่าย',
    '- ใช้เครื่องมือ (Tools) ที่มีเสมอเมื่อผู้ใช้ถามข้อมูลส่วนตัว (รายรับ-รายจ่าย สต๊อก โภชนาการ แผน/นัดเตือน) หรือสั่งบันทึกข้อมูล',
    '- หากผู้ใช้สั่งจดอาหารโดยไม่ได้ระบุแคลอรี่ ให้ประมาณค่า kcal, protein, carbs, fat มาตรฐานต่อ 1 ที่แล้วส่งให้ addFoodLog ทันที',
    '- ห้ามเปิดเผยหรือเดาข้อมูลส่วนตัวอื่นที่ไม่ได้รับมาจากผลลัพธ์ของ Tool ในบทสนทนา',
    '- เมื่อเรียก Write Tool สำเร็จแล้ว ให้สรุปผลลัพธ์สั้นๆ ชัดเจนให้ผู้ใช้ทราบว่าได้บันทึกเรียบร้อยแล้ว'
  ].join('\n');
}

async function discoverFallbackGeminiModels(key) {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(id => id && !GEMINI_CHAT_MODELS.includes(id) &&
        /(flash|hydrogen|lite)/i.test(id) &&
        !/tts|live|image|audio|embedding|transcribe|thinking|1\.5|2\.0|exp/i.test(id))
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function callGeminiWithTools(historyMessages, userText) {
  const key = getGeminiKey();
  if (!key) throw new Error('NO_KEY');

  const systemInstruction = { parts: [{ text: buildSystemPrompt() }] };
  const baseContents = [
    ...historyMessages.slice(-8).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }]
    })),
    { role: 'user', parts: [{ text: userText }] }
  ];

  const runModel = async model => {
    const contents = baseContents.map(c => ({ ...c, parts: [...c.parts] }));
    const receipts = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const generationConfig = { temperature: 0.2 };
      if (/^gemini-2\.5-/i.test(model)) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      let res;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction,
            contents,
            tools: GEMINI_TOOLS,
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
            generationConfig
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
      } catch (cause) {
        const isTimeout = cause?.name === 'AbortError' || cause?.name === 'TimeoutError';
        const err = new Error(isTimeout ? 'หมดเวลารอคำตอบจาก Gemini (35 วินาที)' : (cause.message || 'Network error'));
        err.timeoutError = isTimeout;
        err.networkError = !isTimeout;
        throw err;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.invalidKey = (res.status === 400 && /api.?key|invalid/i.test(msg)) || res.status === 403;
        err.modelNotFound = res.status === 404;
        err.quotaExceeded = res.status === 429 || /quota|resource.?exhausted/i.test(msg);
        throw err;
      }

      const modelContent = data?.candidates?.[0]?.content;
      const parts = modelContent?.parts || [];
      const fnParts = parts.filter(p => p.functionCall);

      if (fnParts.length > 0) {
        contents.push(modelContent);
        const responseParts = [];
        for (const fp of fnParts) {
          const fc = fp.functionCall;
          const out = await executeAssistantTool(fc.name, fc.args || {});
          if (out.receipt) receipts.push(out.receipt);
          responseParts.push({
            functionResponse: {
              ...(fc.id ? { id: fc.id } : {}),
              name: fc.name,
              response: { result: out.payload }
            }
          });
        }
        contents.push({ role: 'user', parts: responseParts });
        continue;
      }

      const reply = parts.filter(p => typeof p.text === 'string').map(p => p.text).join('\n').trim();
      if (!reply) throw new Error('Gemini ไม่ส่งข้อความตอบกลับ');
      return { text: reply, receipts, provider: 'Gemini', model };
    }

    throw new Error('AI เรียกใช้เครื่องมือหลายรอบเกินกำหนด');
  };

  let lastErr = null;
  for (const m of GEMINI_CHAT_MODELS) {
    try { return await runModel(m); }
    catch (e) {
      if (e.invalidKey) throw e;
      lastErr = e;
    }
  }
  const extra = await discoverFallbackGeminiModels(key);
  for (const m of extra) {
    try { return await runModel(m); }
    catch (e) {
      if (e.invalidKey) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('Gemini ไม่พร้อมใช้งาน');
}

async function callGroqWithTools(historyMessages, userText) {
  const key = getGroqKey();
  if (!key) throw new Error('NO_KEY');

  const baseMessages = [
    { role: 'system', content: buildSystemPrompt() },
    ...historyMessages.slice(-8).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text
    })),
    { role: 'user', content: userText }
  ];

  const runModel = async model => {
    const messages = baseMessages.map(m => ({ ...m }));
    const receipts = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let res;
      try {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({
            model,
            messages,
            tools: OPENAI_TOOLS,
            tool_choice: 'auto',
            temperature: 0.2
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
      } catch (cause) {
        const isTimeout = cause?.name === 'AbortError' || cause?.name === 'TimeoutError';
        const err = new Error(isTimeout ? 'หมดเวลารอคำตอบจาก Groq' : (cause.message || 'Groq network error'));
        err.timeoutError = isTimeout;
        err.networkError = !isTimeout;
        throw err;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || `Groq HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.invalidKey = res.status === 401 || res.status === 403;
        err.quotaExceeded = [402, 429].includes(res.status) || /quota|rate.?limit/i.test(msg);
        throw err;
      }

      const choiceMsg = data?.choices?.[0]?.message;
      const toolCalls = choiceMsg?.tool_calls;

      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: choiceMsg.content || null,
          tool_calls: toolCalls
        });
        for (const tc of toolCalls) {
          let parsedArgs = {};
          try { parsedArgs = JSON.parse(tc.function?.arguments || '{}'); } catch { parsedArgs = {}; }
          const out = await executeAssistantTool(tc.function?.name, parsedArgs);
          if (out.receipt) receipts.push(out.receipt);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(out.payload)
          });
        }
        continue;
      }

      const reply = String(choiceMsg?.content || '').trim();
      if (!reply) throw new Error('Groq ไม่ส่งข้อความตอบกลับ');
      return { text: reply, receipts, provider: 'Groq', model };
    }

    throw new Error('Groq เรียกใช้เครื่องมือหลายรอบเกินกำหนด');
  };

  let lastErr = null;
  for (const m of GROQ_CHAT_MODELS) {
    try { return await runModel(m); }
    catch (e) {
      if (e.invalidKey) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('Groq ไม่พร้อมใช้งาน');
}

export async function runAssistantTurn(historyMessages, userText) {
  const providers = [];
  if (getGeminiKey()) providers.push(['Gemini', () => callGeminiWithTools(historyMessages, userText)]);
  if (getGroqKey()) providers.push(['Groq', () => callGroqWithTools(historyMessages, userText)]);

  if (!providers.length) {
    const err = new Error('NO_KEY');
    throw err;
  }

  const errors = [];
  for (let i = 0; i < providers.length; i++) {
    const [name, fn] = providers[i];
    try {
      return await fn();
    } catch (e) {
      if (providers.length === 1) throw e;
      errors.push(`${name}: ${explainGeminiError(e)}`);
    }
  }
  const combined = new Error(errors.join(' · '));
  combined.fallbackErrors = errors;
  throw combined;
}
