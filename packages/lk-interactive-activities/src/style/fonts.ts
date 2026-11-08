import type { StyleChoice } from '../contract/types.js';
import { type AllowedFont, FONT_ALLOW_LIST, isAllowedFont } from './catalog.js';
import { resolveStylePreset } from './tokens.js';

export interface FontDefinition {
  family: AllowedFont;
  weights: readonly number[];
  fallback: string;
}

export interface FontExportFile {
  family: AllowedFont;
  weight: number;
  style: 'normal';
  format: 'woff2';
  fileName: string;
}

export interface FontExportManifest {
  cssUrl: string;
  files: FontExportFile[];
}

export const FONT_DEFINITIONS: Record<AllowedFont, FontDefinition> = {
  Inter: {
    family: 'Inter',
    weights: [400, 600, 700],
    fallback: 'ui-sans-serif, system-ui, sans-serif',
  },
  'Source Serif 4': {
    family: 'Source Serif 4',
    weights: [400, 600, 700],
    fallback: 'ui-serif, Georgia, serif',
  },
  Fraunces: {
    family: 'Fraunces',
    weights: [400, 600, 700],
    fallback: 'ui-serif, Georgia, serif',
  },
  Lexend: {
    family: 'Lexend',
    weights: [400, 600, 700],
    fallback: 'ui-sans-serif, system-ui, sans-serif',
  },
  'Atkinson Hyperlegible Next': {
    family: 'Atkinson Hyperlegible Next',
    weights: [400, 600, 700],
    fallback: 'ui-sans-serif, system-ui, sans-serif',
  },
  'Bricolage Grotesque': {
    family: 'Bricolage Grotesque',
    weights: [400, 600, 700],
    fallback: 'ui-sans-serif, system-ui, sans-serif',
  },
  'Big Shoulders Display': {
    family: 'Big Shoulders Display',
    weights: [400, 600, 700],
    fallback: '"Arial Narrow", ui-sans-serif, system-ui, sans-serif',
  },
  'DM Sans': {
    family: 'DM Sans',
    weights: [400, 600, 700],
    fallback: 'ui-sans-serif, system-ui, sans-serif',
  },
  Figtree: {
    family: 'Figtree',
    weights: [400, 600, 700],
    fallback: 'ui-sans-serif, system-ui, sans-serif',
  },
  Literata: {
    family: 'Literata',
    weights: [400, 600, 700],
    fallback: 'ui-serif, Georgia, serif',
  },
};

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2';

export function listAllowedFonts(): FontDefinition[] {
  return FONT_ALLOW_LIST.map((family) => FONT_DEFINITIONS[family]);
}

export function uniqueAllowedFonts(families: readonly string[]): AllowedFont[] {
  const unique: AllowedFont[] = [];
  for (const family of families) {
    if (isAllowedFont(family) && !unique.includes(family)) {
      unique.push(family);
    }
  }
  return unique;
}

export function resolveFontPair(style: StyleChoice = { presetId: 'default' }): {
  heading: AllowedFont;
  body: AllowedFont;
} {
  const preset = resolveStylePreset(style.presetId);
  const heading =
    style.fonts?.heading !== undefined && isAllowedFont(style.fonts.heading)
      ? style.fonts.heading
      : preset.defaultFonts.heading;
  const body =
    style.fonts?.body !== undefined && isAllowedFont(style.fonts.body)
      ? style.fonts.body
      : preset.defaultFonts.body;
  return { heading, body };
}

export function fontStack(family: AllowedFont): string {
  const definition = FONT_DEFINITIONS[family];
  return `"${definition.family}", ${definition.fallback}`;
}

function encodeGoogleFamily(family: AllowedFont): string {
  return family.replace(/ /g, '+');
}

export function fontFileName(family: AllowedFont, weight: number): string {
  return `${family.toLowerCase().replace(/ /g, '-')}-${weight}-normal.woff2`;
}

export function googleFontsCssUrl(families: readonly string[]): string {
  const allowed = uniqueAllowedFonts(families);
  if (allowed.length === 0) {
    return '';
  }
  const params = allowed.map((family) => {
    const weights = FONT_DEFINITIONS[family].weights.join(';');
    return `family=${encodeGoogleFamily(family)}:wght@${weights}`;
  });
  return `${GOOGLE_FONTS_CSS}?${params.join('&')}&display=swap`;
}

export function googleFontsExportFiles(families: readonly string[]): FontExportFile[] {
  const files: FontExportFile[] = [];
  for (const family of uniqueAllowedFonts(families)) {
    for (const weight of FONT_DEFINITIONS[family].weights) {
      files.push({
        family,
        weight,
        style: 'normal',
        format: 'woff2',
        fileName: fontFileName(family, weight),
      });
    }
  }
  return files;
}

export function googleFontsExportManifest(families: readonly string[]): FontExportManifest {
  return {
    cssUrl: googleFontsCssUrl(families),
    files: googleFontsExportFiles(families),
  };
}

export function localFontFaceCss(files: readonly FontExportFile[], directory = 'fonts'): string {
  return files
    .map((file) => {
      const path = `${directory.replace(/\/$/, '')}/${file.fileName}`;
      return [
        '@font-face {',
        `  font-family: "${file.family}";`,
        `  font-style: ${file.style};`,
        `  font-weight: ${file.weight};`,
        '  font-display: swap;',
        `  src: url("${path}") format("${file.format}");`,
        '}',
      ].join('\n');
    })
    .join('\n');
}

export function hostedFontsCssUrl(style: StyleChoice = { presetId: 'default' }): string {
  const pair = resolveFontPair(style);
  return googleFontsCssUrl([pair.heading, pair.body]);
}

export function offlineFontExport(
  style: StyleChoice = { presetId: 'default' },
): FontExportManifest {
  const pair = resolveFontPair(style);
  return googleFontsExportManifest([pair.heading, pair.body]);
}
