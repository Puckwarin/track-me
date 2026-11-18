# Testing, CI & Runtime Error Reports

## Local requirements

- Node.js 24.12 or newer
- Java 21 or newer for the Firestore Emulator

Install dependencies with `npm ci`, then run:

| Command | Purpose |
|---|---|
| `npm run lock:check` | Checks `package.json` vs `package-lock.json` sync and optional platform packages |
| `npm run lint` | ESLint checks for application source |
| `npm test` | Vitest unit tests; Firestore Rules tests are skipped unless the Emulator is running |
| `npm run test:coverage` | Unit tests plus text, HTML, and LCOV coverage reports in `coverage/` |
| `npm run test:rules` | Starts the Firestore Emulator and runs Rules integration tests |
| `npm run build` | Builds the production site |

Coverage thresholds are 10% statements, 8% branches, 7% functions, and 12% lines. They are regression floors, not a claim that the UI is comprehensively covered. Deterministic logic tests cover local date helpers (`localDateStr`, `localMonthStr`, `addDays` in `src/util.test.js`), parsers (food, workout, reminder, statement, slip OCR, Zepp CSV), schema sanitizers, backup/restore planning & batched commits (`src/backup.test.js`), Firestore snapshot listener lifecycle & offline/pending sync indicators (`src/sync.test.js`), expense rules/budgets/recurrence, monthly overview dashboard aggregation & `localStorage` caching (`src/overviewLogic.test.js`), TDEE calculations, cycle statistics, food validation, nutrition/USDA/OFF/exercise image persistent caches (`src/nutrition.test.js`, `src/foodsearch.test.js`, `src/exerciseMedia.test.js`), local OCR sufficiency threshold, AI per-model & provider fallback/cooldown/model routing, 0-token local assistant & fuzzy food matching (`src/services/localAssistant.test.js`), AI assistant roles/tools/notes/feedback/markdown sanitization/write rollback, runtime monitoring, and onboarding state. Tests do not call paid or live external APIs. `src/services/aiService.test.js` has 15 active tests, `src/services/aiAssistant.test.js` has 13 active tests, `src/services/localAssistant.test.js` has 7 active tests, `src/util.test.js` has 6 active tests, `src/zeppParser.test.js` has 9 active tests, `src/nutrition.test.js` has 5 active tests, `src/backup.test.js` has 5 active tests, `src/overviewLogic.test.js` has 4 active tests, `src/sync.test.js` has 2 active tests, `src/foodsearch.test.js` has 2 active tests, `src/exerciseMedia.test.js` has 1 active test, and `src/schema.test.js` has 7 active tests with no skipped tests; on a machine without the Emulator, the 5 Firestore Rules tests are skipped by the regular unit-test run.

ผลตรวจสอบล่าสุดสำหรับ PR #20 (commit `b83bb97`, 2026-11-18):

- รัน `npm test` ในเครื่อง: ผ่าน 132 tests จาก 29 test files; ข้าม Firestore Rules 5 tests เนื่องจาก environment ไม่มี Java Runtime
- GitHub Actions run `44239422504` สำหรับ PR #20: `npm run test:coverage` ผ่าน 132 tests และ `npm run test:rules` ผ่านครบ 5 tests บน Java 21 + Firestore Emulator
- `npm run lock:check` และ `npm run build` ในเครื่อง: ผ่าน
- `npm run lint` ล่าสุดหลังแก้ warnings: ผ่านโดยไม่มี errors และ warnings; ก่อนแก้พบ `no-unused-vars` 6 รายการใน `src/dashboard.js` ซึ่งลบ imports/helper/ตัวแปรที่ไม่ได้ใช้ออกโดยไม่เปลี่ยน logic
- `src/firestoreRules.test.js` ครอบคลุมสิทธิ์เจ้าของข้อมูล, การปฏิเสธผู้ใช้ที่ไม่ล็อกอิน/ข้ามผู้ใช้/collection ที่ไม่รู้จัก, การตรวจ ownership/type/ขนาดเอกสาร, runtime error logs และ migration rules

ข้อจำกัดการตรวจรับ: ไม่มีบัญชีทดสอบและ credentials ที่อนุญาตให้ใช้ จึงไม่ได้ทดสอบ Google sign-in/sign-out, การอ่าน/เขียนข้อมูลจริงแยกผู้ใช้, CRUD ของ Food/Health/Care/Expenses, การตั้งค่า Home, backup/restore, CSV import/export หรือการแยกข้อมูลระหว่างบัญชี เบราว์เซอร์ตรวจได้เฉพาะหน้าล็อกอินที่ viewport 300×600 (dark mode); ไม่ได้ทดสอบ navigation หลัง authentication, network requests ของ workflow ที่ต้องล็อกอิน หรือ console ระหว่างใช้งานจริง

จากการตรวจ diff ของ PR #20 ไม่พบการเปลี่ยน `firestore.rules`, `firestore.rules.migration`, `firebase.json` หรือ `src/schema.js` ทั้งนี้การตรวจ diff ไม่ได้ทดแทนการทดสอบบนบัญชีจริง

*หมายเหตุสำหรับการเตรียม v5.0.0:* ผลข้างต้นเป็นหลักฐานตรวจสอบ PR #20 เท่านั้น ไม่ได้หมายความว่า release ถูกเผยแพร่แล้ว; ดูรายการ draft ใน `CHANGELOG.md` และอัปเดตผลตรวจนี้อีกครั้งหากมี commit ใหม่ก่อน merge.

Run a focused test while iterating:

```bash
npm test -- src/onboardingState.test.js
```

The onboarding tests cover first-sign-in detection, existing-account bypass, saved progress/resume, optional profile skip and validation, permission-denied handling, and completion persistence.

## GitHub Actions

`.github/workflows/build.yml` runs lint, unit tests with coverage, Firestore Rules Emulator tests, and a production build on pull requests to `main`, pushes to `main` and `integration/**`, and manual dispatch. The Pages artifact is deployed only after all checks pass on `main`. This replaces the former second Pages build workflow to avoid duplicate builds. The daily push workflow remains separate.

CI uses Node.js 24 and Java 21, caches npm dependencies and the Firebase Emulator, and uses `npm ci` so lockfile or install failures stop the check clearly. Local `npm run test:rules` also requires a Java 21+ runtime; it uses only the `track-me-rules-test` Emulator project and never production.

## Runtime error reporting and privacy

For signed-in users, the app sends a small, bounded set of runtime error reports to `users/{uid}/runtime_error_logs` when monitored errors occur. Reports contain only:

- `category` and `source` from fixed allowlists
- A sanitized error `code` (not the error message)
- `occurredAt` and server-generated `receivedAt` timestamps

The app does not send stack traces, prompts, OCR text, health/expense records, API keys, credentials, or tokens. Reports are suppressed while signed out, deduplicated for 10 minutes, limited to five per minute per browser session, buffered in memory, and flushed in batches of at most 10 while online. A failed report is dropped and logged locally by its error code; monitoring failures do not interrupt app behavior. Client-side limits reduce accidental writes but are not a server-enforced quota.

The dedicated rule in `firestore.rules` permits an authenticated owner to create allowlisted metadata only; reading, updating, and deleting these documents through the app are denied. Reports can be inspected by project administrators in Firebase Console. There is no automatic retention cleanup configured.

The repository change does not deploy Firebase Rules. Until the updated `firestore.rules` is published through the approved Firebase deployment process, runtime reports will be rejected by an older deployed ruleset; normal application features continue to work. Rules tests run against the local Emulator and never production.

## Coverage scope

The app is Vanilla JavaScript; React Testing Library and React Error Boundaries do not apply. Global browser errors, unhandled rejections, API/AI failures, Firebase sync/auth errors, and lazy chunk failures are captured by the lightweight runtime monitor instead.
