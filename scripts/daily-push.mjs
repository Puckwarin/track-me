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

function monthsAfter(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
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

async function buildDailyDigest(db, uid, today, wd, periodRemindDays) {
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
    .filter(r => Array.isArray(r.days) && r.days.includes(wd) && !doneSet.has(r.id))
    .map(r => r.title);
  const pendingExtras = ((planner.extras || {})[today] || [])
    .filter(x => !x.done)
    .map(x => x.title);

  const plannedWorkouts = workoutsSnap.docs
    .map(d => d.data())
    .filter(w => w.status === 'planned')
    .map(w => TYPES[w.type] || w.type || 'ออกกำลังกาย');

  const todos = [...pendingRoutines, ...pendingExtras];

  const reminders = [];
  for (const docSnap of petCareSnap.docs) {
    const x = docSnap.data();
    if (x.done || !x.nextDate) continue;
    const lead = x.remindDays != null ? Number(x.remindDays) : 7;
    if (lead >= 0 && x.dismissedFor !== x.nextDate && daysBetween(today, x.nextDate) <= lead) {
      reminders.push(x.type || 'นัดสัตว์เลี้ยง');
    }
  }
  for (const docSnap of replacementsSnap.docs) {
    const x = docSnap.data();
    if (x.done || !x.nextDate) continue;
    const lead = x.remindDays != null ? Number(x.remindDays) : 7;
    if (lead >= 0 && x.dismissedFor !== x.nextDate && daysBetween(today, x.nextDate) <= lead) {
      reminders.push(x.name || x.category || 'รายการแจ้งเตือน');
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

  const total = plannedWorkouts.length + todos.length + reminders.length;
  if (!total) return null;

  const parts = [];
  if (plannedWorkouts.length) parts.push(`💪 ออกกำลังกาย: ${plannedWorkouts.slice(0, 2).join(', ')}`);
  if (todos.length) parts.push(`📋 สิ่งที่ต้องทำ (${todos.length}): ${todos.slice(0, 3).join(', ')}${todos.length > 3 ? '…' : ''}`);
  if (reminders.length) parts.push(`🔔 เตือนกำหนด (${reminders.length}): ${reminders.slice(0, 2).join(', ')}${reminders.length > 2 ? '…' : ''}`);

  return {
    title: `Track Me · แผนวันนี้ (${total} รายการ)`,
    body: parts.join('\n')
  };
}

async function main() {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const vapidPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:trackme@example.com').trim();
  const appUrl = (process.env.APP_URL || 'https://puckwarin.github.io/track-me/').trim();

  if (!saRaw || !vapidPublic || !vapidPrivate) {
    console.log('Missing FIREBASE_SERVICE_ACCOUNT or VAPID keys — skipping daily push run.');
    return;
  }

  const serviceAccount = JSON.parse(saRaw);
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const today = bangkokDateStr();
  const wd = weekdayIdxMon0(today);
  console.log(`Running Track Me daily push for ${today} (weekday=${wd})`);

  const snap = await db.collectionGroup('settings').where('enabled', '==', true).get();
  let sentCount = 0;
  let prunedCount = 0;

  for (const docSnap of snap.docs) {
    if (docSnap.id !== 'push') continue;
    const uid = docSnap.ref.parent.parent?.id;
    if (!uid) continue;

    const data = docSnap.data();
    const subs = Array.isArray(data.subscriptions) ? data.subscriptions : [];
    if (!subs.length) continue;

    const digest = await buildDailyDigest(db, uid, today, wd, data.periodRemindDays ?? -1);
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

main().catch(err => {
  console.error(err);
  process.exit(1);
});
