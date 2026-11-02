/**
 * The public domain types (design §5.1 to §5.3 and §5.5 to §5.8; the result
 * types of §5.9 that the graph functions return). Every field is `readonly`,
 * every number is finite and every instant is integer epoch milliseconds
 * (D12). Types only: nothing here runs.
 */

// ---------------------------------------------------------------------------
// §5.1 Graph, items and evidence (R2, R7)
// ---------------------------------------------------------------------------

/** Skill graph: supplied by the host; the package validates it and never edits it. */
export interface SkillGraph {
  /** The host's own version tag, recorded in state. */
  readonly version: string;
  readonly skills: readonly SkillNode[];
  readonly edges: readonly SkillEdge[];
}

export interface SkillNode {
  readonly id: string;
  readonly knowledge: 'declarative' | 'procedural' | 'mixed';
  /** Overrides the default ladder for this skill; required for a `mixed` skill. */
  readonly stages?: readonly StageId[];
  /** Skills in one group are confusable, so they are interleaved. */
  readonly interleaveGroup?: string;
  /** Host data, opaque to the package (for example a CEFR band). */
  readonly tags?: readonly string[];
  /** Host text, passed to generators as a fact; never interpreted. */
  readonly label?: string;
  /** Host text, for example a can-do statement; never interpreted. */
  readonly description?: string;
  /** Host text: how a grader can isolate this skill as a criterion; never interpreted. */
  readonly criteriaHint?: string;
  /** The host's task-form vocabulary per stage. */
  readonly forms?: Readonly<Record<StageId, readonly string[]>>;
  /** Initial ability at the first stage, in logits on the Elo scale (default 0). */
  readonly masteryPrior?: number;
  /** The standard a master meets on a top-stage task, in stage-relative logits (default 0). */
  readonly referenceDifficulty?: number;
  /** Per-skill override of the desired retention (R4.6), in [0.7, 0.97]. */
  readonly desiredRetention?: number;
}

export type SkillEdge =
  | {
      readonly kind: 'prerequisite';
      /** Must be mastered or credited... */
      readonly from: string;
      /** ...before this is introduced (if hard). */
      readonly to: string;
      readonly strength: 'hard' | 'soft';
    }
  | {
      readonly kind: 'encompasses';
      /** The composite skill. */
      readonly from: string;
      /** A component it exercises. */
      readonly to: string;
      /** 0 < weight <= 1. */
      readonly weight: number;
    };

/** Ladders are data (R3.1). */
export type StageId = string;

/** One disposable, practisable instance at one stage of one or more skills. */
export interface PracticeItem {
  readonly id: string;
  /** The primary skill has the largest weight. */
  readonly skills: readonly ItemSkill[];
  /** In the primary skill's ladder; each other skill has it or an equivalent stage (R2.2, R3.8). */
  readonly stage: StageId;
  /** Author or generator prior, in logits relative to the stage (default 0). */
  readonly difficulty?: number;
  /** For session budgets. */
  readonly expectedSeconds?: number;
  /** At or under this, a first-try success may map to `easy`. */
  readonly fluentSeconds?: number;
  /** Above this, a first-try, no-hint pass maps to `hard` (R7.2). */
  readonly slowSeconds?: number;
  /** Grader criterion or test group to component skill (R7.2). */
  readonly criteria?: readonly ItemCriterion[];
  /** One of the skill's `forms` for this stage, if the host uses them. */
  readonly form?: string;
  /** Lets the host and the generator check detect repeats. */
  readonly contentHash?: string;
  readonly origin: 'authored' | 'generated';
  /** Only proven items are planned or recorded. */
  readonly status: 'proven' | 'unproven';
  readonly proof?: CandidateProof;
}

export interface ItemSkill {
  readonly skillId: string;
  /** The weights of one item sum to 1. */
  readonly weight: number;
}

export interface ItemCriterion {
  /** A rubric criterion name or a test group, as the grader reports it. */
  readonly name: string;
  /** One of the item's skills, or a component one of them encompasses. */
  readonly skillId: string;
}

/** What happened, from any source. */
export interface Evidence {
  /** Idempotency key; the host's log store makes it unique (R11.6). */
  readonly id: string;
  readonly itemId: string;
  /** Epoch ms, host clock. */
  readonly at: number;
  readonly source: EvidenceSource;
  /** Default `practice`. */
  readonly context?: 'practice' | 'exam' | 'diagnostic' | 'pretest';
  /** The plan target this attempt answered, for the host's analytics. */
  readonly targetId?: string;
  readonly durationMs?: number;
  readonly hintsUsed?: number;
  /** Failed tries before the one that counts. */
  readonly attempts?: number;
  /** Per-component outcomes (R7.2). */
  readonly skillOutcomes?: readonly SkillOutcome[];
  /** Asked before feedback (R7.8). */
  readonly learnerConfidence?: 'sure' | 'unsure' | 'guess';
  /** Id of held evidence this confirms or overrides. */
  readonly confirms?: string;
  /** Id of evidence for the same attempt: updates ability only (R7.2). */
  readonly supplements?: string;
}

export interface SkillOutcome {
  readonly skillId: string;
  readonly score: number;
  readonly maxScore: number;
  /** Default: `score === maxScore`. */
  readonly passed?: boolean;
}

export type EvidenceSource =
  | {
      readonly kind: 'auto';
      readonly score: number;
      readonly maxScore: number;
      readonly passed: boolean;
      readonly checks?: { readonly passed: number; readonly total: number };
    }
  | {
      readonly kind: 'ai';
      readonly score: number;
      readonly maxScore: number;
      readonly passed: boolean;
      readonly confidence: 'high' | 'medium' | 'low';
      readonly requiresHumanReview?: boolean;
      readonly graderId?: string;
    }
  | {
      readonly kind: 'human';
      readonly score: number;
      readonly maxScore: number;
      readonly passed: boolean;
      readonly graderId?: string;
    }
  | { readonly kind: 'self'; readonly rating: Rating }
  /** Seen or studied, no retrieval (for example a worked example). */
  | { readonly kind: 'exposure' }
  /** Graded later: held. */
  | { readonly kind: 'pending'; readonly reason: 'deferred' | 'routed-to-person' };

export type Rating = 'again' | 'hard' | 'good' | 'easy';

// ---------------------------------------------------------------------------
// §5.2 Model ports (R4, R5)
// ---------------------------------------------------------------------------

export interface MemoryModel<M = unknown> {
  /** `fsrs-7` for the default. */
  readonly id: string;
  /** A change in output is a new version, and a package major. */
  readonly version: number;
  /** The instance's resolved options; enters the configuration hash (D26). */
  readonly params: JsonValue;
  /** A memory with no reviews. */
  init(): M;
  /** 0..1; pure and cheap, called by plan and status (R12.4). */
  retrievability(memory: M, now: number): number;
  review(memory: M, rating: Rating, now: number, context: ReviewContext): MemoryReview<M>;
  serialize(memory: M): unknown;
  /** Throws a typed error on bad input. */
  deserialize(raw: unknown): M;
}

export interface MemoryReview<M> {
  readonly memory: M;
  /** Integer epoch ms. */
  readonly due: number;
}

/**
 * What a review needs besides the memory, the rating and the time. **(revised
 * in M5)** Only the desired retention: the learning steps, relearning steps
 * and maximum interval are the memory model's own options (`FsrsOptions` for
 * the default), so they enter its `params` and the configuration hash.
 */
export interface ReviewContext {
  /** The skill's desired retention at the reviewed stage (R4.6). */
  readonly desiredRetention: number;
}

export interface MasteryModel<S = unknown> {
  /** `elo` for the default. */
  readonly id: string;
  readonly version: number;
  /** For example Elo alpha and beta; enters the configuration hash (D26). */
  readonly params: JsonValue;
  /** The ability at the skill's first stage. */
  init(skill: SkillNode): S;
  update(state: S, observation: MasteryObservation): S;
  /** A host `prior` action at one stage (R5.5). */
  prior(state: S, theta: number, pseudoCount: number): S;
  /** The ability at another stage: value minus shift, fresh uncertainty (D27). */
  derive(from: S, shift: number): S;
  /** 0..1. */
  expectedSuccess(state: S, difficulty: number): number;
  estimate(state: S): MasteryEstimate;
  serialize(state: S): unknown;
  deserialize(raw: unknown): S;
}

export interface MasteryObservation {
  /** 0..1, partial credit allowed. */
  readonly correct: number;
  /** 0..1, from the evidence mapping. */
  readonly weight: number;
  /** The task's prior, relative to its stage, on this model's scale. */
  readonly difficulty: number;
  /** The stage whose ability this updates: the skill's equivalent of the task's stage (R3.8). */
  readonly stage: StageId;
  readonly context: 'practice' | 'exam' | 'diagnostic' | 'pretest';
}

export interface MasteryEstimate {
  /** For example `elo@1`. */
  readonly model: string;
  /** Theta for Elo. */
  readonly value: number;
  /** K(n) for Elo. */
  readonly uncertainty?: number;
  readonly evidenceCount: number;
}

/** Default memory model options. The defaults are pinned in the package (R4.5). */
export interface FsrsOptions {
  /** Fitted FSRS-7 weights (R4.8). */
  readonly weights?: readonly number[];
  /** Default `['1m', '10m']`. */
  readonly learningSteps?: readonly string[];
  /** Default `['10m']`. */
  readonly relearningSteps?: readonly string[];
  /** Default 36500. */
  readonly maximumIntervalDays?: number;
}

export interface EloOptions {
  /** Default 1. */
  readonly alpha?: number;
  /** Default 0.05. */
  readonly beta?: number;
}

/** A replaceable stage policy (R1.4); its id, version and params enter the configuration hash (D26). */
export interface StagePolicy {
  /** `stage-default` for the built-in policy. */
  readonly id: string;
  readonly version: number;
  /** The built-in policy: its resolved `StagePolicyOptions`. */
  readonly params: JsonValue;
  decide(input: StageDecisionInput): StageDecision;
}

export interface StageDecisionInput {
  readonly ladder: readonly StageId[];
  readonly current: StageId;
  /** The skill's equivalent of the task's stage (R3.8). */
  readonly evidenceStage: StageId;
  readonly rating: Rating;
  readonly at: number;
  readonly streak: StageStreak;
}

export interface StageDecision {
  /**
   * After the implication rule (D15). `review` is a `hard` retrieval at or
   * above the current stage: the memory is reviewed and the streak is
   * unchanged. `neutral` takes no review. (revised in M4: `review` added.)
   */
  readonly effect: 'success' | 'lapse' | 'review' | 'neutral';
  readonly move: 'promote' | 'demote' | 'stay';
  /** The streak after this retrieval (reset on a move). */
  readonly streak: StageStreak;
  /** `lastSuccessAt + gap` while 0 < counted successes < K, else null (R3.2). */
  readonly dueCap: number | null;
}

/** A replaceable evidence mapper (R1.4); its id, version and params enter the configuration hash (D26). */
export interface EvidenceMapper {
  /** `evidence-default` for the built-in mapper. */
  readonly id: string;
  readonly version: number;
  /** The built-in mapper: its resolved `EvidenceOptions`. */
  readonly params: JsonValue;
  map(
    evidence: Evidence,
    task: TaskSnapshot,
    skills: SkillStatesView,
    config: ResolvedPracticeConfig,
  ): MappedEvidence;
}

export interface MappedEvidence {
  readonly held: boolean;
  readonly perSkill: readonly SkillEffect[];
}

export interface SkillEffect {
  readonly skillId: string;
  readonly rating: Rating | null;
  /** 0..1. */
  readonly correct: number;
  /** 0..1, ability weight (evidence weight times item weight, or the outcome's). */
  readonly weight: number;
  readonly memory: 'review' | 'none';
  readonly reason:
    | 'outcome'
    | 'overall'
    | 'below-weight-floor'
    | 'not-assessed'
    | 'exposure'
    | 'supplement'
    | 'context'
    | 'held';
}

export type SkillStatesView = Readonly<Record<string, { readonly stage: StageId }>>;

// ---------------------------------------------------------------------------
// §5.3 Planning (R6)
// ---------------------------------------------------------------------------

export interface PlanRequest {
  readonly now: number;
  /** Include retrievals due up to this instant; defaults to `now` (R1.2). */
  readonly dueBy?: number;
  readonly seed: string;
  readonly budget: { readonly maxTargets?: number; readonly maxSeconds?: number };
  readonly limits?: {
    readonly maxNewSkills?: number;
    readonly maxReviewBacklog?: number;
    readonly maxRemediation?: number;
    readonly maxSkillsPerTarget?: number;
  };
  /** A host-chosen goal, for example a lesson's objectives. */
  readonly focusSkills?: readonly string[];
  /** Skills the host cannot practise now. */
  readonly excludeSkills?: readonly string[];
  /** Item ids the host cannot show now. */
  readonly excludeItems?: readonly string[];
  /** Proven items the planner may attach to targets. */
  readonly pool?: readonly PracticeItem[];
}

export interface SessionPlan {
  readonly targets: readonly PracticeTarget[];
  readonly deferred: { readonly reviewsDue: number; readonly newReady: number };
  readonly budgetUsed: { readonly targets: number; readonly seconds: number };
  readonly algorithm: { readonly id: 'planner'; readonly version: number };
}

export interface PracticeTarget {
  /** Deterministic (D23). */
  readonly id: string;
  readonly kind: 'review' | 'new' | 'stage-up' | 'remediation' | 'pretest';
  /** The primary skill first, then coalesced components. */
  readonly skillIds: readonly string[];
  readonly stage: StageId;
  /** Logits: Elo expected success equals `targetSuccess` here. */
  readonly targetDifficulty: number;
  /** A generated task should land within this of the target. */
  readonly difficultyTolerance: number;
  readonly expectedSeconds: number;
  readonly constraints: TaskConstraints;
  readonly item?: {
    readonly itemId: string;
    readonly difficulty: number;
    readonly expectedSuccess: number;
  };
  /** Structured codes and ids, never prose. */
  readonly reason: PlanReason;
}

export interface TaskConstraints {
  /** The skill's `forms` for this stage, if any. */
  readonly forms?: readonly string[];
  /** True when several skills must each be graded. */
  readonly needsSkillOutcomes: boolean;
  /** Recently used instances. */
  readonly avoidItemIds: readonly string[];
  readonly avoidContentHashes: readonly string[];
  readonly context: 'practice' | 'pretest';
}

export type PlanReason = PlanReasonDetail & {
  /** Elo expected success at `targetDifficulty` (equals `targetSuccess`). */
  readonly expectedSuccess: number;
  /** Component ids that joined this target (R6.4c). */
  readonly coalesced: readonly string[];
  /** True when the review backlog blocked new skills (R6.8). */
  readonly newSkillsDeferred: boolean;
};

export type PlanReasonDetail =
  | { readonly code: 'overdue'; readonly due: number; readonly retrievability: number }
  | {
      readonly code: 'remediation';
      readonly lapsedSkillId: string;
      readonly lapseAt: number;
      readonly retrievability: number;
    }
  | { readonly code: 'due'; readonly due: number; readonly retrievability: number }
  | { readonly code: 'stage-up'; readonly fromStage: StageId | null }
  | {
      readonly code: 'new';
      readonly focus: boolean;
      readonly softPrerequisitesMastered: boolean;
    }
  | { readonly code: 'pretest'; readonly forSkillId: string };

// ---------------------------------------------------------------------------
// §5.5 Generator and decomposition contracts (R9), types only
// ---------------------------------------------------------------------------

export interface GenerationContext {
  readonly graph: SkillGraph;
  readonly state: PracticeState;
  readonly now: number;
}

export interface GenerationOptions {
  /** 1..20. */
  readonly count: number;
  readonly seed: string;
}

/** Facts only; no prompt (R9.1). */
export interface GenerationRequest {
  readonly version: 1;
  readonly target: {
    readonly id: string;
    readonly kind: PracticeTarget['kind'];
    readonly stage: StageId;
    readonly targetDifficulty: number;
    readonly difficultyTolerance: number;
    readonly expectedSuccess: number;
    readonly expectedSeconds: number;
    readonly context: 'practice' | 'pretest';
  };
  readonly skills: readonly {
    readonly id: string;
    readonly role: 'primary' | 'component';
    readonly knowledge: SkillNode['knowledge'];
    readonly ladder: readonly StageId[];
    /** This skill's equivalent of the target's stage (R3.8). */
    readonly stage: StageId;
    /** `SkillNode.forms[stage]`, when the host set them. */
    readonly forms?: readonly string[];
    /** At the target difficulty, from this skill's ability at `stage`. */
    readonly expectedSuccess: number;
    readonly referenceDifficulty: number;
    readonly criteriaHint?: string;
    readonly label?: string;
    readonly description?: string;
    readonly tags?: readonly string[];
  }[];
  /** The target's allowed forms; a candidate's declared form must be one of them. */
  readonly forms?: readonly string[];
  readonly needsSkillOutcomes: boolean;
  readonly avoid: {
    readonly itemIds: readonly string[];
    readonly contentHashes: readonly string[];
  };
  readonly learner: {
    readonly recentLapses: readonly { readonly skillId: string; readonly at: number }[];
    readonly weakest: readonly { readonly skillId: string; readonly theta: number }[];
  };
  readonly count: number;
  readonly seed: string;
}

/** What a generator returns per task, after `checkCandidates`. `content` is the host's. */
export interface CandidateItem extends PracticeItem {
  readonly origin: 'generated';
  readonly status: 'unproven';
  readonly content: unknown;
  /** The generator's own, or the hash of the canonical content when absent. */
  readonly contentHash: string;
}

export interface CandidateCheck {
  readonly accepted: readonly CandidateItem[];
  readonly rejected: readonly { readonly index: number; readonly issues: readonly Issue[] }[];
}

export type CandidateProof =
  | {
      readonly kind: 'executable';
      readonly at: number;
      readonly referencePassed: true;
      /** At least 1. */
      readonly wrongSolutionsFailed: number;
      /** For example `pytest`. */
      readonly runner?: string;
    }
  | { readonly kind: 'reviewed'; readonly at: number; readonly reviewerId: string }
  | {
      readonly kind: 'model-checked';
      readonly at: number;
      readonly model: string;
      readonly agreed: true;
    };

export type AdmitResult =
  | { readonly ok: true; readonly item: PracticeItem }
  | { readonly ok: false; readonly issues: readonly Issue[] };

/** Implemented by the host. */
export type TaskGenerator = (request: GenerationRequest) => Promise<unknown>;

export interface LearnerGoal {
  readonly id: string;
  /** Host text, a fact for the decomposer. */
  readonly text: string;
  /** Existing skills the goal builds on. */
  readonly anchorSkillIds: readonly string[];
}

export interface DecompositionOptions {
  /** New ids equal it or start with it plus `.`. */
  readonly idPrefix: string;
  readonly seed: string;
  /** Default 12. */
  readonly maxSkills?: number;
  /** Default all three. */
  readonly knowledge?: readonly SkillNode['knowledge'][];
}

export interface DecompositionRequest {
  readonly version: 1;
  readonly goal: LearnerGoal;
  readonly anchors: readonly DecompositionSkillFact[];
  /** Within two edges of an anchor. */
  readonly neighbours: readonly DecompositionSkillFact[];
  /** Among anchors and neighbours. */
  readonly edges: readonly SkillEdge[];
  readonly idPrefix: string;
  readonly knowledge: readonly SkillNode['knowledge'][];
  readonly ladders: Readonly<Record<'declarative' | 'procedural', readonly StageId[]>>;
  readonly maxSkills: number;
  readonly seed: string;
}

export interface DecompositionSkillFact {
  readonly id: string;
  readonly knowledge: SkillNode['knowledge'];
  readonly ladder: readonly StageId[];
  readonly label?: string;
}

/** New skills and edges, typically an AI's decomposition of a learner's goal (R2.6). */
export interface GraphExtension {
  /** The hash of its canonical skills and edges. */
  readonly id: string;
  readonly goalId: string;
  readonly idPrefix: string;
  readonly skills: readonly SkillNode[];
  readonly edges: readonly SkillEdge[];
  readonly status: 'proposed' | 'admitted';
  readonly approval?: ExtensionApproval;
}

export interface ExtensionApproval {
  readonly by: 'author' | 'human' | 'learner';
  readonly at: number;
  readonly approverId?: string;
}

export type DecompositionCheck =
  | { readonly ok: true; readonly extension: GraphExtension }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export type ExtensionAdmission =
  | { readonly ok: true; readonly extension: GraphExtension }
  | { readonly ok: false; readonly issues: readonly Issue[] };

/** Implemented by the host. */
export type GoalDecomposer = (request: DecompositionRequest) => Promise<unknown>;

// ---------------------------------------------------------------------------
// §5.6 State and log (R11, D21)
// ---------------------------------------------------------------------------

export interface PracticeState {
  readonly schemaVersion: 1;
  readonly learnerId: string;
  readonly graphVersion: string;
  readonly configHash: string;
  readonly log: {
    /** Entries applied; the next entry's seq. */
    readonly length: number;
    /** The largest `at` applied. */
    readonly lastAt: number | null;
    /** Rolling hash in seq order. */
    readonly hash: string;
  };
  /** Only skills with history; others are derived. */
  readonly skills: Readonly<Record<string, SkillState>>;
  readonly items: Readonly<Record<string, ItemUsage>>;
  readonly held: readonly HeldEvidence[];
  /** Newest last, at most `recentIdWindow`. */
  readonly recentIds: readonly string[];
}

export interface SkillState {
  readonly stage: StageId;
  readonly startedAt: number | null;
  /** Sticky (R3.3). */
  readonly unlockedAt: number | null;
  readonly credited: boolean;
  readonly suspended: 'leech' | 'host' | null;
  readonly memories: Readonly<Record<StageId, StageMemory>>;
  /** Per stage, `MasteryModel.serialize` output; missing stages are derived. */
  readonly ability: Readonly<Record<StageId, unknown>>;
  /** The predicate after the last entry that touched the skill (R3.5). */
  readonly mastered: boolean;
  readonly evidenceCount: number;
  readonly lastLapseAt: number | null;
  /** Counted (spaced) successes at the ladder's top stage, for the mastery predicate (R3.5 b). */
  readonly top: {
    readonly successes: number;
    readonly firstSuccessAt: number | null;
    readonly lastSuccessAt: number | null;
    readonly lastWasLapse: boolean;
  };
}

export interface StageMemory {
  /** For example `fsrs-7@1`. */
  readonly model: string;
  /** `MemoryModel.serialize` output. */
  readonly memory: unknown;
  /** Null before the first retrieval; the smaller of `modelDue` and the streak's due cap. */
  readonly due: number | null;
  /** The memory model's own due time. */
  readonly modelDue: number | null;
  readonly lastReviewAt: number | null;
  readonly reviews: number;
  /** For the leech threshold (R4.7). */
  readonly lapses: number;
  readonly streak: StageStreak;
  readonly superseded: boolean;
}

export interface StageStreak {
  /** Counted (spaced) successes. */
  readonly successes: number;
  readonly firstSuccessAt: number | null;
  /** The last counted success. */
  readonly lastSuccessAt: number | null;
  readonly lapses: number;
}

export interface ItemUsage {
  readonly uses: number;
  readonly lastUsedAt: number;
}

export interface HeldEvidence {
  readonly evidenceId: string;
  readonly itemId: string;
  readonly at: number;
  readonly seq: number;
  readonly reason: 'low-confidence' | 'human-review' | 'deferred' | 'routed-to-person';
  /**
   * The held evidence and its task snapshot, as logged. **(revised in M5)**
   * Kept in the state so a confirmation that arrives while the held entry is
   * still the newest one is applied without reading the log (design 8.7).
   */
  readonly evidence: Evidence;
  readonly task: TaskSnapshot;
}

/** What an evidence entry stores about its task, so replay never needs the item (R2.3). */
export interface TaskSnapshot {
  readonly itemId: string;
  readonly skills: readonly ItemSkill[];
  readonly stage: StageId;
  /** Resolved, default 0. */
  readonly difficulty: number;
  readonly criteria?: readonly ItemCriterion[];
  readonly fluentSeconds?: number;
  readonly slowSeconds?: number;
  readonly contentHash?: string;
  readonly origin: 'authored' | 'generated';
  readonly proofKind?: CandidateProof['kind'];
}

export type ReviewLogEntry =
  | (LogEntryBase & {
      readonly kind: 'evidence';
      readonly evidence: Evidence;
      /** Absent only on a confirmation, which uses the held entry's. */
      readonly task?: TaskSnapshot;
    })
  | (LogEntryBase & {
      readonly kind: 'host';
      readonly id: string;
      readonly action: HostAction;
    });

export interface LogEntryBase {
  readonly schemaVersion: 1;
  /** Append order, from 0. */
  readonly seq: number;
  readonly at: number;
  readonly configHash: string;
}

export type HostAction =
  | {
      readonly kind: 'prior';
      readonly skillId: string;
      readonly theta: number;
      readonly pseudoCount: number;
      /** Default: the current stage. */
      readonly stage?: StageId;
    }
  | {
      readonly kind: 'place';
      readonly skillId: string;
      readonly stage: StageId;
      readonly credited: boolean;
    }
  | { readonly kind: 'suspend'; readonly skillId: string }
  | { readonly kind: 'unsuspend'; readonly skillId: string }
  | { readonly kind: 'discard-held'; readonly evidenceId: string }
  | { readonly kind: 'reset-skill'; readonly skillId: string };

export interface HostActionInput {
  /** Idempotency key, unique in the host's log store like an evidence id. */
  readonly id: string;
  readonly at: number;
  readonly action: HostAction;
}

// ---------------------------------------------------------------------------
// §5.7 Events, issues and status (R10.4, R3.7)
// ---------------------------------------------------------------------------

/** Adding an event variant is a minor; hosts keep a default branch. */
export type PracticeEvent =
  | {
      readonly type: 'review.recorded';
      readonly at: number;
      readonly evidenceId: string;
      readonly skillId: string;
      readonly stage: StageId;
      readonly rating: Rating;
      readonly due: number;
    }
  | {
      readonly type: 'evidence.held';
      readonly at: number;
      readonly evidenceId: string;
      readonly reason: HeldEvidence['reason'];
    }
  | {
      readonly type: 'evidence.confirmed';
      readonly at: number;
      readonly evidenceId: string;
      readonly heldId: string;
    }
  | { readonly type: 'evidence.discarded'; readonly at: number; readonly heldId: string }
  | { readonly type: 'evidence.duplicate'; readonly at: number; readonly evidenceId: string }
  | {
      readonly type: 'evidence.confident-error';
      readonly at: number;
      readonly evidenceId: string;
      readonly skillId: string;
    }
  | {
      readonly type: 'skill.not-assessed';
      readonly at: number;
      readonly evidenceId: string;
      readonly skillId: string;
    }
  | {
      readonly type: 'skill.started';
      readonly at: number;
      readonly skillId: string;
      readonly stage: StageId;
    }
  | {
      readonly type: 'stage.promoted';
      readonly at: number;
      readonly skillId: string;
      readonly from: StageId;
      readonly to: StageId;
    }
  | {
      readonly type: 'stage.demoted';
      readonly at: number;
      readonly skillId: string;
      readonly from: StageId;
      readonly to: StageId;
    }
  | { readonly type: 'skill.unlocked'; readonly at: number; readonly skillId: string }
  | { readonly type: 'skill.mastered'; readonly at: number; readonly skillId: string }
  | {
      readonly type: 'skill.mastery-lost';
      readonly at: number;
      readonly skillId: string;
      readonly failed: readonly ('stage' | 'successes' | 'ability' | 'retrievability')[];
    }
  | {
      readonly type: 'skill.leech';
      readonly at: number;
      readonly skillId: string;
      readonly stage: StageId;
      readonly lapses: number;
    }
  | {
      readonly type: 'skill.suspended';
      readonly at: number;
      readonly skillId: string;
      readonly reason: 'leech' | 'host';
    }
  | { readonly type: 'skill.unsuspended'; readonly at: number; readonly skillId: string }
  | {
      readonly type: 'skill.prior-set';
      readonly at: number;
      readonly skillId: string;
      readonly stage: StageId;
      readonly theta: number;
      readonly pseudoCount: number;
    }
  | {
      readonly type: 'skill.placed';
      readonly at: number;
      readonly skillId: string;
      readonly stage: StageId;
      readonly credited: boolean;
    }
  | {
      readonly type: 'state.migrated';
      readonly at: number | null;
      readonly from: number;
      readonly to: number;
    };

/** A validation or check failure (or warning), with a stable code (design §8.10). */
export interface Issue {
  /** Stable, for example `GRAPH_CYCLE`. */
  readonly code: string;
  readonly path: readonly (string | number)[];
  /** English, for logs; hosts localise by code. */
  readonly message: string;
}

export type SkillStatus =
  | 'locked'
  | 'ready'
  | 'learning'
  | 'reviewing'
  | 'mastered'
  | 'credited'
  | 'suspended';

export interface LearnerSummary {
  readonly at: number;
  readonly counts: Readonly<Record<SkillStatus, number>>;
  readonly dueNow: number;
  /** Graph order. */
  readonly skills: readonly SkillSummary[];
  readonly held: readonly {
    readonly evidenceId: string;
    readonly itemId: string;
    readonly at: number;
    readonly ageMs: number;
  }[];
}

export interface SkillSummary {
  readonly skillId: string;
  readonly status: SkillStatus;
  readonly stage: StageId | null;
  readonly due: number | null;
  readonly retrievability: number | null;
  /** At the current stage. */
  readonly ability: MasteryEstimate | null;
  /** Top-stage ability against `referenceDifficulty`. */
  readonly expectedSuccessAtReference: number | null;
  /** Mastered flag set, live predicate now false (decay before any entry). */
  readonly masteryLapsed: boolean;
  readonly lapses: number;
  readonly unlockedAt: number | null;
}

// ---------------------------------------------------------------------------
// §5.8 Configuration
// ---------------------------------------------------------------------------

export interface PracticeConfig {
  /** Default: the FSRS-7 memory model. */
  readonly memoryModel?: MemoryModel;
  /** Default: the Elo mastery model. */
  readonly masteryModel?: MasteryModel;
  /** A custom policy; default the built-in one. */
  readonly stagePolicy?: StagePolicy;
  /** Options of the built-in policy; given with `stagePolicy` it is `CONFIG_CONFLICT`. */
  readonly stagePolicyOptions?: StagePolicyOptions;
  /** A custom mapper; default the built-in one. */
  readonly evidenceMapper?: EvidenceMapper;
  /** Options of the built-in mapper; given with `evidenceMapper` it is `CONFIG_CONFLICT`. */
  readonly evidenceOptions?: EvidenceOptions;
  /** Stage demand (R3.8); merged over the defaults. */
  readonly stageDemand?: Readonly<Record<StageId, number>>;
  readonly ability?: {
    /** 1 logit per demand step (D27; placeholder). */
    readonly stageOffset?: number;
  };
  readonly ladders?: {
    readonly declarative?: readonly StageId[];
    readonly procedural?: readonly StageId[];
  };
  /** 0.9, in [0.7, 0.97]. */
  readonly desiredRetention?: number;
  readonly stageRetention?: Readonly<Record<StageId, number>>;
  readonly mastery?: {
    /** 2. */
    readonly topSuccesses?: number;
    /** 259_200_000 (72 h). */
    readonly topGapMs?: number;
    /** 0.80. */
    readonly minExpectedSuccess?: number;
    /** 0.10. */
    readonly retentionMargin?: number;
  };
  readonly planner?: {
    /** 0.85, in [0.6, 0.95]. */
    readonly targetSuccess?: number;
    /** 0.5. */
    readonly difficultyTolerance?: number;
    /** True. */
    readonly coalesce?: boolean;
    /** 86_400_000. */
    readonly remediationWindowMs?: number;
    /** False. */
    readonly pretestNewSkills?: boolean;
    /** 2, clipped to the ladder. */
    readonly pretestStageIndex?: number;
    /** Per-stage default `expectedSeconds`; merged over the defaults. */
    readonly stageSeconds?: Readonly<Record<StageId, number>>;
    /** The defaults of R6.8 and R6.4c. */
    readonly limits?: PlanRequest['limits'];
  };
  readonly contexts?: {
    /** False. */
    readonly examsMoveSchedule?: boolean;
    /** 1. */
    readonly diagnosticWeight?: number;
    /** 0. */
    readonly pretestWeight?: number;
  };
  /** 8. */
  readonly leechThreshold?: number;
  /** 0.3. */
  readonly memoryWeightFloor?: number;
  /** 604_800_000 (7 days). */
  readonly itemCooldownMs?: number;
  /** 2_592_000_000 (30 days). */
  readonly itemUsageRetentionMs?: number;
  /** 256. */
  readonly recentIdWindow?: number;
  /** `['executable', 'reviewed']`. */
  readonly acceptProofs?: readonly CandidateProof['kind'][];
}

export interface StagePolicyOptions {
  /** K = 2. */
  readonly promoteAfter?: number;
  /** 86_400_000 (24 h). */
  readonly promoteGapMs?: number;
  /** L = 2. */
  readonly demoteAfter?: number;
}

export interface EvidenceOptions {
  /** 1. */
  readonly checksPassFraction?: number;
  /** 0.5. */
  readonly aiMediumWeight?: number;
  /** 0.5. */
  readonly selfWeight?: number;
  /** Again 0, hard 0.6, good 1, easy 1. */
  readonly selfCorrect?: Readonly<Record<Rating, number>>;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** What the configuration hash sees of a model or policy instance (D26). */
export interface PolicyRef {
  readonly id: string;
  readonly version: number;
  readonly params: JsonValue;
}

/** Plain data only: every option filled in, frozen; exactly what the configuration hash covers. */
export interface ResolvedPracticeConfig {
  readonly memoryModel: PolicyRef;
  readonly masteryModel: PolicyRef;
  readonly stagePolicy: PolicyRef;
  /** Null when a custom policy is set. */
  readonly stagePolicyOptions: Required<StagePolicyOptions> | null;
  readonly evidenceMapper: PolicyRef;
  /** Null when a custom mapper is set. */
  readonly evidenceOptions: Required<EvidenceOptions> | null;
  /** Declared values merged over the defaults. */
  readonly stageDemand: Readonly<Record<StageId, number>>;
  readonly ability: { readonly stageOffset: number };
  readonly ladders: {
    readonly declarative: readonly StageId[];
    readonly procedural: readonly StageId[];
  };
  readonly desiredRetention: number;
  readonly stageRetention: Readonly<Record<StageId, number>>;
  readonly mastery: {
    readonly topSuccesses: number;
    readonly topGapMs: number;
    readonly minExpectedSuccess: number;
    readonly retentionMargin: number;
  };
  readonly planner: {
    readonly targetSuccess: number;
    readonly difficultyTolerance: number;
    readonly coalesce: boolean;
    readonly remediationWindowMs: number;
    readonly pretestNewSkills: boolean;
    readonly pretestStageIndex: number;
    readonly stageSeconds: Readonly<Record<StageId, number>>;
    readonly limits: {
      readonly maxNewSkills: number;
      readonly maxReviewBacklog: number;
      readonly maxRemediation: number;
      readonly maxSkillsPerTarget: number;
    };
  };
  readonly contexts: {
    readonly examsMoveSchedule: boolean;
    readonly diagnosticWeight: number;
    readonly pretestWeight: number;
  };
  readonly leechThreshold: number;
  readonly memoryWeightFloor: number;
  readonly itemCooldownMs: number;
  readonly itemUsageRetentionMs: number;
  readonly recentIdWindow: number;
  readonly acceptProofs: readonly CandidateProof['kind'][];
}

// ---------------------------------------------------------------------------
// §5.9 Result types of the graph functions
// ---------------------------------------------------------------------------

export type CheckResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export type GraphValidation =
  | { readonly ok: true; readonly graph: SkillGraph; readonly warnings: readonly Issue[] }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export type ItemsValidation =
  | {
      readonly ok: true;
      readonly items: readonly PracticeItem[];
      readonly warnings: readonly Issue[];
    }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export type GraphComposition =
  | { readonly ok: true; readonly graph: SkillGraph; readonly warnings: readonly Issue[] }
  | { readonly ok: false; readonly issues: readonly Issue[] };

// ---------------------------------------------------------------------------
// §5.9 The Practice object (R10.1) (M5)
// ---------------------------------------------------------------------------

/**
 * A configuration bound by `createPractice`: pure functions over the state and
 * the log, with no mutable state of its own. **(revised in M5)** `plan` arrives
 * in M6; `exportReviewHistory` is not implemented yet (design 13).
 */
export interface Practice {
  readonly config: ResolvedPracticeConfig;
  readonly configHash: string;
  /** The state of a learner with an empty log. */
  initState(learnerId: string, graph: SkillGraph): PracticeState;
  /** Records one piece of evidence (design 6.1). */
  record(state: PracticeState, input: RecordInput): RecordResult;
  /** Records one host action (R10.6), the same way. */
  act(state: PracticeState, graph: SkillGraph, input: HostActionInput): RecordResult;
  /** The live status of every graph skill at `now`; reads state, emits nothing. */
  status(state: PracticeState, graph: SkillGraph, now: number): LearnerSummary;
  /** The state a log gives from the start, sorted by `(at, seq)` (R5.3, R11.7). */
  replay(entries: readonly ReviewLogEntry[], graph: SkillGraph, learnerId: string): ReplayResult;
  /** `replay`, continued from a stored state with the entries it has not applied. */
  replayFrom(
    checkpoint: PracticeState,
    entries: readonly ReviewLogEntry[],
    graph: SkillGraph,
  ): ReplayResult;
  /** How the state's skills compare with a graph (R2.3); changes nothing. */
  reconcile(state: PracticeState, graph: SkillGraph): ReconcileReport;
}

export interface RecordInput {
  readonly graph: SkillGraph;
  readonly evidence: Evidence;
  /** Required unless the evidence only confirms held evidence. */
  readonly item?: PracticeItem;
}

export type RecordResult =
  | {
      readonly kind: 'applied';
      readonly state: PracticeState;
      readonly appended: readonly ReviewLogEntry[];
      readonly events: readonly PracticeEvent[];
    }
  | {
      readonly kind: 'replay-required';
      readonly appended: readonly ReviewLogEntry[];
      /** Replay from the newest checkpoint whose `log.lastAt` is earlier than this. */
      readonly replayFrom: number;
    }
  | { readonly kind: 'duplicate'; readonly events: readonly PracticeEvent[] }
  /** Nothing to append. */
  | { readonly kind: 'rejected'; readonly issues: readonly Issue[] };

export type ReplayResult =
  | {
      readonly ok: true;
      readonly state: PracticeState;
      readonly events: readonly PracticeEvent[];
    }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export type MigrationResult =
  | { readonly ok: true; readonly state: PracticeState; readonly migrated: boolean }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export interface ReconcileReport {
  readonly stateGraphVersion: string;
  readonly graphVersion: string;
  /** In the state, not in the graph; sorted. */
  readonly orphanedSkills: readonly string[];
  /** In the graph, with no state yet; graph order. */
  readonly newSkills: readonly string[];
  /** A memory for a stage the skill's ladder no longer has; sorted by skill, then stage. */
  readonly missingStages: readonly { readonly skillId: string; readonly stage: StageId }[];
}
