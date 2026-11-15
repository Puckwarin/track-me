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

- **Gemini**: เรียก model-list endpoint แล้วเลือกเฉพาะโมเดลที่รองรับ `generateContent` และตรงกับประเภทงาน หากค้นหารายชื่อไม่ได้เพราะปัญหาเครือข่าย จะใช้ candidate ที่กำหนดไว้ใน service; หากเป็นคีย์ผิดหรือโควตาเต็ม จะส่ง error ต่อเพื่อหยุดเรียก Gemini และไป provider ถัดไป
- **Groq**: ค้นรายชื่อโมเดลจาก API แล้วเลือกโมเดลข้อความหรือ vision ที่เข้ากันได้ โดยมี candidate สำรองเมื่อค้นรายชื่อไม่ได้เพราะเครือข่าย
- **OpenRouter**: เลือกเฉพาะโมเดลฟรีที่รับข้อความ และกรองเพิ่มตามความต้องการ เช่น ภาพหรือ `tools`
- รายชื่อโมเดลถูก cache ในหน่วยความจำ 5 นาที; ไม่ cache ผลลัพธ์ส่วนตัวจาก AI

ลำดับ fallback ของ consumer ที่ใช้ `runProviderFallback` คือ **Gemini → Groq → OpenRouter** โดยข้าม provider ที่ไม่มีคีย์หรือติด cooldown อยู่ ไม่ใช่ทุก API request จะ fallback โดยอัตโนมัติ; consumer แต่ละตัวกำหนดลำดับและประเภทโมเดลของงานเอง งานค้นหาโภชนาการมี pipeline ก่อนเข้าสู่ AI: **คลังในเครื่อง → USDA → Open Food Facts → AI**.

## Quota, retry และ cooldown

- ตรวจจับ HTTP 429, สถานะที่สื่อถึง quota/rate limit และ Gemini `RESOURCE_EXHAUSTED`
- อ่าน `Retry-After` และ Google `RetryInfo` ถ้ามี; หากไม่มี ใช้ค่าเริ่มต้น 60 วินาที
- cooldown เก็บเป็น timestamp แยกตาม provider ใน `localStorage` เพื่อจำสถานะระหว่าง reload ของ browser เดิม; เวลาสูงสุดที่บันทึกคือ 24 ชั่วโมง
- ไม่ส่งคำขอไป provider ที่ยังติด cooldown; เมื่อพบ quota ระหว่างลองโมเดลจะหยุด provider นั้นทันทีแล้ว fallback ต่อ
- retry เฉพาะ temporary/server/network failures แบบจำกัดจำนวน (ค่าเริ่มต้นไม่เกิน 1 ครั้ง) พร้อม exponential backoff และ jitter; ไม่มี retry วนไม่สิ้นสุด
- timeout ปกติของคำขอ AI คือ 35 วินาที; model discovery ใช้ timeout 10 วินาที
- การยกเลิกผ่าน `AbortSignal` จะหยุดคำขอและไม่ fallback ไป provider อื่น

## Request management

- การค้นหารายชื่อโมเดลที่ไม่มี `AbortSignal` จะรวมคำขอที่กำลังทำงานเดียวกันและ cache ผลลัพธ์ชั่วคราว; เมื่อมี signal จะไม่แชร์คำขอ เพื่อให้ยกเลิกได้โดยไม่กระทบ consumer อื่น
- `lookupPer100g` deduplicate คำขอชื่ออาหารเดียวกันเมื่อไม่มี `AbortSignal`; คำขอที่มี signal แยกกันไม่แชร์การยกเลิก
- ไม่ deduplicate AI Chat/function calls และไม่ cache ผลลัพธ์ AI ที่มีข้อมูลผู้ใช้
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

คำสั่งเหล่านี้รวม tests ใน `src/services/aiService.test.js`; `npm run test:rules` แยกทดสอบ Firestore Emulator ไม่ได้เรียก AI. Build เพื่อตรวจ production bundle:

```bash
npm run build
```
