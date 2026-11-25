# AI Service

เอกสารนี้อธิบายระบบ AI Service ที่ใช้ร่วมกันใน `src/services/aiService.js` และ consumer หลักใน `src/nutrition.js` กับ `src/services/aiAssistant.js`

## ขอบเขตความรับผิดชอบ

AI Service กลางดูแล:

- การเรียก Gemini, Groq และ OpenRouter รวมถึง model discovery
- การเลือกโมเดลให้เหมาะกับข้อความ ภาพ หรือ tool calling
- การจัดการ timeout, `AbortSignal`, retry, error normalization และ quota cooldown
- การ fallback ตามลำดับ provider ที่ consumer กำหนด
- การ deduplicate คำขอที่ปลอดภัยและ cache รายชื่อโมเดลชั่วคราว

Consumer ยังคงเป็นเจ้าของ prompt, schema, รูปแบบคำตอบ และวงจร function/tool calling ของแต่ละฟีเจอร์ จึงไม่เปลี่ยน response shape ที่ฟีเจอร์เหล่านั้นคาดหวัง

## Provider และการเลือกโมเดล

- **Gemini**: เรียก model-list endpoint แล้วเลือกเฉพาะโมเดลที่รองรับ `generateContent` และตรงกับประเภทงาน (`nutrition`, `chat`, `fast`, `complex`, `deep`) โดยจับคู่บทบาทแชทกับ candidate ดังนี้:
  - `chat` (คุยทั่วไป): `gemini-4-hydrogen` → `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`
  - `fast` (ตอบไว): `gemini-3.1-flash-lite` → `gemini-3.8-flash` → `gemini-4-hydrogen` → `gemini-3.5-flash-lite`
  - `complex` (โค้ชสุขภาพ / วางแผน & เงิน): `gemini-4-argon` → `gemini-4-hydrogen` → `gemini-3.8-flash` → `gemini-3.6-flash`
  - `deep` (วิเคราะห์ลึก): `gemini-4-carbon` → `gemini-4-argon` → `gemini-4-hydrogen` → `gemini-3.8-flash`
  - สำหรับโมเดลตระกูล `gemini-4-*` ระบบจะไม่ส่งพารามิเตอร์ที่โมเดลไม่รองรับ (`temperature`, `thinkingBudget`) และหากโมเดลระดับสูง (`gemini-4-carbon` / `gemini-4-argon`) ตอบกลับ 403/404 จากข้อจำกัดสิทธิ์ของคีย์ จะ fallback ไปยังโมเดลถัดไปอย่าง `gemini-4-hydrogen` อัตโนมัติ (หากค้นหารายชื่อไม่ได้เพราะปัญหาเครือข่าย จะใช้ candidate ที่กำหนดไว้; หากคีย์ผิดหรือโควตาเต็ม จะไป provider ถัดไป)
- **Groq**: ค้นรายชื่อโมเดลจาก API แล้วเลือกโมเดลข้อความหรือ vision ที่เข้ากันได้ (รวมทั้งตระกูล `llama-4-scout`, `llama-4-maverick` และ `llama-3.2-*vision*`) โดยมี candidate สำรองเมื่อค้นรายชื่อไม่ได้เพราะเครือข่าย
- **OpenRouter**: เลือกเฉพาะโมเดลฟรีที่รับข้อความ และกรองเพิ่มตามความต้องการ เช่น ภาพหรือ `tools`
- รายชื่อโมเดลถูก cache ในหน่วยความจำ 5 นาที; ไม่ cache ผลลัพธ์ส่วนตัวจาก AI

ลำดับ fallback ของ consumer ที่ใช้ `runProviderFallback` คือ **Gemini → Groq → OpenRouter** โดยข้าม provider ที่ไม่มีคีย์หรือติด cooldown อยู่ ไม่ใช่ทุก API request จะ fallback โดยอัตโนมัติ; consumer แต่ละตัวกำหนดลำดับและประเภทโมเดลของงานเอง งานสแกนรูปอาหารมี pipeline ก่อนเข้าสู่ AI: **BarcodeDetector + Open Food Facts → OCR ฉลากในเครื่อง (`tesseract.js`) → AI** (ยอมรับผล OCR ในเครื่องเมื่ออ่านค่าหลัก `calories`, `protein`, `carbs`, `fat` ได้อย่างน้อย 3 จาก 4 ค่าผ่าน `isLocalNutritionSufficient()` และคง warm OCR worker ไว้ 60 วินาทีเพื่อลดเวลาโหลดซ้ำ) และงานค้นหาโภชนาการมี pipeline ก่อนเข้าสู่ AI: **คลังในเครื่อง → USDA (cache ภาษาอังกฤษ) → Open Food Facts → แคช AI ในเครื่อง / AI**.

## AI Chat Assistant (`src/services/aiAssistant.js`, `src/services/localAssistant.js`, `src/services/chatRoles.js`, `src/chatWidget.js`)

- **โหมด 0 โทเค็นในเครื่อง (`⚡ แพตเทิร์น (0 โทเค็น)` และ Local-first routing):**
  - จดรายจ่าย/รายรับ (`จดค่ากาแฟ 60 บาท`, `จดรายรับ โบนัส 5000 บาท`), ปรับสต๊อก (`ใช้ทิชชู่ไป 1`, `เติมทิชชู่ 4`), บันทึกอาหารจากคลังในเครื่องหรือค่าแคล/มาโครที่ระบุตรงๆ (`จดมื้อเช้า ไข่ต้ม 2 ฟอง`), ตั้งเตือนด้วย `parseSmartReminder`, จดโน้ต/ส่ง Feedback และเช็กสรุป (การเงิน สต๊อก นัด/แผน โภชนาการ ออกกำลังกาย น้ำหนัก/นอน/ก้าวเดิน) ได้ในเบราว์เซอร์ทันที **โดยไม่เรียก AI และไม่ต้องใช้ API Key** (ยังคงการ์ดยืนยันความเสี่ยงสูง เช่น ยอด `>= 1,000 บาท`)
  - ในหน้าตั้งค่าบทบาท (`sliders`) เปิดใช้ **“ใช้แพตเทิร์นในเครื่องก่อนเรียก AI”** เป็นค่าเริ่มต้น และสลับกลับไปถาม-ตอบอิสระกับ AI ได้ตลอดเวลา
- รองรับทั้งบทสนทนาทั่วไปทุกหัวข้อและ Function Calling กับข้อมูล Track Me เมื่อเรียก AI:
  - **Read Tools (7 ตัว):** `getExpenses`, `getInventory`, `getNutritionSummary`, `getRemindersAndPlanner`, `getWorkouts`, `getBodyAndWellness` (รวม `sleepAndStepsSummary` และ `petSymptomSummary`), `getNotes`
  - **Write Tools (6 ตัว):** `addExpense`, `addFoodLog`, `updateInventory`, `addReminder`, `saveNote`, `submitFeedback`
  - โดย `getWorkouts` ส่งค่า `intensity`/`intensityLabel`, `mainCompletedSetCount`, `durationMin`, `completionStatus`/`completionStatusLabel`, `effortLevel`/`effortLabel`, `postSymptom`/`postSymptomLabel`, `nextDayRecovery`/`nextDayRecoveryLabel`, `nextDayRecoveryDate`, `feeling`/`feelingLabel` (legacy), `sessionRpe`, `reflectionNote`, `avgSessionRpe`, `intensitySummary`, `completionSummary`/`effortSummary`/`symptomSummary`/`recoverySummary` และ `exerciseFeedback` (`rpe`, `rir`, `nextAction`, `nextLabel` เฉพาะท่าหลัก) เพื่อใช้วิเคราะห์การปรับระดับและฟื้นตัว และโน้ต/Feedback เก็บใน `settings/note_*` กับ `settings/feedback_*` พร้อมหน้าต่างดู/จัดการผ่านปุ่ม `📝`
- ปรับ `buildSystemPrompt()` และ `CHAT_ROLES` ให้กระชับ, เพิ่ม `shouldAttachToolsForTurn()` เพื่อแนบ Tool declarations เฉพาะบทบาทโค้ช/วางแผน หรือข้อความ/บริบทล่าสุดที่เกี่ยวกับข้อมูล Track Me เท่านั้น, และเพิ่ม `normalizeFoodName()` ตัดหน่วยน้ำหนัก/ปริมาตร (`150g`, `120 กรัม`, `250 มล.`) ก่อนเทียบกับคลังอาหารในเครื่องเพื่อลดการเรียก AI ซ้ำ
- ส่งหน้าต่างสนทนาต่อเนื่องย้อนหลังสูงสุด 12 ข้อความต่อคำขอ (`HISTORY_LIMIT = 12`) พร้อมบทบาทที่เลือกและคำสั่งเพิ่มเติมที่ผู้ใช้กำหนด
- ป้องกัน Prompt Injection ด้วย `sanitizeDataText()` (รวมการตัด tag ปลอม `[DATA_START]` / `[DATA_END]`), `wrapDataBoundary()`, `wrapUntrustedToolData()` และ `formatToolOutcomeForModel()` เพื่อครอบผลลัพธ์จาก Firestore/Read Tools ใน `[DATA_START]` ... `[DATA_END]` ก่อนส่งเข้า Gemini, Groq และ OpenRouter พร้อมบังคับการ์ดยืนยันจากผู้ใช้สำหรับรายการยอดสูงหรือการเขียนหลายรายการพร้อมกัน และใน `executeConfirmedAction()` / `undoAssistantAction()` จะรอการยืนยันจาก Firestore (หรือรองรับคิวรอซิงค์เมื่อออฟไลน์) พร้อม rollback state หากเขียนไม่สำเร็จ
- บันทึกประวัติแชทล่าสุด (สูงสุด 30 ข้อความ), บทบาทที่เลือก, การตั้งค่าใช้แพตเทิร์นในเครื่อง และคำสั่งเพิ่มเติมไว้ใน `localStorage` ของเบราว์เซอร์เครื่องนั้น (`trackme_ai_chat_history`, `trackme_ai_chat_role`, `trackme_ai_chat_prefer_local`, `trackme_ai_chat_custom_role`) โดยไม่ซิงค์ลง Firestore และล้างออกได้ด้วยปุ่มเริ่มบทสนทนาใหม่


## Quota, retry และ cooldown

- ตรวจจับ HTTP 429, สถานะที่สื่อถึง quota/rate limit และ Gemini `RESOURCE_EXHAUSTED`
- อ่าน `Retry-After` และ Google `RetryInfo` ถ้ามี; หากไม่มี ใช้ค่าเริ่มต้น 60 วินาที
- **แยก Cooldown รายโมเดลและราย Provider:** ใน flow ที่ลองหลายโมเดล (`aiService.js`, `nutrition.js`, `aiAssistant.js`) ระบบบันทึก cooldown แยกตามรายโมเดล (`rememberModelCooldown`, `getModelCooldownMs`, `clearModelCooldown`) ใน `localStorage` ดังนั้นหากโมเดลหนึ่งเต็มโควตา (เช่น `gemini-3.8-flash` ครบ 20 req/วัน) ระบบจะข้ามเฉพาะโมเดลนั้นแล้วลองโมเดลอื่นใน provider เดียวกันต่อจนกว่าทุกโมเดลของ provider นั้นจะใช้ไม่ได้จึงสลับไป provider ถัดไป และยังคงจำ cooldown ของโมเดลที่เต็มไว้แม้โมเดลสำรองใน provider เดียวกันจะตอบสำเร็จ (ล้างทั้งหมดเฉพาะเมื่อเปลี่ยน/ล้าง API key)
- เวลาสูงสุดที่บันทึก cooldown คือ 24 ชั่วโมง
- ไม่ส่งคำขอไป provider หรือโมเดลที่ยังติด cooldown อยู่
- retry เฉพาะ temporary/server/network failures แบบจำกัดจำนวน (ค่าเริ่มต้นไม่เกิน 1 ครั้ง) พร้อม exponential backoff และ jitter; ไม่มี retry วนไม่สิ้นสุด
- timeout ปกติของคำขอ AI คือ 35 วินาที; model discovery ใช้ timeout 10 วินาที
- การยกเลิกผ่าน `AbortSignal` จะหยุดคำขอและไม่ fallback ไป provider อื่น

## Request management

- การค้นหารายชื่อโมเดลที่ไม่มี `AbortSignal` จะรวมคำขอที่กำลังทำงานเดียวกันและ cache ผลลัพธ์ชั่วคราว; เมื่อมี signal จะไม่แชร์คำขอ เพื่อให้ยกเลิกได้โดยไม่กระทบ consumer อื่น
- `lookupPer100g` / `lookupPer100gWithProvider` deduplicate คำขอชื่ออาหารเดียวกันเมื่อไม่มี `AbortSignal` และบันทึกผลลัพธ์มาตรฐานต่อ 100 กรัมไว้ใน `localStorage` (`trackme_nutrition_v1`, TTL 30 วัน, จำกัด 300 รายการ) พร้อมคืน `provider: 'cache'` เมื่อพบในแคช
- `searchUsda`, `searchOff` และ `barcodeOff` บันทึกผลค้นหาไว้ใน `localStorage` (`trackme_foodsearch_v1`, TTL 7 วัน, จำกัด 60 รายการ) โดย `searchUsda` ใช้คีย์ภาษาอังกฤษที่แปลแล้วผ่าน `usdaCacheKey()` เพื่อให้คำค้นภาษาไทยและอังกฤษใช้แคชร่วมกันได้; และ `findExerciseImage` แคชผลจับคู่รูปท่าออกกำลังกายใน `trackme_eximg_v1` (สูงสุด 300 รายการ)
- ไม่ deduplicate AI Chat/function calls และไม่ cache ผลลัพธ์ AI ที่มีข้อมูลส่วนตัวของผู้ใช้
- ปิดหน้าต่าง AI Chat จะยกเลิกคำขอที่กำลังทำงาน

## การตั้งค่าและความเป็นส่วนตัว

ใส่คีย์ Gemini, Groq หรือ OpenRouter ได้ใน onboarding หรือหน้า **ตั้งค่า → คีย์เชื่อมต่อ**; USDA key เป็นตัวเลือกแยกในหน้าเดียวกัน ปุ่ม **ทดสอบการเชื่อมต่อ** ส่งคำขอไปยัง provider จริง จึงควรกดเมื่อยอมให้ทดสอบเท่านั้น คีย์เก็บใน `localStorage` ของ browser/อุปกรณ์นั้น ไม่ซิงค์ผ่าน Firestore และไม่รวมในไฟล์สำรอง; ต้องตั้งค่าใหม่ในแต่ละอุปกรณ์ การล้าง site data อาจลบคีย์และ cooldown ที่จำไว้

โควตาฟรี, model access และราคาเปลี่ยนได้ตาม provider; การทดสอบหรือใช้งานอาจใช้โควตาและอาจมีค่าใช้จ่ายตามบัญชี/เงื่อนไขบริการ ตรวจราคาและนโยบาย data usage ของ provider เองก่อนใช้งาน แอปไม่มีการควบคุม billing หรือสร้างคีย์ให้แทนผู้ใช้

ปัจจุบัน browser เรียก API ของ provider โดยตรง ดังนั้นคีย์ที่เก็บฝั่ง client **ไม่ใช่ secret ที่ปลอดภัยจากผู้ใช้เครื่องหรือ script ที่ทำงานใน origin เดียวกัน**. Prompt, รูปภาพที่ส่งวิเคราะห์ และผลจาก tools ที่จำเป็นต่อคำถามจะถูกส่งไปยัง provider ที่กำลังทำงาน โปรดตรวจนโยบายของ provider และอย่าใส่ข้อมูลที่ไม่ต้องการส่งออกภายนอก

การย้ายคีย์ไป backend ที่ควบคุมสิทธิ์และโควตาได้ปลอดภัยกว่าจะต้องมีการออกแบบ/ตั้งค่า server, secret management และการ deploy เพิ่มเติม; Phase นี้ยังไม่ย้าย backend หรือเปลี่ยนการตั้งค่าของ production.

## การทดสอบ

ทดสอบแบบ unit ด้วย mock API โดยไม่เรียกบริการ AI จริง; ค่า API keys จริงไม่จำเป็น:

```bash
npm test
npm run test:coverage
```

คำสั่งเหล่านี้รวม tests ใน `src/services/aiService.test.js`, `src/services/aiAssistant.test.js`, `src/services/localAssistant.test.js`, `src/nutrition.test.js`, `src/foodsearch.test.js` และ `src/exerciseMedia.test.js`; `npm run test:rules` แยกทดสอบ Firestore Emulator ไม่ได้เรียก AI. Build เพื่อตรวจ production bundle:

```bash
npm run build
```
