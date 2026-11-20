import { describe, expect, it } from 'vitest';
import { CATEGORIES, SUBTABS } from './categories.js';
import { hasFluentEmoji, fluentEmojiSvg, fluentEmojiBubble } from './fluentEmoji.js';
import { iconSvg, iconBubble } from './icons.js';

describe('icons & fluentEmoji registries', () => {
  it('provides Fluent Emoji Flat SVGs for all categories and subtabs without gradient ID collisions', () => {
    for (const c of CATEGORIES) {
      expect(hasFluentEmoji(c.key)).toBe(true);
      const svg = fluentEmojiSvg(c.key, { size: 32 });
      expect(svg).toContain('viewBox="0 0 32 32"');
      expect(svg).toContain(`tm-fluent-emoji--${c.key}`);
      expect(svg).not.toMatch(/\bid=|url\(#/);
      const bubble = fluentEmojiBubble(c.key, { cat: c.cat });
      expect(bubble).toContain('fluent-bubble');
      expect(bubble).toContain(c.cat);
    }

    for (const [tab, meta] of Object.entries(SUBTABS)) {
      expect(hasFluentEmoji(tab)).toBe(true);
      const svg = fluentEmojiSvg(tab, { size: 30 });
      expect(svg).toContain(`tm-fluent-emoji--${tab}`);
      expect(iconSvg(meta.icon || tab)).toContain('viewBox="0 0 256 256"');
    }
  });

  it('renders Phosphor Duotone SVGs for semantic keys and backward-compatible FontAwesome aliases', () => {
    const keys = [
      'brand', 'home', 'food', 'health', 'overview', 'weekly', 'workout', 'period',
      'symptoms', 'remind', 'expense', 'body', 'care', 'inventory', 'report',
      'notifications', 'settings', 'more', 'planner', 'plus', 'close', 'chat',
      'eye', 'lock', 'sun', 'moon', 'arrow-up', 'check', 'trash', 'edit',
      'fa-solid fa-spinner fa-spin', 'fa-tooth', 'fa-receipt', 'fa-paw', 'fa-utensils'
    ];
    for (const key of keys) {
      const svg = iconSvg(key, { size: 18 });
      expect(svg).toContain('class="tm-svg-icon ph-duotone');
      expect(svg).toContain('viewBox="0 0 256 256"');
      expect(svg).toContain('<path');
    }
    expect(iconSvg('fa-solid fa-spinner fa-spin')).toContain('animate-spin');
    expect(iconBubble('food', { small: true, cat: 'cat-food' })).toContain('emoji-bubble icon-bubble emoji-sm cat-food');
  });
});
