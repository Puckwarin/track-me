# โครงสร้างข้อมูล Firestore

## ขอบเขตการเข้าถึง

ข้อมูลบัญชีอยู่ใต้ `users/{uid}/{collection}/{recordId}` โดยตรง ไม่มี subcollection ซ้อนในปัจจุบัน ผู้ใช้ที่ล็อกอินเข้าถึงได้เฉพาะเอกสารใต้ UID ของตนเองและ collection ที่ระบุใน `firestore.rules`; `runtime_error_logs` เป็น path พิเศษที่อนุญาตสร้างได้อย่างเดียว

Production Rules อนุญาต read/delete เฉพาะเจ้าของใน collection ที่รู้จัก; create/update เฉพาะเจ้าของ, จำกัดเอกสารไม่เกิน 30 fields และตรวจชนิดข้อมูลของ common fields ระดับบนสุด เช่น วันที่/ชื่อ/หมวด/สถานะ, timestamp/string สำหรับเวลา, ตัวเลข, boolean และ map `uid` ถ้ามีต้องตรงกับ UID ใน path.

กฎนี้ไม่ใช่ allowlist ของทุกฟิลด์, ไม่ตรวจ required fields หรือโครงสร้างภายในของ map/list อย่างครบถ้วน และไม่ใช่การตรวจความถูกต้องเชิงธุรกิจ; `src/schema.js` sanitize ตอน import/restore/migration. `runtime_error_logs` มีกฎแยกที่ตรวจ field allowlist, category/source/code และเวลา; client สร้างได้อย่างเดียว.

## Collections และ field types

วันที่ที่ใช้ค้นหา/เป็น document ID เก็บเป็น string รูปแบบ `YYYY-MM-DD`; `createdAt`/`updatedAt` ส่วนใหญ่เป็น Firestore Timestamp (Rules รองรับ string สำหรับข้อมูลเดิมบางส่วน) ตัวเลขเป็น `number`/integer ตามความหมาย, ค่าที่ไม่ได้ระบุอาจเป็น `null` หรือไม่มี field. ตารางแสดงฟิลด์หลัก ไม่ใช่ allowlist ครบทุกฟิลด์; sanitizer ของ collection ใน `src/schema.js` เป็นรายละเอียดสำรอง/กู้คืนที่แน่นอนกว่า.

| Collection | Fields หลักและชนิด | รูปแบบเอกสาร/หมายเหตุ |
|---|---|---|
| `food_records` | `date`, `meal`, `name`: string; `calories`, `protein`, `carbs`, `fat`, `quantity`: number; `unitNutrition`: map; `createdAt`: timestamp | หนึ่งเอกสารต่อรายการอาหาร; มี portion/weight optional; ค้นด้วย `date` |
| `period_records` | `start`: string; `end`: string/null; `flow`, `note`: string; `createdAt`: timestamp | ช่วงประจำเดือนหนึ่งรายการต่อเอกสาร |
| `body_records` | `date`: string; `weight`, `bust`, `waist`, `hip`, `arm`, `thigh`, `sleepMinutes`, `deepMinutes`, `lightMinutes`, `remMinutes`, `sleepScore`, `steps`, `distanceKm`, `activeKcal`: number/null; `sleepBedTime`, `sleepWakeTime`, `source`, `note`: string; `createdAt`, `updatedAt`: timestamp | ใช้เก็บทั้งสัดส่วนร่างกายและการนอน/ก้าวเดิน (เช่น `zepp_YYYY-MM-DD`, `source`: `manual` / `zepp` / `zepp_csv` / `zepp_ai` / `zepp_scan`) โดยตรวจ `validCalendarDate` |
| `symptom_records` | `date`: string; `symptoms`: map ของ integer 0–3; `mood`, `stress`: integer 1–5; `note`: string; `updatedAt`: timestamp | ใช้ `YYYY-MM-DD` เป็น document ID |
| `custom_foods` | `name`, `brand`, `unit`, `category`: string; สารอาหาร/portion: number; `favorite`: boolean; `hiwpinto`: map; `createdAt`: timestamp | อาหารกำหนดเองและข้อมูล portion |
| `skincare_products` | `name`, `ingredients`, `pros`, `cons`: string; `openedDate`, `expiryDate`: string/null; `paoMonths`: integer/null; `createdAt`: timestamp | หนึ่งเอกสารต่อผลิตภัณฑ์ |
| `skin_records` | `date`: string; `symptoms`: map ของ integer 0–3; `result`: string; `updatedAt`: timestamp | ใช้วันที่เป็น document ID |
| `ingredient_blacklist` | `ingredients`: string; `updatedAt`: timestamp | โดยทั่วไปเป็นเอกสารตั้งค่ารายการเดียว |
| `pet_profiles` | `name`, `kind`, `lifeStage`: string; `birthDate`: string/null; `weightKg`: number; `weightHistory`: array ของ `{date: string, weightKg: number}`; timestamps | โปรไฟล์สัตว์เลี้ยงและประวัติน้ำหนัก |
| `pet_care_records` | `petId`, `type`, `category`, `recordKind`: string; `date`, `nextDate`: string/null; `dueTime`: string; `done`: boolean; `rule`, `symptoms`: map; `value`: number/null; `createdAt`, `updatedAt`: timestamp | นัด/การดูแลสัตว์เลี้ยง และบันทึกอาการรายวัน (`recordKind: 'symptom'` พร้อม `symptoms` 0–3 และอุณหภูมิ °C `value`) |
| `pet_food_records` | `petId`, `name`, `allergy`, `note`: string; `date`: string; `grams`, `kcalPer100`: number; `createdAt`: timestamp | หนึ่งเอกสารต่อรายการอาหารสัตว์เลี้ยง |
| `tracked_products` | `name`, `category`, `unit`: string; `quantity`, `lowAt`: number; วันที่เปิด/หมดอายุ: string/null; `lowDismissed`: boolean; timestamps | สต๊อก/ของใช้และการเตือน |
| `replacement_records` | `name`, `category`: string; `date`, `nextDate`: string/null; `repeatMonths`, `intervalDays`, `remindDays`: number; `done`: boolean; `rule`: map; timestamps | ประวัติเปลี่ยนของและนัดหมาย |
| `workout_records` | `date`, `type`, `status`, `feeling`: string; `durationMin`, `estKcal`, `volumeKg`, `sessionRpe`: number; `sections`: map ของ arrays; `performedSets`, `exerciseFeedback`: array ของ maps; timestamps | แผน ผลที่ทำจริง และการประเมิน RPE/RIR หลังออกกำลังกาย |
| `workout_templates` | `name`, `type`, `muscleGroup`: string; `durationMin`: number/null; `sections`: map ของ arrays; `createdAt`: timestamp | เทมเพลตและท่าออกกำลังกาย |
| `lab_records` | `date`, `name`, `unit`, `note`: string; `value`, `refLow`, `refHigh`: number/null; `createdAt`: timestamp | หนึ่งเอกสารต่อผลตรวจ |
| `expense_records` | `type`, `category`, `merchant`, `note`: string; `amount`: positive number; `date`: string; `time`: string/null; `source`: string (`manual`, `slip_ocr`, `statement`, `recurring`); `createdAt`: timestamp หรือ ISO string | หนึ่งเอกสารต่อรายรับ/รายจ่าย/โอน; ID เดิมคงที่เพื่อให้ migration ทำซ้ำได้ |
| `settings` | fields ขึ้นกับ document ID; โปรไฟล์ใช้ strings/numbers/arrays; Planner ใช้ arrays/maps; งบ/กฎ/รายการประจำใช้เอกสารแบบมี `kind` | ดู document IDs ด้านล่าง |
| `runtime_error_logs` | `category`, `source`, `code`: string; `occurredAt`, `receivedAt`: timestamp | เจ้าของสร้างได้เท่านั้น; แอปอ่าน/แก้ไข/ลบไม่ได้ |

### เอกสารภายใน `settings`

- `profile`: เพศ ปีเกิด ส่วนสูง/น้ำหนัก เป้าหมาย และมื้ออาหาร
- `planner`: routines, doneMap, extras และ anchor ของแผนรายสัปดาห์
- `push`: ข้อมูล Push subscription เฉพาะเครื่อง; ห้ามส่งออกผ่าน backup
- `expense_rules`: กฎหมวดหมู่แบบ legacy; ยังอ่านได้เพื่อรองรับข้อมูลเดิม
- `expense_rule_{hash}`: `{kind: 'expense_rule', keyword, category, updatedAt}`; กฎจาก manual expense และ Statement import แยกเอกสารต่อ keyword เพื่อหลีกเลี่ยงเขียนทับรายการอื่นจากข้อมูล stale
- `expense_budget_{hash}`: `{kind: 'expense_budget', category, amount, updatedAt}`; งบต่อหมวดใช้เทียบกับรายจ่ายของเดือนที่เลือก
- `expense_recurring_{hash}`: `{kind: 'expense_recurring', planId, merchant, amount, category, frequency, nextDate, dayOfMonth, note, createdAt, updatedAt}`; `frequency` เป็น `monthly` หรือ `yearly` และการสร้าง `expense_records` ต้องยืนยันจากผู้ใช้
- `note_{id}`: `{kind: 'assistant_note', title, content, tags, pinned, source, createdAt, updatedAt}`; โน้ตส่วนตัวที่จดผ่าน AI Assistant หรือหน้าต่างโน้ต
- `feedback_{id}`: `{kind: 'user_feedback', category, message, rating, context, source, status, createdAt, updatedAt}`; ข้อเสนอแนะ/รายงานปัญหาจากผู้ใช้
- `exp_YYYY-MM`: เอกสารค่าใช้จ่ายแบบเก่า เก็บไว้ระหว่าง migration และไม่ใช่ปลายทางใหม่

การรวมหลายกลุ่มไว้ใน `settings` เป็นรูปแบบเดิมที่แยกด้วย document ID; ยังไม่ย้ายไป collection ใหม่ เพราะต้องมี migration/ช่วงรองรับย้อนหลังและยังไม่มีเหตุผลด้านสิทธิ์ที่จำเป็นต้องเปลี่ยน path การย้ายรายจ่ายไป `expense_records` ดำเนินการแยกแล้ว

`settings/profile` มี `sex`/`activity` เป็น string, `birthYear` เป็น integer, ค่าร่างกาย/เป้าหมายเป็น number, `meals` เป็น array ของ `{id, name}` และ `updatedAt` เป็น timestamp. `settings/planner` มี `routines` เป็น array (รองรับ `weekPattern`: `'every' | 'A' | 'B' | 'once'` และ `date` สำหรับกิจวัตรวันเดียวไม่ซ้ำ), `doneMap`/`extras` เป็น map ตามวันที่, `recentDone` เป็น array ของกิจวัตรที่ทำล่าสุด (สูงสุด 40 รายการ สำหรับสรุป 10 รายการล่าสุดไม่ซ้ำ) และ `altAnchor` เป็น string วันที่. `settings/push` อาจมี `enabled`/`hideDetails` เป็น boolean, `subscriptions` เป็น array ของ endpoint/key maps และค่าการเตือน; จึงไม่รวมใน backup. เอกสารตั้งค่ารายจ่าย (`expense_rule_*`, `expense_budget_*`, `expense_recurring_*`) รวมถึง `note_*` และ `feedback_*` ถูก sanitize และสำรอง/กู้คืนตาม document ID ที่ผ่าน allowlist; Push ยังคงถูกตัดออกเสมอ.

สถานะ onboarding (`step`, `in_progress`/`completed`) และประวัติ/บทบาทของ AI Chat (`trackme_ai_chat_history`, `trackme_ai_chat_role`, `trackme_ai_chat_custom_role`) เก็บใน `localStorage` เฉพาะเบราว์เซอร์/อุปกรณ์นั้น ไม่ได้สร้าง collection หรือเอกสาร Firestore เพิ่ม.

## ความสัมพันธ์ระหว่างเอกสาร

- ทุก collection เชื่อมกับเจ้าของผ่าน `users/{uid}`; Rules ไม่อนุญาตให้ client กำหนด `uid` ข้ามเจ้าของ
- `food_records.mealId` เชื่อมเชิงตรรกะกับ `settings/profile.meals[].id`
- `pet_care_records.petId` และ `pet_food_records.petId` อ้างถึง `pet_profiles` document ID
- `rule.linkedId`, `rule.linkedCol` และ `rule.linkedQuery` ในรายการเตือนใช้เชื่อมรายการที่เกี่ยวข้องในแอป
- ระบบไม่ได้บังคับ foreign key หรือ cascade delete ระหว่างเอกสาร; การลบ/แก้ไขเอกสารที่อ้างถึงกันต้องดูแลโดยฟีเจอร์ที่เกี่ยวข้อง

## การค้นหาและ Index

โค้ดปัจจุบันอ่าน collection ของผู้ใช้โดยตรงสำหรับ backup/โหลดข้อมูล และใช้เงื่อนไข `date == ...` หรือช่วง `date >= ...` และ `date <= ...` สำหรับอาหาร รายงาน อาการ และการออกกำลังกาย ไม่มี query แบบ `orderBy` หรือ composite filter ที่ต้องประกาศ composite index เพิ่มในขณะนี้ จึงยังไม่ต้องมี `firestore.indexes.json`; Firestore ใช้ single-field indexes อัตโนมัติ

หากเพิ่ม query ที่กรองหลายฟิลด์หรือเรียงลำดับ ให้ตรวจ error ที่ Firestore ส่งกลับและเพิ่ม index ที่ตรงกับ query ในไฟล์ index ก่อน deploy

## Migration และความปลอดภัย

- การย้าย Room Code เข้าบัญชีใช้ `firestore.rules.migration` ชั่วคราว ซึ่งอนุญาตให้ **ผู้ใช้ที่ล็อกอินคนใดก็ได้** อ่านและลบเอกสาร legacy ระดับบนสุดใน `food_records`, `period_records` และ `body_records` ได้ กฎนี้ไม่ผูก legacy record กับเจ้าของ จึงมีความเสี่ยงเปิดเผย/ลบข้อมูลข้ามผู้ใช้ในช่วงที่เปิดใช้
- ใช้กฎ migration เฉพาะช่วงสั้นในช่วงควบคุมการย้าย สำรองข้อมูลก่อน และเผยแพร่ `firestore.rules` กลับทันทีเมื่อเสร็จ ห้ามปล่อยกฎ migration ค้างไว้
- ย้าย Room Code ด้วย `src/migrate.js`; ตรวจข้อมูลปลายทางก่อนลบ legacy documents
- ย้ายค่าใช้จ่ายเดิมจาก `settings/exp_YYYY-MM` ไป `expense_records` แบบ idempotent; คงเอกสารเก่าไว้จนการเขียนและตรวจยืนยันสำเร็จ
- การเปลี่ยน Security Rules ใน repository ไม่ได้เผยแพร่ไป Firebase โดยอัตโนมัติ การ deploy Rules หรือ migration ข้อมูล production ต้องได้รับอนุมัติและทำตามขั้นตอนปฏิบัติการแยกต่างหาก
- `runtime_error_logs` รับเฉพาะ category/source/code ที่อยู่ใน allowlist และ timestamp; ไม่เก็บข้อความหรือ stack trace และไม่มีสิทธิ์อ่าน/แก้ไข/ลบจาก client ดูข้อจำกัดการส่งและการเก็บรักษาใน [docs/TESTING.md](TESTING.md)

## การทดสอบ Rules

รัน `npm run test:rules` (ต้องมี Node.js 24.12+ และ Java 21+) เพื่อเริ่ม Firestore Emulator และทดสอบการเข้าถึงของเจ้าของ, การปฏิเสธ cross-user/collection ที่ไม่รู้จัก, ownership field, ชนิดข้อมูล, ขนาดเอกสาร และ write-only runtime error logs การทดสอบนี้ใช้ project ID สำหรับ emulator เท่านั้นและไม่เชื่อมต่อ production.
