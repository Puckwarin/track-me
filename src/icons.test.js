import { describe, expect, it } from 'vitest';
import { CATEGORIES, SUBTABS } from './categories.js';
import { iconSvg, iconBubble } from './icons.js';

describe('Phosphor Regular icon registry', () => {
  it('provides Phosphor Regular SVGs for all categories and subtabs', () => {
    for (const c of CATEGORIES) {
      const svg = iconSvg(c.icon || c.key, { size: 24 });
      expect(svg).toContain('class="tm-svg-icon ph-regular"');
      expect(svg).toContain('viewBox="0 0 256 256"');
      expect(svg).toContain('<path');
      const bubble = iconBubble(c.icon || c.key);
      expect(bubble).toContain('icon-bubble');
      expect(c).not.toHaveProperty('cat');
    }

    for (const [tab, meta] of Object.entries(SUBTABS)) {
      const svg = iconSvg(meta.icon || tab, { size: 22 });
      expect(svg).toContain('viewBox="0 0 256 256"');
      expect(svg).toContain('<path');
    }
  });

  it('renders Phosphor Regular SVGs for semantic keys and backward-compatible FontAwesome aliases', () => {
    const keys = [
      'brand', 'home', 'food', 'health', 'overview', 'weekly', 'workout', 'period',
      'symptoms', 'remind', 'expense', 'body', 'care', 'inventory', 'report',
      'notifications', 'settings', 'more', 'planner', 'plus', 'close', 'chat',
      'eye', 'lock', 'sun', 'moon', 'arrow-up', 'check', 'trash', 'edit',
      'fa-solid fa-spinner fa-spin', 'fa-tooth', 'fa-receipt', 'fa-paw', 'fa-utensils'
    ];
    for (const key of keys) {
      const svg = iconSvg(key, { size: 18 });
      expect(svg).toContain('class="tm-svg-icon ph-regular');
      expect(svg).toContain('viewBox="0 0 256 256"');
      expect(svg).toContain('<path');
    }
    expect(iconSvg('fa-solid fa-spinner fa-spin')).toContain('animate-spin');
    expect(iconBubble('food', { small: true })).toContain('emoji-bubble icon-bubble emoji-sm');
  });
});
