// หมวดหมู่ของแอป: สี ไอคอน และหน้าที่เปิด (ใช้ในหน้า Home, ปุ่ม + และเมนูย่อย)
// cat = ชื่อคลาสสีพาสเทลใน style.css · focus = ช่องแรกของฟอร์มบันทึกในหน้านั้น
export const CATEGORIES = [
  { key: 'food', tab: 'food', cat: 'cat-food', emoji: '🍙', label: 'อาหาร', focus: 'f-name' },
  { key: 'workout', tab: 'workout', cat: 'cat-workout', emoji: '🏃‍♀️', label: 'ออกกำลังกาย', focus: 'w-type' },
  { key: 'period', tab: 'period', cat: 'cat-period', emoji: '🌸', label: 'ประจำเดือน', focus: 'p-start' },
  { key: 'symptoms', tab: 'symptoms', cat: 'cat-symptoms', emoji: '🌿', label: 'อาการ & ผิว', focus: 's-date' },
  { key: 'lab', tab: 'lab', cat: 'cat-lab', emoji: '🧪', label: 'ผลตรวจ', focus: 'lb-name' },
  { key: 'body', tab: 'body', cat: 'cat-body', emoji: '⚖️', label: 'น้ำหนัก', focus: 'b-weight' },
  { key: 'care', tab: 'care', cat: 'cat-care', emoji: '🐾', label: 'สัตว์เลี้ยง', focus: 'pet-name' },
  { key: 'inventory', tab: 'inventory', cat: 'cat-inventory', emoji: '🧺', label: 'ของใช้', focus: 'inv-name' }
];
export const catOf = tab => CATEGORIES.find(c => c.tab === tab);

// กลุ่มเมนูด้านล่าง → หน้าย่อยในกลุ่ม
export const GROUPS = {
  home: ['home'],
  food: ['food'],
  health: ['weekly', 'workout', 'period', 'symptoms', 'lab', 'body', 'report'],
  care: ['care', 'inventory'],
  more: ['notifications', 'settings']
};
export const SUBTABS = {
  weekly: { emoji: '📊', label: 'สรุปสัปดาห์', cat: 'cat-neutral' },
  workout: { emoji: '🏃‍♀️', label: 'ออกกำลังกาย', cat: 'cat-workout' },
  period: { emoji: '🌸', label: 'ประจำเดือน', cat: 'cat-period' },
  symptoms: { emoji: '🌿', label: 'อาการ & ผิว', cat: 'cat-symptoms' },
  lab: { emoji: '🧪', label: 'ผลตรวจ', cat: 'cat-lab' },
  body: { emoji: '⚖️', label: 'น้ำหนัก & สัดส่วน', cat: 'cat-body' },
  report: { emoji: '📄', label: 'รายงาน', cat: 'cat-neutral' },
  care: { emoji: '🐾', label: 'สัตว์เลี้ยง', cat: 'cat-care' },
  inventory: { emoji: '🧺', label: 'ของใช้ & สต๊อก', cat: 'cat-inventory' },
  notifications: { emoji: '🔔', label: 'แจ้งเตือน', cat: 'cat-body' },
  settings: { emoji: '⚙️', label: 'ตั้งค่า', cat: 'cat-neutral' }
};
export const groupOf = tab => Object.keys(GROUPS).find(g => GROUPS[g].includes(tab)) || 'home';
