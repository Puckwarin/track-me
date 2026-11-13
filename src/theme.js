// ธีมของแอป (pastel = Cozy pastel โทนครีมอุ่น เป็นค่าเริ่มต้น)
export const THEMES = {
  pastel: 'พาสเทลอบอุ่น (Cozy)',
  minimal: 'มินิมอล',
  dark: 'มืด'
};

export function applyTheme(theme) {
  const selected = Object.hasOwn(THEMES, theme) ? theme : 'pastel';
  document.documentElement.dataset.theme = selected;
  localStorage.setItem('trackme-theme', selected);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = selected === 'dark' ? '#1c1916' : '#FAF7F2';
}

try { applyTheme(localStorage.getItem('trackme-theme') || 'pastel'); } catch {}
