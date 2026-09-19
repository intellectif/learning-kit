import type { ReadAloudData } from '@intellectif/lk-core';
import {
  READ_ALOUD_MAX_SECONDS,
  READ_ALOUD_MAX_TAKES,
  validateActivity,
} from '@intellectif/lk-core';
import { act, cleanup, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import { ReadAloud } from '../index.js';
import { readRecordingBounds, secondsWithin } from '../recording-bounds.js';

/**
 * C8's bounds, closed as a class rather than as the three shapes the
 * verifiers reported.
 *
 * `practice` renders a `recording` nothing validated, and each field used to be
 * read its own way at its own site: `maxSeconds` was clamped, `maxTakes` was
 * clamped only when it was a number — so `"1"` meant unlimited takes — and
 * `minSeconds` was not read at all, so a minimum above the maximum refused
 * every take the recorder stopped. The stop sentence rounded a fractional bound
 * past itself ("3 of 2.5 seconds"). Every one of those is this suite's input:
 * arbitrary JSON in place of the bounds, biased towards the near-misses.
 *
 * The reader's contract, for every input: bounds the schema accepts; bounds the
 * schema accepts read back unchanged; no present limit ever reads as no limit;
 * and no sentence names more seconds than the bound. Then the component, with
 * the same inputs: no error boundary, a takes note exactly when there is a
 * limit, no sentence past the bound, and a take that runs to its bound is never
 * refused as too short.
 */

const RUNS = runsFromEnvironment();

function runsFromEnvironment(): number {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.LK_PROPERTY_RUNS;
  const runs = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(runs) && runs > 0 ? runs : 150;
}

const item: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra-bounds',
  title: 'Read the sentence',
  referenceText: 'The weather is lovely today.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 3 },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

// ── Arbitraries ─────────────────────────────────────────────────────────────

/** Everything a stored bound has been seen as, the pathological values first. */
const oddValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(
    null,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -0,
    0,
    -1,
    1e9,
    '1',
    '20',
    '2.5',
    '',
    true,
    {},
    [],
    [1],
  ),
  fc.double(),
  fc.integer({ min: -50, max: 400 }),
  fc.string({ maxLength: 4 }),
);

/** Bounds as an author writes them: small enough that a take can run to them. */
const authored = fc.record(
  {
    maxSeconds: fc.oneof(
      fc.integer({ min: 1, max: 12 }),
      fc.double({ min: 0.2, max: 12, noNaN: true }),
    ),
    minSeconds: fc.oneof(
      fc.integer({ min: 0, max: 14 }),
      fc.double({ min: 0, max: 14, noNaN: true }),
    ),
    maxTakes: fc.oneof(
      fc.integer({ min: 1, max: 20 }),
      fc.double({ min: -2, max: 25, noNaN: true }),
    ),
  },
  { requiredKeys: ['maxSeconds'] },
);

const MISSING = Symbol('missing');

/** A written set of bounds, with any field swapped for an odd value or left out, or no object at all. */
const recording: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 3, arbitrary: authored },
  {
    weight: 5,
    arbitrary: authored.chain((bounds) =>
      fc
        .record({
          maxSeconds: fc.oneof(
            { weight: 3, arbitrary: fc.constant<unknown>(bounds.maxSeconds) },
            { weight: 1, arbitrary: oddValue },
            { weight: 1, arbitrary: fc.constant<unknown>(MISSING) },
          ),
          minSeconds: fc.oneof(
            { weight: 2, arbitrary: fc.constant<unknown>(bounds.minSeconds ?? MISSING) },
            { weight: 1, arbitrary: oddValue },
            { weight: 1, arbitrary: fc.constant<unknown>(MISSING) },
          ),
          maxTakes: fc.oneof(
            { weight: 2, arbitrary: fc.constant<unknown>(bounds.maxTakes ?? MISSING) },
            { weight: 1, arbitrary: oddValue },
            { weight: 1, arbitrary: fc.constant<unknown>(MISSING) },
          ),
        })
        .map((fields) =>
          Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== MISSING)),
        ),
    ),
  },
  { weight: 1, arbitrary: oddValue },
);

const schemaAccepts = (bounds: unknown): boolean =>
  validateActivity('read-aloud', { ...item, recording: bounds }).success;

// ── The reader ──────────────────────────────────────────────────────────────

describe('readRecordingBounds, over arbitrary stored bounds', () => {
  it('always reads bounds the schema accepts, and reads accepted bounds unchanged', () => {
    fc.assert(
      fc.property(recording, (input) => {
        const read = readRecordingBounds(input);
        const { maxSeconds, minSeconds, maxTakes } = read;

        // What comes out is always something the schema would accept.
        expect(Number.isFinite(maxSeconds) && maxSeconds > 0).toBe(true);
        expect(maxSeconds).toBeLessThanOrEqual(READ_ALOUD_MAX_SECONDS);
        if (minSeconds !== undefined) {
          expect(Number.isFinite(minSeconds) && minSeconds >= 0 && minSeconds < maxSeconds).toBe(
            true,
          );
        }
        if (maxTakes !== undefined) {
          expect(Number.isInteger(maxTakes)).toBe(true);
          expect(maxTakes).toBeGreaterThanOrEqual(1);
          expect(maxTakes).toBeLessThanOrEqual(READ_ALOUD_MAX_TAKES);
        }
        expect(
          schemaAccepts({
            maxSeconds,
            ...(minSeconds !== undefined ? { minSeconds } : {}),
            ...(maxTakes !== undefined ? { maxTakes } : {}),
          }),
        ).toBe(true);

        const fields =
          typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
        // A limit that was written, however badly, is never read as no limit.
        const takesWritten = fields.maxTakes !== undefined && fields.maxTakes !== null;
        expect(maxTakes !== undefined).toBe(takesWritten);

        // And bounds the schema accepts are the author's, untouched.
        if (schemaAccepts(input)) {
          expect(read).toEqual({
            maxSeconds: fields.maxSeconds,
            minSeconds: fields.minSeconds,
            maxTakes: fields.maxTakes,
          });
        }
      }),
      { numRuns: RUNS * 20 },
    );
  });

  it('never names more seconds than the bound, however long the audio', () => {
    fc.assert(
      fc.property(
        recording,
        fc.double({ min: 0, max: 2, noNaN: true }),
        fc.constantFrom('nearest', 'down') as fc.Arbitrary<'nearest' | 'down'>,
        (input, share, rounding) => {
          const { maxSeconds } = readRecordingBounds(input);
          const said = secondsWithin(share * maxSeconds * 1000, maxSeconds, rounding);
          expect(said).toBeGreaterThanOrEqual(0);
          expect(said).toBeLessThanOrEqual(maxSeconds);
          expect(Number.isInteger(said) || said === maxSeconds).toBe(true);
        },
      ),
      { numRuns: RUNS * 20 },
    );
  });
});

// ── The component ───────────────────────────────────────────────────────────

/**
 * A capture rate low enough that a take running to a 300-second ceiling stays
 * cheap enough to make in every run.
 */
const RATE = 4000;

async function settle(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve();
    }
  });
}

describe('<ReadAloud>, over arbitrary stored bounds', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('records to the bound it reads, says no more than it, and never refuses a take that ran to it', async () => {
    // Production: only there does a component render bounds nothing validated.
    // Development throws the schema error for them, which is its job.
    vi.stubEnv('NODE_ENV', 'production');
    await fc.assert(
      fc.asyncProperty(recording, async (input) => {
        const harness: SpeechCaptureHarness = stubSpeechCapture({ sampleRate: RATE });
        try {
          const read = readRecordingBounds(input);
          const { container } = render(
            <ReadAloud
              data={{ ...item, recording: input } as unknown as ReadAloudData}
              recordingBinding={{ upload: async (take) => ({ key: 'k', mimeType: take.mimeType }) }}
            />,
          );
          const recorder = container.querySelector('.lk-ra-recorder');
          expect(recorder, 'the recorder rendered').not.toBeNull();
          expect(container.textContent ?? '').not.toMatch(/could not be displayed|NaN|Infinity/);

          // A takes note exactly when there is a limit, and naming that limit.
          const note = container.querySelector('.lk-ra-takes');
          if (read.maxTakes === undefined) {
            expect(note).toBeNull();
          } else {
            expect(note?.textContent).toMatch(new RegExp(` of ${read.maxTakes} recordings? left$`));
          }

          // Run a take past its bound: the recorder must stop it there by itself.
          act(() => screen.getByRole('button', { name: 'Record' }).click());
          await settle();
          // Halfway, while it is still running, the counter stays inside the bound.
          const halfway = Math.floor((read.maxSeconds * RATE) / 2);
          act(() => harness.pushLevel(0.5, halfway));
          expect(recorder?.getAttribute('data-status')).toBe('recording');
          const progress = container.querySelector('.lk-ra-progress')?.textContent ?? '';
          const counted = /Recording: ([\d.]+) of ([\d.]+) seconds/.exec(progress);
          expect(counted, `the counter: "${progress}"`).not.toBeNull();
          expect(Number(counted?.[1])).toBeLessThanOrEqual(read.maxSeconds);
          act(() => harness.pushLevel(0.5, Math.ceil(read.maxSeconds * RATE) + RATE - halfway));
          await settle();

          // It ran to its bound, so it is a take — never "too short".
          expect(recorder?.getAttribute('data-status')).toBe('recorded');
          expect(container.querySelector('[role="alert"]')).toBeNull();
          const stopped = container.querySelector('[aria-live]')?.textContent ?? '';
          const said = /Recording stopped\. ([\d.]+) of ([\d.]+) seconds recorded\./.exec(stopped);
          expect(said, `the stop sentence: "${stopped}"`).not.toBeNull();
          expect(Number(said?.[1])).toBeLessThanOrEqual(read.maxSeconds);
          expect(Number(said?.[2])).toBe(read.maxSeconds);
        } finally {
          cleanup();
          harness.restore();
        }
      }),
      { numRuns: Math.max(10, Math.floor(RUNS / 3)) },
    );
  }, 300_000);
});
