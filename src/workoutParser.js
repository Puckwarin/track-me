// ตัวแปลงข้อความและตารางออกกำลังกายอัตโนมัติ (Smart Paste / Quick Import — ทำงานในเครื่อง 100%)

const SECTION_WARMUP = /^(?:warm[\s-]?up|วอร์ม(?:\s*อัพ)?)(?:\s*[—–\-:|·]\s*(.+))?$/i;
const SECTION_MAIN = /^(?:main(?:\s*workout)?|workout|ท่าหลัก|ช่วงหลัก|ออกกำลังกายหลัก)(?:\s*[—–\-:|·]\s*(.+))?$/i;
const SECTION_COOLDOWN = /^(?:cool[\s-]?down|คูลดาวน์|ยืดคลาย(?:กล้ามเนื้อ)?)(?:\s*[—–\-:|·]\s*(.+))?$/i;

const IMAGE_HOST_RE = /^https?:\/\/(?:images\.openai(?:\.com)?|[^/]*oaiusercontent\.com|raw\.githubusercontent\.com\/yuhonas\/free-exercise-db|i\.imgur\.com|res\.cloudinary\.com|media\d*\.giphy\.com|media\.tenor\.com|lh\d+\.googleusercontent\.com)/i;
const NON_IMAGE_HOST_RE = /^https?:\/\/(?:(?:www\.|m\.)?(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch)|(?:[a-z]+\.)?wikipedia\.org|musclewiki\.com)/i;
const THAI_INSTRUCTION_LEAD_RE = /^(?:เดิน|วิ่ง|วาง|ย่อ|ถือ|ยืน|นอน|ก้ม|เหยียด|ดึง|ดัน|หมุน|เกร็ง|หายใจ|ใช้|ค้าง|สลับ|ก้าว|ยก|พับ|เอียง|เปิด|ปิด|ปล่อย|ให้|อย่า|ควร|เน้น|ระวัง|ทำ|แตะ|บีบ|กด|ค่อย)/;

export function safeHttpUrl(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/\.\.(?:\/)?$|…$/.test(s)) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (!u.hostname || !u.hostname.includes('.') || u.hostname.endsWith('.')) return '';
    return u.href;
  } catch {
    return '';
  }
}

export function isIncompleteUrl(raw) {
  const s = (raw || '').trim();
  return /^https?:\/\/[^\s]+?(?:\.\.(?:\/)?|…)$/i.test(s);
}

export function isLikelyImageUrl(url, raw = '') {
  const target = (url || raw || '').trim();
  if (!target) return false;
  if (NON_IMAGE_HOST_RE.test(target)) return false;
  if (/\.(?:png|jpe?g|gif|webp|avif|svg|bmp)(?:$|[?#])/i.test(target)) return true;
  if (IMAGE_HOST_RE.test(target)) return true;
  if (/[/?&](?:image|img|photo|thumb|thumbnail|format=(?:png|jpe?g|webp|gif))/i.test(target)) return true;
  return false;
}

function cleanThaiSpacing(s) {
  return String(s || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // แก้ช่องว่างที่หลุดเข้าไปหน้าสระ/วรรณยุกต์ไทย เช่น "ข ้าง" -> "ข้าง"
    .replace(/\s+([\u0E31\u0E34-\u0E3A\u0E47-\u0E4E])/g, '$1')
    .trim();
}

function stripMdFormatting(s) {
  return cleanThaiSpacing(s)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/, '')
    .trim();
}

export function extractReference(line) {
  const clean = stripMdFormatting(line);
  if (!clean) return { hasLink: false, isImage: false, isIncomplete: false, title: '', url: '', rawUrl: '', plain: '' };

  // รูปแบบ Markdown image: ![คำอธิบาย](https://...)
  const mdImgMatch = clean.match(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/);
  if (mdImgMatch) {
    const rawUrl = mdImgMatch[2].trim();
    const url = safeHttpUrl(rawUrl);
    const incomplete = !url && isIncompleteUrl(rawUrl);
    const title = mdImgMatch[1].trim();
    const rest = clean.replace(mdImgMatch[0], '').replace(/^[-*•\s:|—–]+|[-*•\s:|—–]+$/g, '').trim();
    return {
      hasLink: true,
      isImage: true,
      isIncomplete: incomplete,
      title: title || rest,
      url,
      rawUrl,
      plain: title || rest
    };
  }

  // รูปแบบ Markdown link: [ชื่อบทความ](https://...)
  const mdMatch = clean.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
  if (mdMatch) {
    const rawUrl = mdMatch[2].trim();
    const url = safeHttpUrl(rawUrl);
    const incomplete = !url && isIncompleteUrl(rawUrl);
    const title = mdMatch[1].trim();
    const rest = clean.replace(mdMatch[0], '').replace(/^[-*•\s:|—–]+|[-*•\s:|—–]+$/g, '').trim();
    const isImage = isLikelyImageUrl(url || rawUrl);
    return {
      hasLink: true,
      isImage,
      isIncomplete: incomplete,
      title: title || rest || url,
      url,
      rawUrl,
      plain: title || rest
    };
  }

  // รูปแบบมี URL เปล่าในบรรทัด (รวมถึงลิงก์รูปที่ถูกตัดปลายด้วย .. เช่น https://images.openai..)
  const urlMatch = clean.match(/https?:\/\/[^\s<>()]+/);
  if (urlMatch) {
    const rawMatched = urlMatch[0];
    const incomplete = isIncompleteUrl(rawMatched);
    const trimmedRaw = incomplete ? rawMatched : rawMatched.replace(/[.,;!?]+$/, '');
    const url = incomplete ? '' : safeHttpUrl(trimmedRaw);
    const rest = clean.replace(rawMatched, '').replace(/^[-*•\s:|—–]+|[-*•\s:|—–]+$/g, '').trim();
    const isImage = isLikelyImageUrl(url || trimmedRaw);
    return {
      hasLink: true,
      isImage,
      isIncomplete: incomplete,
      title: rest,
      url,
      rawUrl: trimmedRaw,
      plain: rest
    };
  }

  return { hasLink: false, isImage: false, isIncomplete: false, title: '', url: '', rawUrl: '', plain: clean };
}

function detectSectionHeader(rawLine) {
  let s = stripMdFormatting(rawLine)
    .replace(/^(?:[-*•]\s*)/, '')
    .replace(/^(?:\d+[.)]\s*)/, '')
    .trim();
  if (!s) return null;

  let m = s.match(SECTION_WARMUP);
  if (m) return { key: 'warmup', subtitle: (m[1] || '').trim() };

  m = s.match(SECTION_MAIN);
  if (m) return { key: 'main', subtitle: (m[1] || '').trim() };

  m = s.match(SECTION_COOLDOWN);
  if (m) return { key: 'cooldown', subtitle: (m[1] || '').trim() };

  return null;
}

function parseDurationHeader(rawLine) {
  const s = stripMdFormatting(rawLine).replace(/^(?:[-*•]\s*)/, '').trim();
  if (!s || /^\d+[.)]\s+/.test(s)) return null;
  if (s.length > 60) return null;
  const m = s.match(/^(?:(?:ประมาณ|ใช้เวลา|เวลา|รวม|duration|time|total)\s*[:：]?\s*)?(?:~|ราว)?\s*(\d+)\s*(?:[–\-~ถึง]\s*(\d+))?\s*(?:นาที|mins?|minutes?)(?:\s|$)/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (!Number.isFinite(a) || a <= 0 || a > 600) return null;
  return {
    durationText: s,
    durationMin: Math.round((a + b) / 2)
  };
}

function normalizeRepUnit(u) {
  const s = (u || '').toLowerCase();
  if (/^(?:วิ|วินาที|sec|secs|second|seconds|s)$/.test(s)) return 'sec';
  if (/^(?:นาที|min|mins|minute|minutes|m)$/.test(s)) return 'min';
  return 'reps';
}

export function parseMetricLine(rawLine) {
  const s = stripMdFormatting(rawLine).replace(/^(?:[-*•]\s*)/, '').trim();
  if (!s || s.length > 85) return null;

  const out = {};
  let matched = false;
  let remaining = s;

  // 1. น้ำหนัก (เช่น "2 kg", "2.5 กก./ข้าง", "ข้างละ 3 kg", "2 kg/ข ้าง")
  const perSide = /ข้างละ|ต่อข้าง|\/\s*ข้าง|per\s*side|each\s*side/i.test(s);
  if (perSide) out.perSide = true;

  const kgMatch = s.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|กก\.?|กิโล(?:กรัม)?)(?=\s|$|[\/·,(])/i);
  if (kgMatch) {
    const val = Number(kgMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val >= 0 && val <= 1000) {
      out.weightKg = val;
      matched = true;
      remaining = remaining.replace(kgMatch[0], ' ');
    }
  }

  // 2. ข้อความไม่ใช้น้ำหนัก / ตัวเปล่า (เช่น "ไม่ถือดัมเบล")
  const noWeightMatch = s.match(/^(ไม่ถือดัมเบล|ไม่ใช้น้ำหนัก|ตัวเปล่า|น้ำหนักตัว|bodyweight|bw|no\s*weight)$/i);
  if (noWeightMatch) {
    out.equipNote = s;
    matched = true;
    remaining = '';
  }

  // 3. รูปแบบ เซต × ครั้ง / เวลา (เช่น "2 × 10 ครั้ง", "3x12", "2 × 30 วินาที", "2 เซต 10 ครั้ง")
  const setRepMatch =
    s.match(/(\d+)\s*(?:เซต|sets?)?\s*[×xX*]\s*(\d+)(?:\s*[–\-~]\s*(\d+))?\s*(ครั้ง|reps?|วินาที|วิ|sec(?:onds?)?|s|นาที|min(?:utes?)?|m)?(?:\s*(?:ต่อข้าง|\/\s*ข้าง|ข้างละ))?/i) ||
    s.match(/(\d+)\s*เซต(?:ละ)?\s*(\d+)(?:\s*[–\-~]\s*(\d+))?\s*(ครั้ง|reps?|วินาที|วิ|sec(?:onds?)?|นาที|min(?:utes?)?)?(?:\s*(?:ต่อข้าง|\/\s*ข้าง|ข้างละ))?/i);

  if (setRepMatch) {
    const sets = Number(setRepMatch[1]);
    const rLow = Number(setRepMatch[2]);
    const rHigh = setRepMatch[3] ? Number(setRepMatch[3]) : rLow;
    if (sets >= 1 && sets <= 99 && rHigh >= 1 && rHigh <= 9999) {
      out.sets = sets;
      out.reps = rHigh;
      out.repUnit = normalizeRepUnit(setRepMatch[4] || 'reps');
      if (rLow !== rHigh) out.rangeNote = `${rLow}–${rHigh} ${out.repUnit === 'sec' ? 'วินาที' : out.repUnit === 'min' ? 'นาที' : 'ครั้ง'}`;
      matched = true;
      remaining = remaining.replace(setRepMatch[0], ' ');
    }
  } else {
    // 4. รูปแบบค่าเดี่ยว (เช่น "60 วินาที", "45–60 วินาที", "15 ครั้ง", "8 ครั้ง/ข้าง", "2 นาที")
    const singleMatch = s.match(/^(?:ทำ|ค้าง(?:ไว้)?|ถือค้าง|เดิน|ประมาณ|~)?\s*(\d+)(?:\s*[–\-~ถึง]\s*(\d+))?\s*(วินาที|วิ|sec(?:onds?)?|นาที|min(?:utes?)?|ครั้ง|reps?)(?:\s*(?:ต่อข้าง|\/\s*ข้าง|ข้างละ))?$/i);
    if (singleMatch) {
      const rLow = Number(singleMatch[1]);
      const rHigh = singleMatch[2] ? Number(singleMatch[2]) : rLow;
      if (rHigh >= 1 && rHigh <= 9999) {
        out.reps = rHigh;
        out.repUnit = normalizeRepUnit(singleMatch[3]);
        if (rLow !== rHigh) out.rangeNote = `${rLow}–${rHigh} ${out.repUnit === 'sec' ? 'วินาที' : out.repUnit === 'min' ? 'นาที' : 'ครั้ง'}`;
        matched = true;
        remaining = '';
      }
    } else {
      const setsOnly = s.match(/^(\d+)\s*(?:เซต|sets?)$/i);
      if (setsOnly) {
        out.sets = Math.min(99, Math.max(1, Number(setsOnly[1])));
        matched = true;
        remaining = '';
      }
    }
  }

  if (!matched) return null;

  const leftover = remaining.replace(/^(?:ข้างละ|ต่อข้าง|\/\s*ข้าง|[·,|—–\-\s()])+|(?:ข้างละ|ต่อข้าง|\/\s*ข้าง|[·,|—–\-\s()])+$/g, '').trim();
  if (leftover && /ไม่ถือดัมเบล|ไม่ใช้น้ำหนัก|ตัวเปล่า|น้ำหนักตัว/i.test(leftover)) {
    out.equipNote = leftover;
  }
  return out;
}

function matchExerciseLine(rawLine) {
  const cleaned = stripMdFormatting(rawLine).trim();
  const m = cleaned.match(/^(?:[-*•]\s*)?(\d+)[.)]\s+(.+)$/);
  if (!m) return null;
  let body = m[2].trim();
  if (!body) return null;

  const ref = extractReference(body);
  let refTitle = '';
  let refUrl = '';
  let imageUrl = '';
  let imageHint = '';
  if (ref.hasLink) {
    body = ref.title || body;
    if (ref.isImage) {
      imageUrl = ref.url;
      if (ref.isIncomplete) imageHint = ref.rawUrl;
    } else {
      refTitle = ref.title;
      refUrl = ref.url;
    }
  }

  let inlineSpec = null;
  const splitMatch = body.match(/^(.+?)\s+[—–\-|·:]\s+(.+)$/);
  if (splitMatch) {
    const maybeSpec = parseMetricLine(splitMatch[2]);
    if (maybeSpec) {
      body = splitMatch[1].trim();
      inlineSpec = maybeSpec;
    }
  }

  return {
    name: body.slice(0, 80),
    imageUrl,
    imageHint,
    refTitle: refTitle.slice(0, 200),
    refUrl,
    inlineSpec
  };
}

function looksLikeWebTitle(line) {
  const s = stripMdFormatting(line);
  if (!s) return false;
  if (/^(?:Day|Week|Session|Workout|โปรแกรม|แผน|วันที่)\s+[A-Z0-9ก-ฮ]/i.test(s)) return false;
  if (/https?:\/\/|\[[^\]]*\]\(https?:\/\//.test(s)) return true;
  if (/\s\|\s|\s[—–-]\s(?:[A-Za-z0-9ก-ฮ].{1,30})$/.test(s)) return true;
  if (/^(?:Tutoriel|Tutorial|How\s+to|Guide|Exercise|Workout|Rehabilitación|\d+\s+Quick|\d+\s+Best)/i.test(s)) return true;
  if (/^[A-Za-zÀ-ÿ0-9\s:’'",&|–—.\-/()!?]+$/.test(s) && s.length >= 10 && /[|:—–-]/.test(s)) return true;
  return false;
}

function looksLikeExerciseName(line) {
  const s = stripMdFormatting(line);
  if (!s || s.length > 75) return false;
  if (looksLikeWebTitle(s)) return false;
  if (THAI_INSTRUCTION_LEAD_RE.test(s)) return false;
  if (/[.!?]$/.test(s) && s.split(/\s+/).length > 5) return false;
  return true;
}

export function inferWorkoutType(headerText, sections) {
  const allNames = Object.values(sections).flat().map(r => r.name || '').join(' ');
  const text = `${headerText || ''} ${allNames}`.toLowerCase();
  if (/pilates|พิลาทิส/.test(text)) return 'pilates';
  if (/stretch|ยืดเหยียด|yoga|โยคะ|mobility/.test(text)) return 'stretch';
  if (/walk|เดิน|cardio|วิ่ง/.test(text)) return 'walk';
  if (/lower\s*body|ช่วงล่าง|ขา|สะโพก|ก้น|glute|squat|lunge|rdl|deadlift/.test(text)) return 'lower';
  if (/upper\s*body|ช่วงบน|แขน|อก|หลัง|ไหล่|bicep|tricep|shoulder|row|push-up/.test(text)) return 'upper';
  if (/full\s*body|ทั้งตัว/.test(text)) return 'full';
  return 'other';
}

function applyBeginnerDefaults(row, section) {
  let autoFilled = false;
  const hay = `${row.name || ''} ${row.note || ''}`.toLowerCase();
  const isHoldOrCardio = /\b(?:march|walk|jog|run|plank|wall\s*sit|hold|stretch|child|cat-cow|pose)\b|เดิน|วิ่ง|แพลงก์|ค้าง|ยืด/.test(hay);
  const isWeightedMovement = /\b(?:goblet|dumbbell|db|rdl|deadlift|curl|press|row|raise|fly|kickback|extension|shrug)\b|ดัมเบล/.test(hay);
  const isBodyweight = /\b(?:bodyweight|bw|push-up|plank|march|stretch|cat-cow)\b|ไม่ถือดัมเบล|ตัวเปล่า|ไม่ใช้น้ำหนัก/.test(hay);

  if (row.reps == null) {
    autoFilled = true;
    if (section === 'warmup') {
      if (isHoldOrCardio || !/\b(?:circle|squat|lunge|bridge|rotation)\b|หมุน|สควอท/.test(hay)) {
        row.sets = row.sets || 1;
        row.reps = 45;
        row.repUnit = 'sec';
      } else {
        row.sets = row.sets || 1;
        row.reps = 10;
        row.repUnit = 'reps';
      }
    } else if (section === 'cooldown') {
      row.sets = row.sets || 1;
      row.reps = 30;
      row.repUnit = 'sec';
      if (/\b(?:quad|hamstring|calf|hip|shoulder|side|piriformis|pigeon|stretch)\b|ข้าง/.test(hay)) {
        row.perSide = true;
      }
    } else {
      row.sets = Math.max(row.sets || 2, 2);
      if (isHoldOrCardio) {
        row.reps = 30;
        row.repUnit = 'sec';
      } else {
        row.reps = 10;
        row.repUnit = 'reps';
      }
    }
  }

  if (row.weightKg == null && section === 'main' && isWeightedMovement && !isBodyweight && !/ไม่ถือดัมเบล|ตัวเปล่า/.test(row.note || '')) {
    row.weightKg = 2;
    autoFilled = true;
  }

  return autoFilled;
}

function finalizeExercise(ex, section) {
  if (!ex) return null;
  const noteParts = [];
  if (ex.equipNote) noteParts.push(ex.equipNote);
  if (ex.rangeNote) noteParts.push(`ช่วงเวลา ${ex.rangeNote}`);
  if (ex.instructions.length) noteParts.push(ex.instructions.join(' '));
  const row = {
    name: ex.name.slice(0, 80),
    imageUrl: safeHttpUrl(ex.imageUrl).slice(0, 1000),
    ...(ex.imageHint && { imageHint: ex.imageHint.slice(0, 200) }),
    refTitle: (ex.refTitle || '').trim().slice(0, 200),
    refUrl: safeHttpUrl(ex.refUrl).slice(0, 1000),
    weightKg: ex.weightKg ?? null,
    perSide: !!ex.perSide,
    sets: Math.max(1, Math.round(ex.sets || 1)),
    reps: ex.reps ?? null,
    repUnit: ex.repUnit || 'reps',
    note: noteParts.join(' · ').trim().slice(0, 400)
  };
  if (applyBeginnerDefaults(row, section)) {
    row.autoFilled = true;
  }
  return row;
}

function applyMetric(ex, m) {
  if (!ex || !m) return;
  if (m.weightKg != null) ex.weightKg = m.weightKg;
  if (m.perSide) ex.perSide = true;
  if (m.sets != null) ex.sets = m.sets;
  if (m.reps != null) ex.reps = m.reps;
  if (m.repUnit) ex.repUnit = m.repUnit;
  if (m.equipNote && !ex.equipNote) ex.equipNote = m.equipNote;
  if (m.rangeNote && !ex.rangeNote) ex.rangeNote = m.rangeNote;
  ex.hasMetric = true;
}

function isTableSeparatorRow(cells) {
  return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c.trim()));
}

function parseTableCells(line, mode) {
  if (mode === 'pipe') {
    return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => stripMdFormatting(c));
  }
  return line.split('\t').map(c => stripMdFormatting(c));
}

function detectTableColumns(headerCells) {
  const map = {};
  headerCells.forEach((raw, idx) => {
    const h = raw.toLowerCase();
    if (map.section == null && /ช่วง|หมวด|section|phase|part/.test(h)) map.section = idx;
    else if (map.name == null && /ท่า|ชื่อท่า|exercise|movement|workout|name/.test(h)) map.name = idx;
    else if (map.weight == null && /น้ำหนัก|weight|load|kg|กก/.test(h)) map.weight = idx;
    else if (map.reps == null && /เซต|ครั้ง|เวลา|reps?|sets?|duration|time/.test(h)) map.reps = idx;
    else if (map.image == null && /รูป|ภาพ|image|img|photo|pic|gif|ลิงก์|url|link/.test(h)) map.image = idx;
    else if (map.note == null && /วิธีทำ|คำอธิบาย|หมายเหตุ|โน้ต|note|desc|instruction|how/.test(h)) map.note = idx;
  });
  return Object.keys(map).length >= 2 ? map : null;
}

function tryParseTableWorkout(lines) {
  const tableLines = [];
  const headerLines = [];
  let mode = null;
  let seenTable = false;

  for (const raw of lines) {
    if (!raw || /^[-=*_]{3,}$/.test(raw)) continue;
    const isPipe = (raw.match(/\|/g) || []).length >= 2;
    const isTab = raw.includes('\t');
    if (isPipe || isTab) {
      if (!mode) mode = isPipe ? 'pipe' : 'tab';
      seenTable = true;
      tableLines.push(raw);
    } else if (!seenTable) {
      headerLines.push(raw);
    }
  }

  if (tableLines.length < 2) return null;
  const rows = tableLines.map(l => parseTableCells(l, mode)).filter(cells => cells.some(Boolean));
  if (rows.length < 2) return null;

  let programName = '';
  let muscleGroup = '';
  let durationText = '';
  let durationMin = null;
  for (const h of headerLines) {
    const dur = parseDurationHeader(h);
    if (dur) {
      durationText = dur.durationText;
      durationMin = dur.durationMin;
      continue;
    }
    const cleanHdr = stripMdFormatting(h).replace(/^(?:ชื่อโปรแกรม|โปรแกรม|กล้ามเนื้อ|กลุ่มกล้ามเนื้อ|เป้าหมาย)\s*[:：]\s*/i, '').trim();
    if (!programName) programName = cleanHdr;
    else if (!muscleGroup) muscleGroup = cleanHdr;
  }

  let colMap = detectTableColumns(rows[0]);
  let startIdx = 0;
  if (colMap) {
    startIdx = 1;
    if (rows[1] && isTableSeparatorRow(rows[1])) startIdx = 2;
  } else if (rows[1] && isTableSeparatorRow(rows[1])) {
    colMap = detectTableColumns(rows[0]);
    startIdx = 2;
  }

  const sections = { warmup: [], main: [], cooldown: [] };
  const sectionNotes = { warmup: '', main: '', cooldown: '' };
  let currentSection = 'main';
  let autoFilledCount = 0;

  for (let i = startIdx; i < rows.length; i++) {
    const cells = rows[i];
    if (isTableSeparatorRow(cells)) continue;

    // กรณีแถวหัวหมวดในตาราง เช่น "| Warm-up |"
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length === 1) {
      const secOnly = detectSectionHeader(nonEmpty[0]);
      if (secOnly) {
        currentSection = secOnly.key;
        if (secOnly.subtitle) sectionNotes[secOnly.key] = secOnly.subtitle;
        continue;
      }
    }

    const ex = {
      name: '',
      imageUrl: '',
      imageHint: '',
      refTitle: '',
      refUrl: '',
      weightKg: null,
      perSide: false,
      sets: 1,
      reps: null,
      repUnit: 'reps',
      equipNote: '',
      rangeNote: '',
      instructions: []
    };
    let rowSection = currentSection;
    const unusedText = [];

    cells.forEach((cell, idx) => {
      if (!cell || /^[-—–]+$/.test(cell)) return;
      if (colMap?.section === idx || (!colMap && detectSectionHeader(cell))) {
        const sec = detectSectionHeader(cell);
        if (sec) {
          rowSection = sec.key;
          currentSection = sec.key;
          if (sec.subtitle && !sectionNotes[sec.key]) sectionNotes[sec.key] = sec.subtitle;
          return;
        }
      }
      const ref = extractReference(cell);
      if (ref.hasLink) {
        if (ref.isImage || colMap?.image === idx) {
          if (ref.url) ex.imageUrl = ref.url;
          else if (ref.isIncomplete) ex.imageHint = ref.rawUrl;
        } else {
          ex.refUrl = ref.url;
          ex.refTitle = ref.title || ref.url;
        }
        if (ref.plain && !ref.isImage && colMap?.name === idx) ex.name = ref.plain;
        return;
      }
      const metric = parseMetricLine(cell);
      if (metric && (colMap?.weight === idx || colMap?.reps === idx || !colMap || idx !== colMap?.name)) {
        applyMetric(ex, metric);
        return;
      }
      if (colMap?.name === idx) {
        ex.name = cell.replace(/^\d+[.)]\s+/, '').trim();
        return;
      }
      if (colMap?.note === idx) {
        ex.instructions.push(cell);
        return;
      }
      unusedText.push(cell);
    });

    if (!ex.name && unusedText.length) {
      ex.name = unusedText.shift().replace(/^\d+[.)]\s+/, '').trim();
    }
    if (unusedText.length) {
      ex.instructions.push(...unusedText);
    }
    if (!ex.name) continue;

    const done = finalizeExercise(ex, rowSection);
    if (done && done.name) {
      if (done.autoFilled) autoFilledCount++;
      sections[rowSection].push(done);
    }
  }

  const totalExercises = sections.warmup.length + sections.main.length + sections.cooldown.length;
  if (!totalExercises) return null;
  const suggestedType = inferWorkoutType(`${programName} ${muscleGroup}`, sections);
  return {
    programName,
    muscleGroup,
    durationText,
    durationMin,
    sectionNotes,
    suggestedType,
    sections,
    totalExercises,
    autoFilledCount
  };
}

export function parseWorkoutText(rawText) {
  const lines = String(rawText || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => cleanThaiSpacing(l));

  const tableParsed = tryParseTableWorkout(lines);
  if (tableParsed) return tableParsed;

  let programName = '';
  let muscleGroup = '';
  let durationText = '';
  let durationMin = null;
  const sectionNotes = { warmup: '', main: '', cooldown: '' };
  const sections = { warmup: [], main: [], cooldown: [] };

  let currentSection = null;
  let currentEx = null;
  let pendingRef = null; // { title, url }
  let pendingImage = null; // { url, hint }
  let hadBlank = false;
  let autoFilledCount = 0;

  const commitCurrent = () => {
    if (!currentEx) return;
    const sec = currentSection || 'main';
    const done = finalizeExercise(currentEx, sec);
    if (done && done.name) {
      if (done.autoFilled) autoFilledCount++;
      sections[sec].push(done);
    }
    currentEx = null;
  };

  const nextNonBlankIndex = fromIdx => {
    for (let j = fromIdx + 1; j < lines.length; j++) {
      const s = lines[j];
      if (!s || /^[-=*_]{3,}$/.test(s)) continue;
      return j;
    }
    return -1;
  };

  // Lookahead: เช็กว่าบรรทัดถัดไป (อาจคั่นด้วยบรรทัด URL 1 บรรทัด) เป็นชื่อท่าที่มีเลขนำหน้าหรือไม่ (ใช้เช็กหัวข้อเว็บก่อนเข้าหมวด)
  const isBeforeNumberedExercise = idx => {
    const j1 = nextNonBlankIndex(idx);
    if (j1 === -1) return false;
    if (detectSectionHeader(lines[j1])) return false;
    if (matchExerciseLine(lines[j1])) return true;
    const ref1 = extractReference(lines[j1]);
    if (ref1.hasLink) {
      const j2 = nextNonBlankIndex(j1);
      if (j2 !== -1 && !detectSectionHeader(lines[j2]) && matchExerciseLine(lines[j2])) return true;
    }
    return false;
  };

  // Lookahead: เช็กว่าบรรทัดถัดไป (อาจคั่นด้วยบรรทัด URL 1 บรรทัด) เป็นชื่อท่า (มีเลขหรือไม่มีเลขก็ได้) หรือไม่
  const isBeforeExercise = idx => {
    if (isBeforeNumberedExercise(idx)) return true;
    const j1 = nextNonBlankIndex(idx);
    if (j1 === -1 || detectSectionHeader(lines[j1])) return false;
    const ref1 = extractReference(lines[j1]);
    if (ref1.hasLink) {
      const j2 = nextNonBlankIndex(j1);
      if (j2 !== -1 && !detectSectionHeader(lines[j2]) && !parseMetricLine(lines[j2]) && looksLikeExerciseName(lines[j2])) return true;
    }
    if (!ref1.hasLink && !parseMetricLine(lines[j1]) && looksLikeExerciseName(lines[j1])) {
      const j2 = nextNonBlankIndex(j1);
      if (j2 !== -1 && parseMetricLine(lines[j2])) return true;
    }
    return false;
  };

  const startExercise = ({ name, imageUrl = '', imageHint = '', refTitle = '', refUrl = '', inlineSpec = null }) => {
    commitCurrent();
    if (!currentSection) currentSection = 'main';
    currentEx = {
      name,
      imageUrl: pendingImage?.url || imageUrl || '',
      imageHint: pendingImage?.hint || imageHint || '',
      refTitle: pendingRef?.title || refTitle || '',
      refUrl: pendingRef?.url || refUrl || '',
      weightKg: null,
      perSide: false,
      sets: 1,
      reps: null,
      repUnit: 'reps',
      equipNote: '',
      rangeNote: '',
      hasMetric: false,
      instructions: []
    };
    pendingRef = null;
    pendingImage = null;
    if (inlineSpec) applyMetric(currentEx, inlineSpec);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || /^[-=*_]{3,}$/.test(raw)) {
      hadBlank = true;
      continue;
    }

    // 1. ตรวจจับหัวข้อหมวด (1. Warm-up / Warm-up / 2. Main Workout / 3. Cool-down)
    const secHit = detectSectionHeader(raw);
    if (secHit) {
      commitCurrent();
      pendingRef = null;
      pendingImage = null;
      currentSection = secHit.key;
      if (secHit.subtitle) {
        sectionNotes[secHit.key] = sectionNotes[secHit.key]
          ? `${sectionNotes[secHit.key]}, ${secHit.subtitle}`
          : secHit.subtitle;
      }
      hadBlank = false;
      continue;
    }

    // 2. ตรวจจับบรรทัดชื่อท่าแบบมีเลขลำดับ เช่น "1. March in Place" หรือ "2. Standing RDL"
    const exHit = matchExerciseLine(raw);
    if (exHit) {
      startExercise(exHit);
      hadBlank = false;
      continue;
    }

    // 3. ช่วงส่วนหัวโปรแกรม (ก่อนเจอ Section หรือ Exercise แรก)
    if (!currentSection && !currentEx) {
      const dur = parseDurationHeader(raw);
      if (dur) {
        durationText = dur.durationText;
        durationMin = dur.durationMin;
        hadBlank = false;
        continue;
      }
      const refHdr = extractReference(raw);
      if (refHdr.hasLink && isBeforeNumberedExercise(i)) {
        if (refHdr.isImage) {
          pendingImage = { url: refHdr.url, hint: refHdr.isIncomplete ? refHdr.rawUrl : '' };
        } else {
          pendingRef = { title: refHdr.title || stripMdFormatting(raw), url: refHdr.url || '' };
        }
        hadBlank = false;
        continue;
      }
      if (looksLikeWebTitle(raw) && isBeforeNumberedExercise(i)) {
        pendingRef = { title: stripMdFormatting(raw), url: '' };
        hadBlank = false;
        continue;
      }
      const cleanHdr = stripMdFormatting(raw).replace(/^(?:ชื่อโปรแกรม|โปรแกรม|กล้ามเนื้อ|กลุ่มกล้ามเนื้อ|เป้าหมาย)\s*[:：]\s*/i, '').trim();
      if (!programName) programName = cleanHdr;
      else if (!muscleGroup) muscleGroup = cleanHdr;
      hadBlank = false;
      continue;
    }

    // 4. ภายในหมวดออกกำลังกาย
    const refInfo = extractReference(raw);
    const metric = parseMetricLine(raw);

    // 4a. บรรทัดมี URL หรือ Markdown image/link
    if (refInfo.hasLink) {
      const nextIdx = nextNonBlankIndex(i);
      const nextIsEx = nextIdx !== -1 && !detectSectionHeader(lines[nextIdx]) && !parseMetricLine(lines[nextIdx]) &&
        (Boolean(matchExerciseLine(lines[nextIdx])) || looksLikeExerciseName(lines[nextIdx]));

      if (refInfo.isImage) {
        if (nextIsEx || !currentEx || hadBlank || currentEx.hasMetric || currentEx.instructions.length > 0) {
          commitCurrent();
          pendingImage = { url: refInfo.url, hint: refInfo.isIncomplete ? refInfo.rawUrl : '' };
        } else {
          if (refInfo.url && !currentEx.imageUrl) currentEx.imageUrl = refInfo.url;
          if (refInfo.isIncomplete && !currentEx.imageHint) currentEx.imageHint = refInfo.rawUrl;
        }
      } else if (nextIsEx || !currentEx || hadBlank) {
        commitCurrent();
        pendingRef = {
          title: pendingRef?.title || refInfo.title || refInfo.url,
          url: refInfo.url || pendingRef?.url || ''
        };
      } else {
        if (!currentEx.refUrl) currentEx.refUrl = refInfo.url;
        if (!currentEx.refTitle && refInfo.title) currentEx.refTitle = refInfo.title;
      }
      hadBlank = false;
      continue;
    }

    // 4b. บรรทัดน้ำหนัก / เซต / เวลา / อุปกรณ์
    if (currentEx && metric) {
      applyMetric(currentEx, metric);
      hadBlank = false;
      continue;
    }

    // 4c. ตรวจจับชื่อท่าที่ไม่มีเลขนำหน้า (เช่น "March in Place", "Goblet Squat", "Slow March")
    const nextIdx = nextNonBlankIndex(i);
    const nextIsMetric = nextIdx !== -1 && Boolean(parseMetricLine(lines[nextIdx]));
    const cleanLine = stripMdFormatting(raw);

    if (pendingImage || pendingRef) {
      if (looksLikeWebTitle(raw) && !pendingRef?.title && isBeforeExercise(i)) {
        pendingRef = { title: cleanLine, url: pendingRef?.url || '' };
      } else {
        startExercise({ name: cleanLine.slice(0, 80) });
      }
      hadBlank = false;
      continue;
    }

    if (!currentEx && currentSection) {
      if (looksLikeWebTitle(raw) && isBeforeExercise(i)) {
        pendingRef = { title: cleanLine, url: '' };
      } else {
        startExercise({ name: cleanLine.slice(0, 80) });
      }
      hadBlank = false;
      continue;
    }

    if (currentEx && (currentEx.hasMetric || currentEx.instructions.length > 0)) {
      if (looksLikeWebTitle(raw) && isBeforeExercise(i)) {
        commitCurrent();
        pendingRef = { title: cleanLine, url: '' };
        hadBlank = false;
        continue;
      }
      if (nextIsMetric && looksLikeExerciseName(raw)) {
        startExercise({ name: cleanLine.slice(0, 80) });
        hadBlank = false;
        continue;
      }
      if (hadBlank && currentEx.instructions.length > 0 && looksLikeExerciseName(raw)) {
        startExercise({ name: cleanLine.slice(0, 80) });
        hadBlank = false;
        continue;
      }
    }

    // 4d. บรรทัดคำอธิบายท่า
    if (currentEx) {
      if (cleanLine) currentEx.instructions.push(cleanLine);
      hadBlank = false;
      continue;
    }

    hadBlank = false;
  }

  commitCurrent();

  const totalExercises = sections.warmup.length + sections.main.length + sections.cooldown.length;
  const suggestedType = inferWorkoutType(`${programName} ${muscleGroup}`, sections);

  return {
    programName,
    muscleGroup,
    durationText,
    durationMin,
    sectionNotes,
    suggestedType,
    sections,
    totalExercises,
    autoFilledCount
  };
}

export function formatWorkoutTemplate(program = {}) {
  const lines = [];
  if (program.programName?.trim()) lines.push(program.programName.trim());
  if (program.muscleGroup?.trim()) lines.push(program.muscleGroup.trim());
  if (program.durationText?.trim()) {
    lines.push(program.durationText.trim());
  } else if (program.durationMin) {
    lines.push(`ประมาณ ${program.durationMin} นาที`);
  }

  const secHeaders = [
    ['warmup', '1. Warm-up'],
    ['main', '2. Main Workout'],
    ['cooldown', '3. Cool-down']
  ];

  for (const [key, label] of secHeaders) {
    const rows = program.sections?.[key] || [];
    if (!rows.length) continue;
    if (lines.length) lines.push('');
    const sub = program.sectionNotes?.[key]?.trim();
    lines.push(sub ? `${label} — ${sub}` : label);
    rows.forEach((r, idx) => {
      const link = safeHttpUrl(r.imageUrl) || r.imageHint || safeHttpUrl(r.refUrl);
      if (link) lines.push(link);
      lines.push(`${idx + 1}. ${r.name}`);
      if (r.weightKg != null) {
        lines.push(`${r.weightKg} kg${r.perSide ? '/ข้าง' : ''}`);
      }
      const unitText = r.repUnit === 'sec' ? 'วินาที' : r.repUnit === 'min' ? 'นาที' : 'ครั้ง';
      if (r.reps != null) {
        const sideSuffix = r.perSide && r.weightKg == null ? '/ข้าง' : '';
        if ((r.sets || 1) > 1) {
          lines.push(`${r.sets} × ${r.reps} ${unitText}${sideSuffix}`);
        } else {
          lines.push(`${r.reps} ${unitText}${sideSuffix}`);
        }
      }
      if (r.note?.trim()) {
        lines.push(r.note.trim());
      }
    });
  }

  return lines.join('\n').trim();
}
