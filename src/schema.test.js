import { describe, expect, it } from 'vitest';
import { docIdFor, SANITIZERS } from './schema.js';

describe('schema sanitizers', () => {
  it('keeps only recognized food fields and rejects invalid values', () => {
    const result = SANITIZERS.food_records({
      date: '2026-04-10',
      name: 'ข้าว',
      calories: -5,
      protein: 12,
      unexpected: 'private value',
      createdAt: '2026-04-10T00:00:00.000Z'
    });

    expect(result).toMatchObject({ date: '2026-04-10', name: 'ข้าว', calories: 0, protein: 12 });
    expect(result).not.toHaveProperty('unexpected');
    expect(SANITIZERS.food_records({ date: '2026/02/30', name: 'ข้าว' })).toBeNull();
  });

  it('excludes push subscriptions from backups and preserves safe expense IDs', () => {
    expect(SANITIZERS.settings({ id: 'push', subscriptions: [{ endpoint: 'private' }] })).toBeNull();
    expect(docIdFor('expense_records', { id: 'expense_123' }, 'fallback')).toBe('expense_123');
    expect(docIdFor('expense_records', { id: '../invalid' }, 'fallback')).toBe('fallback');
  });
});
