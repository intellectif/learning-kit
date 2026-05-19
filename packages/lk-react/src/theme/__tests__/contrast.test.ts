import type { ThemeTokens } from '@intellectif/lk-core';
import { describe, expect, it } from 'vitest';
import { darkTheme } from '../dark-theme.js';
import { defaultTheme } from '../tokens.js';

/** WCAG 2.1 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const channel = (h: string): number => {
    const s = Number.parseInt(h, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(v.slice(0, 2));
  const g = channel(v.slice(2, 4));
  const b = channel(v.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours (1–21). */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Assert every WCAG-relevant pair for a resolved palette. */
function assertPalette(t: ThemeTokens, label: string): void {
  const surface = t['--lk-color-surface'];
  // Normal text ≥ 4.5:1
  expect(contrast(t['--lk-color-text'], surface), `${label}: text/surface`).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(
    contrast(t['--lk-color-text-muted'], surface),
    `${label}: text-muted/surface`,
  ).toBeGreaterThanOrEqual(4.5);
  // Primary is a button background; its label uses the surface colour.
  expect(
    contrast(surface, t['--lk-color-primary']),
    `${label}: on-primary text`,
  ).toBeGreaterThanOrEqual(4.5);
  // Status text ≥ 4.5:1
  for (const key of ['--lk-color-success', '--lk-color-error', '--lk-color-warning'] as const) {
    expect(contrast(t[key], surface), `${label}: ${key}/surface`).toBeGreaterThanOrEqual(4.5);
  }
  // UI component / focus ring ≥ 3:1
  expect(
    contrast(t['--lk-color-focus-ring'], surface),
    `${label}: focus-ring/surface`,
  ).toBeGreaterThanOrEqual(3);
}

describe('Default theme WCAG 2.2 AA contrast', () => {
  it('light palette meets AA', () => {
    assertPalette(defaultTheme, 'light');
  });

  it('dark palette meets AA', () => {
    assertPalette({ ...defaultTheme, ...darkTheme }, 'dark');
  });
});
