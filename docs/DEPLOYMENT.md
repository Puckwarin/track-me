# Build และ Deployment

## ช่องทางที่ใช้งานจริง

- Static web app build ด้วย Vite และเผยแพร่ผ่าน **GitHub Pages จาก GitHub Actions**
- Firebase ใช้ Google Authentication และ Cloud Firestore; `firebase.json` กำหนด Rules และ Emulator แต่ repository ไม่มี Firebase Hosting target หรือคำสั่ง deploy เว็บไป Firebase Hosting
- `firestore.rules` ไม่ได้ deploy ตาม Pages โดยอัตโนมัติ ต้องตรวจและเผยแพร่แยก
- Git tag เป็นจุดอ้างอิง source code ไม่ได้ trigger deployment ด้วยตัวเอง

## เตรียมเครื่องและรันในเครื่อง

ต้องใช้ Node.js 24.12 ขึ้นไปสำหรับ workflow ปัจจุบัน; ทดสอบ Firestore Rules ต้องติดตั้ง Java 21 ขึ้นไปด้วย

```bash
npm ci
npm run dev
npm run lint
npm test
npm run test:coverage
npm run test:rules
npm run build
npm run preview
```

`npm run dev` และ `npm run preview` ใช้ port 3000 ตาม `package.json`; build ปกติใช้ base path `/` ส่วน build ใน GitHub Actions ใช้ `/track-me/`

## Environment variables และ secrets

ไฟล์ `.env*` ถูก ignore โดย Git; ไม่พบ `.env.example` ใน repository ปัจจุบัน

| ชื่อ | ใช้ที่ใด | หมายเหตุ |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Vite/browser | Firebase Web API key เป็น public client config; ไม่ใช่ secret สำหรับควบคุมสิทธิ์ |
| `VITE_FIREBASE_AUTH_DOMAIN` | Vite/browser | Auth domain ของ Firebase |
| `VITE_FIREBASE_PROJECT_ID` | Vite/browser | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Vite/browser | Firebase storage bucket config; แอปนี้ไม่ได้ใช้ Firebase Storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Vite/browser | Firebase Web config |
| `VITE_FIREBASE_APP_ID` | Vite/browser | Firebase Web config |
| `VITE_VAPID_PUBLIC_KEY` | Vite/browser build | VAPID public key; เป็น public value สำหรับสมัคร Push |
| `FIREBASE_SERVICE_ACCOUNT` | Daily Push GitHub Action | Firebase Admin service-account JSON; เก็บเป็น GitHub Actions secret |
| `VAPID_PRIVATE_KEY` | Daily Push GitHub Action | VAPID private key; ห้ามใส่ใน client bundle หรือ repository |
| `VAPID_PUBLIC_KEY` | Build และ Daily Push Actions | Public key เดียวกัน; build workflow ส่งค่าให้ `VITE_VAPID_PUBLIC_KEY` |
| `VAPID_SUBJECT` | Daily Push GitHub Action | Contact URI เช่น `mailto:owner@example.com` |
| `APP_URL` | Daily Push GitHub Action | Workflow สร้างจาก GitHub owner/repository ให้อัตโนมัติ |

`src/firebase.js` มี Firebase Web config fallback สำหรับโปรเจกต์ที่กำหนดไว้ในแอป; การย้ายไป Firebase project ใหม่ต้องกำหนด Web config และตั้ง Google Sign-in/authorized domains ให้ตรงกัน ค่าที่ขึ้นต้น `VITE_` จะถูกรวมในไฟล์ browser จึงห้ามใช้เก็บ private keys. AI/USDA keys ที่ตั้งจาก UI อยู่ใน `localStorage` ไม่ใช่ GitHub Secrets และต้องตั้งแยกแต่ละอุปกรณ์

ตั้งค่า Daily Push secrets ที่ GitHub → **Settings → Secrets and variables → Actions**. งานใช้ Node.js 22 แยกจาก CI เว็บที่ใช้ Node.js 24; รายละเอียดการสร้าง service account และ VAPID key อยู่ใน [SETUP.md](SETUP.md)

## GitHub Pages release

ไฟล์ `.github/workflows/build.yml` รัน `npm ci`, lint, coverage tests, Firestore Emulator Rules tests และ production build สำหรับ:

- Pull request ที่ target `main`
- Push ไป `main` หรือ `integration/**`
- `workflow_dispatch`

Workflow deploys Pages เฉพาะเมื่อเป็น push/manual run บน `main` และ checks ผ่านครบ; workflow อัปโหลด `dist/` แล้ว deploy ผ่าน GitHub Pages action. เพื่อเผยแพร่ release ให้เปิด PR ของ branch ที่ตรวจแล้วเข้า `main`, ตรวจ CI และการอนุมัติ repository จากนั้น merge ตามขั้นตอนของเจ้าของ repo. **ห้ามใช้ขั้นตอนนี้เป็นการอนุมัติให้ merge หรือ deploy โดยอัตโนมัติ**

ตรวจ GitHub → **Settings → Pages → Build and deployment** ให้ Source เป็น **GitHub Actions**. ตั้ง `VAPID_PUBLIC_KEY` เป็น repository secret หากต้องการฝัง public key ลง build; หากไม่ตั้ง ผู้ใช้สามารถใส่คีย์ผ่าน Settings ได้เมื่อเปิด Push.

## Firestore Rules

1. สำรอง/ตรวจ rules ที่เผยแพร่อยู่และอ่าน [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md)
2. รันทดสอบ `npm run test:rules` กับ Emulator และตรวจ `firestore.rules` ที่จะเผยแพร่
3. ผู้ดูแลที่ได้รับอนุญาตเผยแพร่ Rules ผ่าน Firebase Console → Firestore Database → Rules โดยตรวจ Firebase project ให้ถูกต้องก่อนกด **Publish**
4. ตรวจ sign-in, read/write ของเจ้าของ, cross-user denial และการสร้าง write-only runtime error log หลังเผยแพร่

CI ใช้ Emulator เท่านั้นและไม่ deploy Production Rules. `firestore.rules.migration` มีสิทธิ์ legacy ที่กว้างและไม่ควรเผยแพร่ค้างไว้; ใช้ได้เฉพาะขั้นตอน migration ที่ควบคุมและต้องสำรองข้อมูลก่อน อ่านข้อควรระวังใน [FIRESTORE_SCHEMA.md](FIRESTORE_SCHEMA.md). ไม่มีการตั้งค่า composite index ใน `firebase.json` ปัจจุบัน; ถ้าเพิ่ม query ใหม่ให้จัดการ index แยกตาม Firestore error/requirements.

## PWA และการอัปเดต cache

Vite PWA สร้าง manifest และ Service Worker ใน build; Workbox precache assets ที่ตรง `globPatterns`, ใช้ content-hashed filenames และ `registerType: 'autoUpdate'`. ปกติไม่ต้อง bump cache name ด้วยมือเมื่อปล่อย build ใหม่ ผู้ใช้ควรเปิด/รีโหลดแอปเมื่อได้รับ update; stale dynamic chunk มีการ refresh อัตโนมัติแบบจำกัดเพื่อเลี่ยง reload loop. ไม่ควรลบ browser data เพื่อแก้ทุกกรณี เพราะอาจลบข้อมูลใน local cache ที่ยังไม่ซิงค์

หลังเปิดใช้ Web Push ต้องให้ผู้ใช้กดอนุญาตจากหน้าแอป; iOS/iPadOS ต้องเพิ่มแอปลง Home Screen ก่อนตามข้อจำกัด platform. Daily Push ทำงานเวลา 12:15 น. ไทยผ่าน workflow schedule หาก secrets ถูกต้องและ GitHub Actions ทำงานสำเร็จ

## Rollback และขอบเขต

- Rollback เว็บด้วย revert commit/PR ที่ merge เข้า `main`; Pages จะ build/deploy source ใหม่หลัง checks ผ่าน
- Tag เพียงอย่างเดียวไม่ย้อนเว็บ และการเปลี่ยน schema/Firestore Rules ไม่ถูกย้อนตาม code rollback โดยอัตโนมัติ
- ตรวจ backward compatibility ของ Firestore data/rules แยกก่อน rollback และอย่าลบหรือ migrate production data โดยอัตโนมัติ
- Production deployment, Firestore Rules publication, data migration, merge และ push release tag ต้องได้รับอนุมัติจากผู้ดูแลก่อน
