// ตัวแปลงข้อความตารางออกกำลังกายอัตโนมัติ (Smart Paste / Quick Import — ทำงานในเครื่อง 100%)

const SECTION_WARMUP = /^(?:warm[\s-]?up|วอร์ม(?:\s*อัพ)?)(?:\s*[—–\-:|·]\s*(.+))?$/i;
const SECTION_MAIN = /^(?:main(?:\s*workout)?|workout|ท่าหลัก|ช่วงหลัก|ออกกำลังกายหลัก)(?:\s*[—–\-:|·]\s*(.+))?$/i;
const SECTION_COOLDOWN = /^(?:cool[\s-]?down|คูลดาวน์|ยืดคลาย(?:กล้ามเนื้อ)?)(?:\s*[—–\-:|·]\s*(.+))?$/i;

export function safeHttpUrl(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

function stripMdFormatting(s) {
  return (s || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/, '')
    .replace(/^[\u200B-\u200D\uFEFF]+/, '')
    .trim();
}

export function extractReference(line) {
  const clean = stripMdFormatting(line);
  if (!clean) return { hasLink: false, title: '', url: '', plain: '' };

  // รูปแบบ Markdown: [ชื่อบทความ](https://...)
  const mdMatch = clean.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
  if (mdMatch) {
    const title = mdMatch[1].trim();
    const url = safeHttpUrl(mdMatch[2]);
    const rest = clean.replace(mdMatch[0], '').replace(/^[-*•\s:|—–]+|[-*•\s:|—–]+$/g, '').trim();
    return {
      hasLink: true,
      title: title || rest || url,
      url,
      plain: title || rest
    };
  }

  // รูปแบบมี URL เปล่าในบรรทัด
  const urlMatch = clean.match(/https?:\/\/[^\s<>()]+/);
  if (urlMatch) {
    const url = safeHttpUrl(urlMatch[0].replace(/[.,;!?]+$/, ''));
    const rest = clean.replace(urlMatch[0], '').replace(/^[-*•\s:|—–]+|[-*•\s:|—–]+$/g, '').trim();
    return {
      hasLink: true,
      title: rest,
      url,
      plain: rest
    };
  }

  return { hasLink: false, title: '', url: '', plain: clean };
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

function parseMetricLine(rawLine) {
  const s = stripMdFormatting(rawLine).replace(/^(?:[-*•]\s*)/, '').trim();
  if (!s || s.length > 85) return null;

  // ถ้ามีคำกริยา/คำอธิบายท่ายาวๆ ให้ถือเป็นคำอธิบายไม่ใช่สเปค
  const out = {};
  let matched = false;
  let remaining = s;

  // 1. น้ำหนัก (เช่น "2 kg", "2.5 กก./ข้าง", "ข้างละ 3 kg")
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
    s.match(/(\d+)\s*(?:เซต|sets?)?\s*[×xX*]\s*(\d+)(?:\s*[–\-~]\s*(\d+))?\s*(ครั้ง|reps?|วินาที|วิ|sec(?:onds?)?|s|นาที|min(?:utes?)?|m)?/i) ||
    s.match(/(\d+)\s*เซต(?:ละ)?\s*(\d+)(?:\s*[–\-~]\s*(\d+))?\s*(ครั้ง|reps?|วินาที|วิ|sec(?:onds?)?|นาที|min(?:utes?)?)?/i);

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
    // 4. รูปแบบค่าเดี่ยว (เช่น "60 วินาที", "45–60 วินาที", "15 ครั้ง", "2 นาที")
    const singleMatch = s.match(/^(?:ทำ|ค้าง(?:ไว้)?|ถือค้าง|เดิน|ประมาณ|~)?\s*(\d+)(?:\s*[–\-~ถึง]\s*(\d+))?\s*(วินาที|วิ|sec(?:onds?)?|นาที|min(?:utes?)?|ครั้ง|reps?)(?:\s*(?:ต่อข้าง|\/ข้าง|ข้างละ))?$/i);
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

  // ถ้ามีคำอธิบายเพิ่มเติมติดมาในบรรทัดสเปค (แต่ไม่ใช่แค่สัญลักษณ์คั่น)
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

  // กรณีชื่อท่าเป็น Markdown link: 1. [Goblet Squat](https://...)
  const ref = extractReference(body);
  let refTitle = '';
  let refUrl = '';
  if (ref.hasLink) {
    body = ref.title || body;
    refTitle = ref.title;
    refUrl = ref.url;
  }

  // กรณีสเปคอยู่บรรทัดเดียวกับชื่อท่า เช่น "1. Goblet Squat — 2 kg · 2 × 10 ครั้ง"
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
    refTitle: refTitle.slice(0, 200),
    refUrl,
    inlineSpec
  };
}

function looksLikeWebTitle(line) {
  const s = stripMdFormatting(line);
  if (!s) return false;
  if (/https?:\/\/|\[[^\]]+\]\(https?:\/\//.test(s)) return true;
  if (/\s\|\s|\s[—–-]\s(?:[A-Za-z0-9ก-ฮ].{1,30})$/.test(s)) return true;
  if (/^(?:Tutoriel|Tutorial|How\s+to|Guide|Exercise|Workout|Rehabilitación|\d+\s+Quick|\d+\s+Best)/i.test(s)) return true;
  if (/^[A-Za-zÀ-ÿ0-9\s:’'",&|–—.\-/()!?]+$/.test(s) && s.length >= 10 && /[|:—–-]/.test(s)) return true;
  return false;
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

function finalizeExercise(ex) {
  if (!ex) return null;
  const noteParts = [];
  if (ex.equipNote) noteParts.push(ex.equipNote);
  if (ex.rangeNote) noteParts.push(`ช่วงเวลา ${ex.rangeNote}`);
  if (ex.instructions.length) noteParts.push(ex.instructions.join(' '));
  return {
    name: ex.name.slice(0, 80),
    imageUrl: '',
    refTitle: (ex.refTitle || '').trim().slice(0, 200),
    refUrl: safeHttpUrl(ex.refUrl).slice(0, 1000),
    weightKg: ex.weightKg ?? null,
    perSide: !!ex.perSide,
    sets: Math.max(1, Math.round(ex.sets || 1)),
    reps: ex.reps ?? null,
    repUnit: ex.repUnit || 'reps',
    note: noteParts.join(' · ').trim().slice(0, 400)
  };
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
}

export function parseWorkoutText(rawText) {
  const lines = String(rawText || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim());

  let programName = '';
  let muscleGroup = '';
  let durationText = '';
  let durationMin = null;
  const sectionNotes = { warmup: '', main: '', cooldown: '' };
  const sections = { warmup: [], main: [], cooldown: [] };

  let currentSection = null;
  let currentEx = null;
  let pendingRef = null; // { title, url }
  let hadBlank = false;

  const commitCurrent = () => {
    if (!currentEx) return;
    const sec = currentSection || 'main';
    const done = finalizeExercise(currentEx);
    if (done && done.name) sections[sec].push(done);
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

  // Lookahead: เช็กว่าบรรทัดถัดไป (อาจคั่นด้วยบรรทัด URL 1 บรรทัด) เป็นชื่อท่าแบบมีเลขนำหน้าหรือไม่
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

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || /^[-=*_]{3,}$/.test(raw)) {
      hadBlank = true;
      continue;
    }

    // 1. ตรวจจับหัวข้อหมวด (1. Warm-up / 2. Main Workout / 3. Cool-down) ก่อนชื่อท่า
    const secHit = detectSectionHeader(raw);
    if (secHit) {
      commitCurrent();
      pendingRef = null;
      currentSection = secHit.key;
      if (secHit.subtitle) {
        sectionNotes[secHit.key] = sectionNotes[secHit.key]
          ? `${sectionNotes[secHit.key]}, ${secHit.subtitle}`
          : secHit.subtitle;
      }
      hadBlank = false;
      continue;
    }

    // 2. ตรวจจับบรรทัดชื่อท่าแบบมีเลขลำดับ เช่น "1. March in Place"
    const exHit = matchExerciseLine(raw);
    if (exHit) {
      commitCurrent();
      if (!currentSection) currentSection = 'main';
      currentEx = {
        name: exHit.name,
        refTitle: pendingRef?.title || exHit.refTitle || '',
        refUrl: pendingRef?.url || exHit.refUrl || '',
        weightKg: null,
        perSide: false,
        sets: 1,
        reps: null,
        repUnit: 'reps',
        equipNote: '',
        rangeNote: '',
        instructions: []
      };
      pendingRef = null;
      if (exHit.inlineSpec) applyMetric(currentEx, exHit.inlineSpec);
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
      if ((refHdr.hasLink || looksLikeWebTitle(raw)) && isBeforeNumberedExercise(i)) {
        pendingRef = {
          title: refHdr.title || stripMdFormatting(raw),
          url: refHdr.url || ''
        };
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
    const beforeNextEx = isBeforeNumberedExercise(i);

    // 4a. บรรทัดมี URL หรือ Markdown Link
    if (refInfo.hasLink) {
      if (beforeNextEx || !currentEx || hadBlank) {
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

    // 4b. บรรทัดอ้างอิง/ชื่อบทความจากเว็บที่อยู่เหนือเลขลำดับท่า
    if (beforeNextEx && !metric) {
      const cleanTitle = stripMdFormatting(raw);
      const shouldTreatAsPendingRef =
        !currentEx ||
        hadBlank ||
        looksLikeWebTitle(raw) ||
        currentEx.instructions.length > 0;

      if (shouldTreatAsPendingRef) {
        commitCurrent();
        pendingRef = {
          title: pendingRef?.title ? `${pendingRef.title} — ${cleanTitle}` : cleanTitle,
          url: pendingRef?.url || ''
        };
        hadBlank = false;
        continue;
      }
    }

    // 4c. บรรทัดน้ำหนัก / เซต / เวลา / อุปกรณ์
    if (currentEx && metric) {
      applyMetric(currentEx, metric);
      hadBlank = false;
      continue;
    }

    // 4d. บรรทัดคำอธิบายท่า
    if (currentEx) {
      const cleanNote = stripMdFormatting(raw);
      if (cleanNote) currentEx.instructions.push(cleanNote);
      hadBlank = false;
      continue;
    }

    // 4e. กรณีอยู่หลังหมวดแต่ยังไม่มีเลขท่าและไม่ใช่ก่อนเลขท่า -> เก็บเป็น pendingRef เผื่อมีชื่อบทความหลายบรรทัด หรือ subnote
    if (currentSection && beforeNextEx) {
      pendingRef = { title: stripMdFormatting(raw), url: '' };
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
    totalExercises
  };
}
