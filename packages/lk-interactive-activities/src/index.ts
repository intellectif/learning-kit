/** Published name of this package. */
export const PACKAGE_NAME = '@intellectif/lk-interactive-activities';

export type {
  AiCatalogEntry,
  AiCountRule,
  FreezeSuggestionSpec,
  TemplateAiSpec,
  VideoPromptSpec,
} from './contract/ai-spec.js';
export type {
  AssetRef,
  ColorMode,
  StyleChoice,
  TemplateDefinition,
  TemplateMediaSlot,
  ValidationIssue,
  ValidationResult,
  VideoAspect,
} from './contract/types.js';
export type { PlayerEventXapiContext } from './events/xapi.js';
export { PLAYER_EVENT_XAPI_EXTENSION, playerEventToXapi } from './events/xapi.js';
export {
  BBB_WEBSITE_SHARE_ALLOW,
  BBB_WEBSITE_SHARE_SANDBOX,
  postEmbedResize,
} from './player/embed.js';
export type { PlayerEvent } from './player/events.js';
export type { InteractiveActivityPlayerProps } from './player/InteractiveActivityPlayer.js';
export { InteractiveActivityPlayer } from './player/InteractiveActivityPlayer.js';
export type { PlayerViewport } from './player/layout.js';
export { resolveLayout, STAGE_HEIGHT, STAGE_WIDTH, stageScale } from './player/layout.js';
export type { AssetUrlResolver } from './player/resolve-url.js';
export { defaultResolveUrl, resolveAssetUrl } from './player/resolve-url.js';
export type { PlayerHostOptions } from './player/types.js';
export {
  getTemplate,
  listTemplates,
  registerInteractiveActivities,
  registerTemplate,
} from './registry/templates.js';
export type {
  AnimationPreset,
  MotionPreset,
  MotionTokens,
} from './style/animations.js';
export {
  ANIMATION_CATALOG,
  getAnimation,
  getMotionPreset,
  listAnimations,
  listMotionPresets,
  MOTION_PRESETS,
  resolveMotionTokens,
} from './style/animations.js';
export type {
  AllowedFont,
  AnimationId,
  MotionPresetId,
  StylePresetId,
} from './style/catalog.js';
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
export {
  CINE_SCRAMBLE_CHROME,
  cineScrambleChrome,
} from './templates/cine-scramble/copy.js';
export type { CineScramblePlayerProps } from './templates/cine-scramble/player/CineScramblePlayer.js';
export { CineScramblePlayer } from './templates/cine-scramble/player/CineScramblePlayer.js';
export type {
  CineScrambleClip,
  CineScrambleCopy,
  CineScrambleData,
  CineScrambleResponse,
  CineScrambleScene,
  CineScrambleVocabItem,
} from './templates/cine-scramble/schema.js';
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
  cineScrambleTemplate,
  cineScrambleType,
  createCineScrambleDraft,
  isVocabEnabled,
  validateCineScrambleData,
} from './templates/cine-scramble/schema.js';
export { WHAT_HAPPENS_AI_SPEC } from './templates/what-happens/ai-spec.js';
export type { ChromeLocale, WhatHappensChrome } from './templates/what-happens/copy.js';
export {
  DEFAULT_CHROME_LOCALE,
  WHAT_HAPPENS_CHROME,
  whatHappensChrome,
} from './templates/what-happens/copy.js';
export type { WhatHappensPlayerProps } from './templates/what-happens/player/WhatHappensPlayer.js';
export { WhatHappensPlayer } from './templates/what-happens/player/WhatHappensPlayer.js';
export type {
  WhatHappensClip,
  WhatHappensCopy,
  WhatHappensData,
  WhatHappensResponse,
} from './templates/what-happens/schema.js';
export {
  createWhatHappensDraft,
  isSupportsEnabled,
  validateWhatHappensData,
  WHAT_HAPPENS_CLIP_COUNT_DEFAULT,
  WHAT_HAPPENS_CLIP_COUNT_MAX,
  WHAT_HAPPENS_CLIP_COUNT_MIN,
  WHAT_HAPPENS_JSON_SCHEMA,
  WHAT_HAPPENS_SCHEMA_VERSION,
  WHAT_HAPPENS_TYPE,
  whatHappensTemplate,
  whatHappensType,
} from './templates/what-happens/schema.js';
export type { SupportMatch } from './templates/what-happens/underline.js';
export { matchSupportsInAnswer } from './templates/what-happens/underline.js';
