# @intellectif/lk-core — public API surface

Generated from the BUILT `.d.ts` by `pnpm api-report`. A diff here is a
semver question, not an error: decide patch / minor / major, then commit
this file with the changeset that explains it.

## @intellectif/lk-core

```ts
class ActivitySchemaError: declare class ActivitySchemaError extends Error { readonly activityType: string; readonly errors: ValidationError[]; constructor(activityType: string, errors: ValidationError[]); }
class DeferredScoringError: declare class DeferredScoringError extends Error { readonly activityType: string; constructor(activityType: string); }
class RedactedScoringError: declare class RedactedScoringError extends Error { readonly activityType: string; constructor(activityType: string); }
class UnknownActivityTypeError: declare class UnknownActivityTypeError extends Error { readonly activityType: string; constructor(activityType: string); }
const AI_COACHING_MAX_TIP_LENGTH: AI_COACHING_MAX_TIP_LENGTH = 500
const AI_COACHING_MAX_WORDS: AI_COACHING_MAX_WORDS = 20
const AI_CRITIQUE_MAX_FIELD_LENGTH: AI_CRITIQUE_MAX_FIELD_LENGTH = 500
const AI_CRITIQUE_MAX_FINDINGS: AI_CRITIQUE_MAX_FINDINGS = 20
const AI_DRAFTS_MAX_COUNT: AI_DRAFTS_MAX_COUNT = 50
const AI_DRAFTS_MAX_REPAIRS: AI_DRAFTS_MAX_REPAIRS = 3
const AI_EXPLANATION_TYPES: AI_EXPLANATION_TYPES: readonly AiSupportedActivityType[]
const AI_GRADING_PROBABILITY_TOLERANCE: AI_GRADING_PROBABILITY_TOLERANCE = 0.000001
const AI_HINT_TYPES: AI_HINT_TYPES: readonly AiSupportedActivityType[]
const AI_MATERIAL_MAX_LENGTH: AI_MATERIAL_MAX_LENGTH = 12000
const AI_TEXT_MAX_LENGTH: AI_TEXT_MAX_LENGTH = 2000
const AI_VARIANT_CODE_SEVERITY: AI_VARIANT_CODE_SEVERITY: { readonly variant_length: "warning"; readonly variant_missing: "invalid"; readonly variant_near_copy: "warning"; readonly variant_same_key: "warning"; readonly variant_structure: "invalid"; readonly variant_type: "invalid"; }
const AI_VARIANT_LENGTH_BANDS: AI_VARIANT_LENGTH_BANDS: { readonly item: { readonly minWords: 2; readonly ratio: 0.25; }; readonly material: { readonly minWords: 5; readonly ratio: 0.1; }; }
const AI_VARIANT_NEAR_COPY_THRESHOLD: AI_VARIANT_NEAR_COPY_THRESHOLD = 0.5
const AI_VARIANTS_MAX_EXEMPLARS: AI_VARIANTS_MAX_EXEMPLARS = 20
const AI_VARIANTS_MAX_MATERIAL_LENGTH: AI_VARIANTS_MAX_MATERIAL_LENGTH = 12000
const AI_VARIANTS_MAX_REPAIRS: AI_VARIANTS_MAX_REPAIRS = 3
const AI_WRITING_MAX_CORRECTIONS: AI_WRITING_MAX_CORRECTIONS = 20
const AI_WRITING_MAX_FIELD_LENGTH: AI_WRITING_MAX_FIELD_LENGTH = 500
const BUILT_IN_ACTIVITY_TYPES: BUILT_IN_ACTIVITY_TYPES: readonly ["multiple-choice", "fill-in-the-blanks", "written-response", "gap-select", "dictation", "read-aloud"]
const DEFAULT_ITEM_SCORING_POLICY: DEFAULT_ITEM_SCORING_POLICY: ResolvedItemScoringPolicy
const DEFAULT_PASS_THRESHOLD: DEFAULT_PASS_THRESHOLD = 0.7
const DICTATION_MAX_ACCEPTED_TRANSCRIPTS: DICTATION_MAX_ACCEPTED_TRANSCRIPTS = 10
const DICTATION_MAX_EQUIVALENCE_LENGTH: DICTATION_MAX_EQUIVALENCE_LENGTH = 200
const DICTATION_MAX_EQUIVALENCES: DICTATION_MAX_EQUIVALENCES = 100
const DICTATION_MAX_TEXT_LENGTH: DICTATION_MAX_TEXT_LENGTH = 8000
const DICTATION_MAX_TRANSCRIPT_LENGTH: DICTATION_MAX_TRANSCRIPT_LENGTH = 2000
const dictationJsonSchema: dictationJsonSchema: Record<string, unknown>
const dictationType: dictationType: ActivityTypeDescriptor<DictationData, DictationLearnerResponse>
const fillInTheBlanksJsonSchema: fillInTheBlanksJsonSchema: Record<string, unknown>
const fillInTheBlanksType: fillInTheBlanksType: ActivityTypeDescriptor<FillInTheBlanksData, FillInTheBlanksLearnerResponse>
const gapSelectJsonSchema: gapSelectJsonSchema: Record<string, unknown>
const gapSelectType: gapSelectType: ActivityTypeDescriptor<GapSelectData, GapSelectLearnerResponse>
const INTERACTIVE_VIDEO_ITEM_TYPES: INTERACTIVE_VIDEO_ITEM_TYPES: readonly ["multiple-choice", "fill-in-the-blanks", "gap-select", "dictation", "read-aloud"]
const ITEM_SCORING_MAX_RETRIES: ITEM_SCORING_MAX_RETRIES = 10
const itemGroupJsonSchema: itemGroupJsonSchema: Record<string, unknown>
const multipleChoiceJsonSchema: multipleChoiceJsonSchema: Record<string, unknown>
const multipleChoiceType: multipleChoiceType: ActivityTypeDescriptor<MultipleChoiceData, MultipleChoiceLearnerResponse>
const OPEN_DELIVERY_POLICY: OPEN_DELIVERY_POLICY: ResolvedDeliveryPolicy
const READ_ALOUD_MAX_DIMENSION_WEIGHT: READ_ALOUD_MAX_DIMENSION_WEIGHT = 1000
const READ_ALOUD_MAX_REFERENCE_LENGTH: READ_ALOUD_MAX_REFERENCE_LENGTH = 2000
const READ_ALOUD_MAX_SECONDS: READ_ALOUD_MAX_SECONDS = 300
const READ_ALOUD_MAX_TAKES: READ_ALOUD_MAX_TAKES = 20
const readAloudJsonSchema: readAloudJsonSchema: Record<string, unknown>
const readAloudType: readAloudType: ActivityTypeDescriptor<ReadAloudData, ReadAloudLearnerResponse>
const SCRIPT_MAX_TURNS: SCRIPT_MAX_TURNS = 500
const SPEECH_ASSESSMENT_MAX_WORDS: SPEECH_ASSESSMENT_MAX_WORDS = 1000
const stimulusJsonSchema: stimulusJsonSchema: Record<string, unknown>
const TIMELINE_MAX_CHAPTERS: TIMELINE_MAX_CHAPTERS = 100
const TIMELINE_MAX_ITEMS: TIMELINE_MAX_ITEMS = 200
const TIMELINE_MAX_QUIZZES: TIMELINE_MAX_QUIZZES = 100
const TIMELINE_MAX_TITLE_LENGTH: TIMELINE_MAX_TITLE_LENGTH = 120
const VERSION_FINDING_SEVERITY: VERSION_FINDING_SEVERITY: { readonly versions_entry_count: "invalid"; readonly versions_length_out_of_band: "warning"; readonly versions_near_copy: "warning"; readonly versions_objectives_mismatch: "warning"; readonly versions_same_key: "warning"; readonly versions_section_mismatch: "invalid"; readonly versions_shared_media: "warning"; readonly versions_structure_mismatch: "invalid"; readonly versions_type_mismatch: "invalid"; }
const writtenResponseJsonSchema: writtenResponseJsonSchema: Record<string, unknown>
const writtenResponseType: writtenResponseType: ActivityTypeDescriptor<WrittenResponseData, WrittenResponseLearnerResponse>
const XAPI_VERB_DISPLAY: XAPI_VERB_DISPLAY: Record<XAPIVerbKey, Record<string, string>>
const xAPIBuilder: xAPIBuilder: { buildStatement(params: XAPIStatementParams): XAPIStatement; buildAnsweredStatement(params: AnsweredStatementParams): XAPIStatement; buildSubmittedStatement(params: SubmittedStatementParams): XAPIStatement; buildCompletedStatement(params: CompletedStatementParams): XAPIStatement; }
const XAPIVerb: XAPIVerb: { readonly ANSWERED: "http://adlnet.gov/expapi/verbs/answered"; readonly ATTEMPTED: "http://adlnet.gov/expapi/verbs/attempted"; readonly COMPLETED: "http://adlnet.gov/expapi/verbs/completed"; readonly EXPERIENCED: "http://adlnet.gov/expapi/verbs/experienced"; readonly FAILED: "http://adlnet.gov/expapi/verbs/failed"; readonly INTERACTED: "http://adlnet.gov/expapi/verbs/interacted"; readonly PASSED: "http://adlnet.gov/expapi/verbs/passed"; readonly SCORED: "http://adlnet.gov/expapi/verbs/scored"; readonly SUBMITTED: "http://activitystrea.ms/schema/1.0/submit"; readonly WATCHED: "https://w3id.org/xapi/video/verbs/watched"; }
function aiAllowedByContent: declare function aiAllowedByContent(data: AiActivityInput, feature: AiFeature): boolean;
function aiCoachingRequest: declare function aiCoachingRequest(input: { assessment?: SpeechAssessment | null; data: AiActivityInput; grade?: GradeRecord | null; learnerLocale?: string; }): AiCoachingRequest | null;
function aiCritiqueRequest: declare function aiCritiqueRequest(input: { authorLocale?: string; draft: unknown; level?: string; type: ActivityType; }): AiCritiqueRequest | null;
function aiDraftsRepairRequest: declare function aiDraftsRepairRequest(request: AiDraftsRequest, drafts: AiDrafts | readonly AiGeneratedDraft[]): AiDraftsRequest | null;
function aiDraftsRequest: declare function aiDraftsRequest(input: { count?: number; instructions?: string; level?: string; locale?: string; settings?: AiDraftSettings; source: AiDraftSource; types: readonly AiDraftType[]; }): AiDraftsRequest | null;
function aiExplanationRequest: declare function aiExplanationRequest(input: { data: AiActivityInput; group?: AiGroupInput; learnerLocale?: string; outcome?: ItemOutcome; response: LearnerResponse | null; }): AiExplanationRequest | null;
function aiGradeOf: declare function aiGradeOf(result: { maxScore: number; passed: boolean; score: number; }): AiGrade;
function aiGradingRequest: declare function aiGradingRequest(input: { data: AiActivityInput; group?: AiGroupInput; learnerLocale?: string; response: LearnerResponse | null; }): { ok: false; path?: (number | string)[]; problem: AiGradingRequestProblem; } | { ok: true; request: AiGradingRequest; };
function aiHintRequest: declare function aiHintRequest(input: { data: AiActivityInput; group?: AiGroupInput; learnerLocale?: string; previousHints: readonly string[]; response: LearnerResponse | null; }): AiHintRequest | null;
function aiSupports: declare function aiSupports(activityType: string, feature: AiFeature): boolean;
function aiVariantsRepairRequest: declare function aiVariantsRepairRequest(request: AiVariantsRequest, variants: AiVariants | AiVariantsRun | readonly AiGeneratedVariant[]): AiVariantsRequest | null;
function aiVariantsRequest: declare function aiVariantsRequest(input: { avoid?: readonly unknown[]; balanceKeyPositions?: { seed: string; }; difficulty?: AiVariantDifficulty; difficultyFor?: Readonly<Record<string, { difficulty: AiVariantDifficulty; reason?: string; }>>; exemplars: readonly unknown[]; images?: 'describe' | 'reuse'; instructions?: string; lengthTolerance?: LengthTolerance; level: string; levelFacts?: AiVariantLevelFacts; locale?: string; settings?: AiDraftSettings; }): AiVariantsRequest;
function aiWritingFeedbackRequest: declare function aiWritingFeedbackRequest(input: { data: AiActivityInput; group?: AiGroupInput; learnerLocale?: string; previousFeedback?: readonly string[]; response: LearnerResponse | null; }): AiWritingFeedbackRequest | null;
function alignDictation: declare function alignDictation(data: DictationReference, text: string): DictationAlignment;
function alignReadAloud: declare function alignReadAloud(data: Pick<ReadAloudData, 'referenceText'>, assessment: SpeechAssessment): ReadAloudWordAlignment[];
function assertRedacted: declare function assertRedacted(data: unknown): asserts data is RedactedActivityData;
function assertRedactedItemGroup: declare function assertRedactedItemGroup(data: unknown): asserts data is RedactedItemGroup;
function buildAiFacts: declare function buildAiFacts(data: AiActivityInput, response: LearnerResponse | null, details: null | readonly ScoringDetail[]): AiItemFacts | null;
function calibrationReport: declare function calibrationReport(pairs: readonly CalibrationPair[], scope: CalibrationScope): { ok: false; reason: string; } | { ok: true; report: CalibrationReport; };
function canonicalJson: declare function canonicalJson(value: unknown, seen?: Set<object>): string;
function checkAiCoaching: declare function checkAiCoaching(raw: unknown, request: AiCoachingRequest): { coaching: AiCoaching; ok: true; } | { ok: false; refusal: AiRefusal; };
function checkAiCritique: declare function checkAiCritique(raw: unknown, request: AiCritiqueRequest): { critique: AiCritique; ok: true; } | { ok: false; refusal: AiRefusal; };
function checkAiDrafts: declare function checkAiDrafts(raw: unknown, request: AiDraftsRequest, options: { newId: () => string; }): { drafts: AiDrafts; ok: true; } | { ok: false; refusal: AiRefusal; };
function checkAiExplanation: declare function checkAiExplanation(raw: unknown, request: AiExplanationRequest): { ok: false; refusal: AiRefusal; } | { ok: true; result: AiTextResult; };
function checkAiGrading: declare function checkAiGrading(raw: unknown, request: AiGradingRequest): Refused | { judgement: AiGradingJudgement; ok: true; };
function checkAiHint: declare function checkAiHint(raw: unknown, request: AiHintRequest): { ok: false; refusal: AiRefusal; } | { ok: true; result: AiTextResult; };
function checkAiVariants: declare function checkAiVariants(raw: unknown, request: AiVariantsRequest, options: { newId: () => string; }): { ok: false; refusal: AiRefusal; } | { ok: true; variants: AiVariants; };
function checkAiWritingFeedback: declare function checkAiWritingFeedback(raw: unknown, request: AiWritingFeedbackRequest): { feedback: AiWritingFeedback; ok: true; } | { ok: false; refusal: AiRefusal; };
function classifyBand: declare function classifyBand(value: number, bands: readonly Band[]): Band | null;
function combineDeliveryPolicies: declare function combineDeliveryPolicies(...policies: unknown[]): ResolvedDeliveryPolicy;
function composeAssessmentScore: declare function composeAssessmentScore(sections: readonly AssessmentSectionInput[], policy: CompositionPolicy): AssessmentScore;
function composeTimelineScore: declare function composeTimelineScore(entryKey: string, items: readonly ScoredItem[], policy: CompositionPolicy): AssessmentScore;
function computePassThreshold: declare function computePassThreshold(activityData: ActivityData, score: number, rounding?: RoundingPolicy): boolean;
function contentHash: declare function contentHash(value: unknown): string;
function contentJsonSchema: declare function contentJsonSchema(options?: { target?: JsonSchemaTarget; }): Record<string, unknown>;
function countWords: declare function countWords(text: string): number;
function createDraft: declare function createDraft<T extends ActivityType>(type: T, context: DraftContext): ActivityDataMap[T];
function createInteractiveVideoDraft: declare function createInteractiveVideoDraft(context: DraftContext): ItemGroup;
function createItemGroupDraft: declare function createItemGroupDraft(context: DraftContext): ItemGroup;
function critiqueDraft: declare function critiqueDraft(type: ActivityType, draft: unknown): ItemFinding[];
function critiqueDrafts: declare function critiqueDrafts(entries: readonly unknown[]): ItemFinding[];
function critiqueItemGroupDraft: declare function critiqueItemGroupDraft(draft: unknown): ItemFinding[];
function critiqueVersions: declare function critiqueVersions(a: VersionPaper, b: VersionPaper, options?: { allowSharedImages?: boolean; lengthTolerance?: LengthTolerance; pairs?: readonly { a: readonly string[]; b: readonly string[]; }[]; }): VersionComparison;
function defineActivityType: declare function defineActivityType<TData extends { type: string; }, TResponse>(descriptor: ActivityTypeDescriptor<TData, TResponse>): ActivityTypeDescriptor<TData, TResponse>;
function dictationReferenceWords: declare function dictationReferenceWords(data: DictationReference): readonly (readonly { itemId: string; word: string; }[])[];
function diffDictationChars: declare function diffDictationChars(reference: string, attempt: string): DictationCharOp[];
function diffResponses: declare function diffResponses(before: Pick<AttemptState, 'responses'>, after: Pick<AttemptState, 'responses'>): ResponseDiffEntry[];
function entryKeyOf: declare function entryKeyOf(slotId: string): string;
function evaluate: declare function evaluate(data: ActivityData, response: LearnerResponse, options?: EvaluateOptions): ItemOutcome;
function evaluateTries: declare function evaluateTries(data: ActivityData, responses: readonly LearnerResponse[], options?: EvaluateOptions): ItemTriesOutcome;
function fingerprint: declare function fingerprint(input: string): string;
function flattenSequence: declare function flattenSequence<TItem extends { id: string; type: string; }>(entries: readonly SequenceEntry<TItem>[], options?: FlattenSequenceOptions): SequenceSlot<TItem>[];
function generateDrafts: declare function generateDrafts(input: { newId: () => string; port: (request: AiDraftsRequest) => Promise<unknown> | unknown; repairs?: number; request: AiDraftsRequest; }): Promise<AiDraftsRun>;
function generateVariants: declare function generateVariants(input: { newId: () => string; port: (request: AiVariantsRequest) => Promise<unknown> | unknown; repairs?: number; request: AiVariantsRequest; }): Promise<AiVariantsRun>;
function getActivityTypeDescriptor: declare function getActivityTypeDescriptor(type: string): RegisteredActivityTypeDescriptor | undefined;
function gradeFromJudgement: declare function gradeFromJudgement(judgement: AiGradingJudgement, data: WrittenResponseData, options?: GradeFromJudgementOptions): GradeRecord | { reason: string; unscorable: true; };
function gradeFromRubric: declare function gradeFromRubric(criteria: readonly CriterionScore[], activityData?: ActivityData, options?: GradeFromRubricOptions): GradeRecord | { reason: string; unscorable: true; };
function graderConfiguration: declare function graderConfiguration(grade: GradeRecord, scope: CalibrationScope): GraderConfiguration | null;
function gradeReadAloud: declare function gradeReadAloud(data: ReadAloudData, response: ReadAloudLearnerResponse, assessment: SpeechAssessment | null, options: GradeReadAloudOptions): GradeRecord | SpeechUnscorable;
function gte: declare function gte(value: number, threshold: number, policy: RoundingPolicy): boolean;
function hasGrade: declare function hasGrade(outcome: ItemOutcome): outcome is Extract<ItemOutcome, { status: 'graded' | 'scored'; }>;
function hashSeed: declare function hashSeed(input: string): number;
function hintRevealsAnswer: declare function hintRevealsAnswer(facts: AiItemFacts, hint: string): boolean;
function inAuditSample: declare function inAuditSample(key: string, rate: number, seed: string): boolean;
function inspectWav: declare function inspectWav(bytes: Uint8Array, policy: WavInspectionPolicy): WavInspection;
function interactiveVideoFromDrafts: declare function interactiveVideoFromDrafts(input: { drafts: AiDrafts | AiDraftsRun | readonly AiGeneratedDraft[]; durationSeconds?: number; newId: () => string; request: AiDraftsRequest; title?: string; video: ActivityMedia; }): AiVideoDraft;
function isBuiltInActivityType: declare function isBuiltInActivityType(type: unknown): type is BuiltInActivityType;
function isInteractiveVideoItemType: declare function isInteractiveVideoItemType(type: unknown): type is InteractiveVideoItemType;
function isItemGroup: declare function isItemGroup<TItem extends { type: string; }>(entry: SequenceEntry<TItem>): entry is ItemGroup<TItem>;
function jsonSchemaFor: declare function jsonSchemaFor(type: string, options?: { target?: JsonSchemaTarget; }): Record<string, unknown>;
function levenshteinDistance: declare function levenshteinDistance(a: string, b: string, max: number): number;
function listMediaRefs: declare function listMediaRefs(entry: unknown): MediaRef[];
function mapMediaRefs: declare function mapMediaRefs<T>(entry: T, fn: (ref: MediaRef) => null | string): T;
function matchText: declare function matchText(input: string, accepted: readonly string[] | string, policy?: TextMatchPolicy): TextMatchResult;
function outcomeFromGrade: declare function outcomeFromGrade(grade: GradeRecord): ItemOutcome;
function outcomeFromRoutedGrade: declare function outcomeFromRoutedGrade(grade: GradeRecord, routing: GradeRouting): ItemOutcome;
function outcomeFromUnscorable: declare function outcomeFromUnscorable(result: { code: string; reason: string; }): ItemOutcome;
function planAttempt: declare function planAttempt<TItem extends { id: string; type: string; }>(entries: readonly SequenceEntry<TItem>[], options?: PlanAttemptOptions<TItem>): AttemptPlan;
function planMediaBudgets: declare function planMediaBudgets(plan: AttemptPlan): Record<string, number>;
function readAiTextResult: declare function readAiTextResult(raw: unknown): { ok: false; refusal: AiRefusal; } | { ok: true; result: AiTextResult; };
function readMediaProgress: declare function readMediaProgress(value: unknown, duration?: number): MediaProgress | null;
function redact: declare function redact<T extends { type: string; }>(data: T, options?: RedactOptions): RedactedActivityData;
function redactItemGroup: declare function redactItemGroup<TItem extends { type: string; }>(group: ItemGroup<TItem>, options?: RedactOptions): RedactedItemGroup;
function registerActivityType: declare function registerActivityType<TData extends { type: string; }, TResponse>(descriptor: ActivityTypeDescriptor<TData, TResponse>): void;
function registeredActivityTypes: declare function registeredActivityTypes(): string[];
function resolveDeliveryPolicy: declare function resolveDeliveryPolicy(policy: unknown): ResolvedDeliveryPolicy;
function resolveItemScoringPolicy: declare function resolveItemScoringPolicy(policy: unknown): ResolvedItemScoringPolicy;
function resolvePlaybackPolicy: declare function resolvePlaybackPolicy(media: ActivityMedia): ResolvedPlaybackPolicy;
function restoreAttemptState: declare function restoreAttemptState(plan: AttemptPlan, state: AttemptState): AttemptState;
function restoreMediaPlayLedger: declare function restoreMediaPlayLedger(plan: AttemptPlan, stored: MediaPlayLedger): MediaPlayLedger;
function roundGrade: declare function roundGrade(value: number, policy: RoundingPolicy): number;
function routeGrade: declare function routeGrade(grade: GradeRecord, context: GradeRoutingContext): GradeRouting;
function score: declare function score(activityType: ActivityType, activityData: ActivityData, learnerResponse: LearnerResponse, options?: ScoringOptions): ScoringResult;
function scoredItemsFromPlan: declare function scoredItemsFromPlan(plan: AttemptPlan, outcomes: Readonly<Record<string, ItemOutcome>>, options?: { missing?: MissingOutcomePolicy; }): ScoredItem[];
function scoreTries: declare function scoreTries(tries: readonly ItemTry[], policy?: ItemScoringPolicy | ResolvedItemScoringPolicy | null): ItemTriesScore;
function seededShuffle: declare function seededShuffle<T>(items: readonly T[], seed: string, options: SeededShuffleOptions & { version: ShuffleVersion; }): T[]; declare function seededShuffle<T>(items: readonly T[], seed: string, options?: SeededShuffleOptions): T[];
function serializeAttemptState: declare function serializeAttemptState(plan: AttemptPlan, progress: AttemptProgress): AttemptState;
function serializeMediaPlayLedger: declare function serializeMediaPlayLedger(plan: AttemptPlan, entries: Readonly<Record<string, MediaPlayLedgerEntry>>, options?: { savedAt?: string; }): MediaPlayLedger;
function slotMediaKey: declare function slotMediaKey(slotId: string): string;
function stimulusMediaKey: declare function stimulusMediaKey(slotId: string): string;
function transcriptOf: declare function transcriptOf(holder: unknown): null | string;
function validateActivity: declare function validateActivity<T extends ActivityType>(type: T, data: unknown): ValidationResult<ActivityDataMap[T]>;
function validateDeliveryPolicy: declare function validateDeliveryPolicy(policy: unknown): { data: DeliveryPolicy; success: true; } | { issues: DeliveryPolicyIssue[]; success: false; };
function validateDraft: declare function validateDraft<T extends ActivityType>(type: T, draft: unknown): DraftValidationResult<ActivityDataMap[T]>;
function validateItemGroup: declare function validateItemGroup(data: unknown): ValidationResult<ItemGroup>;
function validateItemGroupDraft: declare function validateItemGroupDraft(draft: unknown): DraftValidationResult<ItemGroup>;
function validateItemScoringPolicy: declare function validateItemScoringPolicy(policy: unknown): { data: ItemScoringPolicy; success: true; } | { issues: ItemScoringPolicyIssue[]; success: false; };
function validateMedia: declare function validateMedia(value: unknown): ValidationResult<ActivityMedia>;
function validateOptionMedia: declare function validateOptionMedia(value: unknown): ValidationResult<MultipleChoiceOptionMedia>;
function validateSpeechAssessment: declare function validateSpeechAssessment(value: unknown): ValidationResult<SpeechAssessment>;
function validateXAPIStatement: declare function validateXAPIStatement(statement: XAPIStatement): void;
function verifyAttemptPlan: declare function verifyAttemptPlan(plan: AttemptPlan, current: AttemptPlan): AttemptPlanDrift;
function withoutAuthorOnly: declare function withoutAuthorOnly<T>(entry: T): T;
function xapiDefinitionFor: declare function xapiDefinitionFor(data: { type: string; }): Partial<XAPIObjectParams>;
interface ActivityAiPermissions: interface ActivityAiPermissions { explanations?: boolean; hints?: boolean; }
interface ActivityDataMap: interface ActivityDataMap { 'multiple-choice': MultipleChoiceData; 'fill-in-the-blanks': FillInTheBlanksData; 'written-response': WrittenResponseData; 'gap-select': GapSelectData; dictation: DictationData; 'read-aloud': ReadAloudData; }
interface ActivityFeedback: interface ActivityFeedback { correct?: string; incorrect?: string; }
interface ActivityMedia: interface ActivityMedia { type: 'audio' | 'embed' | 'image' | 'video'; url: string; alt?: string; captionsUrl?: string; tracks?: MediaTrack[]; poster?: string; playback?: MediaPlaybackPolicy; transcript?: string; script?: ScriptTurn[]; }
interface ActivityResult: interface ActivityResult { score: number; maxScore: number; passed: boolean; timeSpent: number; xapiStatement: XAPIStatement; }
interface ActivityTypeAuthoring: interface ActivityTypeAuthoring<TData> { readonly createDraft?: (context: DraftContext) => TData; readonly checkDraft?: (draft: Readonly<Record<string, unknown>>) => DraftIssue[]; readonly critique?: (draft: Readonly<Record<string, unknown>>) => ItemFinding[]; }
interface ActivityTypeDescriptor: interface ActivityTypeDescriptor<TData extends { type: string; }, TResponse> { readonly type: TData['type']; readonly schema: StandardSchemaV1<unknown, TData>; readonly jsonSchema?: Readonly<Record<string, unknown>>; readonly scoring: ActivityTypeScoring<TData, TResponse>; readonly isAnswered?: (response: TResponse | undefined) => boolean; readonly fieldPolicy?: FieldPolicy; readonly redactedSchema?: StandardSchemaV1; readonly interop?: ActivityTypeInterop<TData>; readonly interactions?: readonly string[]; readonly authoring?: ActivityTypeAuthoring<TData>; readonly mediaSlots?: (data: TData) => readonly MediaSlot[]; }
interface ActivityTypeInterop: interface ActivityTypeInterop<TData> { readonly xapiActivityTypeIri?: string; readonly xapiInteractionType?: XAPIInteractionType; readonly correctResponsesPattern?: (data: TData) => string[]; }
interface AiActivityInput: interface AiActivityInput { readonly type: string; readonly id: string; readonly title: string; readonly locale?: unknown; readonly redacted?: unknown; readonly ai?: unknown; }
interface AiBlankFact: interface AiBlankFact { id: string; position: number; typed: string; accepted: null | string[]; correct: boolean | null; hint?: string; feedback?: string; }
interface AiCoaching: interface AiCoaching { text: string; words: (AiCoachingWord & { word: string; })[]; provenance?: AiProvenance; usage?: GraderUsage; }
interface AiCoachingRequest: interface AiCoachingRequest { feature: 'pronunciation-coaching'; facts: AiReadingFacts; grade?: { maxScore: number; passed: boolean; score: number; }; learnerLocale?: string; }
interface AiCoachingResult: interface AiCoachingResult { text: string; words?: AiCoachingWord[]; provenance?: AiProvenance; usage?: GraderUsage; }
interface AiCoachingWord: interface AiCoachingWord { itemId: string; tip: string; sound?: { expected: string; heard?: string; }; }
interface AiCritique: interface AiCritique { findings: AiCritiqueFinding[]; provenance?: AiProvenance; usage?: GraderUsage; }
interface AiCritiqueField: interface AiCritiqueField { path: string[]; text: string; }
interface AiCritiqueFinding: interface AiCritiqueFinding extends ItemFinding { severity: 'advice'; quote?: string; }
interface AiCritiqueFindingResult: interface AiCritiqueFindingResult { path: (number | string)[]; kind: AiCritiqueKind; message: string; quote?: string; }
interface AiCritiqueRequest: interface AiCritiqueRequest { feature: 'item-critique'; facts: { activityType: string; fields: AiCritiqueField[]; findings: { code: string; message: string; path: string[]; }[]; item: Readonly<Record<string, unknown>>; level?: string; }; authorLocale?: string; }
interface AiCritiqueResult: interface AiCritiqueResult { findings: AiCritiqueFindingResult[]; provenance?: AiProvenance; usage?: GraderUsage; }
interface AiDictationFacts: interface AiDictationFacts extends AiFactsBase { activityType: 'dictation'; transcript: null | string; typed: string; words: AiWordFact[] | null; }
interface AiDraftCaption: interface AiDraftCaption { index: number; start: number; end: number; text: string; }
interface AiDraftProblem: interface AiDraftProblem { path: string[]; code: string; message: string; severity: 'incomplete' | 'invalid' | 'warning'; }
interface AiDrafts: interface AiDrafts { drafts: AiGeneratedDraft[]; findings: ItemFinding[]; provenance?: AiProvenance; usage?: GraderUsage; }
interface AiDraftsRequest: interface AiDraftsRequest { feature: 'draft-generation'; facts: { activityTypes: AiDraftType[]; count?: number; instructions?: string; level?: string; locale?: string; source: { captions: AiDraftCaption[]; kind: 'captions'; } | { kind: 'passage' | 'transcript'; text: string; }; }; shape: Readonly<Record<string, unknown>>; settings?: AiDraftSettings; repair?: { draft: Readonly<Record<string, unknown>>; index: number; problems: AiDraftProblem[]; }[]; }
interface AiDraftsRun: interface AiDraftsRun { drafts: AiGeneratedDraft[]; findings: ItemFinding[]; calls: AiDraftsCall[]; }
interface AiExplanationRequest: interface AiExplanationRequest { feature: 'explanation'; facts: AiItemFacts; grade: AiGrade; material?: AiMaterialFacts; learnerLocale?: string; }
interface AiFillInTheBlanksFacts: interface AiFillInTheBlanksFacts extends AiFactsBase { activityType: 'fill-in-the-blanks'; instructions?: string; passage: string; blanks: AiBlankFact[]; }
interface AiGapFact: interface AiGapFact { id: string; position: number; choices: string[]; chosen: null | string; answer: null | string; correct: boolean | null; feedback?: string; }
interface AiGapSelectFacts: interface AiGapSelectFacts extends AiFactsBase { activityType: 'gap-select'; instructions?: string; passage: string; gaps: AiGapFact[]; }
interface AiGeneratedDraft: interface AiGeneratedDraft { index: number; type: AiDraftType; draft: Record<string, unknown>; validation: DraftValidationResult<unknown>; findings: ItemFinding[]; at?: number; clip?: { end: number; start: number; }; generated: Readonly<Record<string, unknown>>; }
interface AiGeneratedVariant: interface AiGeneratedVariant { exemplarIndex: number; type: string; entry: Record<string, unknown>; status: 'complete' | 'incomplete' | 'invalid'; validation: DraftValidationResult<unknown>; mismatches: AiVariantMismatch[]; findings: ItemFinding[]; pairs: AiVariantPair[]; generated: Readonly<Record<string, unknown>>; }
interface AiGrade: interface AiGrade { score: number; maxScore: number; passed: boolean; category: AiVerdict; }
interface AiGradedCriterion: interface AiGradedCriterion { name: string; level?: string; score: number; probabilities?: number[]; comment?: string; }
interface AiGradingCriterionFact: interface AiGradingCriterionFact { name: string; description?: string; weight: number; levels: null | { description?: string; label: string; }[]; }
interface AiGradingFacts: interface AiGradingFacts { activityType: 'written-response'; activityId: string; title: string; locale?: string; prompt: string; text: string; wordCount: number; minWords: number; maxWords: number; withinWordBounds: boolean; rubric: AiGradingCriterionFact[]; languageTarget?: string; }
interface AiGradingJudgement: interface AiGradingJudgement { criteria: AiGradedCriterion[]; feedback: null | string; corrections: InlineCorrection[]; rationale?: string; requiresHumanReview: boolean; provenance?: AiProvenance; usage?: GraderUsage; }
interface AiGradingRequest: interface AiGradingRequest { feature: 'grading'; facts: AiGradingFacts; material?: AiMaterialFacts; learnerLocale?: string; }
interface AiGroupInput: interface AiGroupInput { readonly title?: unknown; readonly stimulus?: unknown; }
interface AiHintRequest: interface AiHintRequest { feature: 'hint'; facts: AiItemFacts; hintNumber: number; previousHints: string[]; material?: AiMaterialFacts; learnerLocale?: string; }
interface AiMaterialFacts: interface AiMaterialFacts { kind: StimulusKind; title?: string; text?: string; truncated?: true; media?: { alt?: string; type: ActivityMedia['type']; }; attribution?: string; locale?: string; }
interface AiMultipleChoiceFacts: interface AiMultipleChoiceFacts extends AiFactsBase { activityType: 'multiple-choice'; instructions?: string; question: string; mode: 'multi' | 'single'; options: AiOptionFact[]; }
interface AiOptionFact: interface AiOptionFact { id: string; text: string; chosen: boolean; correct: boolean | null; feedback?: string; }
interface AiProvenance: interface AiProvenance { model?: string; promptHash?: string; generatedAt?: string; }
interface AiReadingFacts: interface AiReadingFacts { activityType: 'read-aloud'; activityId: string; title: string; locale: string; referenceText: string; instructions?: string; assessor: 'ai' | 'auto' | 'human' | 'unknown'; phonemeAlphabet?: 'ipa' | 'sapi'; scores: { accuracy?: number; completeness?: number; fluency?: number; prosody?: number; }; words: AiReadingWordFact[]; }
interface AiReadingWordFact: interface AiReadingWordFact { itemId?: string; word: string; heard: string; state: 'correct' | 'inserted' | 'mispronounced' | 'omitted'; accuracy?: number; sounds?: AiSoundFact[]; }
interface AiRubricCriterionFact: interface AiRubricCriterionFact { name: string; description?: string; weight: number; }
interface AiSoundFact: interface AiSoundFact { symbol: string; accuracy?: number; heardAs?: { score: number; symbol: string; }[]; }
interface AiTextResult: interface AiTextResult { text: string; verdict?: AiVerdict; provenance?: AiProvenance; usage?: GraderUsage; }
interface AiVariantExemplarFacts: interface AiVariantExemplarFacts { exemplar: number; type: string; content: Readonly<Record<string, unknown>>; learningObjectives?: string[]; targets: AiVariantTargets; }
interface AiVariantImage: interface AiVariantImage { ref: string; exemplarIndex: number; path: string[]; alt?: string; url: string; }
interface AiVariantLevelFacts: interface AiVariantLevelFacts { grammar?: string[]; vocabulary?: string[]; avoidTopics?: string[]; }
interface AiVariantMismatch: interface AiVariantMismatch { path: string[]; message: string; code: 'variant_structure' | 'variant_type'; severity: 'invalid'; }
interface AiVariantMissing: interface AiVariantMissing { exemplarIndex: number; code: 'variant_missing'; message: string; severity: 'invalid'; }
interface AiVariantPair: interface AiVariantPair { exemplarPath: string[]; variantPath: string[]; exemplarId: string; variantId: string; }
interface AiVariants: interface AiVariants { variants: AiGeneratedVariant[]; missing: AiVariantMissing[]; findings: ItemFinding[]; provenance?: AiProvenance; usage?: GraderUsage; }
interface AiVariantSkip: interface AiVariantSkip { exemplarIndex: number; code: AiVariantSkipCode; message: string; }
interface AiVariantsRequest: interface AiVariantsRequest { feature: 'variant-generation'; facts: { avoid?: { keys: string[]; texts: string[]; }[]; difficulty: AiVariantDifficulty; exemplars: AiVariantExemplarFacts[]; imagePolicy: 'describe' | 'reuse'; images?: AiVariantImage[]; instructions?: string; level: string; levelFacts?: AiVariantLevelFacts; locale?: string; rules: string[]; }; shape: Readonly<Record<string, unknown>>; exemplars: readonly unknown[]; avoid?: readonly unknown[]; settings?: AiDraftSettings; lengthTolerance?: { item?: number; material?: number; }; balanceKeyPositions?: { seed: string; }; skipped: AiVariantSkip[]; repair?: { exemplar: number; problems: AiDraftProblem[]; variant?: Readonly<Record<string, unknown>>; }[]; }
interface AiVariantsRun: interface AiVariantsRun { variants: AiGeneratedVariant[]; missing: AiVariantMissing[]; findings: ItemFinding[]; skipped: AiVariantSkip[]; calls: AiDraftsCall[]; }
interface AiVariantTargets: interface AiVariantTargets { type: string; structure: Readonly<Record<string, unknown>>; lengths: Readonly<Record<string, [number, number]>>; difficulty: AiVariantDifficulty; difficultyReason?: string; levers?: string[]; itemDifficulty?: { difficulty: AiVariantDifficulty; difficultyReason?: string; item: number; levers?: string[]; }[]; exemplarFindings: { code: string; message: string; }[]; }
interface AiVideoDraft: interface AiVideoDraft { group: Record<string, unknown>; validation: DraftValidationResult<unknown>; findings: ItemFinding[]; }
interface AiWordFact: interface AiWordFact { expected: string; typed: string; status: 'correct' | 'extra' | 'incorrect' | 'missing'; }
interface AiWritingCorrection: interface AiWritingCorrection { original: string; corrected: string; explanation?: string; category?: string; range?: { end: number; start: number; }; }
interface AiWritingFacts: interface AiWritingFacts { activityType: 'written-response'; activityId: string; title: string; locale?: string; prompt: string; text: string; wordCount: number; minWords: number; maxWords: number; withinWordBounds: boolean; rubric: AiRubricCriterionFact[] | null; languageTarget?: string; }
interface AiWritingFeedback: interface AiWritingFeedback { text: string; corrections: InlineCorrection[]; criteria: CriterionScore[]; indicativeScore: null | number; provenance?: AiProvenance; usage?: GraderUsage; }
interface AiWritingFeedbackRequest: interface AiWritingFeedbackRequest { feature: 'writing-feedback'; facts: AiWritingFacts; draftNumber: number; previousFeedback: string[]; material?: AiMaterialFacts; learnerLocale?: string; }
interface AiWritingFeedbackResult: interface AiWritingFeedbackResult { text: string; corrections?: AiWritingCorrection[]; criteria?: AiCriterionJudgement[]; provenance?: AiProvenance; usage?: GraderUsage; }
interface AnsweredStatementParams: interface AnsweredStatementParams { actor: XAPIActor; object: XAPIObjectParams; scoringResult: ScoringResult; timeSpentMs: number; response?: string; context?: XAPIContext; resultExtensions?: Record<string, unknown>; }
interface AssessmentScore: interface AssessmentScore { sections: SectionScore[]; score: number; passed: boolean | null; passFailureReason: PassFailureReason; status: 'final' | 'provisional'; pendingSlotIds: string[]; rejectedSlotIds?: string[]; unscorableSlotIds: string[]; }
interface AssessmentSectionInput: interface AssessmentSectionInput { id: string; title?: string; weight: number; passThresholdOverride?: number; items: ScoredItem[]; }
interface AttemptPlan: interface AttemptPlan { planVersion: '1.0'; seed?: string; shuffleEntries?: boolean; planHash: string; delivery?: ResolvedDeliveryPolicy; scoring?: ResolvedItemScoringPolicy; slots: AttemptPlanSlot[]; totalPoints: number; }
interface AttemptPlanDrift: interface AttemptPlanDrift { matches: boolean; missingSlotIds: string[]; addedSlotIds: string[]; changedSlotIds: string[]; changedStimulusSlotIds: string[]; changedCueSlotIds: string[]; changedPointsSlotIds: string[]; reorderedSlotIds: string[]; deliveryChanged?: true; scoringChanged?: true; }
interface AttemptPlanSlot: interface AttemptPlanSlot { slotId: string; index: number; activityId: string; activityType: string; points: number; contentHash: string; group?: { cue?: { at: number; id: string; required?: boolean; }; id: string; stimulusHash: string; title?: string; }; mediaBudgets?: MediaBudgetRef[]; }
interface AttemptProgress: interface AttemptProgress { responses: Readonly<Record<string, LearnerResponse>>; submittedSlotIds?: readonly string[]; index?: number; savedAt?: string; }
interface AttemptState: interface AttemptState { stateVersion: '1.0'; planHash: string; responses: Record<string, LearnerResponse>; submittedSlotIds: string[]; index: number; savedAt?: string; }
interface Band: interface Band { name: string; min: number; }
interface BlankConfig: interface BlankConfig { id: string; acceptedAnswers: string[]; caseSensitive?: boolean; trimWhitespace?: boolean; match?: TextMatchPolicy; hint?: string; feedback?: string; }
interface CalibrationPair: interface CalibrationPair { model: GradeRecord; person: GradeRecord; secondPerson?: GradeRecord; }
interface CalibrationReport: interface CalibrationReport { configuration: GraderConfiguration; pairs: number; criteria: CriterionCalibration[]; total: TotalCalibration; reportHash: string; }
interface CalibrationScope: interface CalibrationScope { rubric?: WrittenResponseRubric; languageTarget?: string; }
interface CalibrationThresholds: interface CalibrationThresholds { minPairs?: number; minQuadraticKappa?: number; minExactAgreement?: number; minPearson?: number; maxMeanAbsoluteError?: number; maxAbsStandardizedMeanDifference?: number; maxDegradation?: number; maxCalibrationError?: number; }
interface CompletedStatementParams: interface CompletedStatementParams { actor: XAPIActor; object: XAPIObjectParams; scoringResult?: ScoringResult; timeSpentMs: number; context?: XAPIContext; resultExtensions?: Record<string, unknown>; }
interface CompositionPolicy: interface CompositionPolicy { passThreshold: number; sectionThreshold?: number; rounding: RoundingPolicy; }
interface CriterionCalibration: interface CriterionCalibration { name: string; scale: 'levels' | 'score'; levels?: number; pairs: number; exactAgreement?: null | number; adjacentAgreement?: null | number; quadraticKappa?: null | number; confusion?: number[][]; pearson: null | number; meanAbsoluteError: null | number; standardizedMeanDifference: null | number; probabilityPairs?: number; calibrationError?: null | number; brierScore?: null | number; humanPairs?: number; humanQuadraticKappa?: null | number; humanPearson?: null | number; degradation?: null | number; }
interface CriterionScore: interface CriterionScore { name: string; score?: number; maxScore?: number; band?: string; comment?: string; weight?: number; notApplicable?: boolean; levelProbabilities?: number[]; }
interface DeferredScoringPartial: interface DeferredScoringPartial { withinWordBounds?: boolean; wordCount?: number; [key: string]: unknown; }
interface DeliveryPolicy: interface DeliveryPolicy { feedback?: boolean | null; solutions?: boolean | null; hints?: boolean | null; ai?: boolean | null | { explanations?: boolean | null; hints?: boolean | null; }; }
interface DeliveryPolicyIssue: interface DeliveryPolicyIssue { path: string; message: string; }
interface DictationAlignment: interface DictationAlignment { candidateIndex: number; reference: string; attempt: string; truncated: boolean; similarity: number; words: DictationWordAlignment[]; }
interface DictationCharOp: interface DictationCharOp { op: 'equal' | 'extra' | 'missing' | 'substitute'; reference: string; attempt: string; }
interface DictationData: interface DictationData { schemaVersion: '1.0'; type: 'dictation'; id: string; title: string; transcript: string; acceptedTranscripts?: string[]; media?: ActivityMedia; slowMedia?: DictationSlowMedia; hints?: { mode: 'progressive-words'; }; tolerance?: DictationTolerance; feedback?: ActivityFeedback; passThreshold?: number; locale?: string; learningObjectives?: string[]; difficultyLevel?: 1 | 2 | 3 | 4 | 5; ai?: ActivityAiPermissions; }
interface DictationEquivalence: interface DictationEquivalence { from: string; to: string; }
interface DictationLearnerResponse: interface DictationLearnerResponse { type: 'dictation'; text: string; hintsRevealed?: number; }
interface DictationSlowMedia: interface DictationSlowMedia { type: 'audio'; url: string; alt?: string; }
interface DictationTolerance: interface DictationTolerance { equivalences?: DictationEquivalence[]; }
interface DictationWordAlignment: interface DictationWordAlignment { itemId?: string; reference: string; attempt: string; similarity: number; status: 'correct' | 'extra' | 'incorrect' | 'missing'; }
interface DraftComplete: interface DraftComplete<T> { status: 'complete'; data: T; issues: DraftIssue[]; }
interface DraftContext: interface DraftContext { newId: () => string; }
interface DraftIssue: interface DraftIssue extends ValidationError { severity: DraftSeverity; }
interface DraftNotComplete: interface DraftNotComplete { status: 'incomplete' | 'invalid'; issues: DraftIssue[]; }
interface EvaluateOptions: interface EvaluateOptions extends ScoringOptions { scoring?: ItemScoringPolicy | null; }
interface FieldPolicy: interface FieldPolicy { readonly [field: string]: FieldPolicy | Sensitivity; }
interface FillInTheBlanksData: interface FillInTheBlanksData { schemaVersion: '1.0'; type: 'fill-in-the-blanks'; id: string; title: string; instructions?: string; passage: string; passageHtml?: string; blanks: BlankConfig[]; scoringStrategy: 'all-or-nothing' | 'partial'; media?: ActivityMedia; feedback?: ActivityFeedback; passThreshold?: number; locale?: string; learningObjectives?: string[]; difficultyLevel?: 1 | 2 | 3 | 4 | 5; ai?: ActivityAiPermissions; }
interface FillInTheBlanksLearnerResponse: interface FillInTheBlanksLearnerResponse { type: 'fill-in-the-blanks'; answers: Record<string, string>; hintsRevealed?: number; }
interface FlattenSequenceOptions: interface FlattenSequenceOptions { shuffleEntries?: boolean; seed?: string; }
interface GapSelectBank: interface GapSelectBank { id: string; choices: GapSelectChoice[]; }
interface GapSelectChoice: interface GapSelectChoice { id: string; text: string; }
interface GapSelectData: interface GapSelectData { schemaVersion: '1.0'; type: 'gap-select'; id: string; title: string; instructions?: string; passage: string; passageHtml?: string; gaps: GapSelectGap[]; banks?: GapSelectBank[]; scoringStrategy: 'all-or-nothing' | 'partial'; presentation?: 'dropdown'; shuffleChoices?: boolean; media?: ActivityMedia; feedback?: ActivityFeedback; passThreshold?: number; locale?: string; learningObjectives?: string[]; difficultyLevel?: 1 | 2 | 3 | 4 | 5; ai?: ActivityAiPermissions; }
interface GapSelectGap: interface GapSelectGap { id: string; choices?: GapSelectChoice[]; bankId?: string; correctChoiceId: string; feedback?: string; }
interface GapSelectLearnerResponse: interface GapSelectLearnerResponse { type: 'gap-select'; selections: Record<string, string>; hintsRevealed?: number; }
interface GradeFromRubricOptions: interface GradeFromRubricOptions { passThreshold?: number; feedback?: null | string; rounding?: RoundingPolicy; }
interface Grader: interface Grader { kind: GraderKind; id?: string; model?: string; promptHash?: string; }
interface GraderConfiguration: interface GraderConfiguration { model: string; promptHash: string; rubricHash: string; languageTarget: null | string; }
interface GradeReadAloudOptions: interface GradeReadAloudOptions { measured: SpeechMeasurement | null; plausibility: SpeechPlausibilityPolicy; allowAiAssessor?: boolean; rounding?: RoundingPolicy; }
interface GradeRecord: interface GradeRecord { score: number; maxScore: number; passed: boolean; feedback: null | string; criteria?: CriterionScore[]; details?: ScoringDetail[]; corrections?: InlineCorrection[]; evidence?: string[]; rationale?: string; confidence?: 'high' | 'low' | 'medium'; requiresHumanReview?: boolean; grader?: Grader; usage?: GraderUsage; gradedAt?: string; routing?: GradeRouting; }
interface GradeRouting: interface GradeRouting { to: 'model' | 'person'; reasons: GradeRoutingReason[]; calibration?: { pairs: number; reportHash: string; }; }
interface GradeRoutingContext: interface GradeRoutingContext { mode: 'exam' | 'practice'; item: CalibrationScope; calibration?: CalibrationReport; policy?: GradeRoutingPolicy; sampleKey?: string; }
interface GradeRoutingPolicy: interface GradeRoutingPolicy { calibration?: CalibrationThresholds; minLevelProbability?: number; routeLowConfidence?: boolean; audit?: { rate: number; seed: string; }; }
interface GraderUsage: interface GraderUsage { promptTokens?: number; completionTokens?: number; costUsd?: number; }
interface InlineCorrection: interface InlineCorrection { original: string; corrected: string; explanation?: string; range?: { end: number; start: number; }; category?: string; }
interface InteractionEvent: interface InteractionEvent { type: InteractionKind; activityId: string; timestamp: number; payload: Record<string, unknown>; }
interface ItemFinding: interface ItemFinding extends ValidationError { severity: ItemFindingSeverity; related?: string[][]; }
interface ItemGroup: interface ItemGroup<TItem = ActivityData> { schemaVersion: '1.0'; type: 'item-group'; id: string; title?: string; slotKey?: string; stimulus: Stimulus; items: (TItem & { slotKey?: string; })[]; shuffle?: 'none' | 'within-group'; timeline?: MediaTimeline; }
interface ItemScoringPolicy: interface ItemScoringPolicy { hintPenalty?: null | number; retries?: null | number; retryPenalty?: null | number; counts?: ItemScoringCount | null; }
interface ItemScoringPolicyIssue: interface ItemScoringPolicyIssue { path: string; message: string; }
interface ItemTriesOutcome: interface ItemTriesOutcome { outcome: ItemOutcome; counted: null | number; tries: ItemTryScore[]; }
interface ItemTriesScore: interface ItemTriesScore { score: number; maxScore: number; counted: number; tries: ItemTryScore[]; }
interface ItemTry: interface ItemTry { score: number; maxScore: number; hintsRevealed?: number | undefined; }
interface ItemTryScore: interface ItemTryScore { score: number; scored: number; maxScore: number; hintsRevealed: number; penalty: number; }
interface LearnerResponseMap: interface LearnerResponseMap { 'multiple-choice': MultipleChoiceLearnerResponse; 'fill-in-the-blanks': FillInTheBlanksLearnerResponse; 'written-response': WrittenResponseLearnerResponse; 'gap-select': GapSelectLearnerResponse; dictation: DictationLearnerResponse; 'read-aloud': ReadAloudLearnerResponse; }
interface LengthTolerance: interface LengthTolerance { material?: number; item?: number; }
interface MediaBudgetRef: interface MediaBudgetRef { key: string; maxPlays: number; }
interface MediaPlaybackPolicy: interface MediaPlaybackPolicy { controls?: 'minimal' | 'native'; maxPlays?: number; seek?: 'allow' | 'none'; rate?: 'allow' | 'fixed'; nativeControlHints?: NativeControlHint[]; }
interface MediaPlayClaim: interface MediaPlayClaim { key: string; previousPlaysUsed: number; playsUsed: number; maxPlays: number; playsRemaining: number; slotId: string; index: number; activityId?: string; }
interface MediaPlayGrant: interface MediaPlayGrant { playsUsed: number; }
interface MediaPlayLedger: interface MediaPlayLedger { ledgerVersion: '1.0'; planHash: string; entries: Record<string, MediaPlayLedgerEntry>; savedAt?: string; }
interface MediaPlayLedgerEntry: interface MediaPlayLedgerEntry { plays: number; at?: number; }
interface MediaProgress: interface MediaProgress { progressVersion: '1.0'; at: number; furthest: number; }
interface MediaRef: interface MediaRef { readonly path: readonly (number | string)[]; readonly kind: MediaRefKind; readonly url: null | string; readonly holder: Readonly<Record<string, unknown>>; readonly activityId?: string; readonly stimulusId?: string; readonly srclang?: string; }
interface MediaSlot: interface MediaSlot { readonly path: readonly (number | string)[]; readonly kind?: 'audio' | 'embed' | 'image' | 'video'; }
interface MediaTimeline: interface MediaTimeline { cues: TimelineCue[]; chapters?: TimelineChapter[]; navigation?: 'free' | 'no-skip-ahead'; }
interface MediaTrack: interface MediaTrack { kind: 'captions' | 'subtitles'; src: string; srclang: string; label: string; default?: boolean; }
interface MultipleChoiceData: interface MultipleChoiceData { schemaVersion: '1.0'; type: 'multiple-choice'; id: string; title: string; instructions?: string; question: string; questionHtml?: string; mode: 'multi' | 'single'; options: MultipleChoiceOption[]; scoringStrategy: 'all-or-nothing' | 'partial'; media?: ActivityMedia; feedback?: ActivityFeedback; passThreshold?: number; shuffle?: boolean; locale?: string; learningObjectives?: string[]; difficultyLevel?: 1 | 2 | 3 | 4 | 5; ai?: ActivityAiPermissions; }
interface MultipleChoiceLearnerResponse: interface MultipleChoiceLearnerResponse { type: 'multiple-choice'; selectedOptionIds: string[]; hintsRevealed?: number; }
interface MultipleChoiceOption: interface MultipleChoiceOption { id: string; text: string; isCorrect: boolean; feedback?: string; media?: MultipleChoiceOptionMedia; }
interface MultipleChoiceOptionMedia: interface MultipleChoiceOptionMedia { type: 'audio' | 'image'; url: string; alt?: string; captionsUrl?: string; transcript?: string; script?: ScriptTurn[]; }
interface PlanAttemptOptions: interface PlanAttemptOptions<TItem> { shuffleEntries?: boolean; seed?: string; points?: (slot: SequenceSlot<TItem>) => number; delivery?: DeliveryPolicy | null; scoring?: ItemScoringPolicy | null; }
interface ReadAloudData: interface ReadAloudData { schemaVersion: '1.0'; type: 'read-aloud'; id: string; title: string; instructions?: string; referenceText: string; locale: string; media?: ActivityMedia; slowMedia?: ReadAloudSlowMedia; recording: RecordingBounds; scoring: { dimensions: ReadAloudDimensionWeight[]; }; passThreshold?: number; feedback?: ActivityFeedback; learningObjectives?: string[]; difficultyLevel?: 1 | 2 | 3 | 4 | 5; ai?: ActivityAiPermissions; }
interface ReadAloudDimensionWeight: interface ReadAloudDimensionWeight { name: ReadAloudDimension; weight: number; }
interface ReadAloudLearnerResponse: interface ReadAloudLearnerResponse { type: 'read-aloud'; recording: RecordingRef | null; takes?: number; }
interface ReadAloudSlowMedia: interface ReadAloudSlowMedia { type: 'audio'; url: string; alt?: string; }
interface ReadAloudWordAlignment: interface ReadAloudWordAlignment { itemId?: string; reference: string; heard: string; state: ReadAloudWordState; accuracy?: number; wordIndex?: number; }
interface RecordingBounds: interface RecordingBounds { maxSeconds: number; minSeconds?: number; maxTakes?: number; }
interface RecordingRef: interface RecordingRef { key: string; mimeType: string; durationMs?: number; }
interface RedactedActivityData: interface RedactedActivityData { redacted: true; schemaVersion: string; type: string; id: string; title: string; [key: string]: unknown; }
interface RedactedBlankConfig: interface RedactedBlankConfig { id: string; hint?: string | undefined; }
interface RedactedDictationData: interface RedactedDictationData extends RedactedItem { type: 'dictation'; slowMedia?: RedactedDictationSlowMedia | undefined; hints?: undefined | { mode: 'progressive-words'; }; locale?: string | undefined; }
interface RedactedDictationSlowMedia: interface RedactedDictationSlowMedia { type: 'audio'; url: string; alt?: string | undefined; }
interface RedactedFillInTheBlanksData: interface RedactedFillInTheBlanksData extends RedactedItem { type: 'fill-in-the-blanks'; instructions?: string | undefined; passage: string; passageHtml?: string | undefined; blanks: RedactedBlankConfig[]; locale?: string | undefined; }
interface RedactedGapSelectBank: interface RedactedGapSelectBank { id: string; choices: RedactedGapSelectChoice[]; }
interface RedactedGapSelectChoice: interface RedactedGapSelectChoice { id: string; text: string; }
interface RedactedGapSelectData: interface RedactedGapSelectData extends RedactedItem { type: 'gap-select'; instructions?: string | undefined; passage: string; passageHtml?: string | undefined; gaps: RedactedGapSelectGap[]; banks?: RedactedGapSelectBank[] | undefined; presentation?: 'dropdown' | undefined; shuffleChoices?: boolean | undefined; locale?: string | undefined; }
interface RedactedGapSelectGap: interface RedactedGapSelectGap { id: string; choices?: RedactedGapSelectChoice[] | undefined; bankId?: string | undefined; }
interface RedactedMultipleChoiceData: interface RedactedMultipleChoiceData extends RedactedItem { type: 'multiple-choice'; instructions?: string | undefined; question: string; questionHtml?: string | undefined; mode: 'multi' | 'single'; options: RedactedMultipleChoiceOption[]; shuffle?: boolean | undefined; locale?: string | undefined; }
interface RedactedMultipleChoiceOption: interface RedactedMultipleChoiceOption { id: string; text: string; media?: RedactedMultipleChoiceOptionMedia | undefined; }
interface RedactedMultipleChoiceOptionMedia: interface RedactedMultipleChoiceOptionMedia { type: 'audio' | 'image'; url: string; alt?: string | undefined; captionsUrl?: string | undefined; }
interface RedactedReadAloudData: interface RedactedReadAloudData extends RedactedItem { type: 'read-aloud'; instructions?: string | undefined; referenceText: string; locale: string; slowMedia?: RedactedDictationSlowMedia | undefined; recording: { maxSeconds: number; maxTakes?: number | undefined; minSeconds?: number | undefined; }; scoring: { dimensions: { name: 'accuracy' | 'completeness' | 'fluency' | 'prosody'; weight: number; }[]; }; }
interface RedactedStimulus: interface RedactedStimulus { id: string; kind: 'audio' | 'image' | 'mixed' | 'text' | 'video'; title?: string | undefined; body?: string | undefined; bodyHtml?: string | undefined; media?: Media | undefined; locale?: string | undefined; attribution?: string | undefined; }
interface RedactedWrittenResponseData: interface RedactedWrittenResponseData extends RedactedItem { type: 'written-response'; prompt: string; promptHtml?: string | undefined; minWords: number; maxWords: number; rubric?: undefined | { criteria: { description?: string | undefined; levels?: undefined | { description?: string | undefined; label: string; }[]; name: string; weight: number; }[]; label?: string | undefined; }; languageTarget?: string | undefined; locale?: string | undefined; }
interface RedactOptions: interface RedactOptions { reveal?: 'after-submit' | 'none'; policy?: FieldPolicy; }
interface RegisteredActivityTypeDescriptor: interface RegisteredActivityTypeDescriptor { readonly type: string; readonly schema: StandardSchemaV1; readonly jsonSchema?: Readonly<Record<string, unknown>>; readonly scoring: { readonly kind: 'deferred'; readonly partial?: (data: unknown, response: unknown) => DeferredScoringPartial; readonly reason: 'requires_async_grading'; } | { readonly kind: 'sync'; readonly score: (data: unknown, response: unknown) => PartialScoringResult; }; readonly isAnswered?: (response: unknown) => boolean; readonly fieldPolicy?: FieldPolicy; readonly redactedSchema?: StandardSchemaV1; readonly interop?: ActivityTypeInterop<unknown>; readonly interactions?: readonly string[]; readonly authoring?: ActivityTypeAuthoring<unknown>; readonly mediaSlots?: (data: unknown) => readonly MediaSlot[]; }
interface ResolvedDeliveryPolicy: interface ResolvedDeliveryPolicy { feedback: boolean; solutions: boolean; hints: boolean; ai: { explanations: boolean; hints: boolean; }; }
interface ResolvedItemScoringPolicy: interface ResolvedItemScoringPolicy { hintPenalty: number; retries: number; retryPenalty: number; counts: ItemScoringCount; }
interface ResolvedPlaybackPolicy: interface ResolvedPlaybackPolicy { controls: 'minimal' | 'native'; maxPlays: null | number; seek: 'allow' | 'none'; rate: 'allow' | 'fixed'; nativeControlHints: readonly NativeControlHint[]; }
interface ResponseDiffEntry: interface ResponseDiffEntry { slotId: string; change: 'added' | 'changed' | 'removed'; before?: LearnerResponse; after?: LearnerResponse; }
interface RoundingPolicy: interface RoundingPolicy { mode: RoundingMode; dp: number; }
interface ScoredItem: interface ScoredItem { slotId: string; activityId?: string; points: number; outcome: ItemOutcome; }
interface ScoringDetail: interface ScoringDetail { itemId: string; outcome: ScoringOutcome; learnerResponse: string | string[]; correctResponse: string | string[]; weight?: number; score?: number; }
interface ScoringOptions: interface ScoringOptions { rounding?: RoundingPolicy; }
interface ScoringResult: interface ScoringResult { score: number; maxScore: number; passed: boolean; feedback: null | string; details: ScoringDetail[]; }
interface ScriptTurn: interface ScriptTurn { speaker: string; text: string; }
interface SectionScore: interface SectionScore { id: string; title?: string; weight: number; normalizedWeight: number; earnedPoints: number; gradedMaxPoints: number; maxPoints: number; score: number; passed: boolean; appliedThreshold: null | number; pendingSlotIds: string[]; rejectedSlotIds?: string[]; unscorableSlotIds: string[]; }
interface SeededShuffleOptions: interface SeededShuffleOptions { version?: ShuffleVersion; }
interface SequenceSlot: interface SequenceSlot<TItem = ActivityData> { slotId: string; index: number; activity: TItem; group?: SequenceSlotGroup; }
interface SequenceSlotGroup: interface SequenceSlotGroup { id: string; title?: string; stimulus: Stimulus; position: number; size: number; timeline?: MediaTimeline; cue?: TimelineCue; }
interface SpeechAssessment: interface SpeechAssessment { assessmentVersion: '1.0'; status: 'assessed' | 'no_speech'; task: 'scripted' | 'unscripted'; locale: string; referenceText?: string; recordingKey?: string; assessor: Grader; scale: 100; scores: { accuracy?: number; completeness?: number; fluency?: number; overall?: number; prosody?: number; }; recognizedText?: string; miscue: 'assessor' | 'none'; phonemeAlphabet?: 'ipa' | 'sapi'; words: SpeechWord[]; prosody?: { monotoneConfidence?: number; }; signal?: { snrDb?: number; }; }
interface SpeechMeasurement: interface SpeechMeasurement { durationMs: number; voicedMs: number; }
interface SpeechPhoneme: interface SpeechPhoneme { symbol?: string; accuracy?: number; startMs?: number; durationMs?: number; heardAs?: SpeechPhonemeCandidate[]; }
interface SpeechPhonemeCandidate: interface SpeechPhonemeCandidate { symbol: string; score: number; }
interface SpeechPlausibilityPolicy: interface SpeechPlausibilityPolicy { maxWordsPerSecond: number; minVoicedMs: number; }
interface SpeechSyllable: interface SpeechSyllable { text: string; grapheme?: string; accuracy?: number; startMs?: number; durationMs?: number; }
interface SpeechUnscorable: interface SpeechUnscorable { unscorable: true; code: SpeechUnscorableCode; reason: string; }
interface SpeechWord: interface SpeechWord { text: string; accuracy?: number; error: SpeechWordError; vendorError?: string; startMs?: number; durationMs?: number; syllables?: SpeechSyllable[]; phonemes?: SpeechPhoneme[]; breaks?: { missing?: number; unexpected?: number; }; }
interface StandardSchemaV1: interface StandardSchemaV1<Input = unknown, Output = Input> { readonly '~standard': StandardSchemaV1.Props<Input, Output>; } declare namespace StandardSchemaV1 { interface Props<Input = unknown, Output = Input> { readonly version: 1; readonly vendor: string; readonly validate: (value: unknown, options?: StandardSchemaV1.Options | undefined) => Promise<Result<Output>> | Result<Output>; readonly types?: Types<Input, Output> | undefined; } type Result<Output> = FailureResult | SuccessResult<Output>; interface SuccessResult<Output> { readonly value: Output; readonly issues?: undefined; } interface Options { readonly libraryOptions?: Record<string, unknown> | undefined; } interface FailureResult { readonly issues: ReadonlyArray<Issue>; } interface Issue { readonly message: string; readonly path?: ReadonlyArray<PathSegment | PropertyKey> | undefined; } interface PathSegment { readonly key: PropertyKey; } interface Types<Input = unknown, Output = Input> { readonly input: Input; readonly output: Output; } type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['input']; type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['output']; }
interface Stimulus: interface Stimulus { id: string; kind: StimulusKind; title?: string; body?: string; bodyHtml?: string; media?: ActivityMedia; transcript?: string; script?: ScriptTurn[]; locale?: string; attribution?: string; }
interface SubmittedStatementParams: interface SubmittedStatementParams { actor: XAPIActor; object: XAPIObjectParams; timeSpentMs: number; response?: string; context?: XAPIContext; resultExtensions?: Record<string, unknown>; }
interface TextMatchPolicy: interface TextMatchPolicy { caseSensitive?: boolean; trim?: boolean; normalize?: 'NFC' | 'NFKC' | 'none'; foldDiacritics?: boolean; collapseInnerWhitespace?: boolean; ignorePunctuation?: boolean; levenshtein?: number; locale?: string; }
interface TextMatchResult: interface TextMatchResult { matched: boolean; via: 'exact' | 'folded' | 'fuzzy' | 'none' | 'normalized'; }
interface ThemeTokens: interface ThemeTokens { '--lk-color-primary': string; '--lk-color-primary-hover': string; '--lk-color-surface': string; '--lk-color-surface-raised': string; '--lk-color-border': string; '--lk-color-text': string; '--lk-color-text-muted': string; '--lk-color-success': string; '--lk-color-error': string; '--lk-color-warning': string; '--lk-color-focus-ring': string; '--lk-color-media-accent'?: string; '--lk-iv-caption-color'?: string; '--lk-iv-caption-secondary-color'?: string; '--lk-iv-caption-secondary-scale'?: string; '--lk-iv-caption-gap'?: string; '--lk-spacing-xs': string; '--lk-spacing-sm': string; '--lk-spacing-md': string; '--lk-spacing-lg': string; '--lk-spacing-xl': string; '--lk-font-family-base': string; '--lk-font-size-sm': string; '--lk-font-size-base': string; '--lk-font-size-lg': string; '--lk-font-weight-normal': string; '--lk-font-weight-bold': string; '--lk-line-height-base': string; '--lk-radius-sm': string; '--lk-radius-base': string; '--lk-radius-lg': string; '--lk-transition-fast': string; '--lk-transition-base': string; }
interface TimelineChapter: interface TimelineChapter { at: number; title: string; }
interface TimelineCue: interface TimelineCue { id: string; at: number; itemIds: string[]; title?: string; required?: boolean; }
interface TotalCalibration: interface TotalCalibration { pairs: number; pearson: null | number; meanAbsoluteError: null | number; standardizedMeanDifference: null | number; passAgreement: null | number; humanPairs?: number; humanPearson?: null | number; degradation?: null | number; }
interface ValidationError: interface ValidationError { path: string[]; message: string; code: string; }
interface VersionComparison: interface VersionComparison { findings: VersionFinding[]; slots: VersionSlot[]; summary: { aItems: number; bItems: number; paired: number; structureMismatches: number; }; }
interface VersionFinding: interface VersionFinding extends ValidationError { severity: 'advice' | 'invalid' | 'warning'; a?: string[]; b?: string[]; }
interface VersionPaper: interface VersionPaper { sections: readonly { entries: readonly unknown[]; key?: string; title?: string; }[]; }
interface VersionSlot: interface VersionSlot { a: null | string[]; b: null | string[]; by: 'pairs' | 'position' | 'slotKey'; }
interface WavInspectionPolicy: interface WavInspectionPolicy { silenceDbfs: number; frameMs: number; }
interface WrittenResponseData: interface WrittenResponseData { schemaVersion: '1.0'; type: 'written-response'; id: string; title: string; prompt: string; promptHtml?: string; minWords: number; maxWords: number; rubric?: WrittenResponseRubric; languageTarget?: string; media?: ActivityMedia; feedback?: ActivityFeedback; passThreshold?: number; locale?: string; learningObjectives?: string[]; difficultyLevel?: 1 | 2 | 3 | 4 | 5; ai?: ActivityAiPermissions; }
interface WrittenResponseLearnerResponse: interface WrittenResponseLearnerResponse { type: 'written-response'; text: string; wordCount: number; }
interface WrittenResponseRubric: interface WrittenResponseRubric { label?: string; criteria: WrittenResponseRubricCriterion[]; }
interface WrittenResponseRubricCriterion: interface WrittenResponseRubricCriterion { name: string; description?: string; weight: number; levels?: WrittenResponseRubricLevel[]; }
interface WrittenResponseRubricLevel: interface WrittenResponseRubricLevel { label: string; description?: string; }
interface XAPIActor: interface XAPIActor { objectType: 'Agent'; name?: string; mbox?: string; account?: { homePage: string; name: string; }; }
interface XAPIConfig: interface XAPIConfig { endpoint: string; auth: { password: string; type: 'basic'; username: string; } | { token: string; type: 'bearer'; }; activityId: ((sdkObjectId: string) => string) | string; actor: XAPIActor; onError?: (err: XAPIError) => void; }
interface XAPIContext: interface XAPIContext { platform?: string; language?: string; contextActivities?: XAPIContextActivities; extensions?: Record<string, unknown>; }
interface XAPIContextActivities: interface XAPIContextActivities { parent?: XAPIObject[]; grouping?: XAPIObject[]; category?: XAPIObject[]; other?: XAPIObject[]; }
interface XAPIError: interface XAPIError { statement: XAPIStatement; attempt: number; statusCode?: number; message: string; }
interface XAPIObject: interface XAPIObject { objectType: 'Activity'; id: string; definition?: { choices?: Array<{ description?: Record<string, string>; id: string; }>; correctResponsesPattern?: string[]; description?: Record<string, string>; extensions?: Record<string, unknown>; interactionType?: string; name?: Record<string, string>; type?: string; }; }
interface XAPIObjectParams: interface XAPIObjectParams { id: string; name?: Record<string, string>; description?: Record<string, string>; type?: string; interactionType?: string; correctResponsesPattern?: string[]; choices?: Array<{ description?: Record<string, string>; id: string; }>; }
interface XAPIResult: interface XAPIResult { score?: XAPIScore; success?: boolean; completion?: boolean; duration?: string; response?: string; extensions?: Record<string, unknown>; }
interface XAPIScore: interface XAPIScore { scaled: number; raw?: number; min?: number; max?: number; }
interface XAPIStatement: interface XAPIStatement { id: string; actor: XAPIActor; verb: XAPIVerbObject; object: XAPIObject; result?: XAPIResult; context?: XAPIContext; timestamp: string; version: '1.0.3'; }
interface XAPIStatementParams: interface XAPIStatementParams { actor: XAPIActor; verb: XAPIVerbKey; object: XAPIObjectParams; result?: XAPIResult; context?: XAPIContext; }
interface XAPIVerbObject: interface XAPIVerbObject { id: string; display: Record<string, string>; }
type ActivityData: type ActivityData = ActivityDataMap[ActivityType];
type ActivityType: type ActivityType = keyof ActivityDataMap;
type ActivityTypeScoring: type ActivityTypeScoring<TData, TResponse> = { readonly kind: 'deferred'; readonly partial?: (data: TData, response: TResponse | undefined) => DeferredScoringPartial; readonly reason: 'requires_async_grading'; } | { readonly kind: 'sync'; readonly score: (data: TData, response: TResponse) => PartialScoringResult; };
type AiCriterionJudgement: type AiCriterionJudgement = Omit<CriterionScore, 'weight'> & { weight?: number; };
type AiCritiqueKind: type AiCritiqueKind = 'ambiguous' | 'cue' | 'implausible-distractor' | 'language' | 'level' | 'other' | 'second-answer' | 'sensitivity' | 'wrong-key';
type AiDraftsCall: type AiDraftsCall = { error?: string; ok: false; refusal?: AiRefusal; } | { ok: true; provenance?: AiProvenance; usage?: GraderUsage; };
type AiDraftSettings: type AiDraftSettings = Partial<Record<AiDraftType, Readonly<Record<string, unknown>>>>;
type AiDraftSource: type AiDraftSource = { cues: { end: number; start: number; text: string; }[]; kind: 'captions'; } | { kind: 'passage' | 'transcript'; text: string; };
type AiDraftType: type AiDraftType = 'dictation' | 'fill-in-the-blanks' | 'gap-select' | 'multiple-choice' | 'read-aloud' | 'written-response';
type AiFeature: type AiFeature = 'explanation' | 'hint' | 'pronunciation-coaching' | 'writing-feedback';
type AiGradingRequestProblem: type AiGradingRequestProblem = 'duplicate-criteria' | 'empty-response' | 'no-rubric' | 'not-written-response' | 'redacted' | 'unreadable-levels';
type AiItemFacts: type AiItemFacts = AiDictationFacts | AiFillInTheBlanksFacts | AiGapSelectFacts | AiMultipleChoiceFacts;
type AiRefusal: type AiRefusal = 'contradicts-grade' | 'contradicts-item' | 'contradicts-marks' | 'empty' | 'malformed' | 'misquotes-answer' | 'misses-criteria' | 'out-of-scale' | 'reveals-answer' | 'too-long';
type AiSupportedActivityType: type AiSupportedActivityType = 'dictation' | 'fill-in-the-blanks' | 'gap-select' | 'multiple-choice';
type AiVariantDifficulty: type AiVariantDifficulty = 'easier' | 'harder' | 'same';
type AiVariantSkipCode: type AiVariantSkipCode = 'variant_exemplar_incomplete' | 'variant_exemplar_timeline' | 'variant_exemplar_too_long' | 'variant_exemplar_unheard' | 'variant_exemplar_unseen' | 'variant_exemplar_unsupported';
type AiVerdict: type AiVerdict = 'correct' | 'incorrect' | 'partly-correct';
type BuiltInActivityType: type BuiltInActivityType = (typeof BUILT_IN_ACTIVITY_TYPES)[number];
type DeferredReason: type DeferredReason = 'awaiting_human_review' | 'grade_rejected' | 'no_response_recorded' | 'requires_async_grading';
type DictationReference: type DictationReference = Partial<Pick<DictationData, 'acceptedTranscripts' | 'tolerance' | 'transcript'>>;
type DraftSeverity: type DraftSeverity = 'incomplete' | 'invalid';
type DraftValidationResult: type DraftValidationResult<T> = DraftComplete<T> | DraftNotComplete;
type GradeFromJudgementOptions: type GradeFromJudgementOptions = Omit<GradeFromRubricOptions, 'feedback'>;
type GraderKind: type GraderKind = 'ai' | 'auto' | 'human';
type GradeRoutingReason: type GradeRoutingReason = 'audit-sample' | 'calibration-below-policy' | 'low-confidence' | 'model-asked' | 'no-calibration' | 'unsure';
type GradingState: type GradingState = 'failed' | 'graded' | 'queued' | 'running' | 'skipped';
type InteractionKind: type InteractionKind = 'ai-coaching-shown' | 'ai-explanation-shown' | 'ai-help-refused' | 'ai-hint-shown' | 'ai-writing-feedback-shown' | 'assessment-failed' | 'assessment-requested' | 'blank-filled' | 'hint-requested' | 'media-play-consumed' | 'media-play-errored' | 'media-play-refunded' | 'media-play-refused' | 'option-deselected' | 'option-selected' | 'recording-discarded' | 'recording-started' | 'recording-stopped' | 'recording-upload-failed' | 'recording-uploaded' | 'submitted' | 'text-changed' | 'video-captions-changed' | 'video-ended' | 'video-fullscreen-changed' | 'video-paused' | 'video-pip-changed' | 'video-played' | 'video-quiz-closed' | 'video-quiz-opened' | 'video-quiz-question-shown' | 'video-quiz-skipped' | 'video-rate-changed' | 'video-seeked' | (string & {});
type InteractiveVideoItemType: type InteractiveVideoItemType = (typeof INTERACTIVE_VIDEO_ITEM_TYPES)[number];
type ItemFindingSeverity: type ItemFindingSeverity = 'advice' | 'warning';
type ItemOutcome: type ItemOutcome = { code?: string; maxScore: number; reason: string; status: 'unscorable'; } | { details: ScoringDetail[]; feedback: null | string; maxScore: number; passed: boolean; score: number; status: 'scored'; } | { feedback: null | string; grade: GradeRecord; maxScore: number; passed: boolean; score: number; status: 'graded'; } | { maxScore: number; partial?: DeferredScoringPartial; pendingGrade?: GradeRecord; reason: DeferredReason; rejectedGrade?: GradeRecord; status: 'deferred'; };
type ItemScoringCount: type ItemScoringCount = 'best' | 'first' | 'last';
type JsonSchemaTarget: type JsonSchemaTarget = 'draft-2020-12' | 'draft-7';
type LearnerResponse: type LearnerResponse = LearnerResponseMap[keyof LearnerResponseMap];
type MediaRefKind: type MediaRefKind = 'audio' | 'captions' | 'embed' | 'image' | 'poster' | 'track' | 'video';
type MissingOutcomePolicy: type MissingOutcomePolicy = 'deferred' | 'zero' | ((slot: AttemptPlanSlot) => ItemOutcome);
type NativeControlHint: type NativeControlHint = 'hide-download' | 'hide-rate';
type PartialScoringResult: type PartialScoringResult = Omit<ScoringResult, 'passed'>;
type PassFailureReason: type PassFailureReason = 'both' | 'overall_below_threshold' | 'section_below_threshold' | null;
type PlannableEntry: type PlannableEntry = SequenceEntry<ActivityData>;
type ReadAloudDimension: type ReadAloudDimension = 'accuracy' | 'completeness' | 'fluency' | 'prosody';
type ReadAloudWordState: type ReadAloudWordState = 'correct' | 'inserted' | 'mispronounced' | 'omitted';
type RedactedActivity: type RedactedActivity = RedactedDictationData | RedactedFillInTheBlanksData | RedactedGapSelectData | RedactedMultipleChoiceData | RedactedReadAloudData | RedactedWrittenResponseData;
type RedactedItemGroup: type RedactedItemGroup = ItemGroup<RedactedActivityData> & { redacted: true; };
type RoundingMode: type RoundingMode = 'ceil' | 'floor' | 'half-even' | 'half-up';
type ScoringOutcome: type ScoringOutcome = 'correct' | 'correct-omission' | 'incorrect' | 'incorrect-omission';
type Sensitivity: type Sensitivity = 'answer-key' | 'author-only' | 'public';
type SequenceEntry: type SequenceEntry<TItem = ActivityData> = (TItem & { slotKey?: string; }) | ItemGroup<TItem>;
type ShuffleVersion: type ShuffleVersion = 1 | 2;
type SpeechUnscorableCode: type SpeechUnscorableCode = 'assessor_not_accepted' | 'implausible_speech_rate' | 'insufficient_voiced_time' | 'invalid_assessment' | 'locale_mismatch' | 'missing_dimension' | 'no_speech' | 'recording_mismatch' | 'reference_mismatch' | 'task_mismatch';
type SpeechWordError: type SpeechWordError = 'insertion' | 'mispronunciation' | 'none' | 'omission';
type StimulusKind: type StimulusKind = 'audio' | 'image' | 'mixed' | 'text' | 'video';
type ValidationResult: type ValidationResult<T> = { data: T; success: true; } | { errors: ValidationError[]; success: false; };
type WavInspection: type WavInspection = { bitsPerSample: 16; channels: number; durationMs: number; peakDbfs: number; sampleRate: number; valid: true; voicedMs: number; } | { reason: 'not_wav' | 'truncated' | 'unsupported_encoding'; valid: false; };
type XAPIInteractionType: type XAPIInteractionType = 'choice' | 'fill-in' | 'long-fill-in' | 'matching' | 'other' | 'performance' | 'sequencing' | 'true-false';
type XAPIVerbKey: type XAPIVerbKey = keyof typeof XAPIVerb;
```

## @intellectif/lk-core/ai-check

```ts
function aiCheckCases: declare function aiCheckCases(): AiCheckCase[];
function formatAiCheckReport: declare function formatAiCheckReport(report: AiCheckReport): string;
function runAiCheck: declare function runAiCheck(ports: AiCheckPorts, options?: AiCheckOptions): Promise<AiCheckReport>;
interface AiCheckCase: interface AiCheckCase { id: string; feature: 'draft-generation' | 'explanation' | 'grading' | 'hint' | 'item-critique' | 'pronunciation-coaching' | 'variant-generation' | 'writing-feedback'; about: string; request: AiCoachingRequest | AiCritiqueRequest | AiDraftsRequest | AiExplanationRequest | AiGradingRequest | AiHintRequest | AiVariantsRequest | AiWritingFeedbackRequest; }
interface AiCheckOptions: interface AiCheckOptions { cases?: readonly AiCheckCase[]; concurrency?: number; }
interface AiCheckPorts: interface AiCheckPorts { explain?(request: AiExplanationRequest): Promise<unknown> | unknown; hint?(request: AiHintRequest): Promise<unknown> | unknown; writingFeedback?(request: AiWritingFeedbackRequest): Promise<unknown> | unknown; pronunciationCoaching?(request: AiCoachingRequest): Promise<unknown> | unknown; critique?(request: AiCritiqueRequest): Promise<unknown> | unknown; drafts?(request: AiDraftsRequest): Promise<unknown> | unknown; variants?(request: AiVariantsRequest): Promise<unknown> | unknown; grading?(request: AiGradingRequest): Promise<unknown> | unknown; }
interface AiCheckReport: interface AiCheckReport { total: number; shown: number; refused: number; errors: number; skipped: number; byRefusal: Record<AiRefusal, number>; results: AiCheckResult[]; }
interface AiCheckResult: interface AiCheckResult { case: AiCheckCase; ok: boolean; refusal?: AiRefusal; error?: string; result?: AiTextResult; feedback?: AiWritingFeedback; coaching?: AiCoaching; critique?: AiCritique; drafts?: AiDrafts; variants?: AiVariants; grading?: AiGradingJudgement; ms: number; }
```

## @intellectif/lk-core/schemas

```ts
const dictationJsonSchema: dictationJsonSchema: Record<string, unknown>
const fillInTheBlanksJsonSchema: fillInTheBlanksJsonSchema: Record<string, unknown>
const gapSelectJsonSchema: gapSelectJsonSchema: Record<string, unknown>
const itemGroupJsonSchema: itemGroupJsonSchema: Record<string, unknown>
const multipleChoiceJsonSchema: multipleChoiceJsonSchema: Record<string, unknown>
const readAloudJsonSchema: readAloudJsonSchema: Record<string, unknown>
const SCRIPT_MAX_TURNS: SCRIPT_MAX_TURNS = 500
const stimulusJsonSchema: stimulusJsonSchema: Record<string, unknown>
const writtenResponseJsonSchema: writtenResponseJsonSchema: Record<string, unknown>
function contentJsonSchema: declare function contentJsonSchema(options?: { target?: JsonSchemaTarget; }): Record<string, unknown>;
function jsonSchemaFor: declare function jsonSchemaFor(type: string, options?: { target?: JsonSchemaTarget; }): Record<string, unknown>;
function validateActivity: declare function validateActivity<T extends ActivityType>(type: T, data: unknown): ValidationResult<ActivityDataMap[T]>;
function validateItemGroup: declare function validateItemGroup(data: unknown): ValidationResult<ItemGroup>;
function validateMedia: declare function validateMedia(value: unknown): ValidationResult<ActivityMedia>;
function validateOptionMedia: declare function validateOptionMedia(value: unknown): ValidationResult<MultipleChoiceOptionMedia>;
interface RedactedBlankConfig: interface RedactedBlankConfig { id: string; hint?: string | undefined; }
interface RedactedDictationData: interface RedactedDictationData extends RedactedItem { type: 'dictation'; slowMedia?: RedactedDictationSlowMedia | undefined; hints?: undefined | { mode: 'progressive-words'; }; locale?: string | undefined; }
interface RedactedDictationSlowMedia: interface RedactedDictationSlowMedia { type: 'audio'; url: string; alt?: string | undefined; }
interface RedactedFillInTheBlanksData: interface RedactedFillInTheBlanksData extends RedactedItem { type: 'fill-in-the-blanks'; instructions?: string | undefined; passage: string; passageHtml?: string | undefined; blanks: RedactedBlankConfig[]; locale?: string | undefined; }
interface RedactedGapSelectBank: interface RedactedGapSelectBank { id: string; choices: RedactedGapSelectChoice[]; }
interface RedactedGapSelectChoice: interface RedactedGapSelectChoice { id: string; text: string; }
interface RedactedGapSelectData: interface RedactedGapSelectData extends RedactedItem { type: 'gap-select'; instructions?: string | undefined; passage: string; passageHtml?: string | undefined; gaps: RedactedGapSelectGap[]; banks?: RedactedGapSelectBank[] | undefined; presentation?: 'dropdown' | undefined; shuffleChoices?: boolean | undefined; locale?: string | undefined; }
interface RedactedGapSelectGap: interface RedactedGapSelectGap { id: string; choices?: RedactedGapSelectChoice[] | undefined; bankId?: string | undefined; }
interface RedactedMultipleChoiceData: interface RedactedMultipleChoiceData extends RedactedItem { type: 'multiple-choice'; instructions?: string | undefined; question: string; questionHtml?: string | undefined; mode: 'multi' | 'single'; options: RedactedMultipleChoiceOption[]; shuffle?: boolean | undefined; locale?: string | undefined; }
interface RedactedMultipleChoiceOption: interface RedactedMultipleChoiceOption { id: string; text: string; media?: RedactedMultipleChoiceOptionMedia | undefined; }
interface RedactedMultipleChoiceOptionMedia: interface RedactedMultipleChoiceOptionMedia { type: 'audio' | 'image'; url: string; alt?: string | undefined; captionsUrl?: string | undefined; }
interface RedactedReadAloudData: interface RedactedReadAloudData extends RedactedItem { type: 'read-aloud'; instructions?: string | undefined; referenceText: string; locale: string; slowMedia?: RedactedDictationSlowMedia | undefined; recording: { maxSeconds: number; maxTakes?: number | undefined; minSeconds?: number | undefined; }; scoring: { dimensions: { name: 'accuracy' | 'completeness' | 'fluency' | 'prosody'; weight: number; }[]; }; }
interface RedactedStimulus: interface RedactedStimulus { id: string; kind: 'audio' | 'image' | 'mixed' | 'text' | 'video'; title?: string | undefined; body?: string | undefined; bodyHtml?: string | undefined; media?: Media | undefined; locale?: string | undefined; attribution?: string | undefined; }
interface RedactedWrittenResponseData: interface RedactedWrittenResponseData extends RedactedItem { type: 'written-response'; prompt: string; promptHtml?: string | undefined; minWords: number; maxWords: number; rubric?: undefined | { criteria: { description?: string | undefined; levels?: undefined | { description?: string | undefined; label: string; }[]; name: string; weight: number; }[]; label?: string | undefined; }; languageTarget?: string | undefined; locale?: string | undefined; }
type JsonSchemaTarget: type JsonSchemaTarget = 'draft-2020-12' | 'draft-7';
type RedactedActivity: type RedactedActivity = RedactedDictationData | RedactedFillInTheBlanksData | RedactedGapSelectData | RedactedMultipleChoiceData | RedactedReadAloudData | RedactedWrittenResponseData;
```

## @intellectif/lk-core/scoring

```ts
const DEFAULT_ITEM_SCORING_POLICY: DEFAULT_ITEM_SCORING_POLICY: ResolvedItemScoringPolicy
const DEFAULT_PASS_THRESHOLD: DEFAULT_PASS_THRESHOLD = 0.7
const DICTATION_MAX_ACCEPTED_TRANSCRIPTS: DICTATION_MAX_ACCEPTED_TRANSCRIPTS = 10
const DICTATION_MAX_EQUIVALENCE_LENGTH: DICTATION_MAX_EQUIVALENCE_LENGTH = 200
const DICTATION_MAX_EQUIVALENCES: DICTATION_MAX_EQUIVALENCES = 100
const DICTATION_MAX_TEXT_LENGTH: DICTATION_MAX_TEXT_LENGTH = 8000
const DICTATION_MAX_TRANSCRIPT_LENGTH: DICTATION_MAX_TRANSCRIPT_LENGTH = 2000
const ITEM_SCORING_MAX_RETRIES: ITEM_SCORING_MAX_RETRIES = 10
const READ_ALOUD_MAX_DIMENSION_WEIGHT: READ_ALOUD_MAX_DIMENSION_WEIGHT = 1000
const READ_ALOUD_MAX_REFERENCE_LENGTH: READ_ALOUD_MAX_REFERENCE_LENGTH = 2000
const READ_ALOUD_MAX_SECONDS: READ_ALOUD_MAX_SECONDS = 300
const READ_ALOUD_MAX_TAKES: READ_ALOUD_MAX_TAKES = 20
const SPEECH_ASSESSMENT_MAX_WORDS: SPEECH_ASSESSMENT_MAX_WORDS = 1000
function alignDictation: declare function alignDictation(data: DictationReference, text: string): DictationAlignment;
function alignReadAloud: declare function alignReadAloud(data: Pick<ReadAloudData, 'referenceText'>, assessment: SpeechAssessment): ReadAloudWordAlignment[];
function calibrationReport: declare function calibrationReport(pairs: readonly CalibrationPair[], scope: CalibrationScope): { ok: false; reason: string; } | { ok: true; report: CalibrationReport; };
function classifyBand: declare function classifyBand(value: number, bands: readonly Band[]): Band | null;
function composeAssessmentScore: declare function composeAssessmentScore(sections: readonly AssessmentSectionInput[], policy: CompositionPolicy): AssessmentScore;
function computePassThreshold: declare function computePassThreshold(activityData: ActivityData, score: number, rounding?: RoundingPolicy): boolean;
function dictationReferenceWords: declare function dictationReferenceWords(data: DictationReference): readonly (readonly { itemId: string; word: string; }[])[];
function diffDictationChars: declare function diffDictationChars(reference: string, attempt: string): DictationCharOp[];
function evaluate: declare function evaluate(data: ActivityData, response: LearnerResponse, options?: EvaluateOptions): ItemOutcome;
function evaluateTries: declare function evaluateTries(data: ActivityData, responses: readonly LearnerResponse[], options?: EvaluateOptions): ItemTriesOutcome;
function gradeFromJudgement: declare function gradeFromJudgement(judgement: AiGradingJudgement, data: WrittenResponseData, options?: GradeFromJudgementOptions): GradeRecord | { reason: string; unscorable: true; };
function graderConfiguration: declare function graderConfiguration(grade: GradeRecord, scope: CalibrationScope): GraderConfiguration | null;
function gradeReadAloud: declare function gradeReadAloud(data: ReadAloudData, response: ReadAloudLearnerResponse, assessment: SpeechAssessment | null, options: GradeReadAloudOptions): GradeRecord | SpeechUnscorable;
function gte: declare function gte(value: number, threshold: number, policy: RoundingPolicy): boolean;
function inAuditSample: declare function inAuditSample(key: string, rate: number, seed: string): boolean;
function inspectWav: declare function inspectWav(bytes: Uint8Array, policy: WavInspectionPolicy): WavInspection;
function levenshteinDistance: declare function levenshteinDistance(a: string, b: string, max: number): number;
function matchText: declare function matchText(input: string, accepted: readonly string[] | string, policy?: TextMatchPolicy): TextMatchResult;
function outcomeFromRoutedGrade: declare function outcomeFromRoutedGrade(grade: GradeRecord, routing: GradeRouting): ItemOutcome;
function outcomeFromUnscorable: declare function outcomeFromUnscorable(result: { code: string; reason: string; }): ItemOutcome;
function resolveItemScoringPolicy: declare function resolveItemScoringPolicy(policy: unknown): ResolvedItemScoringPolicy;
function roundGrade: declare function roundGrade(value: number, policy: RoundingPolicy): number;
function routeGrade: declare function routeGrade(grade: GradeRecord, context: GradeRoutingContext): GradeRouting;
function score: declare function score(activityType: ActivityType, activityData: ActivityData, learnerResponse: LearnerResponse, options?: ScoringOptions): ScoringResult;
function scoreTries: declare function scoreTries(tries: readonly ItemTry[], policy?: ItemScoringPolicy | ResolvedItemScoringPolicy | null): ItemTriesScore;
function validateItemScoringPolicy: declare function validateItemScoringPolicy(policy: unknown): { data: ItemScoringPolicy; success: true; } | { issues: ItemScoringPolicyIssue[]; success: false; };
function validateSpeechAssessment: declare function validateSpeechAssessment(value: unknown): ValidationResult<SpeechAssessment>;
interface AssessmentScore: interface AssessmentScore { sections: SectionScore[]; score: number; passed: boolean | null; passFailureReason: PassFailureReason; status: 'final' | 'provisional'; pendingSlotIds: string[]; rejectedSlotIds?: string[]; unscorableSlotIds: string[]; }
interface AssessmentSectionInput: interface AssessmentSectionInput { id: string; title?: string; weight: number; passThresholdOverride?: number; items: ScoredItem[]; }
interface Band: interface Band { name: string; min: number; }
interface CalibrationPair: interface CalibrationPair { model: GradeRecord; person: GradeRecord; secondPerson?: GradeRecord; }
interface CalibrationReport: interface CalibrationReport { configuration: GraderConfiguration; pairs: number; criteria: CriterionCalibration[]; total: TotalCalibration; reportHash: string; }
interface CalibrationScope: interface CalibrationScope { rubric?: WrittenResponseRubric; languageTarget?: string; }
interface CalibrationThresholds: interface CalibrationThresholds { minPairs?: number; minQuadraticKappa?: number; minExactAgreement?: number; minPearson?: number; maxMeanAbsoluteError?: number; maxAbsStandardizedMeanDifference?: number; maxDegradation?: number; maxCalibrationError?: number; }
interface CompositionPolicy: interface CompositionPolicy { passThreshold: number; sectionThreshold?: number; rounding: RoundingPolicy; }
interface CriterionCalibration: interface CriterionCalibration { name: string; scale: 'levels' | 'score'; levels?: number; pairs: number; exactAgreement?: null | number; adjacentAgreement?: null | number; quadraticKappa?: null | number; confusion?: number[][]; pearson: null | number; meanAbsoluteError: null | number; standardizedMeanDifference: null | number; probabilityPairs?: number; calibrationError?: null | number; brierScore?: null | number; humanPairs?: number; humanQuadraticKappa?: null | number; humanPearson?: null | number; degradation?: null | number; }
interface DictationAlignment: interface DictationAlignment { candidateIndex: number; reference: string; attempt: string; truncated: boolean; similarity: number; words: DictationWordAlignment[]; }
interface DictationCharOp: interface DictationCharOp { op: 'equal' | 'extra' | 'missing' | 'substitute'; reference: string; attempt: string; }
interface DictationWordAlignment: interface DictationWordAlignment { itemId?: string; reference: string; attempt: string; similarity: number; status: 'correct' | 'extra' | 'incorrect' | 'missing'; }
interface EvaluateOptions: interface EvaluateOptions extends ScoringOptions { scoring?: ItemScoringPolicy | null; }
interface GradeReadAloudOptions: interface GradeReadAloudOptions { measured: SpeechMeasurement | null; plausibility: SpeechPlausibilityPolicy; allowAiAssessor?: boolean; rounding?: RoundingPolicy; }
interface GradeRecord: interface GradeRecord { score: number; maxScore: number; passed: boolean; feedback: null | string; criteria?: CriterionScore[]; details?: ScoringDetail[]; corrections?: InlineCorrection[]; evidence?: string[]; rationale?: string; confidence?: 'high' | 'low' | 'medium'; requiresHumanReview?: boolean; grader?: Grader; usage?: GraderUsage; gradedAt?: string; routing?: GradeRouting; }
interface GradeRoutingContext: interface GradeRoutingContext { mode: 'exam' | 'practice'; item: CalibrationScope; calibration?: CalibrationReport; policy?: GradeRoutingPolicy; sampleKey?: string; }
interface GradeRoutingPolicy: interface GradeRoutingPolicy { calibration?: CalibrationThresholds; minLevelProbability?: number; routeLowConfidence?: boolean; audit?: { rate: number; seed: string; }; }
interface ItemScoringPolicy: interface ItemScoringPolicy { hintPenalty?: null | number; retries?: null | number; retryPenalty?: null | number; counts?: ItemScoringCount | null; }
interface ItemScoringPolicyIssue: interface ItemScoringPolicyIssue { path: string; message: string; }
interface ItemTriesOutcome: interface ItemTriesOutcome { outcome: ItemOutcome; counted: null | number; tries: ItemTryScore[]; }
interface ItemTriesScore: interface ItemTriesScore { score: number; maxScore: number; counted: number; tries: ItemTryScore[]; }
interface ItemTry: interface ItemTry { score: number; maxScore: number; hintsRevealed?: number | undefined; }
interface ItemTryScore: interface ItemTryScore { score: number; scored: number; maxScore: number; hintsRevealed: number; penalty: number; }
interface ReadAloudData: interface ReadAloudData { schemaVersion: '1.0'; type: 'read-aloud'; id: string; title: string; instructions?: string; referenceText: string; locale: string; media?: ActivityMedia; slowMedia?: ReadAloudSlowMedia; recording: RecordingBounds; scoring: { dimensions: ReadAloudDimensionWeight[]; }; passThreshold?: number; feedback?: ActivityFeedback; learningObjectives?: string[]; difficultyLevel?: 1 | 2 | 3 | 4 | 5; ai?: ActivityAiPermissions; }
interface ReadAloudLearnerResponse: interface ReadAloudLearnerResponse { type: 'read-aloud'; recording: RecordingRef | null; takes?: number; }
interface ReadAloudWordAlignment: interface ReadAloudWordAlignment { itemId?: string; reference: string; heard: string; state: ReadAloudWordState; accuracy?: number; wordIndex?: number; }
interface RecordingRef: interface RecordingRef { key: string; mimeType: string; durationMs?: number; }
interface ResolvedItemScoringPolicy: interface ResolvedItemScoringPolicy { hintPenalty: number; retries: number; retryPenalty: number; counts: ItemScoringCount; }
interface RoundingPolicy: interface RoundingPolicy { mode: RoundingMode; dp: number; }
interface ScoredItem: interface ScoredItem { slotId: string; activityId?: string; points: number; outcome: ItemOutcome; }
interface ScoringOptions: interface ScoringOptions { rounding?: RoundingPolicy; }
interface SectionScore: interface SectionScore { id: string; title?: string; weight: number; normalizedWeight: number; earnedPoints: number; gradedMaxPoints: number; maxPoints: number; score: number; passed: boolean; appliedThreshold: null | number; pendingSlotIds: string[]; rejectedSlotIds?: string[]; unscorableSlotIds: string[]; }
interface SpeechAssessment: interface SpeechAssessment { assessmentVersion: '1.0'; status: 'assessed' | 'no_speech'; task: 'scripted' | 'unscripted'; locale: string; referenceText?: string; recordingKey?: string; assessor: Grader; scale: 100; scores: { accuracy?: number; completeness?: number; fluency?: number; overall?: number; prosody?: number; }; recognizedText?: string; miscue: 'assessor' | 'none'; phonemeAlphabet?: 'ipa' | 'sapi'; words: SpeechWord[]; prosody?: { monotoneConfidence?: number; }; signal?: { snrDb?: number; }; }
interface SpeechMeasurement: interface SpeechMeasurement { durationMs: number; voicedMs: number; }
interface SpeechPhoneme: interface SpeechPhoneme { symbol?: string; accuracy?: number; startMs?: number; durationMs?: number; heardAs?: SpeechPhonemeCandidate[]; }
interface SpeechPhonemeCandidate: interface SpeechPhonemeCandidate { symbol: string; score: number; }
interface SpeechPlausibilityPolicy: interface SpeechPlausibilityPolicy { maxWordsPerSecond: number; minVoicedMs: number; }
interface SpeechSyllable: interface SpeechSyllable { text: string; grapheme?: string; accuracy?: number; startMs?: number; durationMs?: number; }
interface SpeechUnscorable: interface SpeechUnscorable { unscorable: true; code: SpeechUnscorableCode; reason: string; }
interface SpeechWord: interface SpeechWord { text: string; accuracy?: number; error: SpeechWordError; vendorError?: string; startMs?: number; durationMs?: number; syllables?: SpeechSyllable[]; phonemes?: SpeechPhoneme[]; breaks?: { missing?: number; unexpected?: number; }; }
interface TextMatchPolicy: interface TextMatchPolicy { caseSensitive?: boolean; trim?: boolean; normalize?: 'NFC' | 'NFKC' | 'none'; foldDiacritics?: boolean; collapseInnerWhitespace?: boolean; ignorePunctuation?: boolean; levenshtein?: number; locale?: string; }
interface TextMatchResult: interface TextMatchResult { matched: boolean; via: 'exact' | 'folded' | 'fuzzy' | 'none' | 'normalized'; }
interface TotalCalibration: interface TotalCalibration { pairs: number; pearson: null | number; meanAbsoluteError: null | number; standardizedMeanDifference: null | number; passAgreement: null | number; humanPairs?: number; humanPearson?: null | number; degradation?: null | number; }
interface WavInspectionPolicy: interface WavInspectionPolicy { silenceDbfs: number; frameMs: number; }
type DictationReference: type DictationReference = Partial<Pick<DictationData, 'acceptedTranscripts' | 'tolerance' | 'transcript'>>;
type GradeFromJudgementOptions: type GradeFromJudgementOptions = Omit<GradeFromRubricOptions, 'feedback'>;
type ItemOutcome: type ItemOutcome = { code?: string; maxScore: number; reason: string; status: 'unscorable'; } | { details: ScoringDetail[]; feedback: null | string; maxScore: number; passed: boolean; score: number; status: 'scored'; } | { feedback: null | string; grade: GradeRecord; maxScore: number; passed: boolean; score: number; status: 'graded'; } | { maxScore: number; partial?: DeferredScoringPartial; pendingGrade?: GradeRecord; reason: DeferredReason; rejectedGrade?: GradeRecord; status: 'deferred'; };
type ItemScoringCount: type ItemScoringCount = 'best' | 'first' | 'last';
type PassFailureReason: type PassFailureReason = 'both' | 'overall_below_threshold' | 'section_below_threshold' | null;
type ReadAloudWordState: type ReadAloudWordState = 'correct' | 'inserted' | 'mispronounced' | 'omitted';
type RoundingMode: type RoundingMode = 'ceil' | 'floor' | 'half-even' | 'half-up';
type SpeechUnscorableCode: type SpeechUnscorableCode = 'assessor_not_accepted' | 'implausible_speech_rate' | 'insufficient_voiced_time' | 'invalid_assessment' | 'locale_mismatch' | 'missing_dimension' | 'no_speech' | 'recording_mismatch' | 'reference_mismatch' | 'task_mismatch';
type SpeechWordError: type SpeechWordError = 'insertion' | 'mispronunciation' | 'none' | 'omission';
type WavInspection: type WavInspection = { bitsPerSample: 16; channels: number; durationMs: number; peakDbfs: number; sampleRate: number; valid: true; voicedMs: number; } | { reason: 'not_wav' | 'truncated' | 'unsupported_encoding'; valid: false; };
```

## @intellectif/lk-core/xapi

```ts
const XAPI_VERB_DISPLAY: XAPI_VERB_DISPLAY: Record<XAPIVerbKey, Record<string, string>>
const xAPIBuilder: xAPIBuilder: { buildStatement(params: XAPIStatementParams): XAPIStatement; buildAnsweredStatement(params: AnsweredStatementParams): XAPIStatement; buildSubmittedStatement(params: SubmittedStatementParams): XAPIStatement; buildCompletedStatement(params: CompletedStatementParams): XAPIStatement; }
const XAPIVerb: XAPIVerb: { readonly ANSWERED: "http://adlnet.gov/expapi/verbs/answered"; readonly ATTEMPTED: "http://adlnet.gov/expapi/verbs/attempted"; readonly COMPLETED: "http://adlnet.gov/expapi/verbs/completed"; readonly EXPERIENCED: "http://adlnet.gov/expapi/verbs/experienced"; readonly FAILED: "http://adlnet.gov/expapi/verbs/failed"; readonly INTERACTED: "http://adlnet.gov/expapi/verbs/interacted"; readonly PASSED: "http://adlnet.gov/expapi/verbs/passed"; readonly SCORED: "http://adlnet.gov/expapi/verbs/scored"; readonly SUBMITTED: "http://activitystrea.ms/schema/1.0/submit"; readonly WATCHED: "https://w3id.org/xapi/video/verbs/watched"; }
function validateXAPIStatement: declare function validateXAPIStatement(statement: XAPIStatement): void;
function xapiDefinitionFor: declare function xapiDefinitionFor(data: { type: string; }): Partial<XAPIObjectParams>;
interface AnsweredStatementParams: interface AnsweredStatementParams { actor: XAPIActor; object: XAPIObjectParams; scoringResult: ScoringResult; timeSpentMs: number; response?: string; context?: XAPIContext; resultExtensions?: Record<string, unknown>; }
interface CompletedStatementParams: interface CompletedStatementParams { actor: XAPIActor; object: XAPIObjectParams; scoringResult?: ScoringResult; timeSpentMs: number; context?: XAPIContext; resultExtensions?: Record<string, unknown>; }
interface SubmittedStatementParams: interface SubmittedStatementParams { actor: XAPIActor; object: XAPIObjectParams; timeSpentMs: number; response?: string; context?: XAPIContext; resultExtensions?: Record<string, unknown>; }
interface XAPIObjectParams: interface XAPIObjectParams { id: string; name?: Record<string, string>; description?: Record<string, string>; type?: string; interactionType?: string; correctResponsesPattern?: string[]; choices?: Array<{ description?: Record<string, string>; id: string; }>; }
interface XAPIStatementParams: interface XAPIStatementParams { actor: XAPIActor; verb: XAPIVerbKey; object: XAPIObjectParams; result?: XAPIResult; context?: XAPIContext; }
type XAPIVerbKey: type XAPIVerbKey = keyof typeof XAPIVerb;
```
