# @intellectif/lk-react — public API surface

Generated from the BUILT `.d.ts` by `pnpm api-report`. A diff here is a
semver question, not an error: decide patch / minor / major, then commit
this file with the changeset that explains it.

## @intellectif/lk-react

```ts
const CAPTURE_PROCESSOR_SOURCE: CAPTURE_PROCESSOR_SOURCE: string
const darkTheme: darkTheme: Partial<ThemeTokens>
const DEFAULT_STRINGS: DEFAULT_STRINGS: LkStrings
const defaultTheme: defaultTheme: ThemeTokens
function ActivityPreview: declare function ActivityPreview({ draft, renderMode, response, outcome, fallback, renderers, shuffleSeed, sanitizeHtml, strings, theme, locale, }: ActivityPreviewProps): react_jsx_runtime.JSX.Element;
function ActivitySequence: declare function ActivitySequence({ activities, renderers, onActivityComplete, onComplete, onFinished, onSubmit, onInteraction, renderMode, shuffle, shuffleSeed, defaultIndex, onIndexChange, responses, submittedSlotIds, outcomes, sanitizeHtml, theme, locale, disabled, mediaBudget, recordingBinding, assessments, workletUrl, strings, ai, delivery, scoring, }: ActivitySequenceProps): React.JSX.Element;
function asRenderable: declare function asRenderable<TData extends ActivityData>(redacted: RedactedActivityData): Renderable<TData>;
function asRenderableSequence: declare function asRenderableSequence(entries: readonly (RedactedActivityData | RedactedItemGroupData)[]): readonly SequenceEntry<RenderableActivity>[];
function createTailwindTheme: declare function createTailwindTheme(theme: Partial<ThemeTokens>): TailwindThemeExtension;
function Dictation: declare function Dictation(props: DictationProps): react_jsx_runtime.JSX.Element;
function directionForLocale: declare function directionForLocale(locale: string | undefined): 'ltr' | 'rtl';
function FillInTheBlanks: declare function FillInTheBlanks(props: FillInTheBlanksProps): react_jsx_runtime.JSX.Element;
function GapSelect: declare function GapSelect(props: GapSelectProps): react_jsx_runtime.JSX.Element;
function InteractiveVideo: declare function InteractiveVideo(props: InteractiveVideoProps): react_jsx_runtime.JSX.Element;
function LkAiProvider: declare function LkAiProvider({ ai, children }: LkAiProviderProps): React.JSX.Element;
function LkIntlProvider: declare function LkIntlProvider({ strings, locale, direction, children, }: LkIntlProviderProps): React.JSX.Element;
function mergeStrings: declare function mergeStrings(base: LkStrings, override?: LkStringsOverride): LkStrings;
function MultipleChoice: declare function MultipleChoice(props: MultipleChoiceProps): react_jsx_runtime.JSX.Element;
function PronunciationFeedback: declare function PronunciationFeedback(props: PronunciationFeedbackProps): react_jsx_runtime.JSX.Element;
function ReadAloud: declare function ReadAloud(props: ReadAloudProps): react_jsx_runtime.JSX.Element;
function resolveCaptionTracks: declare function resolveCaptionTracks(tracks: readonly MediaTrack[], preferences: Pick<VideoPreferences, 'captionLanguage' | 'secondaryCaptionLanguage'>): CaptionTracks;
function StimulusPanel: declare function StimulusPanel({ stimulus, range, sanitizeHtml, locale, renderMode, mediaBudget, mediaStrings, onInteraction, disabled, strings, }: StimulusPanelProps): React.JSX.Element;
function ThemeProvider: declare function ThemeProvider({ theme, children }: ThemeProviderProps): react_jsx_runtime.JSX.Element;
function useActivityState: declare function useActivityState(initialState?: ActivityState): UseActivityStateResult;
function useAiExplanation: declare function useAiExplanation(input: AiExplanationInput): AiExplanationHelp;
function useAiHints: declare function useAiHints(input: AiHintsInput): AiHintsHelp;
function useAiWritingFeedback: declare function useAiWritingFeedback(input: AiWritingFeedbackInput): AiWritingFeedbackHelp;
function useLearnerAi: declare function useLearnerAi(override?: LearnerAi): LearnerAi | undefined;
function useLkDirection: declare function useLkDirection(): 'ltr' | 'rtl';
function useLkStrings: declare function useLkStrings(override?: LkStringsOverride): LkStrings;
function useSpeechRecorder: declare function useSpeechRecorder(options: SpeechRecorderOptions): SpeechRecorder;
function useTheme: declare function useTheme(): ThemeTokens;
function useXAPI: declare function useXAPI(config: XAPIConfig): UseXAPIResult;
function WrittenResponse: declare function WrittenResponse(props: WrittenResponseProps): react_jsx_runtime.JSX.Element;
interface ActivityPreviewProps: interface ActivityPreviewProps { draft: unknown; renderMode?: RenderMode; response?: LearnerResponse; outcome?: ItemOutcome; fallback?: (result: DraftNotComplete) => ReactNode; renderers?: Readonly<Record<string, ActivityRenderer>>; shuffleSeed?: string; sanitizeHtml?: HtmlSanitizer; strings?: LkStringsOverride; theme?: Partial<ThemeTokens>; locale?: string; }
interface ActivityProps: interface ActivityProps<TData extends ActivityData = ActivityData> { data: RenderableActivity<TData>; onComplete?: (result: ActivityResult) => void; onSubmit?: (response: LearnerResponse) => void; value?: LearnerResponse; defaultValue?: LearnerResponse; defaultSubmitted?: boolean; onChange?: (response: LearnerResponse) => void; renderMode?: RenderMode; outcome?: ItemOutcome; sanitizeHtml?: HtmlSanitizer; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; strings?: LkStringsOverride; onInteraction?: (event: InteractionEvent) => void; ai?: LearnerAi; delivery?: DeliveryPolicy | null; scoring?: ItemScoringPolicy | null; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; }
interface ActivitySequenceProps: interface ActivitySequenceProps { activities: readonly SequenceEntry<RenderableActivity>[]; renderers?: Readonly<Record<string, ActivityRenderer>>; onActivityComplete?: (result: ActivityResult, index: number, slotId: string) => void; onSubmit?: (response: LearnerResponse, slot: { activityId: string; index: number; slotId: string; }) => void; onComplete?: (results: ActivityResult[]) => void; onFinished?: (items: SequenceItemOutcome[]) => void; onInteraction?: (event: InteractionEvent) => void; renderMode?: RenderMode; mediaBudget?: SequenceMediaBudget; recordingBinding?: SequenceRecordingBinding; assessments?: Readonly<Record<string, SpeechAssessment>>; workletUrl?: string; strings?: LkStringsOverride; ai?: LearnerAi; delivery?: DeliveryPolicy | null; scoring?: ItemScoringPolicy | null; shuffle?: 'entries' | 'none'; shuffleSeed?: string; defaultIndex?: number; onIndexChange?: (index: number) => void; responses?: Readonly<Record<string, LearnerResponse>>; submittedSlotIds?: readonly string[]; outcomes?: Readonly<Record<string, ItemOutcome>>; sanitizeHtml?: HtmlSanitizer; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; }
interface AiExplanationHelp: interface AiExplanationHelp { offered: boolean; status: 'idle' | 'loading' | 'shown' | 'unavailable'; explanation: AiTextResult | null; ask: () => void; }
interface AiExplanationInput: interface AiExplanationInput extends AiHelpSituation { outcome?: ItemOutcome; }
interface AiHelpSituation: interface AiHelpSituation { data: RenderableActivity; response: LearnerResponse; submitted: boolean; renderMode?: RenderMode; ai?: LearnerAi; locale?: string; onInteraction?: (event: InteractionEvent) => void; delivery?: DeliveryPolicy | null; }
interface AiHintsHelp: interface AiHintsHelp { offered: boolean; status: 'idle' | 'loading' | 'unavailable'; hints: readonly AiTextResult[]; limit: number; used: number; ask: () => void; }
interface AiHintsInput: interface AiHintsInput extends AiHelpSituation { disabled?: boolean; }
interface AiWritingFeedbackHelp: interface AiWritingFeedbackHelp { offered: boolean; status: 'idle' | 'loading' | 'unavailable'; feedback: readonly AiWritingFeedback[]; latest: AiWritingFeedback | null; current: boolean; limit: number; used: number; ask: () => void; }
interface AiWritingFeedbackInput: interface AiWritingFeedbackInput extends AiHelpSituation { disabled?: boolean; }
interface CaptionTracks: interface CaptionTracks { primary?: MediaTrack; secondary?: MediaTrack; }
interface DictationProps: interface DictationProps extends ActivityProps<DictationData> { }
interface FillInTheBlanksProps: interface FillInTheBlanksProps extends ActivityProps<FillInTheBlanksData> { showCorrectAnswers?: boolean; }
interface GapSelectProps: interface GapSelectProps extends ActivityProps<GapSelectData> { shuffleSeed?: string; }
interface InteractiveVideoProps: interface InteractiveVideoProps { group: RenderableItemGroup; renderMode?: RenderMode; progress?: MediaProgress; onProgress?: (progress: MediaProgress) => void; responses?: Readonly<Record<string, LearnerResponse>>; submittedSlotIds?: readonly string[]; outcomes?: Readonly<Record<string, ItemOutcome>>; onSubmit?: (response: LearnerResponse, slot: InteractiveVideoSlot) => void; onActivityComplete?: (result: ActivityResult, slot: InteractiveVideoSlot) => void; onFinished?: (summary: InteractiveVideoSummary) => void; onInteraction?: (event: InteractionEvent) => void; renderQuestion?: (question: InteractiveVideoQuestion) => ReactNode | undefined; recordingBinding?: SequenceRecordingBinding; assessments?: Readonly<Record<string, SpeechAssessment>>; workletUrl?: string; captionsLoader?: (track: MediaTrack) => Promise<string>; preferences?: Partial<VideoPreferences>; defaultPreferences?: Partial<VideoPreferences>; onPreferencesChange?: (next: VideoPreferences, change: Partial<VideoPreferences>) => void; label?: string; shuffleSeed?: string; locale?: string; strings?: LkStringsOverride; ai?: LearnerAi; delivery?: DeliveryPolicy | null; scoring?: ItemScoringPolicy | null; theme?: Partial<ThemeTokens>; sanitizeHtml?: HtmlSanitizer; }
interface InteractiveVideoQuestion: interface InteractiveVideoQuestion { activity: RenderableActivity; slot: InteractiveVideoSlot; renderMode: RenderMode; active: boolean; locale?: string; defaultValue?: LearnerResponse; defaultSubmitted: boolean; outcome?: ItemOutcome; portalContainer: HTMLElement | null; ai?: LearnerAi; delivery: ResolvedDeliveryPolicy; scoring: ResolvedItemScoringPolicy; submit(response: LearnerResponse): void; complete(result: ActivityResult): void; clear(): void; setPending(pending: boolean): void; emit(type: InteractionKind, payload?: Record<string, unknown>): void; }
interface InteractiveVideoSlot: interface InteractiveVideoSlot extends SequenceRecordingSlot { cueId: string; }
interface InteractiveVideoSummary: interface InteractiveVideoSummary { slots: { activityId: string; cueId: string; slotId: string; status: 'answered' | 'skipped' | 'unreached'; }[]; }
interface LearnerAi: interface LearnerAi { explain?: (request: AiExplanationRequest, options: { signal: AbortSignal; }) => Promise<AiTextResult>; hint?: (request: AiHintRequest, options: { signal: AbortSignal; }) => Promise<AiTextResult>; maxHints?: number; writingFeedback?: (request: AiWritingFeedbackRequest, options: { signal: AbortSignal; }) => Promise<AiWritingFeedbackResult>; maxWritingFeedback?: number; learnerLocale?: string; }
interface LkAiProviderProps: interface LkAiProviderProps { ai: LearnerAi; children: ReactNode; }
interface LkIntlProviderProps: interface LkIntlProviderProps { strings?: LkStringsOverride; locale?: string; direction?: LkDirection; children: React.ReactNode; }
interface LkStrings: interface LkStrings { submit: string; checkAnswers: string; submitAnswers: string; scoreAnnouncement: (percent: number, passed: boolean) => string; answerSubmitted: string; notGradedYet: string; noGradeAvailable: string; tryAgain: string; showAnswer: string; keepAnswer: string; triesLeft: (tries: number, costPercent: number) => string; countedTry: (counts: 'best' | 'first', percent: number) => string; scoreBeforeCosts: (percent: number) => string; hintCost: (percent: number) => string; showFeedback: string; hideFeedback: string; blankLabel: (ordinal: number) => string; gapLabel: (ordinal: number) => string; gapPlaceholder: string; showHint: string; hideHint: string; responseSubmitted: string; wordCount: (count: number) => string; wordBounds: (min: number, max: number) => string; notApplicable: string; awaitingHumanReview: string; awaitingGrade: string; couldNotBeGraded: string; previous: string; next: string; questionProgress: (index: number, total: number) => string; unsupportedActivity: string; dictationInputLabel: string; dictationRecording: string; dictationSlowRecording: string; dictationRevealNextWord: (revealed: number, total: number) => string; dictationResetHints: string; showSolution: string; hideSolution: string; dictationSolutionLabel: string; dictationMarksLabel: string; dictationDiffNote: string; dictationWordCorrect: (word: string) => string; dictationWordWrong: (word: string, expected: string) => string; dictationWordMissing: (expected: string) => string; dictationWordWrongUnnamed: (word: string) => string; dictationWordMissingUnnamed: string; dictationWordExtra: (word: string) => string; dictationLegendCorrect: string; dictationLegendWrong: string; dictationLegendMissing: string; dictationLegendExtra: string; dictationNothingTyped: string; dictationWordsSummary: (correct: number, total: number) => string; readAloudModelRecording: string; readAloudSlowRecording: string; readAloudRecord: string; readAloudStop: string; readAloudRerecord: string; readAloudYourRecording: string; readAloudPlaybackUnavailable: string; readAloudRecordingProgress: (seconds: number, maxSeconds: number) => string; readAloudRecordingStarted: string; readAloudRecordingStopped: (seconds: number, maxSeconds: number) => string; readAloudTakesRemaining: (remaining: number, max: number) => string; readAloudSubmitWithoutRecording: string; readAloudUploading: string; readAloudUploadFailed: string; readAloudTryAgain: string; readAloudAssessing: string; readAloudAssessmentUnavailable: string; readAloudNotHeard: string; readAloudNotAssessed: string; readAloudAssessmentFailed: string; readAloudRecorderError: (reason: SpeechRecorderError) => string; pronunciationFeedbackLabel: string; pronunciationDimension: (dimension: ReadAloudDimension) => string; pronunciationNotAssessed: string; pronunciationWordsLabel: string; pronunciationLegend: (state: ReadAloudWordState) => string; pronunciationWordCorrect: (word: string) => string; pronunciationWordMispronounced: (word: string) => string; pronunciationWordOmitted: (word: string) => string; pronunciationWordInserted: (word: string) => string; pronunciationWordDetails: (word: string) => string; pronunciationSyllables: string; pronunciationPhonemes: string; pronunciationSyllableSpelling: (syllable: string, grapheme: string) => string; pronunciationPhonemePosition: (ordinal: number) => string; pronunciationHeardAs: string; pronunciationPlayWord: (word: string) => string; pronunciationBreakUnexpected: string; pronunciationBreakMissing: string; pronunciationMonotone: string; pronunciationIpaNote: string; videoBack: (seconds: number) => string; videoForward: (seconds: number) => string; videoReplay: string; videoShowRemaining: string; videoShowElapsed: string; videoCaptionsShow: string; videoCaptionsHide: string; videoCaptionsFailed: string; videoSecondaryCaptionsFailed: string; videoSpeedValue: (rate: number) => string; videoSettings: string; videoCaptionLanguage: string; videoSecondCaptionLanguage: string; videoCaptionPair: (primary: string, secondary: string) => string; videoNoSecondLanguage: string; videoCaptionSize: string; videoCaptionSizeValue: (size: CaptionSize) => string; videoCaptionBackground: string; videoKeyboardShortcuts: string; videoShortcutList: string; videoClose: string; videoOn: string; videoOff: string; videoShortcut: (action: VideoShortcutAction) => string; videoPanel: string; videoContents: string; videoTranscript: string; videoTranscriptSearch: string; videoTranscriptNoMatch: string; videoPictureInPicture: string; videoFullscreen: string; videoExitFullscreen: string; videoError: (code: number) => string; videoTryAgain: string; videoQuiz: string; videoQuestionProgress: (index: number, total: number) => string; videoQuestionStep: (index: number, answered: boolean) => string; videoNextQuestion: string; videoContinue: string; videoSkipQuiz: string; videoRewatch: string; videoAnswerSaved: string; videoAnswerPending: string; videoRequired: string; videoQuizProgress: (answered: number, total: number) => string; videoQuizOpened: (time: string, questions: number) => string; videoHeldAtQuiz: (time: string) => string; videoHeldAhead: string; videoEnded: string; videoEndScore: (answered: number, total: number, percent: number) => string; videoEndAnswered: (answered: number, total: number) => string; videoWatchAgain: string; videoFinish: string; previewIncomplete: string; previewInvalid: string; embeddedMedia: string; stimulusKind: Record<Stimulus['kind'], string>; stimulusRange: (first: number, last: number) => string; activityFailed: string; activityFailedNamed: (title: string) => string; activityFailedUnnamed: string; aiExplain: string; aiExplaining: string; aiExplanation: string; aiExplanationUnavailable: string; aiHint: string; aiHintLoading: string; aiHintNumber: (hintNumber: number) => string; aiHints: string; aiHintUnavailable: string; aiNoMoreHints: string; aiNotice: string; aiWritingFeedback: string; aiWritingFeedbackLoading: string; aiWritingFeedbackHeading: string; aiWritingFeedbackUnavailable: string; aiNoMoreWritingFeedback: string; aiWritingFeedbackOutdated: string; aiCorrections: string; aiIndicativeScore: (percent: number) => string; media: MediaTransportStrings; }
interface MediaBudgetBinding: interface MediaBudgetBinding { key: string; entry?: MediaPlayLedgerEntry; enforced?: boolean; slotId: string; index: number; activityId?: string; onPlayConsumed?: (claim: MediaPlayClaim) => Promise<MediaPlayGrant | undefined> | undefined; onPlayRefunded?: (claim: MediaPlayClaim) => void; onPosition?: (key: string, seconds: number) => void; strings?: Partial<MediaTransportStrings>; }
interface MediaTransportStrings: interface MediaTransportStrings { play: string; pause: string; preparing: string; mute: string; unmute: string; volume: string; speed: string; seek: string; timeValue: (elapsed: string, duration: string) => string; playsRemaining: (remaining: number, max: number) => string; noPlaysRemaining: string; lastPlayConfirm: string; lastPlayStart: string; lastPlayCancel: string; seekBlocked: string; rateBlocked: string; playFailed: string; }
interface MultipleChoiceProps: interface MultipleChoiceProps extends ActivityProps<MultipleChoiceData> { shuffleSeed?: string; }
interface PronunciationFeedbackProps: interface PronunciationFeedbackProps { data: Pick<ReadAloudData, 'locale' | 'referenceText'>; assessment: SpeechAssessment; grade?: GradeRecord; audioUrl?: string; breakThreshold?: number; monotoneThreshold?: number; locale?: string; theme?: Partial<ThemeTokens>; strings?: LkStringsOverride; }
interface ReadAloudProps: interface ReadAloudProps extends ActivityProps<ReadAloudData> { recordingBinding?: RecordingBinding; assessment?: SpeechAssessment; breakThreshold?: number; monotoneThreshold?: number; workletUrl?: string; onChange?: (response: LearnerResponse) => void; }
interface RecordedTake: interface RecordedTake { blob: Blob; mimeType: string; durationMs: number; peakLevel: number; }
interface RecordingBinding: interface RecordingBinding { upload(take: RecordedTake): Promise<RecordingRef>; assess?(ref: RecordingRef): Promise<ReadAloudAssessResult>; playbackUrl?(ref: RecordingRef): Promise<string>; }
interface SequenceMediaBudget: interface SequenceMediaBudget { plays?: Readonly<Record<string, MediaPlayLedgerEntry>>; resumeKey?: string; enforced?: boolean; onPlayConsumed?: (claim: MediaPlayClaim) => Promise<MediaPlayGrant | undefined> | undefined; onPlayRefunded?: (claim: MediaPlayClaim) => void; onPosition?: (key: string, seconds: number) => void; strings?: Partial<MediaTransportStrings>; }
interface SequenceQuestion: interface SequenceQuestion { slot: SequenceRecordingSlot; active: boolean; portalContainer: HTMLElement | null; clear(): void; setPending(pending: boolean): void; emit(type: InteractionKind, payload?: Record<string, unknown>): void; }
interface SequenceRecordingBinding: interface SequenceRecordingBinding { upload(take: RecordedTake, slot: SequenceRecordingSlot): Promise<RecordingRef>; assess?(ref: RecordingRef, slot: SequenceRecordingSlot): Promise<ReadAloudAssessResult>; playbackUrl?(ref: RecordingRef, slot: SequenceRecordingSlot): Promise<string>; }
interface SequenceRecordingSlot: interface SequenceRecordingSlot { slotId: string; index: number; activityId: string; }
interface SpeechRecorder: interface SpeechRecorder { status: SpeechRecorderStatus; error: SpeechRecorderError | null; level: number; elapsedMs: number; take: RecordedTake | null; takesUsed: number; canRecord: boolean; start(): Promise<void>; stop(): void; discard(): void; reset(): void; }
interface SpeechRecorderOptions: interface SpeechRecorderOptions { maxDurationMs: number; minDurationMs?: number; maxTakes?: number; workletUrl?: string; }
interface StimulusPanelProps: interface StimulusPanelProps { stimulus: Stimulus; range?: { first: number; last: number; }; sanitizeHtml?: HtmlSanitizer; locale?: string; renderMode?: RenderMode; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; onInteraction?: (event: InteractionEvent) => void; disabled?: boolean; strings?: LkStringsOverride; }
interface TailwindThemeExtension: interface TailwindThemeExtension { colors: Record<string, string>; spacing: Record<string, string>; borderRadius: Record<string, string>; fontFamily: Record<string, string>; fontSize: Record<string, string>; }
interface ThemeProviderProps: interface ThemeProviderProps { theme?: Partial<ThemeTokens>; children: ReactNode; }
interface UseActivityStateResult: interface UseActivityStateResult { state: ActivityState; start: () => void; complete: () => void; review: () => void; reset: (to?: ActivityState) => void; getTimeSpent: () => number; }
interface UseXAPIResult: interface UseXAPIResult { sendStatement: (statement: XAPIStatement) => Promise<void>; }
interface VideoPreferences: interface VideoPreferences { speed: number; volume: number; muted: boolean; captions: boolean; captionLanguage: null | string; secondaryCaptionLanguage: null | string; captionSize: CaptionSize; captionBackground: boolean; panel: boolean; shortcuts: boolean; }
interface WrittenResponseProps: interface WrittenResponseProps { data: Renderable<WrittenResponseData>; onSubmitted?: (submission: WrittenResponseSubmission) => void; onSubmit?: (response: LearnerResponse) => void; value?: LearnerResponse; defaultValue?: LearnerResponse; defaultSubmitted?: boolean; onChange?: (response: LearnerResponse) => void; renderMode?: RenderMode; outcome?: ItemOutcome; sanitizeHtml?: HtmlSanitizer; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; strings?: LkStringsOverride; onInteraction?: (event: InteractionEvent) => void; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; delivery?: DeliveryPolicy | null; ai?: LearnerAi; }
interface WrittenResponseSubmission: interface WrittenResponseSubmission { text: string; wordCount: number; withinWordBounds: boolean; timeSpent: number; xapiStatement: XAPIStatement; }
type ActivityRenderer: type ActivityRenderer = ComponentType<ActivityProps & { question?: SequenceQuestion; }>;
type ActivityState: type ActivityState = 'completed' | 'idle' | 'in-progress' | 'reviewing';
type CaptionSize: type CaptionSize = 'large' | 'medium' | 'small';
type HtmlSanitizer: type HtmlSanitizer = (html: string) => string;
type LkDirection: type LkDirection = 'auto' | 'ltr' | 'rtl';
type LkStringsOverride: type LkStringsOverride = Partial<Omit<LkStrings, 'media' | 'stimulusKind'>> & { media?: Partial<MediaTransportStrings>; stimulusKind?: Partial<Record<Stimulus['kind'], string>>; };
type ReadAloudAssessResult: type ReadAloudAssessResult = { assessment: SpeechAssessment; grade: GradeRecord; status: 'graded'; } | { assessment?: SpeechAssessment; code: string; status: 'unscorable'; } | { retryable: boolean; status: 'failed'; };
type Renderable: type Renderable<TData> = Omit<TData, 'scoringStrategy'> & { redacted?: true; scoringStrategy?: unknown; };
type RenderableActivity: type RenderableActivity<TData extends ActivityData = ActivityData> = TData extends unknown ? Renderable<TData> : never;
type RenderableItemGroup: type RenderableItemGroup = ItemGroup<RenderableActivity>;
type RenderMode: type RenderMode = 'exam' | 'practice' | 'review';
type SequenceItemOutcome: type SequenceItemOutcome = { activityId: string; index: number; kind: 'responded'; response: LearnerResponse; slotId: string; } | { activityId: string; index: number; kind: 'restored'; response?: LearnerResponse; slotId: string; } | { activityId: string; index: number; kind: 'scored'; response?: LearnerResponse; result: ActivityResult; slotId: string; } | { activityId: string; index: number; kind: 'submitted'; slotId: string; submission: WrittenResponseSubmission; } | { activityId: string; index: number; kind: 'unsubmitted'; slotId: string; };
type SpeechRecorderError: type SpeechRecorderError = 'failed' | 'no-device' | 'permission-denied' | 'too-short' | 'unsupported';
type SpeechRecorderStatus: type SpeechRecorderStatus = 'error' | 'idle' | 'recorded' | 'recording' | 'requesting-permission';
```

## @intellectif/lk-react/ai/LkAiProvider

```ts
function LkAiProvider: declare function LkAiProvider({ ai, children }: LkAiProviderProps): React.JSX.Element;
function useLearnerAi: declare function useLearnerAi(override?: LearnerAi): LearnerAi | undefined;
interface LearnerAi: interface LearnerAi { explain?: (request: AiExplanationRequest, options: { signal: AbortSignal; }) => Promise<AiTextResult>; hint?: (request: AiHintRequest, options: { signal: AbortSignal; }) => Promise<AiTextResult>; maxHints?: number; writingFeedback?: (request: AiWritingFeedbackRequest, options: { signal: AbortSignal; }) => Promise<AiWritingFeedbackResult>; maxWritingFeedback?: number; learnerLocale?: string; }
interface LkAiProviderProps: interface LkAiProviderProps { ai: LearnerAi; children: ReactNode; }
```

## @intellectif/lk-react/ai/useAiHelp

```ts
function useAiExplanation: declare function useAiExplanation(input: AiExplanationInput): AiExplanationHelp;
function useAiHints: declare function useAiHints(input: AiHintsInput): AiHintsHelp;
function useAiWritingFeedback: declare function useAiWritingFeedback(input: AiWritingFeedbackInput): AiWritingFeedbackHelp;
interface AiExplanationHelp: interface AiExplanationHelp { offered: boolean; status: 'idle' | 'loading' | 'shown' | 'unavailable'; explanation: AiTextResult | null; ask: () => void; }
interface AiExplanationInput: interface AiExplanationInput extends AiHelpSituation { outcome?: ItemOutcome; }
interface AiHelpSituation: interface AiHelpSituation { data: RenderableActivity; response: LearnerResponse; submitted: boolean; renderMode?: RenderMode; ai?: LearnerAi; locale?: string; onInteraction?: (event: InteractionEvent) => void; delivery?: DeliveryPolicy | null; }
interface AiHintsHelp: interface AiHintsHelp { offered: boolean; status: 'idle' | 'loading' | 'unavailable'; hints: readonly AiTextResult[]; limit: number; used: number; ask: () => void; }
interface AiHintsInput: interface AiHintsInput extends AiHelpSituation { disabled?: boolean; }
interface AiWritingFeedbackHelp: interface AiWritingFeedbackHelp { offered: boolean; status: 'idle' | 'loading' | 'unavailable'; feedback: readonly AiWritingFeedback[]; latest: AiWritingFeedback | null; current: boolean; limit: number; used: number; ask: () => void; }
interface AiWritingFeedbackInput: interface AiWritingFeedbackInput extends AiHelpSituation { disabled?: boolean; }
```

## @intellectif/lk-react/components/ActivityPreview

```ts
function ActivityPreview: declare function ActivityPreview({ draft, renderMode, response, outcome, fallback, renderers, shuffleSeed, sanitizeHtml, strings, theme, locale, }: ActivityPreviewProps): react_jsx_runtime.JSX.Element;
interface ActivityPreviewProps: interface ActivityPreviewProps { draft: unknown; renderMode?: RenderMode; response?: LearnerResponse; outcome?: ItemOutcome; fallback?: (result: DraftNotComplete) => ReactNode; renderers?: Readonly<Record<string, ActivityRenderer>>; shuffleSeed?: string; sanitizeHtml?: HtmlSanitizer; strings?: LkStringsOverride; theme?: Partial<ThemeTokens>; locale?: string; }
```

## @intellectif/lk-react/components/ActivitySequence

```ts
function ActivitySequence: declare function ActivitySequence({ activities, renderers, onActivityComplete, onComplete, onFinished, onSubmit, onInteraction, renderMode, shuffle, shuffleSeed, defaultIndex, onIndexChange, responses, submittedSlotIds, outcomes, sanitizeHtml, theme, locale, disabled, mediaBudget, recordingBinding, assessments, workletUrl, strings, ai, delivery, scoring, }: ActivitySequenceProps): React.JSX.Element;
interface ActivitySequenceProps: interface ActivitySequenceProps { activities: readonly SequenceEntry<RenderableActivity>[]; renderers?: Readonly<Record<string, ActivityRenderer>>; onActivityComplete?: (result: ActivityResult, index: number, slotId: string) => void; onSubmit?: (response: LearnerResponse, slot: { activityId: string; index: number; slotId: string; }) => void; onComplete?: (results: ActivityResult[]) => void; onFinished?: (items: SequenceItemOutcome[]) => void; onInteraction?: (event: InteractionEvent) => void; renderMode?: RenderMode; mediaBudget?: SequenceMediaBudget; recordingBinding?: SequenceRecordingBinding; assessments?: Readonly<Record<string, SpeechAssessment>>; workletUrl?: string; strings?: LkStringsOverride; ai?: LearnerAi; delivery?: DeliveryPolicy | null; scoring?: ItemScoringPolicy | null; shuffle?: 'entries' | 'none'; shuffleSeed?: string; defaultIndex?: number; onIndexChange?: (index: number) => void; responses?: Readonly<Record<string, LearnerResponse>>; submittedSlotIds?: readonly string[]; outcomes?: Readonly<Record<string, ItemOutcome>>; sanitizeHtml?: HtmlSanitizer; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; }
interface SequenceQuestion: interface SequenceQuestion { slot: SequenceRecordingSlot; active: boolean; portalContainer: HTMLElement | null; clear(): void; setPending(pending: boolean): void; emit(type: InteractionKind, payload?: Record<string, unknown>): void; }
type ActivityRenderer: type ActivityRenderer = ComponentType<ActivityProps & { question?: SequenceQuestion; }>;
type SequenceItemOutcome: type SequenceItemOutcome = { activityId: string; index: number; kind: 'responded'; response: LearnerResponse; slotId: string; } | { activityId: string; index: number; kind: 'restored'; response?: LearnerResponse; slotId: string; } | { activityId: string; index: number; kind: 'scored'; response?: LearnerResponse; result: ActivityResult; slotId: string; } | { activityId: string; index: number; kind: 'submitted'; slotId: string; submission: WrittenResponseSubmission; } | { activityId: string; index: number; kind: 'unsubmitted'; slotId: string; };
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

## @intellectif/lk-react/components/InteractiveVideo

```ts
function InteractiveVideo: declare function InteractiveVideo(props: InteractiveVideoProps): react_jsx_runtime.JSX.Element;
function resolveCaptionTracks: declare function resolveCaptionTracks(tracks: readonly MediaTrack[], preferences: Pick<VideoPreferences, 'captionLanguage' | 'secondaryCaptionLanguage'>): CaptionTracks;
interface CaptionTracks: interface CaptionTracks { primary?: MediaTrack; secondary?: MediaTrack; }
interface InteractiveVideoProps: interface InteractiveVideoProps { group: RenderableItemGroup; renderMode?: RenderMode; progress?: MediaProgress; onProgress?: (progress: MediaProgress) => void; responses?: Readonly<Record<string, LearnerResponse>>; submittedSlotIds?: readonly string[]; outcomes?: Readonly<Record<string, ItemOutcome>>; onSubmit?: (response: LearnerResponse, slot: InteractiveVideoSlot) => void; onActivityComplete?: (result: ActivityResult, slot: InteractiveVideoSlot) => void; onFinished?: (summary: InteractiveVideoSummary) => void; onInteraction?: (event: InteractionEvent) => void; renderQuestion?: (question: InteractiveVideoQuestion) => ReactNode | undefined; recordingBinding?: SequenceRecordingBinding; assessments?: Readonly<Record<string, SpeechAssessment>>; workletUrl?: string; captionsLoader?: (track: MediaTrack) => Promise<string>; preferences?: Partial<VideoPreferences>; defaultPreferences?: Partial<VideoPreferences>; onPreferencesChange?: (next: VideoPreferences, change: Partial<VideoPreferences>) => void; label?: string; shuffleSeed?: string; locale?: string; strings?: LkStringsOverride; ai?: LearnerAi; delivery?: DeliveryPolicy | null; scoring?: ItemScoringPolicy | null; theme?: Partial<ThemeTokens>; sanitizeHtml?: HtmlSanitizer; }
interface InteractiveVideoQuestion: interface InteractiveVideoQuestion { activity: RenderableActivity; slot: InteractiveVideoSlot; renderMode: RenderMode; active: boolean; locale?: string; defaultValue?: LearnerResponse; defaultSubmitted: boolean; outcome?: ItemOutcome; portalContainer: HTMLElement | null; ai?: LearnerAi; delivery: ResolvedDeliveryPolicy; scoring: ResolvedItemScoringPolicy; submit(response: LearnerResponse): void; complete(result: ActivityResult): void; clear(): void; setPending(pending: boolean): void; emit(type: InteractionKind, payload?: Record<string, unknown>): void; }
interface InteractiveVideoSlot: interface InteractiveVideoSlot extends SequenceRecordingSlot { cueId: string; }
interface InteractiveVideoSummary: interface InteractiveVideoSummary { slots: { activityId: string; cueId: string; slotId: string; status: 'answered' | 'skipped' | 'unreached'; }[]; }
interface VideoPreferences: interface VideoPreferences { speed: number; volume: number; muted: boolean; captions: boolean; captionLanguage: null | string; secondaryCaptionLanguage: null | string; captionSize: CaptionSize; captionBackground: boolean; panel: boolean; shortcuts: boolean; }
type CaptionSize: type CaptionSize = 'large' | 'medium' | 'small';
type RenderableItemGroup: type RenderableItemGroup = ItemGroup<RenderableActivity>;
```

## @intellectif/lk-react/components/MultipleChoice

```ts
function MultipleChoice: declare function MultipleChoice(props: MultipleChoiceProps): react_jsx_runtime.JSX.Element;
interface MultipleChoiceProps: interface MultipleChoiceProps extends ActivityProps<MultipleChoiceData> { shuffleSeed?: string; }
```

## @intellectif/lk-react/components/PronunciationFeedback

```ts
function PronunciationFeedback: declare function PronunciationFeedback(props: PronunciationFeedbackProps): react_jsx_runtime.JSX.Element;
interface PronunciationFeedbackProps: interface PronunciationFeedbackProps { data: Pick<ReadAloudData, 'locale' | 'referenceText'>; assessment: SpeechAssessment; grade?: GradeRecord; audioUrl?: string; breakThreshold?: number; monotoneThreshold?: number; locale?: string; theme?: Partial<ThemeTokens>; strings?: LkStringsOverride; }
```

## @intellectif/lk-react/components/ReadAloud

```ts
function ReadAloud: declare function ReadAloud(props: ReadAloudProps): react_jsx_runtime.JSX.Element;
interface ReadAloudProps: interface ReadAloudProps extends ActivityProps<ReadAloudData> { recordingBinding?: RecordingBinding; assessment?: SpeechAssessment; breakThreshold?: number; monotoneThreshold?: number; workletUrl?: string; onChange?: (response: LearnerResponse) => void; }
interface RecordedTake: interface RecordedTake { blob: Blob; mimeType: string; durationMs: number; peakLevel: number; }
interface RecordingBinding: interface RecordingBinding { upload(take: RecordedTake): Promise<RecordingRef>; assess?(ref: RecordingRef): Promise<ReadAloudAssessResult>; playbackUrl?(ref: RecordingRef): Promise<string>; }
type ReadAloudAssessResult: type ReadAloudAssessResult = { assessment: SpeechAssessment; grade: GradeRecord; status: 'graded'; } | { assessment?: SpeechAssessment; code: string; status: 'unscorable'; } | { retryable: boolean; status: 'failed'; };
```

## @intellectif/lk-react/components/StimulusPanel

```ts
function StimulusPanel: declare function StimulusPanel({ stimulus, range, sanitizeHtml, locale, renderMode, mediaBudget, mediaStrings, onInteraction, disabled, strings, }: StimulusPanelProps): React.JSX.Element;
interface StimulusPanelProps: interface StimulusPanelProps { stimulus: Stimulus; range?: { first: number; last: number; }; sanitizeHtml?: HtmlSanitizer; locale?: string; renderMode?: RenderMode; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; onInteraction?: (event: InteractionEvent) => void; disabled?: boolean; strings?: LkStringsOverride; }
```

## @intellectif/lk-react/components/WrittenResponse

```ts
function WrittenResponse: declare function WrittenResponse(props: WrittenResponseProps): react_jsx_runtime.JSX.Element;
interface WrittenResponseProps: interface WrittenResponseProps { data: Renderable<WrittenResponseData>; onSubmitted?: (submission: WrittenResponseSubmission) => void; onSubmit?: (response: LearnerResponse) => void; value?: LearnerResponse; defaultValue?: LearnerResponse; defaultSubmitted?: boolean; onChange?: (response: LearnerResponse) => void; renderMode?: RenderMode; outcome?: ItemOutcome; sanitizeHtml?: HtmlSanitizer; mediaBudget?: MediaBudgetBinding; mediaStrings?: Partial<MediaTransportStrings>; strings?: LkStringsOverride; onInteraction?: (event: InteractionEvent) => void; theme?: Partial<ThemeTokens>; locale?: string; disabled?: boolean; delivery?: DeliveryPolicy | null; ai?: LearnerAi; }
interface WrittenResponseSubmission: interface WrittenResponseSubmission { text: string; wordCount: number; withinWordBounds: boolean; timeSpent: number; xapiStatement: XAPIStatement; }
type HtmlSanitizer: type HtmlSanitizer = (html: string) => string;
type Renderable: type Renderable<TData> = Omit<TData, 'scoringStrategy'> & { redacted?: true; scoringStrategy?: unknown; };
type RenderMode: type RenderMode = 'exam' | 'practice' | 'review';
```

## @intellectif/lk-react/hooks/useActivityState

```ts
function useActivityState: declare function useActivityState(initialState?: ActivityState): UseActivityStateResult;
interface UseActivityStateResult: interface UseActivityStateResult { state: ActivityState; start: () => void; complete: () => void; review: () => void; reset: (to?: ActivityState) => void; getTimeSpent: () => number; }
type ActivityState: type ActivityState = 'completed' | 'idle' | 'in-progress' | 'reviewing';
```

## @intellectif/lk-react/hooks/useSpeechRecorder

```ts
const CAPTURE_PROCESSOR_SOURCE: CAPTURE_PROCESSOR_SOURCE: string
function useSpeechRecorder: declare function useSpeechRecorder(options: SpeechRecorderOptions): SpeechRecorder;
interface RecordedTake: interface RecordedTake { blob: Blob; mimeType: string; durationMs: number; peakLevel: number; }
interface SpeechRecorder: interface SpeechRecorder { status: SpeechRecorderStatus; error: SpeechRecorderError | null; level: number; elapsedMs: number; take: RecordedTake | null; takesUsed: number; canRecord: boolean; start(): Promise<void>; stop(): void; discard(): void; reset(): void; }
interface SpeechRecorderOptions: interface SpeechRecorderOptions { maxDurationMs: number; minDurationMs?: number; maxTakes?: number; workletUrl?: string; }
type SpeechRecorderError: type SpeechRecorderError = 'failed' | 'no-device' | 'permission-denied' | 'too-short' | 'unsupported';
type SpeechRecorderStatus: type SpeechRecorderStatus = 'error' | 'idle' | 'recorded' | 'recording' | 'requesting-permission';
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
interface LkStrings: interface LkStrings { submit: string; checkAnswers: string; submitAnswers: string; scoreAnnouncement: (percent: number, passed: boolean) => string; answerSubmitted: string; notGradedYet: string; noGradeAvailable: string; tryAgain: string; showAnswer: string; keepAnswer: string; triesLeft: (tries: number, costPercent: number) => string; countedTry: (counts: 'best' | 'first', percent: number) => string; scoreBeforeCosts: (percent: number) => string; hintCost: (percent: number) => string; showFeedback: string; hideFeedback: string; blankLabel: (ordinal: number) => string; gapLabel: (ordinal: number) => string; gapPlaceholder: string; showHint: string; hideHint: string; responseSubmitted: string; wordCount: (count: number) => string; wordBounds: (min: number, max: number) => string; notApplicable: string; awaitingHumanReview: string; awaitingGrade: string; couldNotBeGraded: string; previous: string; next: string; questionProgress: (index: number, total: number) => string; unsupportedActivity: string; dictationInputLabel: string; dictationRecording: string; dictationSlowRecording: string; dictationRevealNextWord: (revealed: number, total: number) => string; dictationResetHints: string; showSolution: string; hideSolution: string; dictationSolutionLabel: string; dictationMarksLabel: string; dictationDiffNote: string; dictationWordCorrect: (word: string) => string; dictationWordWrong: (word: string, expected: string) => string; dictationWordMissing: (expected: string) => string; dictationWordWrongUnnamed: (word: string) => string; dictationWordMissingUnnamed: string; dictationWordExtra: (word: string) => string; dictationLegendCorrect: string; dictationLegendWrong: string; dictationLegendMissing: string; dictationLegendExtra: string; dictationNothingTyped: string; dictationWordsSummary: (correct: number, total: number) => string; readAloudModelRecording: string; readAloudSlowRecording: string; readAloudRecord: string; readAloudStop: string; readAloudRerecord: string; readAloudYourRecording: string; readAloudPlaybackUnavailable: string; readAloudRecordingProgress: (seconds: number, maxSeconds: number) => string; readAloudRecordingStarted: string; readAloudRecordingStopped: (seconds: number, maxSeconds: number) => string; readAloudTakesRemaining: (remaining: number, max: number) => string; readAloudSubmitWithoutRecording: string; readAloudUploading: string; readAloudUploadFailed: string; readAloudTryAgain: string; readAloudAssessing: string; readAloudAssessmentUnavailable: string; readAloudNotHeard: string; readAloudNotAssessed: string; readAloudAssessmentFailed: string; readAloudRecorderError: (reason: SpeechRecorderError) => string; pronunciationFeedbackLabel: string; pronunciationDimension: (dimension: ReadAloudDimension) => string; pronunciationNotAssessed: string; pronunciationWordsLabel: string; pronunciationLegend: (state: ReadAloudWordState) => string; pronunciationWordCorrect: (word: string) => string; pronunciationWordMispronounced: (word: string) => string; pronunciationWordOmitted: (word: string) => string; pronunciationWordInserted: (word: string) => string; pronunciationWordDetails: (word: string) => string; pronunciationSyllables: string; pronunciationPhonemes: string; pronunciationSyllableSpelling: (syllable: string, grapheme: string) => string; pronunciationPhonemePosition: (ordinal: number) => string; pronunciationHeardAs: string; pronunciationPlayWord: (word: string) => string; pronunciationBreakUnexpected: string; pronunciationBreakMissing: string; pronunciationMonotone: string; pronunciationIpaNote: string; videoBack: (seconds: number) => string; videoForward: (seconds: number) => string; videoReplay: string; videoShowRemaining: string; videoShowElapsed: string; videoCaptionsShow: string; videoCaptionsHide: string; videoCaptionsFailed: string; videoSecondaryCaptionsFailed: string; videoSpeedValue: (rate: number) => string; videoSettings: string; videoCaptionLanguage: string; videoSecondCaptionLanguage: string; videoCaptionPair: (primary: string, secondary: string) => string; videoNoSecondLanguage: string; videoCaptionSize: string; videoCaptionSizeValue: (size: CaptionSize) => string; videoCaptionBackground: string; videoKeyboardShortcuts: string; videoShortcutList: string; videoClose: string; videoOn: string; videoOff: string; videoShortcut: (action: VideoShortcutAction) => string; videoPanel: string; videoContents: string; videoTranscript: string; videoTranscriptSearch: string; videoTranscriptNoMatch: string; videoPictureInPicture: string; videoFullscreen: string; videoExitFullscreen: string; videoError: (code: number) => string; videoTryAgain: string; videoQuiz: string; videoQuestionProgress: (index: number, total: number) => string; videoQuestionStep: (index: number, answered: boolean) => string; videoNextQuestion: string; videoContinue: string; videoSkipQuiz: string; videoRewatch: string; videoAnswerSaved: string; videoAnswerPending: string; videoRequired: string; videoQuizProgress: (answered: number, total: number) => string; videoQuizOpened: (time: string, questions: number) => string; videoHeldAtQuiz: (time: string) => string; videoHeldAhead: string; videoEnded: string; videoEndScore: (answered: number, total: number, percent: number) => string; videoEndAnswered: (answered: number, total: number) => string; videoWatchAgain: string; videoFinish: string; previewIncomplete: string; previewInvalid: string; embeddedMedia: string; stimulusKind: Record<Stimulus['kind'], string>; stimulusRange: (first: number, last: number) => string; activityFailed: string; activityFailedNamed: (title: string) => string; activityFailedUnnamed: string; aiExplain: string; aiExplaining: string; aiExplanation: string; aiExplanationUnavailable: string; aiHint: string; aiHintLoading: string; aiHintNumber: (hintNumber: number) => string; aiHints: string; aiHintUnavailable: string; aiNoMoreHints: string; aiNotice: string; aiWritingFeedback: string; aiWritingFeedbackLoading: string; aiWritingFeedbackHeading: string; aiWritingFeedbackUnavailable: string; aiNoMoreWritingFeedback: string; aiWritingFeedbackOutdated: string; aiCorrections: string; aiIndicativeScore: (percent: number) => string; media: MediaTransportStrings; }
type LkDirection: type LkDirection = 'auto' | 'ltr' | 'rtl';
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
