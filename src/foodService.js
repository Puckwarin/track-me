import { addDoc, deleteDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { userCol, userDoc } from './firebase.js';
import { watch } from './sync.js';
import { clearOverviewCacheForUid } from './overviewLogic.js';
import {
  getPreviewRecordsInRange, isPreviewMode, previewAddCustomFood, previewAddFood,
  previewDeleteCustomFood, previewDeleteFood, previewUpdateCustomFood, previewUpdateFood,
  registerPreviewFoodWatcher
} from './preview.js';

export function watchFoodRecords(uid, date, onRecords) {
  if (isPreviewMode()) {
    registerPreviewFoodWatcher(date, onRecords);
    return;
  }
  watch('food', query(userCol(uid, 'food_records'), where('date', '==', date)), onRecords);
}

export async function getFoodRecordsInRange(uid, from, to) {
  if (isPreviewMode()) {
    const rows = getPreviewRecordsInRange('food_records', from, to);
    return { docs: rows.map(r => ({ id: r.id, data: () => ({ ...r }) })) };
  }
  return getDocs(query(userCol(uid, 'food_records'), where('date', '>=', from), where('date', '<=', to)));
}

export const addFoodRecord = (uid, record) => {
  if (isPreviewMode()) return previewAddFood(record);
  clearOverviewCacheForUid(uid);
  return addDoc(userCol(uid, 'food_records'), record);
};
export const updateFoodRecord = (uid, id, updates) => {
  if (isPreviewMode()) return previewUpdateFood(id, updates);
  clearOverviewCacheForUid(uid);
  return updateDoc(userDoc(uid, 'food_records', id), updates);
};
export const deleteFoodRecord = (uid, id) => {
  if (isPreviewMode()) return previewDeleteFood(id);
  clearOverviewCacheForUid(uid);
  return deleteDoc(userDoc(uid, 'food_records', id));
};

export const addCustomFood = (uid, record) => isPreviewMode()
  ? previewAddCustomFood(record)
  : addDoc(userCol(uid, 'custom_foods'), record);
export const updateCustomFood = (uid, id, updates) => isPreviewMode()
  ? previewUpdateCustomFood(id, updates)
  : updateDoc(userDoc(uid, 'custom_foods', id), updates);
export const deleteCustomFood = (uid, id) => isPreviewMode()
  ? previewDeleteCustomFood(id)
  : deleteDoc(userDoc(uid, 'custom_foods', id));
