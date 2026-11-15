import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const rulesTest = describe.skipIf(!emulatorAvailable);
let productionEnv;
let migrationEnv;

rulesTest('production Firestore rules', () => {
  beforeAll(async () => {
    productionEnv = await initializeTestEnvironment({
      projectId: 'track-me-rules-test',
      firestore: {
        rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
      }
    });
  });

  beforeEach(async () => {
    await productionEnv.clearFirestore();
  });

  afterAll(async () => {
    await productionEnv?.cleanup();
  });

  it('allows an owner to read and write a known collection', async () => {
    const db = productionEnv.authenticatedContext('alice').firestore();
    const record = doc(db, 'users/alice/food_records/breakfast');

    await assertSucceeds(setDoc(record, {
      date: '2026-03-01',
      name: 'Breakfast',
      calories: 250,
      createdAt: new Date()
    }));
    await assertSucceeds(getDoc(record));
  });

  it('denies unauthenticated, cross-user, and unknown collection access', async () => {
    const aliceDb = productionEnv.authenticatedContext('alice').firestore();
    const bobDb = productionEnv.authenticatedContext('bob').firestore();
    const anonymousDb = productionEnv.unauthenticatedContext().firestore();
    const aliceRecord = doc(aliceDb, 'users/alice/body_records/today');

    await assertSucceeds(setDoc(aliceRecord, { date: '2026-03-01', weight: 55 }));
    await assertFails(getDoc(doc(anonymousDb, 'users/alice/body_records/today')));
    await assertFails(getDoc(doc(bobDb, 'users/alice/body_records/today')));
    await assertFails(setDoc(doc(bobDb, 'users/alice/body_records/other'), { date: '2026-03-01' }));
    await assertFails(setDoc(doc(aliceDb, 'users/alice/private_records/x'), { value: 1 }));
  });

  it('rejects mismatched ownership, malformed field types, and oversized documents', async () => {
    const db = productionEnv.authenticatedContext('alice').firestore();
    const record = doc(db, 'users/alice/food_records/invalid');

    await assertFails(setDoc(record, { uid: 'bob', date: '2026-03-01', name: 'Lunch' }));
    await assertFails(setDoc(record, { date: 20260301, name: 'Lunch' }));
    await assertFails(setDoc(record, { date: '2026-03-01', name: 'Lunch', amount: '100' }));
    await assertFails(setDoc(record, {
      date: '2026-03-01',
      name: 'Lunch',
      ...Object.fromEntries(Array.from({ length: 29 }, (_, i) => [`extra${i}`, i]))
    }));
  });

  it('allows only minimal owner-created runtime errors and denies later access', async () => {
    const db = productionEnv.authenticatedContext('alice').firestore();
    const bobDb = productionEnv.authenticatedContext('bob').firestore();
    const anonymousDb = productionEnv.unauthenticatedContext().firestore();
    const record = doc(db, 'users/alice/runtime_error_logs/error-1');
    const safeReport = {
      category: 'firebase',
      code: 'permission-denied',
      source: 'sync',
      occurredAt: new Date('2026-04-10T12:00:00Z'),
      receivedAt: serverTimestamp()
    };

    await assertSucceeds(setDoc(record, safeReport));
    await assertFails(setDoc(doc(bobDb, 'users/alice/runtime_error_logs/cross-user'), safeReport));
    await assertFails(setDoc(doc(anonymousDb, 'users/alice/runtime_error_logs/anonymous'), safeReport));
    await assertFails(getDoc(record));
    await assertFails(updateDoc(record, { code: 'unavailable' }));
    await assertFails(deleteDoc(record));
    await assertFails(setDoc(doc(db, 'users/alice/runtime_error_logs/extra'), {
      ...safeReport,
      message: 'must not be stored'
    }));
    await assertFails(setDoc(doc(db, 'users/alice/runtime_error_logs/invalid'), {
      ...safeReport,
      category: 'health-data'
    }));
  });
});

rulesTest('temporary Room Code migration rules', () => {
  beforeAll(async () => {
    migrationEnv = await initializeTestEnvironment({
      projectId: 'track-me-rules-migration-test',
      firestore: {
        rules: await readFile(new URL('../firestore.rules.migration', import.meta.url), 'utf8')
      }
    });
  });

  beforeEach(async () => {
    await migrationEnv.clearFirestore();
  });

  afterAll(async () => {
    await migrationEnv?.cleanup();
  });

  it('allows authenticated access to legacy documents only during migration', async () => {
    await migrationEnv.withSecurityRulesDisabled(context =>
      setDoc(doc(context.firestore(), 'food_records/legacy'), { room: 'old-room' }));

    const authenticatedDb = migrationEnv.authenticatedContext('alice').firestore();
    const anonymousDb = migrationEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(authenticatedDb, 'food_records/legacy')));
    await assertFails(getDoc(doc(anonymousDb, 'food_records/legacy')));
  });
});
