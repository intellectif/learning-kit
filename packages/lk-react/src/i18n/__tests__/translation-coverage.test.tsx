import type {
  ActivityData,
  ActivityMedia as ActivityMediaData,
  FillInTheBlanksData,
  GradeRecord,
  ItemOutcome,
  LearnerResponse,
  MultipleChoiceData,
  Stimulus,
  WrittenResponseData,
} from '@intellectif/lk-core';
import { outcomeFromGrade, resolvePlaybackPolicy } from '@intellectif/lk-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityErrorBoundary } from '../../components/ActivityErrorBoundary.js';
import { ActivityPreview } from '../../components/ActivityPreview/index.js';
import { ActivitySequence } from '../../components/ActivitySequence/index.js';
import { FillInTheBlanks } from '../../components/FillInTheBlanks/index.js';
import { MultipleChoice } from '../../components/MultipleChoice/index.js';
import { StimulusPanel } from '../../components/StimulusPanel/index.js';
import { ActivityMedia } from '../../components/shared/ActivityMedia.js';
import { AudioTransport } from '../../components/shared/AudioTransport.js';
import type { MediaBudgetBinding } from '../../components/types.js';
import { WrittenResponse } from '../../components/WrittenResponse/index.js';
import { stubMediaElement } from '../../test-support/media.js';
import { DEFAULT_STRINGS, LkIntlProvider, mergeStrings } from '../LkIntlProvider.js';
import type { LkStrings, LkStringsOverride } from '../strings.js';

/**
 * Proves that EVERY string in {@link LkStrings} reaches the DOM from the
 * provider — that the surface is a translation surface and not a list of good
 * intentions.
 *
 * The failure this exists to catch is silent. A component keeps an English
 * literal, or reads a key nobody renders; the suite stays green because every
 * other test in this package asserts the English default; and the hole is
 * discovered by a learner sitting a Spanish paper who meets an English word.
 * So the English default is made impossible to mistake for a translation:
 * every key is overridden with a unique sentinel, the real components are
 * rendered, and the harvested DOM must contain all of them.
 *
 * It is deliberately ONE sweep rather than one test per key. The invariant is
 * "no key is unreachable", which a per-key test cannot state — it can only
 * check the keys someone remembered to write a test for. Adding a key to
 * `LkStrings` without rendering it here fails this test, by name.
 *
 * TWO checks run at the end, and they catch different failures:
 *
 *  1. **Unreachable** — a key in the dictionary that no component reads. Fails
 *     by key name.
 *  2. **Leaked** — an English default that appeared even though every key was
 *     overridden. This is what catches a component keeping a hardcoded literal.
 *
 * The second check is only as good as the paths swept below, and the first
 * version of this file proved it: `exam` mode was mounted and never submitted
 * for both Multiple Choice and Fill in the Blanks, and Written Response was
 * never submitted at all — so `setSummary('Answer submitted.')` sat on the exam
 * branch of two components, and an entire un-keyed sentence sat on the essay
 * hand-in, with this test green. Every submitting path is now driven to submit.
 *
 * What it still cannot catch: a literal on a path nobody renders here. That is
 * why fixtures are Spanish — it lets the leak check cover the WHOLE dictionary
 * including single words like "Next", rather than only multi-word defaults.
 */

// `«…»` appears in no component, fixture or authored string, so a sentinel
// found in the DOM was put there by the code under test.
const OPEN = '«';
const CLOSE = '»';
const sentinel = (path: string) => `${OPEN}${path}${CLOSE}`;

type Dict = Record<string, unknown>;

/** Replaces every leaf of a dictionary with a sentinel naming its own path. */
function sentinelise(source: Dict, prefix = ''): Dict {
  const out: Dict = {};
  for (const [key, value] of Object.entries(source)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'function') {
      // Arguments are echoed, so a wrong-arity or wrong-order call shows up in
      // the harvest instead of being indistinguishable from a right one.
      out[key] = (...args: unknown[]) => `${OPEN}${path}(${args.join('|')})${CLOSE}`;
    } else if (typeof value === 'string') {
      out[key] = sentinel(path);
    } else {
      out[key] = sentinelise(value as Dict, path);
    }
  }
  return out;
}

/** Every leaf path in the dictionary, e.g. `submit`, `media.play`. */
function leafPaths(source: Dict, prefix = ''): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'object' && value !== null ? leafPaths(value as Dict, path) : [path];
  });
}

const SENTINELS = sentinelise(DEFAULT_STRINGS as unknown as Dict) as unknown as LkStringsOverride;
const SENTINEL_STRINGS: LkStrings = mergeStrings(DEFAULT_STRINGS, SENTINELS);
const ALL_PATHS = leafPaths(DEFAULT_STRINGS as unknown as Dict);

/** Text content plus every attribute value — `aria-label` alone carries five keys. */
function harvest(node: HTMLElement): string {
  const parts = [node.textContent ?? ''];
  for (const el of node.querySelectorAll('*')) {
    for (const attribute of Array.from(el.attributes)) {
      parts.push(attribute.value);
    }
  }
  return parts.join('\n');
}

const collected: string[] = [];

/** Renders under the sentinel provider and returns the container. */
function sweep(ui: React.ReactNode): HTMLElement {
  const { container } = render(<LkIntlProvider strings={SENTINELS}>{ui}</LkIntlProvider>);
  collected.push(harvest(container));
  return container;
}

/** Harvests again after an interaction has changed what is on screen. */
function keep(node: HTMLElement): void {
  collected.push(harvest(node));
}

// ── Fixtures ───────────────────────────────────────────────────────────────
// Authored text carries no English default ("Submit", "Next", "Passage"…), so
// the leak check at the end cannot be satisfied by a fixture.

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Uno',
  question: '2 + 2 ?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Tres', isCorrect: false },
    { id: 'b', text: 'Cuatro', isCorrect: true },
  ],
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'q2',
  title: 'Dos',
  passage: 'Francia = {{a}}.',
  blanks: [{ id: 'a', acceptedAnswers: ['Paris'], hint: 'Empieza por P', feedback: 'Capital.' }],
  scoringStrategy: 'partial',
};

const wr: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'q3',
  title: 'Tres',
  prompt: 'Describe un lugar.',
  minWords: 2,
  maxWords: 5,
};

const submitted: LearnerResponse = {
  type: 'written-response',
  text: 'un texto corto',
  wordCount: 3,
};

const deferred: ItemOutcome = {
  status: 'deferred',
  reason: 'requires_async_grading',
  maxScore: 1,
};

const unscorable: ItemOutcome = { status: 'unscorable', reason: 'no-scorer', maxScore: 1 };

const grade: GradeRecord = {
  score: 0.82,
  maxScore: 1,
  passed: true,
  feedback: 'Bien argumentado.',
  requiresHumanReview: true,
  criteria: [{ name: 'Gramática', notApplicable: true }],
};

const audio = (playback: Record<string, unknown>): ActivityMediaData =>
  ({ type: 'audio', url: '/a.mp3', alt: 'Pista', playback }) as ActivityMediaData;

const binding = (over: Partial<MediaBudgetBinding> = {}): MediaBudgetBinding => ({
  key: 'stimulus:1',
  slotId: '1.0',
  index: 0,
  activityId: 'q1',
  ...over,
});

const transport = (
  media: ActivityMediaData,
  over: Partial<React.ComponentProps<typeof AudioTransport>> = {},
) => (
  <AudioTransport media={media} policy={resolvePlaybackPolicy(media)} renderMode="exam" {...over} />
);

const element = () => document.querySelector('audio') as unknown as HTMLAudioElement;

const loadMetadata = () =>
  act(() => {
    element().dispatchEvent(new Event('loadedmetadata'));
  });

function Boom(): never {
  throw new Error('kaboom');
}

describe('translation coverage', () => {
  beforeEach(() => {
    collected.length = 0;
    stubMediaElement();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders every string in LkStrings from the provider, and no English default', async () => {
    const user = userEvent.setup();

    // ── Multiple Choice: the submit control, then what submitting announces ─
    sweep(<MultipleChoice data={mc} onComplete={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Cuatro' }));
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    keep(document.body);
    cleanup();

    // EXAM is the mode a translated summative paper actually runs, and it has
    // its own submit branch. Sweeping only `practice` let an English literal
    // live on this path through a whole release.
    sweep(<MultipleChoice data={mc} renderMode="exam" onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Cuatro' }));
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    keep(document.body);
    cleanup();

    // A submitted answer with no grade back is never rendered as 0%.
    sweep(<MultipleChoice data={mc} renderMode="review" outcome={deferred} />);
    cleanup();

    // ── Fill in the Blanks: practice checks, exam submits ───────────────────
    sweep(<FillInTheBlanks data={fib} onComplete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: sentinel('showHint') }));
    keep(document.body);
    await user.type(screen.getByRole('textbox', { name: sentinel('blankLabel(1)') }), 'Paris');
    await user.click(screen.getByRole('button', { name: sentinel('checkAnswers') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('hideFeedback') }));
    keep(document.body);
    cleanup();

    sweep(<FillInTheBlanks data={fib} renderMode="exam" onSubmit={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: sentinel('blankLabel(1)') }), 'Paris');
    await user.click(screen.getByRole('button', { name: sentinel('submitAnswers') }));
    keep(document.body);
    cleanup();

    // `unscorable` is "no grade is ever coming", distinct from `deferred`.
    sweep(<FillInTheBlanks data={fib} renderMode="review" outcome={unscorable} />);
    cleanup();

    // ── Written Response: the counter, the hand-in, and every outcome state ─
    sweep(<WrittenResponse data={wr} onSubmitted={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'un texto corto');
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    keep(document.body);
    cleanup();

    sweep(
      <WrittenResponse
        data={wr}
        renderMode="review"
        value={submitted}
        outcome={outcomeFromGrade(grade)}
      />,
    );
    cleanup();

    sweep(<WrittenResponse data={wr} renderMode="review" value={submitted} outcome={deferred} />);
    cleanup();

    sweep(<WrittenResponse data={wr} renderMode="review" value={submitted} outcome={unscorable} />);
    cleanup();

    // ── Sequence: pager chrome, and the note for an unregistered type ───────
    const unsupported = { ...mc, id: 'q9', type: 'matching' } as unknown as ActivityData;
    sweep(<ActivitySequence activities={[unsupported, mc]} />);
    cleanup();

    // ── Authoring preview: the notice for an unfinished and for a wrong draft ─
    sweep(<ActivityPreview draft={{ ...mc, title: '' }} />);
    cleanup();
    sweep(
      <ActivityPreview
        draft={{ ...mc, options: mc.options.map((option) => ({ ...option, isCorrect: true })) }}
      />,
    );
    cleanup();

    // ── Stimulus: an unnamed region per kind, plus the range label ──────────
    const kinds: Stimulus['kind'][] = ['text', 'audio', 'video', 'image', 'mixed'];
    for (const kind of kinds) {
      sweep(
        <StimulusPanel
          stimulus={{ id: `s-${kind}`, kind, body: 'Cuerpo.' }}
          range={{ first: 3, last: 8 }}
        />,
      );
      cleanup();
    }

    // An embed whose author left `alt` unset: the iframe's accessible name is
    // then the SDK's own, and it used to be English. Rendered through
    // <ActivityMedia> directly, because MediaSchema requires `alt` here and an
    // activity component would refuse the data in dev before reaching it —
    // which is precisely why only UNVALIDATED content meets this fallback.
    sweep(
      <ActivityMedia
        media={
          { type: 'embed', url: 'https://www.youtube.com/embed/x' } as unknown as ActivityMediaData
        }
      />,
    );
    cleanup();

    // ── Error boundary: dev shows the stack, production names the activity ──
    // A class component cannot call a hook, so it takes resolved strings; the
    // wrappers read the provider for it. That wiring is asserted separately.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sweep(
      <ActivityErrorBoundary strings={SENTINEL_STRINGS}>
        <Boom />
      </ActivityErrorBoundary>,
    );
    cleanup();

    vi.stubEnv('NODE_ENV', 'production');
    sweep(
      <ActivityErrorBoundary activityTitle="Uno" strings={SENTINEL_STRINGS}>
        <Boom />
      </ActivityErrorBoundary>,
    );
    cleanup();
    sweep(
      <ActivityErrorBoundary strings={SENTINEL_STRINGS}>
        <Boom />
      </ActivityErrorBoundary>,
    );
    cleanup();
    vi.unstubAllEnvs();

    // ── Audio transport: labels, budget, gate, and the three refusals ───────
    const openPolicy = audio({ maxPlays: 3, seek: 'allow', rate: 'allow' });
    sweep(transport(openPolicy, { mediaBudget: binding() }));
    loadMetadata();
    await user.click(screen.getByRole('button', { name: sentinel('media.play') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('media.mute') }));
    keep(document.body);
    cleanup();

    // A grant that has not settled yet: the button is busy, playback held.
    let settle: (grant: { playsUsed: number }) => void = () => {};
    sweep(
      transport(openPolicy, {
        mediaBudget: binding({
          onPlayConsumed: () =>
            new Promise<{ playsUsed: number }>((resolve) => {
              settle = resolve;
            }),
        }),
      }),
    );
    loadMetadata();
    await user.click(screen.getByRole('button', { name: sentinel('media.play') }));
    keep(document.body);
    // Another tab already spent the budget, so the atomic write comes back full.
    await act(async () => {
      settle({ playsUsed: 3 });
    });
    keep(document.body);
    cleanup();

    // One play left: the gate asks before spending it.
    sweep(transport(audio({ maxPlays: 2 }), { mediaBudget: binding({ entry: { plays: 1 } }) }));
    loadMetadata();
    await user.click(screen.getByRole('button', { name: sentinel('media.play') }));
    keep(document.body);
    cleanup();

    // Locked seek and fixed rate: each refusal is announced, not silent.
    const locked = audio({ maxPlays: 3, seek: 'none', rate: 'fixed' });
    const container = sweep(transport(locked, { mediaBudget: binding() }));
    loadMetadata();
    act(() => {
      element().currentTime = 30;
      element().dispatchEvent(new Event('seeking'));
    });
    keep(container);
    act(() => {
      // Writable, because the handler answers a rate change by assigning 1
      // back — a read-only stub would throw instead of being snapped back.
      Object.defineProperty(element(), 'playbackRate', {
        configurable: true,
        writable: true,
        value: 2,
      });
      element().dispatchEvent(new Event('ratechange'));
    });
    keep(container);
    act(() => {
      element().dispatchEvent(new Event('error'));
    });
    keep(container);
    cleanup();

    // ── The invariant ──────────────────────────────────────────────────────
    // A flatten that stopped returning paths would make everything below
    // pass vacuously, so the count is pinned to the order of magnitude it has.
    expect(ALL_PATHS.length).toBeGreaterThan(40);

    const seen = collected.join('\n');
    const unreachable = ALL_PATHS.filter(
      (path) => !seen.includes(sentinel(path)) && !seen.includes(`${OPEN}${path}(`),
    );
    expect(unreachable, 'these LkStrings keys never reached the DOM').toEqual([]);

    // And no English default appeared anywhere, INCLUDING the single words.
    // The earlier version of this check skipped anything without a space, on
    // the theory that "Next" is indistinguishable from authored content — which
    // is only true if the fixtures are English. They are not: every fixture
    // above is Spanish precisely so that this check can cover the whole
    // dictionary. Skipping the single words is what let `setSummary('Answer
    // submitted.')` sit on the exam path of two components for a release.
    // Sentinels are stripped first. A sentinel is named after its own key, and
    // a key is camelCase English — so the raw harvest contains "Submit" inside
    // «answerSubmitted» and "Play" inside «media.lastPlayConfirm». Searching the
    // un-stripped text reports those as leaks and is how a whole-dictionary
    // check gets abandoned as too noisy. What is left after the strip is text
    // no override produced.
    const withoutSentinels = seen.replace(/«[^»]*»/g, ' ');
    const leaked = ALL_PATHS.filter((path) => {
      const value = path
        .split('.')
        .reduce<unknown>((node, key) => (node as Dict)[key], DEFAULT_STRINGS);
      return typeof value === 'string' && withoutSentinels.includes(value);
    });
    expect(leaked, 'these English defaults survived the override').toEqual([]);
  });

  it('the wrappers hand the provider strings to the class error boundary', () => {
    // The boundary is the one place a hook cannot reach, so each wrapper reads
    // `useLkStrings` and passes the result down. Nothing else proves that link.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    const broken = { ...mc, options: undefined } as unknown as MultipleChoiceData;
    render(
      <LkIntlProvider strings={SENTINELS}>
        <MultipleChoice data={broken} onComplete={vi.fn()} />
      </LkIntlProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(sentinel('activityFailedNamed(Uno)'));
  });
});
