// ข้อมูลตัวอย่างสำหรับโหมด Preview (ไม่เข้าสู่ระบบ)
// ใช้เฉพาะการแสดงผลในหน่วยความจำ — ไม่บันทึกลง Firestore

import { localDateStr, addDays } from './util.js';

function dateBack(days) { return addDays(localDateStr(), -days); }
function dateBackISO(days) { return dateBack(days); }

export const DEMO_PROFILE = {
  id: 'profile',
  kind: 'profile',
  displayName: 'ผู้ใช้ตัวอย่าง',
  gender: 'female',
  birthYear: 1995,
  height: 165,
  weight: 58,
  activityLevel: 'moderate',
  goal: 'maintain',
  bmr: 1380,
  tdee: 1900,
  targetCal: 1900,
  proteinTarget: 90,
  fatTarget: 55,
  carbTarget: 240,
  meals: [
    { name: 'เช้า', ratio: 25 },
    { name: 'กลางวัน', ratio: 35 },
    { name: 'เย็น', ratio: 30 },
    { name: 'ว่าง', ratio: 10 }
  ]
};

export const DEMO_BODY = [
  { id: 'body1', date: dateBackISO(0), weight: 57.8, waist: 68, hip: 92, arm: 27, thigh: 53, chest: 86, note: '' },
  { id: 'body2', date: dateBackISO(7), weight: 58.0, waist: 68.5, hip: 92, arm: 27, thigh: 53, chest: 86, note: '' },
  { id: 'body3', date: dateBackISO(14), weight: 58.3, waist: 69, hip: 92.5, arm: 27, thigh: 53.5, chest: 86.5, note: '' },
  { id: 'body4', date: dateBackISO(21), weight: 58.5, waist: 69, hip: 93, arm: 27, thigh: 53.5, chest: 87, note: '' },
  { id: 'body5', date: dateBackISO(30), weight: 59.0, waist: 69.5, hip: 93, arm: 27.5, thigh: 54, chest: 87, note: 'ก่อนเริ่มลดน้ำหนัก' },
  { id: 'body6', date: dateBackISO(60), weight: 59.5, waist: 70, hip: 94, arm: 28, thigh: 54.5, chest: 88, note: '' },
  { id: 'zepp_1', date: dateBackISO(1), kind: 'zepp', sleepHours: 7.2, sleepScore: 82, steps: 8540, note: '' },
  { id: 'zepp_2', date: dateBackISO(2), kind: 'zepp', sleepHours: 6.5, sleepScore: 68, steps: 6230, note: '' },
  { id: 'zepp_3', date: dateBackISO(3), kind: 'zepp', sleepHours: 8.0, sleepScore: 90, steps: 11200, note: '' },
  { id: 'zepp_4', date: dateBackISO(4), kind: 'zepp', sleepHours: 7.5, sleepScore: 85, steps: 7800, note: '' },
  { id: 'zepp_5', date: dateBackISO(5), kind: 'zepp', sleepHours: 6.8, sleepScore: 72, steps: 5400, note: '' },
  { id: 'zepp_6', date: dateBackISO(6), kind: 'zepp', sleepHours: 7.8, sleepScore: 88, steps: 9600, note: '' },
  { id: 'zepp_7', date: dateBackISO(7), kind: 'zepp', sleepHours: 7.0, sleepScore: 78, steps: 7200, note: '' }
];

export const DEMO_PERIOD = [
  { id: 'p1', date: dateBackISO(3), flow: 'medium', note: 'ปวดท้องเล็กน้อย' },
  { id: 'p2', date: dateBackISO(4), flow: 'heavy', note: '' },
  { id: 'p3', date: dateBackISO(5), flow: 'heavy', note: '' },
  { id: 'p4', date: dateBackISO(6), flow: 'medium', note: '' },
  { id: 'p5', date: dateBackISO(7), flow: 'light', note: '' },
  { id: 'p6', date: dateBackISO(33), flow: 'medium', note: '' },
  { id: 'p7', date: dateBackISO(34), flow: 'heavy', note: '' },
  { id: 'p8', date: dateBackISO(35), flow: 'heavy', note: '' },
  { id: 'p9', date: dateBackISO(36), flow: 'medium', note: '' },
  { id: 'p10', date: dateBackISO(37), flow: 'light', note: '' },
  { id: 'p11', date: dateBackISO(63), flow: 'medium', note: '' },
  { id: 'p12', date: dateBackISO(64), flow: 'heavy', note: '' },
  { id: 'p13', date: dateBackISO(65), flow: 'medium', note: '' },
  { id: 'p14', date: dateBackISO(66), flow: 'light', note: '' }
];

export const DEMO_SYMPTOMS = [
  { id: 's1', date: dateBackISO(0), mood: 4, energy: 3, cramp: 2, headache: 1, bloating: 2, skin: 'ปกติ', note: 'รู้สึกดี' },
  { id: 's2', date: dateBackISO(1), mood: 3, energy: 3, cramp: 1, headache: 0, bloating: 1, skin: 'แห้ง', note: '' },
  { id: 's3', date: dateBackISO(2), mood: 3, energy: 2, cramp: 0, headache: 1, bloating: 2, skin: 'ปกติ', note: 'เหนื่อย' },
  { id: 's4', date: dateBackISO(3), mood: 2, energy: 2, cramp: 3, headache: 2, bloating: 3, skin: 'ปกติ', note: 'ปวดท้อง' },
  { id: 's5', date: dateBackISO(4), mood: 2, energy: 1, cramp: 3, headache: 2, bloating: 3, skin: 'อักเสบ', note: 'วันแรกของรอบเดือน' },
  { id: 's6', date: dateBackISO(7), mood: 4, energy: 4, cramp: 0, headache: 0, bloating: 1, skin: 'ปกติ', note: 'รู้สึกดีขึ้น' }
];

export const DEMO_TODAY_FOOD = [
  { id: 'f1', date: dateBackISO(0), meal: 'เช้า', name: 'ข้าวต้มหมูสับ', calories: 280, protein: 18, carb: 35, fat: 7, servings: 1, unit: 'ถ้วย' },
  { id: 'f2', date: dateBackISO(0), meal: 'กลางวัน', name: 'ข้าวมันไก่ทอด', calories: 520, protein: 28, carb: 55, fat: 22, servings: 1, unit: 'จาน' },
  { id: 'f3', date: dateBackISO(0), meal: 'กลางวัน', name: 'ชาเย็น', calories: 120, protein: 0, carb: 30, fat: 0, servings: 1, unit: 'แก้ว' },
  { id: 'f4', date: dateBackISO(0), meal: 'ว่าง', name: 'โยเกิร์ตผลไม้', calories: 150, protein: 6, carb: 22, fat: 4, servings: 1, unit: 'กล่อง' },
  { id: 'f5', date: dateBackISO(0), meal: 'เย็น', name: 'ยำวุ้นเส้นหมูสับ', calories: 280, protein: 17, carb: 32, fat: 10, servings: 1, unit: 'จาน' }
];

export const DEMO_WORKOUTS = [
  { id: 'w1', date: dateBackISO(1), title: 'Full Body Workout', muscleGroup: 'เต็มร่างกาย', status: 'done', durationMin: 45, feeling: 'good', sessionRpe: 7, exercises: [
    { name: 'Squat', sets: 3, reps: 12, weight: 40, rpe: 7, rir: 2 },
    { name: 'Bench Press', sets: 3, reps: 10, weight: 30, rpe: 7, rir: 2 },
    { name: 'Deadlift', sets: 3, reps: 8, weight: 50, rpe: 8, rir: 1 }
  ] },
  { id: 'w2', date: dateBackISO(3), title: 'Upper Body', muscleGroup: '上半身', status: 'done', durationMin: 40, feeling: 'great', sessionRpe: 6, exercises: [
    { name: 'Push-up', sets: 3, reps: 15, weight: 0 },
    { name: 'Dumbbell Row', sets: 3, reps: 12, weight: 12, rpe: 6, rir: 3 }
  ] },
  { id: 'w3', date: dateBackISO(5), title: 'Cardio + Core', muscleGroup: 'คาร์ดิโอ/แกนกลาง', status: 'done', durationMin: 30, feeling: 'okay', sessionRpe: 8, exercises: [
    { name: 'Treadmill', sets: 1, reps: 1, weight: 0, duration: '20 min' },
    { name: 'Plank', sets: 3, reps: 1, weight: 0, duration: '45 sec' }
  ] },
  { id: 'w4', date: dateBackISO(0), title: 'Leg Day', muscleGroup: 'ขา', status: 'planned', durationMin: 50, exercises: [
    { name: 'Leg Press', sets: 4, reps: 12, weight: 60 },
    { name: 'Lunges', sets: 3, reps: 10, weight: 10 },
    { name: 'Calf Raise', sets: 3, reps: 15, weight: 20 }
  ] }
];

export const DEMO_TEMPLATES = [
  { id: 't1', title: 'Full Body Beginner', muscleGroup: 'เต็มร่างกาย', durationMin: 40, type: 'strength', sections: [
    { name: 'Warm-up', items: [{ name: 'Jumping Jacks', duration: '5 min' }] },
    { name: 'Main Workout', items: [
      { name: 'Squat', sets: 3, reps: 12, weight: 0 },
      { name: 'Push-up', sets: 3, reps: 10, weight: 0 }
    ] },
    { name: 'Cool-down', items: [{ name: 'Stretching', duration: '5 min' }] }
  ] },
  { id: 't2', title: 'Cardio HIIT', muscleGroup: 'คาร์ดิโอ', durationMin: 25, type: 'cardio', sections: [
    { name: 'Main Workout', items: [
      { name: 'Burpees', sets: 4, reps: 10 },
      { name: 'Mountain Climbers', sets: 4, reps: 20 }
    ] }
  ] }
];

export const DEMO_EXPENSES = [
  { id: 'e1', date: dateBackISO(0), time: '12:30', type: 'expense', amount: 55, category: 'food', payee: 'ร้านข้าวมันไก่', note: 'กลางวัน' },
  { id: 'e2', date: dateBackISO(0), time: '08:15', type: 'expense', amount: 30, category: 'transport', payee: 'BTS', note: 'ค่าเดินทาง' },
  { id: 'e3', date: dateBackISO(0), time: '15:00', type: 'expense', amount: 60, category: 'food', payee: 'คาเฟ่', note: 'กาแฟ + เค้ก' },
  { id: 'e4', date: dateBackISO(1), type: 'expense', amount: 250, category: 'shopping', payee: 'Watsons', note: 'ของใช้' },
  { id: 'e5', date: dateBackISO(2), type: 'expense', amount: 180, category: 'food', payee: 'Lotus', note: 'ซื้อของสัปดาห์' },
  { id: 'e6', date: dateBackISO(5), type: 'expense', amount: 350, category: 'health', payee: 'คลินิก', note: 'ตรวจสุขภาพ' },
  { id: 'e7', date: dateBackISO(10), type: 'expense', amount: 1200, category: 'bills', payee: 'AIS', note: 'ค่าโทรศัพท์รายเดือน' },
  { id: 'e8', date: dateBackISO(15), type: 'expense', amount: 450, category: 'entertainment', payee: 'SF Cinema', note: 'ดูหนัง + ป๊อปคอร์น' },
  { id: 'e9', date: dateBackISO(1), type: 'income', amount: 25000, category: 'salary', payee: 'บริษัท', note: 'เงินเดือน' },
  { id: 'e10', date: dateBackISO(20), type: 'expense', amount: 800, category: 'food', payee: 'ร้านอาหาร', note: 'ทานกับเพื่อน' },
  { id: 'e11', date: dateBackISO(25), type: 'expense', amount: 199, category: 'transport', payee: 'Grab', note: '' },
  { id: 'e12', date: dateBackISO(28), type: 'expense', amount: 320, category: 'shopping', payee: 'Shopee', note: 'เสื้อผ้า' }
];

export const DEMO_EXPENSE_SETTINGS = [
  { id: 'profile', kind: 'profile' },
  { id: 'planner', kind: 'planner', weekPattern: 'A', routines: [
    { id: 'r1', name: 'ดื่มน้ำ', emoji: '💧', days: ['mon','tue','wed','thu','fri','sat','sun'] },
    { id: 'r2', name: 'ออกกำลังกาย', emoji: '🏃', days: ['mon','wed','fri'] },
    { id: 'r3', name: 'ทานวิตามิน', emoji: '💊', days: ['mon','tue','wed','thu','fri','sat','sun'] }
  ] },
  { id: 'expense_rules', kind: 'expense_rule', rules: [
    { keyword: 'BTS', category: 'transport' },
    { keyword: 'Grab', category: 'transport' },
    { keyword: 'Lotus', category: 'food' },
    { keyword: 'Watsons', category: 'shopping' }
  ] },
  { id: 'expense_budgets', kind: 'expense_budget', budgets: [
    { category: 'food', amount: 6000 },
    { category: 'transport', amount: 1500 },
    { category: 'shopping', amount: 3000 },
    { category: 'entertainment', amount: 2000 }
  ] }
];

export const DEMO_INVENTORY = [
  { id: 'inv1', name: 'นมถั่วเหลือง', category: 'อาหาร', quantity: 2, unit: 'กล่อง', expiryDate: dateBackISO(-14), note: '' },
  { id: 'inv2', name: 'เจลอาบน้ำ', category: 'ของใช้', quantity: 1, unit: 'ขวด', expiryDate: '', note: 'เหลือน้อย' },
  { id: 'inv3', name: 'ยาพาราเซตามอล', category: 'ยา', quantity: 10, unit: 'เม็ด', expiryDate: dateBackISO(-120), note: '' },
  { id: 'inv4', name: 'ครีมกันแดด', category: 'สกินแคร์', quantity: 1, unit: 'ขวด', expiryDate: dateBackISO(-60), note: '' },
  { id: 'inv5', name: 'น้ำมันพืช', category: 'อาหาร', quantity: 1, unit: 'ขวด', expiryDate: '', note: '' },
  { id: 'inv6', name: 'แชมพู', category: 'ของใช้', quantity: 0, unit: 'ขวด', expiryDate: '', note: 'หมดแล้ว' }
];

export const DEMO_REMINDERS = [
  { id: 'rem1', title: 'นัดหมอฟัน', date: dateBackISO(-2), time: '14:00', type: 'appointment', note: 'ตรวจเคลือบฟัน' },
  { id: 'rem2', title: 'ครบกำหนดเปลี่ยนน้ำมันเครื่อง', date: dateBackISO(-10), time: '', type: 'reminder', note: 'รถยนต์' },
  { id: 'rem3', title: 'วันครบรอบ', date: dateBackISO(-30), time: '', type: 'reminder', note: '' }
];

export const DEMO_PET_PROFILES = [
  { id: 'pet1', name: 'มะลิ', species: 'หมา', breed: 'โกลเด้น รีทรีฟเวอร์', weight: 28, birthDate: '2020-03-15', note: 'แม่ที่รัก' }
];

export const DEMO_PET_CARE = [
  { id: 'pc1', date: dateBackISO(3), recordKind: 'symptom', appetite: 2, energy: 2, stool: 1, vomit: 0, skin: 1, cough: 0, value: 38.5, note: 'ซึม กินน้ำน้อย' },
  { id: 'pc2', date: dateBackISO(7), recordKind: 'symptom', appetite: 3, energy: 3, stool: 2, vomit: 0, skin: 1, cough: 0, value: 38.2, note: 'ดีขึ้น' },
  { id: 'pc3', date: dateBackISO(10), recordKind: 'checkup', title: 'ฉีดวัคซีน', note: 'ปีละครั้ง' }
];

export function buildDemoState() {
  return {
    period: [...DEMO_PERIOD],
    body: [...DEMO_BODY],
    customFoods: [],
    symptoms: [...DEMO_SYMPTOMS],
    skinRecords: [],
    skincareProducts: [],
    ingredientBlacklist: [],
    workouts: [...DEMO_WORKOUTS],
    templates: [...DEMO_TEMPLATES],
    labs: [],
    profile: DEMO_PROFILE,
    homeWidgets: null,
    planner: DEMO_EXPENSE_SETTINGS.find(s => s.id === 'planner'),
    pushSettings: null,
    expenses: [...DEMO_EXPENSES],
    expenseRecords: [...DEMO_EXPENSES],
    expenseSettings: [...DEMO_EXPENSE_SETTINGS],
    legacyExpenseDocs: [],
    todayFood: [...DEMO_TODAY_FOOD],
    trackedProducts: DEMO_INVENTORY,
    replacements: [],
    petProfiles: [...DEMO_PET_PROFILES],
    petCare: [...DEMO_PET_CARE],
    petFoods: [],
    assistantNotes: [],
    userFeedback: [],
    loaded: { period: true, body: true }
  };
}

export const PREVIEW_UID = '__preview__';
export const PREVIEW_USER = {
  uid: PREVIEW_UID,
  displayName: 'ผู้ใช้ตัวอย่าง',
  email: 'preview@trackme.demo',
  isPreview: true
};
