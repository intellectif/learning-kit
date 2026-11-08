# @intellectif/lk-interactive-activities — public API surface

Generated from the BUILT `.d.ts` by `pnpm api-report`. A diff here is a
semver question, not an error: decide patch / minor / major, then commit
this file with the changeset that explains it.

## @intellectif/lk-interactive-activities

```ts
const ANIMATION_CATALOG: ANIMATION_CATALOG: readonly AnimationPreset[]
const ANIMATION_IDS: ANIMATION_IDS: readonly ["card-stagger", "video-glide", "panel-fade", "answer-fade-up", "button-press"]
const BBB_WEBSITE_SHARE_ALLOW: BBB_WEBSITE_SHARE_ALLOW = "fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write"
const BBB_WEBSITE_SHARE_SANDBOX: BBB_WEBSITE_SHARE_SANDBOX = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals allow-downloads"
const CINE_SCRAMBLE_CHROME: CINE_SCRAMBLE_CHROME: { readonly en: { readonly checkLabel: "Check"; readonly clipLabel: "Clip"; readonly closeLabel: "Close"; readonly completeLabel: "Story complete"; readonly correctLabel: "Correct"; readonly incorrectLabel: "Try again"; readonly keyboardHelp: "Focus a clip and press 1–6 to place it. Delete on a slot returns it to the pool. Press C to check."; readonly mediaError: "Media unavailable"; readonly playFallback: "Play"; readonly poolLabel: "Clip pool"; readonly removeLabel: "Return to pool"; readonly sceneLabel: "Scene"; readonly slotLabel: "Slot"; readonly startLabel: "Start"; readonly vocabButtonLabel: "Vocabulary"; }; readonly es: { readonly checkLabel: "Comprobar"; readonly clipLabel: "Clip"; readonly closeLabel: "Cerrar"; readonly completeLabel: "Historia completa"; readonly correctLabel: "Correcto"; readonly incorrectLabel: "Inténtalo de nuevo"; readonly keyboardHelp: "Enfoca un clip y pulsa 1–6 para colocarlo. Supr en una posición lo devuelve. Pulsa C para comprobar."; readonly mediaError: "Medio no disponible"; readonly playFallback: "Reproducir"; readonly poolLabel: "Clips disponibles"; readonly removeLabel: "Devolver a los clips disponibles"; readonly sceneLabel: "Escena"; readonly slotLabel: "Posición"; readonly startLabel: "Comenzar"; readonly vocabButtonLabel: "Vocabulario"; }; }
const CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT: CINE_SCRAMBLE_CLIPS_PER_SCENE_DEFAULT = 4
const CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX: CINE_SCRAMBLE_CLIPS_PER_SCENE_MAX = 6
const CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN: CINE_SCRAMBLE_CLIPS_PER_SCENE_MIN = 3
const CINE_SCRAMBLE_JSON_SCHEMA: CINE_SCRAMBLE_JSON_SCHEMA: Record<string, unknown>
const CINE_SCRAMBLE_SCENE_COUNT_DEFAULT: CINE_SCRAMBLE_SCENE_COUNT_DEFAULT = 1
const CINE_SCRAMBLE_SCENE_COUNT_MAX: CINE_SCRAMBLE_SCENE_COUNT_MAX = 8
const CINE_SCRAMBLE_SCENE_COUNT_MIN: CINE_SCRAMBLE_SCENE_COUNT_MIN = 1
const CINE_SCRAMBLE_SCHEMA_VERSION: CINE_SCRAMBLE_SCHEMA_VERSION = "1.0"
const CINE_SCRAMBLE_TYPE: CINE_SCRAMBLE_TYPE = "cine-scramble"
const cineScrambleTemplate: cineScrambleTemplate: TemplateDefinition<CineScrambleData>
const cineScrambleType: cineScrambleType: ActivityTypeDescriptor<CineScrambleData, CineScrambleResponse>
const DEFAULT_CHROME_LOCALE: DEFAULT_CHROME_LOCALE = "en"
const FONT_ALLOW_LIST: FONT_ALLOW_LIST: readonly ["Inter", "Source Serif 4", "Fraunces"]
const FONT_DEFINITIONS: FONT_DEFINITIONS: Record<AllowedFont, FontDefinition>
const MOTION_PRESET_IDS: MOTION_PRESET_IDS: readonly ["default", "lively", "gentle"]
const MOTION_PRESETS: MOTION_PRESETS: readonly MotionPreset[]
const PACKAGE_NAME: PACKAGE_NAME = "@intellectif/lk-interactive-activities"
const STAGE_HEIGHT: STAGE_HEIGHT = 1080
const STAGE_WIDTH: STAGE_WIDTH = 1920
const STYLE_PRESET_IDS: STYLE_PRESET_IDS: readonly ["default", "cinema-dark"]
const STYLE_PRESETS: STYLE_PRESETS: readonly StylePreset[]
const WHAT_HAPPENS_CHROME: WHAT_HAPPENS_CHROME: { readonly en: { readonly answerLabel: "Sample answer"; readonly listenButton: "Listen"; readonly mediaError: "Media unavailable"; readonly nextButton: "Next"; readonly playFallback: "Play"; readonly predictTitle: "What happens next?"; readonly replayToFreeze: "Replay to freeze"; readonly revealButton: "Reveal"; readonly showAnswer: "Show answer"; readonly supportsLabel: "To help you"; readonly tellTitle: "Tell the story"; }; readonly es: { readonly answerLabel: "Respuesta de ejemplo"; readonly listenButton: "Escuchar"; readonly mediaError: "Medio no disponible"; readonly nextButton: "Siguiente"; readonly playFallback: "Reproducir"; readonly predictTitle: "¿Qué pasa después?"; readonly replayToFreeze: "Repetir hasta la pausa"; readonly revealButton: "Revelar"; readonly showAnswer: "Mostrar respuesta"; readonly supportsLabel: "Para ayudarte"; readonly tellTitle: "Cuenta la historia"; }; }
const WHAT_HAPPENS_CLIP_COUNT_DEFAULT: WHAT_HAPPENS_CLIP_COUNT_DEFAULT = 8
const WHAT_HAPPENS_CLIP_COUNT_MAX: WHAT_HAPPENS_CLIP_COUNT_MAX = 12
const WHAT_HAPPENS_CLIP_COUNT_MIN: WHAT_HAPPENS_CLIP_COUNT_MIN = 1
const WHAT_HAPPENS_JSON_SCHEMA: WHAT_HAPPENS_JSON_SCHEMA: Record<string, unknown>
const WHAT_HAPPENS_SCHEMA_VERSION: WHAT_HAPPENS_SCHEMA_VERSION = "1.0"
const WHAT_HAPPENS_TYPE: WHAT_HAPPENS_TYPE = "what-happens"
const whatHappensTemplate: whatHappensTemplate: TemplateDefinition<WhatHappensData>
const whatHappensType: whatHappensType: ActivityTypeDescriptor<WhatHappensData, WhatHappensResponse>
function cineScrambleChrome: declare function cineScrambleChrome(locale?: string): CineScrambleChrome;
function CineScramblePlayer: declare function CineScramblePlayer({ activity, ...host }: CineScramblePlayerProps): JSX.Element;
function createCineScrambleDraft: declare function createCineScrambleDraft(id?: string): CineScrambleData;
function createWhatHappensDraft: declare function createWhatHappensDraft(id?: string): WhatHappensData;
function cssVariablesForTokens: declare function cssVariablesForTokens(tokens: StyleTokens): string;
function defaultResolveUrl: declare function defaultResolveUrl(asset: AssetRef): string;
function fontFileName: declare function fontFileName(family: AllowedFont, weight: number): string;
function fontStack: declare function fontStack(family: AllowedFont): string;
function getAnimation: declare function getAnimation(id: string): AnimationPreset | undefined;
function getMotionPreset: declare function getMotionPreset(id: string): MotionPreset | undefined;
function getStylePreset: declare function getStylePreset(id: string): StylePreset | undefined;
function getTemplate: declare function getTemplate(id: string): TemplateDefinition | undefined;
function googleFontsCssUrl: declare function googleFontsCssUrl(families: readonly string[]): string;
function googleFontsExportFiles: declare function googleFontsExportFiles(families: readonly string[]): FontExportFile[];
function googleFontsExportManifest: declare function googleFontsExportManifest(families: readonly string[]): FontExportManifest;
function hostedFontsCssUrl: declare function hostedFontsCssUrl(style?: StyleChoice): string;
function interactiveActivitiesStylesheet: declare function interactiveActivitiesStylesheet(style?: StyleChoice): string;
function InteractiveActivityPlayer: declare function InteractiveActivityPlayer({ activity, ...host }: InteractiveActivityPlayerProps): JSX.Element;
function isAllowedFont: declare function isAllowedFont(value: string): value is AllowedFont;
function isAnimationId: declare function isAnimationId(value: string): value is AnimationId;
function isMotionPresetId: declare function isMotionPresetId(value: string): value is MotionPresetId;
function isStylePresetId: declare function isStylePresetId(value: string): value is StylePresetId;
function isSupportsEnabled: declare function isSupportsEnabled(activity: WhatHappensData, clip?: WhatHappensClip): boolean;
function isVocabEnabled: declare function isVocabEnabled(activity: CineScrambleData): boolean;
function listAllowedFonts: declare function listAllowedFonts(): FontDefinition[];
function listAnimations: declare function listAnimations(): AnimationPreset[];
function listMotionPresets: declare function listMotionPresets(): MotionPreset[];
function listStylePresets: declare function listStylePresets(): StylePreset[];
function listTemplates: declare function listTemplates(): TemplateDefinition[];
function localFontFaceCss: declare function localFontFaceCss(files: readonly FontExportFile[], directory?: string): string;
function matchSupportsInAnswer: declare function matchSupportsInAnswer(answer: string, supports: readonly string[]): SupportMatch[];
function offlineFontExport: declare function offlineFontExport(style?: StyleChoice): FontExportManifest;
function postEmbedResize: declare function postEmbedResize(width: number, height: number): void;
function registerInteractiveActivities: declare function registerInteractiveActivities(): void;
function registerTemplate: declare function registerTemplate(definition: TemplateDefinition): void;
function resolveAssetUrl: declare function resolveAssetUrl(asset: AssetRef, resolve?: AssetUrlResolver): string;
function resolveFontPair: declare function resolveFontPair(style?: StyleChoice): { body: AllowedFont; heading: AllowedFont; };
function resolveLayout: declare function resolveLayout(width: number, height: number): 'landscape' | 'portrait';
function resolveMotionTokens: declare function resolveMotionTokens(motionPresetId?: string): MotionTokens;
function resolveStylePreset: declare function resolveStylePreset(presetId?: string): StylePreset;
function resolveStyleTokens: declare function resolveStyleTokens(style?: StyleChoice, systemPrefersDark?: boolean): StyleTokens;
function stageScale: declare function stageScale(width: number, height: number): number;
function uniqueAllowedFonts: declare function uniqueAllowedFonts(families: readonly string[]): AllowedFont[];
function validateCineScrambleData: declare function validateCineScrambleData(data: unknown): ValidationResult<CineScrambleData>;
function validateWhatHappensData: declare function validateWhatHappensData(data: unknown): ValidationResult<WhatHappensData>;
function whatHappensChrome: declare function whatHappensChrome(locale?: string): WhatHappensChrome;
function WhatHappensPlayer: declare function WhatHappensPlayer({ activity, ...host }: WhatHappensPlayerProps): JSX.Element;
interface AnimationPreset: interface AnimationPreset { id: AnimationId; label: string; description: string; }
interface AssetRef: interface AssetRef { assetKey: string; url?: string; }
interface CineScrambleClip: interface CineScrambleClip { id: number; video: AssetRef & { aspect: VideoAspect; durationS?: number; }; caption: string; videoPrompt?: { generatedBy?: string; text: string; }; }
interface CineScrambleCopy: interface CineScrambleCopy { startLabel?: string; closeLabel?: string; playFallback?: string; mediaError?: string; sceneLabel?: string; clipLabel?: string; slotLabel?: string; poolLabel?: string; removeLabel?: string; correctLabel?: string; incorrectLabel?: string; completeLabel?: string; keyboardHelp?: string; checkLabel?: string; vocabButtonLabel?: string; }
interface CineScrambleData: interface CineScrambleData { schemaVersion: typeof CINE_SCRAMBLE_SCHEMA_VERSION; type: typeof CINE_SCRAMBLE_TYPE; id: string; title: string; locale?: string; tagline?: string; poster?: AssetRef; style?: StyleChoice; vocabEnabled?: boolean; vocab?: CineScrambleVocabItem[]; scenes: CineScrambleScene[]; copy?: CineScrambleCopy; }
interface CineScramblePlayerProps: interface CineScramblePlayerProps extends PlayerHostOptions { activity: CineScrambleData; }
interface CineScrambleResponse: interface CineScrambleResponse { sceneId: string; order: number[]; }
interface CineScrambleScene: interface CineScrambleScene { id: string; title: string; clips: CineScrambleClip[]; }
interface CineScrambleVocabItem: interface CineScrambleVocabItem { term: string; definition: string; }
interface FontDefinition: interface FontDefinition { family: AllowedFont; weights: readonly number[]; fallback: string; }
interface FontExportFile: interface FontExportFile { family: AllowedFont; weight: number; style: 'normal'; format: 'woff2'; fileName: string; }
interface FontExportManifest: interface FontExportManifest { cssUrl: string; files: FontExportFile[]; }
interface InteractiveActivityPlayerProps: interface InteractiveActivityPlayerProps extends PlayerHostOptions { activity: CineScrambleData | WhatHappensData; }
interface MotionPreset: interface MotionPreset { id: MotionPresetId; label: string; description: string; tokens: MotionTokens; }
interface MotionTokens: interface MotionTokens { durationFast: string; duration: string; durationSlow: string; easing: string; stagger: string; }
interface PlayerHostOptions: interface PlayerHostOptions { resolveUrl?: AssetUrlResolver; onEvent?: (event: PlayerEvent) => void; strings?: WhatHappensCopy & CineScrambleCopy; reducedMotion?: boolean; embed?: { postResize: boolean; }; viewport?: PlayerViewport; }
interface PlayerViewport: interface PlayerViewport { width: number; height: number; }
interface StyleChoice: interface StyleChoice { presetId: string; mode?: ColorMode; fonts?: { body?: string; heading?: string; }; motionPresetId?: string; }
interface StylePreset: interface StylePreset { id: StylePresetId; label: string; description: string; defaultFonts: { body: AllowedFont; heading: AllowedFont; }; defaultMotionPresetId: MotionPresetId; tokens: { dark: StyleTokens; light: StyleTokens; }; }
interface StyleTokens: interface StyleTokens { bg: string; panel: string; line: string; ink1: string; ink2: string; ink3: string; accent: string; accentSoft: string; frost: string; veil: string; radiusPanel: string; radiusVideo: string; radiusButton: string; shadowSm: string; shadowMd: string; shadowLg: string; glassBlur: string; backdropBlur: string; }
interface SupportMatch: interface SupportMatch { support: string; start: number; end: number; }
interface TemplateDefinition: interface TemplateDefinition<TData = unknown> { id: string; version: string; label: string; activityType: string; validate(data: unknown): ValidationResult<TData>; jsonSchema: Record<string, unknown>; mediaSlots(data: TData): TemplateMediaSlot[]; }
interface TemplateMediaSlot: interface TemplateMediaSlot { path: Array<number | string>; kind: 'audio' | 'image' | 'video'; assetKey?: string; }
interface ValidationIssue: interface ValidationIssue { path: Array<number | string>; message: string; }
interface WhatHappensChrome: interface WhatHappensChrome { playFallback: string; replayToFreeze: string; mediaError: string; predictTitle: string; revealButton: string; tellTitle: string; supportsLabel: string; showAnswer: string; answerLabel: string; nextButton: string; listenButton: string; }
interface WhatHappensClip: interface WhatHappensClip { id: string; title: string; video: AssetRef & { aspect: VideoAspect; durationS?: number; }; thumb?: AssetRef; poster?: AssetRef; freezeAt: number; predictPrompt?: string; tellPrompt?: string; supportsEnabled?: boolean; supportsLabel?: string; supports?: string[]; answer: { text: string; }; audio?: AssetRef & { textHash: string; voice?: string; }; videoPrompt?: { generatedBy?: string; text: string; }; origin?: 'authored' | 'generated'; }
interface WhatHappensCopy: interface WhatHappensCopy { playFallback?: string; replayToFreeze?: string; mediaError?: string; predictTitle?: string; revealButton?: string; tellTitle?: string; supportsLabel?: string; showAnswer?: string; answerLabel?: string; nextButton?: string; listenButton?: string; }
interface WhatHappensData: interface WhatHappensData { schemaVersion: typeof WHAT_HAPPENS_SCHEMA_VERSION; type: typeof WHAT_HAPPENS_TYPE; id: string; title: string; locale: string; style: StyleChoice; supportsEnabled?: boolean; copy?: WhatHappensCopy; clips: WhatHappensClip[]; }
interface WhatHappensPlayerProps: interface WhatHappensPlayerProps extends PlayerHostOptions { activity: WhatHappensData; }
interface WhatHappensResponse: interface WhatHappensResponse { clipId: string; }
type AllowedFont: type AllowedFont = (typeof FONT_ALLOW_LIST)[number];
type AnimationId: type AnimationId = (typeof ANIMATION_IDS)[number];
type AssetUrlResolver: type AssetUrlResolver = (asset: AssetRef) => string;
type ChromeLocale: type ChromeLocale = keyof typeof WHAT_HAPPENS_CHROME;
type ColorMode: type ColorMode = 'auto' | 'dark' | 'light';
type MotionPresetId: type MotionPresetId = (typeof MOTION_PRESET_IDS)[number];
type PlayerEvent: type PlayerEvent = { activityId: string; clipId: string; type: 'answer.shown' | 'clip.completed' | 'clip.frozen' | 'clip.opened' | 'clip.revealed'; } | { activityId: string; clipId: string; type: 'audio.played'; via: 'audio' | 'speechSynthesis'; } | { activityId: string; correct: boolean; sceneId: string; type: 'scramble.checked'; } | { activityId: string; sceneId: string; type: 'scramble.completed' | 'scramble.started'; } | { activityId: string; type: 'board.completed'; } | { activityId: string; type: 'vocab.opened'; };
type StylePresetId: type StylePresetId = (typeof STYLE_PRESET_IDS)[number];
type ValidationResult: type ValidationResult<T> = { data: T; success: true; } | { errors: ValidationIssue[]; success: false; };
type VideoAspect: type VideoAspect = '16:9' | '9:16';
```
