/**
 * The default memory model (design §8.4, R4): FSRS-7 on ts-fsrs 6.0.0. This is
 * the only module that imports ts-fsrs. No ts-fsrs type appears in the public
 * API: the memory is plain data with the field list below, and every library
 * error is rethrown as a built-in `TypeError` or `RangeError`.
 *
 * The scheduler is built with the synchronous API, not the async
 * `DefaultScheduler`, and with only the middleware whose output it needs:
 * desired retention, learning steps, maximum interval, and monotonic interval.
 * Each option of the library's FSRS-7 preset is written out here, so a library
 * upgrade cannot change the behaviour silently (R4.5); the memory vectors are
 * generated with `DefaultScheduler` and pin that the two agree.
 */

import { dateChrono, defineScheduler, Rating as FsrsRating } from 'ts-fsrs';
import {
  schedulerDesiredRetentionMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
} from 'ts-fsrs/middlewares';
import { checkFSRS7Parameters, curve, FSRS7Model } from 'ts-fsrs/models/fsrs-7';
import type {
  FsrsOptions,
  JsonValue,
  MemoryModel,
  MemoryReview,
  Rating,
  ReviewContext,
} from '../types.js';

const DAY_MS = 86_400_000;

/**
 * The FSRS-7 memory of one skill and stage: plain, frozen numbers and strings,
 * which is also its serialized form (§8.4). Times are integer epoch ms.
 */
export interface FsrsMemory {
  readonly stabilityFast: number;
  readonly stability: number;
  readonly difficulty: number;
  /** 0 new, 1 learning, 2 review, 3 relearning. */
  readonly state: 0 | 1 | 2 | 3;
  /** The index of the next learning or relearning step. */
  readonly learningStep: number;
  readonly scheduleStatus: 'new' | 'learning' | 'review';
  /** Null before the first review. */
  readonly dueAt: number | null;
  /** Null before the first review. */
  readonly lastReviewAt: number | null;
}

/** The resolved options; `MemoryModel.params` and the configuration hash see exactly this. */
export interface FsrsParams {
  readonly weights: readonly number[];
  readonly learningSteps: readonly string[];
  readonly relearningSteps: readonly string[];
  readonly maximumIntervalDays: number;
}

/**
 * The defaults, pinned in the package (R4.5). The weights are the 34 FSRS-7
 * defaults of ts-fsrs 6.0.0, copied; a test checks they still match the library.
 */
export const FSRS_DEFAULT_PARAMS: FsrsParams = deepFreeze({
  weights: [
    0.1104, 2.2395, 3.9221, 11.7841, 6.1686, 0.6457, 3.6807, 1.9795, 0, 1.3826, 0.7024, 0.5999,
    0.8146, 0.6398, 1, 1.3207, 0.6707, 3.8668, 0.4416, 0.0934, 1.8631, 0.6162, 1.0869, 0.1567,
    0.0801, 0.2421, 0.9464, 0.1433, 0.7145, 0, 0.5667, 0.3734, 0.5333, 0.3048,
  ],
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
  maximumIntervalDays: 36500,
});

type Grade = Exclude<FsrsRating, typeof FsrsRating.Manual>;

const GRADES: Readonly<Record<Rating, Grade>> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

const OPTION_KEYS: ReadonlySet<string> = new Set([
  'weights',
  'learningSteps',
  'relearningSteps',
  'maximumIntervalDays',
]);

const MEMORY_KEYS: readonly (keyof FsrsMemory)[] = [
  'stabilityFast',
  'stability',
  'difficulty',
  'state',
  'learningStep',
  'scheduleStatus',
  'dueAt',
  'lastReviewAt',
];

const STATUSES: ReadonlySet<string> = new Set(['new', 'learning', 'review']);

const INIT: FsrsMemory = Object.freeze({
  stabilityFast: 0,
  stability: 0,
  difficulty: 0,
  state: 0,
  learningStep: 0,
  scheduleStatus: 'new',
  dueAt: null,
  lastReviewAt: null,
});

/** The library validates the steps when the scheduler is created. */
type Step = `${number}${'m' | 'h' | 'd'}`;

function createScheduler(params: FsrsParams, desiredRetention: number) {
  return defineScheduler({ model: FSRS7Model, chrono: dateChrono })
    .use(schedulerDesiredRetentionMiddleware)
    .use(schedulerLearningStepsMiddleware)
    .use(schedulerMaximumIntervalMiddleware)
    .use(schedulerMonotonicIntervalMiddleware)
    .create({
      config: {
        weights: [...params.weights],
        fractionalDays: true,
        enableShortTerm: true,
        allowModelOverride: true,
        graduatingInterval: 1,
        desiredRetention,
        learningSteps: [...params.learningSteps] as Step[],
        relearningSteps: [...params.relearningSteps] as Step[],
        maximumInterval: params.maximumIntervalDays,
      },
    });
}

type Scheduler = ReturnType<typeof createScheduler>;

/**
 * The default memory model. Throws `TypeError` or `RangeError` when an option
 * is malformed or out of the library's bounds (R4.9a). Its memory is an
 * `FsrsMemory`, typed `unknown` in the public API like any other model's.
 */
export function fsrsMemoryModel(options?: FsrsOptions): MemoryModel {
  return createFsrsModel(options === undefined ? {} : options) as MemoryModel;
}

/** `fsrsMemoryModel` with its memory type; internal, for the package and its tests. */
export function createFsrsModel(options: FsrsOptions): MemoryModel<FsrsMemory> {
  const params = resolveParams(options);
  const schedulers = new Map<number, Scheduler>();
  const schedulerFor = (desiredRetention: number): Scheduler => {
    let scheduler = schedulers.get(desiredRetention);
    if (scheduler === undefined) {
      scheduler = rethrow(() => createScheduler(params, desiredRetention), 'the review context');
      schedulers.set(desiredRetention, scheduler);
    }
    return scheduler;
  };
  // Validates the steps and maximum interval once, with the default retention.
  schedulerFor(0.9);

  return Object.freeze({
    id: 'fsrs-7',
    version: 1,
    params: params as unknown as JsonValue,
    init: () => INIT,
    retrievability(memory: FsrsMemory, now: number): number {
      if (memory.lastReviewAt === null) return 0;
      // `curve` treats a negative elapsed time as zero.
      return curve(params.weights, (now - memory.lastReviewAt) / DAY_MS, memory).retrievability;
    },
    review(
      memory: FsrsMemory,
      rating: Rating,
      now: number,
      context: ReviewContext,
    ): MemoryReview<FsrsMemory> {
      if (!Number.isSafeInteger(now))
        throw new RangeError('lk-practice: now must be integer epoch ms.');
      const grade = GRADES[rating];
      if (grade === undefined)
        throw new RangeError(`lk-practice: unknown rating ${String(rating)}.`);
      const scheduler = schedulerFor(context.desiredRetention);
      const card = rethrow(
        () =>
          scheduler.review({
            card: {
              stabilityFast: memory.stabilityFast,
              stability: memory.stability,
              difficulty: memory.difficulty,
              state: memory.state,
              learningStep: memory.learningStep,
              scheduleStatus: memory.scheduleStatus,
              dueAt: toDate(memory.dueAt ?? now),
              lastReviewAt: memory.lastReviewAt === null ? null : toDate(memory.lastReviewAt),
            },
            grade,
            now: toDate(now),
          }).card,
        'the review',
      );
      const dueAt = Math.floor(card.dueAt.getTime() + 0.5);
      const next: FsrsMemory = Object.freeze({
        stabilityFast: card.stabilityFast,
        stability: card.stability,
        difficulty: card.difficulty,
        state: card.state as FsrsMemory['state'],
        learningStep: card.learningStep,
        scheduleStatus: card.scheduleStatus as FsrsMemory['scheduleStatus'],
        dueAt,
        lastReviewAt: now,
      });
      return Object.freeze({ memory: next, due: dueAt });
    },
    serialize: (memory: FsrsMemory): unknown => ({ ...memory }),
    deserialize: readMemory,
  });
}

/** Dates exist only at the library boundary; the time always comes in as an argument. */
function toDate(ms: number) {
  // biome-ignore lint/style/noRestrictedGlobals: converts an argument, reads no clock (design §9).
  return new Date(ms);
}

function rethrow<T>(run: () => T, what: string): T {
  try {
    return run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RangeError(`lk-practice: the FSRS-7 library rejected ${what}: ${message}`);
  }
}

function resolveParams(options: FsrsOptions): FsrsParams {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('lk-practice: FSRS options must be an object.');
  }
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.has(key)) throw new TypeError(`lk-practice: unknown FSRS option ${key}.`);
  }
  const weights = readArray(options.weights, FSRS_DEFAULT_PARAMS.weights, 'weights', 'number');
  rethrow(() => checkFSRS7Parameters(weights), 'the weights');
  const maximumIntervalDays =
    options.maximumIntervalDays ?? FSRS_DEFAULT_PARAMS.maximumIntervalDays;
  if (typeof maximumIntervalDays !== 'number') {
    throw new TypeError('lk-practice: FSRS option maximumIntervalDays must be a number.');
  }
  return deepFreeze({
    weights,
    learningSteps: readArray(
      options.learningSteps,
      FSRS_DEFAULT_PARAMS.learningSteps,
      'learningSteps',
      'string',
    ),
    relearningSteps: readArray(
      options.relearningSteps,
      FSRS_DEFAULT_PARAMS.relearningSteps,
      'relearningSteps',
      'string',
    ),
    maximumIntervalDays,
  });
}

function readArray<T extends number | string>(
  value: readonly T[] | undefined,
  fallback: readonly T[],
  name: string,
  type: 'number' | 'string',
): T[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === type)) {
    throw new TypeError(`lk-practice: FSRS option ${name} must be an array of ${type}s.`);
  }
  return [...value];
}

function readMemory(raw: unknown): FsrsMemory {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new TypeError('lk-practice: an FSRS-7 memory must be an object.');
  }
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== MEMORY_KEYS.length ||
    !MEMORY_KEYS.every((key) => Object.hasOwn(record, key))
  ) {
    throw new TypeError(
      `lk-practice: an FSRS-7 memory has exactly the fields ${MEMORY_KEYS.join(', ')}.`,
    );
  }
  const {
    stabilityFast,
    stability,
    difficulty,
    state,
    learningStep,
    scheduleStatus,
    dueAt,
    lastReviewAt,
  } = record;
  const finite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const time = (value: unknown): value is number | null =>
    value === null || Number.isSafeInteger(value);
  if (
    !finite(stabilityFast) ||
    !finite(stability) ||
    !finite(difficulty) ||
    (state !== 0 && state !== 1 && state !== 2 && state !== 3) ||
    !Number.isSafeInteger(learningStep) ||
    (learningStep as number) < 0 ||
    typeof scheduleStatus !== 'string' ||
    !STATUSES.has(scheduleStatus) ||
    !time(dueAt) ||
    !time(lastReviewAt) ||
    (dueAt === null) !== (lastReviewAt === null)
  ) {
    throw new TypeError('lk-practice: an FSRS-7 memory field has the wrong type or range.');
  }
  return Object.freeze({
    stabilityFast,
    stability,
    difficulty,
    state,
    learningStep: learningStep as number,
    scheduleStatus: scheduleStatus as FsrsMemory['scheduleStatus'],
    dueAt,
    lastReviewAt,
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}
