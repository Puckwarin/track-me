// ธีมของแอป (cozy = ครีมอุ่นเป็นค่าเริ่มต้น, pastel = พาสเทลละมุน, dark = Dark mode)
export const THEMES = {
  cozy: 'Cozy',
  pastel: 'Pastel',
  dark: 'Dark mode'
};

export function applyTheme(theme) {
  const normalized = theme === 'minimal' ? 'cozy' : theme;
  const selected = Object.hasOwn(THEMES, normalized) ? normalized : 'cozy';
  document.documentElement.dataset.theme = selected;
  localStorage.setItem('trackme-theme', selected);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = selected === 'dark' ? '#1c1916' : selected === 'pastel' ? '#FCF6FB' : '#FAF7F2';
}

try { applyTheme(localStorage.getItem('trackme-theme') || 'cozy'); } catch {}
