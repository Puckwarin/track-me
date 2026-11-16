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
  distance: ['distancekm', 'distance', 'distancem', 'ระยะทาง'],
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

export function parseZeppCsv(csvText, fileName = '') {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { records: [], skipped: 0, detectedType: 'unknown' };
  }

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

export function mergeZeppDayRecords(parsedLists = []) {
  const byDate = new Map();
  for (const list of parsedLists) {
    for (const item of list || []) {
      if (!item?.date) continue;
      const cur = byDate.get(item.date) || { date: item.date, source: item.source || 'zepp_csv' };
      byDate.set(item.date, { ...cur, ...item });
    }
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}
