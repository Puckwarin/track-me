import { initializeApp } from 'firebase/app';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// ค่า config ของ Firebase Web เป็นข้อมูลสาธารณะโดยออกแบบ — ความปลอดภัยอยู่ที่ Authentication + Firestore Rules
const firebaseConfig = {
  apiKey: 'AIzaSyAZoQyNdJLVj2MRlJ-M32FR1c9VTiFGdmM',
  authDomain: 'trackme-2829.firebaseapp.com',
  projectId: 'trackme-2829',
  storageBucket: 'trackme-2829.firebasestorage.app',
  messagingSenderId: '1001237166672',
  appId: '1:1001237166672:web:214382f55c26f7bc572f55'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// Offline persistence (IndexedDB): เขียน/อ่านตอนไม่มีเน็ตได้ แล้วซิงค์เองเมื่อกลับมาออนไลน์
export const db = (() => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (e) {
    console.warn('Persistent cache unavailable, using memory cache', e);
    return getFirestore(app);
  }
})();

export const COLLECTIONS = ['food_records', 'period_records', 'body_records', 'symptom_records', 'custom_foods'];

// ข้อมูลทุกอย่างอยู่ใต้ users/{uid}/... เพื่อให้ Rules ตรวจแค่ "uid ตรงกับเจ้าของ"
export const userCol = (uid, name) => collection(db, 'users', uid, name);
export const userDoc = (uid, name, id) => doc(db, 'users', uid, name, id);
