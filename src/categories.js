// หมวดหมู่ของแอป: สี ไอคอน และหน้าที่เปิด (ใช้ในหน้า Home, ปุ่ม + และเมนูย่อย)
// cat = ชื่อคลาสสีพาสเทลใน style.css · focus = ช่องแรกของฟอร์มบันทึกในหน้านั้น
export const CATEGORIES = [
  { key: 'food', tab: 'food', cat: 'cat-food', icon: 'food', emoji: '🍙', label: 'อาหาร', focus: 'f-name' },
  { key: 'workout', tab: 'workout', cat: 'cat-workout', icon: 'workout', emoji: '🏃‍♀️', label: 'ออกกำลังกาย', focus: 'w-type' },
  { key: 'period', tab: 'period', cat: 'cat-period', icon: 'period', emoji: '🌸', label: 'ประจำเดือน', focus: 'p-start' },
  { key: 'symptoms', tab: 'symptoms', cat: 'cat-symptoms', icon: 'symptoms', emoji: '🌿', label: 'อาการ & ผิว', focus: 's-date' },
  { key: 'remind', tab: 'remind', cat: 'cat-lab', icon: 'remind', emoji: '📌', label: 'บันทึกเตือน', focus: 'rm-smart' },
  { key: 'expense', tab: 'expense', cat: 'cat-body', icon: 'expense', emoji: '💸', label: 'รายรับ-จ่าย', focus: 'ex-amount' },
  { key: 'body', tab: 'body', cat: 'cat-body', icon: 'body', emoji: '⚖️', label: 'น้ำหนัก', focus: 'b-weight' },
  { key: 'care', tab: 'care', cat: 'cat-care', icon: 'care', emoji: '🐾', label: 'สัตว์เลี้ยง', focus: 'pet-name' },
  { key: 'inventory', tab: 'inventory', cat: 'cat-inventory', icon: 'inventory', emoji: '🧺', label: 'ของใช้', focus: 'inv-name' }
];
export const catOf = tab => CATEGORIES.find(c => c.tab === tab);

// กลุ่มเมนูด้านล่าง → หน้าย่อยในกลุ่ม
export const GROUPS = {
  home: ['home'],
  food: ['food'],
  health: ['overview', 'workout', 'period', 'symptoms', 'body'],
  care: ['expense', 'care', 'remind', 'inventory'],
  more: ['notifications', 'settings']
};
export const SUBTABS = {
  overview: { icon: 'overview', emoji: '📈', label: 'แดชบอร์ด', cat: 'cat-neutral' },
  weekly: { icon: 'weekly', emoji: '📊', label: 'สรุปสัปดาห์', cat: 'cat-neutral' },
  workout: { icon: 'workout', emoji: '🏃‍♀️', label: 'ออกกำลังกาย', cat: 'cat-workout' },
  period: { icon: 'period', emoji: '🌸', label: 'ประจำเดือน', cat: 'cat-period' },
  symptoms: { icon: 'symptoms', emoji: '🌿', label: 'อาการ & ผิว', cat: 'cat-symptoms' },
  body: { icon: 'body', emoji: '⚖️', label: 'น้ำหนัก · นอน/ก้าว', cat: 'cat-body' },
  report: { icon: 'report', emoji: '📄', label: 'รายงาน', cat: 'cat-neutral' },
  care: { icon: 'care', emoji: '🐾', label: 'สัตว์เลี้ยง & ผลตรวจ', cat: 'cat-care' },
  remind: { icon: 'remind', emoji: '📌', label: 'บันทึกเตือน', cat: 'cat-lab' },
  expense: { icon: 'expense', emoji: '💸', label: 'รายรับ-รายจ่าย', cat: 'cat-body' },
  inventory: { icon: 'inventory', emoji: '🧺', label: 'ของใช้ & สต๊อก', cat: 'cat-inventory' },
  notifications: { icon: 'notifications', emoji: '🔔', label: 'แจ้งเตือน', cat: 'cat-body' },
  settings: { icon: 'settings', emoji: '⚙️', label: 'ตั้งค่า', cat: 'cat-neutral' }
};
export const groupOf = tab => ['weekly', 'report'].includes(tab) ? 'health' : Object.keys(GROUPS).find(g => GROUPS[g].includes(tab)) || 'home';
