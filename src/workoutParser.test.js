import { describe, expect, it } from 'vitest';
import { formatWorkoutTemplate, parseWorkoutText, safeHttpUrl } from './workoutParser.js';

describe('workout parser', () => {
  it('parses sections, duration, and exercise metrics from pasted text', () => {
    const result = parseWorkoutText(`30 minutes
Warm-up — Mobility
1. March in Place
30 seconds
Main Workout
1. Squat
3 x 12 reps
Cool-down
1. Quad Stretch`);

    expect(result.durationMin).toBe(30);
    expect(result.sectionNotes.warmup).toBe('Mobility');
    expect(result.sections.warmup[0]).toMatchObject({ name: 'March in Place', reps: 30, repUnit: 'sec' });
    expect(result.sections.main[0]).toMatchObject({ name: 'Squat', sets: 3, reps: 12 });
    expect(result.sections.cooldown[0]).toMatchObject({ name: 'Quad Stretch', reps: 30, repUnit: 'sec', perSide: true });
    expect(result.totalExercises).toBe(3);
  });

  it('parses unnumbered Thai/English raw workout text with image links and spacing typos', () => {
    const result = parseWorkoutText(`Day A — Lower Body
ขาและสะโพก
ประมาณ 20–30 นาที
Warm-up
https://images.openai..
March in Place
60 วินาที
เดินยกเข่าสลับซ้ายขวา แกว่งแขนตามธรรมชาติ
https://images.openai.com/assets/hip-circles.png
Standing Hip Circles
8 ครั้ง/ข้าง
วางมือที่สะโพก หมุนสะโพกเป็นวงช้า ๆ โดยไม่ฝืนหลัง
https://images.openai..
Bodyweight Squat
8 ครั้ง
ย่อตัวเหมือนกำลังนั่งเก้าอี้ แล้วยืนกลับขึ้นมา ไม่ต้องถือดัมเบล
Main Workout
https://images.openai.com/assets/goblet-squat.png
Goblet Squat
2 kg
2 × 10 ครั้ง
ถือดัมเบลไว้หน้าอก ย่อตัวเหมือนนั่งเก้าอี้ แล้วดันตัวกลับขึ้นมา
https://images.openai..
2. Standing RDL
2 kg/ข ้าง
2 × 10 ครั้ง
ถือดัมเบลหน้าต้นขา ดันสะโพกไปด้านหลัง ให้รู้สึกตึงบริเวณด้านหลังต้นขา
3. Cool-down
https://images.openai..
Slow March
45–60 วินาที
เดินอยู่กับที่ช้า ๆ ให้ลมหายใจกลับสู่ปกติ
https://images.openai..
Standing Quad Stretch
15–20 วินาที/ข้าง
ยืนจับข้อเท้าดึงส้นเข้าหาก้น เข่าชี้ลง ใช้ผนังช่วยทรงตัวได้`);

    expect(result.programName).toBe('Day A — Lower Body');
    expect(result.muscleGroup).toBe('ขาและสะโพก');
    expect(result.durationMin).toBe(25);
    expect(result.sections.warmup).toHaveLength(3);
    expect(result.sections.main).toHaveLength(2);
    expect(result.sections.cooldown).toHaveLength(2);

    expect(result.sections.warmup[0]).toMatchObject({
      name: 'March in Place',
      imageUrl: '',
      imageHint: 'https://images.openai..',
      reps: 60,
      repUnit: 'sec'
    });
    expect(result.sections.warmup[1]).toMatchObject({
      name: 'Standing Hip Circles',
      imageUrl: 'https://images.openai.com/assets/hip-circles.png',
      reps: 8,
      perSide: true
    });
    expect(result.sections.main[0]).toMatchObject({
      name: 'Goblet Squat',
      imageUrl: 'https://images.openai.com/assets/goblet-squat.png',
      weightKg: 2,
      sets: 2,
      reps: 10
    });
    expect(result.sections.main[1]).toMatchObject({
      name: 'Standing RDL',
      weightKg: 2,
      perSide: true,
      sets: 2,
      reps: 10
    });
    expect(result.sections.cooldown[1]).toMatchObject({
      name: 'Standing Quad Stretch',
      reps: 20,
      repUnit: 'sec',
      perSide: true
    });
  });

  it('parses Markdown tables and TSV tables into structured 3-section templates with beginner defaults', () => {
    const md = `Day B — Upper Body
อก หลัง แขน ไหล่
| ช่วง | ท่าออกกำลังกาย | น้ำหนัก | เซต/ครั้ง | วิธีทำ | รูป |
| --- | --- | --- | --- | --- | --- |
| Warm-up | Arm Circles | - | - | หมุนแขนเป็นวงกว้าง | https://example.com/arm.png |
| Main | Dumbbell Row | - | - | ดึงดัมเบลขึ้นข้างลำตัว | https://example.com/row.jpg |
| Cool-down | Tricep Stretch | - | - | พับแขนเหนือศีรษะ | - |`;

    const parsedMd = parseWorkoutText(md);
    expect(parsedMd.programName).toBe('Day B — Upper Body');
    expect(parsedMd.sections.warmup[0]).toMatchObject({
      name: 'Arm Circles',
      imageUrl: 'https://example.com/arm.png',
      reps: 10,
      repUnit: 'reps'
    });
    expect(parsedMd.sections.main[0]).toMatchObject({
      name: 'Dumbbell Row',
      imageUrl: 'https://example.com/row.jpg',
      weightKg: 2,
      sets: 2,
      reps: 10
    });
    expect(parsedMd.sections.cooldown[0]).toMatchObject({
      name: 'Tricep Stretch',
      reps: 30,
      repUnit: 'sec'
    });

    const tsv = `Warm-up\tMarch in Place\t60 วินาที\tเดินยกเข่า\nMain\tGoblet Squat\t2 kg\t2 x 10 ครั้ง\tย่อตัวเหมือนนั่งเก้าอี้`;
    const parsedTsv = parseWorkoutText(tsv);
    expect(parsedTsv.sections.warmup).toHaveLength(1);
    expect(parsedTsv.sections.main[0]).toMatchObject({ name: 'Goblet Squat', weightKg: 2, sets: 2, reps: 10 });
  });

  it('formats a structured workout into strict 3-section template text preserving image links', () => {
    const formatted = formatWorkoutTemplate({
      programName: 'Day A — Lower Body',
      muscleGroup: 'ขาและสะโพก',
      durationMin: 25,
      sections: {
        warmup: [{ name: 'March in Place', imageUrl: 'https://example.com/march.png', sets: 1, reps: 60, repUnit: 'sec', note: 'เดินยกเข่า' }],
        main: [{ name: 'Goblet Squat', imageUrl: 'https://example.com/goblet.png', weightKg: 2, perSide: false, sets: 2, reps: 10, repUnit: 'reps', note: 'ถือดัมเบลหน้าอก' }],
        cooldown: [{ name: 'Slow March', imageUrl: '', sets: 1, reps: 45, repUnit: 'sec', note: 'เดินช้า ๆ' }]
      }
    });

    expect(formatted).toContain('1. Warm-up\nhttps://example.com/march.png\n1. March in Place\n60 วินาที');
    expect(formatted).toContain('2. Main Workout\nhttps://example.com/goblet.png\n1. Goblet Squat\n2 kg\n2 × 10 ครั้ง');
    expect(formatted).toContain('3. Cool-down\n1. Slow March\n45 วินาที');

    const roundTrip = parseWorkoutText(formatted);
    expect(roundTrip.totalExercises).toBe(3);
    expect(roundTrip.sections.main[0].imageUrl).toBe('https://example.com/goblet.png');
  });

  it('returns an empty result for blank input and rejects unsafe or incomplete URLs', () => {
    expect(parseWorkoutText(' \n ').totalExercises).toBe(0);
    expect(safeHttpUrl('javascript:alert(1)')).toBe('');
    expect(safeHttpUrl('https://images.openai..')).toBe('');
    expect(safeHttpUrl('https://example.com')).toBe('https://example.com/');
  });
});
