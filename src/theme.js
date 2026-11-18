// ธีมของแอป (baby-blue = Baby Blue ค่าเริ่มต้น, pastel = พาสเทลละมุน, cozy = ครีมน้ำตาลอบอุ่น, dark = Dark mode)
export const THEMES = {
  'baby-blue': 'Baby Blue',
  pastel: 'Pastel',
  cozy: 'Cozy',
  dark: 'Dark mode'
};

export function applyTheme(theme) {
  const normalized = theme === 'minimal' ? 'baby-blue' : theme;
  const selected = Object.hasOwn(THEMES, normalized) ? normalized : 'baby-blue';
  document.documentElement.dataset.theme = selected;
  localStorage.setItem('trackme-theme', selected);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = selected === 'dark'
      ? '#0F1622'
      : selected === 'pastel'
        ? '#FCF6FB'
        : selected === 'cozy'
          ? '#FAF6F0'
          : '#F4F8FC';
  }
}

try { applyTheme(localStorage.getItem('trackme-theme') || 'baby-blue'); } catch {}
