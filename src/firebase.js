import { initializeApp } from 'firebase/app';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// ค่า config ของ Firebase Web อ่านจาก environment variables (VITE_FIREBASE_*)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-project.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000000000'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

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

export const COLLECTIONS = ['food_records', 'period_records', 'body_records', 'symptom_records', 'custom_foods', 'skincare_products', 'skin_records', 'ingredient_blacklist', 'pet_profiles', 'pet_care_records', 'pet_food_records', 'tracked_products', 'replacement_records', 'workout_records', 'workout_templates', 'settings', 'lab_records'];

export const userCol = (uid, name) => collection(db, 'users', uid, name);
export const userDoc = (uid, name, id) => doc(db, 'users', uid, name, id);
