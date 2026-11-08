import { describe, expect, it } from 'vitest';
import {
  getAnimation,
  getMotionPreset,
  listAnimations,
  listMotionPresets,
  resolveMotionTokens,
} from '../style/animations.js';
import {
  ANIMATION_IDS,
  FONT_ALLOW_LIST,
  isAllowedFont,
  isAnimationId,
  isMotionPresetId,
  isStylePresetId,
  MOTION_PRESET_IDS,
  STYLE_PRESET_IDS,
} from '../style/catalog.js';
import { cssVariablesForTokens, interactiveActivitiesStylesheet } from '../style/css.js';
import {
  fontFileName,
  fontStack,
  googleFontsCssUrl,
  googleFontsExportFiles,
  googleFontsExportManifest,
  hostedFontsCssUrl,
  listAllowedFonts,
  localFontFaceCss,
  offlineFontExport,
  resolveFontPair,
} from '../style/fonts.js';
import {
  getStylePreset,
  listStylePresets,
  resolveStylePreset,
  resolveStyleTokens,
} from '../style/tokens.js';

describe('style and motion catalogs', () => {
  it('lists named presets with stable IDs, labels, and descriptions', () => {
    expect(listStylePresets().map((preset) => preset.id)).toEqual([...STYLE_PRESET_IDS]);
    expect(listMotionPresets().map((preset) => preset.id)).toEqual([...MOTION_PRESET_IDS]);
    expect(listAnimations().map((preset) => preset.id)).toEqual([...ANIMATION_IDS]);
    for (const preset of [...listStylePresets(), ...listMotionPresets(), ...listAnimations()]) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
    expect(getStylePreset('default')?.label).toBe('Default');
    expect(getStylePreset('missing')).toBeUndefined();
    expect(getMotionPreset('lively')?.tokens.duration).toBe('200ms');
    expect(getMotionPreset('missing')).toBeUndefined();
    expect(getAnimation('card-stagger')?.id).toBe('card-stagger');
    expect(getAnimation('spin-360')).toBeUndefined();
    expect(isStylePresetId('cinema-dark')).toBe(true);
    expect(isMotionPresetId('gentle')).toBe(true);
    expect(isAnimationId('button-press')).toBe(true);
    expect(isAnimationId('custom-css')).toBe(false);
  });
});

describe('tokens and CSS variables', () => {
  it('maps the reference glass tokens to --lkia custom properties', () => {
    const light = resolveStyleTokens({ presetId: 'default', mode: 'light' });
    expect(light.panel).toMatch(/rgba/);
    expect(light.glassBlur).toBe('18px');
    expect(light.backdropBlur).toBe('42px');
    const css = cssVariablesForTokens(light);
    expect(css).toContain('--lkia-bg: #F4EEE4;');
    expect(css).toContain('--lkia-panel:');
    expect(css).toContain('--lkia-glass-blur: 18px;');
    expect(css).toContain('--lkia-backdrop-blur: 42px;');
    expect(css).toContain('--lkia-ink-1:');
    expect(css).toContain('--lkia-accent-soft:');
  });

  it('resolves light, dark, and auto against a system preference', () => {
    const light = resolveStyleTokens({ presetId: 'default', mode: 'light' }, true);
    const dark = resolveStyleTokens({ presetId: 'default', mode: 'dark' }, false);
    const autoLight = resolveStyleTokens({ presetId: 'default', mode: 'auto' }, false);
    const autoDark = resolveStyleTokens({ presetId: 'default', mode: 'auto' }, true);
    expect(light.bg).not.toBe(dark.bg);
    expect(autoLight.bg).toBe(light.bg);
    expect(autoDark.bg).toBe(dark.bg);
    const cinema = resolveStyleTokens({ presetId: 'cinema-dark', mode: 'dark' });
    expect(cinema.bg).toBe('#0C0D12');
    expect(cinema.glassBlur).toBe('22px');
    expect(resolveStylePreset('unknown').id).toBe('default');
  });

  it('emits a stylesheet with both modes, motion, glass, and reduced-motion', () => {
    const css = interactiveActivitiesStylesheet({
      presetId: 'cinema-dark',
      mode: 'auto',
      motionPresetId: 'lively',
      fonts: { heading: 'Source Serif 4', body: 'Inter' },
    });
    expect(css).toContain('[data-lkia-root]');
    expect(css).toContain('[data-lkia-mode="light"]');
    expect(css).toContain('[data-lkia-mode="dark"]');
    expect(css).toContain('[data-lkia-mode="auto"]');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('backdrop-filter: blur(var(--lkia-glass-blur))');
    expect(css).toContain('filter: blur(var(--lkia-backdrop-blur)) saturate(1.25)');
    expect(css).toContain('--lkia-duration: 200ms;');
    expect(css).toContain('--lkia-font-heading: "Source Serif 4"');
    expect(css).toContain('@keyframes lkia-card-stagger');
    expect(css).toContain('@keyframes lkia-video-glide');
    expect(css).toContain('@keyframes lkia-panel-fade');
    expect(css).toContain('@keyframes lkia-answer-fade-up');
    expect(css).toContain('[data-animate="button-press"]');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation-name: lkia-fade');
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('@keyframes custom');
  });

  it('falls back to default motion and fonts when catalog IDs are unknown', () => {
    const css = interactiveActivitiesStylesheet({
      presetId: 'not-real',
      motionPresetId: 'bounce-forever',
      fonts: { heading: 'Comic Sans', body: 'Papyrus' },
    });
    expect(css).toContain('--lkia-bg: #F4EEE4;');
    expect(css).toContain('--lkia-duration: 280ms;');
    expect(css).toContain('--lkia-font-heading: "Fraunces"');
    expect(css).toContain('--lkia-font-body: "Inter"');
    expect(resolveMotionTokens('nope').duration).toBe('280ms');
    expect(resolveMotionTokens().duration).toBe('280ms');
    expect(resolveMotionTokens('gentle').durationSlow).toBe('700ms');
  });
});

describe('Google Fonts helpers', () => {
  it('builds a css2 CDN URL and an offline file list from the allow-list', () => {
    const url = googleFontsCssUrl(['Inter', 'Source Serif 4', 'Inter', 'Comic Sans']);
    expect(url).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Source+Serif+4:wght@400;600;700&display=swap',
    );
    expect(googleFontsCssUrl(['Comic Sans'])).toBe('');
    const files = googleFontsExportFiles(['Fraunces']);
    expect(files).toHaveLength(3);
    expect(files[0]).toMatchObject({
      family: 'Fraunces',
      weight: 400,
      style: 'normal',
      format: 'woff2',
      fileName: 'fraunces-400-normal.woff2',
    });
    expect(fontFileName('Source Serif 4', 700)).toBe('source-serif-4-700-normal.woff2');
    const manifest = googleFontsExportManifest(['Inter']);
    expect(manifest.cssUrl).toContain('family=Inter:wght@400;600;700');
    expect(manifest.files).toHaveLength(3);
  });

  it('resolves heading and body fonts per activity and writes local @font-face rules', () => {
    expect(resolveFontPair({ presetId: 'default' })).toEqual({
      heading: 'Fraunces',
      body: 'Inter',
    });
    expect(
      resolveFontPair({
        presetId: 'cinema-dark',
        fonts: { heading: 'Inter', body: 'Source Serif 4' },
      }),
    ).toEqual({ heading: 'Inter', body: 'Source Serif 4' });
    expect(hostedFontsCssUrl({ presetId: 'cinema-dark' })).toContain('Source+Serif+4');
    expect(hostedFontsCssUrl({ presetId: 'cinema-dark' })).toContain('family=Inter');
    const offline = offlineFontExport({ presetId: 'default' });
    expect(offline.cssUrl).toContain('fonts.googleapis.com');
    expect(offline.files.some((file) => file.family === 'Fraunces')).toBe(true);
    const local = localFontFaceCss(offline.files);
    expect(local).toContain('@font-face');
    expect(local).toContain('url("fonts/fraunces-400-normal.woff2")');
    expect(local).toContain('url("fonts/inter-400-normal.woff2")');
    expect(local).not.toContain('fonts.googleapis.com');
    expect(fontStack('Inter')).toContain('sans-serif');
    expect(listAllowedFonts().map((item) => item.family)).toEqual([...FONT_ALLOW_LIST]);
    expect(isAllowedFont('Fraunces')).toBe(true);
  });
});
