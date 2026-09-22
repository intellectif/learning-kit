import type {
  ActivityData,
  ActivityMedia as ActivityMediaData,
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  GradeRecord,
  ItemGroup,
  ItemOutcome,
  LearnerResponse,
  MultipleChoiceData,
  ReadAloudData,
  RecordingRef,
  SpeechAssessment,
  Stimulus,
  WrittenResponseData,
} from '@intellectif/lk-core';
import { outcomeFromGrade, resolvePlaybackPolicy } from '@intellectif/lk-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityErrorBoundary } from '../../components/ActivityErrorBoundary.js';
import { ActivityPreview } from '../../components/ActivityPreview/index.js';
import { ActivitySequence } from '../../components/ActivitySequence/index.js';
import { Dictation } from '../../components/Dictation/index.js';
import { FillInTheBlanks } from '../../components/FillInTheBlanks/index.js';
import { GapSelect } from '../../components/GapSelect/index.js';
import { InteractiveVideo } from '../../components/InteractiveVideo/index.js';
import { MultipleChoice } from '../../components/MultipleChoice/index.js';
import { PronunciationFeedback } from '../../components/PronunciationFeedback/index.js';
import { ReadAloud } from '../../components/ReadAloud/index.js';
import type { ReadAloudAssessResult } from '../../components/ReadAloud/ReadAloud.js';
import { StimulusPanel } from '../../components/StimulusPanel/index.js';
import { ActivityMedia } from '../../components/shared/ActivityMedia.js';
import { AudioTransport } from '../../components/shared/AudioTransport.js';
import type { MediaBudgetBinding } from '../../components/types.js';
import { WrittenResponse } from '../../components/WrittenResponse/index.js';
import { stubMediaElement } from '../../test-support/media.js';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../test-support/speech.js';
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

/**
 * Text content plus every attribute value — `aria-label` alone carries five
 * keys.
 *
 * The development error boundary's `<pre>` is left out: it holds a JavaScript
 * stack, which is neither translated nor authored, and whose frame names
 * ("performWorkOnRoot") contain English words that would be reported as a
 * default that leaked. Every string the boundary itself renders is outside it.
 */
function harvest(node: HTMLElement): string {
  const copy = node.cloneNode(true) as HTMLElement;
  for (const stack of copy.querySelectorAll('pre')) {
    stack.remove();
  }
  const parts = [copy.textContent ?? ''];
  for (const el of copy.querySelectorAll('*')) {
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

/**
 * The interactive video's own fixture. Two questions in one quiz, so the step
 * indicator and the "next question" path exist, and Spanish throughout so the
 * leak check still covers single English words.
 */
const videoItem = (id: string): MultipleChoiceData => ({ ...mc, id, title: id });

const videoGroup = (over: Partial<ItemGroup> = {}): ItemGroup =>
  ({
    schemaVersion: '1.0',
    type: 'item-group',
    id: 'vid',
    title: 'Vídeo',
    stimulus: {
      id: 'sv',
      kind: 'video',
      media: {
        type: 'video',
        url: '/v.mp4',
        alt: 'Vídeo',
        tracks: [{ kind: 'captions', src: '/c.vtt', srclang: 'es', label: 'Español' }],
      },
    },
    items: [videoItem('v1'), videoItem('v2')],
    timeline: {
      chapters: [{ at: 0, title: 'Principio' }],
      cues: [{ id: 'c1', at: 20, itemIds: ['v1', 'v2'] }],
    },
    ...over,
  }) as ItemGroup;

const spanishCaptions = ['WEBVTT', '', '00:00:00.000 --> 00:00:30.000', 'Hola, clase'].join('\n');

/** The player reads metadata before it knows its own duration. */
const loadVideo = () =>
  act(() => {
    (document.querySelector('video') as HTMLVideoElement).dispatchEvent(
      new Event('loadedmetadata'),
    );
  });

const pressKey = async (key: string, init: KeyboardEventInit = {}): Promise<void> => {
  await act(async () => {
    (document.querySelector('.lk-iv') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, ...init }),
    );
    // What the player announces is set on the next frame, so that the same
    // sentence twice is read out twice; the harvest has to wait for it.
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
};

function Boom(): never {
  throw new Error('kaboom');
}

/** A promise a sweep can hold open, so a pending label is on screen to harvest. */
function defer<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/**
 * The fake Web Audio stack. A prerequisite of the read-aloud strings, not a
 * test nicety: jsdom has no capture stack at all, so without it no take can be
 * made here and every recording string is unreachable by construction.
 */
let speech: SpeechCaptureHarness | undefined;

describe('translation coverage', () => {
  beforeEach(() => {
    collected.length = 0;
    stubMediaElement();
    speech = stubSpeechCapture();
  });

  afterEach(() => {
    speech?.restore();
    speech = undefined;
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

    // ── Gap select: the selector's name and its empty first entry ──────────
    const gs = {
      schemaVersion: '1.0',
      type: 'gap-select',
      id: 'gs1',
      title: 'Prepositions',
      passage: "I'm {{a}} Spain.",
      gaps: [
        {
          id: 'a',
          choices: [
            { id: 'from', text: 'from' },
            { id: 'of', text: 'of' },
          ],
          correctChoiceId: 'from',
          feedback: 'from + place of origin',
        },
      ],
      scoringStrategy: 'partial',
    } satisfies GapSelectData;
    sweep(<GapSelect data={gs} onComplete={vi.fn()} />);
    // The selector's own name and its empty first entry.
    await user.selectOptions(
      screen.getByRole('combobox', { name: sentinel('gapLabel(1)') }),
      'from',
    );
    keep(document.body);
    // Submitted too, not just mounted: the marked state and the feedback
    // toggle live only on that path, and the sweep that missed three literals
    // last time was the one that never submitted.
    await user.click(screen.getByRole('button', { name: sentinel('checkAnswers') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('hideFeedback') }));
    keep(document.body);
    cleanup();

    sweep(<GapSelect data={gs} renderMode="exam" onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: sentinel('submitAnswers') }));
    keep(document.body);
    cleanup();

    // ── Dictation: recordings, hints, the marked result, and the solution ───
    // The attempt is built so the alignment has one word of each kind — a
    // missing first word, a misspelt one, an extra last one — because the
    // four hidden sentences are the only channel the marks have for a screen
    // reader, and a sweep that reached three of them would leave the fourth
    // English.
    const dc = {
      schemaVersion: '1.0',
      type: 'dictation',
      id: 'dc1',
      title: 'Dictado',
      transcript: 'El gato duerme en la cama.',
      media: { type: 'audio', url: '/dictado.mp3', alt: 'Grabación' },
      slowMedia: { type: 'audio', url: '/dictado-lento.mp3' },
      hints: { mode: 'progressive-words' },
    } satisfies DictationData;
    sweep(<Dictation data={dc} onComplete={vi.fn()} />);
    await user.click(
      screen.getByRole('button', { name: sentinel('dictationRevealNextWord(0|6)') }),
    );
    keep(document.body);
    await user.type(
      screen.getByRole('textbox', { name: sentinel('dictationInputLabel') }),
      'gato durme en la cama hoy',
    );
    await user.click(screen.getByRole('button', { name: sentinel('checkAnswers') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('showSolution') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('hideSolution') }));
    keep(document.body);
    cleanup();

    // An empty attempt has its own sentence, and nothing else to mark.
    sweep(<Dictation data={dc} onComplete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: sentinel('checkAnswers') }));
    keep(document.body);
    cleanup();

    sweep(<Dictation data={dc} renderMode="exam" onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: sentinel('submitAnswers') }));
    keep(document.body);
    cleanup();

    sweep(<Dictation data={dc} renderMode="review" outcome={deferred} />);
    cleanup();

    // ── Read aloud: the recorder, the take, and every way a take can end ───
    const ra = {
      schemaVersion: '1.0',
      type: 'read-aloud',
      id: 'ra1',
      title: 'Lee la frase',
      instructions: 'Lee a un ritmo natural.',
      referenceText: 'El tiempo está agradable hoy.',
      locale: 'es-MX',
      media: { type: 'audio', url: '/modelo.mp3', alt: 'Modelo' },
      slowMedia: { type: 'audio', url: '/modelo-lento.mp3' },
      recording: { maxSeconds: 20, minSeconds: 1, maxTakes: 2 },
      scoring: { dimensions: [{ name: 'accuracy', weight: 3 }] },
    } satisfies ReadAloudData;

    const stored: RecordingRef = { key: 'take-1', mimeType: 'audio/wav' };
    const storeTake = async (): Promise<RecordingRef> => stored;

    /** Lets the recorder's asynchronous `start()` and the bindings settle. */
    const settleSpeech = () =>
      act(async () => {
        for (let tick = 0; tick < 20; tick += 1) {
          await Promise.resolve();
        }
      });

    /** Records one take, harvesting the labels that exist only mid-recording. */
    const recordTake = async (): Promise<void> => {
      const capture = speech as SpeechCaptureHarness;
      await user.click(screen.getByRole('button', { name: sentinel('readAloudRecord') }));
      await settleSpeech();
      act(() => {
        capture.pushLevel(0.5, capture.sampleRate * 2);
      });
      keep(document.body);
      await user.click(screen.getByRole('button', { name: sentinel('readAloudStop') }));
      keep(document.body);
    };

    // A binding that stores but judges nothing, with the upload held open so
    // the pending label is on screen before it settles.
    const upload = defer<RecordingRef>();
    sweep(<ReadAloud data={ra} recordingBinding={{ upload: () => upload.promise }} />);
    await recordTake();
    // The page refuses to play the take back — a policy that will not load
    // `blob:` media — and a note takes the player's place.
    act(() => {
      document.querySelector('.lk-ra-take')?.dispatchEvent(new Event('error'));
    });
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    keep(document.body);
    upload.settle(stored);
    await settleSpeech();
    keep(document.body);
    cleanup();

    // A held assessment, then the code that means the learner was not heard.
    const judge = defer<ReadAloudAssessResult>();
    sweep(
      <ReadAloud data={ra} recordingBinding={{ upload: storeTake, assess: () => judge.promise }} />,
    );
    await recordTake();
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    await settleSpeech();
    keep(document.body);
    judge.settle({ status: 'unscorable', code: 'no_speech' });
    await settleSpeech();
    keep(document.body);
    cleanup();

    // Any other code says only that this take could not be assessed.
    sweep(
      <ReadAloud
        data={ra}
        recordingBinding={{
          upload: storeTake,
          assess: async () => ({ status: 'unscorable', code: 'house_policy' }),
        }}
      />,
    );
    await recordTake();
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    await settleSpeech();
    keep(document.body);
    cleanup();

    // An assessment that could not be run at all, and the retry it offers.
    sweep(
      <ReadAloud
        data={ra}
        recordingBinding={{
          upload: storeTake,
          assess: async () => ({ status: 'failed', retryable: true }),
        }}
      />,
    );
    await recordTake();
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    await settleSpeech();
    keep(document.body);
    cleanup();

    // A take that never reached storage: the message, and the retry.
    sweep(
      <ReadAloud
        data={ra}
        recordingBinding={{
          upload: async () => {
            throw new Error('the store is unreachable');
          },
        }}
      />,
    );
    await recordTake();
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    await settleSpeech();
    keep(document.body);
    cleanup();

    // Only an exam offers the deliberate blank.
    sweep(<ReadAloud data={ra} renderMode="exam" recordingBinding={{ upload: storeTake }} />);
    cleanup();

    // A microphone the browser refuses: five sentences behind one key, of which
    // this sweep drives one — the prefix is what the check matches.
    speech?.restore();
    speech = stubSpeechCapture({ refuseMicrophone: 'NotAllowedError' });
    sweep(<ReadAloud data={ra} recordingBinding={{ upload: storeTake }} />);
    await user.click(screen.getByRole('button', { name: sentinel('readAloudRecord') }));
    await settleSpeech();
    keep(document.body);
    cleanup();

    // ── Pronunciation feedback: all four marks, and one word opened ─────────
    // Built so the alignment has one word of each kind and the opened word
    // carries every fact the panel has a row for — a sweep that reached three
    // of the four hidden sentences would leave the fourth English.
    const speechAssessment = {
      assessmentVersion: '1.0',
      status: 'assessed',
      task: 'scripted',
      locale: 'es-MX',
      referenceText: ra.referenceText,
      recordingKey: stored.key,
      assessor: { kind: 'auto' },
      scale: 100,
      scores: { accuracy: 88, fluency: 72, completeness: 95 },
      recognizedText: 'el tiempo agradable hoy eh',
      miscue: 'assessor',
      phonemeAlphabet: 'ipa',
      words: [
        {
          text: 'El',
          accuracy: 95,
          error: 'none',
          startMs: 0,
          durationMs: 200,
          syllables: [{ text: 'el', grapheme: 'El' }],
          phonemes: [{ symbol: 'e' }, { accuracy: 50, heardAs: [{ symbol: 'a', score: 30 }] }],
          breaks: { unexpected: 0.9, missing: 0.8 },
        },
        { text: 'tiempo', accuracy: 90, error: 'none' },
        { text: 'está', error: 'omission' },
        { text: 'agradable', accuracy: 40, error: 'mispronunciation' },
        { text: 'hoy', accuracy: 85, error: 'none' },
        { text: 'eh', error: 'insertion' },
      ],
      prosody: { monotoneConfidence: 0.9 },
    } satisfies SpeechAssessment;

    sweep(
      <PronunciationFeedback
        data={{ referenceText: ra.referenceText, locale: ra.locale }}
        assessment={speechAssessment}
        audioUrl="blob:take-1"
        breakThreshold={0.5}
        monotoneThreshold={0.5}
      />,
    );
    await user.click(screen.getAllByRole('button', { name: /pronunciationWordDetails/ })[0]);
    keep(document.body);
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

    // ── Interactive video: the chrome, the menus, a quiz, and the end ──────
    // `document` gains the two capabilities the player asks about, so the
    // buttons that depend on them are rendered and their names harvested.
    Object.defineProperty(document, 'pictureInPictureEnabled', {
      configurable: true,
      value: true,
    });

    const captions = vi.fn(async () => spanishCaptions);
    let player = sweep(
      <InteractiveVideo
        group={videoGroup()}
        captionsLoader={captions}
        preferences={{ panel: true }}
      />,
    );
    loadVideo();
    await waitFor(() => expect(captions).toHaveBeenCalled());
    keep(document.body);

    // The settings menu, both of its pages, and the shortcut list.
    await user.click(screen.getByRole('button', { name: sentinel('videoSettings') }));
    keep(document.body);
    await user.click(screen.getByRole('menuitem', { name: /videoCaptionLanguage/ }));
    keep(document.body);
    await user.click(screen.getByRole('menuitem', { name: /videoCaptionLanguage/ }));
    await user.click(screen.getByRole('menuitem', { name: /videoCaptionSize/ }));
    keep(document.body);
    await user.click(screen.getByRole('menuitem', { name: /videoCaptionSize/ }));
    await user.click(screen.getByRole('menuitem', { name: /videoShortcutList/ }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('videoClose') }));

    // The speed menu, the time readout's other face, and captions turned off.
    await user.click(screen.getByRole('button', { name: sentinel('media.speed') }));
    keep(document.body);
    await user.click(
      screen.getAllByRole('menuitemradio', { name: /videoSpeedValue/ })[0] as HTMLElement,
    );
    await user.click(screen.getByRole('button', { name: sentinel('videoShowRemaining') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('videoCaptionsHide') }));
    keep(document.body);
    // With captions off, the settings menu says so where the language was.
    await user.click(screen.getByRole('button', { name: sentinel('videoSettings') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('videoSettings') }));

    // The transcript, and a search that matches nothing.
    await user.click(screen.getByRole('tab', { name: sentinel('videoTranscript') }));
    keep(document.body);
    await user.type(screen.getByRole('searchbox'), 'zzz');
    keep(document.body);

    // The quiz, opened from the contents list: its steps, its footer, and what
    // is announced as it opens.
    await user.click(screen.getByRole('tab', { name: sentinel('videoContents') }));
    await user.click(screen.getByRole('button', { name: /videoQuizProgress/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    keep(document.body);
    await user.click(screen.getByRole('radio', { name: 'Cuatro' }));
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('videoNextQuestion') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('videoContinue') }));

    // The end card, with a graded question behind it, and the replay button.
    act(() => {
      (document.querySelector('video') as HTMLVideoElement).dispatchEvent(new Event('ended'));
    });
    keep(document.body);
    cleanup();

    // Exam: an answer is saved, not scored, and the end card says only how many.
    sweep(
      <InteractiveVideo
        group={videoGroup({
          timeline: {
            cues: [
              { id: 'c1', at: 20, itemIds: ['v1'], required: true },
              { id: 'c2', at: 40, itemIds: ['v2'] },
            ],
          },
        } as Partial<ItemGroup>)}
        renderMode="exam"
        shuffleSeed="seed"
        onSubmit={vi.fn()}
      />,
    );
    loadVideo();
    // A seek past a required quiz stops at it and says why.
    await pressKey('End');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    keep(document.body);
    await user.click(screen.getByRole('radio', { name: 'Cuatro' }));
    await user.click(screen.getByRole('button', { name: sentinel('submit') }));
    keep(document.body);
    await user.click(screen.getByRole('button', { name: sentinel('videoContinue') }));
    act(() => {
      (document.querySelector('video') as HTMLVideoElement).dispatchEvent(new Event('ended'));
    });
    keep(document.body);
    cleanup();

    // No skipping ahead: the seek stops at the furthest point watched.
    sweep(
      <InteractiveVideo
        group={videoGroup({
          timeline: {
            navigation: 'no-skip-ahead',
            cues: [{ id: 'c1', at: 20, itemIds: ['v1', 'v2'] }],
          },
        } as Partial<ItemGroup>)}
      />,
    );
    loadVideo();
    await pressKey('End');
    keep(document.body);
    cleanup();

    // Captions that could not be read say so in the menu they were chosen from.
    sweep(
      <InteractiveVideo
        group={videoGroup()}
        captionsLoader={async () => {
          throw new Error('403');
        }}
      />,
    );
    loadVideo();
    await user.click(screen.getByRole('button', { name: sentinel('videoSettings') }));
    await user.click(screen.getByRole('menuitem', { name: /videoCaptionLanguage/ }));
    keep(document.body);
    // One language only: Shift + C says there is no second one.
    await user.keyboard('{Escape}');
    await pressKey('C', { shiftKey: true });
    keep(document.body);
    cleanup();

    // Two languages: the pair on the main page, the second-language item and
    // its page, and the note when the second one fails to load.
    const twoLanguages = videoGroup({
      stimulus: {
        id: 'sv',
        kind: 'video',
        media: {
          type: 'video',
          url: '/v.mp4',
          alt: 'Vídeo',
          tracks: [
            { kind: 'captions', src: '/c.vtt', srclang: 'es', label: 'Español' },
            { kind: 'subtitles', src: '/p.vtt', srclang: 'pt', label: 'Portugués' },
          ],
        },
      },
    } as Partial<ItemGroup>);
    // A browser that remembers nothing: a sweep above turned the captions off,
    // and the player rightly remembers that.
    localStorage.clear();
    sweep(
      <InteractiveVideo
        group={twoLanguages}
        defaultPreferences={{ secondaryCaptionLanguage: 'pt' }}
        captionsLoader={async (track) => {
          if (track.srclang === 'pt') {
            throw new Error('403');
          }
          return spanishCaptions;
        }}
      />,
    );
    loadVideo();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await user.click(screen.getByRole('button', { name: sentinel('videoSettings') }));
    keep(document.body);
    await user.click(screen.getByRole('menuitem', { name: /videoCaptionLanguage/ }));
    keep(document.body);
    await user.click(screen.getByRole('menuitem', { name: /videoSecondCaptionLanguage/ }));
    keep(document.body);
    cleanup();

    // In fullscreen the button says how to leave, and a video that will not
    // play says why and offers another go.
    player = sweep(<InteractiveVideo group={videoGroup()} />);
    loadVideo();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: player.querySelector('.lk-iv'),
    });
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    keep(document.body);
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    act(() => {
      const video = document.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'error', { configurable: true, value: { code: 3 } });
      video.dispatchEvent(new Event('error'));
    });
    keep(document.body);
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
