# โครงสร้างโปรเจกต์

## โครงสร้างระดับบน

```text
.
├── .github/workflows/       # CI/Pages และงานส่ง Push ตามเวลา
├── docs/                    # คู่มือผู้พัฒนา, schema, setup และ changelog
├── public/                  # ไอคอนและ Service Worker สำหรับ Push/Share Target
├── scripts/                 # โค้ดงาน server-side ที่รันจาก GitHub Actions
├── src/                     # แอป Vanilla JavaScript และ tests
├── index.html               # login, app shell, tabs และ onboarding root
├── vite.config.js           # Vite, Tailwind, PWA manifest และ Workbox
├── firebase.json            # Rules path และ Firestore Emulator port
├── firestore.rules          # Production rules ใน repository (ต้อง deploy แยก)
├── firestore.rules.migration # Rules ชั่วคราวสำหรับ Room Code migration
├── package.json             # scripts และ dependencies ของเว็บแอป
└── package-lock.json        # lockfile ที่ CI ใช้กับ npm ci
```

## โมดูลสำคัญใน `src/`

| ไฟล์/กลุ่ม | ความรับผิดชอบ |
|---|---|
| `app.js` | entry point, tab navigation, lazy loading หน้า/ฟีเจอร์เมื่อคลิก และ orchestration (รวมตัวฟัง Firestore หลักและ Share Target routing) |
| `auth.js`, `firebase.js`, `preview.js` | Google Authentication, PIN lock, Firebase helpers และโหมดดูตัวอย่างโดยไม่เข้าสู่ระบบ (`PREVIEW_UID = 'preview-guest'`, `guardPreviewWrite()`) |
| `state.js`, `sync.js` | in-memory app state, event bus, Firestore listeners, สถานะ offline/sync และ unit tests ใน `sync.test.js` |
| `schema.js` | sanitizers, collection labels และ document ID สำหรับ backup/restore |
| `util.js`, `style.css`, `home.css`, `design-tokens.css`, `ui.js`, `icons.js`, `version.js` | utilities (รวม `trapFocus`), local calendar date helpers (`localDateStr`, `localMonthStr`, `addDays`), shared styles, Home Calm Wellness styles, Warm Wellness semantic design tokens (สีประจำแอปชุดเดียว), shared UI components/ticker, Phosphor Duotone inline SVGs ทั้งแอป และเลขเวอร์ชันเว็บแอป |
| `navigation.js`, `navigationSettings.js`, `homeWidgetSettings.js` | จัดการเมนูย่อย (รวมการ์ดไอคอนสุขภาพ/ดูแล), ปุ่มลัดหน้า Home และการตั้งค่าแสดง/เรียงลำดับวิดเจ็ต |
| `food.js`, `food*.js`, `foodsearch.js`, `nutrition.js` | บันทึก/ค้นหาอาหาร (รวมตัวสลับมุมมองบันทึก/สรุป และซิงค์การแก้ไขคลังอาหารไปยังฟอร์มและรายการที่เลือกไว้), สแกนปุ่มเดียว (บาร์โค้ด → OCR ฉลากในเครื่อง → AI), โภชนาการ, AI consumers และตัวช่วยประมวลผลหลายภาพ (`runImageBatch`) |
| `period.js`, `periodStats.js`, `body.js`, `bodyStats.js`, `zeppParser.js`, `symptoms.js`, `profile.js`, `lab.js`, `labTemplates.js` | สุขภาพ, คำนวณสถิติรอบเดือน/สัดส่วนแบบ pure, สัดส่วนร่างกาย + การนอน/ก้าวเดิน (กรอกเอง / นำเข้า Zepp CSV ฟรี), เป้าหมายและผลตรวจ (ชุดเทมเพลตแล็บ & วางหลายบรรทัดในเครื่อง + สแกนหลายภาพ) |
| `expense.js`, `expenseLogic.js`, `statementParser.js`, `slipOcr.js` | รายรับ-รายจ่าย, งบ/รายการประจำ, วิเคราะห์จ่ายซ้ำรายเดือน, กฎหมวดหมู่, Statement และ OCR สลิป (แยก lazy chunk) |
| `care.js`, `inventory.js`, `reminders.js`, `remindLog.js`, `planner.js` | สัตว์เลี้ยง (อาการน้องหมา, เทมเพลตอาหารเดิม & สแกนซองหลายภาพ, teaser โหลด `lab.js` แบบ lazy), สต๊อก, Weekly Planner (แถบวันเลื่อนซ้าย-ขวา, feedback/toast ทันที, กิจกรรมวันเดียว/รายสัปดาห์ โหลดและแสดงบนสุดของหน้า Home) และการเตือนแบบพิมพ์เองพร้อมตัวช่วยแพตเทิร์น (0 โทเค็น) |
| `workout.js`, `workoutActive.js`, `workoutParser.js`, `workoutPresets.js`, `workoutConstants.js` | แผน/บันทึก workout, เทมเพลตสำเร็จรูป 5 ชุด (0 โทเค็น), ตัวแปลงข้อความและตาราง, กรอบภาพ และโหมดจับเวลาพัก |
| `dashboard.js`, `overviewLogic.js`, `reports.js`, `weekly.js`, `summary.js`, `home.js` | หน้า **`ประวัติ & รายงาน`** (`overview` ที่รวมภาพรวมรายเดือน + สรุปรายสัปดาห์/เดือน และสลับไป `reports.js` PDF/CSV ได้ในหน้าเดียว), การคำนวณสรุป และหน้า Home ที่จัดแสดง Planner ด้านบนสุด |
| `settings.js`, `backup.js`, `migrate.js`, `onboarding.js` | ตั้งค่า, คีย์ AI, ทางลัดโน้ต/Feedback (lazy load `chatWidget.js`), backup/restore แบบทดสอบได้ (`backup.test.js`), migration และ first-run UX |
| `services/aiService.js` | AI provider transport/model selection/retry/cooldown (แยกตามรายโมเดลและ provider)/fallback |
| `services/chatRoles.js` | นิยามโหมดแพตเทิร์น (`LOCAL_ROLE`) + 5 บทบาท AI และการจับคู่ model preset แบบ lightweight สำหรับ UI |
| `services/localAssistant.js`, `services/aiAssistant.js`, `chatWidget.js` | ตัวประมวลผลคำสั่งแพตเทิร์น 0 โทเค็นในเครื่อง, AI Read/Write tools (พร้อม `shouldAttachToolsForTurn`), system prompt, Markdown renderer, หน้าต่างแชทและหน้าต่างโน้ต/Feedback (lazy load เมื่อคลิก Header AI Chat หรือทางลัดในตั้งค่า) |
| `runtimeErrorMonitor.js` | error report ที่จำกัด metadata และปริมาณ |
| `*.test.js` | Vitest tests วางข้างโมดูลที่ทดสอบ (รวม `preview.test.js` และ `icons.test.js`) |

`public/` มี `icon-192.png`, `icon-512.png` และ `push-sw.js`; `scripts/daily-push.mjs` ใช้ Firebase Admin SDK และ `web-push` จาก dependencies ที่แยกใน `scripts/package.json` และ `scripts/check-lockfile.mjs` ใช้ตรวจสอบความครบถ้วนของ `package-lock.json` (`npm run lock:check`)

## แนวทางตั้งชื่อและเพิ่มโมดูล

- ใช้ JavaScript ES modules และชื่อไฟล์ `lowerCamelCase.js`; tests ใช้ `<module>.test.js`
- Collection Firestore ใช้ `snake_case`; ฟิลด์และตัวแปร JavaScript ใช้ `camelCase`
- UI module ควรรับ root element ผ่าน `mount...()` และเก็บการ render/event ของฟีเจอร์ไว้ในขอบเขตนั้น
- ใช้ `userCol()`/`userDoc()` จาก `firebase.js` เพื่อสร้าง path ใต้ UID ที่ล็อกอิน; อย่าสร้าง path ที่ข้าม ownership boundary
- ใช้ sanitizer/schema และ tests เมื่อเพิ่มหรือเปลี่ยนข้อมูลที่ backup, restore หรือ migration รับเข้า
- กฎโดเมนที่เป็น pure logic ให้แยกเป็นฟังก์ชัน export ที่ไม่ต้องอ่าน DOM เพื่อให้เขียน Vitest tests แบบ deterministic ได้
- งานข้ามฟีเจอร์หรือ infrastructure ควรอยู่ใน `src/services/` เมื่อเป็น service จริง; อย่าสร้าง wrapper ซ้ำให้ฟังก์ชันที่มีเจ้าของชัดเจนอยู่แล้ว
- อัปเดต Firestore Rules, backup/restore, tests และเอกสารที่เกี่ยวข้องพร้อมกันเมื่อเปลี่ยน schema; Rules deployment ต้องแยกอนุมัติจากเว็บ deployment

แอปนี้ไม่ใช้ React, JSX, React hooks หรือ React Testing Library; ให้ทำตามรูปแบบ Vanilla JavaScript ที่มีอยู่จริง
