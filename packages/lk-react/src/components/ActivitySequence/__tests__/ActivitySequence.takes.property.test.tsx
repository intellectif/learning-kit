import type {
  ActivityResult,
  LearnerResponse,
  MultipleChoiceData,
  ReadAloudData,
  ReadAloudLearnerResponse,
  RecordingRef,
  SpeechAssessment,
} from '@intellectif/lk-core';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import fc from 'fast-check';
import { useMemo, useState } from 'react';
import { afterAll, describe, expect, it } from 'vitest';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import type { ReadAloudAssessResult } from '../../ReadAloud/ReadAloud.js';
import type { RenderMode, SequenceRecordingBinding } from '../../types.js';
import { ActivitySequence, type SequenceItemOutcome } from '../index.js';

/**
 * C2 and C4 closed as classes: a state machine, not a list of orderings.
 *
 * Round 2 fixed each ordering the reviewers measured, and each fix left the
 * ordering beside it open — a re-take that came back unscorable instead of
 * graded, a new paper that reused the read-aloud's ids instead of changing
 * them, a failure that could still be retried instead of one that could not.
 * So this suite does not pick orderings. It generates them: a learner who
 * records, stops, submits, retries, re-records and moves between questions; a
 * storage and an assessor that answer in any order, late, or for a paper that
 * is gone; a host that swaps papers — one reusing the read-aloud's slot and
 * activity ids, one moving it, and a loading blip — and rebuilds its item
 * objects, on one render or on every render. In `practice` and in `exam`.
 *
 * Each step is a roll among the actions the screen and the open calls offer at
 * that moment, so every step does something and a shrunk counterexample reads
 * as a script a learner could follow.
 *
 * After every step, whatever the order, it holds the pager to what a host that
 * persists its callbacks relies on:
 *
 * - **a score and a response name the same take**: every grade
 *   `onActivityComplete` reports, and every read-aloud outcome `onFinished`
 *   reports, belongs to the take `onSubmit` last reported for that slot in that
 *   set;
 * - **`onFinished` fires at most once per set**, never while a take is still on
 *   its way, and never while the question on screen offers "Try again";
 * - **`onFinished` and `onComplete` agree about every slot** — `onComplete`
 *   fires with exactly the scored results `onFinished` reported, straight after
 *   it, or not at all;
 * - **no failed upload is ever reported as a blank** — a practice read-aloud is
 *   never reported with `recording: null`, and `unsubmitted` only for a slot
 *   that stored no take;
 * - **the take budget holds**, whatever the host rebuilds (C3);
 * - **and the set is not stuck**: once every question has an answer stored and
 *   every call has settled, the set has been reported.
 */

/**
 * Two hundred sequences by default. Measured against round 2's bugs put back
 * one at a time, the slowest to surface — a re-take that came back ungraded,
 * and a late result matched to a paper by reused ids — each took about fifty
 * sequences on average and under 170 in every seed tried.
 */
const RUNS = positiveFromEnvironment('LK_PROPERTY_RUNS', 200);
const MAX_STEPS = positiveFromEnvironment('LK_PROPERTY_STEPS', 40);
/** Replays one failure: the `seed` and `path` fast-check printed for it. */
const REPLAY = {
  seed: environment('LK_PROPERTY_SEED'),
  path: environment('LK_PROPERTY_PATH'),
};
/** Prints each step's action as it is taken, to read a counterexample by. */
const TRACE = environment('LK_PROPERTY_TRACE') !== undefined;
/**
 * `LK_PROPERTY_SHRINK=0` reports the first counterexample as found. Shrinking a
 * forty-step run re-renders the pager for every candidate, and for a defect
 * reachable along many paths that can outlast the test's timeout.
 */
const SHRINK = environment('LK_PROPERTY_SHRINK') !== '0';

function environment(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ];
}

function positiveFromEnvironment(name: string, fallback: number): number {
  const raw = environment(name);
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Each run mounts a real pager and drives the fake capture stack through every
 * take. CPU-bound work proportional to the run count, sized for a shared CI
 * runner rather than for a development machine.
 */
const PROPERTY_TIMEOUT_MS = 600_000;

const MAX_TAKES = 3;

const reading: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra',
  title: 'Read it',
  referenceText: 'The weather is lovely today.',
  locale: 'en-US',
  recording: { maxSeconds: 20, minSeconds: 1, maxTakes: MAX_TAKES },
  scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
};

const question = (id: string): MultipleChoiceData => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id,
  title: `Question ${id}`,
  question: `${id}?`,
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'wrong', text: 'Wrong', isCorrect: false },
    { id: 'right', text: 'Right', isCorrect: true },
  ],
});

/**
 * The papers a host swaps between. `B` shares the read-aloud's slot id and
 * activity id with `A` and differs only in its other question — exactly what a
 * paper that reuses an item looks like to anything matching by id. `C` moves
 * the same read-aloud to another slot. `blip` is a loading screen between two.
 */
type Paper = 'A' | 'B' | 'C' | 'blip';
const PAPERS: Record<Paper, readonly (ReadAloudData | MultipleChoiceData)[]> = {
  A: [reading, question('mcA')],
  B: [reading, question('mcB')],
  C: [question('mcC'), reading],
  blip: [],
};

/** The same item as new objects, as `raw.map(redact)` hands a pager on each call. */
function rebuilt(item: ReadAloudData | MultipleChoiceData): ReadAloudData | MultipleChoiceData {
  return item.type === 'read-aloud'
    ? { ...item, recording: { ...item.recording } }
    : { ...item, options: item.options.map((option) => ({ ...option })) };
}

/** The slot a paper's read-aloud sits in. */
function readingSlot(paper: Paper): string | null {
  const at = PAPERS[paper].findIndex((item) => item.type === 'read-aloud');
  return at < 0 ? null : String(at);
}

const assessmentOf = (key: string): SpeechAssessment => ({
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-US',
  referenceText: reading.referenceText,
  recordingKey: key,
  assessor: { kind: 'auto' },
  scale: 100,
  scores: { accuracy: 80 },
  // The key, so the statement a grade builds names the take it grades.
  recognizedText: key,
  miscue: 'assessor',
  words: [
    { text: 'The', accuracy: 90, error: 'none' },
    { text: 'weather', accuracy: 80, error: 'none' },
    { text: 'is', accuracy: 85, error: 'none' },
    { text: 'lovely', accuracy: 60, error: 'none' },
    { text: 'today', accuracy: 75, error: 'none' },
  ],
});

// ── Steps ───────────────────────────────────────────────────────────────────

type Action =
  | 'take'
  | 'take-and-submit'
  | 'start'
  | 'stop'
  | 'submit'
  | 'retry'
  | 'blank'
  | 'answer'
  | 'next'
  | 'previous'
  | 'upload'
  | 'assess'
  | 'swap'
  | 'rebuild';

/**
 * How often each action is chosen when it is on offer. A swap and a rebuild are
 * always on offer and a swap starts the set over, so they are rare enough that
 * a run still gets deep into a set before one lands.
 */
const WEIGHTS: Record<Action, number> = {
  take: 6,
  'take-and-submit': 18,
  start: 3,
  stop: 6,
  submit: 12,
  retry: 15,
  blank: 3,
  answer: 9,
  next: 9,
  previous: 9,
  upload: 18,
  assess: 18,
  swap: 2,
  rebuild: 2,
};

type Verdict = 'graded' | 'unscorable' | 'failed' | 'failed-final' | 'throws' | 'unreadable';

/** One step: which of the offered actions to take, and how. */
interface Step {
  roll: number;
  /** Which open call to answer, counted among the open ones. */
  pick: number;
  stored: boolean;
  verdict: Verdict;
  score: number;
  seconds: number;
  right: boolean;
  paper: Paper;
}

const step: fc.Arbitrary<Step> = fc.record({
  roll: fc.nat({ max: 9999 }),
  pick: fc.nat({ max: 7 }),
  stored: fc.constantFrom(true, true, true, false),
  verdict: fc.constantFrom<Verdict>(
    'graded',
    'graded',
    'graded',
    'unscorable',
    'failed',
    'failed-final',
    'throws',
    'unreadable',
  ),
  score: fc.integer({ min: 0, max: 100 }),
  seconds: fc.constantFrom(2, 2, 0.2),
  right: fc.boolean(),
  // Mostly papers that put the read-aloud in the same slot under the same id —
  // the reuse no id can see through.
  paper: fc.constantFrom<Paper>('A', 'B', 'A', 'B', 'blip', 'C'),
});

const scenario = fc.record({
  // Practice twice as often: only a practice slot grades, re-takes and retries
  // an assessment, while an exam's one take per slot is quickly exhausted.
  mode: fc.constantFrom<RenderMode>('practice', 'practice', 'exam'),
  rebuildEveryRender: fc.boolean(),
  // What the assessor says to whatever is still open when the steps run out: a
  // take left in flight is judged ungraded as often as graded, so the last
  // take of a run meets both.
  lastVerdict: fc.constantFrom<Verdict>('graded', 'unscorable', 'failed-final'),
  // Two kinds of run, because the two kinds of defect pull apart: a paper
  // swapped while a call is open is where a late result lands in the wrong set,
  // and a run that seldom swaps is where one slot builds up a long history of
  // takes, grades and re-takes.
  swaps: fc.constantFrom<'seldom' | 'while-calls-are-open'>('seldom', 'while-calls-are-open'),
  // `size: 'max'` so a sequence may run to its full length: the defects this
  // hunts need a take, a failure, a re-take and a swap in one run.
  steps: fc.array(step, { minLength: 1, maxLength: MAX_STEPS, size: 'max' }),
});

// ── The run ─────────────────────────────────────────────────────────────────

/** A call the test answers by hand, in any order. */
interface Held {
  kind: 'upload' | 'assess';
  settled: boolean;
  /** The set it was made in: answered in a later one, it is a late result. */
  set: number;
  key: string | null;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/** What a host that persists every callback holds, and every broken promise seen. */
interface Model {
  mode: RenderMode;
  paper: Paper;
  /** Bumped on every swap to a different paper: a new set. */
  set: number;
  submits: Map<string, LearnerResponse>;
  takesSubmitted: Map<string, number>;
  finished: { items: SequenceItemOutcome[]; allScored: boolean } | null;
  completed: boolean;
  violations: string[];
}

/**
 * How much this proof ran, and how often it reached the situations the classes
 * are about — so a run that passes because it never got there says so.
 */
const totals = {
  sequences: 0,
  practice: 0,
  exam: 0,
  steps: 0,
  actions: {} as Partial<Record<Action, number>>,
  retakesAfterAStoredTake: 0,
  failedUploads: 0,
  retryableAssessFailures: 0,
  swapsWithCallsOpen: 0,
  lateResultsFromAnEarlierSet: 0,
  setsReported: 0,
  scoredReadAloudsReported: 0,
  respondedReadAloudsReported: 0,
  unsubmittedReported: 0,
};

afterAll(() => {
  console.info(`[takes property] ${JSON.stringify(totals)}`);
});

/** Lets every pending promise in the recorder, the bindings and React settle. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 25; tick += 1) {
      await Promise.resolve();
    }
  });
}

/** Whether a control can be pressed: present, not disabled, not `aria-disabled`. */
function pressable(element: Element | null | undefined): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    !element.hasAttribute('disabled') &&
    element.getAttribute('aria-disabled') !== 'true' &&
    element.closest('fieldset[disabled]') === null
  );
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
  await flush();
}

function visiblePane(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.lk-seq-slot:not([hidden])');
}

function visibleIndex(): number {
  return [...document.querySelectorAll('.lk-seq-slot')].findIndex(
    (pane) => !(pane as HTMLElement).hidden,
  );
}

/** The take a grade's statement names: the assessment's recognised text is its key. */
function keyGraded(result: ActivityResult): unknown {
  return (result.xapiStatement as { result?: { response?: unknown } }).result?.response;
}

function keyOf(response: LearnerResponse | undefined): string | null | undefined {
  return response?.type === 'read-aloud'
    ? ((response as ReadAloudLearnerResponse).recording?.key ?? null)
    : undefined;
}

async function runScenario(input: {
  mode: RenderMode;
  rebuildEveryRender: boolean;
  lastVerdict: Verdict;
  swaps: 'seldom' | 'while-calls-are-open';
  steps: readonly Step[];
}): Promise<void> {
  const harness: SpeechCaptureHarness = stubSpeechCapture();
  const calls: Held[] = [];
  let keys = 0;
  const model: Model = {
    mode: input.mode,
    paper: 'A',
    set: 0,
    submits: new Map(),
    takesSubmitted: new Map(),
    finished: null,
    completed: false,
    violations: [],
  };
  const flag = (message: string): void => {
    model.violations.push(`[${model.mode}, set ${model.set}, paper ${model.paper}] ${message}`);
  };
  const open = (kind: Held['kind']): Held[] =>
    calls.filter((call) => call.kind === kind && !call.settled);

  const binding: SequenceRecordingBinding = {
    upload: (take) =>
      new Promise<RecordingRef>((resolve, reject) => {
        calls.push({
          kind: 'upload',
          settled: false,
          set: model.set,
          key: null,
          resolve: () => {
            keys += 1;
            resolve({ key: `k${keys}`, mimeType: take.mimeType, durationMs: take.durationMs });
          },
          reject,
        });
      }),
    assess: (ref) =>
      new Promise<ReadAloudAssessResult>((resolve, reject) => {
        calls.push({
          kind: 'assess',
          settled: false,
          set: model.set,
          key: ref.key,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
      }),
  };

  const callbacks = {
    onSubmit: (response: LearnerResponse, slot: { slotId: string }) => {
      model.submits.set(slot.slotId, response);
      if (response.type !== 'read-aloud') {
        return;
      }
      if (model.mode === 'practice' && keyOf(response) === null) {
        flag(`onSubmit reported a practice blank for slot ${slot.slotId}`);
      }
      const count = (model.takesSubmitted.get(slot.slotId) ?? 0) + 1;
      model.takesSubmitted.set(slot.slotId, count);
      const limit = model.mode === 'exam' ? 1 : MAX_TAKES;
      if (count > limit) {
        flag(
          `onSubmit reported take ${count} for slot ${slot.slotId}; the ${model.mode} limit is ${limit}`,
        );
      }
    },
    onActivityComplete: (result: ActivityResult, _index: number, slotId: string) => {
      if (slotId !== readingSlot(model.paper)) {
        return;
      }
      const graded = keyGraded(result);
      const answered = keyOf(model.submits.get(slotId));
      if (graded !== answered) {
        flag(`onActivityComplete graded take ${String(graded)} beside answer ${String(answered)}`);
      }
    },
    onFinished: (items: SequenceItemOutcome[]) => {
      totals.setsReported += 1;
      if (model.finished !== null) {
        flag('onFinished reported one set twice');
      }
      if (document.querySelector('.lk-seq .lk-ra-pending') !== null) {
        flag('onFinished reported a set with a take still on its way');
      }
      if (visiblePane()?.querySelector('.lk-ra-retry') != null) {
        flag('onFinished reported a set while the question on screen offers "Try again"');
      }
      const slot = readingSlot(model.paper);
      for (const item of items) {
        if (item.slotId !== slot) {
          continue;
        }
        const answered = model.submits.get(item.slotId);
        if (item.kind === 'scored') {
          totals.scoredReadAloudsReported += 1;
          const graded = keyGraded(item.result);
          if (graded !== keyOf(answered) || keyOf(item.response) !== graded) {
            flag(
              `onFinished paired a grade for ${String(graded)} with answer ${String(keyOf(item.response))}; onSubmit last reported ${String(keyOf(answered))}`,
            );
          }
        } else if (item.kind === 'responded') {
          totals.respondedReadAloudsReported += 1;
          if (JSON.stringify(item.response) !== JSON.stringify(answered)) {
            flag(
              `onFinished reported answer ${String(keyOf(item.response))}; onSubmit last reported ${String(keyOf(answered))}`,
            );
          }
          if (model.mode === 'practice' && keyOf(item.response) === null) {
            flag('onFinished reported a practice read-aloud as a blank');
          }
        } else if (item.kind === 'unsubmitted') {
          totals.unsubmittedReported += 1;
          if (model.mode !== 'practice' || answered !== undefined) {
            flag(
              `onFinished reported unsubmitted for a slot whose answer ${String(keyOf(answered))} was stored`,
            );
          }
        } else {
          flag(`onFinished reported a read-aloud as ${item.kind}`);
        }
      }
      model.finished = { items, allScored: items.every((item) => item.kind === 'scored') };
    },
    onComplete: (results: ActivityResult[]) => {
      const finished = model.finished;
      if (finished === null || model.completed || !finished.allScored) {
        flag('onComplete fired without a fully scored onFinished before it in this set');
      } else if (
        results.length !== finished.items.length ||
        results.some((result, at) => {
          const item = finished.items[at];
          return item?.kind !== 'scored' || item.result !== result;
        })
      ) {
        flag('onComplete and onFinished described one set differently');
      }
      model.completed = true;
    },
  };

  const control = {
    swap: (_paper: Paper): void => {},
    rebuild: (): void => {},
    touch: (): void => {},
  };

  function Host() {
    const [paper, setPaper] = useState<Paper>('A');
    const [generation, setGeneration] = useState(0);
    const [, setTouches] = useState(0);
    control.swap = setPaper;
    control.rebuild = () => setGeneration((value) => value + 1);
    control.touch = () => setTouches((value) => value + 1);
    // biome-ignore lint/correctness/useExhaustiveDependencies: `generation` is the rebuild trigger
    const kept = useMemo(() => PAPERS[paper].map(rebuilt), [paper, generation]);
    const activities = input.rebuildEveryRender ? PAPERS[paper].map(rebuilt) : kept;
    // Every callback re-renders the host, as one that saves into state does.
    return (
      <ActivitySequence
        activities={activities}
        renderMode={input.mode}
        recordingBinding={binding}
        onSubmit={(response, slot) => {
          callbacks.onSubmit(response, slot);
          control.touch();
        }}
        onActivityComplete={(result, index, slotId) => {
          callbacks.onActivityComplete(result, index, slotId);
          control.touch();
        }}
        onFinished={(items) => {
          callbacks.onFinished(items);
          control.touch();
        }}
        onComplete={(results) => {
          callbacks.onComplete(results);
          control.touch();
        }}
      />
    );
  }

  /** The control an action presses on the question on screen, or `null`. */
  const controlFor = (action: Action): HTMLElement | null => {
    const pane = visiblePane();
    const find = (selector: string): HTMLElement | null => {
      const found = pane?.querySelector(selector);
      return pressable(found) ? found : null;
    };
    switch (action) {
      case 'take':
      case 'take-and-submit':
      case 'start':
        return find('.lk-ra-record');
      case 'stop':
        return find('.lk-ra-stop');
      case 'submit':
        return find('.lk-ra-submit');
      case 'retry':
        return find('.lk-ra-retry');
      case 'blank':
        return find('.lk-ra-submit-blank');
      case 'answer':
        return find('.lk-mc button[type="submit"]');
      case 'next':
      case 'previous': {
        const nav = document.querySelector(action === 'next' ? '.lk-seq-next' : '.lk-seq-prev');
        return pressable(nav) ? nav : null;
      }
      default:
        return null;
    }
  };

  /** The actions on offer right now: what the screen lets a learner press, and the open calls. */
  const offered = (): Action[] =>
    (Object.keys(WEIGHTS) as Action[]).filter((action) => {
      if (action === 'upload' || action === 'assess') {
        return open(action).length > 0;
      }
      if (action === 'swap') {
        return true;
      }
      if (action === 'rebuild') {
        // A blip has no items to rebuild; offering it there only spends steps.
        return model.paper !== 'blip';
      }
      return controlFor(action) !== null;
    });

  /**
   * An action's weight right now. The situations the classes live in are rare
   * under fixed weights — a paper swapped while a call is still open, a take
   * recorded again after one was stored — so they are weighted up while they
   * are possible. Only how often a path is taken changes; every check holds on
   * every path.
   */
  const weightOf = (action: Action): number => {
    if (action === 'swap') {
      return input.swaps === 'seldom' ? 1 : calls.some((call) => !call.settled) ? 8 : 2;
    }
    if (
      (action === 'take' || action === 'take-and-submit') &&
      model.submits.has(String(visibleIndex()))
    ) {
      return WEIGHTS[action] * 2;
    }
    return WEIGHTS[action];
  };

  /** Speaks `seconds` into a capture that is running, and stops it. */
  const finishTake = async (seconds: number): Promise<void> => {
    const stop = controlFor('stop');
    if (stop === null) {
      return;
    }
    act(() => {
      harness.pushLevel(0.5, Math.round(harness.sampleRate * seconds));
    });
    await press(stop);
  };

  const answerCall = async (call: Held, next: Step): Promise<void> => {
    call.settled = true;
    if (call.set !== model.set) {
      totals.lateResultsFromAnEarlierSet += 1;
    }
    const key = call.key ?? 'unknown';
    const score = next.score / 100;
    await act(async () => {
      if (call.kind === 'upload') {
        if (next.stored) {
          call.resolve(undefined);
        } else {
          totals.failedUploads += 1;
          call.reject(new Error('storage offline'));
        }
        return;
      }
      switch (next.verdict) {
        case 'graded':
        case 'unreadable':
          call.resolve({
            status: 'graded',
            assessment: assessmentOf(key),
            grade: {
              score: next.verdict === 'graded' ? score : Number.NaN,
              maxScore: 1,
              passed: score >= 0.5,
              feedback: null,
            },
          });
          break;
        case 'unscorable':
          call.resolve({ status: 'unscorable', code: 'no_speech' });
          break;
        case 'failed':
          totals.retryableAssessFailures += 1;
          call.resolve({ status: 'failed', retryable: true });
          break;
        case 'failed-final':
          call.resolve({ status: 'failed', retryable: false });
          break;
        default:
          totals.retryableAssessFailures += 1;
          call.reject(new Error('assessor unreachable'));
      }
    });
    await flush();
  };

  const perform = async (action: Action, next: Step): Promise<void> => {
    totals.actions[action] = (totals.actions[action] ?? 0) + 1;
    if (TRACE) {
      console.info(
        `  ${action} on question ${visibleIndex()} of paper ${model.paper}` +
          (action === 'upload' || action === 'assess'
            ? ` (open: ${open(action)
                .map((call) => call.key ?? `upload@set${call.set}`)
                .join(
                  ', ',
                )}; pick ${next.pick}, ${action === 'upload' ? `stored ${next.stored}` : next.verdict})`
            : action === 'swap'
              ? ` → ${next.paper}`
              : ''),
      );
    }
    switch (action) {
      case 'upload':
      case 'assess': {
        const waiting = open(action);
        const call = waiting[next.pick % waiting.length];
        if (call !== undefined) {
          await answerCall(call, next);
        }
        return;
      }
      case 'swap': {
        if (next.paper === model.paper) {
          await act(async () => {
            control.touch();
          });
          await flush();
          return;
        }
        if (calls.some((call) => !call.settled)) {
          totals.swapsWithCallsOpen += 1;
        }
        // A new set from here on: its own answers, its own single report.
        model.paper = next.paper;
        model.set += 1;
        model.submits = new Map();
        model.takesSubmitted = new Map();
        model.finished = null;
        model.completed = false;
        await act(async () => {
          control.swap(next.paper);
        });
        await flush();
        return;
      }
      case 'rebuild':
        await act(async () => {
          control.rebuild();
        });
        await flush();
        return;
      case 'stop':
        await finishTake(next.seconds);
        return;
      case 'answer': {
        const options = visiblePane()?.querySelectorAll<HTMLInputElement>(
          '.lk-mc input[type="radio"]',
        );
        const choice = options?.[next.right ? 1 : 0];
        const submit = controlFor('answer');
        if (pressable(choice) && submit !== null) {
          await press(choice);
          await press(submit);
        }
        return;
      }
      default: {
        const button = controlFor(action);
        if (button === null) {
          return;
        }
        if (action === 'take' || action === 'take-and-submit' || action === 'start') {
          if (model.submits.has(String(visibleIndex()))) {
            totals.retakesAfterAStoredTake += 1;
          }
        }
        await press(button);
        if (action === 'take' || action === 'take-and-submit') {
          await finishTake(next.seconds);
        }
        if (action === 'take-and-submit') {
          const submit = controlFor('submit');
          if (submit !== null) {
            await press(submit);
          }
        }
      }
    }
  };

  const check = (after: string): void => {
    if (model.finished?.allScored === true && !model.completed) {
      flag('onFinished reported a fully scored set and onComplete did not follow');
    }
    if (/could not be displayed|Activity failed to render/.test(document.body.textContent ?? '')) {
      flag('a component fell to its error boundary');
    }
    if (model.violations.length > 0) {
      throw new Error(`after ${after}:\n${model.violations.join('\n')}`);
    }
  };

  /** Puts the learner on question `at`. */
  const goTo = async (at: number, how: Step): Promise<void> => {
    while (visibleIndex() >= 0 && visibleIndex() !== at) {
      await perform(visibleIndex() < at ? 'next' : 'previous', how);
    }
  };

  /**
   * Answers every question and settles every call, the way a patient learner
   * and a working backend would, so a set that is only stuck is found too.
   *
   * The other questions are answered BEFORE the open calls are settled, oldest
   * first: a result that arrives for a take the learner has replaced, or for a
   * paper no longer on screen, then lands in a set that is otherwise ready to
   * report — which is where a result matched to the wrong take would show.
   */
  const drain = async (): Promise<void> => {
    const patient: Step = {
      roll: 0,
      pick: 0,
      stored: true,
      verdict: input.lastVerdict,
      score: 80,
      seconds: 2,
      right: true,
      paper: model.paper,
    };
    const size = PAPERS[model.paper].length;
    for (let round = 0; round < 6; round += 1) {
      for (let at = 0; at < size; at += 1) {
        if (PAPERS[model.paper][at]?.type === 'multiple-choice' && !model.submits.has(String(at))) {
          await goTo(at, patient);
          await perform('answer', patient);
        }
      }
      for (const call of calls.filter((held) => !held.settled)) {
        await answerCall(call, patient);
        check(`drain round ${round + 1}, answering ${call.kind} ${call.key ?? ''}`);
      }
      for (let at = 0; at < size; at += 1) {
        await goTo(at, patient);
        await perform('stop', patient);
        await perform('retry', patient);
        if (model.submits.has(String(at))) {
          continue;
        }
        if (PAPERS[model.paper][at]?.type === 'multiple-choice') {
          await perform('answer', patient);
        } else if (controlFor('take') !== null) {
          await perform('take-and-submit', patient);
        } else if (controlFor('submit') !== null) {
          await perform('submit', patient);
        } else if (model.mode === 'exam') {
          await perform('blank', patient);
        }
      }
      check(`drain round ${round + 1}`);
    }
    // Leave the question the learner is on, so no retry offered there holds the set.
    for (const away of ['previous', 'next', 'next'] as const) {
      if (controlFor(away) !== null) {
        await perform(away, patient);
      }
    }
    const everyAnswerStored = PAPERS[model.paper].every((_, at) => model.submits.has(String(at)));
    const nothingOpen = calls.every((call) => call.settled);
    if (size > 0 && everyAnswerStored && nothingOpen && model.finished === null) {
      flag(
        'every question has a stored answer and nothing is in flight, and the set was never reported',
      );
    }
    check('the drain');
  };

  totals.sequences += 1;
  totals[input.mode === 'exam' ? 'exam' : 'practice'] += 1;
  try {
    render(<Host />);
    await flush();
    for (const [at, next] of input.steps.entries()) {
      totals.steps += 1;
      const actions = offered();
      const total = actions.reduce((sum, action) => sum + weightOf(action), 0);
      let roll = next.roll % total;
      const action =
        actions.find((candidate) => {
          roll -= weightOf(candidate);
          return roll < 0;
        }) ?? 'rebuild';
      await perform(action, next);
      check(`step ${at + 1}: ${action} ${JSON.stringify(next)}`);
    }
    await drain();
  } finally {
    cleanup();
    harness.restore();
  }
}

describe('<ActivitySequence> takes, as a state machine (C2, C4)', () => {
  it(
    'keeps every score beside the answer it grades, reports each set once and never as a blank, whatever the order',
    async () => {
      await fc.assert(fc.asyncProperty(scenario, runScenario), {
        numRuns: RUNS,
        ...(REPLAY.seed !== undefined ? { seed: Number(REPLAY.seed) } : {}),
        ...(REPLAY.path !== undefined ? { path: REPLAY.path, endOnFailure: true } : {}),
        ...(SHRINK ? {} : { endOnFailure: true }),
      });
      expect(totals.sequences).toBeGreaterThanOrEqual(REPLAY.path === undefined ? RUNS : 1);
    },
    PROPERTY_TIMEOUT_MS,
  );
});
