# @intellectif/lk-interactive-activities — public API surface

Generated from the BUILT `.d.ts` by `pnpm api-report`. A diff here is a
semver question, not an error: decide patch / minor / major, then commit
this file with the changeset that explains it.

## @intellectif/lk-interactive-activities

```ts
const CINE_SCRAMBLE_CHROME: CINE_SCRAMBLE_CHROME: { readonly en: { readonly checkLabel: "Check"; readonly vocabButtonLabel: "Vocabulary"; }; readonly es: { readonly checkLabel: "Comprobar"; readonly vocabButtonLabel: "Vocabulario"; }; }
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
const MOTION_PRESET_IDS: MOTION_PRESET_IDS: readonly ["default", "lively", "gentle"]
const PACKAGE_NAME: PACKAGE_NAME = "@intellectif/lk-interactive-activities"
const STYLE_PRESET_IDS: STYLE_PRESET_IDS: readonly ["default", "cinema-dark"]
const WHAT_HAPPENS_CHROME: WHAT_HAPPENS_CHROME: { readonly en: { readonly answerLabel: "Sample answer"; readonly listenButton: "Listen"; readonly nextButton: "Next"; readonly predictTitle: "What happens next?"; readonly revealButton: "Reveal"; readonly showAnswer: "Show answer"; readonly supportsLabel: "To help you"; readonly tellTitle: "Tell the story"; }; readonly es: { readonly answerLabel: "Respuesta de ejemplo"; readonly listenButton: "Escuchar"; readonly nextButton: "Siguiente"; readonly predictTitle: "¿Qué pasa después?"; readonly revealButton: "Revelar"; readonly showAnswer: "Mostrar respuesta"; readonly supportsLabel: "Para ayudarte"; readonly tellTitle: "Cuenta la historia"; }; }
const WHAT_HAPPENS_CLIP_COUNT_DEFAULT: WHAT_HAPPENS_CLIP_COUNT_DEFAULT = 8
const WHAT_HAPPENS_CLIP_COUNT_MAX: WHAT_HAPPENS_CLIP_COUNT_MAX = 12
const WHAT_HAPPENS_CLIP_COUNT_MIN: WHAT_HAPPENS_CLIP_COUNT_MIN = 1
const WHAT_HAPPENS_JSON_SCHEMA: WHAT_HAPPENS_JSON_SCHEMA: Record<string, unknown>
const WHAT_HAPPENS_SCHEMA_VERSION: WHAT_HAPPENS_SCHEMA_VERSION = "1.0"
const WHAT_HAPPENS_TYPE: WHAT_HAPPENS_TYPE = "what-happens"
const whatHappensTemplate: whatHappensTemplate: TemplateDefinition<WhatHappensData>
const whatHappensType: whatHappensType: ActivityTypeDescriptor<WhatHappensData, WhatHappensResponse>
function cineScrambleChrome: declare function cineScrambleChrome(locale?: string): CineScrambleChrome;
function createCineScrambleDraft: declare function createCineScrambleDraft(id?: string): CineScrambleData;
function createWhatHappensDraft: declare function createWhatHappensDraft(id?: string): WhatHappensData;
function getTemplate: declare function getTemplate(id: string): TemplateDefinition | undefined;
function isAllowedFont: declare function isAllowedFont(value: string): value is AllowedFont;
function isMotionPresetId: declare function isMotionPresetId(value: string): value is MotionPresetId;
function isStylePresetId: declare function isStylePresetId(value: string): value is StylePresetId;
function isSupportsEnabled: declare function isSupportsEnabled(activity: WhatHappensData, clip?: WhatHappensClip): boolean;
function isVocabEnabled: declare function isVocabEnabled(activity: CineScrambleData): boolean;
function listTemplates: declare function listTemplates(): TemplateDefinition[];
function matchSupportsInAnswer: declare function matchSupportsInAnswer(answer: string, supports: readonly string[]): SupportMatch[];
function registerInteractiveActivities: declare function registerInteractiveActivities(): void;
function registerTemplate: declare function registerTemplate(definition: TemplateDefinition): void;
function validateCineScrambleData: declare function validateCineScrambleData(data: unknown): ValidationResult<CineScrambleData>;
function validateWhatHappensData: declare function validateWhatHappensData(data: unknown): ValidationResult<WhatHappensData>;
function whatHappensChrome: declare function whatHappensChrome(locale?: string): WhatHappensChrome;
interface AssetRef: interface AssetRef { assetKey: string; url?: string; }
interface CineScrambleClip: interface CineScrambleClip { id: number; video: AssetRef & { aspect: VideoAspect; durationS?: number; }; caption: string; videoPrompt?: { generatedBy?: string; text: string; }; }
interface CineScrambleCopy: interface CineScrambleCopy { checkLabel?: string; vocabButtonLabel?: string; }
interface CineScrambleData: interface CineScrambleData { schemaVersion: typeof CINE_SCRAMBLE_SCHEMA_VERSION; type: typeof CINE_SCRAMBLE_TYPE; id: string; title: string; locale?: string; tagline?: string; poster?: AssetRef; style?: StyleChoice; vocabEnabled?: boolean; vocab?: CineScrambleVocabItem[]; scenes: CineScrambleScene[]; copy?: CineScrambleCopy; }
interface CineScrambleResponse: interface CineScrambleResponse { sceneId: string; order: number[]; }
interface CineScrambleScene: interface CineScrambleScene { id: string; title: string; clips: CineScrambleClip[]; }
interface CineScrambleVocabItem: interface CineScrambleVocabItem { term: string; definition: string; }
interface StyleChoice: interface StyleChoice { presetId: string; mode?: ColorMode; fonts?: { body?: string; heading?: string; }; motionPresetId?: string; }
interface SupportMatch: interface SupportMatch { support: string; start: number; end: number; }
interface TemplateDefinition: interface TemplateDefinition<TData = unknown> { id: string; version: string; label: string; activityType: string; validate(data: unknown): ValidationResult<TData>; jsonSchema: Record<string, unknown>; mediaSlots(data: TData): TemplateMediaSlot[]; }
interface TemplateMediaSlot: interface TemplateMediaSlot { path: Array<number | string>; kind: 'audio' | 'image' | 'video'; assetKey?: string; }
interface ValidationIssue: interface ValidationIssue { path: Array<number | string>; message: string; }
interface WhatHappensChrome: interface WhatHappensChrome { predictTitle: string; revealButton: string; tellTitle: string; supportsLabel: string; showAnswer: string; answerLabel: string; nextButton: string; listenButton: string; }
interface WhatHappensClip: interface WhatHappensClip { id: string; title: string; video: AssetRef & { aspect: VideoAspect; durationS?: number; }; thumb?: AssetRef; poster?: AssetRef; freezeAt: number; predictPrompt?: string; tellPrompt?: string; supportsEnabled?: boolean; supportsLabel?: string; supports?: string[]; answer: { text: string; }; audio?: AssetRef & { textHash: string; voice?: string; }; videoPrompt?: { generatedBy?: string; text: string; }; origin?: 'authored' | 'generated'; }
interface WhatHappensCopy: interface WhatHappensCopy { predictTitle?: string; revealButton?: string; tellTitle?: string; supportsLabel?: string; showAnswer?: string; answerLabel?: string; nextButton?: string; listenButton?: string; }
interface WhatHappensData: interface WhatHappensData { schemaVersion: typeof WHAT_HAPPENS_SCHEMA_VERSION; type: typeof WHAT_HAPPENS_TYPE; id: string; title: string; locale: string; style: StyleChoice; supportsEnabled?: boolean; copy?: WhatHappensCopy; clips: WhatHappensClip[]; }
interface WhatHappensResponse: interface WhatHappensResponse { clipId: string; }
type AllowedFont: type AllowedFont = (typeof FONT_ALLOW_LIST)[number];
type ChromeLocale: type ChromeLocale = keyof typeof WHAT_HAPPENS_CHROME;
type ColorMode: type ColorMode = 'auto' | 'dark' | 'light';
type MotionPresetId: type MotionPresetId = (typeof MOTION_PRESET_IDS)[number];
type StylePresetId: type StylePresetId = (typeof STYLE_PRESET_IDS)[number];
type ValidationResult: type ValidationResult<T> = { data: T; success: true; } | { errors: ValidationIssue[]; success: false; };
type VideoAspect: type VideoAspect = '16:9' | '9:16';
```
