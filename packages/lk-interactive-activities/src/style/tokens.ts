import type { StyleChoice } from '../contract/types.js';
import {
  type AllowedFont,
  isStylePresetId,
  type MotionPresetId,
  type StylePresetId,
} from './catalog.js';

export interface StyleTokens {
  /** The ground the player sits on. */
  bg: string;
  /** Surfaces one tone step from the ground: panels, cards, buttons. */
  panel: string;
  /** A second tone step: empty drop zones, pressed controls, chips. */
  surfaceStrong: string;
  /** Edges where a state needs one (a dashed empty slot); never a resting divider. */
  line: string;
  ink1: string;
  ink2: string;
  ink3: string;
  accent: string;
  accentSoft: string;
  /** Text and icons on an accent fill. */
  onAccent: string;
  /** A right answer's mark. Never the only signal: an icon and words go with it. */
  positive: string;
  /** A wrong answer's mark. Never the only signal: an icon and words go with it. */
  negative: string;
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

const classroomRadii = {
  radiusPanel: '28px',
  radiusVideo: '22px',
  radiusButton: '999px',
} as const;

const cinemaRadii = {
  radiusPanel: '14px',
  radiusVideo: '8px',
  radiusButton: '999px',
} as const;

/** Chalkboard green on a cool paper ground: calm, high contrast, readable from the back row. */
const DEFAULT_LIGHT: StyleTokens = {
  bg: '#F2F4F1',
  panel: '#E4E9E4',
  surfaceStrong: '#D3DBD4',
  line: '#6E7C74',
  ink1: '#111714',
  ink2: '#37423C',
  ink3: '#4B5650',
  accent: '#0B6E4F',
  accentSoft: 'rgba(11, 110, 79, 0.14)',
  onAccent: '#FFFFFF',
  positive: '#0B6E4F',
  negative: '#B42318',
  frost: 'rgba(242, 244, 241, 0.72)',
  veil: 'rgba(242, 244, 241, 0.55)',
  ...classroomRadii,
  shadowSm: '0 2px 6px rgba(17, 23, 20, 0.10)',
  shadowMd: '0 12px 32px rgba(17, 23, 20, 0.14)',
  shadowLg: '0 28px 64px rgba(17, 23, 20, 0.24)',
  glassBlur: '20px',
  backdropBlur: '48px',
};

const DEFAULT_DARK: StyleTokens = {
  bg: '#0F1412',
  panel: '#1A211E',
  surfaceStrong: '#26302B',
  line: '#7D8E86',
  ink1: '#EEF3EF',
  ink2: '#C2CCC6',
  ink3: '#A3AFA9',
  accent: '#46D19E',
  accentSoft: 'rgba(70, 209, 158, 0.18)',
  onAccent: '#06140E',
  positive: '#46D19E',
  negative: '#FF8A7A',
  frost: 'rgba(15, 20, 18, 0.62)',
  veil: 'rgba(8, 11, 10, 0.6)',
  ...classroomRadii,
  shadowSm: '0 2px 6px rgba(0, 0, 0, 0.35)',
  shadowMd: '0 14px 36px rgba(0, 0, 0, 0.45)',
  shadowLg: '0 30px 72px rgba(0, 0, 0, 0.6)',
  glassBlur: '20px',
  backdropBlur: '56px',
};

/** A screening room: near-black, warm screen-white text, projector amber. */
const CINEMA_DARK: StyleTokens = {
  bg: '#0A0A0B',
  panel: '#161618',
  surfaceStrong: '#232326',
  line: '#8A8A91',
  ink1: '#F6F2E9',
  ink2: '#CFC9BD',
  ink3: '#ABA59A',
  accent: '#F4B740',
  accentSoft: 'rgba(244, 183, 64, 0.16)',
  onAccent: '#1A1205',
  positive: '#7FD99A',
  negative: '#FF8473',
  frost: 'rgba(10, 10, 11, 0.6)',
  veil: 'rgba(5, 5, 6, 0.62)',
  ...cinemaRadii,
  shadowSm: '0 2px 8px rgba(0, 0, 0, 0.5)',
  shadowMd: '0 16px 40px rgba(0, 0, 0, 0.6)',
  shadowLg: '0 32px 80px rgba(0, 0, 0, 0.75)',
  glassBlur: '24px',
  backdropBlur: '64px',
};

/** The same room with the lights up: cool grey ground, deep amber. */
const CINEMA_LIGHT: StyleTokens = {
  bg: '#EBEBEE',
  panel: '#DCDCE1',
  surfaceStrong: '#CACACF',
  line: '#6A6A72',
  ink1: '#121214',
  ink2: '#38383D',
  ink3: '#47474E',
  accent: '#8A4F00',
  accentSoft: 'rgba(138, 79, 0, 0.13)',
  onAccent: '#FFFFFF',
  positive: '#1D6B36',
  negative: '#B42318',
  frost: 'rgba(235, 235, 238, 0.72)',
  veil: 'rgba(235, 235, 238, 0.55)',
  ...cinemaRadii,
  shadowSm: '0 2px 6px rgba(18, 18, 20, 0.12)',
  shadowMd: '0 12px 32px rgba(18, 18, 20, 0.16)',
  shadowLg: '0 28px 64px rgba(18, 18, 20, 0.26)',
  glassBlur: '20px',
  backdropBlur: '48px',
};

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'default',
    label: 'Default',
    description:
      'A calm classroom look: cool paper ground, chalkboard-green actions, large readable type (Lexend), and frosted panels over a clip’s blurred poster.',
    defaultFonts: { heading: 'Bricolage Grotesque', body: 'Lexend' },
    defaultMotionPresetId: 'default',
    tokens: { light: DEFAULT_LIGHT, dark: DEFAULT_DARK },
  },
  {
    id: 'cinema-dark',
    label: 'Cinema Dark',
    description:
      'A screening room: near-black stage, screen-white captions, projector-amber actions and condensed marquee titles. Not tied to any film.',
    defaultFonts: { heading: 'Big Shoulders Display', body: 'Atkinson Hyperlegible Next' },
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
  // No mode means `auto`, as in the player: the viewer's system setting.
  const mode = style.mode ?? 'auto';
  return preset.tokens[
    mode === 'dark' || (mode === 'auto' && systemPrefersDark) ? 'dark' : 'light'
  ];
}
