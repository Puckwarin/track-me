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
| `app.js` | entry point, tab navigation, mount modules, lazy loading และ orchestration |
| `auth.js`, `firebase.js` | Google Authentication, PIN lock และ Firebase helpers |
| `state.js`, `sync.js` | in-memory app state, event bus, Firestore listeners และสถานะ offline/sync |
| `schema.js` | sanitizers, collection labels และ document ID สำหรับ backup/restore |
| `util.js`, `style.css`, `theme.js` | utilities, shared styles และ theme |
| `food.js`, `food*.js`, `foodsearch.js`, `nutrition.js` | บันทึก/ค้นหาอาหาร, โภชนาการ, AI consumers และตัวช่วยประมวลผลหลายภาพ (`runImageBatch`) |
| `period.js`, `body.js`, `symptoms.js`, `profile.js`, `lab.js` | สุขภาพ, เป้าหมายและผลตรวจ (รองรับสแกนหลายภาพ) |
| `expense.js`, `expenseLogic.js`, `statementParser.js`, `slipOcr.js` | รายรับ-รายจ่าย, งบ/รายการประจำ, วิเคราะห์จ่ายซ้ำรายเดือน, กฎหมวดหมู่, Statement และ OCR สลิป |
| `care.js`, `inventory.js`, `reminders.js`, `remindLog.js`, `planner.js` | สัตว์เลี้ยง (รองรับสแกนซองหลายภาพ), สต๊อก, Planner และการเตือน |
| `workout.js`, `workoutActive.js`, `workoutParser.js`, `workoutConstants.js` | แผน/บันทึก workout, ตัวแปลงข้อความและตาราง, กรอบภาพ และโหมดจับเวลาพัก |
| `reports.js`, `weekly.js`, `summary.js`, `home.js` | หน้าสรุปและรายงาน |
| `settings.js`, `backup.js`, `migrate.js`, `onboarding.js` | ตั้งค่า, backup/restore, migration และ first-run UX |
| `services/aiService.js` | AI provider transport/model selection/retry/cooldown/fallback |
| `services/chatRoles.js` | นิยาม 5 บทบาทแชทและการจับคู่ model preset แบบ lightweight สำหรับ UI |
| `services/aiAssistant.js`, `chatWidget.js` | AI Read/Write tools, system prompt, Markdown renderer และหน้าต่างแชท |
| `runtimeErrorMonitor.js` | error report ที่จำกัด metadata และปริมาณ |
| `*.test.js` | Vitest tests วางข้างโมดูลที่ทดสอบ |

`public/` มี `icon-192.png`, `icon-512.png` และ `push-sw.js`; `scripts/daily-push.mjs` ใช้ Firebase Admin SDK และ `web-push` จาก dependencies ที่แยกใน `scripts/package.json`

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
