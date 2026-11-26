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

## โหมด Demo Preview

รัน `npm run dev` แล้วเลือก **ดูตัวอย่างโดยไม่เข้าสู่ระบบ** ที่หน้า Login ได้ในโหมด Development เท่านั้น โหมดนี้แสดงข้อมูลสมมติในหน่วยความจำ ไม่เชื่อม Firestore และปิดการบันทึก/แก้ไขข้อมูล; กด **ออกจากตัวอย่าง** เพื่อกลับหน้า Login

Coverage thresholds are 10% statements, 8% branches, 7% functions, and 12% lines. They are regression floors, not a claim that the UI is comprehensively covered. Deterministic logic tests cover local date helpers (`localDateStr`, `localMonthStr`, `addDays` in `src/util.test.js`), parsers (food, workout, reminder, statement, slip OCR, Zepp CSV), schema sanitizers, backup/restore planning & batched commits (`src/backup.test.js`), Firestore snapshot listener lifecycle & offline/pending sync indicators (`src/sync.test.js`), expense rules/budgets/recurrence, monthly overview dashboard aggregation & `localStorage` caching (`src/overviewLogic.test.js`), TDEE calculations, cycle statistics, food validation, nutrition/USDA/OFF/exercise image persistent caches (`src/nutrition.test.js`, `src/foodsearch.test.js`, `src/exerciseMedia.test.js`), local OCR sufficiency threshold, AI per-model & provider fallback/cooldown/model routing, 0-token local assistant & fuzzy food matching (`src/services/localAssistant.test.js`), AI assistant roles/tools/notes/feedback/markdown sanitization/write rollback, runtime monitoring, and onboarding state. Tests do not call paid or live external APIs. `src/services/aiService.test.js` has 15 active tests, `src/services/aiAssistant.test.js` has 13 active tests, `src/services/localAssistant.test.js` has 7 active tests, `src/util.test.js` has 6 active tests, `src/zeppParser.test.js` has 9 active tests, `src/nutrition.test.js` has 5 active tests, `src/backup.test.js` has 5 active tests, `src/overviewLogic.test.js` has 4 active tests, `src/sync.test.js` has 2 active tests, `src/foodsearch.test.js` has 2 active tests, `src/exerciseMedia.test.js` has 1 active test, and `src/schema.test.js` has 7 active tests with no skipped tests; on a machine without the Emulator, the 5 Firestore Rules tests are skipped by the regular unit-test run.

ผลตรวจสอบ v6.1.0 (2026-11-26):

- `npm run lint` (`eslint src`): ผ่าน ไม่มี errors หรือ warnings
- `npm run build` / Applet compile: ผ่าน
- `npm test` (`vitest run`), Firestore Rules Emulator (`npm run test:rules`) และการทดสอบบนเบราว์เซอร์จริง/บัญชี Firebase Production: **ไม่ได้รันทดสอบตามคำขอผู้ใช้**

ผลตรวจสอบ v6.0.0 (อัปเดตล่าสุด 2026-11-25):

- `npm run lock:check`: ผ่าน (`1,234` entries, `0 missing optionalDependencies`; ซิงค์เวอร์ชัน `6.0.0` ใน `package.json` และ `package-lock.json`)
- `npm run lint` (`eslint src`): ผ่าน ไม่มี errors หรือ warnings
- `npm test` (`vitest run`): ผ่าน **189 tests จาก 38 test files** (เพิ่มการทดสอบคอนทราสต์ `MEAL_PIE_PALETTE` ใน `src/foodCalculations.test.js` 9 tests, Hover Floating Tooltip สำหรับกราฟทั่วไปใน `src/uiWeekStrip.test.js` 5 tests, การหมุนเวียนข้อความให้กำลังใจรายวันใน `src/homeWidgetContract.test.js` 7 tests และตรวจตัวเลือกประเมินเซสชันใน `src/workoutActive.test.js` 5 tests ร่วมกับชุดทดสอบเดิมทั้งหมด); ข้าม **5 Firestore Rules tests** (`src/firestoreRules.test.js`) เนื่องจากไม่ได้เปิด Firestore Emulator ในสภาพแวดล้อมนี้
- `npm run build` / Applet compile: ผ่าน (`246 modules transformed`; `dist/assets/index-*.js` `253.52 kB` / `78.50 kB` gzip, `vendor-firebase-*.js` `804.93 kB` / `204.65 kB` gzip; `PWA v1.3.0` precache 61 entries, `5,346.03 KiB`)
- การทดสอบบนเบราว์เซอร์จริง (รวมถึงตรวจสอบ Layout Desktop/มือถือจริง), บัญชี Firebase Production และ Firestore Rules Emulator (`npm run test:rules`): ยังไม่ได้รันในเครื่องนี้

ผลตรวจสอบ v5.10.0 (2026-11-24):

- `npm run lock:check`: ผ่าน (`1,234` entries, `0 missing optionalDependencies`; ซิงค์เวอร์ชัน `5.10.0` ใน `package.json` และ `package-lock.json`)
- `npm run lint` (`eslint src`): ผ่าน ไม่มี errors หรือ warnings
- `npm test` (`vitest run`): ผ่าน **178 tests จาก 36 test files** (เพิ่ม `src/statementParser.test.js` 9 tests, ขยาย `src/services/aiAssistant.test.js` เป็น 14 tests, ขยาย `src/planner.test.js` เป็น 7 tests, ปรับ `src/navigation.test.js` 4 tests ร่วมกับ `src/uiWeekStrip.test.js` 4 tests, `src/donutChart.test.js` 10 tests, `src/foodCalculations.test.js` 8 tests, `src/homeWidgetContract.test.js` 6 tests, `src/schema.test.js` 8 tests, `src/icons.test.js` 2 tests และชุดทดสอบเดิมทั้งหมด); ข้าม **5 Firestore Rules tests** (`src/firestoreRules.test.js`) เนื่องจากไม่ได้เปิด Firestore Emulator ในสภาพแวดล้อมนี้
- `npm run build` / Applet compile: ผ่าน (`dist/assets/index-*.js` ลดเหลือ `241.02 kB` minified / `74.68 kB` gzip และ `vendor-firebase-*.js` `804.93 kB` minified / `204.65 kB` gzip; `PWA v1.3.0` precache 62 entries, `5,313.85 KiB`)
- การทดสอบบนเบราว์เซอร์จริง (รวมถึงตรวจเลย์เอาต์บน Desktop/มือถือจริง), บัญชี Firebase Production และ Firestore Rules Emulator (`npm run test:rules`): ยังไม่ได้รันในเครื่องนี้

ผลตรวจสอบ v5.9.0 (2026-11-23):

- `npm run lock:check`: ผ่าน (`1,234` entries, `0 missing optionalDependencies`; ซิงค์เวอร์ชัน `5.9.0` ใน `package.json` และ `package-lock.json`)
- `npm run lint` (`eslint src`): ผ่าน ไม่มี errors หรือ warnings
- `npm test` (`vitest run`): ผ่าน **158 tests จาก 34 test files** (รวม `src/foodCalculations.test.js` 8 tests, `src/donutChart.test.js` 6 tests, `src/planner.test.js` 5 tests, `src/homeWidgetContract.test.js` 6 tests, `src/schema.test.js` 8 tests และ `src/icons.test.js` 2 tests ที่ปรับให้ตรงกับ Phosphor Regular); ข้าม **5 Firestore Rules tests** (`src/firestoreRules.test.js`) เนื่องจากไม่ได้เปิด Firestore Emulator ในสภาพแวดล้อมนี้
- `npm run build` / Applet compile: ผ่าน
- การทดสอบบนเบราว์เซอร์จริง/บัญชี Firebase Production และ Firestore Rules Emulator (`npm run test:rules`): ยังไม่ได้รันในเครื่องนี้

ผลตรวจสอบ v5.8.0 (2026-11-22):

- `npm run lock:check`: ผ่าน (`1,234` entries, `0 missing optionalDependencies`; ซิงค์เวอร์ชัน `5.8.0` ใน `package.json` และ `package-lock.json`)
- `npm run lint` (`eslint src`): ผ่าน ไม่มี errors หรือ warnings
- `npm run build` / Applet compile: ผ่าน (รายละเอียดผลการ build รอบสุดท้ายดูจากการยืนยันการ build ก่อนส่งงาน)
- `npm test` และ browser tests: **ไม่ได้รันทดสอบตามคำขอผู้ใช้**

ผลตรวจสอบ v5.6.0 (2026-11-21):

- `npm run lock:check`: ผ่าน (`1,234` entries, `0 missing optionalDependencies`; ซิงค์เวอร์ชัน `5.6.0` ใน `package.json` และ `package-lock.json`)
- `npm run lint` (`eslint src`): ผ่าน ไม่มี errors หรือ warnings
- `npm run build` / Applet compile: ผ่าน (`vite v6.4.6`, 244 modules transformed; `dist/assets/index-*.js` ขนาด `1,194.88 kB` minified / `318.89 kB` gzip, `dist/assets/index-*.css` ขนาด `138.08 kB` / `26.01 kB` gzip, `dist/assets/food-*.js` ขนาด `137.16 kB` / `36.74 kB` gzip, `dist/assets/foodsearch-*.js` ขนาด `21.92 kB` / `7.70 kB` gzip; `PWA v1.3.0` precache 52 entries, `5257.68 KiB`); Vite ยังแสดงคำเตือนขนาด chunk หลักเกิน 500 kB
- `npm test` และ browser tests: **ไม่ได้รันทดสอบตามคำขอผู้ใช้**

ผลตรวจสอบ v5.5.0 (2026-11-21):

- `npm run lock:check`: ผ่าน (`1,234` entries, `0 missing optionalDependencies`; ซิงค์เวอร์ชัน `5.5.0` ใน `package.json` และ `package-lock.json`)
- `npm run lint` (`eslint src`): ผ่าน ไม่มี errors หรือ warnings
- `npm run build` / Applet compile: ผ่าน (`vite v6.4.6`, 244 modules transformed; `dist/assets/index-*.js` ขนาด `1,194.83 kB` minified / `318.83 kB` gzip, `dist/assets/index-*.css` ขนาด `134.53 kB` / `25.36 kB` gzip, `dist/assets/planner-*.js` ขนาด `28.68 kB` / `9.18 kB` gzip; `PWA v1.3.0` precache 52 entries, `5234.03 KiB`); Vite ยังแสดงคำเตือนขนาด chunk หลักเกิน 500 kB
- `npm test` และ browser tests: **ไม่ได้รันทดสอบตามคำขอผู้ใช้** (เพิ่ม unit cases ใน `src/foodCalculations.test.js` ไว้พร้อมสำหรับรันตรวจภายหลัง)

ผลตรวจสอบ v5.4.0 (2026-11-20):

- `npm run lock:check`: ผ่าน (`1,234` entries, `0 missing optionalDependencies`; ซิงค์เวอร์ชัน `5.4.0` ใน `package.json` และ `package-lock.json`)
- `npm run lint` (`eslint src`): ผ่าน ไม่มี errors หรือ warnings
- `npm run build` / Applet compile: ผ่าน (`vite v6.4.6`, 244 modules transformed; `dist/assets/index-*.js` ขนาด `1,174.84 kB` minified / `313.89 kB` gzip, `dist/assets/index-*.css` ขนาด `169.47 kB` / `32.09 kB` gzip, `dist/assets/food-*.js` ขนาด `118.38 kB` / `32.85 kB` gzip; `PWA v1.3.0` precache 49 entries, `6562.96 KiB`); Vite ยังแสดงคำเตือนขนาด chunk หลักเกิน 500 kB
- `npm test` และ browser tests: **ไม่ได้รันทดสอบตามคำขอผู้ใช้**

ผลตรวจสอบ v5.3.0 (2026-11-20):

- `npm run lint`: ผ่าน ไม่มี errors หรือ warnings
- `npm test`: ผ่าน 142 tests จาก 31 test files (รวม `src/planner.test.js` 4 tests, `src/foodCalculations.test.js` 4 tests, `src/preview.test.js` 6 tests, `src/icons.test.js` 2 tests และ `src/homeWidgetContract.test.js` 6 tests); ข้าม Firestore Rules 5 tests (`src/firestoreRules.test.js`) เพราะเครื่องที่ตรวจไม่ได้เปิด Emulator
- `npm run lock:check`: ผ่าน (`1,234` entries, `0 missing optionalDependencies`; ซิงค์เวอร์ชัน `5.3.0` และ `@phosphor-icons/core@^2.1.1` ใน `package.json` และ `package-lock.json`)
- `npm run build`: ผ่าน (`vite v6.4.6`, `dist/assets/index-*.js` ขนาด `1,167.67 kB` minified / `312.04 kB` gzip; `PWA v1.3.0` precache 49 entries, `6530.35 KiB`); Vite ยังแสดงคำเตือนขนาด chunk หลักเกิน 500 kB
- การตรวจนี้ครอบคลุม static lint, unit tests และ production build; ไม่ได้รันทดสอบ Google Sign-in, Firestore production หรือ Emulator ในชุดคำสั่งนี้

ผลตรวจสอบ v5.2.0 (2026-11-18):

- `npm run lint`: ผ่าน ไม่มี errors หรือ warnings
- `npm test`: ผ่าน 132 tests จาก 29 test files; ข้าม Firestore Rules 5 tests (`src/firestoreRules.test.js`) เพราะเครื่องที่ตรวจไม่ได้เปิด Emulator
- `npm run lock:check`: ผ่าน (`1,235` entries, `0 missing optionalDependencies`; ซิงค์เวอร์ชัน `5.2.0` และ `lucide@^1.75.0` ใน `package-lock.json`)
- `npm run build`: ผ่าน (`vite v6.4.6`, `dist/assets/index-*.js` ขนาด `1,109.53 kB` minified / `290.77 kB` gzip; `PWA v1.3.0` precache 49 entries, `6452.29 KiB`); Vite ยังแสดงคำเตือนขนาด chunk หลักเกิน 500 kB
- การตรวจนี้ครอบคลุม static lint, unit tests และ production build; ไม่ได้รันทดสอบ Google Sign-in, Firestore production หรือ Emulator ในชุดคำสั่งนี้

ผลตรวจสอบ v5.1.0 candidate (2026-11-18):

- `npm run lint`: ผ่าน ไม่มี errors หรือ warnings
- `npm test`: ผ่าน 132 tests จาก 29 test files; ข้าม Firestore Rules 5 tests เพราะชุดนี้ไม่ได้เปิด Emulator
- `npm run lock:check`: ผ่าน (1,234 entries, ไม่มี optional dependencies ที่ขาด)
- `npm run build`: ผ่าน; Vite ยังแสดงคำเตือนขนาด JavaScript chunk หลักเกิน 500 kB (1,058.86 kB minified) ตามที่บันทึกไว้ในผล build
- Browser layout check: ตรวจที่ 595×545 (mobile), 768×900 (tablet) และ 1280×900 (desktop); ไม่พบ horizontal overflow, sidebar แสดงใน tablet/desktop, การ์ดสรุปว่างถูกซ่อนที่ desktop และ FABs ไม่ทับกัน
- การตรวจหน้าที่ล็อกอินใช้ข้อมูลตัวอย่างเฉพาะใน browser เพื่อดู layout; ไม่ได้ทดสอบการล็อกอินหรือข้อมูล Firebase จริง

ผลตรวจสอบย้อนหลังสำหรับ PR #20 (commit `b83bb97`, 2026-11-18):

- รัน `npm test` ในเครื่อง: ผ่าน 132 tests จาก 29 test files; ข้าม Firestore Rules 5 tests เนื่องจาก environment ไม่มี Java Runtime
- GitHub Actions run `44239422504` สำหรับ PR #20: `npm run test:coverage` ผ่าน 132 tests และ `npm run test:rules` ผ่านครบ 5 tests บน Java 21 + Firestore Emulator
- `npm run lock:check` และ `npm run build` ในเครื่อง: ผ่าน
- `npm run lint` ล่าสุดหลังแก้ warnings: ผ่านโดยไม่มี errors และ warnings; ก่อนแก้พบ `no-unused-vars` 6 รายการใน `src/dashboard.js` ซึ่งลบ imports/helper/ตัวแปรที่ไม่ได้ใช้ออกโดยไม่เปลี่ยน logic
- `src/firestoreRules.test.js` ครอบคลุมสิทธิ์เจ้าของข้อมูล, การปฏิเสธผู้ใช้ที่ไม่ล็อกอิน/ข้ามผู้ใช้/collection ที่ไม่รู้จัก, การตรวจ ownership/type/ขนาดเอกสาร, runtime error logs และ migration rules

ข้อจำกัดการตรวจรับ: ไม่มีบัญชีทดสอบและ credentials ที่อนุญาตให้ใช้ จึงไม่ได้ทดสอบ Google sign-in/sign-out, การอ่าน/เขียนข้อมูลจริงแยกผู้ใช้, CRUD ของ Food/Health/Care/Expenses, การตั้งค่า Home, backup/restore, CSV import/export หรือการแยกข้อมูลระหว่างบัญชี เบราว์เซอร์ตรวจได้เฉพาะหน้าล็อกอินที่ viewport 300×600 (dark mode); ไม่ได้ทดสอบ navigation หลัง authentication, network requests ของ workflow ที่ต้องล็อกอิน หรือ console ระหว่างใช้งานจริง

จากการตรวจ diff ของ PR #20 ไม่พบการเปลี่ยน `firestore.rules`, `firestore.rules.migration`, `firebase.json` หรือ `src/schema.js` ทั้งนี้การตรวจ diff ไม่ได้ทดแทนการทดสอบบนบัญชีจริง

*สถานะ release:* v5.1.0 ใน branch นี้ยังเป็น candidate; ผลตรวจข้างต้นไม่ใช่การอนุมัติ merge หรือการยืนยันว่าเว็บ production ถูก deploy แล้ว การทดสอบ Google Sign-in และ Firestore จริงต้องทำหลังตั้งค่า Firebase ที่ production และได้รับอนุญาตให้ใช้บัญชีทดสอบ

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
