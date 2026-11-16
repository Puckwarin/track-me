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
      source: 'zepp_csv'
    });
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
