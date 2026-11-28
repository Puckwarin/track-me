import { state, emit } from './state.js';
import { addDays, localDateStr, round1, toast } from './util.js';
import { expenseSettingDocId } from './expenseLogic.js';

export const PREVIEW_UID = 'preview-guest';
export const PREVIEW_USER = Object.freeze({
  uid: PREVIEW_UID,
  displayName: 'โหมดดูตัวอย่าง',
  email: '',
  isAnonymous: true,
  isPreview: true
});

let previewStore = null;
let watchedFoodDate = null;
let watchedFoodCallback = null;

export function isPreviewMode() {
  return Boolean(state.isPreview);
}

export function guardPreviewWrite(actionLabel = 'การแก้ไขนี้') {
  if (!isPreviewMode()) return false;
  toast(`โหมดดูตัวอย่าง: ${actionLabel}ยังไม่ถูกบันทึกลงบัญชีจริง (เข้าสู่ระบบ Google เพื่อบันทึกถาวร)`);
  return true;
}

function monthDay(today, monthsBack, dayOfMonth) {
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  const d = new Date(y, m - 1 - monthsBack, 1);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(Math.max(1, dayOfMonth), maxDay);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function createPreviewDataset(today = localDateStr()) {
  const yesterday = addDays(today, -1);
  const twoDaysAgo = addDays(today, -2);
  const d3 = addDays(today, -3);
  const d5 = addDays(today, -5);
  const d7 = addDays(today, -7);
  const d10 = addDays(today, -10);
  const d14 = addDays(today, -14);
  const m1a = monthDay(today, 1, 8);
  const m1b = monthDay(today, 1, 18);
  const m2a = monthDay(today, 2, 10);
  const m2b = monthDay(today, 2, 22);
  const m3a = monthDay(today, 3, 12);
  const m4a = monthDay(today, 4, 14);
  const m5a = monthDay(today, 5, 16);

  const profile = {
    id: 'profile',
    sex: 'female',
    birthYear: 1996,
    heightCm: 163,
    weightKg: 56.2,
    activity: 'moderate',
    adjust: -200,
    meals: [
      { id: 'breakfast', name: 'มื้อเช้า' },
      { id: 'lunch', name: 'มื้อกลางวัน' },
      { id: 'dinner', name: 'มื้อเย็น' },
      { id: 'snack', name: 'ของว่าง' }
    ]
  };

  const planner = {
    id: 'planner',
    altAnchor: addDays(today, -14),
    routines: [
      { id: 'rt_water', title: 'ดื่มน้ำอย่างน้อย 2 ลิตร', days: [0, 1, 2, 3, 4, 5, 6], weekPattern: 'every', time: '09:00' },
      { id: 'rt_stretch', title: 'ยืดเหยียดคลายบ่าไหล่ 10 นาที', days: [0, 1, 2, 3, 4, 5, 6], weekPattern: 'every', time: '18:30' },
      { id: 'rt_vit', title: 'ทานวิตามินรวมหลังอาหารเช้า', days: [0, 1, 2, 3, 4, 5, 6], weekPattern: 'every', time: '08:30' },
      { id: 'rt_budget', title: 'เช็กสรุปค่าใช้จ่ายก่อนนอน', days: [0, 1, 2, 3, 4, 5, 6], weekPattern: 'every', time: '21:30' }
    ],
    doneMap: {
      [today]: ['rt_water', 'rt_vit'],
      [yesterday]: ['rt_water', 'rt_stretch', 'rt_vit', 'rt_budget']
    },
    recentDone: [
      { id: 'rt_water', title: 'ดื่มน้ำอย่างน้อย 2 ลิตร', icon: '💧', date: today },
      { id: 'rt_vit', title: 'ทานวิตามินรวมหลังอาหารเช้า', icon: '💊', date: today }
    ]
  };

  const food_records = [
    { id: 'pf_1', date: today, mealId: 'breakfast', meal: 'มื้อเช้า', name: 'กรีกโยเกิร์ต + กราโนล่า + บลูเบอร์รี่', quantity: 1, portionUnit: 'ถ้วย', calories: 310, protein: 22, carbs: 34, fat: 8, sugar: 9, sodium: 85 },
    { id: 'pf_2', date: today, mealId: 'snack', meal: 'ของว่าง', name: 'มัทฉะลาเต้เย็น (นมอัลมอนด์ ไม่หวาน)', quantity: 1, portionUnit: 'แก้ว', calories: 95, protein: 4, carbs: 7, fat: 5, sugar: 2, sodium: 70 },
    { id: 'pf_3', date: today, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'ข้าวไรซ์เบอร์รี่ + อกไก่นึ่งสมุนไพร + ผักลวก', quantity: 1, portionUnit: 'จาน', calories: 520, protein: 42, carbs: 56, fat: 11, sugar: 3, sodium: 420 },
    { id: 'pf_4', date: yesterday, mealId: 'breakfast', meal: 'มื้อเช้า', name: 'ไข่ต้ม 2 ฟอง + ขนมปังโฮลวีต', quantity: 1, portionUnit: 'ชุด', calories: 340, protein: 20, carbs: 30, fat: 14, sugar: 3, sodium: 310 },
    { id: 'pf_5', date: yesterday, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'เกาเหลาหมูตุ๋นผักรวม + ข้าวกล้อง', quantity: 1, portionUnit: 'ชาม', calories: 540, protein: 35, carbs: 54, fat: 17, sugar: 4, sodium: 690 },
    { id: 'pf_6', date: yesterday, mealId: 'dinner', meal: 'มื้อเย็น', name: 'สลัดแซลมอนย่างน้ำสลัดงาญี่ปุ่น', quantity: 1, portionUnit: 'จาน', calories: 460, protein: 33, carbs: 18, fat: 26, sugar: 5, sodium: 480 },
    { id: 'pf_7', date: twoDaysAgo, mealId: 'breakfast', meal: 'มื้อเช้า', name: 'โอ๊ตมีลค้างคืน + เมล็ดเจีย + กล้วยหอม', quantity: 1, portionUnit: 'ถ้วย', calories: 390, protein: 16, carbs: 58, fat: 10, sugar: 12, sodium: 95 },
    { id: 'pf_8', date: twoDaysAgo, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'ข้าวกะเพราอกไก่สับ + ไข่ดาวน้ำ', quantity: 1, portionUnit: 'จาน', calories: 510, protein: 38, carbs: 55, fat: 13, sugar: 3, sodium: 620 },
    { id: 'pf_9', date: twoDaysAgo, mealId: 'dinner', meal: 'มื้อเย็น', name: 'ต้มจืดเต้าหู้หมูสับสาหร่าย + ผักกาดขาว', quantity: 1, portionUnit: 'ถ้วย', calories: 360, protein: 27, carbs: 24, fat: 16, sugar: 3, sodium: 540 },
    { id: 'pf_10', date: d3, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'สุกี้น้ำอกไก่รวมมิตรผัก', quantity: 1, portionUnit: 'ชาม', calories: 480, protein: 36, carbs: 52, fat: 11, sugar: 6, sodium: 720 },
    { id: 'pf_11', date: d5, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'ข้าวหน้าปลาซาบะย่างซีอิ๊ว', quantity: 1, portionUnit: 'จาน', calories: 610, protein: 32, carbs: 64, fat: 22, sugar: 7, sodium: 760 },
    { id: 'pf_12', date: d7, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'ยำวุ้นเส้นทะเล + อกไก่ต้ม', quantity: 1, portionUnit: 'จาน', calories: 440, protein: 34, carbs: 46, fat: 10, sugar: 5, sodium: 690 },
    { id: 'pf_13', date: d7, mealId: 'dinner', meal: 'มื้อเย็น', name: 'เวย์โปรตีนเชค + อัลมอนด์', quantity: 1, portionUnit: 'แก้ว', calories: 290, protein: 28, carbs: 10, fat: 14, sugar: 2, sodium: 140 },
    { id: 'pf_14', date: m1a, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'ข้าวไรซ์เบอร์รี่ + ปลาดอลลี่นึ่งมะนาว', quantity: 1, portionUnit: 'จาน', calories: 490, protein: 33, carbs: 56, fat: 12 },
    { id: 'pf_15', date: m1b, mealId: 'dinner', meal: 'มื้อเย็น', name: 'สลัดอกไก่ + ไข่ต้ม', quantity: 1, portionUnit: 'จาน', calories: 430, protein: 36, carbs: 22, fat: 18 },
    { id: 'pf_16', date: m2a, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'ก๋วยเตี๋ยวเส้นหมี่น้ำใสไก่ฉีก', quantity: 1, portionUnit: 'ชาม', calories: 420, protein: 29, carbs: 52, fat: 9 },
    { id: 'pf_17', date: m2b, mealId: 'dinner', meal: 'มื้อเย็น', name: 'เต้าหู้ทรงเครื่องผักรวม', quantity: 1, portionUnit: 'จาน', calories: 380, protein: 24, carbs: 35, fat: 14 },
    { id: 'pf_18', date: m3a, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'ข้าวกล้อง + แกงส้มชะอมกุ้ง', quantity: 1, portionUnit: 'ชุด', calories: 530, protein: 31, carbs: 62, fat: 16 },
    { id: 'pf_19', date: m4a, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'พาสต้าโฮลวีตซอสมะเขือเทศอกไก่', quantity: 1, portionUnit: 'จาน', calories: 560, protein: 34, carbs: 68, fat: 14 },
    { id: 'pf_20', date: m5a, mealId: 'lunch', meal: 'มื้อกลางวัน', name: 'เมี่ยงปลาทูผักสด', quantity: 1, portionUnit: 'ชุด', calories: 470, protein: 30, carbs: 49, fat: 15 }
  ];

  const custom_foods = [
    { id: 'pcf_1', name: 'อกไก่นึ่งสมุนไพร', unit: 'ชิ้น (150g)', gramsPerUnit: 150, category: 'โปรตีน', calories: 220, protein: 35, carbs: 2, fat: 6, favorite: true },
    { id: 'pcf_2', name: 'มัทฉะลาเต้เย็น (ไม่หวาน)', unit: 'แก้ว', gramsPerUnit: 280, category: 'เครื่องดื่ม', calories: 95, protein: 4, carbs: 7, fat: 5, favorite: true },
    { id: 'pcf_3', name: 'ข้าวไรซ์เบอร์รี่หุงสุก', unit: 'ทัพพี (100g)', gramsPerUnit: 100, category: 'คาร์บ', calories: 130, protein: 3, carbs: 28, fat: 1, favorite: false },
    { id: 'pcf_4', name: 'กรีกโยเกิร์ตรสธรรมชาติ', unit: 'ถ้วย (130g)', gramsPerUnit: 130, category: 'ของว่าง', calories: 145, protein: 14, carbs: 7, fat: 6, favorite: true }
  ];

  const period_records = [
    { id: 'pp_1', start: addDays(today, -108), end: addDays(today, -104), flow: 'ปานกลาง', note: 'ปกติ' },
    { id: 'pp_2', start: addDays(today, -80), end: addDays(today, -76), flow: 'ปานกลาง', note: '' },
    { id: 'pp_3', start: addDays(today, -52), end: addDays(today, -48), flow: 'มาก', note: 'ปวดท้องวันแรกเล็กน้อย' },
    { id: 'pp_4', start: addDays(today, -24), end: addDays(today, -20), flow: 'ปานกลาง', note: 'นอนหลับดี' }
  ];

  const body_records = [
    { id: 'pb_m5', date: m5a, weight: 58.6, waist: 71.5, hip: 94.0 },
    { id: 'pb_m4', date: m4a, weight: 58.0, waist: 71.0, hip: 93.5 },
    { id: 'pb_m3', date: m3a, weight: 57.5, waist: 70.2, hip: 93.0 },
    { id: 'pb_m2', date: m2a, weight: 57.1, waist: 69.8, hip: 92.6 },
    { id: 'pb_m1', date: m1a, weight: 56.7, waist: 69.2, hip: 92.2 },
    { id: 'pb_d7', date: d7, weight: 56.5, waist: 69.0, hip: 92.0, arm: 25.5, thigh: 51.0 },
    { id: 'pb_d2', date: twoDaysAgo, weight: 56.3, waist: 68.8, hip: 91.8 },
    { id: 'pb_today', date: today, weight: 56.2, waist: 68.5, hip: 91.8, note: 'ชั่งตอนเช้าก่อนอาหาร' },
    { id: 'zepp_' + d5, date: d5, sleepHours: 7.2, steps: 7420, bedTime: '23:15', wakeTime: '06:28', source: 'zepp_csv' },
    { id: 'zepp_' + d3, date: d3, sleepHours: 6.8, steps: 8650, bedTime: '23:35', wakeTime: '06:25', source: 'zepp_csv' },
    { id: 'zepp_' + twoDaysAgo, date: twoDaysAgo, sleepHours: 7.6, steps: 9340, bedTime: '22:55', wakeTime: '06:32', source: 'zepp_csv' },
    { id: 'zepp_' + yesterday, date: yesterday, sleepHours: 7.4, steps: 8190, bedTime: '23:10', wakeTime: '06:34', source: 'zepp_csv' },
    { id: 'zepp_' + today, date: today, sleepHours: 7.8, steps: 5420, bedTime: '22:50', wakeTime: '06:38', source: 'zepp_csv' }
  ];

  const symptom_records = [
    { id: addDays(today, -24), date: addDays(today, -24), symptoms: { cramps: 2, fatigue: 1 }, mood: 3, stress: 2, note: 'วันแรกของรอบเดือน' },
    { id: d7, date: d7, symptoms: { headache: 1 }, mood: 4, stress: 2, note: 'พักสายตาแล้วดีขึ้น' },
    { id: yesterday, date: yesterday, symptoms: { bloating: 1 }, mood: 4, stress: 1, note: 'อารมณ์สดใส' },
    { id: today, date: today, symptoms: {}, mood: 5, stress: 1, note: 'นอนเต็มอิ่ม รู้สึกสดชื่น' }
  ];

  const skin_records = [
    { id: yesterday, date: yesterday, symptoms: { dry: 1 }, result: 'ทามอยส์เจอไรเซอร์เพิ่มตอนกลางคืน ผิวชุ่มชื้นขึ้น' },
    { id: today, date: today, symptoms: {}, result: 'ผิวเรียบเนียนดี ไม่มีระคายเคือง' }
  ];

  const workout_records = [
    {
      id: 'pw_today',
      date: today,
      type: 'pilates',
      durationMin: 25,
      intensity: 'light',
      estKcal: 85,
      status: 'planned',
      title: 'Pilates & Core ยืดเหยียดเย็น',
      note: 'ทำหลังเลิกงาน 25 นาที'
    },
    {
      id: 'pw_1',
      date: yesterday,
      type: 'lower',
      durationMin: 35,
      intensity: 'moderate',
      estKcal: 165,
      status: 'done',
      title: 'Day A — Lower Body',
      completionStatus: 'complete',
      effortLevel: 'hard',
      postSymptom: 'normal',
      feeling: 'energized',
      sessionRpe: 7,
      completedSetCount: 6,
      performedSets: [
        { name: 'March in Place', section: 'warmup', set: 1, reps: 60, repUnit: 'sec', completed: true },
        { name: 'Goblet Squat', section: 'main', set: 1, weightKg: 4, reps: 12, repUnit: 'reps', completed: true },
        { name: 'Goblet Squat', section: 'main', set: 2, weightKg: 4, reps: 12, repUnit: 'reps', completed: true },
        { name: 'Goblet Squat', section: 'main', set: 3, weightKg: 4, reps: 12, repUnit: 'reps', completed: true },
        { name: 'Glute Bridge', section: 'main', set: 1, weightKg: 4, reps: 15, repUnit: 'reps', completed: true },
        { name: 'Glute Bridge', section: 'main', set: 2, weightKg: 4, reps: 15, repUnit: 'reps', completed: true },
        { name: 'Glute Bridge', section: 'main', set: 3, weightKg: 4, reps: 15, repUnit: 'reps', completed: true },
        { name: 'Hamstring Stretch', section: 'cooldown', set: 1, reps: 45, repUnit: 'sec', completed: true }
      ],
      exerciseFeedback: [
        { name: 'Goblet Squat', section: 'main', rpe: 7, rir: 3, nextAction: 'increase', nextLabel: 'รอบหน้าเพิ่มน้ำหนัก (+1–2 kg) หรือเพิ่ม 1–2 ครั้ง' },
        { name: 'Glute Bridge', section: 'main', rpe: 7, rir: 2, nextAction: 'maintain', nextLabel: 'คงน้ำหนักและเซตเดิม โฟกัสฟอร์มให้แน่น' }
      ],
      note: 'Goblet Squat คุมจังหวะได้ดีมาก',
      sections: {
        warmup: [{ name: 'March in Place', sets: 1, reps: 60, repUnit: 'sec', note: 'วอร์มอัพ' }],
        main: [
          { name: 'Goblet Squat', weightKg: 4, sets: 3, reps: 12, repUnit: 'reps', note: 'หลังตรง' },
          { name: 'Glute Bridge', weightKg: 4, sets: 3, reps: 15, repUnit: 'reps', note: 'เกร็งก้น' }
        ],
        cooldown: [{ name: 'Hamstring Stretch', sets: 1, reps: 45, repUnit: 'sec', note: 'ผ่อนคลาย' }]
      }
    },
    { id: 'pw_2', date: d3, type: 'walk', durationMin: 40, intensity: 'moderate', estKcal: 140, status: 'done', title: 'เดินเร็วช่วงเย็นในสวน', completionStatus: 'complete', effortLevel: 'moderate', postSymptom: 'normal', nextDayRecovery: 'good', nextDayRecoveryDate: twoDaysAgo, feeling: 'good', sessionRpe: 6 },
    { id: 'pw_3', date: d7, type: 'upper', durationMin: 30, intensity: 'moderate', estKcal: 130, status: 'done', title: 'Upper Body & Posture', feeling: 'good', sessionRpe: 7 },
    { id: 'pw_4', date: m1a, type: 'full', durationMin: 40, intensity: 'moderate', estKcal: 195, status: 'done', title: 'Full Body Circuit', feeling: 'energized', sessionRpe: 8 },
    { id: 'pw_5', date: m1b, type: 'walk', durationMin: 35, intensity: 'light', estKcal: 105, status: 'done', title: 'เดินเร็ว 35 นาที', feeling: 'good', sessionRpe: 5 },
    { id: 'pw_6', date: m2a, type: 'lower', durationMin: 30, intensity: 'moderate', estKcal: 150, status: 'done', title: 'Lower Body Foundation', feeling: 'good', sessionRpe: 7 },
    { id: 'pw_7', date: m3a, type: 'pilates', durationMin: 30, intensity: 'moderate', estKcal: 115, status: 'done', title: 'Mat Pilates', feeling: 'good', sessionRpe: 6 }
  ];

  const workout_templates = [
    {
      id: 'pwt_1',
      name: 'Day A — Lower Body (25-30 นาที)',
      type: 'lower',
      note: 'เน้นขา สะโพก และการทรงตัว',
      sections: {
        warmup: [{ name: 'March in Place', sets: 1, reps: 60, repUnit: 'sec' }],
        main: [
          { name: 'Goblet Squat', weightKg: 4, sets: 3, reps: 12, repUnit: 'reps' },
          { name: 'Standing RDL', weightKg: 4, sets: 3, reps: 12, repUnit: 'reps' },
          { name: 'Glute Bridge', weightKg: 0, sets: 3, reps: 15, repUnit: 'reps' }
        ],
        cooldown: [{ name: 'Child’s Pose', sets: 1, reps: 45, repUnit: 'sec' }]
      }
    },
    {
      id: 'pwt_2',
      name: 'Day B — Upper & Posture',
      type: 'upper',
      note: 'เสริมกล้ามเนื้อหลังและไหล่ ลดปวดคอ-บ่า',
      sections: {
        warmup: [{ name: 'Cat-Cow', sets: 1, reps: 60, repUnit: 'sec' }],
        main: [
          { name: 'Bent-Over Row', weightKg: 3, sets: 3, reps: 12, repUnit: 'reps' },
          { name: 'Shoulder Press', weightKg: 2, sets: 3, reps: 10, repUnit: 'reps' },
          { name: 'Plank', weightKg: 0, sets: 2, reps: 30, repUnit: 'sec' }
        ],
        cooldown: [{ name: 'Shoulder Stretch', sets: 1, reps: 45, repUnit: 'sec' }]
      }
    }
  ];

  const lab_records = [
    { id: 'pl_1', date: m1a, name: 'Fasting Blood Glucose', value: 88, unit: 'mg/dL', refLow: 70, refHigh: 99, note: 'อยู่ในเกณฑ์ปกติ' },
    { id: 'pl_2', date: m1a, name: 'HbA1c', value: 5.1, unit: '%', refLow: 4.0, refHigh: 5.6, note: 'ควบคุมระดับน้ำตาลดี' },
    { id: 'pl_3', date: m1a, name: 'Vitamin D (25-OH)', value: 26, unit: 'ng/mL', refLow: 30, refHigh: 100, note: 'ค่อนข้างต่ำ แนะนำรับแดดเช้าเพิ่ม' },
    { id: 'pl_4', date: m1a, name: 'LDL Cholesterol', value: 108, unit: 'mg/dL', refLow: 0, refHigh: 130, note: '' }
  ];

  const expense_records = [
    { id: 'pe_1', type: 'income', amount: 34500, category: 'เงินเดือน', date: today.slice(0, 7) + '-01', time: '09:05', merchant: 'บริษัท เอ บี ซี จำกัด', note: 'เงินเดือนประจำเดือน', source: 'manual' },
    { id: 'pe_2', type: 'expense', amount: 145, category: 'อาหาร', date: today, time: '12:20', merchant: 'ร้านข้าวสุขภาพใกล้ที่ทำงาน', note: 'มื้อกลางวัน', source: 'manual' },
    { id: 'pe_3', type: 'expense', amount: 85, category: 'เครื่องดื่ม/คาเฟ่', date: today, time: '09:40', merchant: 'Matcha Haus', note: 'มัทฉะไม่หวาน', source: 'manual' },
    { id: 'pe_4', type: 'expense', amount: 320, category: 'อาหาร', date: yesterday, time: '19:10', merchant: 'Salad Bar', note: 'สลัดแซลมอน', source: 'manual' },
    { id: 'pe_5', type: 'expense', amount: 94, category: 'เดินทาง', date: yesterday, time: '08:25', merchant: 'BTS Skytrain', note: 'ค่าเดินทางไปกลับ', source: 'manual' },
    { id: 'pe_6', type: 'expense', amount: 590, category: 'สัตว์เลี้ยง', date: twoDaysAgo, time: '17:30', merchant: 'Pet Lovers Shop', note: 'อาหารเม็ดแมว + ทรายเต้าหู้', source: 'manual' },
    { id: 'pe_7', type: 'expense', amount: 640, category: 'บิล/ค่าใช้จ่ายประจำ', date: d3, time: '10:00', merchant: 'AIS Fibre', note: 'ค่าอินเทอร์เน็ตบ้าน', source: 'recurring' },
    { id: 'pe_8', type: 'expense', amount: 420, category: 'ของใช้ในบ้าน', date: d5, time: '18:45', merchant: 'Tops Market', note: 'โยเกิร์ต ผลไม้ และของใช้', source: 'manual' },
    { id: 'pe_9', type: 'expense', amount: 1290, category: 'สุขภาพ', date: d10, time: '14:15', merchant: 'ร้านยา/วิตามิน', note: 'Vitamin D3 + Magnesium', source: 'manual' },
    { id: 'pe_10', type: 'income', amount: 34500, category: 'เงินเดือน', date: monthDay(today, 1, 1), time: '09:00', merchant: 'บริษัท เอ บี ซี จำกัด', note: 'เงินเดือน', source: 'manual' },
    { id: 'pe_11', type: 'expense', amount: 14200, category: 'อาหาร', date: m1a, time: '12:00', merchant: 'รวมค่าใช้จ่ายเดือนก่อน', note: 'ค่าอาหาร/บิล/เดินทาง', source: 'manual' },
    { id: 'pe_12', type: 'income', amount: 34500, category: 'เงินเดือน', date: monthDay(today, 2, 1), time: '09:00', merchant: 'บริษัท เอ บี ซี จำกัด', note: 'เงินเดือน', source: 'manual' },
    { id: 'pe_13', type: 'expense', amount: 15800, category: 'บิล/ค่าใช้จ่ายประจำ', date: m2a, time: '12:00', merchant: 'รวมค่าใช้จ่าย', note: 'บิลและอาหารประจำเดือน', source: 'manual' },
    { id: 'pe_14', type: 'income', amount: 32000, category: 'เงินเดือน', date: monthDay(today, 3, 1), time: '09:00', merchant: 'บริษัท เอ บี ซี จำกัด', note: 'เงินเดือน', source: 'manual' },
    { id: 'pe_15', type: 'expense', amount: 13900, category: 'อาหาร', date: m3a, time: '12:00', merchant: 'รวมค่าใช้จ่าย', note: 'รายจ่ายประจำเดือน', source: 'manual' },
    { id: 'pe_16', type: 'income', amount: 32000, category: 'เงินเดือน', date: monthDay(today, 4, 1), time: '09:00', merchant: 'บริษัท เอ บี ซี จำกัด', note: 'เงินเดือน', source: 'manual' },
    { id: 'pe_17', type: 'expense', amount: 14600, category: 'ช้อปปิ้ง', date: m4a, time: '12:00', merchant: 'รวมค่าใช้จ่าย', note: 'รายจ่ายประจำเดือน', source: 'manual' },
    { id: 'pe_18', type: 'income', amount: 32000, category: 'เงินเดือน', date: monthDay(today, 5, 1), time: '09:00', merchant: 'บริษัท เอ บี ซี จำกัด', note: 'เงินเดือน', source: 'manual' },
    { id: 'pe_19', type: 'expense', amount: 13400, category: 'อาหาร', date: m5a, time: '12:00', merchant: 'รวมค่าใช้จ่าย', note: 'รายจ่ายประจำเดือน', source: 'manual' }
  ];

  const expense_settings = [
    profile,
    planner,
    { id: expenseSettingDocId('expense_budget', 'อาหาร'), kind: 'expense_budget', category: 'อาหาร', amount: 6000 },
    { id: expenseSettingDocId('expense_budget', 'เครื่องดื่ม/คาเฟ่'), kind: 'expense_budget', category: 'เครื่องดื่ม/คาเฟ่', amount: 1500 },
    { id: expenseSettingDocId('expense_budget', 'เดินทาง'), kind: 'expense_budget', category: 'เดินทาง', amount: 1800 },
    { id: expenseSettingDocId('expense_budget', 'ช้อปปิ้ง'), kind: 'expense_budget', category: 'ช้อปปิ้ง', amount: 3000 },
    { id: expenseSettingDocId('expense_budget', 'บิล/ค่าใช้จ่ายประจำ'), kind: 'expense_budget', category: 'บิล/ค่าใช้จ่ายประจำ', amount: 2500 },
    { id: expenseSettingDocId('expense_rule', 'BTS'), kind: 'expense_rule', keyword: 'BTS', category: 'เดินทาง' },
    { id: expenseSettingDocId('expense_rule', 'Matcha'), kind: 'expense_rule', keyword: 'Matcha', category: 'เครื่องดื่ม/คาเฟ่' },
    { id: expenseSettingDocId('expense_rule', 'Tops Market'), kind: 'expense_rule', keyword: 'Tops Market', category: 'ของใช้ในบ้าน' },
    { id: expenseSettingDocId('expense_rule', 'AIS Fibre'), kind: 'expense_rule', keyword: 'AIS Fibre', category: 'บิล/ค่าใช้จ่ายประจำ' },
    { id: 'exp_acc_bank', kind: 'expense_account', name: 'บัญชีเงินออมหลัก', accountType: 'bank', balance: 48500 },
    { id: 'exp_acc_cash', kind: 'expense_account', name: 'กระเป๋าเงินสด/พร้อมเพย์', accountType: 'cash', balance: 3250 },
    { id: 'note_preview_1', kind: 'assistant_note', name: 'สรุปเป้าหมายเดือนนี้', category: 'สุขภาพ', note: 'ตั้งเป้าเพิ่มผักใบเขียวในมื้อเย็น และเดินให้ได้เฉลี่ย 8,000 ก้าว/วัน', date: yesterday, source: 'manual' },
    { id: 'note_preview_2', kind: 'assistant_note', name: 'นัดตรวจสุขภาพประจำปี', category: 'การนัดหมาย', note: 'เช็ก Vitamin D ซ้ำในอีก 3 เดือนหลังทานอาหารเสริมต่อเนื่อง', date: d7, source: 'manual' }
  ];

  const pet_profiles = [
    {
      id: 'pet_mochi',
      name: 'โมจิ',
      kind: 'แมวสก็อตติชโฟลด์ (ทำหมันแล้ว)',
      birthDate: '2022-05-14',
      weightKg: 4.2,
      lifeStage: 'neutered',
      weightHistory: [
        { date: m2a, weightKg: 4.4 },
        { date: m1a, weightKg: 4.3 },
        { date: today, weightKg: 4.2 }
      ]
    }
  ];

  const pet_food_records = [
    { id: 'pf_pet_1', petId: 'pet_mochi', date: today, name: 'อาหารเม็ดสูตรคุมน้ำหนัก', grams: 55, kcalPer100: 345, allergy: 'safe', note: 'ทานหมดชาม' },
    { id: 'pf_pet_2', petId: 'pet_mochi', date: yesterday, name: 'อาหารเปียกทูน่าผสมฟักทอง', grams: 70, kcalPer100: 85, allergy: 'safe', note: 'มื้อเย็น' }
  ];

  const pet_care_records = [
    { id: 'pc_1', petId: 'pet_mochi', kind: 'vaccine', title: 'หยดยาป้องกันเห็บหมัดรายเดือน', date: d14, nextDate: addDays(today, 3), remindDays: 5, done: false, note: 'ใช้สูตรแมวโต' },
    { id: 'pc_2', petId: 'pet_mochi', kind: 'grooming', title: 'ตัดเล็บและเช็ดหู', date: d5, nextDate: addDays(today, 9), remindDays: 3, done: false, note: '' }
  ];

  const tracked_products = [
    { id: 'tp_1', name: 'วิตามิน D3 (1,000 IU)', category: 'วิตามิน/ยา', quantity: 5, unit: 'เม็ด', lowAt: 7, expiryDate: addDays(today, 120), remindDays: 7, lowDismissed: false, dismissedFor: null },
    { id: 'tp_2', name: 'กันแดดเนื้อเจล SPF50+', category: 'สกินแคร์', quantity: 2, unit: 'หลอด', lowAt: 1, openedDate: addDays(today, -45), paoMonths: 12, remindDays: 14, lowDismissed: false, dismissedFor: null },
    { id: 'tp_3', name: 'ทรายแมวเต้าหู้ 6L', category: 'สัตว์เลี้ยง', quantity: 1, unit: 'ถุง', lowAt: 1, remindDays: 7, lowDismissed: false, dismissedFor: null }
  ];

  const replacement_records = [
    { id: 'rr_1', name: 'เปลี่ยนไส้กรองน้ำพุน้องโมจิ', date: addDays(today, -27), nextDate: addDays(today, 2), intervalDays: 30, remindDays: 3, done: false, dismissedFor: null, note: 'ล้างถาดก่อนใส่ไส้กรองใหม่' },
    { id: 'rr_2', name: 'เปลี่ยนหัวแปรงสีฟันไฟฟ้า', date: addDays(today, -75), nextDate: addDays(today, 15), intervalDays: 90, remindDays: 7, done: false, dismissedFor: null, note: '' }
  ];

  const skincare_products = [
    { id: 'sk_1', name: 'Gentle Barrier Cleanser', brand: 'CeraCare', step: 'cleanser', status: 'using', rating: 5, note: 'อ่อนโยน ไม่แห้งตึง' },
    { id: 'sk_2', name: 'Soothing Ceramide Cream', brand: 'AquaMist', step: 'moisturizer', status: 'using', rating: 5, note: 'ใช้กลางคืนช่วยผิวชุ่มชื้น' }
  ];

  const ingredient_blacklist = [
    { id: 'list', ingredients: 'Fragrance\nDenatured Alcohol\nEssential Oils' }
  ];

  return {
    food_records,
    custom_foods,
    period_records,
    body_records,
    symptom_records,
    skin_records,
    workout_records,
    workout_templates,
    lab_records,
    expense_records,
    settings: expense_settings,
    pet_profiles,
    pet_food_records,
    pet_care_records,
    tracked_products,
    replacement_records,
    skincare_products,
    ingredient_blacklist
  };
}

export function initPreviewStore(today = localDateStr()) {
  previewStore = createPreviewDataset(today);
  watchedFoodDate = null;
  watchedFoodCallback = null;
  return previewStore;
}

export function resetPreviewStore() {
  previewStore = null;
  watchedFoodDate = null;
  watchedFoodCallback = null;
}

export function clearPreviewStorage() {
  if (typeof localStorage === 'undefined') return;
  const keys = [
    `trackme-navigation-v1:${PREVIEW_UID}`,
    `trackme_home_widgets:v1:${PREVIEW_UID}`,
    `summary_cache_${PREVIEW_UID}`
  ];
  keys.forEach(k => {
    try { localStorage.removeItem(k); } catch {}
  });
}

function ensureStore() {
  if (!previewStore) initPreviewStore();
  return previewStore;
}

export function getPreviewCollection(colName) {
  const store = ensureStore();
  const rows = store[colName];
  return Array.isArray(rows) ? rows.map(item => ({ ...item })) : [];
}

export function getPreviewRecordsInRange(colName, from, to) {
  return getPreviewCollection(colName).filter(r => {
    const d = r?.date || '';
    return d >= from && d <= to;
  });
}

export function getPreviewFoodByDate(date) {
  return getPreviewCollection('food_records').filter(r => r.date === date);
}

export function registerPreviewFoodWatcher(date, cb) {
  watchedFoodDate = date;
  watchedFoodCallback = cb;
  cb(getPreviewFoodByDate(date));
}

function syncFoodLiveState() {
  const today = localDateStr();
  state.todayFood = getPreviewFoodByDate(today);
  state.loaded = { ...(state.loaded || {}), todayFood: true };
  if (watchedFoodCallback && watchedFoodDate) {
    watchedFoodCallback(getPreviewFoodByDate(watchedFoodDate));
  }
  window.dispatchEvent(new Event('trackme:data-change'));
}

export function previewAddFood(record) {
  const store = ensureStore();
  const id = 'pf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entry = { id, ...record };
  store.food_records.push(entry);
  syncFoodLiveState();
  return Promise.resolve({ id });
}

export function previewUpdateFood(id, updates) {
  const store = ensureStore();
  const idx = store.food_records.findIndex(r => r.id === id);
  if (idx >= 0) {
    store.food_records[idx] = { ...store.food_records[idx], ...updates };
    syncFoodLiveState();
  }
  return Promise.resolve();
}

export function previewDeleteFood(id) {
  const store = ensureStore();
  store.food_records = store.food_records.filter(r => r.id !== id);
  syncFoodLiveState();
  return Promise.resolve();
}

export function previewAddCustomFood(record) {
  const store = ensureStore();
  const id = 'pcf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const entry = { id, ...record };
  store.custom_foods.push(entry);
  state.customFoods = getPreviewCollection('custom_foods');
  emit('customFoods');
  return Promise.resolve({ id });
}

export function previewUpdateCustomFood(id, updates) {
  const store = ensureStore();
  const idx = store.custom_foods.findIndex(r => r.id === id);
  if (idx >= 0) {
    store.custom_foods[idx] = { ...store.custom_foods[idx], ...updates };
    state.customFoods = getPreviewCollection('custom_foods');
    emit('customFoods');
  }
  return Promise.resolve();
}

export function previewDeleteCustomFood(id) {
  const store = ensureStore();
  store.custom_foods = store.custom_foods.filter(r => r.id !== id);
  state.customFoods = getPreviewCollection('custom_foods');
  emit('customFoods');
  return Promise.resolve();
}

export function previewComputePeriodRoundHint() {
  return round1(28);
}
