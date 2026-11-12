// Shared tab colors.
export const TAB_ACTIVE = 'bg-brand text-white border-brand';
export const TAB_IDLE = 'bg-white text-slate-600 border-lav-soft hover:bg-lav-soft/60';
export const TAB_BASE = 'px-4 py-2 rounded-xl text-sm font-medium border whitespace-nowrap';

export const THEMES = {
  pastel: 'พาสเทล',
  minimal: 'มินิมอล',
  dark: 'มืด'
};

export function applyTheme(theme) {
  const selected = Object.hasOwn(THEMES, theme) ? theme : 'pastel';
  document.documentElement.dataset.theme = selected;
  localStorage.setItem('trackme-theme', selected);
}

try { applyTheme(localStorage.getItem('trackme-theme') || 'pastel'); } catch {}
