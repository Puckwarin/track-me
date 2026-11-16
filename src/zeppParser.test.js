import { describe, expect, it } from 'vitest';
import { mergeZeppDayRecords, parseCsvRows, parseZeppCsv } from './zeppParser.js';

describe('Zepp CSV parser and merger', () => {
  it('parses BOM, quoted cells, and semicolon/comma delimiters', () => {
    const rows = parseCsvRows('\uFEFFdate,steps,note\r\n2026-11-10,"8,420","เดินสวน, อากาศดี"\r\n');
    expect(rows).toEqual([
      ['date', 'steps', 'note'],
      ['2026-11-10', '8,420', 'เดินสวน, อากาศดี']
    ]);
  });

  it('parses Zepp ACTIVITY.csv with meter-to-km conversion and calories', () => {
    const csv = [
      'date,steps,distance,runDistance,calories',
      '2026-11-10,8420,5640,0,285',
      '2026-11-09,10200,7200,0,340'
    ].join('\n');

    const res = parseZeppCsv(csv, 'ACTIVITY_1731200000.csv');
    expect(res.detectedType).toBe('activity');
    expect(res.skipped).toBe(0);
    expect(res.records).toHaveLength(2);
    expect(res.records[0]).toEqual({
      date: '2026-11-10',
      steps: 8420,
      distanceKm: 5.64,
      activeKcal: 285,
      source: 'zepp_csv'
    });
  });

  it('parses Zepp SLEEP.csv with deep/light/REM minutes and timestamps', () => {
    const csv = [
      'date,deepSleepTime,shallowSleepTime,wakeTime,start,stop,REMTime',
      '2026-11-10,110,280,15,2026-11-09 23:20:00,2026-11-10 06:50:00,60'
    ].join('\n');

    const res = parseZeppCsv(csv, 'SLEEP_1731200000.csv');
    expect(res.detectedType).toBe('sleep');
    expect(res.records[0]).toEqual({
      date: '2026-11-10',
      deepSleepMin: 110,
      lightSleepMin: 280,
      remSleepMin: 60,
      sleepMinutes: 450,
      sleepHours: 7.5,
      bedTime: '23:20',
      wakeTime: '06:50',
      note: 'ตื่นระหว่างคืน 15 นาที',
      source: 'zepp_csv'
    });
  });

  it('template 1: summarizes per-minute stage/hr/respiratory_rate rows into one night', () => {
    const csv = [
      'date,time,stage,hr,respiratory_rate',
      '2026-11-09,23:00,light,64,15',
      '2026-11-09,23:30,deep,58,14',
      '2026-11-10,00:30,rem,62,16',
      '2026-11-10,01:00,awake,70,17',
      '2026-11-10,01:10,light,60,15',
      '2026-11-10,01:40,light,60,15'
    ].join('\n');
    const res = parseZeppCsv(csv, 'SLEEP_DETAIL.csv');
    expect(res.detectedType).toBe('sleep_stage');
    expect(res.records).toHaveLength(1);
    expect(res.records[0]).toMatchObject({
      date: '2026-11-10',
      bedTime: '23:00',
      wakeTime: '02:10',
      deepSleepMin: 30,
      remSleepMin: 30,
      lightSleepMin: 90,
      sleepMinutes: 150,
      sleepHours: 2.5
    });
    expect(res.records[0].note).toContain('HR ขณะนอนเฉลี่ย 62 bpm');
    expect(res.records[0].note).toContain('หายใจเฉลี่ย 15.3');
    expect(res.records[0].note).toContain('ตื่นระหว่างคืน 10 นาที');
  });

  it('template 1: skips rows with unknown stage or missing time', () => {
    const res = parseZeppCsv('date,time,stage,hr,respiratory_rate\n2026-11-10,,deep,60,14\n2026-11-10,01:00,xyz,60,14\n', 'x.csv');
    expect(res.records).toEqual([]);
    expect(res.skipped).toBe(2);
  });

  it('template 2: reads naps and keeps main sleep totals', () => {
    const csv = [
      'date,deepSleepTime,shallowSleepTime,wakeTime,start,stop,REMTime,naps',
      '2026-11-11,90,300,20,2026-11-10 23:00:00,2026-11-11 06:40:00,70,25'
    ].join('\n');
    const res = parseZeppCsv(csv, 'SLEEP.csv');
    expect(res.records[0]).toMatchObject({ date: '2026-11-11', sleepMinutes: 460, bedTime: '23:00', wakeTime: '06:40' });
    expect(res.records[0].note).toBe('งีบ 25 นาที · ตื่นระหว่างคืน 20 นาที');
  });

  it('template 3: converts runDistance meters into a note and merges all 3 templates by date', () => {
    const act = parseZeppCsv('date,steps,distance,runDistance,calories\n2026-11-10,12000,8500,3200,410\n', 'ACTIVITY.csv');
    expect(act.records[0]).toMatchObject({ steps: 12000, distanceKm: 8.5, activeKcal: 410, note: 'วิ่ง 3.2 กม.' });
    const stage = parseZeppCsv('date,time,stage,hr,respiratory_rate\n2026-11-10,00:00,deep,55,13\n2026-11-10,00:01,deep,55,13\n', 's.csv');
    const merged = mergeZeppDayRecords([act.records, stage.records]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ steps: 12000, deepSleepMin: 2 });
    expect(merged[0].note).toContain('วิ่ง 3.2 กม.');
    expect(merged[0].note).toContain('HR ขณะนอนเฉลี่ย 55 bpm');
  });

  it('parses Thai-header and HH:MM sleep duration CSVs safely and merges activity + sleep on same date', () => {
    const act = parseZeppCsv('วันที่,จำนวนก้าว,ระยะทาง (กม.)\n10/11/2569,9100,6.2\n', 'act.csv');
    const slp = parseZeppCsv('วันที่,การนอน,เข้านอน,ตื่นนอน\n2026-11-10,7:30,23:00,06:30\n', 'slp.csv');

    const merged = mergeZeppDayRecords([act.records, slp.records]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      date: '2026-11-10',
      steps: 9100,
      distanceKm: 6.2,
      sleepMinutes: 450,
      sleepHours: 7.5,
      bedTime: '23:00',
      wakeTime: '06:30'
    });
  });

  it('skips invalid rows and handles empty/unrecognized CSVs cleanly', () => {
    const res = parseZeppCsv('date,steps\ninvalid-date,5000\n2026-11-10,\n', 'bad.csv');
    expect(res.records).toEqual([]);
    expect(res.skipped).toBe(2);
    expect(parseZeppCsv('', 'empty.csv')).toEqual({ records: [], skipped: 0, detectedType: 'unknown' });
  });
});
