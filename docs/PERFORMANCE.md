# รายงานผลการปรับประสิทธิภาพ — PHASE 2

## วิธีวัด

เปรียบเทียบผล `npm run build` บน Vite version เดียวกัน โดยใช้ขนาด JavaScript หลักหลัง minify, ขนาด gzip จาก build output และจำนวน/ขนาด precache ที่ Vite PWA สร้างให้ Workbox ค่าเป็นผลจาก build ไม่ใช่การวัดเวลาโหลดบนอุปกรณ์จริง

## ผลเปรียบเทียบ

| รายการ | ก่อน Phase 2 | หลัง Phase 2 | เปลี่ยนแปลง |
|---|---:|---:|---:|
| JavaScript หลัก (minified) | 1,408.21 kB | 1,286.75 kB | ลด 121.46 kB (ประมาณ 8.6%) |
| JavaScript หลัก (gzip) | 371.07 kB | 335.02 kB | ลด 36.05 kB (ประมาณ 9.7%) |
| PWA precache | 29 รายการ / 3,959.05 KiB | 34 รายการ / 3,962.79 KiB | เพิ่ม 5 รายการ / 3.74 KiB |

ไฟล์ `reports`, `workout`, `workoutActive`, `aiAssistant` และ Tesseract ถูกแยกเป็น chunk ที่โหลดเมื่อเรียกใช้ตามฟีเจอร์ แทนการรวมทั้งหมดไว้ใน JavaScript entry หลัก การแยก Tesseract ทำให้ OCR ไม่ต้องโหลดจนกว่าจะเริ่มอ่านสลิปหรือฉลาก

## PWA และ offline

ยังคงใช้ `vite-plugin-pwa` แบบ `generateSW` และ `registerType: 'autoUpdate'` พร้อม precache ไฟล์ JavaScript ทุก chunk ตาม `globPatterns` เดิม ดังนั้น chunk ที่ถูก precache ยังใช้ต่อได้ออฟไลน์หลัง Service Worker ติดตั้งและ cache เสร็จ การเปลี่ยนเป็น lazy import ไม่ได้ตัดฟีเจอร์ออกจาก offline cache; ขนาด precache รวมจึงใกล้เคียงเดิม

การเปลี่ยนชื่อไฟล์แบบ content-hash ช่วยให้ Workbox ตรวจพบ asset ชุดใหม่ และเพิ่มการกู้คืนเมื่อ Vite โหลด dynamic chunk เก่าที่ไม่มีอยู่แล้ว โดยรีเฟรชอัตโนมัติหนึ่งครั้งต่อช่วงเวลาเพื่อป้องกัน reload loop

## ข้อจำกัดและสิ่งที่ยังไม่วัด

- หลัง Phase 2 JavaScript หลักยังมีขนาด 1,286.75 kB และเกินคำเตือน Vite 500 kB; source map แสดงว่า Firebase Firestore/Auth เป็น dependency ส่วนใหญ่ และยังจำเป็นกับ data listeners หลัก
- Build ของ v4.1.0 วัดได้ 1,326.07 kB minified / 345.60 kB gzip และ precache 34 รายการ / 4,003.03 KiB; ส่วนที่เพิ่มมาจาก UI/logic การเงินรุ่นใหม่ ขนาดยังเกิน threshold และยังไม่แยก Firebase listeners ตามที่ตั้งใจให้เป็นงานใหญ่แยกต่างหาก
- การย้าย listener หรือ refactor data architecture เพื่อแยก Firebase ออกจาก entry หลักมีผลต่อการโหลด/แสดงข้อมูลหลายหน้า จึงไม่ทำใน Phase นี้
- ไม่ได้วัด First Contentful Paint, Largest Contentful Paint, การใช้งานบนอุปกรณ์มือถือจริง หรือการติดตั้ง PWA บนทุก browser
- การตรวจ PWA รอบนี้ยืนยันว่า build สร้าง Service Worker และ precache manifest ได้; ไม่ได้ทดสอบ offline end-to-end กับบัญชี Firebase จริง

---

## ผลหลังปรับ Lazy Loading ใน v4.8.0

ขยายการทำ dynamic `import()` ให้ครอบคลุมหน้าและฟีเจอร์ที่ยังไม่ได้ใช้ตอนเปิดหน้า Home แรก (รายจ่าย, แชท AI, สัตว์เลี้ยง, ของใช้, ผลแล็บ, แพลนเนอร์, อาหาร, สรุปสัปดาห์, แจ้งเตือน, ตั้งค่า เพิ่มเติมจากแดชบอร์ด, รายงาน และออกกำลังกาย) พร้อมเพิ่มแคชข้อมูลรายเดือนของแดชบอร์ดลง `localStorage` (`trackme_overview_cache_v1`)

| รายการ (`vite v6.4.6`) | v4.1.0 | v4.8.0 | เปลี่ยนแปลง |
|---|---:|---:|---:|
| JavaScript หลัก (`index`) minified | 1,326.07 kB | 1,035.97 kB | ลด 290.10 kB (ประมาณ 21.9%) |
| JavaScript หลัก (`index`) gzip | 345.60 kB | 273.19 kB | ลด 72.41 kB (ประมาณ 21.0%) |
| PWA precache | 34 รายการ / 4,003.03 KiB | 49 รายการ / 4,278.17 KiB | แยก chunk เพิ่ม 15 รายการ |

### ขนาด Lazy Chunks หลักที่แยกออกจาก Entry (`v4.8.0`)

- `workout`: `124.14 kB` (`33.00 kB` gzip) · `food`: `95.10 kB` (`25.86 kB` gzip) · `expense`: `73.50 kB` (`20.04 kB` gzip)
- `aiAssistant`: `59.25 kB` (`16.76 kB` gzip) · `chatWidget`: `49.29 kB` (`13.31 kB` gzip) · `settings`: `33.24 kB` (`9.42 kB` gzip)
- `planner`: `31.21 kB` (`9.21 kB` gzip) · `care`: `31.12 kB` (`9.28 kB` gzip) · `lab`: `29.01 kB` (`8.62 kB` gzip)
- `remindLog`: `23.86 kB` (`6.79 kB` gzip) · `inventory`: `23.25 kB` (`7.31 kB` gzip) · `localAssistant`: `21.17 kB` (`7.06 kB` gzip)
- `foodsearch`: `18.89 kB` (`6.98 kB` gzip) · `weekly`: `17.60 kB` (`5.78 kB` gzip) · `overview`: `13.31 kB` (`4.45 kB` gzip) · `reports`: `12.53 kB` (`4.42 kB` gzip)

### ข้อสังเกตที่ยังคงอยู่หลัง v4.8.0

- Entry หลัก (`1,035.97 kB` minified) ยังเกินคำเตือน Vite `500 kB` เนื่องจาก Firebase Auth/Firestore SDK ยังโหลดตั้งแต่เริ่มเพื่อคง data listeners และ offline cache หลัก
- Vite ยังคงแจ้งเตือนเดิมว่า `src/workoutActive.js` ถูกทั้ง static และ dynamic import ภายใน `src/workout.js` (พฤติกรรมเดิมก่อน v4.8.0)
- ค่าทั้งหมดเป็นผลจาก production build; ยังไม่ได้วัดเวลา FCP/LCP จริงบนอุปกรณ์มือถือหรือทดสอบ offline end-to-end กับบัญชี Firebase จริง

---

## ผลหลังอัปเดต v5.3.0 (Fluent Emoji Flat + Phosphor Duotone)

เปลี่ยนจาก `lucide` เป็น **Fluent Emoji Flat** แบบคัดเฉพาะ 14 SVG ใน `src/fluentEmoji.js` และ **Phosphor Duotone** (`@phosphor-icons/core`) แบบ tree-shaken SVG ใน `src/icons.js` (ถอด `lucide`, `@fortawesome/fontawesome-free` และ `@iconify-json/fluent-emoji-flat` ออกจาก runtime dependencies) โดยยังคงใช้งานออฟไลน์และ precache ครบทั้งแอป

| รายการ (`vite v6.4.6`) | v5.3.0 (ก่อนเปลี่ยนชุดไอคอน / `lucide`) | v5.3.0 (หลังเปลี่ยนเป็น Fluent Emoji + Phosphor Duotone) | เปลี่ยนแปลง |
|---|---:|---:|---:|
| JavaScript หลัก (`index`) minified | 1,133.04 kB | 1,188.71 kB | +55.67 kB |
| JavaScript หลัก (`index`) gzip | 297.47 kB | 321.62 kB | +24.15 kB |
| PWA precache | 49 รายการ / 6,509.88 KiB | 49 รายการ / 6,551.29 KiB | +41.41 KiB |

- ขนาดเพิ่มขึ้น +24.15 kB (gzip) สำหรับไอคอนสองโทน ~109 ตัว + Fluent Emoji 14 ตัว โดยไม่มีการเรียกเครือข่ายหรือ CDN ภายนอก
