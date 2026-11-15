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
