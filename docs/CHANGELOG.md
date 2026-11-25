# Changelog — Track Me

บันทึกการเปลี่ยนแปลงและฟีเจอร์ในแต่ละเวอร์ชันของแอป **Track Me**

---
## [v6.0.0] - 2026-11-24

### Workout UX Upgrade, Active Mode Enhancements, Session Evaluation, Next-Day Recovery & Complete Reporting
- **ประเมินรายท่าเฉพาะท่าหลัก (`src/workoutActive.js`, `src/workoutConstants.js`, `src/workoutActive.test.js`)**:
  - เพิ่ม `getMainExerciseIndices()` และใช้ `isMainWorkoutSection()` ใน `buildExerciseFeedbackSummary()` เพื่อประเมิน RPE / RIR เฉพาะรายการที่อยู่ในช่วง **ท่าหลัก (`section === 'main'`)** เท่านั้น ไม่นำท่า `warmup` และ `cooldown` มาสร้างการ์ดประเมินหรือบันทึกลง `exerciseFeedback` พร้อมคงข้อความแนะนำเมื่อรอบนั้นไม่มีท่าหลัก
- **ล้างช่องกรอกใน "วางแผน & บันทึก" ทุกครั้งที่เข้าหรือกลับมา & ปรับปรุงหน้าออกกำลังกาย (`src/workout.js`, `src/exerciseMedia.js`, `src/ui.js`)**:
  - ปรับ `mountWorkout()`, `setWorkoutTab('plan')` และ `resetToToday()` ให้เรียก `clearForm()` ทุกครั้งเมื่อเข้าแท็บออกกำลังกายหรือสลับกลับมายังแท็บ **วางแผน & บันทึก** และปรับปุ่ม **`เริ่ม`** / **`เริ่มตามแผน`** ให้เรียก `launchActiveWorkoutSession()` โดยตรงไม่เขียนทับช่องกรอกในฟอร์ม
  - **เติมลิงก์รูป/GIF อัตโนมัติ**: เพิ่ม `findExistingExerciseImage()` และ `getCachedExerciseImage()` (`src/exerciseMedia.js`) เพื่อดึง `imageUrl` จากประวัติที่บันทึก เทมเพลต หรือแคช `trackme_eximg_v1` มาเติมให้ทันทีเมื่อกรอกชื่อท่าที่ตรงกัน (ทั้งในฟอร์มวางแผนและรายการนำเข้า) โดยไม่ทับค่าเมื่อผู้ใช้แก้หรือเคลียร์ช่องลิงก์เอง (`WeakSet`)
  - **หุบ-กางกลุ่มท่า / ปุ่มยกเลิก / ช่อง URL / ปุ่มวันนี้**: เพิ่มปุ่มหุบและกาง (`collapsedSections`) ในกลุ่ม **วอร์มอัพ**, **ท่าหลัก** และ **คูลดาวน์**, ย้ายปุ่ม **`ยกเลิก`** (`#w-edit-cancel`, `#w-tpl-edit-cancel`) ไปด้านซ้ายมือด้วยโทนสี Rose (`bg-rose-50 text-rose-700 border-rose-300`), คงเฉพาะช่อง **`รูป/GIF ประกอบท่า`** (ถอดช่อง `refTitle`/`refUrl` ออกจากฟอร์มและพรีวิวนำเข้าโดยยังคงอ่าน/แสดง badge เดิมได้) และปรับปุ่ม **`วันนี้`** บนหน้าออกกำลังกายให้ไม่มีลูกศรเลื่อนสัปดาห์ (`showArrows: false` ใน `weekNavBarHtml()`)
- **โหมด "เริ่มตามแผน" (`src/workoutActive.js`, `src/style.css`, `src/util.js`)**:
  - **นับเวลาพักครบ 0**: เปลี่ยนข้อความ `"พักครบแล้ว ✓"` เป็นสีแดงและกะพริบ (`.wa-rest-time.is-expired`, รองรับ `prefers-reduced-motion`) และคืนสถานะปกติเมื่อเริ่มนับใหม่หรือหยุด
  - **ขยายหน้าต่างบนคอมพิวเตอร์ & ย้ายคำอธิบายท่า**: เพิ่ม `.wa-modal-box` (`boxClass`) และขนาดตัวอักษร/รูป/ปุ่มบนหน้าจอ `>= 1024px` (คงเลย์เอาต์ 2 คอลัมน์ `lg:grid-cols-2`), และย้ายคำอธิบายท่า (`r.note`) ไปต่อท้ายบรรทัดน้ำหนัก/เซต-ครั้งเพื่อให้ห่อบรรทัดกระชับขึ้น
  - **ซ่อนท่าที่เช็กครบแล้ว**: เมื่อเช็กเซตครบทุกเซตในท่าหนึ่ง การ์ดท่านั้นจะถูกซ่อนทันทีโดยยังเก็บ checkbox ที่ติ๊กไว้ใน DOM สำหรับคำนวณผลหลังฝึก และมีปุ่ม **`แสดงท่าที่เสร็จแล้ว (X)`** (`#wa-toggle-done-cards`) ให้กดดูย้อนหลังได้
- **หัวข้อประเมินหลังออกกำลังกาย & การฟื้นตัวในวันถัดไป (`src/workoutActive.js`, `src/workout.js`, `src/workoutConstants.js`, `src/schema.js`)**:
  - เปลี่ยนหัวข้อประเมินเซสชันเป็น **สถานะการฝึก** (`completionStatus`: `ทำครบ` / `ทำบางส่วน`), **ความเหนื่อย** (`effortLevel`: `4-5 ค่อนข้างสบาย` ถึง `8-10 หนักมาก/ใกล้หมดแรง` พร้อม map เป็น `sessionRpe`), และ **อาการระหว่างหรือหลังฝึก** (`postSymptom`: `ปกติ`, `คอหรือบ่าตึง`, `แขนหรือขาล้ามาก`, `ปวดหรือมีอาการผิดปกติ`) โดยยังคงรองรับข้อมูล `feeling`/`sessionRpe` เดิม
  - เพิ่มหัวข้อ **การฟื้นตัวในวันถัดไป** (`nextDayRecovery`: `ฟื้นตัวดี`, `ยังล้าเล็กน้อย`, `ล้าหรือปวดหลายวัน`) ใต้การ์ดประจำวันเมื่อวันที่เลือกเป็นวันถัดจากวันที่มีบันทึกออกกำลังกายสำเร็จ (`getNextDayRecoveryTargets()`) รวมถึงแก้ไขย้อนหลังได้ในการ์ด **ประวัติ & แผน** โดยบันทึก `nextDayRecovery` และ `nextDayRecoveryDate` ลงเอกสาร `workout_records` ของวันออกกำลังกายนั้นโดยตรง
- **แท็บ `"ประวัติ & แผน"`, นับเซตท่าหลัก, `"x นาที รวม"` และรายงานทุกหน้า (`src/reports.js`, `src/weekly.js`, `src/dashboard.js`, `src/overviewLogic.js`, `src/summary.js`, `src/planner.js`, `src/services/aiAssistant.js`, `src/services/localAssistant.js`, `src/preview.js`, `src/demo.js`)**:
  - เปลี่ยนชื่อแท็บเป็น **`"ประวัติ & แผน"`**, นับ **"ทำจริง x เซต"** จากเฉพาะท่าหลัก (`countMainCompletedSets()`), แสดง **`"x นาที รวม"`** (`computeWorkoutTotalMinutes()`), ขยาย `summarizeWorkoutCollection()` (`byCompletion`, `byEffort`, `bySymptom`, `byRecovery`), เพิ่มคอลัมน์ CSV ที่ 22–26 ใน `buildWorkoutCsvRows()` (`27` คอลัมน์ทั้งหมดโดยคงคอลัมน์เดิม `0..21`), และส่งต่อฟิลด์ประเมินใหม่กับการฟื้นตัวในวันถัดไปไปยังรายงาน HTML/PDF (`reports.js`), สรุปรายสัปดาห์/เดือน (`weekly.js`), Weekly Planner (`planner.js`), AI Assistant `getWorkouts` / Offline Assistant และ `preview.js`

---
## [v5.10.0] - 2026-11-24

### Top-Level "ประวัติ & รายงาน", Full-Width Desktop Layout, `statementParser` Tests, AI `[DATA_START]`/`[DATA_END]` Guard, Instant Planner Feedback & Bundle Splitting
- **เมนูหลัก & รวมมุมมอง `"ประวัติ & รายงาน"` (`src/categories.js`, `src/navigationSettings.js`, `src/app.js`, `src/dashboard.js`, `src/weekly.js`, `src/reports.js`, `index.html`, `src/navigation.test.js`)**:
  - เปลี่ยนชื่อ `"แดชบอร์ด"` เป็น **`"ประวัติ & รายงาน"`** และย้ายออกจากกลุ่มเมนูย่อย `สุขภาพ` ขึ้นมาเป็นเมนูระดับหลักต่อจาก **`หน้าหลัก`** เพื่อให้เข้าถึงข้อมูลรวมหลายหมวด (สุขภาพ อาหาร ออกกำลังกาย น้ำหนัก และการเงิน) ได้ตรงโดยไม่ปะปนกับเครื่องมือบันทึกรายวันในหมวดสุขภาพ
  - รวมหน้า **ภาพรวม** (`src/dashboard.js`) และ **สรุป** (`src/weekly.js`) เข้าไว้ในแท็บ **`ประวัติ & รายงาน`** ภายใต้แถบสลับมุมมอง **`ภาพรวม & สรุป`** / **`รายงาน (PDF / CSV)`** โดยคงกราฟรายเดือนและปฏิทินสรุปรายสัปดาห์/เดือนพร้อมตัดการ์ด KPI ที่ซ้ำกันออก
- **ปลดล็อกเลย์เอาต์เต็มหน้าจอบน Desktop / Tablet (`src/style.css`, `src/body.js`, `src/symptoms.js`, `src/expense.js`)**:
  - ถอดข้อจำกัด `max-width` ของ `.db-page`, `#reminder-banner` และ `.preview-banner-inner` พร้อมเพิ่ม `.db-charts-grid` (2 คอลัมน์ตั้งแต่ `>= 768px`), ขยายสัดส่วน 2 คอลัมน์ใน `src/body.js` (`lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,1fr)]`) และ `src/symptoms.js` (`lg:col-span-3`), และถอด `max-w-2xl` ในฟอร์มบันทึกของ `src/expense.js`
- **เทสต์ถาวร `src/statementParser.test.js` (`9 tests`)**:
  - ทดสอบฟังก์ชัน `parseStatementLine` และ `parseStatementText` ครอบคลุมการแปลงปี พ.ศ. 2 หลัก (`67`→`2024`, `69`→`2026`), ปฏิทินที่ไม่มีจริง (`31/02/69`, `29/02/68`, `31/04/69`), ขีดจำกัดวันที่อนาคต >7 วัน, การแยกประเภทรายการเติมเงิน `TrueWallet` / `TrueMoney Wallet` / `Rabbit LinePay` เป็น `income` (ไม่นับเป็น `expense`), โอนบัญชีตัวเองเป็น `transfer` และการลบเลขบัญชี/ยอดคงเหลือ
- **ชั้นป้องกัน `[DATA_START]` / `[DATA_END]` ใน `src/services/aiAssistant.js` & `src/services/aiAssistant.test.js`**:
  - คง `sanitizeDataText()` ทุกจุดเดิมพร้อมตัด tag ปลอม `[DATA_START]` / `[DATA_END]` / `[/DATA_*]`, เพิ่ม `wrapDataBoundary()` และ `formatToolOutcomeForModel()` ครอบข้อมูลจาก Firestore ที่ส่งเข้า Gemini, Groq และ OpenRouter ด้วย `[DATA_START]` ... `[DATA_END]` และอัปเดต `buildSystemPrompt()` โดยคง flow การกดปุ่ม **`ยืนยันบันทึก`** ใน `src/chatWidget.js` ไว้ครบถ้วน
- **Toast / Visual Feedback ทันที & Double-Tap Lock ใน Weekly Planner (`src/planner.js`, `src/planner.test.js`, `src/style.css`)**:
  - เพิ่ม Pure helpers `formatPlannerToast()` และ `validateRoutineDraft()` (ทดสอบใน `src/planner.test.js`), เพิ่มสถานะ `#pl-feedback-slot` (`.pl-feedback-pill`), แอนิเมชัน `.pl-feedback-flash` และ `withBusyLock()` (`.pl-task-busy` / `disabled`) เมื่อกดเลือกวัน เลื่อนสัปดาห์ กด `"วันนี้"` เช็กสถานะงาน (ทั้งออกกำลังกายและกิจวัตร) ย้ายวัน ลบ หรือบันทึก รวมถึงตรวจผล `savePlanner()` ใน `#rt-save` เพื่อไม่แสดงสำเร็จเมื่อเกิด rollback
- **ลดขนาด Initial Entry Bundle (`vite.config.js`, `src/app.js`, `src/periodStats.js`, `src/bodyStats.js`, `src/period.js`, `src/body.js`, `src/push.js`, `src/inventory.js`, `src/remindLog.js`, `src/reminders.js`, `src/expense.js`, `src/summary.js`, `src/profile.js`, `src/workout.js`, `src/reports.js`)**:
  - แยก Pure stats (`periodStats.js`, `bodyStats.js`), เปลี่ยน `period.js`, `symptoms.js`, `body.js`, `reminders.js`, `onboarding.js` และ `slipOcr.js` เป็น dynamic `import()`, และแยก `vendor-firebase` ผ่าน Rollup `manualChunks` ทำให้ `index-*.js` ลดจาก `1,208.83 kB` (`323.26 kB` gzip) เหลือ `241.02 kB` (`74.68 kB` gzip)

### 4-Tile Macro Cards (`น้ำตาล · โซเดียม`), Target-Relative Donut Scale, Streamlined Food Summary, Planner Modal Upgrades & Button-Matched Input Typography
- **หน้า Home & สรุปภาพรวม (`src/home.js`, `src/home.css`, `src/donutChart.js`, `src/donutChart.test.js`)**:
  - รวมกล่อง **น้ำตาล** และ **โซเดียม** เป็น 1 กล่อง (`.hx-macro.is-sugar-sodium`) ในรูปแบบเดียวกับตัวอย่าง: หัวข้อ `"น้ำตาล · โซเดียม"`, ค่า `${น้ำตาล}g · ${โซเดียม}mg` (หรือ `—` เมื่อยังไม่มีข้อมูล) และหมายเหตุ `"เฉพาะรายการที่ระบุ"` พร้อมเปลี่ยนสีเตือน `.is-over` เมื่อเกินเกณฑ์ (`36g` / `2,300mg`) รวมเป็น 4 กล่องมาโคร (2x2 บนมือถือ `< 640px`, 4 ช่องเรียงแถวเดียวบน `640px–1023px`, เรียงแนวตั้งข้างวงแหวนบน Desktop `>= 1024px`)
  - `src/donutChart.js` (`mealSlicesToSegments(slices, targetKcal)`) คำนวณสัดส่วนมุมวงแหวนเทียบเป้าหมายแคลอรี่ (`targetKcal`) และย่อทุกส่วนตามสัดส่วนเมื่อกินเกินเป้าหมาย พร้อม Unit Tests เพิ่มเติมใน `src/donutChart.test.js`
- **หน้าอาหาร (`src/food.js`, `src/home.css`)**:
  - ปรับกล่องมาโครบนการ์ด `#f-summary-hero` ให้ใช้ 4 กล่องชุดเดียวกับหน้า Home (`โปรตีน`, `คาร์บ`, `ไขมัน`, และ `น้ำตาล · โซเดียม`)
  - ตัดส่วนรายการสัดส่วน % รายมื้อ (`#f-meals`), แถบ Legend รายมื้อ (`#f-meals-pie-legend`) และข้อความคำแนะนำใต้กราฟ (`#f-pie-readout-slot` โดยส่ง `{ showReadout: false }` ให้ `bindChartInspector`) ออกจากส่วนบนของหน้าอาหาร (คง Floating Tooltip เมื่อชี้หรือแตะส่วนของวงแหวนไว้เหมือนหน้าหลัก)
  - ย้ายกรอบ **คำแนะนำโภชนาการ (`#f-advice`)** เข้ามาไว้ใต้เส้นขีดของการ์ดแคลอรี่รวมวันนี้ แสดงเฉพาะรายการข้อแนะนำแบบจุดภายในกรอบโดยไม่มีหัวข้อด้านบน
  - ย้ายช่องกรอกชื่อเมนู (`#f-name`) ลงมาไว้ด้านล่าง **รายการโปรดด่วน (`#f-fav-strip`)**
  - กู้คืนการแสดง **โปรตีนรวมของแต่ละมื้อ (`P ...g`)** บนส่วนหัวกลุ่มมื้ออาหารในรายการอาหารของวันบนทุกขนาดหน้าจอ
- **Weekly Planner Modals (`src/planner.js`)**:
  - ป๊อปอัพเพิ่ม/แก้ไขกิจกรรม (`openRoutinesModal`): เปลี่ยนหัวข้อเป็น `"จัดการ & แก้ไข"`, ปุ่มเลือกชุดวันทุกปุ่ม (`จ พ ศ อา`, `อ พฤ ส`, `ทุกวัน`, `จ–ศ`, `ส–อา`) กดซ้ำเพื่อล้างวันที่เลือกได้ทั้งหมด, และเปลี่ยนปุ่มด้านล่างฟอร์มเป็น `"ยกเลิก"` และ `"บันทึก"`
  - ป๊อปอัพย้ายวัน (`openRescheduleModal`): เปลี่ยนหัวข้อเป็น `"จัดการ & ย้ายวัน"`, ปุ่มยืนยันเป็น `"ย้ายวัน"`, ปุ่มสลับสถานะเป็น `"ทำเสร็จ"` / `"ยังไม่ทำ"`, และปุ่ม `"แก้ไข"` / `"ลบ"` ใช้สไตล์ `.tm-food-action-btn` / `.tm-food-action-btn.is-del` เดียวกับคลังอาหาร
- **ขนาดตัวหนังสือและความสูงช่องกรอก/Dropdown เท่าปุ่ม (`src/style.css`, `index.html`)**:
  - `index.html` เพิ่ม `maximum-scale=1` ใน viewport meta เพื่อกันเบราว์เซอร์มือถือซูมอัตโนมัติ
  - `src/style.css` ปรับตัวหนังสือของ `.input`, `<select>`, `<input>`, `<textarea>` และ `::-webkit-date-and-time-value` เป็น `0.75rem` พร้อมความสูงขั้นต่ำ `2.5rem` (`:where(...)` specificity = 0 เพื่อไม่ทับคลาส Tailwind) และยกเลิกกฎบังคับ `16px` บนมือถือเพื่อให้ขนาดตัวอักษรและช่องกรอกสม่ำเสมอกับปุ่มทั้งแอป
- **เมนูย่อยบนมือถือ & การเข้าถึงหน้าการเงิน (`src/app.js`, `src/style.css`, `src/expense.js`, `src/summary.js`, `src/home.css`)**:
  - กู้คืนสไตล์ `.hx-cat`, `.hx-cat-icon`, `.hx-cat-label` และ `.sub-tile` ใน `#subnav` โดยนำกรอบนอกที่ครอบรวมไอคอนกับชื่อเมนูออก เหลือเฉพาะกรอบครอบไอคอน (`.hx-cat-icon` ขนาด `2.35rem × 2.35rem`, ไอคอน `18px`, ป้าย `.68rem`) พร้อมย่อ `.sub-chip`, `.tm-seg`/`.tm-seg-btn`, `.db-range`, `.db-refresh` และ `.wa-sec-tab` บนหน้าจอมือถือ (`<= 767px`)
  - ปรับ `.tm-seg--3` และ `.tm-seg--4` ที่ความกว้าง `< 640px` เป็นแถว Flex เลื่อนแนวนอนไม่ห่อบรรทัด (`overflow-x: auto`) และเปลี่ยนคอนเทนเนอร์แท็บใน `src/expense.js` จาก `min-w-[260px]` เป็น `w-full sm:w-auto sm:flex-1` เพื่อกันล้นขอบหน้าจอมือถือ
  - คืนทางเข้าหน้า **การเงิน (`expense`)** บนมือถือโดยแสดงเมนู **`รายรับ-รายจ่าย`** ใน `#subnav` ใต้หมวด **`ดูแล`** (พร้อมไฮไลต์ปุ่ม **`ดูแล`** บน `#bottom-nav` เมื่ออยู่ที่หน้า `expense` โดยไม่กระทบแถบเมนูด้านข้างของ Desktop) และปรับการ์ดสรุปใน `#summary-grid` (`src/summary.js`, `src/home.css`) รวมถึงการ์ด **การเงินเดือนนี้** ให้กดเปิดไปหน้านั้นได้ทันที (`data-page-go`)
- **แถบปฏิทินรายสัปดาห์แบบเลื่อนซ้าย-ขวา & ปุ่ม `"วันนี้"` เหมือนกันทั้ง 3 หน้า (`src/ui.js`, `src/planner.js`, `src/food.js`, `src/workout.js`, `src/style.css`, `src/uiWeekStrip.test.js`)**:
  - สกัด Helper กลาง `buildWeekStripRange()`, `centerStripPill()` และ `weekNavBarHtml()` ใน `src/ui.js` เพื่อรวมแถบวันที่แบบเลื่อนซ้าย-ขวาต่อเนื่องหลายสัปดาห์ (`.tm-week-strip` / `.tm-day-pill`) และปุ่มนำทางสัปดาห์ `.pl-week-nav` ให้เป็นชุดเดียวกันทั้งหน้าหลัก (`Home` Weekly Planner), หน้าอาหาร (`Food`) และหน้าออกกำลังกาย (`Workout`) โดยไม่กระทบข้อมูล/แผนของวันหรือสัปดาห์อื่น และคงกระดาน 7 วันบน Desktop ของหน้าหลักไว้ตามเดิม
  - ตั้งค่าเริ่มต้นให้วันที่ปัจจุบันอยู่ตรงกลางแถบปฏิทินเสมอเมื่อเข้าหน้าหลัก อาหาร หรือออกกำลังกาย และจัดกึ่งกลางแนวนอนอย่างปลอดภัยโดยไม่ดึง scroll แนวตั้งของหน้า
  - เปลี่ยนป้ายปุ่ม `"สัปดาห์นี้"` / `"กลับสัปดาห์นี้"` เป็น **`"วันนี้"`** (`aria-label="กลับไปวันนี้"`, `title="กลับไปวันนี้"`) ในรูปแบบ ตำแหน่งมุมขวาบนเหนือแถบวันที่ และพฤติกรรมเลื่อนกลับมาจัดกึ่งกลางวันที่ปัจจุบันเหมือนกันทั้ง 3 หน้า
- **อัปเดตเวอร์ชันเป็น v5.10.0**: ซิงค์ `package.json`, `package-lock.json`, `src/version.js` และเอกสารโดยไม่เปลี่ยน `firestore.rules`

---
## [v5.9.0] - 2026-11-23

### Unified 5-Macro Home/Food Summary, Streamlined Food Entry, Home Widget Drag & Drop, Meal Rename Sync & App-wide UI Consistency
- **หน้า Home & สรุปภาพรวม (`src/home.js`, `src/home.css`, `src/summary.js`, `src/style.css`)**:
  - การ์ด **สรุปภาพรวมวันนี้** เพิ่มกล่อง **น้ำตาล (`is-sugar`)** และ **โซเดียม (`is-sodium`)** เป็น 5 กล่องมาโคร ให้โครงสร้างและตัวชี้วัดตรงกับหน้าอาหาร พร้อมสถานะ `.is-over` เมื่อเกินเกณฑ์
  - ลบกรอบสีไฮไลท์ออกจากป้าย `"สัปดาห์นี้"` บน Weekly Planner (`.pl-week-nav-label.is-current` โปร่งใส) และเปลี่ยนปุ่ม `"กางดู"` (`#home-planner-open`) ให้ใช้สไตล์ `.pl-collapse-btn` เดียวกับปุ่มหุบ/ยุบ
  - ใน `#summary-section` (`src/summary.js`) การ์ด **การเงินเดือนนี้** เปลี่ยนคำว่า `"สุทธิ"` เป็น `"ยอดรวม"` และขึ้นบรรทัดใหม่อย่างชัดเจน (รวมถึงข้อความคัดลอกสรุป)
- **หน้าอาหาร, ตัวแก้ไขเมนู, ประวัติ และคลังอาหาร (`src/food.js`, `src/foodCalculations.js`, `src/foodEditor.js`, `src/foodHistory.js`, `src/style.css`)**:
  - ยกเลิกแท็บแยก `"สรุปโภชนาการ"` (`#f-view-*`) และจัดวางการ์ด `.hx-hero` ด้านบนคู่กับกล่อง **คำแนะนำจากเกณฑ์ที่ตั้งไว้ (`#f-advice`)** แบบ 2 คอลัมน์บน Desktop (`lg`) และเรียงแนวตั้งบน Mobile
  - เพิ่มแถบ **รายการโปรดด่วน (`.tm-fav-strip` / `#f-fav-strip`)** แสดงสูงสุด 5 รายการบนหน้าจอ `< 1024px` และสูงสุด 10 รายการบน Desktop เพื่อคลิกเลือกเมนูได้ทันที
  - อนุมานโหมดหน่วย/กรัมอัตโนมัติใน `inferFoodInputMode()` และ `foodQuantityFromInput()` (`src/foodCalculations.js`) แทนตัวเลือก `#f-qty-mode` พร้อมอัปเดต Unit Tests (`src/foodCalculations.test.js`)
  - กระชับฟอร์มบันทึกอาหาร: นำช่องกรอกสารอาหารด้วยตนเอง (`#f-cal`..`#f-sodium`), ปุ่มล้างฟอร์ม (`#f-clear`), ปุ่มบันทึกลงคลังจากฟอร์ม (`#f-save-lib`), ปุ่มคัดลอกมื้อ (`#f-copy-meal`) และการสแกนรูปจานอาหารออก คงไว้เฉพาะปุ่ม **บาร์โค้ด** และ **ฉลากโภชนาการ** แยกชัดเจน
  - `foodEditor.js`: ตัดช่อง `% ที่กินได้` (`#e-edible`) ออกจาก UI (ยังคงรักษาค่า `edibleFraction` เดิมในข้อมูลเมื่อไม่ถูกแก้ไข), เปลี่ยนตัวเลือกเมนูโปรดเป็นปุ่มดาว, และปรับป้ายเป็น `"คาร์บ (g)"`
  - `foodHistory.js`: เปลี่ยนตัวกรองเป็น `#fh-range` + แถบ 7 วันเลื่อนได้ `#fh-week-strip` พร้อมค้นหาอัตโนมัติ (debounce) แทน `#fh-from`/`#fh-to`/`#fh-go`
  - `openLibrary` (`src/food.js`): ตัดตัวกรองวันที่ออก, เพิ่มระยะห่างด้านขวาให้ `#lib-add-meal`, และปิดปุ่ม `#lib-delete-selected` เมื่อเลือกหมวดหมู่สำหรับลบแบบกลุ่ม
- **ตั้งค่า, โปรไฟล์ & ความสม่ำเสมอทั้งแอป (`src/homeWidgetSettings.js`, `src/profile.js`, `src/settings.js`, `src/period.js`, `src/body.js`, `src/inventory.js`, `src/care.js`, `src/expense.js`, `src/lab.js`, `src/services/aiAssistant.js`)**:
  - `homeWidgetSettings.js`: เพิ่มการจัดลำดับวิดเจ็ตด้วย **Drag & Drop** (HTML5 Drag & Drop + Pointer/Touch Fallback `.tm-drag-ghost`) คู่กับปุ่มลูกศรขึ้น/ลงเดิม
  - `profile.js`: เมื่อผู้ใช้เปลี่ยนชื่อมื้ออาหารและกดบันทึก ระบบจะซิงค์ชื่อมื้อใหม่ไปยัง `state.todayFood` ทันทีและอัปเดต `food_records` ใน Firestore ที่ตรงกับ `mealId` หรือชื่อมื้อเดิมเป็นชุด (`writeBatch` ชุดละ 450 เอกสาร)
  - `settings.js`: ปรับหัวข้อและคำอธิบายการ์ด **การแจ้งเตือน** (`#st-push-card`), นำส่วนเตือนรอบเดือน `#st-remind` และส่วนย้ายข้อมูล Room Code `#st-migrate` ออกจาก UI หน้าตั้งค่า (โดยไม่ลบไฟล์ `src/migrate.js` เพื่อความปลอดภัยย้อนหลัง), และเพิ่มปุ่มพับ `.pl-collapse-btn` ในส่วน **เมนูและทางลัด**, **ปรับแต่งหน้าแรก** และ **เป้าหมายพลังงาน & มื้ออาหาร**
  - มาตรฐานทั้งแอป: ปรับคำว่า `"คาร์โบไฮเดรต"` ใน UI และ AI Assistant เป็น `"คาร์บ"` (คง regex OCR ฉลากใน `src/nutrition.js` ไว้), ปรับปุ่มปิด Modal ทุกหน้าเป็นพื้นที่กดขั้นต่ำ `44px`, ปรับข้อความปุ่ม CTA ให้สั้นกระชับ (เช่น `"บันทึก"`, `"ยกเลิก"`, `"บันทึกที่เลือก"`), และใช้ `.tm-row-action-btn` สำหรับปุ่มจัดการในตาราง Desktop
- **อัปเดตเวอร์ชันเป็น v5.9.0**: ซิงค์ `package.json`, `package-lock.json`, `src/version.js` และเอกสารโดยไม่เปลี่ยน `firestore.rules`

---
## [v5.7.0] - หมายเหตุประวัติเวอร์ชัน
- ไม่พบ tag หรือ release `v5.7.0` แยกใน repository; การเปลี่ยนแปลงช่วงดังกล่าวถูกควบรวมเป็นฐานของ **v5.8.0** ด้านล่าง

---
## [v5.8.0] - 2026-11-22

### Weekly Planner Rescheduling & 7-Day Board, Streamlined Home/Summary, Regular Icons & Pastel Blue-Primary Theme
- **Shared DonutChart & Collision-Detected Tooltips (`src/donutChart.js`, `src/ui.js`, `src/foodCalculations.js`, `src/home.js`, `src/food.js`, `src/home.css`, `src/style.css`)**:
  - ใช้ `donutChart` ตัวเดียวกันทั้งหน้าหลัก (`Daily Overview`) และหน้าอาหาร (`#f-meals-pie`) ให้ความหนาของวงแหวน ตัวเลขเปอร์เซ็นต์ตรงกลาง ขอบ/ระยะห่าง และแอนิเมชันเหมือนกัน 100% พร้อมคำนวณโปรตีนรายมื้อ (`protein`) ใน `buildMealCaloriePieData()`
  - เพิ่ม Floating Tooltip (`.tm-chart-float-tip`) และ `computeTooltipPosition()` ใน `src/ui.js` ที่มี Collision Detection ตรวจจับขอบจอ (Clamp ซ้าย–ขวา และ Flip บน/ล่างอัตโนมัติ) พร้อมรองรับตัวเลือก `{ showReadout: false }` เพื่อซ่อนกล่องคำแนะนำใต้กราฟบนหน้าหลักโดยยังคง Tooltip แบบ Hover/Tap/Focus ได้ครบถ้วน (หน้าอาหารยังคงแสดง Legend และ Readout ด้านล่าง)
- **หน้า Home, Daily Overview & Horizontal Summary (`index.html`, `src/home.js`, `src/home.css`, `src/homeWidgetSettings.js`, `src/summary.js`)**:
  - การ์ด **สรุปภาพรวมวันนี้** ใช้ฟังก์ชัน `dailyEncouragementForDate(today)` แสดงข้อความให้กำลังใจรายวันแบบคงที่ตลอดวัน, ตัดปุ่ม `%` รายมื้อ กล่องคำแนะนำใต้กราฟ และกล่องสถานะ 4 ช่องออก, และย้ายกล่อง **โปรตีน / คาร์บ / ไขมัน** มาวางแทนที่ (เรียงแนวตั้งข้าง Donut บน Desktop `>= 1024px` และเรียงแนวนอน 3 คอลัมน์ใต้วงแหวนบนหน้าจอ `< 1024px`)
  - ตัดส่วนที่ซ้ำซ้อนออกจากหน้า Home (`หมวดหมู่`, `วันนี้`, `ใกล้ถึงกำหนด`, `การเงินเดือนนี้`) เหลือเฉพาะ `Weekly Planner` และ `Daily Overview` พร้อมปรับ `HOME_WIDGET_IDS` และหน้าตั้งค่าวิดเจ็ตหน้าแรก (`src/homeWidgetSettings.js`)
  - ย้าย `#summary-section` มาวางแนวนอนเต็มความกว้างใต้ `#home-today` (4 คอลัมน์บน `>= 768px`, 2 คอลัมน์บนมือถือ) แยก **สัดส่วน**, **การนอน** และ **ก้าวเดิน** เป็น 3 การ์ดอิสระ และตัดการ์ด **โภชนาการวันนี้** กับ **สต๊อก & แจ้งเตือน** ออก
- **Weekly Planner รายสัปดาห์ จันทร์–อาทิตย์ & การผูกวันเฉพาะสัปดาห์ (`src/planner.js`, `src/schema.js`, `scripts/daily-push.mjs`, `src/style.css`, `src/home.css`)**:
  - **ส่วนหัวการ์ด Weekly Planner**: ตัดปุ่ม `รอบ A/B`, `A↔B` และ `จัดการ` (`#pl-plan-menu`) ออก และย้ายปุ่มหุบ/ยุบ (`.pl-collapse-btn`, `[data-pl-collapse]`) ไปที่มุมขวาบนของการ์ดทั้ง Mobile และ Desktop
  - **Reschedule Tasks (`moveRoutineOccurrence`, `skipRoutineOccurrence`)**: ย้ายงานประจำหรืองานวันเดียว รวมถึงแผนออกกำลังกาย ผ่าน Drag & Drop บน Desktop หรือ Modal ย้ายวัน โดยคงชื่องานและสถานะเสร็จสิ้น (`doneMap`/`status`) ไม่กระทบสัปดาห์อื่น
  - **หน้าต่างจัดการงาน & กิจกรรม (`openRoutinesModal`)**: ตัดช่อง `เวลา (ไม่บังคับ)` ออก, ปุ่ม `ทุกวัน` กดซ้ำเมื่อเลือกครบ 7 วันจะล้างวันที่เลือกทั้งหมดทันที, ผูกการเพิ่ม/แก้ไข/ลบวันในสัปดาห์เฉพาะสัปดาห์ที่เลือกผ่านฟิลด์ `weekStart` (และจัดการข้อมูลต่อเนื่องเดิมในสัปดาห์นั้นผ่าน `skips`/`doneMap` เพื่อไม่กระทบสัปดาห์อื่น), และเพิ่ม `flex: 0 0 auto` บน `.tm-swipe-list--cards > .tm-swipe-row` เพื่อแก้การ์ดงานด้านล่างบีบซ้อนหรือถูกตัด
- **รายการอาหารและประวัติการวางแผนทุกหมวดหมู่ (`src/ui.js`, `src/style.css` ฯลฯ)**: ซ่อนปุ่มแก้ไข/ลบในแถวบนหน้าจอ `< 1024px` เพื่อคงการปัดซ้าย/ขวา (`bindSwipeRows`) และแสดงปุ่มแก้ไข/ลบในแถว/ตารางบนหน้าจอ `>= 1024px`
- **Phosphor Regular Icons, Pastel Blue-Primary Theme & Unified Logo (`src/icons.js`, `src/design-tokens.css`, `public/icon*.png`, `public/icon.svg`, `index.html`)**:
  - ปรับไอคอนทั้งหมดใน `src/icons.js` เป็น **Phosphor Regular** (`regular` SVG / `.ph-regular`), ใช้ชุดสี **Pastel Blue-Primary** (`#EAF3FD`, `#CBE5FC`, `#4A90D4`) และปรับสีโลโก้ทุกจุดให้เหมือนโลโก้หน้าล็อกอิน (`#e1f5fe`, `#b3e5fc`, `#03a9f4`)
- **อัปเดตเวอร์ชันเป็น v5.8.0**: ซิงค์ `package.json`, `package-lock.json`, `src/version.js` และเอกสารทั้งหมดโดยไม่เปลี่ยน `firestore.rules`

---
## [v5.6.0] - 2026-11-21

### Food Mobile + Desktop UX/UI Unification
- **แนวทางร่วมกันในหมวดอาหาร (`src/food.js`, `src/foodEditor.js`, `src/foodsearch.js`, `src/foodHistory.js`, `src/style.css`, `src/util.js`)**:
  - ใช้ Brand Palette และพื้นผิว Neutral เดียวกันทั้งส่วนอาหาร (พื้นการ์ดขาว `#FFFFFF`, พื้นรอง `#F4F8FD`, แถบความคืบหน้า `.tm-progress-track` `#E4E8F3` และ `.tm-progress-fill` `#1F4A74`) ไม่แยกสีพื้นหลังตามมื้ออาหารหรือหมวดอาหาร และใช้ไอคอน Phosphor Duotone รูปแบบเดียวกัน
  - กำหนดความสูงขั้นต่ำ `44px` (`min-h-[44px]`) สำหรับปุ่ม ช่องกรอก ตัวเลือกวันที่ ตัวเลือกโหมดหน่วย และปุ่มจัดการใน `#tab-food` และหน้าต่างย่อยของหมวดอาหาร
  - เพิ่ม `onClose` callback ใน `openModal()` (`src/util.js`) เพื่อเคลียร์ Object URL รูปพรีวิวชั่วคราวทันทีเมื่อปิดหน้าต่างทุกช่องทาง โดยไม่บันทึกรูปลง Firestore
- **หน้าอาหารหลัก (`src/food.js`, `src/style.css`)**:
  - **การ์ดสรุปด้านบน**: บน Desktop (`>= 1024px`) จัดวางแคลอรี่รวม, แถบความคืบหน้า, `#f-macro-strip` และกราฟวงกลมรายมื้อ `#f-meals-pie` แบบ 2 คอลัมน์คู่กัน และปรับ `#f-stats` ในมุมมอง **สรุปโภชนาการ** เป็น 5 คอลัมน์บน Desktop พร้อมแถบความคืบหน้าโทนเดียว
  - **บันทึกและรายการอาหาร (`.tm-food-log-grid`)**: Desktop จัดวางฟอร์มบันทึกด้านซ้ายและรายการอาหารของวันด้านขวาแบบ 2 คอลัมน์; หัวข้อแต่ละมื้อใช้พื้น Neutral พร้อมปุ่ม `+ เพิ่ม` เฉพาะมื้อ (`data-add-meal`); บน Mobile คงการปัดซ้าย/ขวาและการลากย้ายมื้อ (`[data-drag-handle]`) ส่วน Desktop (`>= 768px`) ปิดท่าปัดแนวนอนและแสดงปุ่ม `★ โปรด` (`[data-fav-log]`), `แก้ไข` (`[data-edit-log]`) และ `ลบ` (`[data-del]`) ชัดเจนในแถวทันที
- **หน้าต่างสแกนอาหาร, คลังอาหาร, เพิ่ม/แก้ไขเมนู, ค้นหาออนไลน์ และประวัติอาหาร**:
  - **ผลสแกนอาหาร (`src/food.js`)**: ใช้พื้นหลัง Neutral เดียวกันทุกชนิดและแสดงชนิดเป็นป้าย Badge ขนาดเล็ก (`บาร์โค้ด` / `ฉลากโภชนาการ` / `จานอาหาร`); แสดงภาพตัวอย่างจาก `URL.createObjectURL` เฉพาะฝั่ง Client แบบ Split View (ซ้าย/บนเป็นภาพตัวอย่าง, ขวา/ล่างเป็นกลุ่มข้อมูลและสารอาหารที่แก้ไขได้) และล้าง URL ทันทีเมื่อปิด
  - **เพิ่ม/แก้ไขเมนู (`src/foodEditor.js`)**: ใช้ Modal `size: 'xl'` จัด 2 คอลัมน์บน Desktop แยกกลุ่มข้อมูลอาหาร/หน่วยบริโภค กับกลุ่มพลังงาน/สารอาหาร, ข้อความอธิบาย `basis` แบบกะทัดรัด, ไฮไลต์สีเตือนเฉพาะช่องจำเป็นที่ขาดเมื่อสแกน (`calories` และ `unit`) โดยคง logic `toNum`, `validateFoodPreset`, การแปลงต่อ 100 กรัม (`#e-convert`), `edibleFraction` และการบันทึกเดิม
  - **คลังอาหาร (`openLibrary` ใน `src/food.js`)**: แสดงเป็นการ์ดบน Mobile และตาราง 6 คอลัมน์บน Desktop (`>= 768px`) พร้อมปุ่มเลือก โปรด แก้ไข และลบขนาดกดสะดวก `>= 44px`
  - **ค้นหาโภชนาการ (`src/foodsearch.js`)**: ช่องค้นหาเต็มความกว้างบน Mobile, ป้ายบอกแหล่ง (`คลังในเครื่อง`, `USDA`, `Open Food Facts`, `AI`), และจัด 2 คอลัมน์บน Desktop คู่กับแผงคำนวณปริมาณ `#os-calc` ด้านขวา
  - **ประวัติอาหาร (`src/foodHistory.js`)**: ตัวกรองบรรทัดเดียวบน Desktop, จัดกลุ่มผลลัพธ์ตามวันที่และมื้อ (`MEAL_ORDER`) แสดงค่าพลังงานและ P/C/F ครบถ้วน และเพิ่มปุ่ม **คัดลอกมื้อนี้** / **ใช้เมนูนี้** ลงวันที่กำลังบันทึกด้วย `writeBatch`
- **อัปเดตเวอร์ชันเป็น v5.6.0**: ซิงค์เลขเวอร์ชันใน `package.json`, `package-lock.json`, `src/version.js` และเอกสาร; ไม่เปลี่ยน Firestore Rules หรือ schema

---
## [v5.5.0] - 2026-11-21

### Cool Sky Blue, Periwinkle, Cream & Navy Palette
- **ยกเลิกตัวเลือกธีม**: ถอดตัวเลือกธีมจากหน้าตั้งค่าและเลิกโหลดตัวเปลี่ยนธีม; แอปใช้ชุดสีหลักเดียวผ่าน semantic tokens พร้อมคงสีสถานะ Success / Warning / Error และสีแยกความหมายรายรับ-รายจ่าย
- **ยกเลิกสีประจำหมวดหมู่**: นำ `cat` และคลาสสีหมวดออกจากข้อมูลเมนู ทางลัด และแผ่นบันทึกด่วน; ไอคอน Navigation ใช้ Deep/Midnight Navy (`#1F4A74` / `#194971`) และสถานะ Active ใช้ Pastel Cyan Sky (`#C1E4F3`)
- **ปรับโทนสีทั้งแอปเป็นชุดสี Cool Sky Blue, Periwinkle, Cream & Navy 11 สี (`#D7EBF6`, `#E9F1FC`, `#D0DBF7`, `#E4E8F3`, `#1F4A74`, `#194971`, `#E3F1FB`, `#A8D0EF`, `#C1E4F3`, `#FFF9E6`, `#99C3E4`)**:
  - **Design Tokens & Styles (`index.html`, `src/design-tokens.css`, `src/style.css`, `src/home.css`, `src/workout.js`)**: ปรับ `theme-color` และพื้นหลังหลักเป็น `#E9F1FC` (Ice Blue), พื้นผิวรอง/ฮีโร่เป็น `#E3F1FB` (Airy Sky), เส้นคั่น/แถบแท็บ/ช่องว่างกราฟเป็น `#E4E8F3` (Periwinkle Mist), การ์ดขาว `#FFFFFF`, สีแบรนด์หลัก/ปุ่มหลัก/วัน Active/Slider/FAB เป็น `#1F4A74` (Deep Ocean Navy), ตัวอักษรและไอคอนหลักเป็น `#194971` (Midnight Navy), จุดโฟกัส/Weekly Planner hero/ฟองโลโก้/แท็บไขมันเป็น `#FFF9E6` (Warm Butter Cream), ปุ่ม Sky/วงแหวน Focus/แถบความคืบหน้าเป็น `#A8D0EF`–`#99C3E4`, เมนูที่เลือก/คาร์บ/ทางลัดเป็น `#C1E4F3`–`#D7EBF6` และแท็บโปรตีน/แผ่นน้ำหนักเป็น `#D0DBF7` (Soft Periwinkle)
  - **กราฟและภาพประกอบ (`src/foodCalculations.js`, `src/food.js`, `src/dashboard.js`, `src/weekly.js`, `src/body.js`, `src/lab.js`, `src/care.js`, `src/onboarding.js`, `src/settings.js`)**: ปรับพาเลต Pie chart อาหาร (`#1F4A74`, `#A8D0EF`, `#D0DBF7`, `#FFF9E6`, `#99C3E4`, `#C1E4F3`, `#D7EBF6`) พร้อมปรับสีตัวอักษรอัตโนมัติ (`#FFFFFF` บนน้ำเงินเข้ม / `#194971` บนสีอ่อน), กราฟแนวโน้ม/รายสัปดาห์/รายเดือน/แท่งเทียนการนอนและก้าวเดิน/ผลแล็บ/น้ำหนักสัตว์เลี้ยง, ภาพประกอบ Onboarding และการ์ด API Keys ในหน้าตั้งค่าให้สอดคล้องกันทั้งแอป
- **ปรับหน้าอาหาร**: ปุ่มเครื่องมือเพิ่มเติมทั้ง 4 ปุ่มใช้พื้นขาว ขอบ Neutral และไอคอน Navy; สี Hover เป็น Powder Sky (`#D7EBF6`) โดยคง ID/Event Listener เดิม และปิดเมนู `<details id="f-tools-menu">` อัตโนมัติหลังกดคำสั่งหรือคลิกนอกเมนู; หัวมื้ออาหารใช้โทนเย็นสม่ำเสมอพร้อมไอคอนแยกตามมื้อ, คง `MEAL_ORDER` และชื่อมื้อกำหนดเอง; แท็บบันทึก/สรุปใช้ราง `#E4E8F3` และ Active `#C1E4F3` โดยคง Radio Inputs และเงื่อนไข `:has()` เดิม
- **ปรับปรุงปุ่ม `+`, โลโก้ชมพู `#F5B5C1`, ปุ่มแชทหัวหน้า, ท่าปัดแก้ไข/ลบ และตัวเลือกหน่วย/กรัม (`src/icons.js`, `src/style.css`, `src/food.js`, `src/foodCalculations.js`, `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `index.html`, `vite.config.js`)**:
  - เปลี่ยนไอคอน `plus` จาก `plus-duotone` (ที่มีกรอบสี่เหลี่ยมจางด้านใน) เป็น `plus-bold` เพื่อไม่ให้มีกรอบสี่เหลี่ยมอ่อนซ้อนหลังเครื่องหมาย `+`
  - เปลี่ยนพื้นหลัง `.logo-bubble` เป็น `#F5B5C1` ขอบ `#EB9FAE` ไอคอนหัวใจ `#194971` และสร้างโลโก้แอป `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png` โทนเดียวกันพร้อมอัปเดต `index.html` และ `vite.config.js`
  - ปรับปุ่ม Chat AI หัวหน้า `.ai-chat-header-btn` ให้ใช้พื้นหลัง ขอบ สีไอคอน และ hover state ชุดเดียวกับ `.icon-btn` ทั่วไป (กระดิ่ง/ตั้งค่า) และคง `.is-active` เด่นชัดด้วย Mint/Primary tokens
  - ย้าย `draggable="true"` จากแถว `.tm-swipe-row` ไปยัง `[data-drag-handle]` เฉพาะจุด เพื่อไม่ให้การลากเมาส์ปัดซ้าย/ขวาบนเว็บชนกับ HTML5 Drag & Drop และกันไม่ให้ `pointerdown` แย่งคลิกปุ่ม `.tm-swipe-actions` (`แก้ไข`/`ลบ`) พร้อมปรับ `z-index` เมื่อเปิดเมนูฝั่งซ้าย
  - เปลี่ยน `foodQuantityFromInput()` ให้รับโหมดหน่วยชัดเจน (`#f-qty-mode`: `หน่วย` / `กรัม (g)`) แทนการเดาจากขนาดตัวเลข เพื่อไม่ให้กรอก `50 g` ของเมนู `100 g` แล้วคูณเป็น `5,000 g` โดยคงการคำนวณเมนูรายชิ้น (`1 ชิ้น`, `1 ฟอง`) และการแก้จำนวนรายการเดิม พร้อมเพิ่ม unit tests ใน `src/foodCalculations.test.js`
- **ปรับ Layout หน้า Home แยก Mobile / Desktop (`index.html`, `src/home.css`)**:
  - **Mobile (`< 768px`)**: คงการเรียงแนวตั้งของ `#home-widgets` การ์ดเต็มความกว้าง อ่านและเลื่อนดูได้สะดวก พร้อม Quick Access Grid ปรับคอลัมน์ตามขนาดจอ (`3` คอลัมน์ที่ `<= 359px`, `4` คอลัมน์ที่ `360px–639px`, `auto-fill` ที่ `>= 640px`)
  - **Desktop (`>= 1024px`) & Wide (`>= 1280px`)**: จำกัดความกว้างหน้า `#tab-home` ที่ `74rem` ไม่ให้การ์ดยืดโล่งเกินไป, เพิ่มพื้นที่และขนาดตัวอักษร/วงแหวนของ `Daily Overview` (`hx-hero`), ปรับ `#home-widgets` เป็น Grid 2 คอลัมน์ที่จัดคู่ `กิจกรรม & บันทึกล่าสุด` กับ `แจ้งเตือนที่ต้องดูแล` เคียงกันเมื่ออยู่ติดกันและไม่ถูกซ่อน (คงลำดับ Widget, การซ่อน/แสดง, ทางลัดที่ปักหมุด และระบบตั้งค่าเดิมชุดเดียวร่วมกันทั้ง Mobile/Desktop), และจัดวาง `#summary-section` เป็น 4 คอลัมน์ที่ `768px–1279px` ก่อนยึดด้านขวาแบบ Sticky ที่ `>= 1280px`
- **ปรับ Navigation แยก Desktop / Mobile (`index.html`, `src/app.js`, `src/style.css`)**:
  - **Desktop / Web (`>= 768px`)**: Sidebar แสดงหมวดหมู่หลักทั้งหมดตลอดเวลาพร้อมชื่อและไอคอน (`หน้าหลัก`, `อาหาร`, `สุขภาพ`, `การเงิน`, `ดูแล`), หมวดที่มีเมนูย่อย (`สุขภาพ`, `ดูแล`) สามารถกดขยาย/ยุบได้ด้วย `<details>` และซิงค์รายการกับ `navigation.js` (order/hiddenTabs), ถอดปุ่ม `#desktop-quick-add` (`+`) ออกจาก Navigation เพื่อให้เพิ่มข้อมูลผ่านปุ่มในหน้าของแต่ละหมวดโดยตรง และซ่อน `#subnav` ซ้ำซ้อนบน Desktop
  - **Mobile (`< 768px`)**: แถบเมนูด้านล่างใช้ 5 ตำแหน่ง ได้แก่ **หน้าหลัก (`home`)**, **อาหาร (`food`)**, ปุ่มกลางเปลี่ยนจาก `+` เป็น **โลโก้แอป (`nav-plus--logo`)** เพื่อเปิด Bottom Sheet `#quick-sheet`, **ออกกำลัง (`workout`)** และ **ดูแล (`care`)** โดยยังคง `#subnav` สำหรับสลับหน้าย่อยในกลุ่มสุขภาพ/ดูแล
- **ปรับปรุง Home: Daily Overview, Weekly Planner และ Daily Activity (`src/home.js`, `src/planner.js`, `src/home.css`)**:
  - **Daily Overview**: แสดงสถานะเป้าหมายและวงแหวนเมื่อยังไม่ได้ตั้งเป้าพลังงานเป็น `—` พร้อมลิงก์ไปตั้งค่า, แสดงเวลาล่าสุดของ **นอนล่าสุด** และ **น้ำหนักล่าสุด** (`ล่าสุด · วันนี้ / เมื่อวาน / วันที่`) ให้แยกจากข้อมูลวันนี้ชัดเจน และปรับข้อความเมื่อพลังงานเกินเป้าให้เป็นกลาง ไม่แนะนำให้ขยับร่างกายเพื่อชดเชยการกิน
  - **Weekly Planner**: แก้ปัญหา `mountPlanner()` ผูก Event Listener ซ้ำเมื่อ `renderHome()` รีเฟรชหลายครั้งด้วย `WeakSet`, เพิ่มปุ่มย่อ/กางเป็นแถบกะทัดรัดบน Mobile และจัดเลย์เอาต์ 2 คอลัมน์ภายใน `.pl-card` บน Desktop (`>= 1024px`) เพื่อไม่ให้การ์ดยืดเต็มจอเกินไป พร้อมคงกิจกรรมประจำวัน แผนออกกำลังกาย และสลับสัปดาห์ A/B เดิม
  - **Daily Activity**: แก้ `.hx-tl-title` และ `.hx-tl-sub` ให้ขึ้นบรรทัดใหม่ได้เต็มรายละเอียดไม่ถูกตัดด้วย ellipsis, ปรับแนวเส้น timeline ให้ตรงศูนย์กลางจุด, จำกัดความกว้างการ์ดบน Desktop เมื่อแสดงเดี่ยว, และคำนวณ `ทำแล้ว X/Y` เฉพาะรายการที่ทำได้จริง (มื้ออาหารและออกกำลังกาย) แยกจากจำนวนแจ้งเตือน (`· เตือน N`) โดยคงสถานะ `ทำแล้ว` / `กำลังจะถึง` / `รอทำ`
- **อัปเดตเวอร์ชันเป็น v5.5.0** ในแอป, package manifests และเอกสาร; ไม่มีการเปลี่ยน Firestore schema หรือ business logic

## [v5.4.0] - 2026-11-20

### Unified Segmented Tabs, Food Pie Chart & Swipe/DnD, Compact Mobile Typography & "สรุป" View Unification
- **ระบบสลับแท็บมาตรฐานเดียวกับหน้ารายรับ-รายจ่าย (`.tm-seg` / `.tm-seg-btn`) ทั้ง 4 ธีม (`src/style.css`, ทุกหน้าฟีเจอร์)**:
  - เพิ่มคลาส `.tm-seg` (`.tm-seg--2`, `.tm-seg--3`, `.tm-seg--4`, `.tm-seg--scroll`) และ `.tm-seg-btn` รองรับครบทั้ง Baby Blue, Pastel, Cozy และ Dark mode พร้อม `min-height: 44px` บนมือถือ
  - ปรับตัวสลับมุมมอง/หมวดย่อยใน `dashboard.js`, `weekly.js`, `food.js`, `body.js`, `symptoms.js`, `period.js`, `care.js`, `inventory.js`, `workout.js` และ `expense.js` ให้ใช้รูปแบบเดียวกัน พร้อมซิงค์ deep-link ผ่าน `trackme:focus` ใน `src/app.js` เพื่อให้การเปิดหน้าหรือกดแก้ไขจากรายการประวัติ/แจ้งเตือนสลับไปยังแท็บที่เกี่ยวข้องอัตโนมัติ
- **ปรับปรุงหน้าอาหาร (`src/food.js`, `src/foodCalculations.js`, `src/icons.js`, `src/style.css`)**:
  - ตัดปุ่ม `เมื่อวาน` / `วันนี้` / `พรุ่งนี้` (ใช้แถบ 7 วันและช่องเลือกวันที่แทน), ตัดปุ่ม `− 100 / + 100 kcal` และ `− 50 g / + 50 g` รวมถึงแถบแนวนอน `"พลังงานแต่ละมื้อ"` ออก
  - แทนที่กราฟมื้ออาหารด้วย **SVG Pie Chart** (`buildMealCaloriePieData`, `buildMealPieSvg`) แสดงสัดส่วนแคลอรี่แยกตามมื้อ (`เช้า / กลางวัน / เย็น / ของว่าง`)
  - ปรับรายการอาหารของวัน (`#f-body`) เป็นการ์ดแบ่งตามมื้อ: เพิ่มเช็กบ็อกซ์ **"เลือกทั้งมื้อ"** (`[data-meal-sel]`), รองรับ **Drag & Drop** (เมาส์และสัมผัส via `[data-drag-handle]` + `#f-drag-targets`) ย้ายมื้อได้ทันที, **ปัดซ้าย** เพื่อแสดงปุ่ม `แก้ไข`/`ลบ` (ถอดปุ่มแก้ไขและถังขยะคงที่ออก), และ **ปัดขวา** เพื่อบันทึก/สลับ **รายการโปรด**
  - ปรับคำแนะนำโภชนาการ (`buildFoodAdvice`) ให้ประเมินจากหลายปัจจัยจริง (สัดส่วนพลังงานต่อเป้าหมาย, โปรตีน, ไขมัน และสมดุลคาร์บ/น้ำตาล) แทนข้อความแง่ดีคงที่
- **ย่อหน้ายาวบนมือถือด้วย Section Tabs**:
  - `src/body.js`: แยก `น้ำหนัก & สัดส่วน` | `นอน & ก้าวเดิน (Zepp)` (คง `#b-snapshot` ด้านบน) และปรับแท็บกราฟสัดส่วน/การนอนเป็น `.tm-seg`
  - `src/symptoms.js`: คงแถบวันที่ `#s-date` ร่วมกันด้านบน และแยกแท็บ `อาการทั่วไป` | `บันทึกผิว`
  - `src/period.js`: แยก `บันทึก & ปฏิทิน` | `สถิติ & ประวัติ`
  - `src/care.js`: คงสรุปโปรไฟล์ `#pet-profile` ด้านบน และแยก `ดูแล & อาหาร` | `อาการน้อง` | `ผลตรวจ / ผลเลือด` (โหลด `lab.js` อัตโนมัติเมื่อเปิดแท็บผลตรวจ)
  - `src/inventory.js`: คงสรุปสต๊อก `#inventory-summary` ด้านบน และแยก `สต๊อก & ซื้อของ` | `เพิ่ม / สแกน` | `ส่วนผสมที่เลี่ยง`
  - `src/workout.js`: แยก `วางแผน & บันทึก` | `ประวัติ & 7 วัน` | `เทมเพลต` พร้อมอัปเดตตัวกรองสถานะประวัติ `#w-hist-status-tabs` เป็น `.tm-seg`
  - `src/expense.js`: คงแถบเดือน `#ex-month` ร่วมกันด้านบน, แยก `บันทึก & นำเข้า` | `สรุป & งบ & ประจำ` | `ประวัติ`, และปรับ `[data-ex-type]` เป็น `.tm-seg`
- **ปรับขนาดฟอนต์บนมือถือให้อ่านกระชับ (`src/style.css`, `src/home.css`)**:
  - ปรับขนาดตัวอักษร root และหัวข้อการ์ด/ตัวเลขสถิติบนหน้าจอแคบ (`<= 767px`, `<= 639px`, `<= 380px`) โดยคงขนาด `16px` ของ `<input>/<select>/<textarea>` เพื่อกัน iOS auto-zoom และคง `min-height: 44px` ของปุ่มกด
- **เปลี่ยนชื่อ `"สรุปสัปดาห์"` เป็น `"สรุป"` และลดความซ้ำซ้อน (`src/categories.js`, `src/dashboard.js`, `src/weekly.js`, `src/app.js`)**:
  - เปลี่ยนชื่อ `SUBTABS.weekly.label` เป็น `"สรุป"`, ตัดปุ่มนำทางซ้ำซ้อน (`แดชบอร์ดภาพรวม`, `รายงาน`) ออกจาก `weekly.js` และซ่อนตัวควบคุมเฉพาะภาพรวม (`.db-overview-only`: ช่วง 3/6/12 เดือน, รีเฟรช, แถบทักทาย) เมื่อดูมุมมอง `สรุป` โดยใช้แถบ `.tm-seg` ด้านบนของ `dashboard.js` ร่วมกัน
- **อัปเดตเวอร์ชันและเอกสารเป็น v5.4.0**: อัปเดต `package.json`, `package-lock.json`, `src/version.js` และเอกสารใน `README.md`, `CHANGELOG.md`, `docs/*` โดยไม่เปลี่ยน Firestore Rules หรือรูปแบบไฟล์สำรอง

---
## [v5.3.0] - 2026-11-20

### Top Planner Checklist, 4-Tab Nav, Phosphor Duotone & Food Library Sync
- **ย้าย Weekly Planner ขึ้นบนสุดของหน้าหลัก, ปรับให้กระชับและเปลี่ยนคำเป็น "กิจกรรม" (`src/home.js`, `src/planner.js`, `src/preview.js`, `src/style.css`, `src/planner.test.js`)**:
  - เปลี่ยนลำดับวิดเจ็ตเริ่มต้น `HOME_WIDGET_IDS` ให้ **`planner`** อยู่ลำดับแรกถัดจากคำทักทาย (`['planner', 'daily-overview', 'quick-access', 'daily-activity', 'reminders']`) พร้อมเปิดกางรายการทันที (`plannerExpanded = true`) และปรับการรองรับ Dark mode สำหรับพื้นหลัง/ป้ายของ Planner
  - ปรับหัวข้อการ์ดเป็น **Weekly Planner**, เปลี่ยนแถบเลือกวันเป็นแถบวันที่เลื่อนซ้าย-ขวาได้ (`#pl-day-strip`, ตัดปุ่มสัปดาห์นี้/สัปดาห์หน้า และปุ่มสลับรายวัน/7 วันออก), ยุบปุ่มจัดการเป็นเมนูดรอปดาวน์ **วางแผน** (`กิจกรรม`, `ออกกำลังกาย`, `นัดหมาย`), ตัดการ์ดสรุปท้ายการ์ด, และเปลี่ยนคำว่า "กิจวัตร" เป็น "กิจกรรม" ทั่วทั้ง Planner
  - ปรับหน้าต่าง **เพิ่มกิจกรรม** (`openRoutinesModal`): ตัด `ROUTINE_PRESETS` และช่อง `#rt-time` (`เวลา (ไม่บังคับ)`, คงค่าเดิมที่บันทึกไว้เมื่อแก้ไขรายการเก่า), แสดงรายการล่าสุดที่ใช้งานบ่อยแบบเลือกเติมชื่อได้ทันที (`getFrequentRecentRoutines`), ปรับป้าย **รูปแบบ** และตัวเลือก **วันเดียว**, และซ่อนตารางเลือกวัน `#rt-days` เมื่อเลือกพรีเซ็ต (`จ พ ศ อา`, `อ พฤ ส`, `ทุกวัน`, `จ–ศ`, `ส–อา`) พร้อมคงปุ่ม `เลือกวันเอง`
- **ปรับเมนูหลักเหลือ 4 แท็บ + แตะโลโก้กลับหน้าหลัก และปรับแท็บหมวดหมู่ย่อย (`index.html`, `src/categories.js`, `src/app.js`, `src/style.css`)**:
  - ปรับแถบนำทางหลัก (`#bottom-nav` และ `#desktop-nav`) เป็น **อาหาร (`food`)**, **สุขภาพ (`health`)**, **+**, **การเงิน (`expense`)** และ **ดูแล (`care`)** โดยตัดแท็บหน้าหลัก/เพิ่มเติมออก และให้คลิกโลโก้ **Track Me** (`#btn-logo`) เพื่อกลับหน้าหลัก
  - ปรับ `renderSubnav()` สำหรับกลุ่ม `health` และ `care` ให้แสดงเป็นการ์ดไอคอนทรงเดียวกับ **หมวดหมู่** บนหน้าแรก (`.subnav--tiles`, `.subnav-tiles`, `.sub-tile` ร่วมกับ `.hx-cat`) รองรับครบทั้ง 4 ธีม
- **ซิงค์รายการที่เลือกไว้เมื่อแก้ไขข้อมูลในคลังอาหาร (`src/food.js`, `src/foodCalculations.js`, `src/schema.js`, `src/foodCalculations.test.js`)**:
  - บันทึก `customFoodId` (optional) เมื่อเพิ่มจากคลังอาหารและรองรับใน `SANITIZERS.food_records`; เมื่อแก้ไขรายการใน `custom_foods` ระบบจะอัปเดตฟอร์มอาหารที่กำลังเลือกอยู่ (โดยคงปริมาณที่ผู้ใช้กรอก) และอัปเดต `food_records` ที่ตรงกันในวันที่เปิดอยู่โดยอัตโนมัติ (รองรับทั้ง Preview Mode และ Firestore รวมถึงรายการเดิมที่จับคู่ด้วยชื่อและหน่วย)
- **ผสานการปรับปรุงเพิ่มเติมจากสาขา `ui/by-claude` โดยคงฟีเจอร์ v5.3.0 ครบถ้วน (`src/app.js`, `src/style.css`, `src/overview.js`, `src/preview.js`, `src/preview.test.js`)**:
  - เพิ่มตัวฟังเหตุการณ์ `trackme:goto` ใน `src/app.js`, ปุ่มทางลัด `#ov-go-weekly` / `#ov-go-report` ใน `src/overview.js`, และแอนิเมชันย่อ/ซ่อน `.scroll-fabs.is-hidden` ใน `src/style.css`
  - ปรับข้อมูล `expense_budget` รายหมวดหมู่และกฎจัดหมวดอัตโนมัติ `expense_rule` ใน `src/preview.js` ให้ตรงกับ `src/schema.js` และ `src/expense.js` พร้อมเพิ่มการทดสอบใน `src/preview.test.js`
- **ใช้ Phosphor Duotone ทั่วทั้งแอปแบบออฟไลน์ 100% (`src/icons.js`, `src/home.js`, `src/app.js`, `src/homeWidgetSettings.js`, `src/navigationSettings.js`, `index.html`, `src/home.css`, `src/style.css`, `src/icons.test.js`)**:
  - เปลี่ยนไอคอนทั้งหมดทั้งเมนู หมวดหมู่ การ์ดทางลัด แผ่น `+` และ UI ทั่วแอปมาใช้ `@phosphor-icons/core` รุ่น **Duotone** แบบ tree-shaken inline SVG ใน `src/icons.js` (ถอด `src/fluentEmoji.js`, `lucide` และ `@fortawesome/fontawesome-free` ออก)
- **อัปเดตเวอร์ชันและเอกสารเป็น v5.3.0**:
  - อัปเดต `package.json`, `package-lock.json` (`@phosphor-icons/core@^2.1.1`), `src/version.js`, `vite.config.js` และเอกสารทั้งหมด (`README.md`, `CHANGELOG.md`, `docs/*`) โดยไม่เปลี่ยน Firestore Rules หรือรูปแบบไฟล์สำรอง (เพิ่มเพียง optional `customFoodId` ใน `food_records`)

---
## [v5.2.0] - 2026-11-18

### 4-Theme System, Lucide Icons, Accessibility & UI Enhancements
- **แยกธีมแอปเป็น 4 รูปแบบชัดเจน (`src/theme.js`, `src/settings.js`, `src/design-tokens.css`, `src/style.css`, `index.html`)**:
  - **Baby Blue (`baby-blue`, ค่าเริ่มต้น)**: โทนฟ้าอ่อนตัดพื้นหลัง `#F4F8FC` (Ice Mist) และตัวอักษร slate คอนทราสต์สูง (ยังคง map ค่า `'minimal'` เดิมจาก `localStorage` มาที่ `'baby-blue'` อัตโนมัติ)
  - **Pastel (`pastel`)**: โทนชมพูพาสเทล (`#FCF6FB` / `#C87FA8`) พร้อมคอนทราสต์ตัวอักษรที่อ่านง่ายบนพื้นหลังอ่อน
  - **Cozy (`cozy`)**: คืนโทนน้ำตาลครีมอบอุ่นตามเดิม (`#FAF6F0` / `#FFFDF9` / `#8B5E3C` / `#3E2F26`) ครอบคลุมการ์ด, เมนู, Combobox, Slider, Chat Drawer และป้ายเวอร์ชัน
  - **Dark mode (`dark`)**: พื้นหลังโทนน้ำเงินเข้ม (`#0F1622`) พร้อมปรับ contrast ของการ์ด ชิป และส่วนควบคุมทั้งหมด
- **เปลี่ยนไอคอนทั้งแอปเป็น Lucide Inline SVG (`src/icons.js`, `package.json`, `package-lock.json`, ทุกโมดูลฟีเจอร์)**:
  - ใช้ชุดไอคอนกลาง `src/icons.js` (`iconSvg`, `iconBubble`) จาก `lucide` v1.75.0 แบบ tree-shaken inline SVG ทำงานออฟไลน์ 100% แทน FontAwesome icon tags ทั่วทั้งแอป (รวมถึงหน้าอาหาร สุขภาพ ร่างกาย ประจำเดือน สัตว์เลี้ยง ของใช้ ผลแล็บ รายจ่าย แพลนเนอร์ สรุป แจ้งเตือน สำรอง/ย้ายข้อมูล โปรไฟล์ ตั้งค่า Navigation และ Widget settings)
  - ใช้ SVG illustration ในเครื่องสำหรับหน้าเข้าสู่ระบบ, ล็อก PIN (`index.html`), และ Onboarding (`src/onboarding.js`) แทน emoji หลัก และลบ placeholder OG image ใน `index.html`
- **แสดงเลขเวอร์ชันบนเว็บแอป (`src/version.js`, `vite.config.js`, `index.html`, `src/app.js`, `src/settings.js`, `src/style.css`)**:
  - ดึงเวอร์ชันจาก `package.json` ผ่าน `__APP_VERSION__` ใน `vite.config.js` (fallback ใน `src/version.js` เป็น `5.2.0`) แสดงในหน้าเข้าสู่ระบบ, แถบนำทางด้านซ้าย (Desktop) และในหน้า **ตั้งค่า** (`.tm-app-version-pill`)
- **ยกระดับ Accessibility และ Micro-interactions (`src/util.js`, `src/ui.js`, `src/app.js`, `src/onboarding.js`, `src/chatWidget.js`, `src/home.js`, `src/food.js`, `src/body.js`, `src/expense.js`)**:
  - เพิ่ม `trapFocus()` พร้อมปิดด้วย `Escape`, คืน focus ให้ปุ่มที่เปิดหน้าต่างเมื่อปิด, และกำหนด `role="dialog"`, `aria-modal="true"`, `aria-labelledby` ให้ `openModal()`, `openBottomSheet()`, Onboarding dialog, AI Chat Drawer และ Quick Menu
  - เพิ่มตัวนับเลขแบบนุ่มนวล `animateNumberTicker()` (เคารพ `prefers-reduced-motion`), ขอบการ์ดเรืองแสง `.card-shine` ในการ์ดสรุปหน้าหลัก, ช่องค้นหาอาหารแบบ Combobox พร้อม keyboard navigation (`#f-name-listbox`), แถบเลือกวัน 7 วัน `.tm-day-pill` ในหน้าอาหาร, และตัวเลื่อนชั่วโมงนอน `.tm-slider` ในหน้าร่างกาย
- **ลดความรกของปุ่มนำทางและปุ่มลอย (`index.html`, `src/style.css`, `src/app.js`, `src/chatWidget.js`)**:
  - ย้ายปุ่ม **AI Chat** (`#ai-chat-fab`) ไปไว้บน Header ขวาบนข้างปุ่มแจ้งเตือน/ตั้งค่า (รองรับครบทั้ง 4 ธีมและสถานะเปิด/ปิด)
  - ฝังปุ่ม **+** (`#btn-quick-add`) ไว้ตรงกลาง Bottom Nav บนมือถือ (`[หน้าหลัก] [อาหาร] [+] [สุขภาพ] [ดูแล]`) และเพิ่มปุ่ม **+ บันทึกด่วน** (`#desktop-quick-add`) ในแถบเมนูซ้ายบน Desktop
  - ยุบปุ่มเลื่อน `↑`/`↓` เหลือ **ปุ่มเดียวอัตโนมัติ (`#fab-scroll`)** ที่สลับทิศตามตำแหน่งหน้า ซ่อนอัตโนมัติเมื่อหยุดเลื่อนและซ่อนทั้งหมดเมื่อหน้าสั้นจนเลื่อนไม่ได้
- **โหมดดูตัวอย่างโดยไม่เข้าสู่ระบบ (`src/preview.js`, `src/auth.js`, `src/app.js`, `index.html`, `src/preview.test.js`)**:
  - เพิ่มปุ่ม **ดูตัวอย่างก่อนใช้งาน (`#btn-preview`)** บนหน้าล็อกอินเพื่อจำลองการใช้งานแอปด้วยชุดข้อมูลตัวอย่างในหน่วยความจำ 18 หมวดหมู่ (`PREVIEW_UID = 'preview-guest'`) พร้อมแถบแจ้งเตือน `#preview-banner` และปุ่มออกที่ล้างแคชชั่วคราวใน `localStorage` (`clearPreviewStorage()`) อัตโนมัติ
  - เพิ่ม `guardPreviewWrite()` ป้องกันการเขียน/ซิงค์ข้อมูลจริงไปยัง Firebase ระหว่างดูตัวอย่าง พร้อมรองรับการทดลองเพิ่ม/แก้ไข/ลบรายการอาหารและคลังอาหารในหน่วยความจำชั่วคราว
- **ผสานเลย์เอาต์หน้า Home, แดชบอร์ดตอบสนองทุกจอ และการพับข้อมูลหน้าอาหาร/รายจ่าย/ออกกำลังกาย (`src/home.js`, `src/home.css`, `src/dashboard.js`, `src/weekly.js`, `src/categories.js`, `src/navigation.js`, `src/food.js`, `src/expense.js`, `src/workout.js`, `src/style.css`, `index.html`)**:
  - **หน้า Home (`src/home.js`, `src/home.css`)**: ปรับเลย์เอาต์แบบ Calm Wellness (`.hx-*`) รองรับครบทั้ง 4 ธีม (`Baby Blue`, `Pastel`, `Cozy`, `Dark mode`) และจัดลำดับวิดเจ็ตเริ่มต้นเป็น `daily-overview`, `quick-access`, `daily-activity`, `planner`, `reminders`
  - **แดชบอร์ดและกลุ่มสุขภาพ (`src/dashboard.js`, `src/weekly.js`, `src/categories.js`, `src/navigation.js`, `src/app.js`)**: ใช้ `src/dashboard.js` เป็นแดชบอร์ดตอบสนองทุกขนาดจอ (`.db-*`) พร้อมปุ่มสลับมุมมอง `[data-page-go]` (`overview`, `weekly`, `report`) และจัดเมนูย่อยกลุ่มสุขภาพให้กระชับ 5 แท็บ (`overview`, `workout`, `period`, `symptoms`, `body`) โดยยังคงเข้าถึง `weekly` และ `report` จากทางลัดได้
  - **หน้าอาหาร รายจ่าย และออกกำลังกาย (`src/food.js`, `src/expense.js`, `src/workout.js`)**: เพิ่มตัวสลับมุมมอง **บันทึกอาหาร / สรุปโภชนาการ** และพับเครื่องมือเสริมใน `<details>` (กดช่องมื้ออาหารจากสรุปจะสลับกลับหน้าบันทึกให้ทันที), พับช่องเสริมร้านค้า/หมายเหตุและประวัติเกิน 5 รายการในหน้ารายจ่าย, พับประวัติเกิน 5 รายการในหน้าออกกำลังกาย, และเพิ่มขอบจางด้านขวาให้ `.subnav` บนมือถือ
- **ไม่เปลี่ยน Firestore schema/Rules หรือรูปแบบไฟล์สำรอง**; อัปเดต `package.json`, `package-lock.json` (`lucide@^1.75.0` และเวอร์ชัน `5.2.0`), `src/version.js`, `vite.config.js` และเอกสารทั้งหมดให้ตรงกับพฤติกรรมปัจจุบัน

---
## [v5.1.0] - 2026-11-18

### Responsive Layout, Dashboard Refinements & Sticky Navigation
- **แก้ตำแหน่ง subnav และ scroll target ตามความสูง header จริง** (`src/app.js`, `src/style.css`, `src/design-tokens.css`): วัด header และ desktop navigation ด้วย `ResizeObserver` และอัปเดต CSS variables เมื่อขนาดหน้าจอเปลี่ยน
- **ปรับ layout สำหรับ tablet/desktop** (`index.html`, `src/food.js`, `src/workout.js`, `src/body.js`): หน้า Home, อาหาร, ออกกำลังกาย และร่างกายใช้ sidebar ที่ breakpoint 768px พร้อมขยาย sidebar บน desktop
- **จัดกลุ่มปุ่มลอยบน desktop**: เว้นพื้นที่ให้ quick-add และจัดปุ่มเลื่อน/ผู้ช่วย AI เรียงแนวตั้ง โดยไม่พึ่งความสูง bottom navigation ที่ไม่มีบน desktop
- **ลดความรกของสรุป Home** (`src/summary.js`, `src/style.css`): ซ่อนการ์ดที่ยังไม่มีข้อมูลเมื่อแสดงเป็น sidebar บนหน้าจอใหญ่
- **เพิ่ม contrast ของเมนู desktop ที่เลือกอยู่** ด้วย inset border ที่มองเห็นชัดขึ้น
- **ไม่เปลี่ยน Firestore schema/Rules หรือรูปแบบไฟล์สำรอง**; ปรับเอกสารและ package version เป็น v5.1.0

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
