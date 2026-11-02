import { readdirSync, readFileSync, statSync } from 'node:fs';
import fc from 'fast-check';
import { DefaultScheduler } from 'ts-fsrs';
import { curve, FSRS7_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-7';
import { beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig, TS_FSRS_VERSION } from '../../config.js';
import type { FsrsOptions, Rating, ReviewContext } from '../../types.js';
import { createFsrsModel, FSRS_DEFAULT_PARAMS, type FsrsMemory, fsrsMemoryModel } from '../fsrs.js';

/** Relative tolerance for floats across platforms (R12.2). */
function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    1e-9 * Math.max(Math.abs(actual), Math.abs(expected)),
  );
}

interface VectorStep {
  readonly rating: Rating;
  readonly at: number;
  readonly retention?: number;
  readonly due: number;
  readonly memory: FsrsMemory;
  readonly retrievability: readonly { readonly at: number; readonly value: number }[];
}

interface VectorCase {
  readonly name: string;
  readonly options?: FsrsOptions;
  readonly retention: number;
  readonly steps: readonly VectorStep[];
}

const vectors = JSON.parse(
  readFileSync(new URL('../../../vectors/memory.json', import.meta.url), 'utf8'),
) as { readonly version: number; readonly library: string; readonly cases: readonly VectorCase[] };

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

function context(desiredRetention = 0.9): ReviewContext {
  return { desiredRetention };
}

const allMemories = vectors.cases.flatMap((c) => c.steps.map((s) => s.memory));

describe('vectors/memory.json', () => {
  it('was generated from the pinned library', () => {
    expect(vectors.version).toBe(1);
    expect(vectors.library).toBe(`ts-fsrs@${TS_FSRS_VERSION}`);
    expect(vectors.cases.length).toBeGreaterThan(20);
  });

  it('includes the spike intervals', () => {
    const intervals = (name: string) =>
      vectors.cases.find((c) => c.name === name)?.steps.map((s) => s.due - s.at);
    expect(intervals('new memory, again')).toEqual([60_000]);
    expect(intervals('new memory, good')?.[0]).toBeCloseTo(4.7777 * DAY, -5);
    expect(
      intervals('good three times, each at its due')?.map((ms) => Math.round(ms / DAY)),
    ).toEqual([5, 26, 92]);
    expect(intervals('a lapse after three goods, then good')?.[3]).toBeCloseTo(
      16.167 * 3_600_000,
      -5,
    );
  });

  for (const vector of vectors.cases) {
    it(vector.name, () => {
      const model = createFsrsModel(vector.options ?? {});
      let memory = model.init();
      for (const step of vector.steps) {
        const next = model.review(
          memory,
          step.rating,
          step.at,
          context(step.retention ?? vector.retention),
        );
        // R12.2: discrete fields and `due` exactly (Node 24), floats within a
        // relative 1e-9, since `Math.pow` rounds differently across platforms.
        expect(next.due).toBe(step.due);
        const { stabilityFast, stability, difficulty, ...discrete } = model.serialize(
          next.memory,
        ) as FsrsMemory;
        const expected = step.memory;
        expect(discrete).toEqual({
          state: expected.state,
          learningStep: expected.learningStep,
          scheduleStatus: expected.scheduleStatus,
          dueAt: expected.dueAt,
          lastReviewAt: expected.lastReviewAt,
        });
        expectClose(stabilityFast, expected.stabilityFast);
        expectClose(stability, expected.stability);
        expectClose(difficulty, expected.difficulty);
        for (const sample of step.retrievability) {
          expectClose(model.retrievability(next.memory, sample.at), sample.value);
        }
        memory = next.memory;
      }
    });
  }
});

describe('fsrsMemoryModel', () => {
  it('pins its defaults to the library it was written against', () => {
    const manifest = new URL('../../../node_modules/ts-fsrs/package.json', import.meta.url);
    expect(JSON.parse(readFileSync(manifest, 'utf8')).version).toBe(TS_FSRS_VERSION);
    expect(FSRS_DEFAULT_PARAMS.weights).toEqual(Array.from(FSRS7_DEFAULT_WEIGHTS));
    expect(FSRS_DEFAULT_PARAMS).toEqual({
      weights: FSRS_DEFAULT_PARAMS.weights,
      learningSteps: ['1m', '10m'],
      relearningSteps: ['10m'],
      maximumIntervalDays: 36500,
    });
    expect(Object.isFrozen(FSRS_DEFAULT_PARAMS.weights)).toBe(true);
  });

  it('has the reference the default configuration hashes', () => {
    const model = fsrsMemoryModel();
    expect({ id: model.id, version: model.version, params: model.params }).toEqual(
      defaultConfig().memoryModel,
    );
    expect(Object.isFrozen(model)).toBe(true);
  });

  it('resolves options into frozen params without keeping the caller arrays', () => {
    const steps = ['2m'];
    const model = fsrsMemoryModel({ learningSteps: steps, maximumIntervalDays: 400 });
    steps.push('5m');
    expect(model.params).toEqual({
      ...FSRS_DEFAULT_PARAMS,
      learningSteps: ['2m'],
      maximumIntervalDays: 400,
    });
    expect(Object.isFrozen((model.params as { learningSteps: string[] }).learningSteps)).toBe(true);
  });

  it('starts from a memory with no reviews', () => {
    const model = createFsrsModel({});
    const memory = model.init();
    expect(memory).toEqual({
      stabilityFast: 0,
      stability: 0,
      difficulty: 0,
      state: 0,
      learningStep: 0,
      scheduleStatus: 'new',
      dueAt: null,
      lastReviewAt: null,
    });
    expect(Object.isFrozen(memory)).toBe(true);
    expect(model.retrievability(memory, T0)).toBe(0);
  });

  it('returns frozen plain data and leaves its inputs alone', () => {
    const model = createFsrsModel({});
    const ctx = Object.freeze(context());
    const first = model.review(model.init(), 'good', T0, ctx);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.memory)).toBe(true);
    const before = JSON.stringify(first.memory);
    model.review(first.memory, 'again', first.due, ctx);
    expect(JSON.stringify(first.memory)).toBe(before);
    expect(model.serialize(first.memory)).not.toBe(first.memory);
  });

  it('computes retrievability with the scheduler curve', () => {
    const model = createFsrsModel({});
    for (const memory of allMemories.slice(0, 40)) {
      for (const days of [0, 0.5, 3, 40]) {
        const now = (memory.lastReviewAt ?? 0) + days * DAY;
        expect(model.retrievability(memory, now)).toBe(
          curve(FSRS7_DEFAULT_WEIGHTS, days, memory).retrievability,
        );
      }
    }
    // Before the last review the elapsed time counts as zero.
    const [memory] = allMemories;
    if (memory?.lastReviewAt == null) throw new Error('no memory');
    expect(model.retrievability(memory, memory.lastReviewAt - DAY)).toBe(
      model.retrievability(memory, memory.lastReviewAt),
    );
  });

  it('round-trips every vector memory through JSON', () => {
    const model = createFsrsModel({});
    for (const memory of [model.init(), ...allMemories]) {
      const back = model.deserialize(JSON.parse(JSON.stringify(model.serialize(memory))));
      expect(back).toEqual(memory);
      expect(Object.isFrozen(back)).toBe(true);
    }
  });

  it('rejects a malformed memory with a TypeError', () => {
    const model = createFsrsModel({});
    const good = allMemories[0] as FsrsMemory;
    const bad: unknown[] = [
      null,
      7,
      'memory',
      [],
      {},
      { ...good, extra: 1 },
      (({ difficulty: _, ...rest }) => rest)(good),
      { ...good, stability: Number.NaN },
      { ...good, stabilityFast: -1 },
      { ...good, difficulty: '3' },
      { ...good, state: 4 },
      { ...good, learningStep: -1 },
      { ...good, learningStep: 0.5 },
      { ...good, scheduleStatus: 'relearning' },
      { ...good, scheduleStatus: 3 },
      { ...good, dueAt: 1.5 },
      { ...good, lastReviewAt: '2026' },
      { ...good, lastReviewAt: null },
      { ...good, dueAt: null },
    ];
    for (const raw of bad)
      expect(() => model.deserialize(raw), JSON.stringify(raw)).toThrow(TypeError);
  });

  it('rejects malformed options when it is created', () => {
    const cases: [unknown, ErrorConstructor][] = [
      [null, TypeError],
      [[], TypeError],
      [{ fuzz: true }, TypeError],
      [{ weights: 'w' }, TypeError],
      [{ weights: [1, 2, 3] }, RangeError],
      [
        { weights: FSRS_DEFAULT_PARAMS.weights.map((w, i) => (i === 0 ? Number.NaN : w)) },
        RangeError,
      ],
      [{ weights: FSRS_DEFAULT_PARAMS.weights.map((w, i) => (i === 2 ? 1e6 : w)) }, RangeError],
      [{ learningSteps: '1m' }, TypeError],
      [{ learningSteps: [1] }, TypeError],
      [{ learningSteps: ['5x'] }, RangeError],
      [{ relearningSteps: ['-1m'] }, RangeError],
      [{ maximumIntervalDays: '30' }, TypeError],
      [{ maximumIntervalDays: 0 }, RangeError],
      [{ maximumIntervalDays: 1.5 }, RangeError],
    ];
    for (const [options, type] of cases) {
      let caught: unknown;
      try {
        fsrsMemoryModel(options as FsrsOptions);
      } catch (error) {
        caught = error;
      }
      expect(caught, JSON.stringify(options)).toBeInstanceOf(type);
      // A built-in error, never the library's own class.
      expect(Object.getPrototypeOf(caught)).toBe(type.prototype);
    }
  });

  it('rejects a bad review with a RangeError', () => {
    const model = createFsrsModel({});
    const first = model.review(model.init(), 'good', T0, context());
    expect(() => model.review(first.memory, 'good', T0 + 0.5, context())).toThrow(RangeError);
    expect(() => model.review(first.memory, 'good', Number.NaN, context())).toThrow(RangeError);
    expect(() => model.review(first.memory, 'perfect' as Rating, T0, context())).toThrow(
      RangeError,
    );
    expect(() => model.review(first.memory, 'good', T0 - DAY, context())).toThrow(RangeError);
    expect(() => model.review(first.memory, 'good', first.due, context(1.5))).toThrow(RangeError);
  });

  it('keeps one scheduler per retention value and gives the same output for the same input', () => {
    const model = createFsrsModel({});
    const a = model.review(model.init(), 'good', T0, context(0.8));
    const b = model.review(model.init(), 'good', T0, context(0.95));
    const c = model.review(model.init(), 'good', T0, context(0.8));
    expect(a.due).toBeGreaterThan(b.due);
    expect(c).toEqual(a);
  });
});

describe('fsrsMemoryModel properties', () => {
  const ratings = fc.constantFrom<Rating>('again', 'hard', 'good', 'easy');
  const gap = fc.oneof(
    fc.constant(-1),
    fc.integer({ min: 0, max: 10 * 60_000 }),
    fc.integer({ min: 0, max: 400 * DAY }),
  );
  const sequence = fc.array(fc.tuple(ratings, gap), { minLength: 1, maxLength: 12 });
  const retention = fc.constantFrom(0.7, 0.8, 0.9, 0.95, 0.97);
  let reference: Map<number, Awaited<ReturnType<typeof DefaultScheduler>>>;

  beforeAll(async () => {
    reference = new Map();
    for (const r of [0.7, 0.8, 0.9, 0.95, 0.97]) {
      reference.set(r, await DefaultScheduler({ enableFuzz: false, desiredRetention: r }));
    }
  });

  it('matches the library preset, and its output is well formed', () => {
    const model = createFsrsModel({});
    const grade = { again: 1, hard: 2, good: 3, easy: 4 } as const;
    fc.assert(
      fc.property(sequence, retention, (steps, r) => {
        const scheduler = reference.get(r);
        if (scheduler === undefined) throw new Error('no reference');
        let card = scheduler.newCard({ now: new Date(T0) });
        let memory = model.init();
        let at = T0;
        let due = T0;
        for (const [rating, wait] of steps) {
          at = wait < 0 ? Math.max(due, at) : at + wait;
          card = scheduler.review({
            card: card as never,
            grade: grade[rating],
            now: new Date(at),
          }).card;
          const next = model.review(memory, rating, at, context(r));
          expect(next.due).toBe(card.dueAt.getTime());
          expect(next.memory.stability).toBe(card.stability);
          expect(next.memory.difficulty).toBe(card.difficulty);
          expect(Number.isSafeInteger(next.due)).toBe(true);
          expect(next.due).toBeGreaterThan(at);
          expect(next.due - at).toBeLessThanOrEqual(36500 * DAY);
          const now = model.retrievability(next.memory, at);
          const later = model.retrievability(next.memory, next.due);
          expect(now).toBeLessThanOrEqual(1);
          expect(later).toBeGreaterThan(0);
          expect(later).toBeLessThanOrEqual(now);
          memory = model.deserialize(JSON.parse(JSON.stringify(model.serialize(next.memory))));
          due = next.due;
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('the ts-fsrs boundary', () => {
  it('is imported by src/memory/fsrs.ts only', () => {
    const root = new URL('../../', import.meta.url);
    const files: string[] = [];
    const walk = (dir: URL, rel: string) => {
      for (const name of readdirSync(dir)) {
        const url = new URL(name, dir);
        if (statSync(url).isDirectory()) {
          if (name !== '__tests__') walk(new URL(`${name}/`, dir), `${rel}${name}/`);
        } else if (name.endsWith('.ts')) files.push(`${rel}${name}`);
      }
    };
    walk(root, '');
    const importing = files.filter((file) =>
      /from '(ts-fsrs|@open-spaced-repetition)/.test(readFileSync(new URL(file, root), 'utf8')),
    );
    expect(importing).toEqual(['memory/fsrs.ts']);
  });
});
