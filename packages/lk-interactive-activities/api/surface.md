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
const CINE_SCRAMBLE_AI_SPEC: CINE_SCRAMBLE_AI_SPEC: TemplateAiSpec
const CINE_SCRAMBLE_CHROME: CINE_SCRAMBLE_CHROME: { readonly en: { readonly checkLabel: "Check"; readonly clipHelp: "Press a slot number to place it."; readonly clipLabel: "Clip"; readonly closeLabel: "Close"; readonly completeLabel: "Story complete"; readonly correctLabel: "Right place"; readonly doneLabel: "Done"; readonly emptySlotLabel: "Drop a clip here"; readonly fillAllLabel: "Place every clip before checking."; readonly incorrectLabel: "Not here"; readonly keyboardHelp: "Drag each clip to the slot whose caption describes it, or select a clip and then a slot. With the keyboard: on a clip, press its slot’s number; Delete or Backspace takes it out; C checks."; readonly mediaError: "This clip could not be played."; readonly nextSceneLabel: "Next scene"; readonly pauseLabel: "Pause clips"; readonly placedLabel: "{clip} placed in slot {slot}."; readonly playFallback: "Play clips"; readonly poolLabel: "Clips to place"; readonly removeLabel: "Take out of the slot"; readonly replayLabel: "Start over"; readonly resultSummary: "{correct} of {total} in the right place. Move the others and check again."; readonly resumeLabel: "Play clips"; readonly returnedLabel: "{clip} taken out of its slot."; readonly sceneLabel: "Scene"; readonly scenesLabel: "All scenes"; readonly selectFirstLabel: "Select a clip first, then a slot."; readonly selectedLabel: "{clip} selected. Choose a slot."; readonly slotLabel: "Slot"; readonly startLabel: "Start"; readonly storyLabel: "The story"; readonly vocabButtonLabel: "Vocabulary"; }; readonly es: { readonly checkLabel: "Comprobar"; readonly clipHelp: "Pulsa el número de una posición para colocarlo."; readonly clipLabel: "Clip"; readonly closeLabel: "Cerrar"; readonly completeLabel: "Historia completa"; readonly correctLabel: "En su lugar"; readonly doneLabel: "Completado"; readonly emptySlotLabel: "Suelta un clip aquí"; readonly fillAllLabel: "Coloca todos los clips antes de comprobar."; readonly incorrectLabel: "No va aquí"; readonly keyboardHelp: "Arrastra cada clip a la posición cuyo texto lo describe, o selecciona un clip y luego una posición. Con el teclado: con un clip enfocado, pulsa el número de su posición; Supr o Retroceso lo quita; C comprueba."; readonly mediaError: "No se pudo reproducir este clip."; readonly nextSceneLabel: "Siguiente escena"; readonly pauseLabel: "Pausar clips"; readonly placedLabel: "{clip} colocado en la posición {slot}."; readonly playFallback: "Reproducir clips"; readonly poolLabel: "Clips por colocar"; readonly removeLabel: "Quitar de la posición"; readonly replayLabel: "Volver a empezar"; readonly resultSummary: "{correct} de {total} en su lugar. Mueve los demás y vuelve a comprobar."; readonly resumeLabel: "Reproducir clips"; readonly returnedLabel: "{clip} vuelve a los clips por colocar."; readonly sceneLabel: "Escena"; readonly scenesLabel: "Todas las escenas"; readonly selectFirstLabel: "Primero selecciona un clip y luego una posición."; readonly selectedLabel: "{clip} seleccionado. Elige una posición."; readonly slotLabel: "Posición"; readonly startLabel: "Comenzar"; readonly storyLabel: "La historia"; readonly vocabButtonLabel: "Vocabulario"; }; }
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
const FONT_ALLOW_LIST: FONT_ALLOW_LIST: readonly ["Inter", "Source Serif 4", "Fraunces", "Lexend", "Atkinson Hyperlegible Next", "Bricolage Grotesque", "Big Shoulders Display", "DM Sans", "Figtree", "Literata"]
const FONT_DEFINITIONS: FONT_DEFINITIONS: Record<AllowedFont, FontDefinition>
const MOTION_PRESET_IDS: MOTION_PRESET_IDS: readonly ["default", "lively", "gentle"]
const MOTION_PRESETS: MOTION_PRESETS: readonly MotionPreset[]
const PACKAGE_NAME: PACKAGE_NAME = "@intellectif/lk-interactive-activities"
const PLAYER_EVENT_XAPI_EXTENSION: PLAYER_EVENT_XAPI_EXTENSION = "https://intellectif.com/xapi/extensions/interactive-activities/player-event"
const STYLE_PRESET_IDS: STYLE_PRESET_IDS: readonly ["default", "cinema-dark"]
const STYLE_PRESETS: STYLE_PRESETS: readonly StylePreset[]
const WHAT_HAPPENS_AI_SPEC: WHAT_HAPPENS_AI_SPEC: TemplateAiSpec
const WHAT_HAPPENS_CHROME: WHAT_HAPPENS_CHROME: { readonly en: { readonly answerHidden: "Answer hidden. Your turn again."; readonly answerLabel: "Sample answer"; readonly backButton: "All clips"; readonly boardHint: "Choose a clip. When it pauses, answer the question."; readonly clipCount: "Clip {n} of {total}"; readonly completedLabel: "Done"; readonly hideAnswer: "Hide answer"; readonly listenButton: "Listen"; readonly listenError: "The answer could not be read aloud on this device."; readonly mediaError: "This clip could not be played."; readonly nextButton: "Next"; readonly playFallback: "Play"; readonly predictTitle: "What happens next?"; readonly replayToFreeze: "Watch again"; readonly revealButton: "Reveal"; readonly showAnswer: "Show answer"; readonly supportsLabel: "To help you"; readonly tellTitle: "Tell the story"; readonly watchHint: "Watch closely. The clip will pause."; }; readonly es: { readonly answerHidden: "Respuesta oculta. Te toca de nuevo."; readonly answerLabel: "Respuesta de ejemplo"; readonly backButton: "Todos los clips"; readonly boardHint: "Elige un clip. Cuando se detenga, responde la pregunta."; readonly clipCount: "Clip {n} de {total}"; readonly completedLabel: "Completado"; readonly hideAnswer: "Ocultar respuesta"; readonly listenButton: "Escuchar"; readonly listenError: "No se pudo leer la respuesta en voz alta en este dispositivo."; readonly mediaError: "No se pudo reproducir este clip."; readonly nextButton: "Siguiente"; readonly playFallback: "Reproducir"; readonly predictTitle: "¿Qué crees que va a pasar?"; readonly replayToFreeze: "Ver otra vez"; readonly revealButton: "Revelar"; readonly showAnswer: "Mostrar respuesta"; readonly supportsLabel: "Para ayudarte"; readonly tellTitle: "Cuenta la historia"; readonly watchHint: "Mira con atención. El clip se detendrá."; }; }
const WHAT_HAPPENS_CLIP_COUNT_DEFAULT: WHAT_HAPPENS_CLIP_COUNT_DEFAULT = 8
const WHAT_HAPPENS_CLIP_COUNT_MAX: WHAT_HAPPENS_CLIP_COUNT_MAX = 12
const WHAT_HAPPENS_CLIP_COUNT_MIN: WHAT_HAPPENS_CLIP_COUNT_MIN = 1
const WHAT_HAPPENS_JSON_SCHEMA: WHAT_HAPPENS_JSON_SCHEMA: Record<string, unknown>
const WHAT_HAPPENS_SCHEMA_VERSION: WHAT_HAPPENS_SCHEMA_VERSION = "1.0"
const WHAT_HAPPENS_TYPE: WHAT_HAPPENS_TYPE = "what-happens"
const whatHappensTemplate: whatHappensTemplate: TemplateDefinition<WhatHappensData>
const whatHappensType: whatHappensType: ActivityTypeDescriptor<WhatHappensData, WhatHappensResponse>
function answerTextHash: declare function answerTextHash(text: string): string;
function checkCineScrambleDraft: declare function checkCineScrambleDraft(draft: Readonly<Record<string, unknown>>): DraftIssue[];
function checkWhatHappensDraft: declare function checkWhatHappensDraft(draft: Readonly<Record<string, unknown>>): DraftIssue[];
function cineScrambleChrome: declare function cineScrambleChrome(locale?: string): CineScrambleChrome;
function cineScrambleMediaSlots: declare function cineScrambleMediaSlots(data: CineScrambleData): TemplateMediaSlot[];
function createCineScrambleDraft: declare function createCineScrambleDraft(id?: string, sceneId?: string): CineScrambleData;
function createWhatHappensDraft: declare function createWhatHappensDraft(id?: string, newId?: () => string): WhatHappensData;
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
function isAllowedFont: declare function isAllowedFont(value: string): value is AllowedFont;
function isAnimationId: declare function isAnimationId(value: string): value is AnimationId;
function isAnswerAudioCurrent: declare function isAnswerAudioCurrent(clip: Pick<WhatHappensClip, 'answer' | 'audio'>): boolean;
function isMotionPresetId: declare function isMotionPresetId(value: string): value is MotionPresetId;
function isSafeMediaUrl: declare function isSafeMediaUrl(url: string): boolean;
function isStylePresetId: declare function isStylePresetId(value: string): value is StylePresetId;
function isSupportsEnabled: declare function isSupportsEnabled(activity: WhatHappensData, clip?: WhatHappensClip): boolean;
function isVocabEnabled: declare function isVocabEnabled(activity: CineScrambleData): boolean;
function listAllowedFonts: declare function listAllowedFonts(): FontDefinition[];
function listAnimations: declare function listAnimations(): AnimationPreset[];
function listMotionPresets: declare function listMotionPresets(): MotionPreset[];
function listStylePresets: declare function listStylePresets(): StylePreset[];
function listTemplates: declare function listTemplates(): TemplateDefinition[];
function localFontFaceCss: declare function localFontFaceCss(files: readonly (FontExportFile | GoogleFontFile)[], directory?: string): string;
function matchSupportsInAnswer: declare function matchSupportsInAnswer(answer: string, supports: readonly string[]): SupportMatch[];
function offlineFontExport: declare function offlineFontExport(style?: StyleChoice): FontExportManifest;
function parseGoogleFontsCss: declare function parseGoogleFontsCss(css: string): GoogleFontFile[];
function playerEventToXapi: declare function playerEventToXapi(event: PlayerEvent, host: PlayerEventXapiContext): XAPIStatement;
function registerInteractiveActivities: declare function registerInteractiveActivities(): void;
function registerTemplate: declare function registerTemplate(definition: TemplateDefinition): void;
function resolveAssetUrl: declare function resolveAssetUrl(asset: AssetRef, resolve?: AssetUrlResolver): string;
function resolveFontPair: declare function resolveFontPair(style?: StyleChoice): { body: AllowedFont; heading: AllowedFont; };
function resolveMotionTokens: declare function resolveMotionTokens(motionPresetId?: string): MotionTokens;
function resolveStylePreset: declare function resolveStylePreset(presetId?: string): StylePreset;
function resolveStyleTokens: declare function resolveStyleTokens(style?: StyleChoice, systemPrefersDark?: boolean): StyleTokens;
function uniqueAllowedFonts: declare function uniqueAllowedFonts(families: readonly string[]): AllowedFont[];
function validateCineScrambleData: declare function validateCineScrambleData(data: unknown): ValidationResult<CineScrambleData>;
function validateInteractiveActivity: declare function validateInteractiveActivity<T = InteractiveActivity>(data: unknown): ValidationResult<T>;
function validateWhatHappensData: declare function validateWhatHappensData(data: unknown): ValidationResult<WhatHappensData>;
function whatHappensChrome: declare function whatHappensChrome(locale?: string): WhatHappensChrome;
function whatHappensMediaSlots: declare function whatHappensMediaSlots(data: WhatHappensData): TemplateMediaSlot[];
interface AiCatalogEntry: interface AiCatalogEntry { id: string; label: string; description: string; }
interface AiCountRule: interface AiCountRule { min: number; max: number; default: number; }
interface AnimationPreset: interface AnimationPreset { id: AnimationId; label: string; description: string; }
interface AssetRef: interface AssetRef { assetKey: string; url?: string; }
interface CineScrambleChrome: interface CineScrambleChrome { startLabel: string; closeLabel: string; playFallback: string; mediaError: string; pauseLabel: string; resumeLabel: string; sceneLabel: string; scenesLabel: string; clipLabel: string; slotLabel: string; emptySlotLabel: string; poolLabel: string; removeLabel: string; correctLabel: string; incorrectLabel: string; completeLabel: string; storyLabel: string; replayLabel: string; nextSceneLabel: string; doneLabel: string; keyboardHelp: string; clipHelp: string; selectedLabel: string; selectFirstLabel: string; placedLabel: string; returnedLabel: string; fillAllLabel: string; resultSummary: string; checkLabel: string; vocabButtonLabel: string; }
interface CineScrambleClip: interface CineScrambleClip { id: number; video: AssetRef & { aspect: VideoAspect; durationS?: number; }; caption: string; videoPrompt?: { generatedBy?: string; text: string; }; }
interface CineScrambleCopy: interface CineScrambleCopy { startLabel?: string; closeLabel?: string; playFallback?: string; mediaError?: string; pauseLabel?: string; resumeLabel?: string; sceneLabel?: string; scenesLabel?: string; clipLabel?: string; slotLabel?: string; emptySlotLabel?: string; poolLabel?: string; removeLabel?: string; correctLabel?: string; incorrectLabel?: string; completeLabel?: string; storyLabel?: string; replayLabel?: string; nextSceneLabel?: string; doneLabel?: string; keyboardHelp?: string; clipHelp?: string; selectedLabel?: string; selectFirstLabel?: string; placedLabel?: string; returnedLabel?: string; fillAllLabel?: string; resultSummary?: string; checkLabel?: string; vocabButtonLabel?: string; }
interface CineScrambleData: interface CineScrambleData { schemaVersion: '1.0'; type: 'cine-scramble'; id: string; title: string; locale?: string; tagline?: string; poster?: AssetRef; style?: StyleChoice; vocabEnabled?: boolean; vocab?: CineScrambleVocabItem[]; scenes: CineScrambleScene[]; copy?: CineScrambleCopy; }
interface CineScrambleResponse: interface CineScrambleResponse { sceneId: string; order: number[]; }
interface CineScrambleScene: interface CineScrambleScene { id: string; title: string; clips: CineScrambleClip[]; }
interface CineScrambleVocabItem: interface CineScrambleVocabItem { term: string; definition: string; }
interface FontDefinition: interface FontDefinition { family: AllowedFont; weights: readonly number[]; fallback: string; }
interface FontExportFile: interface FontExportFile { family: AllowedFont; weight: number; style: 'normal'; format: 'woff2'; fileName: string; }
interface FontExportManifest: interface FontExportManifest { cssUrl: string; files: FontExportFile[]; }
interface FreezeSuggestionSpec: interface FreezeSuggestionSpec { inputs: readonly string[]; writableFields: readonly string[]; bounds: { exclusiveMaximumField: 'durationS'; exclusiveMinimum: 0; }; jsonSchema: Record<string, unknown>; rules: readonly string[]; promptFragments: readonly string[]; }
interface GoogleFontFile: interface GoogleFontFile { family: string; style: string; weight: string; subset?: string; unicodeRange?: string; url: string; format: string; fileName: string; }
interface MotionPreset: interface MotionPreset { id: MotionPresetId; label: string; description: string; tokens: MotionTokens; }
interface MotionTokens: interface MotionTokens { durationFast: string; duration: string; durationSlow: string; easing: string; stagger: string; }
interface PlayerEventXapiContext: interface PlayerEventXapiContext { actor: XAPIActor; object: ((event: PlayerEvent) => XAPIObjectParams) | XAPIObjectParams; context?: XAPIContext; }
interface StyleChoice: interface StyleChoice { presetId: string; mode?: ColorMode; fonts?: { body?: string; heading?: string; }; motionPresetId?: string; }
interface StylePreset: interface StylePreset { id: StylePresetId; label: string; description: string; defaultFonts: { body: AllowedFont; heading: AllowedFont; }; defaultMotionPresetId: MotionPresetId; tokens: { dark: StyleTokens; light: StyleTokens; }; }
interface StyleTokens: interface StyleTokens { bg: string; panel: string; surfaceStrong: string; line: string; ink1: string; ink2: string; ink3: string; accent: string; accentSoft: string; onAccent: string; positive: string; negative: string; frost: string; veil: string; radiusPanel: string; radiusVideo: string; radiusButton: string; shadowSm: string; shadowMd: string; shadowLg: string; glassBlur: string; backdropBlur: string; }
interface SupportMatch: interface SupportMatch { support: string; start: number; end: number; }
interface TemplateAiSpec: interface TemplateAiSpec { jsonSchema: Record<string, unknown>; writableFields: readonly string[]; counts: Readonly<Record<string, AiCountRule>>; rules: readonly string[]; promptFragments: readonly string[]; catalogs: { animations: readonly AiCatalogEntry[]; fonts: readonly AiCatalogEntry[]; motions: readonly AiCatalogEntry[]; styles: readonly AiCatalogEntry[]; }; videoPrompt: VideoPromptSpec; freezeSuggestion?: FreezeSuggestionSpec; }
interface TemplateDefinition: interface TemplateDefinition<TData = unknown> { id: string; version: string; label: string; activityType: string; validate(data: unknown): ValidationResult<TData>; createDraft(id?: string): TData; jsonSchema: Record<string, unknown>; aiSpec: TemplateAiSpec; mediaSlots(data: TData): TemplateMediaSlot[]; }
interface TemplateMediaSlot: interface TemplateMediaSlot { path: Array<number | string>; kind: 'audio' | 'captions' | 'image' | 'video'; role: 'audio' | 'captions' | 'poster' | 'thumb' | 'video'; required: boolean; present: boolean; assetKey?: string; aspect?: VideoAspect; durationS?: number; label?: string; }
interface ValidationIssue: interface ValidationIssue { path: Array<number | string>; code: ValidationIssueCode; message: string; }
interface VideoPromptSpec: interface VideoPromptSpec { slotPath: string; writableFields: readonly string[]; inputs: readonly string[]; aspectRatios: readonly ['9:16', '16:9']; defaultAspect: '16:9' | '9:16'; targetLength: string; scene: string; surpriseMoment?: string; rules: readonly string[]; promptFragments: readonly string[]; }
interface WhatHappensChrome: interface WhatHappensChrome { playFallback: string; replayToFreeze: string; mediaError: string; listenError: string; backButton: string; boardHint: string; watchHint: string; completedLabel: string; clipCount: string; predictTitle: string; revealButton: string; tellTitle: string; supportsLabel: string; showAnswer: string; hideAnswer: string; answerHidden: string; answerLabel: string; nextButton: string; listenButton: string; }
interface WhatHappensClip: interface WhatHappensClip { id: string; title: string; video: AssetRef & { aspect: VideoAspect; durationS?: number; }; thumb?: AssetRef; poster?: AssetRef; captions?: AssetRef & { label?: string; srclang?: string; }; freezeAt: number; predictPrompt?: string; tellPrompt?: string; supportsEnabled?: boolean; supportsLabel?: string; supports?: string[]; answer: { text: string; }; audio?: AssetRef & { textHash: string; voice?: string; }; videoPrompt?: { generatedBy?: string; text: string; }; origin?: 'authored' | 'generated'; }
interface WhatHappensCopy: interface WhatHappensCopy { playFallback?: string; replayToFreeze?: string; mediaError?: string; listenError?: string; backButton?: string; boardHint?: string; watchHint?: string; completedLabel?: string; clipCount?: string; predictTitle?: string; revealButton?: string; tellTitle?: string; supportsLabel?: string; showAnswer?: string; hideAnswer?: string; answerHidden?: string; answerLabel?: string; nextButton?: string; listenButton?: string; }
interface WhatHappensData: interface WhatHappensData { schemaVersion: '1.0'; type: 'what-happens'; id: string; title: string; locale: string; style: StyleChoice; supportsEnabled?: boolean; copy?: WhatHappensCopy; clips: WhatHappensClip[]; }
interface WhatHappensResponse: interface WhatHappensResponse { clipId: string; }
type AllowedFont: type AllowedFont = (typeof FONT_ALLOW_LIST)[number];
type AnimationId: type AnimationId = (typeof ANIMATION_IDS)[number];
type AssetUrlResolver: type AssetUrlResolver = (asset: AssetRef) => string;
type ChromeLocale: type ChromeLocale = keyof typeof WHAT_HAPPENS_CHROME;
type CineScrambleDraftCode: type CineScrambleDraftCode = 'cs_caption_required' | 'cs_scene_title_required' | 'cs_title_required' | 'cs_video_required';
type ColorMode: type ColorMode = 'auto' | 'dark' | 'light';
type InteractiveActivity: type InteractiveActivity = CineScrambleData | WhatHappensData;
type MotionPresetId: type MotionPresetId = (typeof MOTION_PRESET_IDS)[number];
type PlayerEvent: type PlayerEvent = { activityId: string; clipId: string; type: 'answer.hidden' | 'answer.shown' | 'clip.completed' | 'clip.frozen' | 'clip.opened' | 'clip.revealed'; } | { activityId: string; clipId: string; type: 'audio.played'; via: 'audio' | 'speechSynthesis'; } | { activityId: string; clipId: string; type: 'supports.hidden' | 'supports.shown'; } | { activityId: string; correct: boolean; sceneId: string; type: 'scramble.checked'; } | { activityId: string; sceneId: string; type: 'scramble.completed' | 'scramble.started'; } | { activityId: string; type: 'activity.completed'; } | { activityId: string; type: 'board.completed'; } | { activityId: string; type: 'vocab.opened'; };
type StylePresetId: type StylePresetId = (typeof STYLE_PRESET_IDS)[number];
type ValidationIssueCode: type ValidationIssueCode = 'author_only_field' | 'count_out_of_range' | 'duplicate_id' | 'duplicate_item' | 'empty' | 'expected_array' | 'expected_boolean' | 'expected_number' | 'expected_object' | 'expected_string' | 'freeze_out_of_bounds' | 'invalid_locale' | 'invalid_option' | 'not_chronological' | 'not_positive' | 'required' | 'reveal_field' | 'unknown_font' | 'unknown_motion_preset' | 'unknown_schema_version' | 'unknown_style_preset' | 'unknown_template' | 'unsafe_url';
type ValidationResult: type ValidationResult<T> = { data: T; success: true; } | { errors: ValidationIssue[]; success: false; };
type VideoAspect: type VideoAspect = '16:9' | '9:16';
type WhatHappensDraftCode: type WhatHappensDraftCode = 'wh_clip_title_required' | 'wh_freeze_required' | 'wh_title_required' | 'wh_video_required';
```

## @intellectif/lk-interactive-activities/player

```ts
const MIN_STAGE_SCALE: MIN_STAGE_SCALE = 0.55
const STAGE_HEIGHT: STAGE_HEIGHT = 1080
const STAGE_WIDTH: STAGE_WIDTH = 1920
function CineScramblePlayer: declare function CineScramblePlayer(props: CineScramblePlayerProps): JSX.Element;
function getTemplatePlayer: declare function getTemplatePlayer(templateId: string): ComponentType<TemplatePlayerProps<unknown>> | undefined;
function InteractiveActivityPlayer: declare function InteractiveActivityPlayer({ activity, ...host }: InteractiveActivityPlayerProps): JSX.Element;
function postEmbedResize: declare function postEmbedResize(width: number, height: number): void;
function registerTemplatePlayer: declare function registerTemplatePlayer<TData>(templateId: string, component: ComponentType<TemplatePlayerProps<TData>>): void;
function resolveLayout: declare function resolveLayout(width: number, height: number): 'landscape' | 'portrait';
function stageScale: declare function stageScale(width: number, height: number): number;
function WhatHappensPlayer: declare function WhatHappensPlayer(props: WhatHappensPlayerProps): JSX.Element;
interface CineScramblePlayerProps: interface CineScramblePlayerProps extends PlayerHostOptions { activity: CineScrambleData; }
interface InteractiveActivityPlayerProps: interface InteractiveActivityPlayerProps extends PlayerHostOptions { activity: InteractiveActivity | { id: string; type: string; }; }
interface PlayerHostOptions: interface PlayerHostOptions { resolveUrl?: AssetUrlResolver; onEvent?: (event: PlayerEvent) => void; locale?: string; strings?: WhatHappensCopy & CineScrambleCopy; reducedMotion?: boolean; shortcuts?: boolean; embed?: { postResize: boolean; }; viewport?: PlayerViewport; }
interface PlayerViewport: interface PlayerViewport { width: number; height: number; }
interface TemplatePlayerProps: interface TemplatePlayerProps<TData = unknown> extends PlayerHostOptions { activity: TData; }
interface WhatHappensPlayerProps: interface WhatHappensPlayerProps extends PlayerHostOptions { activity: WhatHappensData; }
```
