// หมวดหมู่ของแอป: ไอคอนและหน้าที่เปิด (ใช้ในหน้า Home, ปุ่ม + และเมนูย่อย)
// focus = ช่องแรกของฟอร์มบันทึกในหน้านั้น
export const CATEGORIES = [
  { key: 'food', tab: 'food', icon: 'food', emoji: '🍙', label: 'อาหาร', focus: 'f-name' },
  { key: 'workout', tab: 'workout', icon: 'workout', emoji: '🏃‍♀️', label: 'ออกกำลังกาย', focus: 'w-type' },
  { key: 'period', tab: 'period', icon: 'period', emoji: '🌸', label: 'ประจำเดือน', focus: 'p-start' },
  { key: 'symptoms', tab: 'symptoms', icon: 'symptoms', emoji: '🌿', label: 'อาการ & ผิว', focus: 's-date' },
  { key: 'remind', tab: 'remind', icon: 'remind', emoji: '📌', label: 'บันทึกเตือน', focus: 'rm-smart' },
  { key: 'expense', tab: 'expense', icon: 'expense', emoji: '💸', label: 'รายรับ-จ่าย', focus: 'ex-amount' },
  { key: 'body', tab: 'body', icon: 'body', emoji: '⚖️', label: 'น้ำหนัก', focus: 'b-weight' },
  { key: 'care', tab: 'care', icon: 'care', emoji: '🐾', label: 'สัตว์เลี้ยง', focus: 'pet-name' },
  { key: 'inventory', tab: 'inventory', icon: 'inventory', emoji: '🧺', label: 'ของใช้', focus: 'inv-name' }
];
export const catOf = tab => CATEGORIES.find(c => c.tab === tab);

// กลุ่มเมนูหลัก → หน้าย่อยในกลุ่ม
export const GROUPS = {
  home: ['home'],
  overview: ['overview'],
  food: ['food'],
  health: ['workout', 'period', 'symptoms', 'body'],
  expense: ['expense'],
  care: ['care', 'remind', 'inventory'],
  more: ['notifications', 'settings']
};
export const SUBTABS = {
  overview: { icon: 'overview', emoji: '📈', label: 'ประวัติ & รายงาน' },
  weekly: { icon: 'weekly', emoji: '📊', label: 'สรุปรายสัปดาห์/เดือน' },
  workout: { icon: 'workout', emoji: '🏃‍♀️', label: 'ออกกำลังกาย' },
  period: { icon: 'period', emoji: '🌸', label: 'ประจำเดือน' },
  symptoms: { icon: 'symptoms', emoji: '🌿', label: 'อาการ & ผิว' },
  body: { icon: 'body', emoji: '⚖️', label: 'น้ำหนัก · นอน/ก้าว' },
  report: { icon: 'report', emoji: '📄', label: 'รายงาน (PDF / CSV)' },
  care: { icon: 'care', emoji: '🐾', label: 'สัตว์เลี้ยง & ผลตรวจ' },
  remind: { icon: 'remind', emoji: '📌', label: 'บันทึกเตือน' },
  expense: { icon: 'expense', emoji: '💸', label: 'รายรับ-รายจ่าย' },
  inventory: { icon: 'inventory', emoji: '🧺', label: 'ของใช้ & สต๊อก' },
  notifications: { icon: 'notifications', emoji: '🔔', label: 'แจ้งเตือน' },
  settings: { icon: 'settings', emoji: '⚙️', label: 'ตั้งค่า' }
};
export const groupOf = tab => ['overview', 'weekly', 'report'].includes(tab) ? 'overview' : Object.keys(GROUPS).find(g => GROUPS[g].includes(tab)) || 'home';
