# Changelog — Track Me

บันทึกการเปลี่ยนแปลงและฟีเจอร์ในแต่ละเวอร์ชันของแอป **Track Me**

---
## [v5.1.0] - 2026-11-18

### Responsive Layout, Dashboard Refinements & Sticky Navigation
- **แก้ตำแหน่ง subnav และ scroll target ตามความสูง header จริง** (`src/app.js`, `src/style.css`, `src/design-tokens.css`): วัด header และ desktop navigation ด้วย `ResizeObserver` และอัปเดต CSS variables เมื่อขนาดหน้าจอเปลี่ยน
- **ปรับ layout สำหรับ tablet/desktop** (`index.html`, `src/food.js`, `src/workout.js`, `src/body.js`): หน้า Home, อาหาร, ออกกำลังกาย และร่างกายใช้ sidebar ที่ breakpoint 768px พร้อมขยาย sidebar บน desktop
- **จัดกลุ่มปุ่มลอยบน desktop**: เว้นพื้นที่ให้ quick-add และจัดปุ่มเลื่อน/ผู้ช่วย AI เรียงแนวตั้ง โดยไม่พึ่งความสูง bottom navigation ที่ไม่มีบน desktop
- **ลดความรกของสรุป Home** (`src/summary.js`, `src/style.css`): ซ่อนการ์ดที่ยังไม่มีข้อมูลเมื่อแสดงเป็น sidebar บนหน้าจอใหญ่
- **เพิ่ม contrast ของเมนู desktop ที่เลือกอยู่** ด้วย inset border ที่มองเห็นชัดขึ้น
- **ไม่เปลี่ยน Firestore schema/Rules หรือรูปแบบไฟล์สำรอง**; ปรับเอกสารและ package version เป็น v5.1.0
- **สถานะ Release:** draft สำหรับ branch นี้; ต้อง merge และทำ release/deploy ตามขั้นตอนของ repository ก่อนถือว่าเผยแพร่แล้ว

---
## [v5.0.0]

### Major UI/UX Redesign & Integration QA
- **ปรับโฉม UI และระบบนำทาง (`src/design-tokens.css`, `src/style.css`, `src/navigation.js`, `src/navigationSettings.js`, `src/ui.js`)**:
  - เพิ่ม Design System กลางและส่วนประกอบ UI ที่นำกลับมาใช้ซ้ำ พร้อมปรับรูปแบบปุ่ม การ์ด และองค์ประกอบหน้าจอให้สอดคล้องกัน
  - ปรับการนำทางหลักและการตั้งค่าการนำทางสำหรับหน้าจอมือถือ
- **ยกระดับ Home และการปรับแต่ง Widget (`src/home.js`, `src/homeWidgetSettings.js`, `src/homeWidgetContract.test.js`)**:
  - ปรับหน้า Home และการจัดวางวิดเจ็ต พร้อมเพิ่มการตั้งค่าและปุ่มลัดที่ผู้ใช้ปรับแต่งได้
  - เพิ่ม contract tests สำหรับพฤติกรรมการตั้งค่าวิดเจ็ตหน้า Home
- **ปรับปรุงหน้าฟีเจอร์และการทำงานร่วมกันของโมดูล**:
  - ปรับหน้ารายงาน ภาพรวม อาหาร ออกกำลังกาย การเตือน สัตว์เลี้ยง การเงิน และส่วนอื่น ๆ ให้สอดคล้องกับ UI ใหม่ โดยคงโครงสร้างข้อมูลและกฎ Firestore เดิม
- **เก็บกวาดโค้ดและ Lint (`src/dashboard.js`)**:
  - ลบ imports/helper/ตัวแปรที่ไม่ได้ใช้งาน 6 จุด; `npm run lint` ผ่านโดยไม่มี warnings
  - เพิ่ม tests สำหรับ navigation และยืนยัน workflow ผ่าน CI; ไม่ได้เปลี่ยน Firestore Rules, Firebase configuration หรือ schema ใน PR นี้
- **สถานะ Release:** รายการนี้เป็น draft ตาม PR #20 และยังไม่เผยแพร่แยก; branch ปัจจุบันเตรียม v5.1.0 โดยต้อง merge และทำ release/deploy ตามขั้นตอนของ repository ก่อนถือว่าเผยแพร่แล้ว

---
## [v4.8.0] - 2026-11-17

### Lazy Loading, แคชแดชบอร์ดรายเดือน, ทำความสะอาดโค้ด & Unit Tests
- **Lazy Loading หน้าและโมดูลที่ยังไม่ได้เปิดใช้งาน (`src/app.js`, `src/home.js`, `src/care.js`, `src/inventory.js`, `src/settings.js`, `src/chatWidget.js`)**:
  - แยกโหลดแบบ dynamic import เฉพาะเมื่อผู้ใช้คลิกเปิด/สลับเข้าเมนูสำหรับ **รายจ่าย (`expense.js`)**, **แชท AI (`chatWidget.js`)**, **สัตว์เลี้ยง (`care.js`)**, **ของใช้ (`inventory.js`)**, **ผลแล็บ (`lab.js`)** และ **แพลนเนอร์ (`planner.js`)** รวมถึง `food.js`, `weekly.js`, `remindLog.js`, `settings.js` (ร่วมกับ `overview.js`, `reports.js`, `workout.js` ที่แยกอยู่แล้ว)
  - คงการอัปเดตการ์ดสรุปหน้า Home, กระดิ่งแจ้งเตือน, สรุปจำนวนผลแล็บ และ Share Target (`?shared-slip` โหลด `expense.js` เฉพาะเมื่อเปิดจาก Share Target) ให้ทำงานครบถ้วน; ลดขนาด JavaScript entry หลักเหลือ **`1,035.97 kB`** minified (**`273.19 kB`** gzip) จาก `1,326.07 kB` (`345.60 kB` gzip) ใน v4.1.0
- **แคชยอดสรุปรายเดือนหน้าแดชบอร์ดใน `localStorage` (`src/overviewLogic.js`, `src/overview.js`, `src/foodService.js`)**:
  - เพิ่มระบบแคชข้อมูลอาหารช่วงเดือนที่ย่อฟิลด์แล้วและยอดสรุปรายเดือนลง `trackme_overview_cache_v1` (TTL 24 ชม., จำกัดสูงสุด 6 รายการแบบตัดเก่าสุดอัตโนมัติ) เพื่อลดการอ่าน Firestore ซ้ำทุกครั้งที่เปิดแอป
  - แสดงเวลาที่แคชใน `#ov-cache-info`, รองรับ fallback จากแคชเดิมเมื่อออฟไลน์/ดึงไม่สำเร็จ, คงปุ่ม `🔄 รีเฟรช`, และล้างแคชของผู้ใช้ (`clearOverviewCacheForUid`) อัตโนมัติเมื่อเพิ่ม/แก้ไข/ลบรายการอาหาร
- **ทำความสะอาดโค้ด & เอกสาร (`src/food.js`, `src/foodsearch.js`, `src/period.js`, `src/profile.js`, `src/statementParser.js`, `docs/CHANGELOG.md`)**:
  - ลบตัวแปรและ import ที่ไม่ใช้งานออกทั้งหมดจน `eslint src` ผ่านด้วย 0 errors / 0 warnings, ยืนยันว่า `src/dashboard.js` ถูกลบออกตั้งแต่ v4.7.0 (แทนที่ด้วย `src/overview.js`), และแก้ไขแถวตาราง v4.5.0/v4.4.0 ที่ติดกัน (`||`) ใน `docs/CHANGELOG.md`
- **Unit Tests สำหรับ Backup, Restore, Sync & Overview Cache (`src/backup.js`, `src/sync.js`, `src/backup.test.js`, `src/sync.test.js`, `src/overviewLogic.test.js`)**:
  - Export ฟังก์ชันหลักใน `backup.js` (`collectBackupData`, `buildBackupPayload`, `buildRestorePlan`, `markExistingRestoreItems`, `filterRestoreRows`, `commitRestoreRows`) และเพิ่ม environment guards ใน `sync.js` เพื่อทดสอบแบบ deterministic โดยไม่กระทบ UI จริง
  - เพิ่ม `src/backup.test.js` (5 tests: ข้าม `settings/push`, แตก/รวม `expense_month`, Timestamp ISO, validate ไฟล์/ขนาด/ข้อมูลเสีย, filter `skip`/`overwrite`, batch 400 ops), `src/sync.test.js` (2 tests: `watch`, unsub listener เดิม, `lastSync` กับ `fromCache`/`hasPendingWrites`, `stopAll`, error report, สถานะออฟไลน์), และเทสต์แคชแดชบอร์ดใน `src/overviewLogic.test.js`

---
## [v4.7.0] - 2026-11-17

### ลดการเรียก AI & เพิ่มระบบแคชในเครื่อง (5 กลุ่ม)
- **แคชโภชนาการต่อ 100 กรัม (`src/nutrition.js`, `src/foodsearch.js`)**:
  - บันทึกผล `lookupPer100g` / `lookupPer100gWithProvider` ลง `localStorage` (`trackme_nutrition_v1`, TTL 30 วัน, สูงสุด 300 รายการแบบตัดรายการเก่าสุดอัตโนมัติ) พร้อมคืน `provider: 'cache'` และแสดงป้าย `แคช AI ในเครื่อง` เมื่อค้นหาอาหารเดิมซ้ำ
- **OCR ฉลากในเครื่องก่อน AI + Warm Worker (`src/nutrition.js`, `src/food.js`)**:
  - เพิ่ม `isLocalNutritionSufficient()` ยอมรับผล OCR จาก `tesseract.js` เมื่ออ่านค่าหลัก (`calories`, `protein`, `carbs`, `fat`) ได้อย่างน้อย 3 จาก 4 ค่าโดยไม่ต้องส่งต่อไปยัง AI และคง warm OCR worker ไว้ 60 วินาทีเพื่อลดเวลาโหลดซ้ำ
- **จับคู่ชื่ออาหารแบบ Fuzzy กับคลังในเครื่อง (`src/services/aiAssistant.js`, `src/services/localAssistant.js`)**:
  - เพิ่ม `normalizeFoodName()` ตัดหน่วยน้ำหนัก/ปริมาตรท้ายชื่อ (`150g`, `120 กรัม`, `250 มล.`, `100 ก.`) ก่อนจับคู่กับคลังอาหารของฉันทั้งในโหมดแพตเทิร์น 0 โทเค็น และ `addFoodLog`
- **แคชรูปท่าออกกำลังกาย & ผลค้นหาอาหาร (`src/exerciseMedia.js`, `src/foodsearch.js`)**:
  - แคชผลจับคู่รูปท่าออกกำลังกายใน `trackme_eximg_v1` (สูงสุด 300 รายการ) และแคชผลค้นหา `searchUsda`, `searchOff`, `barcodeOff` ใน `trackme_foodsearch_v1` (TTL 7 วัน, สูงสุด 60 รายการ โดย `searchUsda` ใช้คีย์ภาษาอังกฤษที่แปลแล้วผ่าน `usdaCacheKey`)
- **กู้คืนแดชบอร์ดภาพรวมรายเดือน (`src/overview.js`, `src/overviewLogic.js`, `src/categories.js`, `src/app.js`, `index.html`)**:
  - เพิ่มแท็บ **📈 แดชบอร์ด (`overview`)** กลับมาเป็นแท็บแรกของกลุ่ม **สุขภาพ** แสดง KPI และกราฟเปรียบเทียบ **น้ำหนักเฉลี่ย, แคลอรี่เฉลี่ย/วันที่บันทึก, การออกกำลังกาย และค่าใช้จ่ายรายเดือน** ย้อนหลัง **3 / 6 / 12 เดือน** พร้อมตารางสรุปและปุ่มรีเฟรช
- **ความเรียบร้อยของโค้ด, เอกสาร & Tests**:
  - เก็บกวาดปุ่ม/โค้ดสแกนภาพ Zepp ที่ตัดออกแล้วใน `src/body.js`, อัปเดต `package-lock.json` และเอกสาร (`README.md`, `CHANGELOG.md`, `docs/*`) ให้ตรงกับเวอร์ชันปัจจุบัน พร้อมเพิ่ม Unit Tests (`src/nutrition.test.js`, `src/foodsearch.test.js`, `src/exerciseMedia.test.js`, `src/overviewLogic.test.js`, `src/services/localAssistant.test.js`)

---
## [v4.6.0] - 2026-11-16

### ลดการใช้โทเค็น AI (0-Token Patterns, Templates & Zepp CSV 3 รูปแบบ)
- **ผู้ช่วยแพตเทิร์น 0 โทเค็น & ลด Context (`src/services/localAssistant.js`, `src/services/chatRoles.js`, `src/services/aiAssistant.js`, `src/chatWidget.js`)**:
  - เพิ่มโหมด **⚡ แพตเทิร์น (0 โทเค็น)** และตัวเลือกใช้แพตเทิร์นในเครื่องก่อนเรียก AI สำหรับจดรายรับ-รายจ่าย ปรับสต๊อก บันทึกอาหารจากคลัง ตั้งเตือน จดโน้ต ส่ง Feedback และเช็กสรุปข้อมูลโดยไม่เรียก AI
  - ปรับ `HISTORY_LIMIT = 12`, ทำ prompt ให้กระชับ, และเพิ่ม `shouldAttachToolsForTurn()` เพื่อแนบ Tool declarations เฉพาะบทบาทโค้ช/วางแผน หรือข้อความที่เกี่ยวกับข้อมูล Track Me เท่านั้น
- **นำเข้า Zepp CSV 3 รูปแบบไม่ใช้ AI (`src/zeppParser.js`, `src/body.js`, `src/zeppParser.test.js`)**:
  - รองรับไฟล์ Sleep Stage รายนาที (`date,time,stage,hr,respiratory_rate`), สรุปการนอนรายวัน (`date,deepSleepTime,...`), และกิจกรรม/ก้าวเดิน (`date,steps,distance,runDistance,calories`) พร้อมรวมข้อมูลวันเดียวกันในเบราว์เซอร์ และตัดปุ่มสแกนภาพหน้าจอ Zepp ด้วย AI ออก (คงป้ายแสดงผลข้อมูลเดิม `zepp_ai`)
- **เทมเพลต 0 โทเค็นในฟีเจอร์หลัก (`src/workoutPresets.js`, `src/labTemplates.js`, `src/reminders.js`, `src/food.js`)**:
  - เพิ่มเทมเพลตออกกำลังกายสำเร็จรูป 5 ชุด (`workoutPresets.js`), ชุดเทมเพลตผลตรวจสุขภาพ & วางหลายบรรทัด (`labTemplates.js`), การตั้งเตือนแบบพิมพ์เองด้วยแพตเทิร์น 0 โทเค็น (`reminders.js`), และให้ปุ่มสแกนอาหารลองอ่านบาร์โค้ด/OCR ฉลากในเครื่องก่อนเรียก AI

---
## [v4.5.0] - 2026-11-16

### แดชบอร์ดภาพรวมรายเดือน (Dashboard Overview)
- **หน้าแดชบอร์ดใหม่ (`src/dashboard.js`, `src/categories.js`, `src/app.js`, `index.html`)**:
  - เพิ่มแท็บ **📈 แดชบอร์ด** เป็นเมนูแรกของกลุ่มสุขภาพ แสดงเปรียบเทียบ 4 มิติพร้อมกันในหน้าเดียว: **น้ำหนัก**, **แคลอรี่เฉลี่ย/วัน**, **จำนวนครั้งออกกำลังกาย**, และ **ค่าใช้จ่ายรายเดือน**
  - การ์ดสรุปด้านบน 4 ใบ: น้ำหนักล่าสุด (พร้อมเปลี่ยนแปลงจากเดือนแรก), แคลอรี่เฉลี่ย/วัน, จำนวนครั้งออกกำลังกายรวม, และค่าใช้จ่ายสุทธิ (รายรับลบรายจ่าย)
  - 4 กราฟ SVG (2 เส้น + 2 แท่ง) ในตาราง 2×2 พร้อมตารางเปรียบเทียบตัวเลขรายเดือน
  - ปุ่มเลือกช่วงเวลา 3/6/12 เดือน และปุ่มรีเฟรชข้อมูล
  - โมดูลโหลดแบบ lazy-load เมื่อกดเข้าแท็บเท่านั้น (chunk แยก ~11 KB)
  - ดึงข้อมูลจาก Firestore (อาหาร/ออกกำลังกาย) และหน่วยความจำ (น้ำหนัก/ค่าใช้จ่าย) ที่มีอยู่แล้ว ไม่ต้องเปลี่ยน Firestore Rules

---
## [v4.4.0] - 2026-11-16

### ความน่าเชื่อถือของข้อมูล & วันที่ตามเวลาท้องถิ่น (Reliability & Timezone Fixes)
- **ยืนยันผลการเขียน Firestore ของ AI Assistant (`src/services/aiAssistant.js`, `src/chatWidget.js`)**:
  - ปรับ `executeConfirmedAction()` และ `undoAssistantAction()` ให้ `await` คำสั่งเขียน/ลบ Firestore โดยรองรับการรอซิงค์เมื่อออฟไลน์ (`navigator.onLine === false`) และ rollback state ในหน่วยความจำ/แจ้งเตือน error ชัดเจนหากบันทึกไม่สำเร็จ
- **คำนวณวันที่ตามปฏิทินท้องถิ่นแทน UTC (`src/util.js`, `src/summary.js`, `src/weekly.js`, `src/reminders.js`, `src/inventory.js`, `src/care.js`, `src/schema.js`, `src/planner.js`, `src/workout.js`, `src/reminderParser.js`)**:
  - เพิ่ม `localDateStr`, `localMonthStr`, `addDays` ใน `src/util.js` พร้อม unit tests (`src/util.test.js`) และเปลี่ยนจุดที่ใช้ `.toISOString().slice(0, 10)` / `.slice(0, 7)` ให้ใช้วันที่ท้องถิ่นทั้งหมด เพื่อป้องกันปัญหาวันที่คลาดเคลื่อนข้ามวันในช่วง 00:00–06:59 น. (UTC+7)
- **รวม `expense_records` ใน `COLLECTIONS` (`src/firebase.js`)**:
  - เพิ่ม `'expense_records'` ในรายชื่อ collection มาตรฐานของ `src/firebase.js`

### ระบบ AI Service, Cooldown & ความเสถียร
- **แยก Cooldown รายโมเดล (`src/services/aiService.js`, `src/nutrition.js`, `src/services/aiAssistant.js`)**:
  - เปลี่ยนจากการล็อกทั้ง Provider เมื่อโมเดลเดียวติดโควตา HTTP 429 เป็นการบันทึก cooldown แยกตามโมเดล (`getModelCooldownMs`, `rememberModelCooldown`, `clearModelCooldown`) เพื่อให้ระบบยังคงลองโมเดลสำรองอื่นใน Gemini / Groq / OpenRouter ที่ยังใช้งานได้ ก่อนข้ามไปยัง Provider ถัดไป (และคงสถานะ cooldown ของโมเดลที่เต็มไว้แม้โมเดลสำรองใน Provider เดียวกันจะตอบสำเร็จ)
  - ขยาย `GROQ_VISION_MODEL_RE` / `GROQ_NON_TEXT_MODEL_RE` ให้รองรับโมเดลภาพ Groq ตระกูล `llama-4-scout` และ `llama-4-maverick` รวมถึงปรับปุ่มทดสอบการเชื่อมต่อใน `src/nutrition.js`
- **ตรวจความครบถ้วนของ Lockfile (`scripts/check-lockfile.mjs`, `package.json`)**:
  - เพิ่มสคริปต์ `npm run lock:check` (`validateLockfile`) ตรวจสอบว่า `package-lock.json` ตรงกับ `package.json` และไม่ขาด optional platform packages (`@tailwindcss/oxide-*`, `@esbuild/*`, `lightningcss-*`, `@rollup/rollup-*`) จากการรัน `npm install` บน Linux container
- **ปรับชื่อ Workflow, UI และเอกสาร Daily Push ให้ตรงกับเวลา `12:15 น.` (`.github/workflows/daily-push.yml`, `src/settings.js`, `src/home.js`, `src/reminders.js`, `src/onboarding.js`, `src/push.js`, `README.md`, `docs/SETUP.md`, `docs/DEPLOYMENT.md`)**:
  - คง cron schedule เดิม (`15 5 * * *` = 12:15 น. เวลาประเทศไทย UTC+7) และปรับชื่อ workflow เป็น `Daily Push Notifications (12:15 ICT)` พร้อมปรับข้อความแจ้งเวลาในหน้าตั้งค่า, หน้า Home, หน้าแจ้งเตือน, Onboarding, ข้อความทดสอบ Push และคู่มือให้ตรงกันทั้งหมด

### สัตว์เลี้ยง, กิจวัตร, โน้ต/Feedback & การนอน/ก้าวเดิน (Zepp)
- **บันทึกอาการน้องหมา (`src/care.js`, `src/schema.js`, `src/remindLog.js`, `src/reminders.js`)**:
  - เพิ่มการ์ด **🐶 บันทึกอาการน้องหมา** สำหรับจดอาการรายวัน (`pet_care_records` แบบ `recordKind: 'symptom'`) ครอบคลุมระดับ 0–3 ของ `appetite`, `energy`, `stool`, `vomit`, `skin`, `cough`, อุณหภูมิ °C (`value`) และหมายเหตุ พร้อมแก้ไข ลบ และล้างฟอร์มอัตโนมัติ โดยไม่ปะปนกับระบบแจ้งเตือน
- **AI Assistant จดโน้ต & เก็บ Feedback (`src/services/aiAssistant.js`, `src/chatWidget.js`, `src/settings.js`, `src/state.js`, `src/app.js`, `src/schema.js`)**:
  - เพิ่ม Read Tool `getNotes` และ Write Tools `saveNote`, `submitFeedback` เชื่อมกับ Firestore ภายใต้ `settings/note_*` (`kind: 'assistant_note'`) และ `settings/feedback_*` (`kind: 'user_feedback'`) รวมถึง `getBodyAndWellness` ที่สรุปข้อมูลการนอน/ก้าวเดินและอาการสัตว์เลี้ยงเพิ่มให้ผู้ช่วยวิเคราะห์
  - เพิ่มปุ่ม `📝` บนหัวหน้าต่างแชทและในหน้าตั้งค่าเพื่อเปิดหน้าต่างดู เพิ่ม แก้ไข ลบโน้ต และส่ง/ดูประวัติ Feedback ของผู้ใช้โดยตรง
- **กิจวัตรประจำวันแบบไม่ทำซ้ำ (`src/planner.js`, `src/schema.js`)**:
  - เพิ่มกิจวัตรแบบวันเดียวไม่ทำซ้ำ (`weekPattern: 'once'`, `date: 'YYYY-MM-DD'`) พร้อมปุ่ม **+ กิจวัตรวันเดียว (ไม่ซ้ำ)** ใน Planner
- **ติดตามการนอนหลับ & ก้าวเดิน รองรับแอป Zepp (`src/zeppParser.js`, `src/body.js`, `src/nutrition.js`, `src/categories.js`, `src/summary.js`, `src/weekly.js`, `src/schema.js`)**:
  - เพิ่มการจัดเก็บข้อมูลการนอนและก้าวเดินลง `body_records` (`zepp_YYYY-MM-DD`) รองรับ 3 ช่องทาง: กรอกเอง, นำเข้าไฟล์ Zepp CSV Export หลายไฟล์พร้อมกัน (`ACTIVITY` + `SLEEP` รวมตามวันที่ผ่าน `parseZeppCsv`/`mergeZeppDayRecords` + หน้าต่างยืนยัน), และสแกนภาพหน้าจอแอป Zepp ด้วย AI Vision (`readZeppScreenshot` + หน้าต่างยืนยัน)
  - เพิ่มกราฟแนวโน้มการนอนและก้าวเดิน (7 วัน / 30 วัน) ในหน้า `ร่างกาย` (`น้ำหนัก · นอน/ก้าว`) และแสดงสรุปใน Home Summary, สรุปรายสัปดาห์/รายเดือน และ `aiAssistant`

---
## [v4.3.0] - 2026-11-15

### การเงิน, Statement & การวิเคราะห์รายจ่ายประจำ
- **จัดลำดับเมนูแท็บดูแล (`src/categories.js`)**:
  - ย้าย **รายรับ-รายจ่าย (`expense`)** เป็นเมนูแรกของกลุ่มแท็บ **ดูแล (`GROUPS.care`)**
- **อัปเกรดกล่องรอตรวจ Statement & ระบบเรียนรู้หมวดอัตโนมัติ (`src/expense.js`, `src/expenseLogic.js`)**:
  - เพิ่มปุ่ม **ล้างกล่องรอตรวจ (`#ex-pending-clear`)** และปุ่มลบรายรายการ (`[data-pending-remove]`) เพื่อเคลียร์รายการที่ซ้ำหรือไม่ต้องการนำเข้าได้ทันที
  - ทำให้ช่อง **ผู้รับเงิน / ร้านค้า / ที่มา** และ **หมายเหตุ** ในกล่องรอตรวจ Statement แก้ไขได้โดยตรงเพื่อให้อ่านย้อนหลังได้เข้าใจง่ายขึ้น
  - นำ checkbox `จำกฎนี้สำหรับครั้งถัดไป` ออก และปรับให้ระบบเรียนรู้กฎหมวดหมู่จากรายการรายจ่ายที่บันทึก (Manual / สแกนสลิป / นำเข้า Statement) รวมถึงวิเคราะห์หมวดจากประวัติย้อนหลัง (`suggestExpenseCategory`) ให้อัตโนมัติ
- **วิเคราะห์รายจ่ายประจำอัตโนมัติทุกเดือน (`src/expenseLogic.js`, `src/expense.js`)**:
  - เพิ่ม `detectRecurringExpenses` และ `estimateMonthlyRecurringTotal` เพื่อวิเคราะห์รายการรายจ่ายที่มีชื่อร้าน/ผู้รับเงินซ้ำข้ามเดือนตั้งแต่ 2 เดือนขึ้นไป (แยกจากรายการที่ซื้อถี่แปรผัน) แสดงยอดเฉลี่ยต่อเดือน ช่วงวันที่พบ รอบถัดไป ประมาณการค่าใช้จ่ายประจำต่อเดือนรวม และปุ่ม **+ ตั้งเป็นประจำ** ใน 1 คลิก

### ประมวลผลรูปภาพแบบครบชุดทุกเมนู (`i/N`, `%` และ Popup ตรวจยืนยัน)
- **ตัวช่วยประมวลผลหลายภาพ (`src/nutrition.js`, `src/slipOcr.js`)**:
  - เพิ่ม `runImageBatch` และ `formatImageProgress` แสดงจำนวนรูปที่อัปโหลด ลำดับที่กำลังทำ (`i/N`) และเปอร์เซ็นต์ (`0–100%`) รวมถึงอัปเดตข้อความคืบหน้าในการสแกนสลิปให้แสดงจำนวนรูปและเปอร์เซ็นต์แบบเดียวกัน
- **อัปเกรดทุกฟีเจอร์สแกนรูปภาพ (`src/food.js`, `src/inventory.js`, `src/lab.js`, `src/care.js`)**:
  - เปิดรองรับการเลือก **หลายรูปพร้อมกัน (`multiple`)** ครบทุกเมนู: อาหาร/ฉลาก/บาร์โค้ด (`#f-scan`), ของใช้ & สต๊อก (`#inv-photo`), ใบผลตรวจ/ผลเลือด (`#lb-photo`), และซองอาหารสัตว์เลี้ยง (`#pet-food-scan`)
  - หลังประมวลผลเสร็จ (ทั้ง 1 รูปและหลายรูป) ระบบจะเปิด **Popup ตรวจสอบ แก้ไข และยืนยันผลก่อนบันทึก** ทุกเมนู

### ปรับปรุง UX/UI และความต่อเนื่องในการใช้งาน
- **ทุกหน้าจอรีเซ็ตเป็นวันปัจจุบันอัตโนมัติเมื่อเข้าเมนู (`src/app.js`, `src/food.js`, `src/workout.js`, `src/weekly.js`, `src/body.js`, `src/symptoms.js`, `src/period.js`, `src/lab.js`, `src/care.js`, `src/expense.js`, `src/reports.js`, `src/planner.js`)**:
  - เมื่อสลับเข้าแท็บต่าง ๆ ระบบจะตั้งวันที่/สัปดาห์/เดือนกลับเป็นวันปัจจุบันให้อัตโนมัติ (ยกเว้นการกดเลือกวันที่จากปฏิทินหน้าประจำเดือนเพื่อดู/กรอกอาการวันนั้น จะยังคงวันที่ที่เลือกไว้ให้)
- **ล้างฟอร์มและสถานะอัตโนมัติหลังทำงานเสร็จ (`src/food.js`, `src/workout.js`, `src/body.js`, `src/period.js`, `src/lab.js`, `src/care.js`, `src/inventory.js`, `src/expense.js`)**:
  - เคลียร์ช่องกรอกฟอร์ม บันทึกหมายเหตุ ตัวอย่างนำเข้า (Preview) และข้อความสถานะการสแกน/OCR อัตโนมัติทันทีหลังบันทึกหรืออัปเดตสำเร็จ พร้อมแจ้งเตือนยืนยันผล
- **กิจวัตรประจำวัน: แสดง 10 รายการล่าสุดไม่ซ้ำ + อิโมจิอัตโนมัติ (`src/planner.js`, `src/schema.js`)**:
  - เพิ่ม `inferRoutineEmoji` จับคู่อิโมจิให้สอดคล้องกับชื่อกิจวัตรทั้งภาษาไทย/อังกฤษ และแสดงผลแบบเรียลไทม์ในหน้าต่างจัดการกิจวัตร
  - แสดงการ์ด **กิจวัตรที่ทำล่าสุด (สูงสุด 10 รายการ ไม่ซ้ำชื่อ)** พร้อมบันทึกประวัติ `recentDone` ใน `settings/planner` และปุ่มลัดแตะเพื่อเติมชื่อซ้ำได้เร็วขึ้น

### ออกกำลังกาย (Inline Template Editor & Post-Workout RPE/RIR)
- **แก้ไขแผนผ่านหน้า Preview ทันที & UX/UI ใหม่ (`src/workout.js`)**:
  - เปลี่ยนกล่อง Preview ของ **แปลงเป็น Template** ให้แก้ไขชื่อแผน กล้ามเนื้อ ระยะเวลา ประเภท วันที่ สถานะ ชื่อท่า น้ำหนัก/เซต/ครั้ง คำอธิบาย และลิงก์ภาพ/อ้างอิงได้โดยตรงในหน้า Preview พร้อมปุ่ม **▶ เริ่มตามแผนทันที**, **💾 บันทึกเป็นเทมเพลต**, **📅 บันทึกแผน/ผล** และปรับการจัดวางการ์ดท่าให้อ่านง่ายบนมือถือ
- **ประเมินความรู้สึกหลังออกกำลังกาย & RPE/RIR รายท่า (`src/workoutActive.js`, `src/workout.js`, `src/schema.js`, `src/style.css`)**:
  - เพิ่ม Step 2 หลังจบ Active Workout ให้บันทึก **ความรู้สึกหลังออก** (`feeling`), **ความหนักโดยรวม** (`sessionRpe` 1–10), **ความเหนื่อยรายท่า (`RPE 5–10`)**, และ **จำนวนครั้งที่คาดว่าทำได้อีก (`RIR 0–4+`)** พร้อมคำนวณคำแนะนำสำหรับครั้งถัดไป (`suggestNextProgression`: เพิ่มน้ำหนัก/คงเดิม/พักฟื้น) และแสดงผลในประวัติและคำแนะนำก่อนเริ่มรอบใหม่

### ผู้ช่วยแชท AI (Concise Responses & Progression Awareness)
- **ตอบกระชับ เข้าใจง่าย & วิเคราะห์ความก้าวหน้าการออกกำลังกาย (`src/services/chatRoles.js`, `src/services/aiAssistant.js`)**:
  - ปรับคำสั่งระบบและบทบาททั้ง 5 ให้สรุปคำตอบหลักสั้นกระชับ (1–2 ประโยค + ข้อย่อยสั้น ๆ) หลีกเลี่ยงคำเกริ่นยาว
  - เพิ่มข้อมูล `feeling`, `sessionRpe` และ `exerciseFeedback` (`rpe`, `rir`, `nextAction`) ใน tool `getWorkouts` เพื่อให้โหมดโค้ชช่วยแนะนำการปรับโหลดรอบถัดไปได้ตรงจุด

---
## [v4.2.0] - 2026-11-15

### ผู้ช่วยแชท AI (AI Chat Assistant Expansion)
- **เปิดกว้างคุยได้ทุกหัวข้อ & 5 บทบาทเฉพาะทาง (`src/services/chatRoles.js`, `src/services/aiAssistant.js`, `src/services/aiService.js`)**:
  - ปรับ `buildSystemPrompt` ให้สนทนาเรื่องทั่วไปได้อิสระ (ความรู้ทั่วไป ร่างข้อความ แปลภาษา ระดมสมอง) ควบคู่กับการเรียกเครื่องมือของ Track Me เฉพาะเมื่อจำเป็น พร้อมขยายหน้าต่างสนทนาต่อเนื่องเป็น **20 ข้อความ** (`HISTORY_LIMIT = 20`)
  - เพิ่มแถบสลับ **5 บทบาท** และจับคู่โมเดลอัตโนมัติ: `คุยทั่วไป` (`gemini-4-hydrogen`), `โค้ชสุขภาพ` / `วางแผน & เงิน` (`gemini-4-argon`), `วิเคราะห์ลึก` (`gemini-4-carbon`) และ `ตอบไว` (`gemini-3.1-flash-lite`) พร้อม fallback ไปยัง `gemini-4-hydrogen` / `Groq` / `OpenRouter` เมื่อคีย์ไม่มีสิทธิ์หรือเกิดข้อจำกัด และงดส่งพารามิเตอร์ที่ตระกูล `gemini-4-*` ไม่รองรับ (`temperature`, `thinkingBudget`)
  - เพิ่ม Read Tools ใหม่ 2 ตัว: `getWorkouts` (ประวัติออกกำลังกายและเทมเพลต) และ `getBodyAndWellness` (น้ำหนัก/สัดส่วน รอบเดือน อาการ และผลตรวจสุขภาพ) พร้อมกรอบ `wrapUntrustedToolData` และ `sanitizeDataText`
- **Chat UI/UX & Markdown (`src/chatWidget.js`, `src/style.css`)**:
  - รองรับแสดงผล Markdown (หัวข้อ ตัวหนา/เอียง รายการข้อย่อย โค้ดบล็อก) แบบ Escape HTML ก่อนจัดรูปแบบเพื่อความปลอดภัย (XSS-safe)
  - เปลี่ยนเป็นช่องพิมพ์หลายบรรทัดขยายความสูงอัตโนมัติ, เพิ่มปุ่ม **หยุดการตอบ (`#ai-chat-stop`)**, ช่องตั้งคำสั่งบุคลิก/หัวข้อเพิ่มเติม, Quick Prompts ตามบทบาท และบันทึกประวัติแชท/บทบาทใน `localStorage` ข้ามการรีเฟรช รองรับครบ 3 ธีม (`Cozy`, `Pastel`, `Dark`)
  - เพิ่ม Unit Tests ใน `src/services/aiService.test.js` และ `src/services/aiAssistant.test.js`

### ออกกำลังกาย (Workout Hub & Active Workout)
- **อัปเกรดตัวแปลงแผนออกกำลังกายและกรอบภาพ (`src/workoutParser.js`, `src/workout.js`, `src/workoutActive.js`, `src/nutrition.js`, `src/schema.js`)**:
  - รองรับทั้งข้อความดิบ (มี/ไม่มีเลขลำดับ), Markdown/TSV table และปุ่มจัดโครงสร้างด้วย AI (`formatWorkoutPlanWithAi`) ให้เป็นรูปแบบมาตรฐาน 3 ส่วน (`1. Warm-up`, `2. Main Workout`, `3. Cool-down`) พร้อมค่าเริ่มต้นแบบ Beginner-Friendly และปุ่มเปิดโหมดเริ่มตามแผนทันที
  - แยก `imageUrl` กับ `refUrl` พร้อมตรวจจับลิงก์ภาพที่ไม่สมบูรณ์ (`imageHint`), แสดงภาพประกอบในกรอบ `object-contain` พร้อม `referrerpolicy="no-referrer"` และการแตะเพื่อขยายดู, เพิ่มตัวจับเวลาพัก `30 / 60 / 90` วินาทีในโหมด Active Workout และรองรับ `durationMin` ใน `workout_templates`

## [v4.1.0] - 2026-11-15

### การเงินและความน่าเชื่อถือ
- เพิ่มการเรียนรู้หมวดรายจ่ายจากรายการ manual ที่มีร้านค้า และใช้กฎร่วมกับ Statement import โดยไม่เรียนรู้จากรายรับหรือการโอน
- เพิ่มงบรายเดือนแยกตามหมวด พร้อม progress และสถานะเตือนเมื่อใช้ถึง 80% หรือเกินงบ
- เพิ่มรายการรายจ่ายประจำแบบรายเดือน/รายปี; เมื่อถึงกำหนดผู้ใช้ยืนยันก่อนสร้างรายการ และระบบไม่สร้างหลายรอบย้อนหลังอัตโนมัติ
- เพิ่มการคำนวณงบ/รอบถัดไปที่ทดสอบได้ และ backup/restore sanitizers สำหรับกฎ งบ และรายการประจำ
- ตรวจยืนยันว่า `aiService.test.js` ไม่มี skipped tests; 5 skips ในชุดทดสอบปกติเป็น Firestore Rules tests ที่ต้องใช้ Emulator
- อัปเดตเอกสารและ metadata เป็น v4.1.0; ไม่รวมการแยก Firebase listeners หรือการปรับขนาด bundle ในรุ่นนี้

## [v4.0.0] - 2026-11-15

### อัปเดตใหญ่
- ลด JavaScript entry หลักด้วย lazy loading สำหรับ OCR, AI Assistant, รายงานสุขภาพ และโหมดออกกำลังกายจริง; ดูตัวเลขก่อน/หลังใน `docs/PERFORMANCE.md`
- เพิ่มการกู้คืนเมื่อ dynamic chunk เก่าหายหลัง deploy โดยรีเฟรชอัตโนมัติแบบจำกัดจำนวนครั้ง และคง precache ของทุก chunk สำหรับ offline
- แยกความรับผิดชอบอาหารเป็น catalog, calculations, validation, Firestore service, parser และ UI โมดูลย่อย พร้อม tests และ `docs/FOOD_MODULES.md`
- เพิ่ม Firestore ownership/type validation และ write-only runtime error rules พร้อม Emulator tests; Rules ต้องเผยแพร่แยกจากเว็บ
- เพิ่ม Vitest tests สำหรับ parsers, schema sanitizers, TDEE, cycle stats, AI, onboarding และ runtime error monitoring; เพิ่ม ESLint, coverage floors และ GitHub Actions checks ก่อน deploy Pages
- เพิ่ม runtime error reports แบบ minimal metadata, client-side deduplication/rate limit/batching; ไม่ส่งข้อความ/stack หรือข้อมูลสุขภาพ/การเงิน
- เพิ่ม onboarding 5 ขั้นสำหรับบัญชีใหม่ พร้อม progress ที่กลับมาทำต่อได้บนอุปกรณ์เดิม; ผู้ใช้เดิมไม่ถูกบังคับ, โปรไฟล์/AI/แจ้งเตือนเลือกข้ามได้ และขอสิทธิ์แจ้งเตือนหลังผู้ใช้กดเท่านั้น
- เพิ่มเอกสารสถาปัตยกรรม, โครงสร้างโปรเจกต์ และขั้นตอน deployment; อัปเดต schema, testing, setup และ AI service docs

## [v3.2.0] - 2026-11-15

### AI Service Centralization
- รวม API transport, model discovery/selection, error normalization, timeout, bounded retry, request deduplication, cooldown และ provider fallback ไว้ใน `src/services/aiService.js`
- ย้าย Nutrition และ AI Assistant ให้ใช้ service กลาง โดยคง prompts, schemas และรูปแบบผลลัพธ์ของแต่ละฟีเจอร์
- หยุดลองโมเดลซ้ำภายใน provider เมื่อโควตาเต็ม แล้วข้ามไป provider ถัดไปตามลำดับ Gemini → Groq → OpenRouter
- เพิ่ม Vitest tests สำหรับ quota/cooldown, fallback, model selection, retry delay, cancellation, deduplication และ invalid credentials
- เพิ่มคู่มือ `docs/AI_SERVICE.md`; คีย์ยังใช้ client-side storage ตามเดิม ไม่มีการย้าย backend หรือ production configuration

## [v3.1.0] - 2026-11-15

### ไฟล์	การเปลี่ยนแปลง
- src/expense.js	เพิ่มช่องวาง Statement และกล่องรอตรวจ
- src/statementParser.js	สร้าง Parser สำหรับ Statement ธนาคารไทย
- src/schema.js	รองรับประเภทรายการโอนระหว่างบัญชี
- src/expense.js	เพิ่มระบบตรวจรายการซ้ำและจำกฎหมวดหมู่

### ฟีเจอร์ที่เพิ่ม
- อ่าน Statement หลายบรรทัดในเบราว์เซอร์
- ตัดยอดคงเหลือและเลขบัญชีออกจากข้อมูลที่นำไปใช้ พร้อมล้างข้อความต้นฉบับหลังประมวลผล
- ตรวจรายการซ้ำด้วยยอดเงินและเวลาคลาดเคลื่อนไม่เกิน 15 นาที
- แนะนำหมวดหมู่ DLT และ AIS
- แก้หมวดหมู่และเลือกรายการก่อนนำเข้า
- บันทึกกฎหมวดหมู่สำหรับครั้งต่อไป
- รายการรอตรวจยังไม่รวมในสรุปและกราฟรายจ่าย

## [v3.0.0] - 2026-11-14

### ความน่าเชื่อถือของข้อมูล & ความปลอดภัย (Reliability & Security Hardening)
- **ย้ายระบบรายรับ-รายจ่ายสู่ `expense_records` (1 รายการ = 1 เอกสาร) (`firestore.rules`, `src/schema.js`, `src/expense.js`, `src/app.js`, `src/services/aiAssistant.js`)**:
  - เปลี่ยนจากเอกสารเดี่ยวต่อเดือน `settings/exp_YYYY-MM` เป็น collection `expense_records` เพื่อป้องกันข้อมูลทับกันเมื่อบันทึกพร้อมกันหลายอุปกรณ์หรือซิงค์หลังออฟไลน์ และปลดล็อกเพดานขนาดเอกสาร 1 MB
  - เพิ่ม **ระบบย้ายข้อมูลอัตโนมัติแบบ Idempotent** เมื่อเปิดแอปและออนไลน์ (ใช้รหัสเอกสารเดิมของแต่ละรายการ ป้องกันรายการซ้ำ และไม่ลบเอกสารเดิมจนกว่าจะเขียนชุดใหม่สำเร็จ) รวมถึงแตกข้อมูลจากไฟล์สำรอง JSON เวอร์ชันเก่าให้อัตโนมัติระหว่างกู้คืน
  - เพิ่มปุ่ม **ส่งออก CSV** ประจำเดือนในหน้ารายรับ-รายจ่าย (รองรับตัวกรองค้นหาและหมวดหมู่)
- **ป้องกัน Prompt Injection และระบบยืนยันก่อนเขียนของ AI Assistant (`src/services/aiAssistant.js`, `src/chatWidget.js`, `src/style.css`)**:
  - ล้างอักขระควบคุมและใส่กรอบ `untrustedDataNotice` รอบข้อมูลจาก Read Tool ทุกตัว พร้อมคำสั่งระบบให้โมเดลปฏิบัติต่อชื่อสินค้า ร้านค้า หมายเหตุ และข้อความ OCR เป็นข้อมูลดิบเท่านั้น
  - จำกัดขอบเขตค่าตัวเลขทุก Write Tool (`addExpense <= 500,000 บาท`, `addFoodLog <= 10,000 kcal`, `|updateInventory| <= 500 หน่วย`)
  - เพิ่ม **การ์ดรอยืนยันก่อนบันทึก (`✅ ยืนยันบันทึก` / `❌ ยกเลิก` และปุ่มยืนยันทั้งหมด)** เมื่อแก้ไขข้อมูลหลายรายการพร้อมกัน หรือเป็นรายการยอดสูง (`รายจ่าย >= 1,000 บาท`, `ปรับสต๊อก >= 20 หน่วย`, `อาหาร >= 2,000 kcal`)
- **ความเป็นส่วนตัว Push Notification & Backup (`src/push.js`, `src/settings.js`, `scripts/daily-push.mjs`, `public/push-sw.js`, `src/backup.js`, `docs/SETUP.md`)**:
  - เพิ่มตัวเลือก **🔒 ซ่อนรายละเอียดส่วนตัวบนหน้าจอล็อก (ค่าเริ่มต้นเปิด)** ในหน้าตั้งค่า เพื่อแสดงเฉพาะจำนวนรายการรวมบนแจ้งเตือน (ไม่โชว์คำเรื่องรอบเดือน สุขภาพ หรือนัดหมายบนหน้าจอล็อก)
  - ตัด `settings/push` (Push endpoint & keys) ออกจากการส่งออกและกู้คืนในไฟล์ Backup JSON ทั้งหมด
  - เพิ่มคู่มือกำหนดสิทธิ์ **Custom IAM Role ขั้นต่ำ (Least-Privilege)** สำหรับ `FIREBASE_SERVICE_ACCOUNT` ใน `docs/SETUP.md`

---

## [v2.10.0] - 2026-11-14

### เพิ่มฟีเจอร์ (Added)
- **AI Chat Assistant & Client-Side Function Calling (`src/services/aiAssistant.js`, `src/chatWidget.js`)**:
  - เพิ่ม **Floating AI Chat Widget** มุมขวาล่าง (จัดตำแหน่งเหนือปุ่มเลื่อนบน/ล่าง ไม่ทับซ้อนกัน) รองรับการใช้งานบนมือถือแบบเต็มจอ/ครึ่งจอ พร้อม **Quick Prompts** แตะใช้งานทันที และรองรับทั้ง 3 ธีม (**Cozy / Pastel / Dark**)
  - ทำงานแบบ **Client-Side Function Calling 100%** ด้วย API Key จาก `localStorage` ที่มีอยู่แล้วในหน้าตั้งค่า (รองรับทั้ง **Gemini `functionDeclarations`** และ **Groq OpenAI-compatible `tools`** พร้อมสลับสำรองอัตโนมัติ)
  - **Read Tools (ค้นหาข้อมูล)**: `getExpenses` (สรุปรายรับ-รายจ่ายแยกหมวดตามช่วงวัน), `getInventory` (รายการสต๊อกและของใกล้หมด), `getNutritionSummary` (สรุปแคลอรี่และ P/C/F เทียบเป้าหมาย), `getRemindersAndPlanner` (ตาราง Weekly Planner รวมสลับสัปดาห์ A/B และนัดเตือน)
  - **Write Tools (จดบันทึกและอัปเดต)**: `addExpense` (รองรับวันที่ภาษาธรรมชาติ เช่น วันนี้/เมื่อวาน), `addFoodLog` (ดึงจากคลังในเครื่องหรือประมาณโภชนาการให้อัตโนมัติ), `updateInventory` (เพิ่ม/ตัดสต๊อกตามชื่อสินค้า), `addReminder` (สร้างนัดเตือนพร้อมเวลาและเตือนล่วงหน้า)
  - **Safety, Undo & Privacy**: แสดงการ์ดยืนยันพร้อมปุ่ม **ยกเลิก/ลบรายการนี้** ในแชททุกครั้งที่มีการเขียน/แก้ไขข้อมูลใน Firestore และจำกัดข้อมูลที่ส่งให้ AI เฉพาะผลลัพธ์จาก Tool ที่ถูกเรียกใช้ (ไม่มีการส่งข้อมูลที่ไม่เกี่ยวข้องหรือเก็บรูปภาพลงฐานข้อมูล)

---

## [v2.9.0] - 2026-11-14

### เพิ่มฟีเจอร์ & ปรับปรุง UX บนมือถือ (Added & Mobile-First UX)
- **ของใช้และสต๊อก (`src/inventory.js`, `src/nutrition.js`)**:
  - เพิ่มปุ่มบวก/ลบขนาดใหญ่ **44×44 px (`−` / `+`)** กดด้วยนิ้วโป้งสะดวกบนมือถือ พร้อมอัปเดตจำนวนสต๊อกทันที
  - รองรับการเลือกรูปภาพ **หลายรูปพร้อมกัน (`multiple`)** เพื่อสแกนวันหมดอายุและสภาพของใช้หลายรายการรวดเดียวในหน้าต่างตรวจสอบก่อนบันทึก
  - ปรับขนาดภาพอัตโนมัติให้กระชับ (`maxDim=1024`) เพื่อประมวลผลเร็วขึ้น และแสดงข้อความสถานะเป็น **สีเขียวชัดเจน** เมื่อประมวลผลเสร็จสมบูรณ์
- **รายรับ-รายจ่าย & สแกนสลิปหลายใบ (`src/expense.js`, `src/slipOcr.js`)**:
  - รองรับการอัปโหลดและสแกนสลิป **หลายใบพร้อมกัน** โดยใช้ Worker `tesseract.js` (`tha+eng`) ร่วมกันและยังคงกฎล้างรูป/Canvas ออกจากหน่วยความจำทันที (ไม่อัปโหลดรูปลงฐานข้อมูล)
  - เพิ่มหน้าต่างตรวจสอบและแก้ไขรายการสลิปเป็นชุดก่อนบันทึกทั้งหมด และแสดงสถานะ **สีเขียว** เมื่ออ่านสลิปครบทุกใบ
- **ระบบแจ้งเตือนภาษาธรรมชาติอัจฉริยะ (`src/reminderParser.js`, `src/remindLog.js`, `src/reminders.js`, `scripts/daily-push.mjs`)**:
  - ช่องพิมพ์คำสั่งเตือนภาษาไทยช่องเดียวพร้อม **Live Parsed Preview** และปุ่มปรับแก้/ให้ AI ช่วยแยกข้อความเพิ่มเติม (ไม่บังคับ)
  - รองรับเงื่อนไขซับซ้อน เช่น *วันเสาร์ที่สามของเดือน + ล่วงหน้า*, *ปีหน้า + ล่วงหน้าหลายสัปดาห์*, **เชื่อมวันเดียวกับรายการอื่น (`same_as`)** (เช่น วันเดียวกับอาบน้ำน้องหมา), และ **รายสัปดาห์ยกเว้นวันที่มีนัดเชื่อมโยง (`weekly_except_linked`)** (เช่น ทุกวันเสาร์ที่ไม่ได้พาน้องหมาไปอาบน้ำ) โดยระบบ Daily Push 08:00 น. คำนวณกฎเหล่านี้อัตโนมัติด้วย
- **คลังอาหาร & การบันทึกอาหาร (`src/food.js`, `src/foodsearch.js`, `src/nutrition.js`)**:
  - **สแกนอาหารปุ่มเดียวครบวงจร (`📷 สแกนอาหาร / ฉลาก / บาร์โค้ด`)**: ตรวจจับบาร์โค้ด (`BarcodeDetector` → Open Food Facts) ก่อน และส่งวิเคราะห์ภาพจานอาหาร/ฉลากในคำขอเดียว พร้อมแถบสถานะ **สีเขียว** เมื่อเสร็จ
  - **ค้นหาโภชนาการอัตโนมัติล้วน**: นำตัวเลือกแหล่งค้นหา ลิงก์ภายนอก และปุ่มแยกออก ให้ระบบไล่ค้นหา **คลังในเครื่อง → USDA → Open Food Facts → AI (Groq → Gemini)** อัตโนมัติทันทีที่กดค้นหา พร้อมแถบสถานะสีเขียวเมื่อพบผลลัพธ์
  - **คลังอาหารของฉัน**: นำปุ่มคืนเมนูเริ่มต้นที่ซ่อนไว้และปุ่มเพิ่มหลายเมนูในหน้าต่างคลังออก (ยังคงปุ่ม **⚡ เพิ่มหลายเมนูพร้อมกัน** หลักไว้ครบ) พร้อมเพิ่มช่องติ๊กเลือกหลายเมนูเพื่อ **เพิ่มลงมื้ออาหารที่เลือกในคลิกเดียว**
  - **ตารางรายการอาหารประจำวัน**: จัดความกว้างคอลัมน์ให้ชื่อเมนูยาวแสดง `...` (ellipsis) ไม่ล้นจอแนวนอนบนมือถือ พร้อมช่องติ๊กเลือกหลายรายการเพื่อ **ย้ายมื้อพร้อมกัน (`writeBatch`)**
- **หน้าสรุปภาพรวม & รายงานสัปดาห์/เดือน (`index.html`, `src/summary.js`, `src/weekly.js`)**:
  - รวมข้อมูลสำคัญครบทุกมิติไว้ในการ์ด **📊 สรุปภาพรวมทั้งหมด** บนหน้า Home (รอบเดือน, สัดส่วนร่างกายล่าสุด, โภชนาการวันนี้, การเงินเดือนนี้, ออกกำลังกายสัปดาห์นี้, สต๊อกของใช้ทั้งหมด/ใกล้หมด/ใกล้หมดอายุ, และรายการแจ้งเตือนเลยกำหนด/กำลังติดตาม) พร้อมแคชออฟไลน์และปุ่มคัดลอกสรุป
  - เพิ่มการ์ด **การเงิน** และ **ของใช้ & แจ้งเตือน** ลงในมุมมอง **สรุปรายสัปดาห์** และ **สรุปรายเดือน**
- **Weekly Planner กิจวัตรสลับสัปดาห์ A / B (`src/planner.js`, `src/schema.js`, `scripts/daily-push.mjs`)**:
  - รองรับกิจวัตรแบบ **สัปดาห์เว้นสัปดาห์อัตโนมัติ (Week A / Week B)** พร้อมป้ายแสดงรอบสัปดาห์ปัจจุบัน ปุ่มสลับ `A ↔ B`, ปุ่มเลื่อนดูสัปดาห์ก่อนหน้า/ถัดไป, และปุ่ม **🔄 สร้างคู่สลับ A ↔ B** ในคลิกเดียว (สร้าง Week A ในวันที่เลือกและ Week B ในวันสลับที่เหลือให้อัตโนมัติ) โดยสคริปต์ Daily Push 08:00 น. จะส่งแจ้งเตือนตรงตามรอบสัปดาห์ A/B
- **ปุ่มลอยเลื่อนขึ้น-ลงบนทุกหน้า (`index.html`, `src/style.css`, `src/app.js`)**:
  - เพิ่มปุ่มลอย `↑` (บนสุด) และ `↓` (ล่างสุด) เหนือแถบเมนูด้านล่างสำหรับเลื่อนหน้าจอมือถืออย่างรวดเร็ว รองรับทั้ง 3 ธีม และซ่อนอัตโนมัติเมื่อพิมพ์เอกสาร

---

## [v2.8.0] - 2026-11-14

### เพิ่มฟีเจอร์ (Added)
- **เพิ่มอาหารหลายเมนูพร้อมกัน (Bulk / Quick Add Food) พร้อม Live Preview (`src/foodParser.js`, `src/food.js`)**:
  - เพิ่มปุ่ม **⚡ เพิ่มหลายเมนูพร้อมกัน** ในหน้าบันทึกมื้ออาหาร สำหรับวางข้อความหลายบรรทัดเพื่อบันทึกลงมื้ออาหารที่เลือกได้ทันทีโดยไม่เรียก AI (พร้อมตัวเลือกบันทึกลงคลังอาหารของฉันด้วย) และอัปเกรดหน้า **เพิ่มหลายเมนูเข้าคลัง** ให้ใช้ตัวแปลงเดียวกัน
  - รองรับรูปแบบสรุปบรรทัดเดียว `[ชื่อเมนูและปริมาณ] [ตัวเลข] kcal / P[โปรตีน] / C[คาร์บ] / F[ไขมัน]` (เช่น `ยำวุ้นเส้นหมูสับ 1 จาน 280 kcal / P17 / C32 / F10`), รูปแบบคัดลอกจากตาราง Excel / Google Sheets / Markdown 2–6 คอลัมน์ (เช่น `ไก่ป๊อปสไปซี่ 1 ที่ ⇥ 380 ⇥ 20 g ⇥ 35 g ⇥ 18 g`) ควบคู่กับรูปแบบ 7 คอลัมน์ Tab / `|` เดิม
  - รองรับเลขทศนิยม (`0.5 จาน`, `1.5 ทัพพี`, `200 กรัม`), เมนูที่ไม่มีหน่วย (`อเมริกาโน่เย็น 15 kcal / P0 / C3 / F0`), `kcal` หรือ `แคล`, รูปแบบ `P17g C32g F10g` / `p17/c32/f10` (ไม่สนตัวพิมพ์เล็ก-ใหญ่), และกำหนดค่ามาโครที่ไม่ได้ระบุเป็น `0` อัตโนมัติ
  - แสดงตาราง **Live Preview** แบบเรียลไทม์ (ชื่อเมนู, ปริมาณ, kcal, P, C, F และยอดรวม) พร้อมแจ้งเตือนบรรทัดที่รูปแบบไม่ถูกต้องก่อนบันทึก

### ปรับปรุง & แก้ไข (Improved / Fixed)
- **ระบบ AI Service Multi-model Fallback & Groq JSON Mode (`src/nutrition.js`, `src/settings.js`)**:
  - **Gemini Model Fallback Loop**: อัปเดตลำดับโมเดลเป็น `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite` พร้อม Timeout 35 วินาทีต่อโมเดล และปรับให้วนสลับไปโมเดลถัดไปอัตโนมัติทั้งกรณี Timeout และ HTTP 429 (Quota/Rate Limit)
  - **Groq JSON Mode**: ปรับปรุง `llama-3.3-70b-versatile` / `llama-3.1-8b-instant` ให้ส่งข้อความกำกับ JSON Mode อย่างถูกต้อง รองรับการกู้คืนผลลัพธ์จาก `failed_generation` และสลับสำรองเมื่อเกิด Error เพื่อลดปัญหา JSON validation failed
- **ลำดับการค้นหาโภชนาการอัตโนมัติ (`src/foodsearch.js`)**:
  - ปรับการค้นหาโหมดอัตโนมัติให้ไล่ตามลำดับ: **คลังอาหารในเครื่อง (Local DB) → USDA → Open Food Facts → AI (`Groq` → `Gemini` Fallback Loop)** เป็นลำดับสุดท้าย (รองรับทั้งเมนูที่มีหน่วยเป็นกรัมและเมนูต่อหน่วยบริโภค พร้อมปุ่มค้นหาต่อในแหล่งถัดไป)

---

## [v2.7.1] - 2026-11-14

### แก้ไขปัญหา AI ค้นหาโภชนาการและวิเคราะห์ภาพ (`src/nutrition.js`, `src/settings.js`)
- **อัปเดตโมเดล Gemini (`gemini-2.5-flash` / `gemini-2.5-flash-lite`)**:
  - เปลี่ยนมาใช้ `gemini-2.5-flash` และ `gemini-2.5-flash-lite` เพื่อความเสถียรและตอบสนองรวดเร็วขึ้น
  - เพิ่ม `thinkingConfig: { thinkingBudget: 0 }` ใน `generationConfig` สำหรับโมเดลตระกูล Gemini 2.5 เพื่อให้ตอบกลับทันทีโดยไม่เสียเวลาคิดนาน
  - ขยาย Timeout จาก `20000` ms (20 วินาที) เป็น `35000` ms (35 วินาที) เพื่อลดโอกาสหมดเวลาเมื่อเซิร์ฟเวอร์ตอบสนองช้า
- **อัปเดตโมเดล Groq (แก้ Error โมเดล `llama-4-scout` ถูกถอดออก)**:
  - งานค้นหาข้อความ / JSON: เปลี่ยนมาใช้ `llama-3.3-70b-versatile` และ fallback ไป `llama-3.1-8b-instant`
  - งานวิเคราะห์รูปภาพ (Vision): เปลี่ยนมาใช้ `llama-3.2-11b-vision-preview` และ `llama-3.2-90b-vision-preview` พร้อมค้นหาโมเดล Vision ที่เปิดใช้งานในบัญชีโดยอัตโนมัติ และขยาย Timeout เป็น 35 วินาที
- **ปุ่ม "ทดสอบการเชื่อมต่อ" ในหน้าตั้งค่า**: อัปเดตการยิงทดสอบของทั้ง Gemini (`gemini-2.5-flash` / `2.5-flash-lite`) และ Groq (`llama-3.3-70b-versatile` พร้อมรายงานสถานะโมเดลข้อความและโมเดลภาพ) ให้ตรงกับโมเดลล่าสุด

---

## [v2.7.0] - 2026-11-14

### เพิ่มฟีเจอร์ (Added)
- **นำเข้าตารางออกกำลังกายจากข้อความ (Smart Paste / Quick Import)** ในเมนู **ออกกำลังกาย (Workout)**:
  - เพิ่มปุ่ม **📋 วางข้อความเพื่อนำเข้า (Quick Import)** ด้านบนฟอร์มกรอกท่า พร้อมปุ่มใส่ตัวอย่าง และหน้าแสดงตัวอย่าง (Preview) ก่อนนำเข้าลงฟอร์ม (เลือกแทนที่หรือเพิ่มต่อท้ายรายการเดิมได้)
  - เพิ่มตัวแปลงข้อความในเครื่อง 100% รองรับทั้ง Plain Text และ Markdown Links (`[ชื่อบทความ](URL)`):
    - แยก **ส่วนหัวโปรแกรม**: ชื่อโปรแกรม, กลุ่มกล้ามเนื้อ, ระยะเวลารวม (เช่น `ประมาณ 20–30 นาที`), และแนะนำประเภทการฝึกอัตโนมัติ
    - แยก **หมวดหมู่**: `1. Warm-up`, `2. Main Workout`, `3. Cool-down` (รวมข้อความต่อท้ายหมวด เช่น `— ยืนทั้งหมด`)
    - แยก **รายละเอียดแต่ละท่า**: ลิงก์/ชื่อบทความอ้างอิงที่อยู่เหนือเลขลำดับท่า, ชื่อท่า, น้ำหนัก/เซต/ครั้ง/เวลา (`60 วินาที`, `45–60 วินาที`, `2 kg`, `2 × 10 ครั้ง`, `ไม่ถือดัมเบล`), และคำอธิบายท่าทางภาษาไทย
  - เพิ่มช่องกรอก **ชื่อโปรแกรม** และ **กลุ่มกล้ามเนื้อ** ในฟอร์มบันทึกและเทมเพลต
  - แสดง **ลิงก์อ้างอิง (Reference Link)** ในการ์ดท่าออกกำลังกายทั้งในฟอร์มแก้ไข, ประวัติ & แผนที่บันทึก, และโหมดเริ่มฝึกตามแผน (Active Workout) — หากมี URL คลิกเปิดแท็บใหม่ได้ทันที หากมีเฉพาะชื่อบทความจะมีป้ายอ้างอิงพร้อมปุ่ม **🔍 ค้นหา** และ **✏️ เพิ่ม URL**
  - อัปเดต `src/schema.js` ให้รองรับฟิลด์ `title`, `muscleGroup`, `refTitle`, `refUrl` และเพิ่มความยาวคำอธิบายท่าในการซิงค์และสำรองข้อมูล

### แก้ไข & ปรับปรุง (Fixed / CI-CD)
- **GitHub Pages & Build CI (`.github/workflows/pages.yml`, `.github/workflows/build.yml`)**:
  - สร้าง `package-lock.json` ให้ตรงกับ `package.json` (รวม `tesseract.js`) เพื่อแก้ปัญหา `npm ci` ล้มเหลว
  - เปลี่ยน `concurrency.cancel-in-progress: false` ใน `pages.yml` เพื่อไม่ให้ 2 commit ที่ push ไล่เลี่ยกันชนและยกเลิกการ deploy
  - เพิ่มคำสั่งสำรอง `npm ci --no-audit --no-fund || npm install --no-audit --no-fund` และปรับ Node.js เป็นเวอร์ชัน `22`
- **Daily Web Push (`scripts/daily-push.mjs`, `.github/workflows/daily-push.yml`)**:
  - เปลี่ยนจากการคิวรี `collectionGroup('settings')` เป็นการอ่านผ่าน `users` → `settings/push` เพื่อไม่ให้ติดเงื่อนไขต้องสร้าง Collection Group Index ด้วยมือใน Firestore
  - เติม `mailto:` ให้อัตโนมัติหาก Secret `VAPID_SUBJECT` เป็นอีเมลเปล่า และรองรับ `\n` ใน `FIREBASE_SERVICE_ACCOUNT`

---

## [v2.6.0] - 2026-11-14

### เพิ่มฟีเจอร์ (Added)
- **Weekly Planner & กิจวัตร (หน้า Home)**: สลับดูสัปดาห์นี้ / สัปดาห์ถัดไป, โหมดรายวัน / ดูทั้ง 7 วัน, เช็กติ๊กตารางออกกำลังกาย + กิจวัตรประจำสัปดาห์ (Recurring Tasks) และแสดงแถบเตือนนัดหมายของวันนั้นด้านบนโดยไม่ปะปนกับงานประจำ
- **รายรับ-รายจ่าย & สแกนสลิปอัตโนมัติในเครื่อง (`src/expense.js`, `src/slipOcr.js`)**:
  - อ่านภาพสลิปด้วย `tesseract.js` (`tha+eng`) ในเบราว์เซอร์เท่านั้น แล้วล้างรูปออกจากหน่วยความจำทันที (ไม่อัปโหลดหรือเก็บรูปลง Firebase)
  - รองรับ **PWA Web Share Target** ใน `vite.config.js` และ `public/push-sw.js` สำหรับแชร์รูปสลิปจากแกลเลอรีมือถือเข้าแอปโดยตรง
  - หน้าต่างตรวจสอบยอด/วันที่/เวลา/ร้านค้า/หมวดหมู่ก่อนบันทึก พร้อมสรุปรายรับ-รายจ่ายและสัดส่วนรายเดือน
- **กราฟสัดส่วนร่างกายหลายมิติ**: สลับดูแนวโน้มได้ทั้ง น้ำหนัก, รอบเอว, สะโพก, รอบแขน, รอบขา, รอบอก
- **ระบบค้นหา & ตัวกรองทุกหน้าประวัติ**: ค้นหาตามชื่ออาหาร, ชื่อท่าออกกำลังกาย, รายการเตือน และกรองดูเฉพาะ **ค่าเลือดผิดปกติ (Abnormal)** ในผลตรวจสัตว์เลี้ยง
- **แจ้งเตือนอัตโนมัติ 08:00 น. แม้ปิดแอป**: ใช้ Web Push (VAPID) ร่วมกับ GitHub Actions ส่งสรุป Planner และนัดหมายพร้อมเวลาจริงฟรี

---

## [v2.5.0]

- นำ OpenRouter ออก และเพิ่มปุ่ม **ทดสอบการเชื่อมต่อคีย์** ครบทั้ง Gemini, Groq, USDA
- เพิ่มปุ่มบันทึกลงคลังอาหารจากผลถ่ายรูปจานอาหารและหน้าค้นหาโภชนาการ
- รวม **บันทึกแจ้งเตือน** (สัตว์เลี้ยง / เปลี่ยนของ / พ.ร.บ. / ภาษี / ประกัน) พร้อมตั้งเตือนล่วงหน้า 1 วัน–2 เดือนทั้งแบบรายตัวและหลายรายการพร้อมกัน
- แก้บัคตัวเลขกระดิ่งแจ้งเตือนค้าง และบัคเมนูของใช้/สต๊อกกลับไปสัตว์เลี้ยง
- ย้ายผลตรวจเข้าในแท็บสัตว์เลี้ยง พร้อม AI สแกนใบผลเลือดหลายรายการและซองอาหารสัตว์เลี้ยง
- Workout เพิ่มวางแผนรายสัปดาห์ จ–อา, แก้ไขบันทึกเดิม และแก้ไขเทมเพลต
- ปรับ UI อาการ & ผิว, เพิ่มรอบแขน/รอบขา, ตั้งเตือนรอบเดือนในหน้าแจ้งเตือน, และธีม **Cozy / Pastel / Dark mode**

---

## [v2.0.0 – v2.4.0]

- **v2.4.0**: ปรับปรุงการกำหนดค่าและความน่าเชื่อถือของโมเดล AI (Gemini `gemini-4-hydrogen` / `gemini-3.1-flash-lite`)
- **v2.3.0**: แยกโหมดจัดแผนกับโหมดออกกำลังกายจริง, จับคู่ภาพตัวอย่างท่า, และแยกคู่มือ Bookmark Hiwpinto
- **v2.2.0**: Sync Helper นำเข้าเมนู Hiwpinto, ค้นหาอาหารแบบไล่ลำดับ (คลังในเครื่อง → USDA → Open Food Facts), OCR ฉลากในเครื่อง, และโหมด Active Workout พร้อมตัวจับเวลาพัก
- **v2.0.0 – v2.1.0**: Redesign UX/UI ใหม่แบบ Cozy & Minimal Pastel, ฟอร์มบันทึกมื้ออาหาร และกราฟสรุปรายเดือน

---

## [v1.0.0 – v1.6.0]

- **v1.5.0 – v1.6.0**: กรอกอาหารเป็นกรัม, สรุปรายสัปดาห์/รายเดือน, เป้าโปรตีน/ไขมันขั้นต่ำ, ผลตรวจสัตว์เลี้ยง (`lab_records`), และคำนวณพลังงานออกกำลังกาย
- **v1.3.0 – v1.4.0**: ออกกำลังกายและเทมเพลต, เป้าหมาย BMI/BMR/TDEE, สัตว์เลี้ยง/สกินแคร์/สต๊อก, ค้นหาหลายแหล่งพร้อมกัน
- **v1.0.0 – v1.2.0**: เริ่มต้นบันทึกอาหาร/แคลอรี่, ประจำเดือน, น้ำหนักและสัดส่วน, Google Sign-in + Firestore Rules, PWA ออฟไลน์, สำรอง/กู้คืน JSON และย้ายข้อมูลจาก Room Code เดิม
