# โครงสร้างข้อมูล Firestore

## ขอบเขตการเข้าถึง

ข้อมูลบัญชีอยู่ใต้ `users/{uid}/{collection}/{recordId}` โดยตรง ไม่มี subcollection ซ้อนในปัจจุบัน ผู้ใช้ที่ล็อกอินอ่าน เขียน และลบได้เฉพาะเอกสารใต้ UID ของตนเอง และเฉพาะ collection ที่ระบุใน `firestore.rules` เท่านั้น

Production Rules จำกัดเอกสารไว้ไม่เกิน 30 ฟิลด์ และตรวจชนิดข้อมูลของฟิลด์ระดับบนสุดที่สำคัญ ได้แก่ วันที่/ชื่อ/หมวด/สถานะ, เวลาแก้ไข, จำนวนเงิน/แคลอรี/ค่าน้ำหนัก และ `done`/`symptoms` การตรวจนี้ไม่ใช่ allowlist ของทุกฟิลด์ และไม่ได้ตรวจโครงสร้างภายในของ map/list; `src/schema.js` ยังคงเป็นแหล่งอ้างอิงของการ sanitize ตอนนำเข้าหรือกู้คืนข้อมูล

## Collections

| Collection | ข้อมูลหลัก | รูปแบบเอกสาร/หมายเหตุ |
|---|---|---|
| `food_records` | วันที่ มื้อ ชื่ออาหาร พลังงานและสารอาหาร ปริมาณ | หนึ่งเอกสารต่อรายการอาหาร; ค้นด้วย `date` |
| `period_records` | วันที่เริ่ม/สิ้นสุด ประจำเดือน และ flow/note | `end` อาจเป็น `null` |
| `body_records` | วันที่ น้ำหนักและสัดส่วน พร้อม note | วันที่และค่าที่บันทึก |
| `symptom_records` | อาการรายวัน mood/stress | ใช้ `YYYY-MM-DD` เป็น document ID |
| `custom_foods` | อาหารกำหนดเองและสารอาหาร | รวมข้อมูลหน่วย/portion และ favorite |
| `skincare_products` | ผลิตภัณฑ์ วันเปิดใช้/หมดอายุ และส่วนผสม | หนึ่งเอกสารต่อผลิตภัณฑ์ |
| `skin_records` | อาการผิวและผลสรุปรายวัน | ใช้ `YYYY-MM-DD` เป็น document ID |
| `ingredient_blacklist` | รายการส่วนผสมที่หลีกเลี่ยง | โดยทั่วไปเป็นเอกสารตั้งค่ารายการเดียว |
| `pet_profiles` | โปรไฟล์สัตว์เลี้ยงและประวัติน้ำหนัก | ประวัติน้ำหนักอยู่ใน list |
| `pet_care_records` | นัดและการดูแลสัตว์เลี้ยง | `date`, `nextDate`, ประเภท และกฎเตือน |
| `pet_food_records` | อาหารสัตว์เลี้ยง ปริมาณ และวันที่ | หนึ่งเอกสารต่อรายการ |
| `tracked_products` | สต๊อก/ของใช้ วันหมดอายุ และการเตือน | ใช้ข้อมูลชนิดเดียวกับสกินแคร์และของใช้ |
| `replacement_records` | ประวัติเปลี่ยนของ/นัดหมาย | รวมกฎเตือนและวันถัดไป |
| `workout_records` | การออกกำลังกายและผลที่ทำจริง | มี sections และ performed sets |
| `workout_templates` | เทมเพลตออกกำลังกาย | มี sections สำหรับท่า |
| `lab_records` | ผลตรวจ วันที่ ค่า หน่วย และช่วงอ้างอิง | หนึ่งเอกสารต่อผลตรวจ |
| `expense_records` | รายรับ/รายจ่าย/โอน | หนึ่งเอกสารต่อรายการ; ID เดิมคงที่เพื่อให้ migration ทำซ้ำได้ |
| `settings` | โปรไฟล์และค่าตั้งค่าที่ซิงค์ | ใช้ document ID แยกประเภทด้านล่าง |

### เอกสารภายใน `settings`

- `profile`: เพศ ปีเกิด ส่วนสูง/น้ำหนัก เป้าหมาย และมื้ออาหาร
- `planner`: routines, doneMap, extras และ anchor ของแผนรายสัปดาห์
- `push`: ข้อมูล Push subscription เฉพาะเครื่อง; ห้ามส่งออกผ่าน backup
- `expense_rules`: กฎ/หมวดรายจ่าย
- `exp_YYYY-MM`: เอกสารค่าใช้จ่ายแบบเก่า เก็บไว้ระหว่าง migration และไม่ใช่ปลายทางใหม่

การรวมหลายกลุ่มไว้ใน `settings` เป็นรูปแบบเดิมที่แยกด้วย document ID; ยังไม่ย้ายไป collection ใหม่ เพราะต้องมี migration/ช่วงรองรับย้อนหลังและยังไม่มีเหตุผลด้านสิทธิ์ที่จำเป็นต้องเปลี่ยน path การย้ายรายจ่ายไป `expense_records` ดำเนินการแยกแล้ว

## การค้นหาและ Index

โค้ดปัจจุบันอ่าน collection ของผู้ใช้โดยตรงสำหรับ backup/โหลดข้อมูล และใช้เงื่อนไข `date == ...` หรือช่วง `date >= ...` และ `date <= ...` สำหรับอาหาร รายงาน อาการ และการออกกำลังกาย ไม่มี query แบบ `orderBy` หรือ composite filter ที่ต้องประกาศ composite index เพิ่มในขณะนี้ จึงยังไม่ต้องมี `firestore.indexes.json`; Firestore ใช้ single-field indexes อัตโนมัติ

หากเพิ่ม query ที่กรองหลายฟิลด์หรือเรียงลำดับ ให้ตรวจ error ที่ Firestore ส่งกลับและเพิ่ม index ที่ตรงกับ query ในไฟล์ index ก่อน deploy

## Migration และความปลอดภัย

- การย้าย Room Code เข้าบัญชีใช้ `firestore.rules.migration` ชั่วคราว ซึ่งอนุญาตให้ **ผู้ใช้ที่ล็อกอินคนใดก็ได้** อ่านและลบเอกสาร legacy ระดับบนสุดใน `food_records`, `period_records` และ `body_records` ได้ กฎนี้ไม่ผูก legacy record กับเจ้าของ จึงมีความเสี่ยงเปิดเผย/ลบข้อมูลข้ามผู้ใช้ในช่วงที่เปิดใช้
- ใช้กฎ migration เฉพาะช่วงสั้นในช่วงควบคุมการย้าย สำรองข้อมูลก่อน และเผยแพร่ `firestore.rules` กลับทันทีเมื่อเสร็จ ห้ามปล่อยกฎ migration ค้างไว้
- ย้าย Room Code ด้วย `src/migrate.js`; ตรวจข้อมูลปลายทางก่อนลบ legacy documents
- ย้ายค่าใช้จ่ายเดิมจาก `settings/exp_YYYY-MM` ไป `expense_records` แบบ idempotent; คงเอกสารเก่าไว้จนการเขียนและตรวจยืนยันสำเร็จ
- การเปลี่ยน Security Rules ใน repository ไม่ได้เผยแพร่ไป Firebase โดยอัตโนมัติ การ deploy Rules หรือ migration ข้อมูล production ต้องได้รับอนุมัติและทำตามขั้นตอนปฏิบัติการแยกต่างหาก

## การทดสอบ Rules

รัน `npm run test:rules` (ต้องมี Node.js 24.12+ และ Java 21+) เพื่อเริ่ม Firestore Emulator และทดสอบการเข้าถึงของเจ้าของ, การปฏิเสธ cross-user/collection ที่ไม่รู้จัก, ownership field, ชนิดข้อมูล และขนาดเอกสาร การทดสอบนี้ใช้ project ID สำหรับ emulator เท่านั้นและไม่เชื่อมต่อ production.
