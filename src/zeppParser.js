import { isDateStr } from './util.js';

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

function detectDelimiter(headerLine) {
  let inQuote = false;
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
      else if (ch === '\t') tabs++;
    }
  }
  if (tabs > commas && tabs > semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

export function parseCsvRows(csvText) {
  const clean = stripBom(csvText).replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  const firstNl = clean.indexOf('\n');
  const firstLine = firstNl >= 0 ? clean.slice(0, firstNl) : clean;
  const delim = detectDelimiter(firstLine);

  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuote) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuote = true;
    } else if (ch === delim) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

function normalizeHeaderKey(h) {
  return String(h || '').trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '');
}

function normalizeDateToken(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (iso) {
    let year = Number(iso[1]);
    if (year >= 2400) year -= 543;
    const cand = `${year}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    if (isDateStr(cand)) return cand;
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 55 ? 1957 : 2000;
    else if (year >= 2400) year -= 543;
    const cand = `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    if (isDateStr(cand)) return cand;
  }
  if (/^\d{10,13}$/.test(s)) {
    const ms = s.length === 10 ? Number(s) * 1000 : Number(s);
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

function extractTimeHHMM(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/(?:^|\s|T)(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }
  if (/^\d{10,13}$/.test(s)) {
    const ms = s.length === 10 ? Number(s) * 1000 : Number(s);
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) {
      return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    }
  }
  return null;
}

function parseNonNegNum(raw) {
  if (raw == null || raw === '') return null;
  const cleaned = String(raw).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseSleepDurationHoursOrMin(raw, headerKey) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const hm = s.match(/^(\d+)\s*(?:h|hr|hrs|ชม\.?)\s*(\d+)?\s*(?:m|min|นาที)?$/i);
  if (hm) {
    const h = Number(hm[1]) || 0;
    const m = Number(hm[2]) || 0;
    return Math.round(h * 60 + m);
  }
  const colon = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    return Number(colon[1]) * 60 + Number(colon[2]);
  }
  const n = parseNonNegNum(s);
  if (n === null) return null;
  if (/hour|ชม|sleephours/.test(headerKey)) return Math.round(n * 60);
  if (n > 24) return Math.round(n); // likely minutes
  if (/min|time|นาที/.test(headerKey)) return Math.round(n);
  return Math.round(n * 60);
}

const COL_MATCHERS = {
  date: ['date', 'day', 'time', 'timestamp', 'วันที่'],
  deepSleepMin: ['deepsleeptime', 'deepsleep', 'deepmin', 'deepsleepmin', 'หลับลึก'],
  lightSleepMin: ['shallowsleeptime', 'lightsleeptime', 'lightsleep', 'lightmin', 'lightsleepmin', 'หลับตื้น'],
  remSleepMin: ['remtime', 'remsleep', 'remmin', 'remsleepmin', 'rem'],
  awakeMin: ['waketime', 'awaketime', 'awakemin'],
  bedTime: ['start', 'bedtime', 'sleepstart', 'gotobed', 'เข้านอน'],
  wakeClock: ['stop', 'wakeup', 'wakeuptime', 'sleepend', 'ตื่นนอน'],
  sleepTotal: ['sleepminutes', 'sleepmin', 'sleeptime', 'totalsleeptime', 'sleepduration', 'sleephours', 'sleep', 'ชั่วโมงนอน', 'การนอน'],
  steps: ['steps', 'step', 'stepcount', 'totalsteps', 'ก้าว', 'จำนวนก้าว'],
  runDistance: ['rundistance', 'rundistancem', 'ระยะวิ่ง'],
  distance: ['distancekm', 'distance', 'distancem', 'ระยะทาง'],
  naps: ['naps', 'nap', 'งีบ'],
  calories: ['calories', 'activecalories', 'activekcal', 'kcal', 'burn', 'แคลอรี', 'เผาผลาญ']
};

function mapColumns(headers) {
  const norm = headers.map(normalizeHeaderKey);
  const idx = {};
  const used = new Set();
  for (const [field, candidates] of Object.entries(COL_MATCHERS)) {
    for (const c of candidates) {
      const found = norm.findIndex((h, i) => !used.has(i) && h === c);
      if (found >= 0) {
        idx[field] = found;
        used.add(found);
        break;
      }
    }
    if (idx[field] === undefined) {
      const partial = norm.findIndex((h, i) => !used.has(i) && candidates.some(c => c.length >= 4 && h.includes(c)));
      if (partial >= 0) {
        idx[field] = partial;
        used.add(partial);
      }
    }
  }
  return { idx, norm };
}

function parseDailyCsv(rows, fileName = '') {
  const headers = rows[0];
  const { idx, norm } = mapColumns(headers);
  const byDate = new Map();
  let skipped = 0;

  const isExplicitKm = idx.distance !== undefined && /km|กม/.test(norm[idx.distance] || '');
  const isExplicitMeters = idx.distance !== undefined && /meter|\bm\b|เมตร/.test(headers[idx.distance].toLowerCase());

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (!cols || !cols.length) continue;

    const rawDate = idx.date !== undefined ? cols[idx.date] : (idx.wakeClock !== undefined ? cols[idx.wakeClock] : cols[0]);
    const date = normalizeDateToken(rawDate) || (idx.wakeClock !== undefined ? normalizeDateToken(cols[idx.wakeClock]) : null);
    if (!date) {
      skipped++;
      continue;
    }

    const entry = byDate.get(date) || { date, source: 'zepp_csv' };

    if (idx.steps !== undefined) {
      const st = parseNonNegNum(cols[idx.steps]);
      if (st !== null && st <= 500000) entry.steps = Math.round(st);
    }

    if (idx.distance !== undefined) {
      const dist = parseNonNegNum(cols[idx.distance]);
      if (dist !== null) {
        let km = dist;
        if (isExplicitMeters || (!isExplicitKm && dist >= 100)) {
          km = dist / 1000;
        }
        entry.distanceKm = Math.round(km * 100) / 100;
      }
    }

    if (idx.calories !== undefined) {
      const cal = parseNonNegNum(cols[idx.calories]);
      if (cal !== null && cal <= 30000) entry.activeKcal = Math.round(cal);
    }

    const deep = idx.deepSleepMin !== undefined ? parseNonNegNum(cols[idx.deepSleepMin]) : null;
    const light = idx.lightSleepMin !== undefined ? parseNonNegNum(cols[idx.lightSleepMin]) : null;
    const rem = idx.remSleepMin !== undefined ? parseNonNegNum(cols[idx.remSleepMin]) : null;

    if (deep !== null && deep <= 1440) entry.deepSleepMin = Math.round(deep);
    if (light !== null && light <= 1440) entry.lightSleepMin = Math.round(light);
    if (rem !== null && rem <= 1440) entry.remSleepMin = Math.round(rem);

    let totalMin = null;
    if (idx.sleepTotal !== undefined) {
      totalMin = parseSleepDurationHoursOrMin(cols[idx.sleepTotal], norm[idx.sleepTotal] || '');
    }
    if ((totalMin === null || totalMin === 0) && (deep !== null || light !== null || rem !== null)) {
      totalMin = Math.round((deep || 0) + (light || 0) + (rem || 0));
    }
    if (totalMin !== null && totalMin > 0 && totalMin <= 1440) {
      entry.sleepMinutes = totalMin;
      entry.sleepHours = Math.round((totalMin / 60) * 100) / 100;
    }

    if (idx.bedTime !== undefined) {
      const bt = extractTimeHHMM(cols[idx.bedTime]);
      if (bt) entry.bedTime = bt;
    }
    const notes = [];
    if (idx.runDistance !== undefined) {
      const run = parseNonNegNum(cols[idx.runDistance]);
      if (run !== null && run > 0) {
        const runKm = (isExplicitMeters || (!isExplicitKm && run >= 100)) ? run / 1000 : run;
        notes.push(`วิ่ง ${Math.round(runKm * 100) / 100} กม.`);
      }
    }
    if (idx.naps !== undefined) {
      const napText = describeNaps(cols[idx.naps]);
      if (napText) notes.push(napText);
    }
    if (idx.awakeMin !== undefined && idx.wakeClock !== undefined) {
      const aw = parseNonNegNum(cols[idx.awakeMin]);
      if (aw !== null && aw > 0 && aw <= 1440) notes.push(`ตื่นระหว่างคืน ${Math.round(aw)} นาที`);
    }
    if (notes.length) entry.note = joinNotes(entry.note, notes.join(' · '));

    if (idx.wakeClock !== undefined) {
      const wt = extractTimeHHMM(cols[idx.wakeClock]);
      if (wt) entry.wakeTime = wt;
    } else if (idx.awakeMin !== undefined) {
      // Zepp SLEEP.csv uses 'wakeTime' as awake minutes unless formatted as timestamp/HH:MM
      const wt = extractTimeHHMM(cols[idx.awakeMin]);
      if (wt) entry.wakeTime = wt;
    }

    const hasUseful = entry.steps != null || entry.sleepHours != null || entry.sleepMinutes != null;
    if (hasUseful) {
      byDate.set(date, entry);
    } else {
      skipped++;
    }
  }

  const lowerName = String(fileName || '').toLowerCase();
  const detectedType = /sleep/.test(lowerName) || idx.deepSleepMin !== undefined || idx.sleepTotal !== undefined
    ? (/activity|sport|step/.test(lowerName) || idx.steps !== undefined ? 'combined' : 'sleep')
    : (idx.steps !== undefined ? 'activity' : 'unknown');

  const records = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { records, skipped, detectedType };
}

function joinNotes(a, b) {
  const parts = [a, b].map(x => String(x || '').trim()).filter(Boolean);
  return [...new Set(parts)].join(' · ').slice(0, 200);
}

// naps อาจเป็นตัวเลข (นาที/จำนวนครั้ง) หรือข้อความเช่น JSON/ช่วงเวลา "13:00-13:30"
function describeNaps(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '0' || s === '[]' || /^null$/i.test(s)) return '';
  const n = parseNonNegNum(s);
  if (n !== null) return n > 0 ? `งีบ ${Math.round(n)} นาที` : '';
  const ranges = [...s.matchAll(/(\d{1,2}:\d{2})(?::\d{2})?\s*(?:-|–|to|~)\s*(?:\d{4}-\d{2}-\d{2}[ T])?(\d{1,2}:\d{2})/g)];
  if (ranges.length) return `งีบ ${ranges.length} ครั้ง (${ranges.map(m => `${m[1]}–${m[2]}`).join(', ')})`;
  const times = s.match(/\d{1,2}:\d{2}/g);
  if (times && times.length >= 2) return `งีบ ${Math.floor(times.length / 2)} ครั้ง`;
  return '';
}

// ---------- Template 1: date,time,stage,hr,respiratory_rate (ข้อมูลรายนาทีระหว่างนอน) ----------
const STAGE_WORDS = {
  deep: ['deep', 'deepsleep', 'หลับลึก', '5'],
  light: ['light', 'shallow', 'lightsleep', 'shallowsleep', 'core', 'หลับตื้น', '4'],
  rem: ['rem', 'remsleep', 'dream', '8'],
  awake: ['awake', 'wake', 'wakeup', 'ตื่น', '7']
};

export function normalizeSleepStage(raw) {
  const k = normalizeHeaderKey(raw);
  if (!k) return null;
  for (const [stage, words] of Object.entries(STAGE_WORDS)) {
    if (words.includes(k)) return stage;
  }
  return null;
}

function toMinutesOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isStageTemplate(norm) {
  return norm.includes('stage') && (norm.includes('time') || norm.includes('timestamp'));
}

function parseStageCsv(rows) {
  const norm = rows[0].map(normalizeHeaderKey);
  const col = names => norm.findIndex(h => names.includes(h));
  const iDate = col(['date', 'day', 'วันที่']);
  const iTime = col(['time', 'timestamp', 'เวลา']);
  const iStage = col(['stage', 'sleepstage']);
  const iHr = col(['hr', 'heartrate', 'bpm']);
  const iRr = col(['respiratoryrate', 'respiratory', 'rr', 'breathrate']);

  let skipped = 0;
  const points = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const timeRaw = cols[iTime];
    const date = normalizeDateToken(iDate >= 0 ? cols[iDate] : timeRaw) || normalizeDateToken(timeRaw);
    const hhmm = extractTimeHHMM(timeRaw);
    const stage = normalizeSleepStage(cols[iStage]);
    if (!date || !hhmm || !stage) { skipped++; continue; }
    const t = Date.UTC(...date.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))) / 60000 + toMinutesOfDay(hhmm);
    const hr = iHr >= 0 ? parseNonNegNum(cols[iHr]) : null;
    const rr = iRr >= 0 ? parseNonNegNum(cols[iRr]) : null;
    points.push({ t, date, hhmm, stage, hr: hr && hr >= 25 && hr <= 230 ? hr : null, rr: rr && rr >= 3 && rr <= 60 ? rr : null });
  }
  points.sort((a, b) => a.t - b.t);

  // แยกเป็นคืน ๆ เมื่อช่วงห่างกันเกิน 3 ชั่วโมง; วันที่ของคืน = วันที่ตื่น
  const sessions = [];
  for (const p of points) {
    const cur = sessions[sessions.length - 1];
    if (cur && p.t - cur[cur.length - 1].t <= 180) cur.push(p);
    else sessions.push([p]);
  }

  const byDate = new Map();
  for (const pts of sessions) {
    const gaps = [];
    for (let i = 1; i < pts.length; i++) gaps.push(pts[i].t - pts[i - 1].t);
    const sorted = [...gaps].sort((a, b) => a - b);
    const step = sorted.length ? Math.max(1, Math.min(30, sorted[Math.floor(sorted.length / 2)])) : 1;
    const mins = { deep: 0, light: 0, rem: 0, awake: 0 };
    pts.forEach((p, i) => {
      const dur = i < pts.length - 1 ? Math.min(pts[i + 1].t - p.t, 30) : step;
      mins[p.stage] += dur;
    });
    const asleep = mins.deep + mins.light + mins.rem;
    if (asleep <= 0) { skipped += pts.length; continue; }
    const first = pts[0];
    const last = pts[pts.length - 1];
    const endT = last.t + step;
    const wakeMin = ((endT % 1440) + 1440) % 1440;
    const avg = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
    const hrs = pts.map(p => p.hr).filter(v => v != null);
    const rrs = pts.map(p => p.rr).filter(v => v != null);
    const avgHr = avg(hrs);
    const avgRr = avg(rrs);
    const notes = [];
    if (avgHr != null) notes.push(`HR ขณะนอนเฉลี่ย ${Math.round(avgHr)} bpm (ต่ำสุด ${Math.round(Math.min(...hrs))})`);
    if (avgRr != null) notes.push(`หายใจเฉลี่ย ${Math.round(avgRr * 10) / 10} ครั้ง/นาที`);
    if (mins.awake > 0) notes.push(`ตื่นระหว่างคืน ${Math.round(mins.awake)} นาที`);

    const entry = {
      date: last.date,
      source: 'zepp_csv',
      deepSleepMin: Math.round(mins.deep),
      lightSleepMin: Math.round(mins.light),
      remSleepMin: Math.round(mins.rem),
      sleepMinutes: Math.min(1440, Math.round(asleep)),
      sleepHours: Math.round((Math.min(1440, asleep) / 60) * 100) / 100,
      bedTime: first.hhmm,
      wakeTime: `${String(Math.floor(wakeMin / 60)).padStart(2, '0')}:${String(wakeMin % 60).padStart(2, '0')}`,
      ...(notes.length && { note: notes.join(' · ').slice(0, 200) })
    };
    const prev = byDate.get(entry.date);
    // ถ้าวันเดียวกันมีหลายช่วง (เช่นงีบ) ให้ใช้ช่วงที่นอนนานที่สุดเป็นการนอนหลัก
    if (!prev || entry.sleepMinutes > prev.sleepMinutes) byDate.set(entry.date, entry);
  }

  const records = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { records, skipped, detectedType: 'sleep_stage' };
}

/**
 * นำเข้า Zepp CSV แบบ rule-based (ไม่ใช้ AI) รองรับ 3 template:
 *  1) date,time,stage,hr,respiratory_rate                         → สรุปการนอนจากข้อมูลรายนาที
 *  2) date,deepSleepTime,shallowSleepTime,wakeTime,start,stop,REMTime,naps → สรุปการนอนรายวัน
 *  3) date,steps,distance,runDistance,calories                    → ก้าวเดิน/ระยะทาง/แคลอรี่รายวัน
 */
export function parseZeppCsv(csvText, fileName = '') {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { records: [], skipped: 0, detectedType: 'unknown' };
  }
  const norm = rows[0].map(normalizeHeaderKey);
  if (isStageTemplate(norm)) return parseStageCsv(rows);
  return parseDailyCsv(rows, fileName);
}

export function mergeZeppDayRecords(parsedLists = []) {
  const byDate = new Map();
  for (const list of parsedLists) {
    for (const item of list || []) {
      if (!item?.date) continue;
      const cur = byDate.get(item.date) || { date: item.date, source: item.source || 'zepp_csv' };
      const next = { ...cur, ...item };
      if (cur.note || item.note) next.note = joinNotes(cur.note, item.note);
      byDate.set(item.date, next);
    }
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}
