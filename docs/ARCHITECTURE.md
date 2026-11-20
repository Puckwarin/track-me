# สถาปัตยกรรม Track Me

## ภาพรวมระบบ

Track Me เป็นเว็บแอปแบบ client-side สำหรับบันทึกสุขภาพและจัดการชีวิตส่วนตัว ไม่มี application server ของ Track Me เอง ผู้ใช้ยืนยันตัวตนด้วย Google ผ่าน Firebase Authentication และข้อมูลบัญชีอยู่ใน Cloud Firestore ใต้ UID ของผู้ใช้

โครงการจริงใช้ **Vanilla JavaScript แบบ ES modules** ไม่ได้ใช้ React หรือ component framework แม้เอกสารเก่าบางส่วนจะกล่าวถึง React

## Technology stack

- **Vite** สำหรับ development server, production bundling และ environment variables ที่ขึ้นต้นด้วย `VITE_`
- **Vanilla JavaScript** แยกโมดูลตามฟีเจอร์และใช้ DOM APIs โดยตรง
- **Tailwind CSS 4**, `src/design-tokens.css` และ `src/style.css` สำหรับ responsive styling และ 4 ธีม (`baby-blue`, `pastel`, `cozy`, `dark`); ใช้ `@fontsource/prompt` และชุดไอคอน **Phosphor Duotone** (`@phosphor-icons/core` ใน `src/icons.js` แบบ tree-shaken inline SVG) ทั่วทั้งแอป พร้อมแสดงเวอร์ชันจาก `src/version.js`
- **Firebase Web SDK** สำหรับ Google Authentication และ Firestore
- **Firestore persistent local cache** สำหรับข้อมูลที่เคยโหลดและการเขียนที่รอซิงค์; มี memory-cache fallback หากเปิด persistent cache ไม่ได้
- **vite-plugin-pwa / Workbox** สำหรับสร้าง Service Worker, auto-update และ precache
- **Vitest** สำหรับ unit/integration tests, **ESLint** สำหรับ lint และ Firebase Emulator สำหรับ Rules tests
- **Tesseract.js** สำหรับ OCR บางงานใน browser; ใช้ AI provider ภายนอกเฉพาะฟีเจอร์ที่ผู้ใช้เรียก

## Entry point และการจัดการ UI

1. `index.html` กำหนด login screen, app shell, หน้าของแต่ละ tab และ onboarding root
2. `src/app.js` เป็น entry point: ลงทะเบียน Service Worker และ error monitoring, จัดการ tab/navigation, mount ฟีเจอร์หลักหลังเข้าสู่ระบบ และเชื่อม listener ของ Firestore
3. `src/auth.js` จัดการ Google sign-in, session, PIN lock เฉพาะอุปกรณ์ และส่ง auth event ให้แอป
4. โมดูลฟีเจอร์รับ DOM root ผ่าน `mount...()` แล้วสร้าง/อัปเดต UI ของตนเอง เช่น `food.js`, `expense.js`, `profile.js` และ `settings.js`
5. หน้าและฟีเจอร์ที่ยังไม่ได้เปิดในหน้าแรก (`expense`, `care`, `inventory`, `lab`, `planner`, `food`, `weekly`, `remindLog`, `settings`, `overview`, `reports`, `workout` รวมถึง `chatWidget`) ถูก import แบบ lazy เฉพาะเมื่อผู้ใช้เปิด tab หรือกดปุ่มใช้งาน ส่วนตัวฟัง Firestore หลักและ Share Target (`?shared-slip`) ถูกประสานจาก `src/app.js`; งาน OCR และ AI ที่แยก chunk จะโหลดเมื่อเริ่มใช้ฟีเจอร์นั้น

ไม่มี React hooks หรือ React lifecycle; state กลางและ event bus อยู่ใน `src/state.js` และแต่ละโมดูลรับผิดชอบ DOM/event ของตน

## State และ data flow

```text
index.html
  └─ src/app.js
      ├─ auth.js ── Firebase Authentication
      ├─ sync.js ── Firestore onSnapshot listeners
      │              └─ state.js ── feature renderers
      ├─ feature modules ── Firebase reads/writes
      └─ services/ ── AI, validation, monitoring
```

- `state.js` เก็บข้อมูลที่โหลดใน session ปัจจุบันและส่ง event ผ่าน `EventTarget`; ไม่ใช่ฐานข้อมูลถาวร
- `sync.js` สร้าง/หยุด `onSnapshot` listeners, สรุป pending writes, สถานะ offline และเวลาที่ซิงค์กับ server ล่าสุด
- Firebase helpers ใน `firebase.js` สร้าง path ใต้ `users/{uid}` ผ่าน `userCol()` และ `userDoc()`
- เมื่อผู้ใช้เขียนขณะ offline Firestore อาจเก็บการเปลี่ยนแปลงใน local cache และซิงค์ภายหลัง; โดย `executeConfirmedAction()` และ `undoAssistantAction()` ใน `aiAssistant.js` จะรอผลการเขียนเมื่อออนไลน์, แยกสถานะรอซิงค์เมื่อออฟไลน์ และ rollback state หากเขียนไม่สำเร็จ ส่วนโมดูล UI บางส่วนยังอาศัย local cache/async write ของ Firestore
- `schema.js` กรอง/ปรับรูปข้อมูลในขั้น backup, restore และ migration; Firestore Rules ตรวจ ownership, ขนาดเอกสาร และชนิดข้อมูลบางส่วน ไม่ใช่ schema validator ครบทุกฟิลด์

## โมดูลและ service layer

- `src/services/aiService.js` จัดการ transport ของ Gemini, Groq และ OpenRouter, model discovery/selection (`nutrition`, `chat`, `fast`, `complex`, `deep`), retry, timeout, cancellation, cooldown, error normalization และ fallback
- `src/services/aiAssistant.js` และ `src/services/chatRoles.js` กำหนดบทบาทแชท, การสนทนาทั่วไป, read/write tools (7 Read + 6 Write) และขอบเขตความปลอดภัยของ AI Assistant; `nutrition.js` เป็น consumer สำหรับโภชนาการ, จัดโครงสร้างแผนออกกำลังกาย, อ่านภาพ Zepp และงาน AI ที่เกี่ยวข้อง
- `food*` แยก catalog/constants, parser, calculations, validation, Firestore service, editor/history และ UI
- `backup.js`, `migrate.js` และ `schema.js` ดูแลสำรอง/กู้คืน, ย้าย Room Code เดิม และ sanitize ข้อมูล
- `push.js` จัดการ Web Push ใน browser; `scripts/daily-push.mjs` เป็นงานฝั่ง server ที่ GitHub Actions เรียกตามเวลาโดยใช้ secrets
- `runtimeErrorMonitor.js` คัดกรอง metadata, deduplicate, rate-limit และ batch รายงาน error โดยไม่ส่ง stack, prompt หรือข้อมูลส่วนตัว
- `onboarding.js` แสดง wizard; `onboardingState.js` แยกกฎการเริ่ม/บันทึกความคืบหน้าและตรวจข้อมูลที่ทดสอบได้โดยไม่ใช้ DOM
- `util.js` รวม DOM selectors, escaping, วันที่/เดือนตามเวลาท้องถิ่น (`localDateStr`, `localMonthStr`, `addDays`), ตัวเลข, toast และ helpers ที่ใช้ร่วมกัน

## Firebase และข้อมูล

Authentication ใช้ Google provider; Firestore เอกสารของแอปอยู่ใต้ `users/{uid}/{collection}/{recordId}` และ Rules ตรวจ UID ใน path เทียบกับผู้ใช้ที่ล็อกอินอยู่ `runtime_error_logs` เป็น write-only collection ที่มีกฎแยกต่างหาก

ปัจจุบันไม่มี subcollection ของข้อมูลแอป ไม่มี Firebase Storage และไม่มี Cloud Functions ใน repository นี้ รายละเอียด collections, field types, ownership และ migration อยู่ใน [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md)

Firebase Web config ที่ใช้ใน browser เป็น public client configuration ไม่ใช่การป้องกันข้อมูล; การคุ้มครองข้อมูลขึ้นกับ Authentication และ Firestore Rules ส่วน API key ของ AI ที่ผู้ใช้ใส่เก็บใน `localStorage` และไม่ใช่ server secret

## AI และความเป็นส่วนตัว

Browser เรียก provider โดยตรง ไม่มี backend proxy หรือการเก็บคีย์ AI ใน Firestore; ผู้ให้บริการจะได้รับ prompt/ภาพ/ผล tool ที่จำเป็นต่อคำขอ โปรดอ่าน [AI_SERVICE.md](AI_SERVICE.md) ก่อนใส่ข้อมูลส่วนตัว การทดสอบคีย์เป็นคำขอจริงและเกิดเมื่อผู้ใช้กดปุ่ม

## PWA และ offline

`vite.config.js` ตั้งค่า GitHub Pages base path จาก `GITHUB_ACTIONS`, สร้าง manifest, เปิด `registerType: 'autoUpdate'` และให้ Workbox precache assets ตาม `globPatterns` โดยจำกัดขนาดไฟล์ 3 MiB `src/app.js` ลงทะเบียน Service Worker และมีการกู้คืน stale dynamic chunk แบบ refresh จำกัดหนึ่งครั้ง

`public/push-sw.js` รับ Web Share Target POST ของรูปสลิปผ่าน cache ชั่วคราวและจัดการ Push/notification click ส่วน Firestore offline cache เป็นกลไกคนละส่วนกับ Workbox cache การใช้ AI, ค้นหาข้อมูลภายนอก, sign-in ครั้งแรก และการ sync กับ server ต้องใช้อินเทอร์เน็ต

## ตรวจสอบและปรับใช้

การทดสอบและ CI อธิบายไว้ใน [TESTING.md](TESTING.md); GitHub Pages, Firebase Rules และ Web Push deployment อยู่ใน [DEPLOYMENT.md](DEPLOYMENT.md) งาน build ของเว็บไม่ deploy Firestore Rules โดยอัตโนมัติ
