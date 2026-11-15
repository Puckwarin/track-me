import { addDoc, deleteDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { watch } from './sync.js';

export function watchFoodRecords(uid, date, onRecords) {
  watch('food', query(userCol(uid, 'food_records'), where('date', '==', date)), onRecords);
}

export async function getFoodRecordsInRange(uid, from, to) {
  return getDocs(query(userCol(uid, 'food_records'), where('date', '>=', from), where('date', '<=', to)));
}

export const addFoodRecord = (uid, record) => addDoc(userCol(uid, 'food_records'), record);
export const updateFoodRecord = (uid, id, updates) => updateDoc(userDoc(uid, 'food_records', id), updates);
export const deleteFoodRecord = (uid, id) => deleteDoc(userDoc(uid, 'food_records', id));

export const addCustomFood = (uid, record) => addDoc(userCol(uid, 'custom_foods'), record);
export const updateCustomFood = (uid, id, updates) => updateDoc(userDoc(uid, 'custom_foods', id), updates);
export const deleteCustomFood = (uid, id) => deleteDoc(userDoc(uid, 'custom_foods', id));
