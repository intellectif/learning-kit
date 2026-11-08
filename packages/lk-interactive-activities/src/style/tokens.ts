import type { StyleChoice } from '../contract/types.js';
import {
  type AllowedFont,
  isStylePresetId,
  type MotionPresetId,
  type StylePresetId,
} from './catalog.js';

export interface StyleTokens {
  bg: string;
  panel: string;
  line: string;
  ink1: string;
  ink2: string;
  ink3: string;
  accent: string;
  accentSoft: string;
  frost: string;
  veil: string;
  radiusPanel: string;
  radiusVideo: string;
  radiusButton: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  glassBlur: string;
  backdropBlur: string;
}

export interface StylePreset {
  id: StylePresetId;
  label: string;
  description: string;
  defaultFonts: { heading: AllowedFont; body: AllowedFont };
  defaultMotionPresetId: MotionPresetId;
  tokens: { light: StyleTokens; dark: StyleTokens };
}

const sharedRadii = {
  radiusPanel: '1.5rem',
  radiusVideo: '1.15rem',
  radiusButton: '999px',
} as const;

const cinemaRadii = {
  radiusPanel: '1.25rem',
  radiusVideo: '0.85rem',
  radiusButton: '999px',
} as const;

const DEFAULT_LIGHT: StyleTokens = {
  bg: '#F4EEE4',
  panel: 'rgba(255, 252, 247, 0.64)',
  line: 'rgba(48, 40, 32, 0.12)',
  ink1: '#1F1A16',
  ink2: '#4A433C',
  ink3: '#7A7268',
  accent: '#C45C26',
  accentSoft: 'rgba(196, 92, 38, 0.16)',
  frost: 'rgba(255, 255, 255, 0.46)',
  veil: 'rgba(244, 238, 228, 0.58)',
  ...sharedRadii,
  shadowSm: '0 1px 2px rgba(31, 26, 22, 0.06), 0 4px 12px rgba(31, 26, 22, 0.06)',
  shadowMd: '0 8px 28px rgba(31, 26, 22, 0.12), 0 2px 8px rgba(31, 26, 22, 0.06)',
  shadowLg: '0 24px 60px rgba(31, 26, 22, 0.18)',
  glassBlur: '18px',
  backdropBlur: '42px',
};

const DEFAULT_DARK: StyleTokens = {
  bg: '#1B1714',
  panel: 'rgba(44, 38, 34, 0.58)',
  line: 'rgba(244, 238, 228, 0.12)',
  ink1: '#F4EEE4',
  ink2: '#C9C0B5',
  ink3: '#8C847A',
  accent: '#E08A52',
  accentSoft: 'rgba(224, 138, 82, 0.2)',
  frost: 'rgba(255, 255, 255, 0.08)',
  veil: 'rgba(14, 12, 10, 0.55)',
  ...sharedRadii,
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.24), 0 4px 14px rgba(0, 0, 0, 0.18)',
  shadowMd: '0 10px 32px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.2)',
  shadowLg: '0 28px 64px rgba(0, 0, 0, 0.42)',
  glassBlur: '16px',
  backdropBlur: '48px',
};

const CINEMA_DARK: StyleTokens = {
  bg: '#0C0D12',
  panel: 'rgba(22, 24, 32, 0.56)',
  line: 'rgba(236, 226, 204, 0.14)',
  ink1: '#F3EBDD',
  ink2: '#C4BBA8',
  ink3: '#8A8476',
  accent: '#E0C07A',
  accentSoft: 'rgba(224, 192, 122, 0.18)',
  frost: 'rgba(255, 252, 244, 0.08)',
  veil: 'rgba(6, 7, 10, 0.62)',
  ...cinemaRadii,
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.4), 0 6px 16px rgba(0, 0, 0, 0.28)',
  shadowMd: '0 14px 40px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.28)',
  shadowLg: '0 32px 80px rgba(0, 0, 0, 0.55)',
  glassBlur: '22px',
  backdropBlur: '64px',
};

const CINEMA_LIGHT: StyleTokens = {
  bg: '#F2EBDD',
  panel: 'rgba(255, 251, 244, 0.7)',
  line: 'rgba(32, 28, 22, 0.12)',
  ink1: '#19160F',
  ink2: '#4A453A',
  ink3: '#7A7466',
  accent: '#8A5A12',
  accentSoft: 'rgba(138, 90, 18, 0.14)',
  frost: 'rgba(255, 255, 255, 0.5)',
  veil: 'rgba(242, 235, 221, 0.5)',
  ...cinemaRadii,
  shadowSm: '0 1px 2px rgba(25, 22, 15, 0.06), 0 4px 12px rgba(25, 22, 15, 0.06)',
  shadowMd: '0 10px 28px rgba(25, 22, 15, 0.12), 0 2px 8px rgba(25, 22, 15, 0.06)',
  shadowLg: '0 24px 56px rgba(25, 22, 15, 0.16)',
  glassBlur: '18px',
  backdropBlur: '40px',
};

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'default',
    label: 'Default',
    description:
      'Warm frosted glass panels, a softly blurred backdrop, and layered shadows for classroom activities.',
    defaultFonts: { heading: 'Fraunces', body: 'Inter' },
    defaultMotionPresetId: 'default',
    tokens: { light: DEFAULT_LIGHT, dark: DEFAULT_DARK },
  },
  {
    id: 'cinema-dark',
    label: 'Cinema Dark',
    description:
      'A dark cinema stage with frosted panels, a heavy backdrop blur, and gold accents. Not tied to any film.',
    defaultFonts: { heading: 'Source Serif 4', body: 'Inter' },
    defaultMotionPresetId: 'gentle',
    tokens: { light: CINEMA_LIGHT, dark: CINEMA_DARK },
  },
];

const styleById = new Map(STYLE_PRESETS.map((preset) => [preset.id, preset]));

export function getStylePreset(id: string): StylePreset | undefined {
  return styleById.get(id as StylePresetId);
}

export function listStylePresets(): StylePreset[] {
  return [...STYLE_PRESETS];
}

export function resolveStylePreset(presetId?: string): StylePreset {
  const found = presetId !== undefined ? getStylePreset(presetId) : undefined;
  if (found) {
    return found;
  }
  const fallback = getStylePreset('default');
  if (!fallback) {
    throw new Error('Default style preset is missing.');
  }
  return fallback;
}

export function resolveStyleTokens(
  style: StyleChoice = { presetId: 'default' },
  systemPrefersDark = false,
): StyleTokens {
  const preset = resolveStylePreset(isStylePresetId(style.presetId) ? style.presetId : 'default');
  const mode =
    style.mode === 'dark' || (style.mode === 'auto' && systemPrefersDark) ? 'dark' : 'light';
  return preset.tokens[mode];
}
