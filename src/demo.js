import { state } from './state.js';
import { addDays, localDateStr } from './util.js';

let active = false;

export const isPreviewMode = () => active;
export const isDemoAvailable = () => import.meta.env.DEV;

export function enterDemoMode() {
  if (!isDemoAvailable()) return false;
  active = true;
  document.documentElement.dataset.demoMode = 'true';
  return true;
}

export function exitDemoMode() {
  active = false;
  delete document.documentElement.dataset.demoMode;
}

export function seedDemoState() {
  const today = localDateStr();
  const foodByDay = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, -index);
    const meals = [
      { meal: 'มื้อเช้า', name: 'ข้าวโอ๊ต โยเกิร์ต และผลไม้', calories: 365, protein: 18, carbs: 54, fat: 9 },
      { meal: 'มื้อกลางวัน', name: 'ข้าวกะเพราไก่ไข่ดาว', calories: 590, protein: 34, carbs: 66, fat: 20 },
      { meal: 'มื้อเย็น', name: 'สลัดปลาแซลมอน', calories: 470, protein: 31, carbs: 32, fat: 24 }
    ];
    return meals.slice(0, index === 0 ? 2 : 3).map((meal, mealIndex) => ({
      id: `demo-food-${index}-${mealIndex}`,
      date,
      mealId: ['breakfast', 'lunch', 'dinner'][mealIndex],
      ...meal,
      createdAt: new Date(`${date}T12:00:00`)
    }));
  }).flat();

  state.profile = {
    id: 'profile', name: 'ผู้ใช้ตัวอย่าง', sex: 'female', birthYear: 1994,
    heightCm: 164, activity: 'light', adjust: -300, proteinPerKg: 1.4, fatPct: 28
  };
  state.body = Array.from({ length: 28 }, (_, index) => ({
    id: `demo-body-${index}`,
    date: addDays(today, -index),
    weight: Number((61.8 - index * 0.035 + (index % 4) * 0.08).toFixed(1)),
    sleepHours: Number((6.5 + (index % 4) * 0.4).toFixed(1)),
    steps: 4200 + (index % 6) * 1150,
    waist: 76.5 - index * 0.03
  }));
  state.period = [
    { id: 'demo-period-1', start: addDays(today, -8), end: addDays(today, -4), flow: 'ปานกลาง', note: '' },
    { id: 'demo-period-2', start: addDays(today, -36), end: addDays(today, -32), flow: 'น้อย', note: '' },
    { id: 'demo-period-3', start: addDays(today, -64), end: addDays(today, -60), flow: 'ปานกลาง', note: '' }
  ];
  state.symptoms = [
    { id: 'demo-symptom-1', date: addDays(today, -1), symptoms: { cramps: 1, headache: 0, fatigue: 1 }, mood: '3', note: '' },
    { id: 'demo-symptom-2', date: addDays(today, -6), symptoms: { cramps: 2, headache: 1, fatigue: 1 }, mood: '2', note: '' }
  ];
  state.skinRecords = [{ id: 'demo-skin-1', date: addDays(today, -1), symptoms: ['dryness'], result: 'ผิวแห้งเล็กน้อย' }];
  state.workouts = Array.from({ length: 8 }, (_, index) => ({
    id: `demo-workout-${index}`,
    date: addDays(today, -(index * 3 + 1)),
    type: index % 2 ? 'strength' : 'walking',
    title: index % 2 ? 'เวทเทรนนิ่งเบา ๆ' : 'เดินเร็วในสวน',
    durationMin: index % 2 ? 35 : 42,
    estKcal: index % 2 ? 180 : 205,
    status: 'done'
  }));
  state.templates = [];
  state.labs = [{ id: 'demo-lab-1', date: addDays(today, -24), name: 'วิตามินดี', value: 32, unit: 'ng/mL', refLow: 20, refHigh: 50 }];
  state.demoFoodRecords = foodByDay;
  state.todayFood = foodByDay.filter(item => item.date === today);
  state.customFoods = [
    { id: 'demo-food-lib-1', name: 'โยเกิร์ตกรีก', calories: 120, protein: 12, carbs: 8, fat: 4 },
    { id: 'demo-food-lib-2', name: 'กล้วยหอม', calories: 89, protein: 1, carbs: 23, fat: 0.3 }
  ];
  state.expenses = [
    { id: 'demo-expense-1', date: today, type: 'expense', amount: 125, category: 'food', note: 'มื้อกลางวัน' },
    { id: 'demo-expense-2', date: addDays(today, -2), type: 'expense', amount: 290, category: 'shopping', note: 'ของใช้ส่วนตัว' },
    { id: 'demo-expense-3', date: addDays(today, -3), type: 'income', amount: 1200, category: 'salary', note: 'รายรับตัวอย่าง' }
  ];
  state.expenseRecords = state.expenses;
  state.expenseSettings = [];
  state.legacyExpenseDocs = [];
  state.trackedProducts = [
    { id: 'demo-stock-1', name: 'ครีมกันแดด', category: 'skincare', quantity: 1, lowAt: 1, expiryDate: addDays(today, 18) },
    { id: 'demo-stock-2', name: 'อาหารแมว', category: 'pet', quantity: 3, lowAt: 1 }
  ];
  state.replacements = [];
  state.skincareProducts = [];
  state.ingredientBlacklist = [];
  state.petProfiles = [{ id: 'demo-pet-1', name: 'โมจิ', kind: 'แมว', weightKg: 4.2, weightHistory: [] }];
  state.petCare = [{ id: 'demo-pet-care-1', petId: 'demo-pet-1', type: 'ถ่ายพยาธิ', nextDate: addDays(today, 4), done: false }];
  state.petFoods = [];
  state.assistantNotes = [];
  state.userFeedback = [];
  state.planner = null;
  state.pushSettings = null;
  state.homeWidgets = null;
  state.loaded = { period: true, body: true, todayFood: true };
}

function isDemoNavigation(target) {
  return Boolean(target.closest('[data-nav], [data-sub], [data-go], [data-page-go], [data-day], [data-ov-range], #db-range-3, #db-range-6, #db-range-12, #db-refresh, #btn-logo, #btn-bell, #btn-settings, #demo-exit, #ov-refresh, #sum-week, #sum-month, #wk-prev, #wk-next, #r-gen, #r-print, #r-csv, details > summary'));
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', event => {
    if (!active) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('input, select, textarea')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const control = target.closest('button, a, [role="button"]');
    if (control && !isDemoNavigation(control)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  for (const eventName of ['submit', 'input', 'change']) {
    document.addEventListener(eventName, event => {
      if (!active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
}
