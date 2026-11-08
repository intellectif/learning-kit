/**
 * Known catalog IDs for validation. Editors and AI pick these by ID;
 * unknown values fail in the activity schemas. Token values, CSS, and
 * font helpers live beside this file.
 */
export const STYLE_PRESET_IDS = ['default', 'cinema-dark'] as const;
export const MOTION_PRESET_IDS = ['default', 'lively', 'gentle'] as const;
export const FONT_ALLOW_LIST = [
  'Inter',
  'Source Serif 4',
  'Fraunces',
  'Lexend',
  'Atkinson Hyperlegible Next',
  'Bricolage Grotesque',
  'Big Shoulders Display',
  'DM Sans',
  'Figtree',
  'Literata',
] as const;
export const ANIMATION_IDS = [
  'card-stagger',
  'video-glide',
  'panel-fade',
  'answer-fade-up',
  'button-press',
] as const;

export type StylePresetId = (typeof STYLE_PRESET_IDS)[number];
export type MotionPresetId = (typeof MOTION_PRESET_IDS)[number];
export type AllowedFont = (typeof FONT_ALLOW_LIST)[number];
export type AnimationId = (typeof ANIMATION_IDS)[number];

const styleIds = new Set<string>(STYLE_PRESET_IDS);
const motionIds = new Set<string>(MOTION_PRESET_IDS);
const fonts = new Set<string>(FONT_ALLOW_LIST);
const animationIds = new Set<string>(ANIMATION_IDS);

export function isStylePresetId(value: string): value is StylePresetId {
  return styleIds.has(value);
}

export function isMotionPresetId(value: string): value is MotionPresetId {
  return motionIds.has(value);
}

export function isAllowedFont(value: string): value is AllowedFont {
  return fonts.has(value);
}

export function isAnimationId(value: string): value is AnimationId {
  return animationIds.has(value);
}
