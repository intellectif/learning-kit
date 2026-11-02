// Writes vectors/memory.json from the pinned ts-fsrs (criterion 3, design 8.4).
// The reference is the library's own FSRS-7 preset, `DefaultScheduler`, with
// fuzz off, not the package's adapter, so the vectors check the adapter
// against the library. Run with `pnpm vectors:memory` after a ts-fsrs change,
// then review the diff: a changed output is a new memory model version.
import { readFileSync, writeFileSync } from 'node:fs';
import { DefaultScheduler } from 'ts-fsrs';

const manifest = new URL('../node_modules/ts-fsrs/package.json', import.meta.url);
const LIBRARY = `ts-fsrs@${JSON.parse(readFileSync(manifest, 'utf8')).version}`;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

/** Deterministic: mulberry32, so the file is the same on every run. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRADE = { again: 1, hard: 2, good: 3, easy: 4 };

function toMemory(card) {
  return {
    stabilityFast: card.stabilityFast,
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    learningStep: card.learningStep,
    scheduleStatus: card.scheduleStatus,
    dueAt: card.dueAt.getTime(),
    lastReviewAt: card.lastReviewAt === null ? null : card.lastReviewAt.getTime(),
  };
}

const schedulers = new Map();
async function reference(options, retention) {
  const key = JSON.stringify([options, retention]);
  if (!schedulers.has(key)) {
    schedulers.set(
      key,
      await DefaultScheduler({
        enableFuzz: false,
        desiredRetention: retention,
        ...(options.weights ? { weights: options.weights } : {}),
        ...(options.learningSteps ? { learningSteps: options.learningSteps } : {}),
        ...(options.relearningSteps ? { relearningSteps: options.relearningSteps } : {}),
        ...(options.maximumIntervalDays ? { maximumInterval: options.maximumIntervalDays } : {}),
      }),
    );
  }
  return schedulers.get(key);
}

/**
 * A plan step is a rating with `at` (absolute ms), `after` (ms after the
 * previous review) or `atDue` (at the previous due, the default), and an
 * optional `retention` (default the case's).
 */
async function build(name, plan, { options = {}, retention = 0.9 } = {}) {
  let card = (await reference(options, retention)).newCard({ now: new Date(T0) });
  let previous = T0;
  let due = T0;
  const steps = [];
  for (const step of plan) {
    const at = step.at ?? (step.after === undefined ? due : previous + step.after);
    const stepRetention = step.retention ?? retention;
    const scheduler = await reference(options, stepRetention);
    card = scheduler.review({ card, grade: GRADE[step.rating], now: new Date(at) }).card;
    const memory = toMemory(card);
    due = memory.dueAt;
    previous = at;
    const interval = due - at;
    const retrievability = [0, Math.round(interval / 2), interval, 2 * interval, 30 * DAY].map(
      (offset) => ({
        at: at + offset,
        value: scheduler.model.forgettingCurve(card, offset / DAY),
      }),
    );
    steps.push({
      rating: step.rating,
      at,
      ...(step.retention === undefined ? {} : { retention: stepRetention }),
      due,
      memory,
      retrievability,
    });
  }
  return {
    name,
    ...(Object.keys(options).length > 0 ? { options } : {}),
    retention,
    steps,
  };
}

const r = (rating, extra = {}) => ({ rating, ...extra });
const cases = [];
for (const rating of ['again', 'hard', 'good', 'easy']) {
  cases.push(await build(`new memory, ${rating}`, [r(rating, { at: T0 })]));
}
cases.push(
  await build('good three times, each at its due', [r('good', { at: T0 }), r('good'), r('good')]),
);
cases.push(
  await build('a lapse after three goods, then good', [
    r('good', { at: T0 }),
    r('good'),
    r('good'),
    r('again'),
    r('good'),
  ]),
);
cases.push(
  await build('learning steps: again, again, good, good', [
    r('again', { at: T0 }),
    r('again'),
    r('good'),
    r('good'),
  ]),
);
cases.push(
  await build('relearning: good, again, hard, good', [
    r('good', { at: T0 }),
    r('again'),
    r('hard'),
    r('good'),
  ]),
);
cases.push(
  await build('early and late reviews', [
    r('good', { at: T0 }),
    r('good', { after: DAY }),
    r('good', { after: 60 * DAY }),
    r('hard', { after: 3_600_000 }),
  ]),
);
cases.push(
  await build(
    'easy at every due, up to the maximum interval',
    Array.from({ length: 12 }, (_, i) => r('easy', i === 0 ? { at: T0 } : {})),
  ),
);
for (const retention of [0.7, 0.8, 0.95, 0.97]) {
  cases.push(
    await build(
      `retention ${retention}: good, good, again, good`,
      [r('good', { at: T0 }), r('good'), r('again'), r('good')],
      { retention },
    ),
  );
}
cases.push(
  await build('retention changes between reviews', [
    r('good', { at: T0, retention: 0.8 }),
    r('good', { retention: 0.95 }),
    r('good'),
    r('good', { retention: 0.8 }),
  ]),
);
cases.push(
  await build(
    'options: maximum interval 30 days, steps 5m and 30m, relearning 1h',
    [r('good', { at: T0 }), r('good'), r('good'), r('again'), r('good'), r('easy'), r('easy')],
    { options: { learningSteps: ['5m', '30m'], relearningSteps: ['1h'], maximumIntervalDays: 30 } },
  ),
);
const weights = [
  0.2, 2.5, 4.5, 12, 6.2, 0.6, 3.5, 2, 0.1, 1.4, 0.7, 0.6, 0.8, 0.65, 1, 1.3, 0.7, 3.8,
];
const defaults = (await reference({}, 0.9)).config.weights;
const fitted = [...weights, ...defaults.slice(weights.length)];
cases.push(
  await build(
    'options: fitted weights',
    [r('good', { at: T0 }), r('hard'), r('again'), r('easy')],
    {
      options: { weights: fitted },
    },
  ),
);
const random = prng(7);
const ratings = ['again', 'hard', 'good', 'easy'];
for (let n = 0; n < 12; n++) {
  const plan = [];
  for (let i = 0; i < 10; i++) {
    const rating = ratings[Math.floor(random() * 4)];
    const when = random();
    // At due, early, late, or a few minutes later.
    const extra =
      i === 0
        ? { at: T0 + Math.floor(random() * DAY) }
        : when < 0.4
          ? {}
          : when < 0.6
            ? { after: Math.floor(random() * 10 * 60_000) }
            : when < 0.8
              ? { after: Math.floor(random() * 3 * DAY) }
              : { after: Math.floor(random() * 120 * DAY) };
    plan.push(r(rating, extra));
  }
  cases.push(await build(`seeded sequence ${n + 1}`, plan, { retention: [0.9, 0.8, 0.95][n % 3] }));
}

const file = {
  $comment:
    'FSRS-7 memory vectors for @intellectif/lk-practice (criterion 3), generated by scripts/memory-vectors.mjs from the library named in `library` with its FSRS-7 preset and fuzz off. Each case starts from a memory with no reviews; each step is a review at `at` (integer epoch ms) with the case retention unless the step names one, then the expected `due`, memory, and retrievability at later times. `options` are fsrsMemoryModel options. Run by src/memory/__tests__/fsrs.test.ts, which compares exactly; another implementation compares floats at a relative 1e-9 and `due` exactly.',
  version: 1,
  library: LIBRARY,
  cases,
};
writeFileSync(
  new URL('../vectors/memory.json', import.meta.url),
  `${JSON.stringify(file, null, 2)}\n`,
);
console.log(
  `vectors/memory.json: ${cases.length} cases, ${cases.reduce((n, c) => n + c.steps.length, 0)} reviews`,
);
