# Project Setup — คู่มือการติดตั้งและตั้งค่า Track Me

เอกสารนี้ใช้สำหรับติดตั้งครั้งแรกหรือย้ายไปยัง Firebase / GitHub project ใหม่ หากใช้งาน Track Me บน production อยู่แล้ว ให้อ่านหัวข้ออัปเดตและคีย์เสริมด้านล่างก่อนทำซ้ำ การใช้บริการฟรีมีโควตาและข้อจำกัดตามผู้ให้บริการ ไม่ต้องใส่บัตรเครดิตสำหรับ GitHub Pages และ Firebase Spark

> ⚠️ **ลำดับสำคัญ:** ทำตามเลขข้อต่อกันไป โดยเฉพาะข้อ 4–6 (ย้ายข้อมูลเดิม) — ถ้าเปลี่ยน Rules เป็นแบบสุดท้ายก่อนย้ายข้อมูล ข้อมูลเดิมจะอ่านไม่ได้

---

## 0) สิ่งที่ต้องมี
- บัญชี Google (ใช้ทั้ง Firebase และล็อกอินในแอป)
- บัญชี GitHub และ repo `Puckwarin/track-me` (ตั้งเป็น **Public** — GitHub Pages ฟรีใช้กับ repo สาธารณะ)
- (ถ้าจะพัฒนาบนเครื่อง) Node.js 20 ขึ้นไป

---

## 1) Firebase: ตรวจแผนและเปิด Google Sign-in
เปิด [Firebase Console](https://console.firebase.google.com) → เลือกโปรเจกต์ของคุณ

1. **ตรวจแผน:** มุมซ้ายล่างต้องเป็น **Spark (No-cost)** — ไม่ต้องกด Upgrade
2. ไปที่ **Build → Authentication → Get started** (ถ้ายังไม่เคยเปิด)
3. แท็บ **Sign-in method** → เลือก **Google** → เปิด **Enable** → ใส่ *Project support email* → **Save**
4. แท็บ **Settings → Authorized domains** → **Add domain** ใส่ `puckwarin.github.io` *(และ `localhost` สำหรับพัฒนาบนเครื่อง)*

---

## 2) ดันโค้ดขึ้น GitHub และเปิด GitHub Pages
1. อัปโหลด/push โค้ดทั้งโฟลเดอร์ขึ้น branch `main` (รวมโฟลเดอร์ `.github/workflows/` และ `package-lock.json`)
2. ใน GitHub: **Settings → Pages → Build and deployment → Source** เลือก **GitHub Actions**
3. ดูแท็บ **Actions** ให้ workflow "Deploy to GitHub Pages" ขึ้นเขียว (ใช้เวลา 1–2 นาที)
4. เว็บใช้งานได้ที่ `https://puckwarin.github.io/track-me/`

---

## 3) Firestore Rules ชุดย้ายข้อมูล (ชั่วคราว)
Firebase Console → **Build → Firestore Database → Rules**
1. คัดลอกเนื้อหาจากไฟล์ **`firestore.rules.migration`** ไปวางทับทั้งหมด → **Publish** *(ชุดนี้อนุญาตให้ผู้ที่ล็อกอินแล้วอ่านข้อมูล Room Code เดิมได้ชั่วคราว)*

---

## 4) ล็อกอินและย้ายข้อมูลเดิม
1. เปิดเว็บไซต์ → กด **เข้าสู่ระบบด้วย Google**
2. ไปที่ **ตั้งค่า → ย้ายข้อมูลจาก Room Code เดิม** → ใส่รหัสห้องเดิม → **ตรวจสอบ**
3. กด **ย้ายเข้าบัญชีนี้** → ตรวจสอบข้อมูลในแท็บต่างๆ ว่าครบถ้วน
4. **แนะนำ:** กด **สำรองข้อมูล (JSON)** ในหน้าตั้งค่าเก็บไว้สำรอง

---

## 5) เปลี่ยนเป็น Rules ชุดสุดท้าย
Firebase Console → **Firestore Database → Rules**
1. คัดลอกเนื้อหาจากไฟล์ **`firestore.rules`** ไปวางทับ → **Publish**
2. ทดสอบที่แท็บ **Rules Playground**: อ่าน `/users/ไอดีใครก็ได้/food_records/x` โดยไม่ล็อกอิน ต้องถูกปฏิเสธ (**Denied**)
3. รีเฟรชแอปเพื่อใช้งานปกติ

> ข้อมูลเดิมแบบ Room Code จะอ่านไม่ได้แล้ว — หากต้องการลบทิ้ง ให้กดปุ่ม "ลบข้อมูลเดิมในห้องนี้" ในหน้าย้ายข้อมูล **ก่อน** ทำข้อ 5 หรือลบใน Firebase Console

---

## 6) การตั้งค่าระบบแจ้งเตือนอัตโนมัติ (Web Push & GitHub Actions - v2.6)
ระบบแจ้งเตือนอัตโนมัติทุกวันเวลา 08:00 น. ทำงานฟรีผ่าน GitHub Actions และ Firebase โดยไม่ต้องเปิดแอปค้างไว้:

1. **สร้างคู่กุญแจ VAPID (รันใน Terminal ที่เครื่องของคุณ):**
   ```bash
   npx web-push generate-vapid-keys
จดจำค่า Public Key และ Private Key ที่ได้ไว้ใช้ในขั้นตอนถัดไปสร้าง Firebase Service Account Key:เข้า Firebase Console → ไอคอนฟันเฟือง Project settings → Service accountsกด Generate new private key ระบบจะดาวน์โหลดไฟล์ .json ลงเครื่องเปิดไฟล์ด้วย Text Editor แล้วคัดลอกข้อความ JSON ทั้งหมดข้างในใส่ GitHub Repository Secrets:
ไปที่ GitHub Repo ของคุณ → Settings → Secrets and variables → Actions → New repository secret แล้วเพิ่มค่าเหล่านี้:VAPID_PUBLIC_KEY → วาง Public Key จากข้อ 1VAPID_PRIVATE_KEY → วาง Private Key จากข้อ 1VAPID_SUBJECT → ใส่อีเมลติดต่อในรูปแบบ mailto:your-email@gmail.comFIREBASE_SERVICE_ACCOUNT → วางข้อความ JSON ทั้งหมดจากข้อ 2เปิดรับการแจ้งเตือนบนมือถือ:เมื่อ push โค้ดหรือรัน workflow สำเร็จ เว็บจะฝัง VITE_VAPID_PUBLIC_KEY ให้อัตโนมัติเปิดแอป Track Me → กดปุ่ม "🔔 เปิดรับการแจ้งเตือน" ที่หน้า Home หรือในหน้าตั้งค่าหมายเหตุ iPhone / iPad (iOS 16.4+): ต้องกดปุ่ม Share (แชร์) → Add to Home Screen (เพิ่มไปยังหน้าจอโฮม) แล้วเปิดแอปจากไอคอนบนหน้าจอจึงจะกดเปิดรับแจ้งเตือนได้7) คีย์ AI เสริม & การทดสอบการเชื่อมต่อ (ตัวเลือก)คีย์ทั้งหมดจะถูกเก็บไว้ใน localStorage ของเบราว์เซอร์อุปกรณ์นั้นๆ เท่านั้น ไม่ถูกส่งขึ้น Firebase:Gemini API Key: ขอคีย์ฟรีที่ Google AI Studio แล้ววางใน ตั้งค่า → Gemini API Key → กด บันทึก และ ทดสอบการเชื่อมต่อGroq API Key: สร้างคีย์จาก Groq Console แล้วบันทึกใน ตั้งค่า → Groq API KeyUSDA API Key: ขอคีย์ฟรีที่ FoodData Central แล้วบันทึกในช่อง USDA API Key8) Hiwpinto Sync Helper (ทำครั้งเดียวต่อเบราว์เซอร์)ตั้งค่า Bookmark สำหรับดึงเมนูอาหารคลีน:เปิดหน้าต่าง Sync Data Hiwpinto ในแอป Track Me แล้วกด คัดลอก Sync Helperเปิดแถบ Bookmark ของเบราว์เซอร์ (Cmd + Shift + B บน Mac หรือ Ctrl + Shift + B บน Windows) แล้วเลือกเพิ่มหน้าเว็บใหม่ตั้งชื่อว่า Sync Hiwpinto และวางโค้ดที่คัดลอกไว้ลงในช่อง URL จากนั้นกดบันทึก9) การพัฒนาในเครื่อง (Local Development)ต้องใช้ Node.js 20 ขึ้นไปBashnpm install
npm run dev        # เปิด http://localhost:3000/
npm run build      # ผลลัพธ์อยู่ที่ dist/
10) ติดตั้งเป็นแอปบนมือถือ + ทดสอบออฟไลน์เปิด https://puckwarin.github.io/track-me/ ตอนออนไลน์ ล็อกอิน และรอข้อมูลโหลด 1–2 ครั้งAndroid (Chrome): เมนู ⋮ → Add to Home screen · iPhone (Safari): ปุ่มแชร์ → Add to Home Screenทดสอบออฟไลน์: เปิดโหมดเครื่องบิน → เปิดแอป → ต้องเห็นการ์ด "สรุปสุขภาพล่าสุด" และสามารถบันทึกข้อมูลใหม่ได้ (ขึ้นป้าย "ออฟไลน์ · รอซิงค์")แก้ปัญหาที่พบบ่อย (Troubleshooting)อาการวิธีแก้auth/unauthorized-domainเพิ่ม puckwarin.github.io ใน Authentication → Settings → Authorized domains (หัวข้อ 1)auth/operation-not-allowedยังไม่ได้ Enable Google ใน Sign-in method (หัวข้อ 1)ป้ายเป็นสีแดง permission-deniedRules ยังไม่ได้ Publish / ยังไม่ล็อกอิน / ใช้ชุด Rules ผิดขั้นตอน (หัวข้อ 3 และ 5)เว็บขึ้นหน้าเปล่าหรือ 404Pages Source ต้องเป็น GitHub Actions และ workflow ต้องผ่าน (หัวข้อ 2)แก้โค้ดแล้วเว็บไม่เปลี่ยนปิดแอปทั้งหมดแล้วเปิดใหม่ หรือล้างข้อมูลเว็บไซต์เพื่อโหลดเวอร์ชันล่าสุด
