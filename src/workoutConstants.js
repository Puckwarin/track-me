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
