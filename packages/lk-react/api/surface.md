# @intellectif/lk-react — public API surface

Generated from the BUILT `.d.ts` by `pnpm api-report`. A diff here is a
semver question, not an error: decide patch / minor / major, then commit
this file with the changeset that explains it.

## @intellectif/lk-react

```ts
const darkTheme: darkTheme: Partial<ThemeTokens>
const DEFAULT_STRINGS: DEFAULT_STRINGS: LkStrings
const defaultTheme: defaultTheme: ThemeTokens
function ActivityPreview: declare function ActivityPreview({ draft, renderMode, response, outcome, fallback, renderers, shuffleSeed, sanitizeHtml, strings, theme, locale, }: ActivityPreviewProps): react_jsx_runtime.JSX.Element;
function ActivitySequence: declare function ActivitySequence({ activities, renderers, onActivityComplete, onComplete, onFinished, onSubmit, onInteraction, renderMode, shuffle, shuffleSeed, defaultIndex, onIndexChange, responses, submittedSlotIds, outcomes, sanitizeHtml, theme, locale, disabled, mediaBudget, strings, }: ActivitySequenceProps): React.JSX.Element;
function asRenderable: declare function asRenderable<TData extends ActivityData>(redacted: RedactedActivityData): Renderable<TData>;
function asRenderableSequence: declare function asRenderableSequence(entries: readonly (RedactedActivityData | RedactedItemGroupData)[]): readonly SequenceEntry<RenderableActivity>[];
function createTailwindTheme: declare function createTailwindTheme(theme: Partial<ThemeTokens>): TailwindThemeExtension;
function Dictation: declare function Dictation(props: DictationProps): react_jsx_runtime.JSX.Element;
function directionForLocale: declare function directionForLocale(locale: string | undefined): 'ltr' | 'rtl';
function FillInTheBlanks: declare function FillInTheBlanks(props: FillInTheBlanksProps): react_jsx_runtime.JSX.Element;
function GapSelect: declare function GapSelect(props: GapSelectProps): react_jsx_runtime.JSX.Element;
function LkIntlProvider: declare function LkIntlProvider({ strings, locale, direction, children, }: LkIntlProviderProps): React.JSX.Element;
function mergeStrings: declare function mergeStrings(base: LkStrings, override?: LkStringsOverride): LkStrings;
function MultipleChoice: declare function MultipleChoice(props: MultipleChoiceProps): react_jsx_runtime.JSX.Element;
function StimulusPanel: declare function StimulusPanel({ stimulus, range, sanitizeHtml, locale, renderMode, mediaBudget, mediaStrings, onInteraction, disabled, strings, }: StimulusPanelProps): React.JSX.Element;
function ThemeProvider: declare function ThemeProvider({ theme, children }: ThemeProviderProps): react_jsx_runtime.JSX.Element;
function useActivityState: declare function useActivityState(initialState?: ActivityState): UseActivityStateResult;
function useLkDirection: declare function useLkDirection(): 'ltr' | 'rtl';
function useLkStrings: declare function useLkStrings(override?: LkStringsOverride): LkStrings;
function useTheme: declare function useTheme(): ThemeTokens;
function useXAPI: declare function useXAPI(config: XAPIConfig): UseXAPIResult;
function WrittenResponse: declare function WrittenResponse(props: WrittenResponseProps): react_jsx_runtime.JSX.Element;
interface ActivityPreviewProps: interface ActivityPreviewProps { draft: unknown; renderMode?: RenderMode; response?: LearnerResponse; outcome?: ItemOutcome; fallback?: (result: DraftNotComplete) => ReactNode; renderers?: Readonly<Record<string, ActivityRenderer>>; shuffleSeed?: string; sanitizeHtml?: HtmlSanitizer; strings?: LkStringsOverride; theme?: Partial<ThemeTokens>; locale?: string; }
interface ActivityProps: interface ActivityProps<TData extends ActivityData = ActivityData> { data: RenderableActivity<TData>; onComplete?: (result: ActivityResult) => void; onSubmit?: (response: LearnerResponse) => void; value?: LearnerResponse; defaultValue?: LearnerResponse; defaultSubmitted?: boolean; onChange?: (response: LearnerResponse) => void; renderMode?: RenderMode; outcome?: ItemOutcome; sanitizeHtml?: HtmlSanitizer; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; strings?: LkStringsOverride; onInteraction?: (event: InteractionEvent) => void; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; }
interface ActivitySequenceProps: interface ActivitySequenceProps { activities: readonly SequenceEntry<RenderableActivity>[]; renderers?: Readonly<Record<string, ActivityRenderer>>; onActivityComplete?: (result: ActivityResult, index: number, slotId: string) => void; onSubmit?: (response: LearnerResponse, slot: { slotId: string; index: number; activityId: string; }) => void; onComplete?: (results: ActivityResult[]) => void; onFinished?: (items: SequenceItemOutcome[]) => void; onInteraction?: (event: InteractionEvent) => void; renderMode?: RenderMode; mediaBudget?: SequenceMediaBudget; strings?: LkStringsOverride; shuffle?: 'none' | 'entries'; shuffleSeed?: string; defaultIndex?: number; onIndexChange?: (index: number) => void; responses?: Readonly<Record<string, LearnerResponse>>; submittedSlotIds?: readonly string[]; outcomes?: Readonly<Record<string, ItemOutcome>>; sanitizeHtml?: HtmlSanitizer; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; }
interface DictationProps: interface DictationProps extends ActivityProps<DictationData> { }
interface FillInTheBlanksProps: interface FillInTheBlanksProps extends ActivityProps<FillInTheBlanksData> { showCorrectAnswers?: boolean; }
interface GapSelectProps: interface GapSelectProps extends ActivityProps<GapSelectData> { shuffleSeed?: string; }
interface LkIntlProviderProps: interface LkIntlProviderProps { strings?: LkStringsOverride; locale?: string; direction?: LkDirection; children: React.ReactNode; }
interface LkStrings: interface LkStrings { submit: string; checkAnswers: string; submitAnswers: string; scoreAnnouncement: (percent: number, passed: boolean) => string; answerSubmitted: string; notGradedYet: string; noGradeAvailable: string; showFeedback: string; hideFeedback: string; blankLabel: (ordinal: number) => string; gapLabel: (ordinal: number) => string; gapPlaceholder: string; showHint: string; hideHint: string; responseSubmitted: string; wordCount: (count: number) => string; wordBounds: (min: number, max: number) => string; notApplicable: string; awaitingHumanReview: string; awaitingGrade: string; couldNotBeGraded: string; previous: string; next: string; questionProgress: (index: number, total: number) => string; unsupportedActivity: string; dictationInputLabel: string; dictationRecording: string; dictationSlowRecording: string; dictationRevealNextWord: (revealed: number, total: number) => string; dictationResetHints: string; showSolution: string; hideSolution: string; dictationSolutionLabel: string; dictationMarksLabel: string; dictationDiffNote: string; dictationWordCorrect: (word: string) => string; dictationWordWrong: (word: string, expected: string) => string; dictationWordMissing: (expected: string) => string; dictationWordExtra: (word: string) => string; dictationLegendCorrect: string; dictationLegendWrong: string; dictationLegendMissing: string; dictationLegendExtra: string; dictationNothingTyped: string; dictationWordsSummary: (correct: number, total: number) => string; previewIncomplete: string; previewInvalid: string; embeddedMedia: string; stimulusKind: Record<Stimulus['kind'], string>; stimulusRange: (first: number, last: number) => string; activityFailed: string; activityFailedNamed: (title: string) => string; activityFailedUnnamed: string; media: MediaTransportStrings; }
interface MediaBudgetBinding: interface MediaBudgetBinding { key: string; entry?: MediaPlayLedgerEntry; enforced?: boolean; slotId: string; index: number; activityId?: string; onPlayConsumed?: (claim: MediaPlayClaim) => undefined | Promise<MediaPlayGrant | undefined>; onPlayRefunded?: (claim: MediaPlayClaim) => void; onPosition?: (key: string, seconds: number) => void; strings?: Partial<MediaTransportStrings>; }
interface MediaTransportStrings: interface MediaTransportStrings { play: string; pause: string; preparing: string; mute: string; unmute: string; volume: string; speed: string; seek: string; timeValue: (elapsed: string, duration: string) => string; playsRemaining: (remaining: number, max: number) => string; noPlaysRemaining: string; lastPlayConfirm: string; lastPlayStart: string; lastPlayCancel: string; seekBlocked: string; rateBlocked: string; playFailed: string; }
interface MultipleChoiceProps: interface MultipleChoiceProps extends ActivityProps<MultipleChoiceData> { shuffleSeed?: string; }
interface SequenceMediaBudget: interface SequenceMediaBudget { plays?: Readonly<Record<string, MediaPlayLedgerEntry>>; resumeKey?: string; enforced?: boolean; onPlayConsumed?: (claim: MediaPlayClaim) => undefined | Promise<MediaPlayGrant | undefined>; onPlayRefunded?: (claim: MediaPlayClaim) => void; onPosition?: (key: string, seconds: number) => void; strings?: Partial<MediaTransportStrings>; }
interface StimulusPanelProps: interface StimulusPanelProps { stimulus: Stimulus; range?: { first: number; last: number; }; sanitizeHtml?: HtmlSanitizer; locale?: string; renderMode?: RenderMode; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; onInteraction?: (event: InteractionEvent) => void; disabled?: boolean; strings?: LkStringsOverride; }
interface TailwindThemeExtension: interface TailwindThemeExtension { colors: Record<string, string>; spacing: Record<string, string>; borderRadius: Record<string, string>; fontFamily: Record<string, string>; fontSize: Record<string, string>; }
interface ThemeProviderProps: interface ThemeProviderProps { theme?: Partial<ThemeTokens>; children: ReactNode; }
interface UseActivityStateResult: interface UseActivityStateResult { state: ActivityState; start: () => void; complete: () => void; review: () => void; reset: (to?: ActivityState) => void; getTimeSpent: () => number; }
interface UseXAPIResult: interface UseXAPIResult { sendStatement: (statement: XAPIStatement) => Promise<void>; }
interface WrittenResponseProps: interface WrittenResponseProps { data: Renderable<WrittenResponseData>; onSubmitted?: (submission: WrittenResponseSubmission) => void; onSubmit?: (response: LearnerResponse) => void; value?: LearnerResponse; defaultValue?: LearnerResponse; defaultSubmitted?: boolean; onChange?: (response: LearnerResponse) => void; renderMode?: RenderMode; outcome?: ItemOutcome; sanitizeHtml?: HtmlSanitizer; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; strings?: LkStringsOverride; onInteraction?: (event: InteractionEvent) => void; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; }
interface WrittenResponseSubmission: interface WrittenResponseSubmission { text: string; wordCount: number; withinWordBounds: boolean; timeSpent: number; xapiStatement: XAPIStatement; }
type ActivityRenderer: type ActivityRenderer = ComponentType<ActivityProps>;
type ActivityState: type ActivityState = 'idle' | 'in-progress' | 'completed' | 'reviewing';
type HtmlSanitizer: type HtmlSanitizer = (html: string) => string;
type LkDirection: type LkDirection = 'ltr' | 'rtl' | 'auto';
type LkStringsOverride: type LkStringsOverride = Partial<Omit<LkStrings, 'media' | 'stimulusKind'>> & { media?: Partial<MediaTransportStrings>; stimulusKind?: Partial<Record<Stimulus['kind'], string>>; };
type Renderable: type Renderable<TData> = Omit<TData, 'scoringStrategy'> & { scoringStrategy?: unknown; redacted?: true; };
type RenderableActivity: type RenderableActivity<TData extends ActivityData = ActivityData> = TData extends unknown ? Renderable<TData> : never;
type RenderMode: type RenderMode = 'practice' | 'exam' | 'review';
type SequenceItemOutcome: type SequenceItemOutcome = { kind: 'scored'; index: number; slotId: string; activityId: string; result: ActivityResult; } | { kind: 'submitted'; index: number; slotId: string; activityId: string; submission: WrittenResponseSubmission; } | { kind: 'restored'; index: number; slotId: string; activityId: string; response?: LearnerResponse; } | { kind: 'responded'; index: number; slotId: string; activityId: string; response: LearnerResponse; };
```

## @intellectif/lk-react/components/ActivityPreview

```ts
function ActivityPreview: declare function ActivityPreview({ draft, renderMode, response, outcome, fallback, renderers, shuffleSeed, sanitizeHtml, strings, theme, locale, }: ActivityPreviewProps): react_jsx_runtime.JSX.Element;
interface ActivityPreviewProps: interface ActivityPreviewProps { draft: unknown; renderMode?: RenderMode; response?: LearnerResponse; outcome?: ItemOutcome; fallback?: (result: DraftNotComplete) => ReactNode; renderers?: Readonly<Record<string, ActivityRenderer>>; shuffleSeed?: string; sanitizeHtml?: HtmlSanitizer; strings?: LkStringsOverride; theme?: Partial<ThemeTokens>; locale?: string; }
```

## @intellectif/lk-react/components/ActivitySequence

```ts
function ActivitySequence: declare function ActivitySequence({ activities, renderers, onActivityComplete, onComplete, onFinished, onSubmit, onInteraction, renderMode, shuffle, shuffleSeed, defaultIndex, onIndexChange, responses, submittedSlotIds, outcomes, sanitizeHtml, theme, locale, disabled, mediaBudget, strings, }: ActivitySequenceProps): React.JSX.Element;
interface ActivitySequenceProps: interface ActivitySequenceProps { activities: readonly SequenceEntry<RenderableActivity>[]; renderers?: Readonly<Record<string, ActivityRenderer>>; onActivityComplete?: (result: ActivityResult, index: number, slotId: string) => void; onSubmit?: (response: LearnerResponse, slot: { slotId: string; index: number; activityId: string; }) => void; onComplete?: (results: ActivityResult[]) => void; onFinished?: (items: SequenceItemOutcome[]) => void; onInteraction?: (event: InteractionEvent) => void; renderMode?: RenderMode; mediaBudget?: SequenceMediaBudget; strings?: LkStringsOverride; shuffle?: 'none' | 'entries'; shuffleSeed?: string; defaultIndex?: number; onIndexChange?: (index: number) => void; responses?: Readonly<Record<string, LearnerResponse>>; submittedSlotIds?: readonly string[]; outcomes?: Readonly<Record<string, ItemOutcome>>; sanitizeHtml?: HtmlSanitizer; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; }
type ActivityRenderer: type ActivityRenderer = ComponentType<ActivityProps>;
type SequenceItemOutcome: type SequenceItemOutcome = { kind: 'scored'; index: number; slotId: string; activityId: string; result: ActivityResult; } | { kind: 'submitted'; index: number; slotId: string; activityId: string; submission: WrittenResponseSubmission; } | { kind: 'restored'; index: number; slotId: string; activityId: string; response?: LearnerResponse; } | { kind: 'responded'; index: number; slotId: string; activityId: string; response: LearnerResponse; };
```

## @intellectif/lk-react/components/Dictation

```ts
function Dictation: declare function Dictation(props: DictationProps): react_jsx_runtime.JSX.Element;
interface DictationProps: interface DictationProps extends ActivityProps<DictationData> { }
```

## @intellectif/lk-react/components/FillInTheBlanks

```ts
function FillInTheBlanks: declare function FillInTheBlanks(props: FillInTheBlanksProps): react_jsx_runtime.JSX.Element;
interface FillInTheBlanksProps: interface FillInTheBlanksProps extends ActivityProps<FillInTheBlanksData> { showCorrectAnswers?: boolean; }
```

## @intellectif/lk-react/components/GapSelect

```ts
function GapSelect: declare function GapSelect(props: GapSelectProps): react_jsx_runtime.JSX.Element;
interface GapSelectProps: interface GapSelectProps extends ActivityProps<GapSelectData> { shuffleSeed?: string; }
```

## @intellectif/lk-react/components/MultipleChoice

```ts
function MultipleChoice: declare function MultipleChoice(props: MultipleChoiceProps): react_jsx_runtime.JSX.Element;
interface MultipleChoiceProps: interface MultipleChoiceProps extends ActivityProps<MultipleChoiceData> { shuffleSeed?: string; }
```

## @intellectif/lk-react/components/StimulusPanel

```ts
function StimulusPanel: declare function StimulusPanel({ stimulus, range, sanitizeHtml, locale, renderMode, mediaBudget, mediaStrings, onInteraction, disabled, strings, }: StimulusPanelProps): React.JSX.Element;
interface StimulusPanelProps: interface StimulusPanelProps { stimulus: Stimulus; range?: { first: number; last: number; }; sanitizeHtml?: HtmlSanitizer; locale?: string; renderMode?: RenderMode; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; onInteraction?: (event: InteractionEvent) => void; disabled?: boolean; strings?: LkStringsOverride; }
```

## @intellectif/lk-react/components/WrittenResponse

```ts
function WrittenResponse: declare function WrittenResponse(props: WrittenResponseProps): react_jsx_runtime.JSX.Element;
interface WrittenResponseProps: interface WrittenResponseProps { data: Renderable<WrittenResponseData>; onSubmitted?: (submission: WrittenResponseSubmission) => void; onSubmit?: (response: LearnerResponse) => void; value?: LearnerResponse; defaultValue?: LearnerResponse; defaultSubmitted?: boolean; onChange?: (response: LearnerResponse) => void; renderMode?: RenderMode; outcome?: ItemOutcome; sanitizeHtml?: HtmlSanitizer; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; strings?: LkStringsOverride; onInteraction?: (event: InteractionEvent) => void; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; }
interface WrittenResponseSubmission: interface WrittenResponseSubmission { text: string; wordCount: number; withinWordBounds: boolean; timeSpent: number; xapiStatement: XAPIStatement; }
type HtmlSanitizer: type HtmlSanitizer = (html: string) => string;
type Renderable: type Renderable<TData> = Omit<TData, 'scoringStrategy'> & { scoringStrategy?: unknown; redacted?: true; };
type RenderMode: type RenderMode = 'practice' | 'exam' | 'review';
```

## @intellectif/lk-react/hooks/useActivityState

```ts
function useActivityState: declare function useActivityState(initialState?: ActivityState): UseActivityStateResult;
interface UseActivityStateResult: interface UseActivityStateResult { state: ActivityState; start: () => void; complete: () => void; review: () => void; reset: (to?: ActivityState) => void; getTimeSpent: () => number; }
type ActivityState: type ActivityState = 'idle' | 'in-progress' | 'completed' | 'reviewing';
```

## @intellectif/lk-react/hooks/useXAPI

```ts
function useXAPI: declare function useXAPI(config: XAPIConfig): UseXAPIResult;
interface UseXAPIResult: interface UseXAPIResult { sendStatement: (statement: XAPIStatement) => Promise<void>; }
```

## @intellectif/lk-react/i18n/LkIntlProvider

```ts
const DEFAULT_STRINGS: DEFAULT_STRINGS: LkStrings
function directionForLocale: declare function directionForLocale(locale: string | undefined): 'ltr' | 'rtl';
function LkIntlProvider: declare function LkIntlProvider({ strings, locale, direction, children, }: LkIntlProviderProps): React.JSX.Element;
function mergeStrings: declare function mergeStrings(base: LkStrings, override?: LkStringsOverride): LkStrings;
function useLkDirection: declare function useLkDirection(): 'ltr' | 'rtl';
function useLkStrings: declare function useLkStrings(override?: LkStringsOverride): LkStrings;
interface LkIntlProviderProps: interface LkIntlProviderProps { strings?: LkStringsOverride; locale?: string; direction?: LkDirection; children: React.ReactNode; }
interface LkStrings: interface LkStrings { submit: string; checkAnswers: string; submitAnswers: string; scoreAnnouncement: (percent: number, passed: boolean) => string; answerSubmitted: string; notGradedYet: string; noGradeAvailable: string; showFeedback: string; hideFeedback: string; blankLabel: (ordinal: number) => string; gapLabel: (ordinal: number) => string; gapPlaceholder: string; showHint: string; hideHint: string; responseSubmitted: string; wordCount: (count: number) => string; wordBounds: (min: number, max: number) => string; notApplicable: string; awaitingHumanReview: string; awaitingGrade: string; couldNotBeGraded: string; previous: string; next: string; questionProgress: (index: number, total: number) => string; unsupportedActivity: string; dictationInputLabel: string; dictationRecording: string; dictationSlowRecording: string; dictationRevealNextWord: (revealed: number, total: number) => string; dictationResetHints: string; showSolution: string; hideSolution: string; dictationSolutionLabel: string; dictationMarksLabel: string; dictationDiffNote: string; dictationWordCorrect: (word: string) => string; dictationWordWrong: (word: string, expected: string) => string; dictationWordMissing: (expected: string) => string; dictationWordExtra: (word: string) => string; dictationLegendCorrect: string; dictationLegendWrong: string; dictationLegendMissing: string; dictationLegendExtra: string; dictationNothingTyped: string; dictationWordsSummary: (correct: number, total: number) => string; previewIncomplete: string; previewInvalid: string; embeddedMedia: string; stimulusKind: Record<Stimulus['kind'], string>; stimulusRange: (first: number, last: number) => string; activityFailed: string; activityFailedNamed: (title: string) => string; activityFailedUnnamed: string; media: MediaTransportStrings; }
type LkDirection: type LkDirection = 'ltr' | 'rtl' | 'auto';
type LkStringsOverride: type LkStringsOverride = Partial<Omit<LkStrings, 'media' | 'stimulusKind'>> & { media?: Partial<MediaTransportStrings>; stimulusKind?: Partial<Record<Stimulus['kind'], string>>; };
```

## @intellectif/lk-react/theme/ThemeProvider

```ts
const darkTheme: darkTheme: Partial<ThemeTokens>
const defaultTheme: defaultTheme: ThemeTokens
function createTailwindTheme: declare function createTailwindTheme(theme: Partial<ThemeTokens>): TailwindThemeExtension;
function ThemeProvider: declare function ThemeProvider({ theme, children }: ThemeProviderProps): react_jsx_runtime.JSX.Element;
function useTheme: declare function useTheme(): ThemeTokens;
interface TailwindThemeExtension: interface TailwindThemeExtension { colors: Record<string, string>; spacing: Record<string, string>; borderRadius: Record<string, string>; fontFamily: Record<string, string>; fontSize: Record<string, string>; }
interface ThemeProviderProps: interface ThemeProviderProps { theme?: Partial<ThemeTokens>; children: ReactNode; }
```
