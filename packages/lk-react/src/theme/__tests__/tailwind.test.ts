import { describe, expect, it } from 'vitest';
import { createTailwindTheme } from '../tailwind.js';

describe('createTailwindTheme', () => {
  it('maps tokens to var() references with fallbacks across the 5 buckets', () => {
    const ext = createTailwindTheme({});
    expect(ext.colors['lk-primary']).toBe('var(--lk-color-primary, #2563eb)');
    expect(ext.spacing['lk-md']).toBe('var(--lk-spacing-md, 16px)');
    expect(ext.borderRadius['lk-base']).toBe('var(--lk-radius-base, 0.5rem)');
    expect(ext.fontSize['lk-sm']).toBe('var(--lk-font-size-sm, 0.875rem)');
    expect(ext.fontFamily['lk-base']).toMatch(/^var\(--lk-font-family-base, system-ui/);
    expect(Object.keys(ext).sort()).toEqual([
      'borderRadius',
      'colors',
      'fontFamily',
      'fontSize',
      'spacing',
    ]);
  });

  it('threads overrides into the fallback and excludes non-mappable tokens', () => {
    const ext = createTailwindTheme({ '--lk-color-primary': '#ff0000' });
    expect(ext.colors['lk-primary']).toBe('var(--lk-color-primary, #ff0000)');
    expect(ext.colors['lk-surface']).toBe('var(--lk-color-surface, #ffffff)');
    // transition (duration+easing) and font-weight have no clean Tailwind key.
    expect('transitionDuration' in ext).toBe(false);
    const allKeys = Object.values(ext).flatMap((bucket) => Object.keys(bucket));
    expect(allKeys.some((k) => k.includes('normal') || k.includes('bold'))).toBe(false);
  });
});
