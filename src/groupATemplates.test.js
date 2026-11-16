import { describe, expect, it } from 'vitest';
import { WORKOUT_PRESET_TEMPLATES } from './workoutPresets.js';
import { parseWorkoutText } from './workoutParser.js';
import { LAB_PRESETS } from './lab.js';
import { LAB_PANEL_TEMPLATES, findLatestLabDefaults, parseBulkLabText } from './labTemplates.js';

describe('Group A Zero-Token Presets & Bulk Parsers', () => {
  it('parses every WORKOUT_PRESET_TEMPLATES cleanly into warmup, main, and cooldown', () => {
    expect(WORKOUT_PRESET_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    for (const preset of WORKOUT_PRESET_TEMPLATES) {
      const parsed = parseWorkoutText(preset.text);
      expect(parsed).toBeTruthy();
      expect(parsed.sections.warmup.length).toBeGreaterThan(0);
      expect(parsed.sections.main.length).toBeGreaterThan(0);
      expect(parsed.sections.cooldown.length).toBeGreaterThan(0);
    }
  });

  it('resolves LAB_PANEL_TEMPLATES with latest user ref ranges or fallback presets', () => {
    const existingLabs = [
      { date: '2026-10-01', name: 'BUN', unit: 'mg/dL', refLow: 9, refHigh: 29 },
      { date: '2026-09-01', name: 'BUN', unit: 'mg/dL', refLow: 7, refHigh: 27 }
    ];
    for (const panel of LAB_PANEL_TEMPLATES) {
      expect(panel.items.length).toBeGreaterThan(0);
      for (const name of panel.items) {
        const def = findLatestLabDefaults(name, LAB_PRESETS, existingLabs);
        expect(def.name).toBe(name);
        expect(def.unit).toBeTruthy();
      }
    }
    const bunDef = findLatestLabDefaults('BUN', LAB_PRESETS, existingLabs);
    expect(bunDef.refLow).toBe(9);
    expect(bunDef.refHigh).toBe(29);
  });

  it('parses multi-line lab results including aliases, tabs, units, and ref ranges', () => {
    const raw = [
      'BUN 18 mg/dL (7-27)',
      'CREA: 1.2 mg/dL',
      'SGPT\t64\tU/L\t10-125',
      'WBC = 10.5',
      'Invalid line without number'
    ].join('\n');

    const { items, errors } = parseBulkLabText(raw, LAB_PRESETS, []);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ name: 'BUN', value: 18, unit: 'mg/dL', refLow: 7, refHigh: 27 });
    expect(items[1]).toMatchObject({ name: 'Creatinine (CREA)', value: 1.2, unit: 'mg/dL' });
    expect(items[2]).toMatchObject({ name: 'ALT (SGPT)', value: 64, unit: 'U/L', refLow: 10, refHigh: 125 });
    expect(items[3]).toMatchObject({ name: 'WBC', value: 10.5, unit: 'K/µL' });
    expect(errors).toHaveLength(1);
  });
});
