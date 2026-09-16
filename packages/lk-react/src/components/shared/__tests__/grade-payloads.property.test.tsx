import type { ActivityResult, ReadAloudData, SpeechAssessment } from '@intellectif/lk-core';
import { validateXAPIStatement } from '@intellectif/lk-core';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import fc from 'fast-check';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import { ActivitySequence } from '../../ActivitySequence/index.js';
import { PronunciationFeedback } from '../../PronunciationFeedback/index.js';
import { ReadAloud } from '../../ReadAloud/index.js';
import type { ReadAloudAssessResult } from '../../ReadAloud/ReadAloud.js';

/**
 * C1 closed as a class, not as a list of shapes.
 *
 * Nothing validates a grade, an outcome or an assess result that arrives from
 * a host, and every render path used to dereference them its own way — so each
 * guard added for one shape left its sibling open: `criteria: null` guarded and
 * `criteria: [null]` not, `details` guarded and `feedback` as an object not, a
 * numeric `score` guarded and a string `maxScore` not. Every one of those is
 * this suite's input: arbitrary JSON in place of the grade, the outcome and the
 * assess result, biased towards the near-misses that broke — a well-formed
 * payload with any field swapped for a null, a string, a numeric string, an
 * object, an array, `NaN`, an infinity, a negative or a huge number, or left
 * out.
 *
 * And for every one of them, in `practice`, in `review` and in a sequence
 * slot: no error boundary, no `NaN` or infinity in what the SDK wrote, no
 * percentage outside 0–100, the screen never both scores a take and says it
 * could not be graded, every statement built passes `validateXAPIStatement`,
 * and the score a host is told is the score on screen.
 */

const RUNS = runsFromEnvironment();

function runsFromEnvironment(): number {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.LK_PROPERTY_RUNS;
  const runs = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(runs) && runs > 0 ? runs : 150;
}

/**
 * Each run mounts a real component and, in `practice`, records and submits a
 * take through the fake capture stack. CPU-bound work proportional to the run
 * count, sized for a shared CI runner rather than for a development machine.
 */
const PROPERTY_TIMEOUT_MS = 300_000;

const data: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra-prop',
  title: 'Read the sentence',
  referenceText: 'The weather is lovely today.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 5 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

const assessment: SpeechAssessment = {
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-US',
  referenceText: data.referenceText,
  recordingKey: 'take-1',
  assessor: { kind: 'auto', id: 'engine-1' },
  scale: 100,
  scores: { accuracy: 88, fluency: 72 },
  recognizedText: 'the weather is lonely today',
  miscue: 'assessor',
  words: [
    { text: 'The', accuracy: 95, error: 'none' },
    { text: 'weather', accuracy: 90, error: 'none' },
    { text: 'is', accuracy: 90, error: 'none' },
    { text: 'lonely', accuracy: 41, error: 'mispronunciation' },
    { text: 'today', accuracy: 85, error: 'none' },
  ],
};

// ── Arbitraries ─────────────────────────────────────────────────────────────

/** Numbers a backend can put anywhere a number goes, the pathological ones first. */
const anyNumber = fc.oneof(
  fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -0,
    0,
    1,
    100,
    -1,
    1e308,
    -1e308,
    Number.MIN_VALUE,
  ),
  fc.double(),
  fc.integer({ min: -1000, max: 1000 }),
);

/** Strings, and the numeric strings a database column serialises a number as. */
const anyString = fc.oneof(
  fc.constantFrom('100', '82', '0.82', '1', '', 'NaN', 'Infinity', '-5', '1e3', 'true', 'null'),
  fc.double().map(String),
  fc.string({ maxLength: 12 }),
);

/** Arbitrary JSON: every shape a payload can be, nested. */
const json: fc.Arbitrary<unknown> = fc.letrec<{ value: unknown }>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant(null),
    fc.constant(undefined),
    fc.boolean(),
    anyNumber,
    anyString,
    fc.array(tie('value'), { maxLength: 3 }),
    fc.dictionary(fc.string({ maxLength: 6 }), tie('value'), { maxKeys: 3 }),
  ),
})).value;

type Payload = Record<string, unknown>;

/** Marks a field the near-miss generator leaves out. */
const MISSING = Symbol('missing');

/**
 * The near-miss generator: a well-formed payload as it is, the same payload
 * with any of its fields swapped for arbitrary JSON or left out, or arbitrary
 * JSON in its place. Mangling each field independently almost never lines up
 * into a payload that CAN be read, and a property that never sees one proves
 * only that refusals are refused.
 */
function nearMiss(valid: fc.Arbitrary<Payload>): fc.Arbitrary<unknown> {
  const mutated = valid.chain((payload) =>
    fc
      .record(
        Object.fromEntries(
          Object.entries(payload).map(([key, field]) => [
            key,
            fc.oneof(
              { weight: 4, arbitrary: fc.constant<unknown>(field) },
              { weight: 1, arbitrary: json },
              { weight: 1, arbitrary: fc.constant<unknown>(MISSING) },
            ),
          ]),
        ),
      )
      .map((fields) =>
        Object.fromEntries(Object.entries(fields).filter(([, field]) => field !== MISSING)),
      ),
  );
  return fc.oneof(
    { weight: 2, arbitrary: valid },
    { weight: 5, arbitrary: mutated },
    { weight: 1, arbitrary: json },
  );
}

const DIMENSION = fc.constantFrom('accuracy', 'fluency', 'completeness', 'prosody', 'overall');

/** A score and the maximum it is out of: a fraction of 1, or points out of 100. */
const scorePair = fc.oneof(
  fc.record({ score: fc.double({ min: 0, max: 1, noNaN: true }), maxScore: fc.constant(1) }),
  fc.record({ score: fc.integer({ min: 0, max: 100 }), maxScore: fc.constant(100) }),
);

const criterion = nearMiss(
  fc.oneof(
    scorePair.chain(({ score, maxScore }) =>
      fc.record({
        name: DIMENSION,
        score: fc.constant(score),
        maxScore: fc.constant(maxScore),
        weight: fc.integer({ min: 1, max: 3 }),
      }),
    ),
    fc.record({ name: DIMENSION, notApplicable: fc.constant(true) }),
  ),
);

const detail = nearMiss(
  fc.record({
    itemId: fc.constantFrom('w1', 'w2', 'w3', 'overall'),
    correct: fc.boolean(),
    outcome: fc.constantFrom('correct', 'incorrect', 'incorrect-omission', 'correct-omission'),
    learnerResponse: fc.oneof(fc.string({ maxLength: 8 }), fc.array(fc.string({ maxLength: 8 }))),
    correctResponse: fc.oneof(fc.string({ maxLength: 8 }), fc.array(fc.string({ maxLength: 8 }))),
    weight: fc.constant(1),
    score: fc.double({ min: 0, max: 1, noNaN: true }),
  }),
);

const validGrade: fc.Arbitrary<Payload> = scorePair.chain(({ score, maxScore }) =>
  fc.record({
    score: fc.constant(score),
    maxScore: fc.constant(maxScore),
    passed: fc.boolean(),
    feedback: fc.oneof(fc.string({ maxLength: 20 }), fc.constant(null)),
    criteria: fc.array(criterion, { maxLength: 4 }),
    details: fc.array(detail, { maxLength: 4 }),
  }),
);

const grade = nearMiss(validGrade);

const outcome = nearMiss(
  fc.oneof(
    // What `outcomeFromGrade` writes: the grade, and its numbers mirrored.
    validGrade.chain((stored) =>
      fc.record({
        status: fc.constant('graded'),
        grade: nearMiss(fc.constant(stored)),
        score: fc.constant(stored.score),
        maxScore: fc.constant(stored.maxScore),
        passed: fc.constant(stored.passed),
        feedback: fc.constant(stored.feedback),
      }),
    ),
    validGrade.map(({ criteria: _criteria, ...stored }) => ({ status: 'scored', ...stored })),
    fc.constant<Payload>({ status: 'deferred', reason: 'requires_async_grading', maxScore: 1 }),
    fc.record({
      status: fc.constant('unscorable'),
      reason: fc.string({ maxLength: 8 }),
      maxScore: fc.constant(1),
      code: fc.string({ maxLength: 8 }),
    }),
  ),
);

/**
 * Evidence: the real thing; a refused variant whose `scale` and `scores` may
 * be anything, which production still reads its dimension rows from; or
 * anything at all.
 */
const anyAssessment = fc.oneof(
  { weight: 3, arbitrary: fc.constant<unknown>(assessment) },
  {
    weight: 2,
    arbitrary: fc
      .record({
        scale: fc.oneof(fc.constant(100), anyNumber),
        scores: fc.oneof(json, fc.dictionary(DIMENSION, fc.oneof(anyNumber, json), { maxKeys: 5 })),
      })
      .map((swap) => ({ ...assessment, ...swap })),
  },
  { weight: 2, arbitrary: json },
);

/** Evidence that a development build must not throw over: valid, or not an object at all. */
const unthrowingAssessment = fc.oneof(
  { weight: 3, arbitrary: fc.constant<unknown>(assessment) },
  {
    weight: 1,
    arbitrary: fc.oneof(fc.constant(null), fc.constant(undefined), anyNumber, anyString),
  },
);

const assessResult = (mode: Mode): fc.Arbitrary<unknown> => {
  const results = nearMiss(
    fc.oneof(
      {
        weight: 3,
        arbitrary: fc.record({
          status: fc.constant('graded'),
          assessment: mode === 'production' ? anyAssessment : unthrowingAssessment,
          grade,
        }),
      },
      {
        weight: 1,
        arbitrary: fc.record({
          status: fc.constant('unscorable'),
          code: fc.constantFrom('no_speech', 'house_policy'),
        }),
      },
      {
        weight: 1,
        arbitrary: fc.record({ status: fc.constant('failed'), retryable: fc.boolean() }),
      },
    ),
  );
  if (mode === 'production') {
    return results;
  }
  // A near-miss may swap the evidence for an object the validator refuses,
  // which development throws over by design; put the real evidence back.
  return results.map((result) =>
    typeof result === 'object' &&
    result !== null &&
    typeof (result as Payload).assessment === 'object' &&
    (result as Payload).assessment !== null &&
    (result as Payload).assessment !== assessment
      ? { ...(result as Payload), assessment }
      : result,
  );
};

// ── What must hold ──────────────────────────────────────────────────────────

type Mode = 'production' | 'development';

/** Host text the SDK renders verbatim and never computes: a grader's own words. */
const HOST_WORDS = '.lk-pf-grade-feedback, .lk-ra-grade-feedback, [aria-live] span[dir="auto"]';

const SCORE = /Score (\d+)%/;

interface Observed {
  scored: boolean;
  couldNotBeGraded: boolean;
  /** Whether the screen gives the learner any answer at all about the take. */
  answered: boolean;
}

/**
 * Every sentence that answers "what happened to my take?". A payload the
 * reader refuses must still produce one of them: a blank reads as a grade that
 * is still on its way.
 */
const ANSWERS = [
  SCORE,
  /could not be graded/,
  /waiting for its grade/,
  /could not hear you/,
  /could not be assessed/,
  /could not be checked/,
];

/** Whether a host sent anything at all in a slot where a payload is optional. */
const sent = (payload: unknown): boolean => payload !== undefined && payload !== null;

/** The invariants every render of every payload keeps. */
function assertSane(root: HTMLElement): Observed {
  for (const alert of root.querySelectorAll('[role="alert"]')) {
    expect(alert.textContent).not.toMatch(/could not be displayed|Activity failed to render/);
  }
  let written = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest(HOST_WORDS)) {
      continue;
    }
    const text = node.textContent ?? '';
    written += ` ${text}`;
    expect(text).not.toMatch(/NaN|Infinity/);
    for (const match of text.matchAll(/(\S*?)(-?[\d.]+(?:e[+-]?\d+)?)%/gi)) {
      const percent = Number(match[2]);
      expect({ text, percent, inRange: percent >= 0 && percent <= 100 }).toMatchObject({
        inRange: true,
      });
    }
  }
  const observed = {
    scored: SCORE.test(written),
    couldNotBeGraded: written.includes('could not be graded'),
    answered: ANSWERS.some((answer) => answer.test(written)),
  };
  // One reader, one answer: a take is never both scored and ungradeable on one screen.
  expect(observed.scored && observed.couldNotBeGraded).toBe(false);
  return observed;
}

/** Validates in development, where `validateXAPIStatement` throws instead of warning. */
function assertValidStatement(result: ActivityResult, mode: Mode): void {
  vi.stubEnv('NODE_ENV', 'development');
  try {
    expect(() => validateXAPIStatement(result.xapiStatement)).not.toThrow();
  } finally {
    vi.stubEnv('NODE_ENV', mode);
  }
}

/** What a host is told, checked against itself and against the screen. */
function assertReported(results: readonly ActivityResult[], root: HTMLElement, mode: Mode): void {
  for (const result of results) {
    expect(Number.isFinite(result.score)).toBe(true);
    expect(Number.isFinite(result.maxScore)).toBe(true);
    expect(result.maxScore).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(result.maxScore);
    expect(typeof result.passed).toBe('boolean');
    assertValidStatement(result, mode);
    const scaled = result.xapiStatement.result?.score?.scaled;
    expect(scaled).toBeCloseTo(result.score / result.maxScore, 10);
    expect(result.xapiStatement.result?.success).toBe(result.passed);
    // The score reported is the score on screen.
    expect(root.textContent).toContain(
      `Score ${Math.round((result.score / result.maxScore) * 100)}%`,
    );
  }
}

let harness: SpeechCaptureHarness | undefined;

afterEach(() => {
  cleanup();
  harness?.restore();
  harness = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve();
    }
  });
}

/** Records one take in `scope`, stops it and submits it. */
async function recordAndSubmit(scope: HTMLElement): Promise<void> {
  const capture = harness as SpeechCaptureHarness;
  const inside = within(scope);
  fireEvent.click(inside.getByRole('button', { name: /^Record/ }));
  await flush();
  act(() => {
    capture.pushLevel(0.5, capture.sampleRate * 2);
  });
  fireEvent.click(inside.getByRole('button', { name: 'Stop recording' }));
  await flush();
  fireEvent.click(inside.getByRole('button', { name: 'Submit' }));
  await flush();
}

const upload = async () => ({ key: 'take-1', mimeType: 'audio/wav' });

/** Mounts one render for one run, with the environment every run starts from. */
function mount(mode: Mode, tree: ReactElement): HTMLElement {
  cleanup();
  harness?.restore();
  harness = stubSpeechCapture();
  vi.stubEnv('NODE_ENV', mode);
  return render(tree).container;
}

/** Counts which side of the reader each run landed on, so a property that never scored is caught. */
function tally(): { add(observed: Observed): void; check(): void } {
  const seen = { scored: 0, couldNotBeGraded: 0 };
  return {
    add: (observed) => {
      seen.scored += observed.scored ? 1 : 0;
      seen.couldNotBeGraded += observed.couldNotBeGraded ? 1 : 0;
    },
    check: () => {
      expect(seen.scored).toBeGreaterThan(0);
      expect(seen.couldNotBeGraded).toBeGreaterThan(0);
    },
  };
}

function quiet(): { warnings: () => string[] } {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  return { warnings: () => warn.mock.calls.map((call) => String(call[0])) };
}

describe.each(['production', 'development'] as const)('any grade payload, in %s', (mode) => {
  // Development throws for evidence `validateSpeechAssessment` refuses, by
  // design (D2), so there the evidence is valid or not an object at all; every
  // other payload is as arbitrary as in production.
  const evidence = mode === 'production' ? anyAssessment : unthrowingAssessment;

  it(
    'practice: the assess result is read once, for the screen, onComplete and the statement',
    async () => {
      const logs = quiet();
      const seen = tally();
      await fc.assert(
        fc.asyncProperty(assessResult(mode), async (result) => {
          const reported: ActivityResult[] = [];
          const root = mount(
            mode,
            <ReadAloud
              data={data}
              recordingBinding={{
                upload,
                assess: async () => result as ReadAloudAssessResult,
              }}
              onComplete={(completed) => reported.push(completed)}
            />,
          );
          await recordAndSubmit(root);
          const observed = assertSane(root);
          seen.add(observed);
          assertReported(reported, root, mode);
          // Reported exactly when a score is shown, and never a blank.
          expect(reported.length).toBe(observed.scored ? 1 : 0);
          expect(observed.answered).toBe(true);
        }),
        { numRuns: RUNS },
      );
      seen.check();
      expect(logs.warnings().filter((w) => w.includes('Invalid xAPI statement'))).toEqual([]);
    },
    PROPERTY_TIMEOUT_MS,
  );

  it(
    'review: the stored outcome and its evidence render one answer',
    async () => {
      quiet();
      const seen = tally();
      await fc.assert(
        fc.asyncProperty(
          outcome,
          fc.oneof(
            fc.constant(undefined),
            mode === 'production' ? anyAssessment : unthrowingAssessment,
          ),
          async (stored, kept) => {
            const root = mount(
              mode,
              <ReadAloud
                data={data}
                renderMode="review"
                value={{ type: 'read-aloud', recording: { key: 'take-1', mimeType: 'audio/wav' } }}
                outcome={stored as never}
                {...(kept !== undefined ? { assessment: kept as SpeechAssessment } : {})}
              />,
            );
            await flush();
            const observed = assertSane(root);
            seen.add(observed);
            if (sent(stored)) {
              expect(observed.answered).toBe(true);
            }
          },
        ),
        { numRuns: RUNS },
      );
      seen.check();
    },
    PROPERTY_TIMEOUT_MS,
  );

  it(
    'a sequence slot: practice and review, through the pager',
    async () => {
      const logs = quiet();
      const seen = tally();
      await fc.assert(
        fc.asyncProperty(assessResult(mode), outcome, evidence, async (result, stored, kept) => {
          const perItem: ActivityResult[] = [];
          const perSet: ActivityResult[] = [];
          const practice = mount(
            mode,
            <ActivitySequence
              activities={[data]}
              recordingBinding={{ upload, assess: async () => result as ReadAloudAssessResult }}
              onActivityComplete={(completed) => perItem.push(completed)}
              onComplete={(results) => perSet.push(...results)}
            />,
          );
          await recordAndSubmit(practice);
          const observed = assertSane(practice);
          seen.add(observed);
          assertReported(perItem, practice, mode);
          assertReported(perSet, practice, mode);
          expect(perItem.length).toBe(observed.scored ? 1 : 0);
          expect(observed.answered).toBe(true);

          const review = mount(
            mode,
            <ActivitySequence
              activities={[data]}
              renderMode="review"
              outcomes={{ '0': stored as never }}
              {...(kept !== undefined ? { assessments: { '0': kept as SpeechAssessment } } : {})}
            />,
          );
          await flush();
          const reviewed = assertSane(review);
          seen.add(reviewed);
          if (sent(stored)) {
            expect(reviewed.answered).toBe(true);
          }
        }),
        { numRuns: RUNS },
      );
      seen.check();
      expect(logs.warnings().filter((w) => w.includes('Invalid xAPI statement'))).toEqual([]);
    },
    PROPERTY_TIMEOUT_MS,
  );

  it(
    'the panel on its own: any grade beside any evidence',
    async () => {
      quiet();
      const seen = tally();
      // `assessment` is required here, and D2 throws in development for any
      // evidence the validator refuses — so development gets the real thing.
      const panelEvidence = mode === 'production' ? anyAssessment : fc.constant(assessment);
      await fc.assert(
        fc.asyncProperty(grade, panelEvidence, async (given, kept) => {
          const root = mount(
            mode,
            <PronunciationFeedback
              data={{ referenceText: data.referenceText, locale: data.locale }}
              assessment={kept as SpeechAssessment}
              grade={given as never}
            />,
          );
          const observed = assertSane(root);
          seen.add(observed);
          if (sent(given)) {
            expect(observed.scored || observed.couldNotBeGraded).toBe(true);
          }
        }),
        { numRuns: RUNS },
      );
      seen.check();
    },
    PROPERTY_TIMEOUT_MS,
  );
});
