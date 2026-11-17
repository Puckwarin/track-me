import { describe, expect, it, vi } from 'vitest';
import {
  BACKUP_APP,
  BACKUP_VERSION,
  buildBackupPayload,
  buildRestorePlan,
  collectBackupData,
  commitRestoreRows,
  filterRestoreRows,
  markExistingRestoreItems
} from './backup.js';

const snapOf = rows => ({
  docs: rows.map(({ id, ...rest }) => ({
    id,
    data: () => ({ ...rest })
  }))
});

describe('backup export, restore planning, and batched commit', () => {
  it('excludes settings/push, converts timestamps, and flattens legacy expense_month docs during export', async () => {
    const fakeTimestamp = { toDate: () => new Date('2026-11-17T05:15:00.000Z') };
    const collections = {
      food_records: snapOf([
        { id: 'f1', date: '2026-11-17', meal: 'breakfast', name: 'ไข่ต้ม', calories: 150, protein: 12, carbs: 1, fat: 10, createdAt: fakeTimestamp }
      ]),
      expense_records: snapOf([
        { id: 'ex1', type: 'expense', amount: 120, category: 'อาหาร', date: '2026-11-17', merchant: 'ร้านใหม่' }
      ]),
      settings: snapOf([
        { id: 'profile', sex: 'female', heightCm: 162, weightKg: 54 },
        { id: 'push', endpoint: 'https://push.example/sub/secret', keys: { auth: 'secret-auth', p256dh: 'secret-key' } },
        {
          id: 'exp_2026-10',
          kind: 'expense_month',
          items: [
            { id: 'ex1', type: 'expense', amount: 999, category: 'อาหาร', date: '2026-11-17', merchant: 'ข้อมูลเก่าที่ไม่ควรทับ' },
            { id: 'lg1', type: 'expense', amount: 55, category: 'เครื่องดื่ม/คาเฟ่', date: '2026-10-12', merchant: 'กาแฟ' }
          ]
        }
      ])
    };

    const data = await collectBackupData(
      'uid-1',
      ['food_records', 'expense_records', 'settings'],
      async col => collections[col] || snapOf([])
    );

    expect(data.food_records[0].createdAt).toBe('2026-11-17T05:15:00.000Z');
    expect(data.settings).toEqual([{ id: 'profile', sex: 'female', heightCm: 162, weightKg: 54 }]);
    expect(data.expense_records).toHaveLength(2);
    expect(data.expense_records.find(r => r.id === 'ex1')?.merchant).toBe('ร้านใหม่');
    expect(data.expense_records.find(r => r.id === 'lg1')?.amount).toBe(55);

    const payload = buildBackupPayload(data, '2026-11-17');
    expect(payload).toEqual({
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportDate: '2026-11-17',
      data
    });
  });

  it('rejects oversized, malformed, or non-TrackMe backup files', () => {
    expect(() => buildRestorePlan('{}', 21 * 1024 * 1024)).toThrow('ไฟล์ใหญ่เกินไป');
    expect(() => buildRestorePlan('{not json', 100)).toThrow();
    expect(() => buildRestorePlan(JSON.stringify({ app: 'OtherApp', data: {} }), 50)).toThrow('ไม่ใช่ไฟล์สำรองของ Track Me');
    expect(() => buildRestorePlan(JSON.stringify({ app: BACKUP_APP, data: [] }), 50)).toThrow('ไม่ใช่ไฟล์สำรองของ Track Me');
  });

  it('builds a sanitized restore plan, unpacks legacy expenses, skips settings/push, and counts bad items', () => {
    const raw = JSON.stringify({
      app: BACKUP_APP,
      version: '4.6.0',
      exportDate: '2026-11-16',
      data: {
        food_records: [
          { id: 'food1', date: '2026-11-16', meal: 'lunch', name: 'ข้าวผัด', calories: 520 },
          { id: 'food1', date: '2026-11-16', meal: 'lunch', name: 'ซ้ำไอดี', calories: 999 },
          { id: 'bad1', date: 'not-a-date', meal: 'lunch', name: 'invalid' },
          null
        ],
        settings: [
          { id: 'push', endpoint: 'https://push.example/blocked', p256dh: 'x', auth: 'y' },
          { id: 'profile', sex: 'female', heightCm: 160, weightKg: 52 },
          {
            id: 'exp_2026-09',
            kind: 'expense_month',
            items: [
              { id: 'lg_ok', type: 'expense', amount: 85, category: 'อาหาร', date: '2026-09-20' },
              { id: '', type: 'expense', amount: 50, category: 'อาหาร', date: '2026-09-21' }
            ]
          }
        ]
      }
    });

    const res = buildRestorePlan(raw, raw.length);
    expect(res.version).toBe('4.6.0');
    expect(res.exportDate).toBe('2026-11-16');
    expect(res.bad).toBe(3); // invalid food + null + invalid legacy expense without id
    expect(res.plan.food_records).toHaveLength(1);
    expect(res.plan.food_records[0].id).toBe('food1');
    expect(res.plan.settings).toHaveLength(1);
    expect(res.plan.settings[0]).toMatchObject({ id: 'profile', data: { sex: 'female', heightCm: 160, weightKg: 52 } });
    expect(res.plan.expense_records).toHaveLength(1);
    expect(res.plan.expense_records[0].id).toBe('lg_ok');
  });

  it('marks existing documents and filters skip vs overwrite restore rows', async () => {
    const raw = JSON.stringify({
      app: BACKUP_APP,
      version: '4.8.0',
      exportDate: '2026-11-17',
      data: {
        food_records: [
          { id: 'f_existing', date: '2026-11-17', meal: 'lunch', name: 'เดิม', calories: 300 },
          { id: 'f_new', date: '2026-11-17', meal: 'dinner', name: 'ใหม่', calories: 400 }
        ],
        expense_records: [
          { id: 'e_new', type: 'expense', amount: 60, category: 'อาหาร', date: '2026-11-17' }
        ]
      }
    });

    const { plan } = buildRestorePlan(raw, raw.length);
    await markExistingRestoreItems(plan, 'uid-1', async col => {
      if (col === 'food_records') return snapOf([{ id: 'f_existing' }]);
      return snapOf([]);
    });

    expect(filterRestoreRows(plan, ['food_records', 'expense_records'], 'skip').map(r => r.id))
      .toEqual(['f_new', 'e_new']);
    expect(filterRestoreRows(plan, ['food_records', 'expense_records'], 'overwrite').map(r => r.id))
      .toEqual(['f_existing', 'f_new', 'e_new']);
    expect(filterRestoreRows(plan, ['food_records'], 'skip').map(r => r.id))
      .toEqual(['f_new']);
  });

  it('commits restore rows in batches of up to 400 operations per batch', async () => {
    const rows = Array.from({ length: 805 }, (_, i) => ({
      c: 'food_records',
      id: `item_${i}`,
      data: { name: `Food ${i}` }
    }));

    const batches = [];
    const createBatch = vi.fn(() => {
      const ops = [];
      const b = {
        set: vi.fn((ref, data) => ops.push({ ref, data })),
        commit: vi.fn(async () => {})
      };
      batches.push({ b, ops });
      return b;
    });
    const docRef = vi.fn((uid, c, id) => `${uid}/${c}/${id}`);

    await commitRestoreRows('uid-1', rows, {
      firestore: {},
      createBatch,
      docRef
    });

    expect(createBatch).toHaveBeenCalledTimes(3);
    expect(batches[0].ops).toHaveLength(400);
    expect(batches[1].ops).toHaveLength(400);
    expect(batches[2].ops).toHaveLength(5);
    expect(batches[0].b.commit).toHaveBeenCalledTimes(1);
    expect(batches[1].b.commit).toHaveBeenCalledTimes(1);
    expect(batches[2].b.commit).toHaveBeenCalledTimes(1);
    expect(batches[2].ops[4].ref).toBe('uid-1/food_records/item_804');
  });
});
