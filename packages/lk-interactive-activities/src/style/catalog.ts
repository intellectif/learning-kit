/**
 * Known catalog IDs for M3 validation. M4 owns the token bundles and CSS;
 * unknown IDs must already fail here so generated activities cannot invent them.
 */
export const STYLE_PRESET_IDS = ['default', 'cinema-dark'] as const;
export const MOTION_PRESET_IDS = ['default', 'lively', 'gentle'] as const;
export const FONT_ALLOW_LIST = ['Inter', 'Source Serif 4', 'Fraunces'] as const;

export type StylePresetId = (typeof STYLE_PRESET_IDS)[number];
export type MotionPresetId = (typeof MOTION_PRESET_IDS)[number];
export type AllowedFont = (typeof FONT_ALLOW_LIST)[number];

const styleIds = new Set<string>(STYLE_PRESET_IDS);
const motionIds = new Set<string>(MOTION_PRESET_IDS);
const fonts = new Set<string>(FONT_ALLOW_LIST);

export function isStylePresetId(value: string): value is StylePresetId {
  return styleIds.has(value);
}

export function isMotionPresetId(value: string): value is MotionPresetId {
  return motionIds.has(value);
}

export function isAllowedFont(value: string): value is AllowedFont {
  return fonts.has(value);
}
