import { isDateStr, isValidCalendarDate, localDateStr } from './util.js';

// ตรวจและคัดกรองข้อมูลก่อนเขียนลง Firestore (ใช้ตอนกู้คืน/ย้ายข้อมูล) — เก็บเฉพาะฟิลด์ที่รู้จัก
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100000 ? v : null);
const moneyNum = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100000000 ? Math.round(v * 100) / 100 : null);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const ts = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? new Date() : d; };
const validCalendarDate = isValidCalendarDate;
const sanitizeReminderRule = r => ({
  kind: ['once', 'interval', 'monthly', 'yearly', 'nth_weekday', 'last_weekday', 'same_as', 'weekly_except_linked'].includes(r.kind) ? r.kind : 'once',
  ...(Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6 && { weekday: r.weekday }),
  ...(Number.isInteger(r.nth) && r.nth >= 1 && r.nth <= 5 && { nth: r.nth }),
  ...(Number.isInteger(r.intervalDays) && r.intervalDays > 0 && { intervalDays: r.intervalDays }),
  ...(Number.isInteger(r.repeatMonths) && r.repeatMonths > 0 && { repeatMonths: r.repeatMonths }),
  ...(str(r.linkedId, 80) && { linkedId: str(r.linkedId, 80) }),
  ...(str(r.linkedCol, 40) && { linkedCol: str(r.linkedCol, 40) }),
  ...(str(r.linkedQuery, 120) && { linkedQuery: str(r.linkedQuery, 120) }),
  ...(str(r.summary, 160) && { summary: str(r.summary, 160) })
});

export const SANITIZERS = {
  food_records: o => isDateStr(o.date) && str(o.name) ? {
    date: o.date, meal: str(o.meal, 40), mealId: typeof o.mealId === 'string' && /^[\w-]{1,40}$/.test(o.mealId) ? o.mealId : null, name: str(o.name),
    calories: num(o.calories) ?? 0, protein: num(o.protein) ?? 0, carbs: num(o.carbs) ?? 0, fat: num(o.fat) ?? 0,
    ...(num(o.sugar) !== null && { sugar: num(o.sugar) }), ...(num(o.sodium) !== null && { sodium: num(o.sodium) }),
    ...(num(o.quantity) !== null && { quantity: num(o.quantity) }),
    ...(typeof o.portionUnit === 'string' && { portionUnit: str(o.portionUnit, 24) }),
    ...(num(o.gramsPerUnit) !== null && { gramsPerUnit: num(o.gramsPerUnit) }),
    ...(o.unitNutrition && typeof o.unitNutrition === 'object' && { unitNutrition: Object.fromEntries(['calories','protein','carbs','fat','sugar','sodium'].filter(k => num(o.unitNutrition[k]) !== null).map(k => [k,num(o.unitNutrition[k])])) }),
    ...(num(o.weighedGrams) !== null && { weighedGrams: num(o.weighedGrams) }),
    ...(num(o.edibleFraction) !== null && o.edibleFraction <= 1 && { edibleFraction: o.edibleFraction }),
    ...(num(o.edibleGrams) !== null && { edibleGrams: num(o.edibleGrams) }),
    ...(num(o.edibleUnitGrams) !== null && { edibleUnitGrams: num(o.edibleUnitGrams) }),
    ...(o.edibleFractionSource && { edibleFractionSource: str(o.edibleFractionSource, 300) }),
    ...(str(o.customFoodId, 80) && { customFoodId: str(o.customFoodId, 80) }),
    ...(isDateStr(o.copiedFrom) && { copiedFrom: o.copiedFrom }),
    createdAt: ts(o.createdAt || o.timestamp)
  } : null,
  period_records: o => isDateStr(o.start) && (o.end == null || isDateStr(o.end)) && (!o.end || o.end >= o.start) ? {
    start: o.start, end: o.end || null, flow: str(o.flow, 20), note: str(o.note), createdAt: ts(o.createdAt || o.timestamp)
  } : null,
  body_records: o => validCalendarDate(o.date) && ['weight', 'bust', 'waist', 'hip', 'arm', 'thigh', 'sleepHours', 'sleepMinutes', 'steps'].some(k => num(o[k]) !== null || (k === 'steps' && int(o[k], 0, 500000) !== null)) ? {
    date: o.date,
    weight: num(o.weight), bust: num(o.bust), waist: num(o.waist), hip: num(o.hip), arm: num(o.arm), thigh: num(o.thigh),
    ...(num(o.sleepHours) !== null && o.sleepHours <= 24 && { sleepHours: o.sleepHours }),
    ...(int(o.sleepMinutes, 0, 1440) !== null && { sleepMinutes: o.sleepMinutes }),
    ...(int(o.deepSleepMin, 0, 1440) !== null && { deepSleepMin: o.deepSleepMin }),
    ...(int(o.lightSleepMin, 0, 1440) !== null && { lightSleepMin: o.lightSleepMin }),
    ...(int(o.remSleepMin, 0, 1440) !== null && { remSleepMin: o.remSleepMin }),
    ...(typeof o.bedTime === 'string' && /^\d{2}:\d{2}$/.test(o.bedTime) && { bedTime: o.bedTime }),
    ...(typeof o.wakeTime === 'string' && /^\d{2}:\d{2}$/.test(o.wakeTime) && { wakeTime: o.wakeTime }),
    ...(int(o.steps, 0, 500000) !== null && { steps: o.steps }),
    ...(num(o.distanceKm) !== null && o.distanceKm <= 500 && { distanceKm: o.distanceKm }),
    ...(int(o.activeKcal, 0, 30000) !== null && { activeKcal: o.activeKcal }),
    ...(['manual', 'zepp', 'zepp_csv', 'zepp_ai', 'zepp_scan'].includes(o.source) && { source: o.source }),
    note: str(o.note), createdAt: ts(o.createdAt || o.timestamp),
    ...(o.updatedAt && { updatedAt: ts(o.updatedAt) })
  } : null,
  symptom_records: o => isDateStr(o.date) ? {
    date: o.date,
    symptoms: Object.fromEntries(['cramps', 'backache', 'headache', 'acne', 'fatigue', 'bloating'].map(k => [k, int(o.symptoms?.[k], 0, 3) ?? 0])),
    mood: int(o.mood, 1, 5), stress: int(o.stress, 1, 5), note: str(o.note), updatedAt: ts(o.updatedAt)
  } : null,
  custom_foods: o => str(o.name) && str(o.unit, 60) && num(o.calories) !== null ? {
    name: str(o.name), brand: str(o.brand, 80), unit: str(o.unit, 60), gramsPerUnit: num(o.gramsPerUnit), defaultQuantity:num(o.defaultQuantity), category:str(o.category,80), edibleFraction: num(o.edibleFraction), edibleFractionSource: str(o.edibleFractionSource,300),
    calories: num(o.calories), protein: num(o.protein), carbs: num(o.carbs), fat: num(o.fat), sugar: num(o.sugar), sodium: num(o.sodium),
    ...(o.hiwpinto && typeof o.hiwpinto === 'object' && {
      hiwpinto: {
        shopCalories: num(o.hiwpinto.shopCalories), shopProtein: num(o.hiwpinto.shopProtein),
        shopCarbs: num(o.hiwpinto.shopCarbs), shopFat: num(o.hiwpinto.shopFat),
        sideCarbs: num(o.hiwpinto.sideCarbs), includedRice: o.hiwpinto.includedRice === true,
        riceProfile: ['white', 'brown', 'riceberry'].includes(o.hiwpinto.riceProfile) ? o.hiwpinto.riceProfile : 'white',
        riceGrams: o.hiwpinto.riceGrams === 140 ? 140 : 180,
        ...(num(o.hiwpinto.baseRiceGrams) !== null && { baseRiceGrams: num(o.hiwpinto.baseRiceGrams) }),
        ...(num(o.hiwpinto.originalRiceGrams) !== null && { originalRiceGrams: num(o.hiwpinto.originalRiceGrams) }),
        kcalWarn: str(o.hiwpinto.kcalWarn, 300)
      }
    }),
    favorite: o.favorite === true, createdAt: ts(o.createdAt)
  } : null,
  skincare_products: o => str(o.name) ? {
    name: str(o.name), openedDate: isDateStr(o.openedDate) ? o.openedDate : null, paoMonths: int(o.paoMonths, 1, 120), expiryDate: isDateStr(o.expiryDate) ? o.expiryDate : null,
    ingredients: str(o.ingredients, 3000), pros: str(o.pros, 2000), cons: str(o.cons, 2000), createdAt: ts(o.createdAt)
  } : null,
  skin_records: o => isDateStr(o.date) ? { date:o.date, symptoms:Object.fromEntries(['rash','itch','burning','redness','peeling','dryness'].map(k=>[k,int(o.symptoms?.[k],0,3)??0])), result:str(o.result,2000), updatedAt:ts(o.updatedAt) } : null,
  ingredient_blacklist: o => ({ ingredients:str(o.ingredients,5000), updatedAt:ts(o.updatedAt) }),
  pet_profiles: o => str(o.name) && num(o.weightKg) !== null ? { name:str(o.name), kind:str(o.kind,120), birthDate:isDateStr(o.birthDate)?o.birthDate:null, weightKg:num(o.weightKg), weightHistory:Array.isArray(o.weightHistory)?o.weightHistory.filter(x=>isDateStr(x?.date)&&num(x?.weightKg)!==null).slice(-365).map(x=>({date:x.date,weightKg:num(x.weightKg)})):[], lifeStage:['neutered','intact','inactive','puppy-young','puppy-old'].includes(o.lifeStage)?o.lifeStage:'neutered', createdAt:ts(o.createdAt), updatedAt:ts(o.updatedAt) } : null,
  pet_care_records: o => str(o.type,80) && isDateStr(o.date) ? {
    petId:str(o.petId,80), category:str(o.category,60)||'สัตว์เลี้ยง', type:str(o.type,80), date:o.date, nextDate:isDateStr(o.nextDate)?o.nextDate:null,
    ...(o.recordKind === 'symptom' && { recordKind: 'symptom' }),
    ...(o.symptoms && typeof o.symptoms === 'object' && {
      symptoms: Object.fromEntries(['appetite', 'energy', 'stool', 'vomit', 'skin', 'cough'].map(k => [k, int(o.symptoms?.[k], 0, 3) ?? 0]))
    }),
    ...(num(o.value) !== null && o.value >= 30 && o.value <= 45 && { value: o.value }),
    ...(typeof o.dueTime === 'string' && /^\d{2}:\d{2}$/.test(o.dueTime) && { dueTime: o.dueTime }),
    repeatMonths:int(o.repeatMonths,0,120), intervalDays:int(o.intervalDays,0,3650), remindDays:int(o.remindDays,-1,365),
    ...(str(o.rawText, 300) && { rawText: str(o.rawText, 300) }),
    ...(o.rule && typeof o.rule === 'object' && { rule: sanitizeReminderRule(o.rule) }),
    done:o.done===true, ...(isDateStr(o.dismissedFor)&&{dismissedFor:o.dismissedFor}), note:str(o.note,2000), createdAt:ts(o.createdAt), ...(o.updatedAt&&{updatedAt:ts(o.updatedAt)})
  } : null,
  pet_food_records: o => str(o.name) && num(o.grams)!==null && isDateStr(o.date) ? { petId:str(o.petId,80), date:o.date, name:str(o.name), grams:num(o.grams), kcalPer100:num(o.kcalPer100), allergy:['yes','no','unknown'].includes(o.allergy)?o.allergy:'unknown', note:str(o.note,2000), createdAt:ts(o.createdAt) } : null,
  tracked_products: o => str(o.name) && str(o.unit,80) ? {
    name:str(o.name), category:str(o.category,100), quantity:num(o.quantity), unit:str(o.unit,80), lowAt:num(o.lowAt),
    expiryDate:isDateStr(o.expiryDate)?o.expiryDate:null, openedDate:isDateStr(o.openedDate)?o.openedDate:null, paoMonths:int(o.paoMonths,1,120), paoExpiry:isDateStr(o.paoExpiry)?o.paoExpiry:null,
    remindDays:int(o.remindDays,-1,365), ...(isDateStr(o.dismissedFor)&&{dismissedFor:o.dismissedFor}), ...(o.lowDismissed===true&&{lowDismissed:true}),
    ingredients:str(o.ingredients,3000), pros:str(o.pros,2000), cons:str(o.cons,2000), createdAt:ts(o.createdAt), updatedAt:ts(o.updatedAt)
  } : null,
  replacement_records: o => str(o.name) && isDateStr(o.date) ? {
    name:str(o.name), category:str(o.category,60)||'เปลี่ยนของ', date:o.date, repeatMonths:int(o.repeatMonths,0,120), intervalDays:int(o.intervalDays,0,3650),
    nextDate:isDateStr(o.nextDate)?o.nextDate:null,
    ...(typeof o.dueTime === 'string' && /^\d{2}:\d{2}$/.test(o.dueTime) && { dueTime: o.dueTime }),
    remindDays:int(o.remindDays,-1,365),
    ...(str(o.rawText, 300) && { rawText: str(o.rawText, 300) }),
    ...(o.rule && typeof o.rule === 'object' && { rule: sanitizeReminderRule(o.rule) }),
    done:o.done===true, ...(isDateStr(o.dismissedFor)&&{dismissedFor:o.dismissedFor}),
    note:str(o.note,2000), createdAt:ts(o.createdAt), ...(o.updatedAt&&{updatedAt:ts(o.updatedAt)})
  } : null,

  lab_records: o => isDateStr(o.date) && str(o.name,80) && num(o.value) !== null ? {
    date:o.date, name:str(o.name,80), value:num(o.value), unit:str(o.unit,20), refLow:num(o.refLow), refHigh:num(o.refHigh), note:str(o.note,200), createdAt:ts(o.createdAt)
  } : null,
  workout_records: o => isDateStr(o.date) && ['walk','upper','lower','full','pilates','stretch','other'].includes(o.type) ? {
    date:o.date, ...(str(o.title,100)&&{title:str(o.title,100)}), ...(str(o.muscleGroup,100)&&{muscleGroup:str(o.muscleGroup,100)}),
    type:o.type, typeLabel:str(o.typeLabel,40), status:o.status==='planned'?'planned':'done', durationMin:num(o.durationMin), intensity:['light','moderate','vigorous'].includes(o.intensity)?o.intensity:null, estKcal:num(o.estKcal),
    sections:Object.fromEntries(['warmup','main','cooldown'].map(k=>[k,(Array.isArray(o.sections?.[k])?o.sections[k]:[]).slice(0,40).filter(r=>r&&str(r.name,80)).map(r=>({name:str(r.name,80),imageUrl:str(r.imageUrl,1000),...(str(r.refTitle,200)&&{refTitle:str(r.refTitle,200)}),...(str(r.refUrl,1000)&&{refUrl:str(r.refUrl,1000)}),weightKg:num(r.weightKg),perSide:r.perSide===true,sets:int(r.sets,1,99),reps:num(r.reps),repUnit:['sec','min'].includes(r.repUnit)?r.repUnit:'reps',note:str(r.note,400)}))])),
    performedSets:Array.isArray(o.performedSets)?o.performedSets.slice(0,300).filter(x=>x&&str(x.name,80)).map(x=>({name:str(x.name,80),section:['warmup','main','cooldown'].includes(x.section)?x.section:'main',set:int(x.set,1,99),weightKg:num(x.weightKg),reps:num(x.reps),completed:x.completed===true})):[], completedSetCount:int(o.completedSetCount,0,300), volumeKg:num(o.volumeKg),
    ...(['energized','good','tired','exhausted'].includes(o.feeling)&&{feeling:o.feeling}),
    ...(int(o.sessionRpe,1,10)!==null&&{sessionRpe:int(o.sessionRpe,1,10)}),
    ...(['complete','partial'].includes(o.completionStatus)&&{completionStatus:o.completionStatus}),
    ...(['easy','moderate','hard','very_hard'].includes(o.effortLevel)&&{effortLevel:o.effortLevel}),
    ...(['normal','neck_shoulder_tight','limb_fatigue','pain_abnormal'].includes(o.postSymptom)&&{postSymptom:o.postSymptom}),
    ...(['good','sore_mild','sore_multi'].includes(o.nextDayRecovery)&&{nextDayRecovery:o.nextDayRecovery}),
    ...(validCalendarDate(o.nextDayRecoveryDate)&&{nextDayRecoveryDate:o.nextDayRecoveryDate}),
    ...(str(o.reflectionNote,500)&&{reflectionNote:str(o.reflectionNote,500)}),
    ...(Array.isArray(o.exerciseFeedback)&&{exerciseFeedback:o.exerciseFeedback.slice(0,40).filter(x=>x&&str(x.name,80)).map(x=>({name:str(x.name,80),section:['warmup','main','cooldown'].includes(x.section)?x.section:'main',...(int(x.rpe,1,10)!==null&&{rpe:int(x.rpe,1,10)}),...(int(x.rir,0,10)!==null&&{rir:int(x.rir,0,10)}),...(['increase','maintain','deload'].includes(x.nextAction)&&{nextAction:x.nextAction}),...(str(x.nextLabel,120)&&{nextLabel:str(x.nextLabel,120)})}))}),
    note:str(o.note,500), createdAt:ts(o.createdAt), ...(o.updatedAt&&{updatedAt:ts(o.updatedAt)})
  } : null,
  workout_templates: o => str(o.name,60) && ['walk','upper','lower','full','pilates','stretch','other'].includes(o.type) ? {
    name:str(o.name,60), ...(str(o.muscleGroup,100)&&{muscleGroup:str(o.muscleGroup,100)}), ...(num(o.durationMin)!==null&&{durationMin:num(o.durationMin)}), type:o.type,
    sections:Object.fromEntries(['warmup','main','cooldown'].map(k=>[k,(Array.isArray(o.sections?.[k])?o.sections[k]:[]).slice(0,40).filter(r=>r&&str(r.name,80)).map(r=>({name:str(r.name,80),imageUrl:str(r.imageUrl,1000),...(str(r.refTitle,200)&&{refTitle:str(r.refTitle,200)}),...(str(r.refUrl,1000)&&{refUrl:str(r.refUrl,1000)}),weightKg:num(r.weightKg),perSide:r.perSide===true,sets:int(r.sets,1,99),reps:num(r.reps),repUnit:['sec','min'].includes(r.repUnit)?r.repUnit:'reps',note:str(r.note,400)}))])),
    createdAt:ts(o.createdAt)
  } : null,
  expense_records: o => isDateStr(o?.date) && moneyNum(Number(o?.amount)) !== null ? {
    type: ['income', 'transfer'].includes(o.type) ? o.type : 'expense',
    amount: moneyNum(Number(o.amount)),
    category: str(o.category, 60) || 'อื่น ๆ',
    date: o.date,
    ...(typeof o.time === 'string' && /^\d{2}:\d{2}$/.test(o.time) && { time: o.time }),
    merchant: str(o.merchant, 120),
    note: str(o.note, 200),
    source: ['slip_ocr', 'statement', 'recurring'].includes(o.source) ? o.source : 'manual',
    createdAt: typeof o.createdAt === 'string' && o.createdAt ? str(o.createdAt, 40) : new Date(ts(o.createdAt)).toISOString()
  } : null,
  settings: o => {
    // ห้ามสำรองหรือนำเข้า settings/push (มี Push subscription endpoint & keys เฉพาะเครื่อง)
    if (o?.id === 'push' || Array.isArray(o?.subscriptions) || (typeof o?.enabled === 'boolean' && !Array.isArray(o?.routines))) {
      return null;
    }
    if (Array.isArray(o?.routines) || (o?.doneMap && typeof o.doneMap === 'object') || (o?.extras && typeof o.extras === 'object') || Array.isArray(o?.moves) || Array.isArray(o?.skips)) {
      return {
        routines: (Array.isArray(o.routines) ? o.routines : []).slice(0, 80).filter(r => r && str(r.title, 80)).map(r => ({
          id: /^[\w-]{1,40}$/.test(r.id || '') ? r.id : 'r' + Math.random().toString(36).slice(2, 9),
          title: str(r.title, 80),
          days: (Array.isArray(r.days) ? r.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6),
          ...(isDateStr(r.weekStart) && { weekStart: r.weekStart }),
          ...(['every', 'A', 'B', 'once'].includes(r.weekPattern) && r.weekPattern !== 'every' && { weekPattern: r.weekPattern }),
          ...(r.weekPattern === 'once' && isDateStr(r.date) && { date: r.date }),
          ...(str(r.time, 10) && { time: str(r.time, 10) }),
          ...(str(r.icon, 8) && { icon: str(r.icon, 8) })
        })),
        ...(isDateStr(o.altAnchor) && { altAnchor: o.altAnchor }),
        doneMap: o.doneMap && typeof o.doneMap === 'object' ? Object.fromEntries(Object.entries(o.doneMap).filter(([d, v]) => isDateStr(d) && Array.isArray(v)).slice(-60).map(([d, v]) => [d, v.filter(x => typeof x === 'string').slice(0, 60)])) : {},
        extras: o.extras && typeof o.extras === 'object' ? Object.fromEntries(Object.entries(o.extras).filter(([d, v]) => isDateStr(d) && Array.isArray(v)).slice(-60).map(([d, v]) => [d, v.filter(x => x && str(x.title, 80)).slice(0, 30).map(x => ({ id: str(x.id, 40), title: str(x.title, 80), done: x.done === true }))])) : {},
        ...(Array.isArray(o.moves) && {
          moves: o.moves.slice(0, 160).filter(m => m && /^[\w-]{1,40}$/.test(m.routineId || '') && isDateStr(m.from) && isDateStr(m.to) && m.from !== m.to).map(m => ({
            routineId: m.routineId,
            from: m.from,
            to: m.to
          }))
        }),
        ...(Array.isArray(o.skips) && {
          skips: o.skips.slice(0, 160).filter(s => s && /^[\w-]{1,40}$/.test(s.routineId || '') && isDateStr(s.date)).map(s => ({
            routineId: s.routineId,
            date: s.date
          }))
        }),
        ...(Array.isArray(o.recentDone) && {
          recentDone: o.recentDone.slice(0, 40).filter(x => x && str(x.title, 80) && isDateStr(x.date)).map(x => ({
            ...(str(x.id, 40) && { id: str(x.id, 40) }),
            title: str(x.title, 80),
            ...(str(x.icon, 8) && { icon: str(x.icon, 8) }),
            date: x.date
          }))
        }),
        updatedAt: ts(o.updatedAt)
      };
    }
    if (o?.kind === 'expense_month' || /^exp_\d{4}-\d{2}$/.test(o?.id || '')) {
      // โครงสร้างรายจ่ายแบบเก่า (expense_month) จะถูกแตกเป็น expense_records แทนใน backup.js
      return null;
    }
    if (o?.kind === 'expense_budget') {
      const category = str(o.category, 60), amount = moneyNum(o.amount);
      return category && amount !== null ? { kind: 'expense_budget', category, amount, updatedAt: ts(o.updatedAt) } : null;
    }
    if (o?.kind === 'expense_rule') {
      const keyword = str(o.keyword, 80).trim(), category = str(o.category, 60);
      return keyword && category ? { kind: 'expense_rule', keyword, category, updatedAt: ts(o.updatedAt) } : null;
    }
    if (o?.kind === 'expense_recurring') {
      const planId = str(o.planId, 80), merchant = str(o.merchant, 120), category = str(o.category, 60);
      const amount = moneyNum(o.amount);
      return /^[\w-]{1,80}$/.test(planId) && merchant && category && amount !== null
        && ['monthly', 'yearly'].includes(o.frequency) && validCalendarDate(o.nextDate)
        && int(o.dayOfMonth, 1, 31) !== null
        ? {
          kind: 'expense_recurring', planId, merchant, category, amount,
          frequency: o.frequency, nextDate: o.nextDate, dayOfMonth: o.dayOfMonth,
          note: str(o.note, 200), createdAt: ts(o.createdAt), updatedAt: ts(o.updatedAt)
        }
        : null;
    }
    if (o?.id === 'expense_rules' && Array.isArray(o.rules)) {
      const rules = o.rules.slice(0, 200).filter(rule => rule && str(rule.keyword, 80).trim() && str(rule.category, 60))
        .map(rule => ({ keyword: str(rule.keyword, 80).trim(), category: str(rule.category, 60) }));
      return { rules, updatedAt: ts(o.updatedAt) };
    }
    if (o?.kind === 'assistant_note') {
      const name = str(o.name || o.title, 120).trim();
      const note = str(o.note, 2000).trim();
      return (name || note) ? {
        kind: 'assistant_note',
        name: name || note.slice(0, 60),
        category: str(o.category, 60) || 'ทั่วไป',
        note,
        date: isDateStr(o.date) ? o.date : localDateStr(),
        source: o.source === 'manual' ? 'manual' : 'assistant',
        createdAt: ts(o.createdAt),
        updatedAt: ts(o.updatedAt)
      } : null;
    }
    if (o?.kind === 'user_feedback') {
      const note = str(o.note || o.message, 2000).trim();
      if (!note) return null;
      return {
        kind: 'user_feedback',
        category: ['bug', 'feature', 'ux', 'praise', 'other'].includes(o.category) ? o.category : 'other',
        ...(int(o.value, 1, 5) !== null && { value: o.value }),
        note,
        ...(str(o.type, 80) && { type: str(o.type, 80) }),
        date: isDateStr(o.date) ? o.date : localDateStr(),
        status: o.status === 'noted' ? 'noted' : 'new',
        source: o.source === 'assistant' ? 'assistant' : 'ui',
        createdAt: ts(o.createdAt),
        updatedAt: ts(o.updatedAt)
      };
    }
    return {
      sex: o.sex === 'male' ? 'male' : 'female', birthYear: int(o.birthYear, 1900, 2100), heightCm: num(o.heightCm), weightKg: num(o.weightKg),
      activity: ['sedentary', 'light', 'moderate', 'active', 'very'].includes(o.activity) ? o.activity : 'light',
      adjust: typeof o.adjust === 'number' && Math.abs(o.adjust) <= 1500 ? Math.round(o.adjust) : 0,
      kcalOverride: num(o.kcalOverride), proteinPerKg: num(o.proteinPerKg), fatPct: num(o.fatPct),
      meals: (Array.isArray(o.meals) ? o.meals : []).slice(0, 12).filter(m => m && /^[\w-]{1,40}$/.test(m.id || '') && str(m.name, 30)).map(m => ({ id: m.id, name: str(m.name, 30) })),
      updatedAt: ts(o.updatedAt)
    };
  },
};
export const COLLECTION_LABELS = {
  food_records: 'อาหารที่บันทึก', period_records: 'ประจำเดือน', body_records: 'น้ำหนัก/สัดส่วน',
  symptom_records: 'อาการรายวัน', custom_foods: 'คลังอาหารของฉัน', workout_records:'บันทึกการออกกำลังกาย', lab_records:'ผลตรวจ', workout_templates:'เทมเพลตออกกำลังกาย', expense_records:'รายรับ-รายจ่าย',   settings:'เป้าหมาย, Planner และการตั้งค่ารายจ่าย', skincare_products:'ผลิตภัณฑ์สกินแคร์เดิม', skin_records:'ผลและอาการผิว', ingredient_blacklist:'ส่วนผสมที่หลีกเลี่ยง', pet_profiles:'โปรไฟล์สัตว์เลี้ยง', pet_care_records:'นัดและการดูแลสัตว์เลี้ยง', pet_food_records:'อาหารสัตว์เลี้ยง', tracked_products:'ของใช้และสต๊อก', replacement_records:'ประวัติเปลี่ยนของ'
};
export const isSensitivePushSettingsDoc = (o, docId = '') =>
  docId === 'push' || o?.id === 'push' || Array.isArray(o?.subscriptions) || (typeof o?.enabled === 'boolean' && !Array.isArray(o?.routines));
export const isLegacyExpenseMonthDoc = (o, docId = '') =>
  o?.kind === 'expense_month' || /^exp_\d{4}-\d{2}$/.test(docId || o?.id || '');

// symptom_records and skin_records use the date as their document ID.
export const docIdFor = (col, o, fallback) => {
  if (['symptom_records', 'skin_records'].includes(col)) return o.date;
  if (col === 'expense_records') return /^[\w-]{1,80}$/.test(o?.id || '') ? o.id : fallback;
  if (col !== 'settings') return fallback;
  if (o?.id === 'planner' || Array.isArray(o?.routines) || o?.doneMap || Array.isArray(o?.moves) || Array.isArray(o?.skips)) return 'planner';
  const prefix = o?.kind === 'expense_budget' ? /^expense_budget_/
    : o?.kind === 'expense_rule' ? /^expense_rule_/
      : o?.kind === 'expense_recurring' ? /^expense_recurring_/
        : o?.kind === 'assistant_note' ? /^note_/
          : o?.kind === 'user_feedback' ? /^feedback_/
            : null;
  if (prefix) return /^[\w-]{1,80}$/.test(o.id || '') && prefix.test(o.id) ? o.id : fallback;
  if (o?.id === 'expense_rules') return 'expense_rules';
  if (o?.id === 'profile' || !o?.id) return 'profile';
  return fallback;
};
