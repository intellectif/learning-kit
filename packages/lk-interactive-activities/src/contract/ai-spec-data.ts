import { ANIMATION_CATALOG, MOTION_PRESETS } from '../style/animations.js';
import { FONT_ALLOW_LIST, MOTION_PRESET_IDS, STYLE_PRESET_IDS } from '../style/catalog.js';
import { FONT_DEFINITIONS } from '../style/fonts.js';
import { STYLE_PRESETS } from '../style/tokens.js';
import type { TemplateAiSpec } from './ai-spec.js';

/** Catalog metadata only: never send CSS, keyframes or token bundles to the model. */
export const aiCatalogs: TemplateAiSpec['catalogs'] = {
  styles: STYLE_PRESETS.map(({ id, label, description }) => ({ id, label, description })),
  motions: MOTION_PRESETS.map(({ id, label, description }) => ({ id, label, description })),
  animations: ANIMATION_CATALOG.map(({ id, label, description }) => ({ id, label, description })),
  fonts: FONT_ALLOW_LIST.map((family) => ({
    id: family,
    label: family,
    description: `${family}; weights ${FONT_DEFINITIONS[family].weights.join(', ')}; ${FONT_DEFINITIONS[family].fallback}.`,
  })),
};

/** Text the model must write: never empty (the validator refuses empty labels and prompts). */
export const textField = { type: 'string', minLength: 1 };
export const titleField = { type: 'string', minLength: 1 };
export const videoPromptField = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: titleField },
};
export const styleField = {
  type: 'object',
  additionalProperties: false,
  required: ['presetId'],
  properties: {
    presetId: { type: 'string', enum: [...STYLE_PRESET_IDS] },
    mode: { type: 'string', enum: ['light', 'dark', 'auto'] },
    motionPresetId: { type: 'string', enum: [...MOTION_PRESET_IDS] },
    fonts: {
      type: 'object',
      additionalProperties: false,
      properties: {
        heading: { type: 'string', enum: [...FONT_ALLOW_LIST] },
        body: { type: 'string', enum: [...FONT_ALLOW_LIST] },
      },
    },
  },
};
export const styleFields = [
  'style.presetId',
  'style.mode',
  'style.motionPresetId',
  'style.fonts.heading',
  'style.fonts.body',
];
export const sharedAiRules = [
  'Choose only catalog IDs. Never invent CSS, keyframes, font families or catalog IDs.',
  'Animation IDs describe the built-in transitions; choose style.motionPresetId, not a new animation field.',
  'The host supplies IDs, schemaVersion, type, locale, media references, actual durations and provenance.',
  'Return only writable fields. Merge content into host-owned slots, then run template.validate().',
  'Validation failures must be shown to the editor, not silently repaired. Editor review is required.',
  'No model clients, media reads, video-generation API calls, speech grading or XP belong in this package.',
  'Strict structured-output modes may drop minLength, minItems, maxItems, uniqueItems and exclusiveMinimum from this schema; template.validate() enforces them all, so always validate the merged draft.',
];
