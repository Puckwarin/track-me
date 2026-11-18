export const TYPES = {
  walk: 'เดิน (Walk)', upper: 'Upper body', lower: 'Lower body', full: 'Full body',
  pilates: 'พิลาทิส (Pilates)', stretch: 'ยืดเหยียด (Stretching)', other: 'อื่น ๆ'
};

export const SECTIONS = [
  ['warmup', 'วอร์มอัพ (Warm-up)', 'fa-fire'],
  ['main', 'ท่าหลัก (Main workout)', 'fa-dumbbell'],
  ['cooldown', 'คูลดาวน์ (Cool-down)', 'fa-snowflake']
];

export const repLabel = unit => (unit === 'sec' ? 'วินาที' : unit === 'min' ? 'นาที' : 'ครั้ง');

export const WORKOUT_FEELINGS = [
  { id: 'energized', icon: '⚡', label: 'สดชื่น มีพลัง' },
  { id: 'good', icon: '😊', label: 'กำลังดี' },
  { id: 'tired', icon: '😮‍💨', label: 'เหนื่อยตึง' },
  { id: 'exhausted', icon: '🥵', label: 'ล้ามาก' }
];

export function formatFeelingLabel(id) {
  const feeling = WORKOUT_FEELINGS.find(item => item.id === id);
  return feeling ? `${feeling.icon} ${feeling.label}` : '';
}

export function summarizeSessionNextStep(exerciseFeedback = []) {
  if (!Array.isArray(exerciseFeedback) || !exerciseFeedback.length) return '';
  const increases = exerciseFeedback.filter(item => item.nextAction === 'increase').length;
  const deloads = exerciseFeedback.filter(item => item.nextAction === 'deload').length;
  if (deloads > 0 && deloads >= increases) return `แนะนำพักฟื้น/ลดโหลดใน ${deloads} ท่า`;
  if (increases > 0) return `พร้อมเพิ่มความท้าทายใน ${increases} ท่า`;
  return 'รักษาระดับปัจจุบันในรอบถัดไป';
}
