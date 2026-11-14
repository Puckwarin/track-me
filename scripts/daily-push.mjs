import { pathToFileURL } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

const TYPES = {
  walk: 'เดิน (Walk)',
  upper: 'Upper body',
  lower: 'Lower body',
  full: 'Full body',
  pilates: 'พิลาทิส (Pilates)',
  stretch: 'ยืดเหยียด (Stretching)',
  other: 'ออกกำลังกาย'
};
const DEFAULT_ALT_ANCHOR = '2026-01-05';

function bangkokDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function weekdayIdxMon0(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function mondayOfUtc(ymd) {
  return addDays(ymd, -weekdayIdxMon0(ymd));
}

function weekCodeForDate(ymd, altAnchor = DEFAULT_ALT_ANCHOR) {
  const anchor = typeof altAnchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(altAnchor) ? altAnchor : DEFAULT_ALT_ANCHOR;
  const diffDays = daysBetween(mondayOfUtc(anchor), mondayOfUtc(ymd));
  const diffWeeks = Math.floor(diffDays / 7);
  return ((diffWeeks % 2) + 2) % 2 === 0 ? 'A' : 'B';
}

function routineAppliesToDate(r, ymd, wd, altAnchor) {
  if (!r || !Array.isArray(r.days) || !r.days.includes(wd)) return false;
  if (!r.weekPattern || r.weekPattern === 'every') return true;
  return r.weekPattern === weekCodeForDate(ymd, altAnchor);
}

function monthsAfter(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

function pad2(n) { return String(n).padStart(2, '0'); }

function nthWeekdayInMonth(year, month1to12, weekday0to6, nth) {
  const firstWd = (new Date(Date.UTC(year, month1to12 - 1, 1)).getUTCDay() + 6) % 7;
  const offset = (weekday0to6 - firstWd + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const lastDay = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  return day > lastDay ? null : `${year}-${pad2(month1to12)}-${pad2(day)}`;
}

function lastWeekdayInMonth(year, month1to12, weekday0to6) {
  const lastDay = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  const lastWd = (new Date(Date.UTC(year, month1to12 - 1, lastDay)).getUTCDay() + 6) % 7;
  const back = (lastWd - weekday0to6 + 7) % 7;
  return `${year}-${pad2(month1to12)}-${pad2(lastDay - back)}`;
}

function dateMatchesRuleInMonth(dateYmd, rule) {
  if (!rule || !dateYmd) return false;
  const [y, m] = dateYmd.split('-').map(Number);
  if (rule.kind === 'nth_weekday' && Number.isInteger(rule.weekday) && Number.isInteger(rule.nth)) {
    return nthWeekdayInMonth(y, m, rule.weekday, rule.nth) === dateYmd;
  }
  if (rule.kind === 'last_weekday' && Number.isInteger(rule.weekday)) {
    return lastWeekdayInMonth(y, m, rule.weekday) === dateYmd;
  }
  return false;
}

function resolveReminderDueDate(x, allItems, today) {
  if (!x.rule || !['same_as', 'weekly_except_linked'].includes(x.rule.kind)) return x.nextDate;
  const r = x.rule;
  const linked = (r.linkedId && allItems.find(it => it.id === r.linkedId))
    || (r.linkedQuery && allItems.find(it => it.title.toLowerCase().includes(String(r.linkedQuery).toLowerCase())))
    || null;
  if (r.kind === 'same_as') {
    if (!linked) return x.nextDate;
    if (linked.nextDate && linked.nextDate >= today) return linked.nextDate;
    return linked.nextDate || x.nextDate;
  }
  if (r.kind === 'weekly_except_linked' && Number.isInteger(r.weekday)) {
    const curWd = weekdayIdxMon0(today);
    let cand = addDays(today, (r.weekday - curWd + 7) % 7);
    for (let i = 0; i < 60; i++) {
      const excluded = linked && (linked.nextDate === cand || (linked.rule && dateMatchesRuleInMonth(cand, linked.rule)));
      if (!excluded) return cand;
      cand = addDays(cand, 7);
    }
    return cand;
  }
  return x.nextDate;
}

function predictNextPeriod(records) {
  const asc = records.filter(r => r.start).sort((a, b) => a.start.localeCompare(b.start));
  if (asc.length < 2) return null;
  const cycles = [];
  for (let i = 1; i < asc.length; i++) {
    cycles.push(daysBetween(asc[i - 1].start, asc[i].start));
  }
  const recent = cycles.slice(-6);
  const avgCycle = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  return addDays(asc[asc.length - 1].start, avgCycle);
}

export function formatDigestMessage({ plannedWorkouts = [], todos = [], reminders = [], hideDetails = true }) {
  const total = plannedWorkouts.length + todos.length + reminders.length;
  if (!total) return null;

  if (hideDetails !== false) {
    const summaryParts = [];
    if (plannedWorkouts.length) summaryParts.push(`ออกกำลังกาย ${plannedWorkouts.length}`);
    if (todos.length) summaryParts.push(`กิจวัตร ${todos.length}`);
    if (reminders.length) summaryParts.push(`นัด/เตือน ${reminders.length}`);
    return {
      title: `Track Me · แจ้งเตือนวันนี้ (${total} รายการ)`,
      body: `${summaryParts.join(' · ')} — แตะเพื่อเปิดดูรายละเอียดในแอป`
    };
  }

  const parts = [];
  if (plannedWorkouts.length) parts.push(`💪 ออกกำลังกาย: ${plannedWorkouts.slice(0, 2).join(', ')}`);
  if (todos.length) parts.push(`📋 สิ่งที่ต้องทำ (${todos.length}): ${todos.slice(0, 3).join(', ')}${todos.length > 3 ? '…' : ''}`);
  if (reminders.length) parts.push(`🔔 เตือนกำหนด (${reminders.length}): ${reminders.slice(0, 2).join(', ')}${reminders.length > 2 ? '…' : ''}`);

  return {
    title: `Track Me · แผนวันนี้ (${total} รายการ)`,
    body: parts.join('\n')
  };
}

export async function buildDailyDigest(db, uid, today, wd, periodRemindDays, hideDetails = true) {
  const userRef = db.collection('users').doc(uid);

  const [
    plannerSnap,
    workoutsSnap,
    petCareSnap,
    replacementsSnap,
    productsSnap,
    periodSnap
  ] = await Promise.all([
    userRef.collection('settings').doc('planner').get(),
    userRef.collection('workout_records').where('date', '==', today).get(),
    userRef.collection('pet_care_records').get(),
    userRef.collection('replacement_records').get(),
    userRef.collection('tracked_products').get(),
    userRef.collection('period_records').get()
  ]);

  const planner = plannerSnap.exists ? plannerSnap.data() : {};
  const doneSet = new Set(planner.doneMap?.[today] || []);
  const pendingRoutines = (planner.routines || [])
    .filter(r => routineAppliesToDate(r, today, wd, planner.altAnchor) && !doneSet.has(r.id))
    .map(r => r.title);

  const plannedWorkouts = workoutsSnap.docs
    .map(d => d.data())
    .filter(w => w.status === 'planned')
    .map(w => TYPES[w.type] || w.type || 'ออกกำลังกาย');

  const todos = [...pendingRoutines];

  const allReminderItems = [
    ...petCareSnap.docs.map(d => ({ id: d.id, ...d.data(), title: d.data().type || 'นัดสัตว์เลี้ยง' })),
    ...replacementsSnap.docs.map(d => ({ id: d.id, ...d.data(), title: d.data().name || d.data().category || 'รายการเตือน' }))
  ];

  const reminders = [];
  for (const docSnap of petCareSnap.docs) {
    const x = docSnap.data();
    const due = resolveReminderDueDate(x, allReminderItems, today);
    if (x.done || !due) continue;
    const lead = x.remindDays != null ? Number(x.remindDays) : 7;
    if (lead >= 0 && x.dismissedFor !== due && daysBetween(today, due) <= lead) {
      reminders.push(`${x.type || 'นัดสัตว์เลี้ยง'}${x.dueTime ? ` (${x.dueTime} น.)` : ''}`);
    }
  }
  for (const docSnap of replacementsSnap.docs) {
    const x = docSnap.data();
    const due = resolveReminderDueDate(x, allReminderItems, today);
    if (x.done || !due) continue;
    const lead = x.remindDays != null ? Number(x.remindDays) : 7;
    if (lead >= 0 && x.dismissedFor !== due && daysBetween(today, due) <= lead) {
      reminders.push(`${x.name || x.category || 'รายการแจ้งเตือน'}${x.dueTime ? ` (${x.dueTime} น.)` : ''}`);
    }
  }
  for (const docSnap of productsSnap.docs) {
    const p = docSnap.data();
    const exp = p.expiryDate || (p.openedDate && p.paoMonths ? monthsAfter(p.openedDate, Number(p.paoMonths)) : p.paoExpiry);
    if (exp) {
      const lead = p.remindDays != null ? Number(p.remindDays) : 30;
      if (lead >= 0 && p.dismissedFor !== exp && daysBetween(today, exp) <= lead) {
        reminders.push(`${p.name} (ใกล้หมดอายุ)`);
      }
    }
    if (p.quantity != null && p.lowAt != null && Number(p.quantity) <= Number(p.lowAt) && !p.lowDismissed) {
      reminders.push(`${p.name} (สต๊อกใกล้หมด)`);
    }
  }

  const pLead = Number(periodRemindDays);
  if (Number.isFinite(pLead) && pLead >= 0) {
    const nextPeriod = predictNextPeriod(periodSnap.docs.map(d => d.data()));
    if (nextPeriod) {
      const until = daysBetween(today, nextPeriod);
      if (until <= pLead && until >= -7) {
        reminders.push(until === 0 ? 'คาดว่าประจำเดือนมาวันนี้' : until < 0 ? `เลยคาดการณ์รอบเดือน ${-until} วัน` : `รอบเดือนในอีก ${until} วัน`);
      }
    }
  }

  return formatDigestMessage({ plannedWorkouts, todos, reminders, hideDetails });
}

async function main() {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const vapidPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const rawSubject = (process.env.VAPID_SUBJECT || '').trim();
  const vapidSubject = !rawSubject
    ? 'mailto:trackme@example.com'
    : /^(mailto:|https?:\/\/)/i.test(rawSubject)
      ? rawSubject
      : `mailto:${rawSubject}`;
  const appUrl = (process.env.APP_URL || 'https://puckwarin.github.io/track-me/').trim();

  if (!saRaw || !vapidPublic || !vapidPrivate) {
    console.log('Missing FIREBASE_SERVICE_ACCOUNT or VAPID keys — skipping daily push run.');
    return;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(saRaw);
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } catch (err) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${err.message}`);
  }
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const today = bangkokDateStr();
  const wd = weekdayIdxMon0(today);
  console.log(`Running Track Me daily push for ${today} (weekday=${wd})`);

  const userRefs = await db.collection('users').listDocuments();
  let sentCount = 0;
  let prunedCount = 0;

  for (const userRef of userRefs) {
    const uid = userRef.id;
    const docSnap = await userRef.collection('settings').doc('push').get();
    if (!docSnap.exists) continue;

    const data = docSnap.data();
    if (!data?.enabled) continue;

    const subs = Array.isArray(data.subscriptions) ? data.subscriptions : [];
    if (!subs.length) continue;

    const hideDetails = data.hideDetails !== false;
    const digest = await buildDailyDigest(db, uid, today, wd, data.periodRemindDays ?? -1, hideDetails);
    if (!digest) continue;

    const payload = JSON.stringify({
      title: digest.title,
      body: digest.body,
      url: appUrl,
      tab: 'home',
      tag: `trackme-daily-${today}`
    });

    const keepSubs = [];
    let dirty = false;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 43200 });
        keepSubs.push(sub);
        sentCount++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          dirty = true;
          prunedCount++;
        } else {
          keepSubs.push(sub);
          console.error(`Push error for uid=${uid} status=${err?.statusCode}:`, err?.message);
        }
      }
    }

    if (dirty) {
      await docSnap.ref.set({
        enabled: keepSubs.length > 0,
        subscriptions: keepSubs,
        updatedAt: new Date()
      }, { merge: true });
    }
  }

  console.log(`Done. Sent: ${sentCount}, pruned expired endpoints: ${prunedCount}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
