/**
 * Contracts for interactive activities: the template registry, validators, JSON
 * Schemas, drafts, AI authoring specs, the style catalog, fonts and xAPI. No
 * React and no DOM: usable on a server. The players are in
 * `@intellectif/lk-interactive-activities/player`.
 */

/** Published name of this package. */
export const PACKAGE_NAME = '@intellectif/lk-interactive-activities';

export type {
  AiCatalogEntry,
  AiCountRule,
  FreezeSuggestionSpec,
  TemplateAiSpec,
  VideoPromptSpec,
} from './contract/ai-spec.js';
export { BBB_WEBSITE_SHARE_ALLOW, BBB_WEBSITE_SHARE_SANDBOX } from './contract/embed.js';
export { isSafeMediaUrl } from './contract/read.js';
export type {
  AssetRef,
  ColorMode,
  StyleChoice,
  TemplateDefinition,
  TemplateMediaSlot,
  ValidationIssue,
  ValidationIssueCode,
  ValidationResult,
  VideoAspect,
} from './contract/types.js';
export type { PlayerEvent } from './events/types.js';
export type { PlayerEventXapiContext } from './events/xapi.js';
export { PLAYER_EVENT_XAPI_EXTENSION, playerEventToXapi } from './events/xapi.js';
export type { AssetUrlResolver } from './player/resolve-url.js';
export { defaultResolveUrl, resolveAssetUrl } from './player/resolve-url.js';
export type { InteractiveActivity } from './registry/templates.js';
export {
  getTemplate,
  listTemplates,
  registerInteractiveActivities,
  registerTemplate,
  validateInteractiveActivity,
} from './registry/templates.js';
export type { AnimationPreset, MotionPreset, MotionTokens } from './style/animations.js';
export {
  ANIMATION_CATALOG,
  getAnimation,
  getMotionPreset,
  listAnimations,
  listMotionPresets,
  MOTION_PRESETS,
  resolveMotionTokens,
} from './style/animations.js';
export type { AllowedFont, AnimationId, MotionPresetId, StylePresetId } from './style/catalog.js';
export {
  ANIMATION_IDS,
  FONT_ALLOW_LIST,
  isAllowedFont,
  isAnimationId,
  isMotionPresetId,
  isStylePresetId,
  MOTION_PRESET_IDS,
  STYLE_PRESET_IDS,
} from './style/catalog.js';
export { cssVariablesForTokens, interactiveActivitiesStylesheet } from './style/css.js';
export type {
  FontDefinition,
  FontExportFile,
  FontExportManifest,
  GoogleFontFile,
} from './style/fonts.js';
export {
  FONT_DEFINITIONS,
  fontFileName,
  fontStack,
  googleFontsCssUrl,
  googleFontsExportFiles,
  googleFontsExportManifest,
  hostedFontsCssUrl,
  listAllowedFonts,
  localFontFaceCss,
  offlineFontExport,
  parseGoogleFontsCss,
  resolveFontPair,
  uniqueAllowedFonts,
} from './style/fonts.js';
export type { StylePreset, StyleTokens } from './style/tokens.js';
export {
  getStylePreset,
  listStylePresets,
  resolveStylePreset,
  resolveStyleTokens,
  STYLE_PRESETS,
} from './style/tokens.js';
export { CINE_SCRAMBLE_AI_SPEC } from './templates/cine-scramble/ai-spec.js';
export type { CineScrambleChrome } from './templates/cine-scramble/copy.js';
export { CINE_SCRAMBLE_CHROME, cineScrambleChrome } from './templates/cine-scramble/copy.js';
export type { CineScrambleDraftCode } from './templates/cine-scramble/schema.js';
export {
  CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT,
  CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX,
  CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN,
  CINE_SCRAMBLE_JSON_SCHEMA,
  CINE_SCRAMBLE_SCENE_COUNT_DEFAULT,
  CINE_SCRAMBLE_SCENE_COUNT_MAX,
  CINE_SCRAMBLE_SCENE_COUNT_MIN,
  CINE_SCRAMBLE_SCHEMA_VERSION,
  CINE_SCRAMBLE_TYPE,
  checkCineScrambleDraft,
  cineScrambleMediaSlots,
  cineScrambleTemplate,
  cineScrambleType,
  createCineScrambleDraft,
  isVocabEnabled,
  validateCineScrambleData,
} from './templates/cine-scramble/schema.js';
export type {
  CineScrambleClip,
  CineScrambleCopy,
  CineScrambleData,
  CineScrambleResponse,
  CineScrambleScene,
  CineScrambleVocabItem,
} from './templates/cine-scramble/types.js';
export { WHAT_HAPPENS_AI_SPEC } from './templates/what-happens/ai-spec.js';
export type { ChromeLocale, WhatHappensChrome } from './templates/what-happens/copy.js';
export {
  DEFAULT_CHROME_LOCALE,
  WHAT_HAPPENS_CHROME,
  whatHappensChrome,
} from './templates/what-happens/copy.js';
export type { WhatHappensDraftCode } from './templates/what-happens/schema.js';
export {
  answerTextHash,
  checkWhatHappensDraft,
  createWhatHappensDraft,
  isAnswerAudioCurrent,
  isSupportsEnabled,
  validateWhatHappensData,
  WHAT_HAPPENS_CLIP_COUNT_DEFAULT,
  WHAT_HAPPENS_CLIP_COUNT_MAX,
  WHAT_HAPPENS_CLIP_COUNT_MIN,
  WHAT_HAPPENS_JSON_SCHEMA,
  WHAT_HAPPENS_SCHEMA_VERSION,
  WHAT_HAPPENS_TYPE,
  whatHappensMediaSlots,
  whatHappensTemplate,
  whatHappensType,
} from './templates/what-happens/schema.js';
export type {
  WhatHappensClip,
  WhatHappensCopy,
  WhatHappensData,
  WhatHappensResponse,
} from './templates/what-happens/types.js';
export type { SupportMatch } from './templates/what-happens/underline.js';
export { matchSupportsInAnswer } from './templates/what-happens/underline.js';
