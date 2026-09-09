import type { Stimulus } from '@intellectif/lk-core';
import type { MediaTransportStrings } from '../components/types.js';

/**
 * Every string the SDK's own chrome renders.
 *
 * Until 0.8.1 these were literals, and `locale` set only the `lang` attribute —
 * so a learner sitting a Spanish paper read a Spanish passage inside an English
 * scaffold, and "No plays remaining" on a listening exam was untranslatable.
 * This is the whole surface, in one place, so a consumer can replace it.
 *
 * **Interpolation and plurals are functions, not format strings.** A message
 * like `"Question {n} of {total}"` needs a parser, and a parser needs plural
 * rules for every locale the SDK does not know. A function hands both problems
 * to the consumer, who has `Intl.PluralRules` and knows their own language:
 *
 * ```ts
 * questionProgress: (index, total) => `Pregunta ${index} de ${total}`,
 * wordCount: (n) => `${n} ${n === 1 ? 'palabra' : 'palabras'}`,
 * ```
 *
 * It also lets a translation reorder its arguments, which a positional token
 * cannot, and TypeScript checks the arity. No parser, no message catalogue
 * format, no runtime dependency.
 *
 * **What is deliberately NOT here: thrown errors.** Every `throw` in this
 * package is addressed to the developer who wired the component up, not to the
 * learner. Translating them would make them unsearchable and would put the one
 * audience who can act on them behind a translation. They stay English.
 */
export interface LkStrings {
  // ── Submission ─────────────────────────────────────────────────────────
  /** Multiple Choice submit button, and Written Response. */
  submit: string;
  /** Fill-in-the-Blanks in `practice`: the learner is checking their own work. */
  checkAnswers: string;
  /** Fill-in-the-Blanks in `exam`: nothing is checked on the client. */
  submitAnswers: string;

  // ── Outcome, announced after submit ────────────────────────────────────
  /**
   * The scored result, read by a screen reader on submit.
   *
   * `percent` is already rounded to a whole number. The authored overall
   * feedback is appended SEPARATELY by the component, so a translation of this
   * sentence never has to carry the author's words — the two were previously
   * concatenated into one literal, which made the score sentence untranslatable
   * without also touching authored content.
   */
  scoreAnnouncement: (percent: number, passed: boolean) => string;
  /** Prefix announced on submit, before the score sentence. */
  answerSubmitted: string;
  /** An answer submitted for grading that has none yet. Never rendered as 0%. */
  notGradedYet: string;
  /** An outcome that carries no grade and never will. */
  noGradeAvailable: string;

  // ── Feedback disclosure ────────────────────────────────────────────────
  showFeedback: string;
  hideFeedback: string;

  // ── Fill-in-the-Blanks ─────────────────────────────────────────────────
  /** Accessible name of a blank's input. `ordinal` is 1-based. */
  blankLabel: (ordinal: number) => string;
  showHint: string;
  hideHint: string;

  // ── Written Response ───────────────────────────────────────────────────
  /**
   * Announced when an essay is handed in. Distinct from {@link LkStrings.awaitingGrade},
   * which is the `review`-mode state of a submission made earlier: this one
   * confirms the act, and is the only thing a learner hears at the moment they
   * commit work that nothing on the client will grade.
   */
  responseSubmitted: string;
  /** Live word counter. Needs the count for languages whose plural rules differ. */
  wordCount: (count: number) => string;
  /** The authored bounds, e.g. "50–200 words". `min` is 0 when unbounded below. */
  wordBounds: (min: number, max: number) => string;
  /** A rubric criterion the grader marked not applicable. */
  notApplicable: string;
  /** A returned grade flagged for a human to look at — learner-visible by design. */
  awaitingHumanReview: string;
  /** Submitted, no grade back yet. */
  awaitingGrade: string;
  /** The grader could not produce a grade. */
  couldNotBeGraded: string;

  // ── Sequence pager ─────────────────────────────────────────────────────
  previous: string;
  next: string;
  /** Progress label, also the question region's accessible name. `index` is 1-based. */
  questionProgress: (index: number, total: number) => string;
  /** Shown when no renderer is registered for an activity type. */
  unsupportedActivity: string;

  // ── Embedded media ────────────────────────────────────────────────────────
  /**
   * Accessible name of a provider iframe whose author supplied no `alt`.
   * `MediaSchema` requires `alt` on an embed, so validated content never
   * reaches this — but `validateActivity` is opt-in, and a screen-reader
   * learner meeting an unvalidated one should not meet it in English.
   */
  embeddedMedia: string;

  // ── Shared stimulus ────────────────────────────────────────────────────
  /**
   * Accessible name of the stimulus region when the author gave it no title.
   * Keyed by `Stimulus['kind']`, because "Recording" and "Passage" do not share
   * a gender or an article in every language.
   */
  stimulusKind: Record<Stimulus['kind'], string>;
  /**
   * How far the material carries, e.g. "Questions 3–8". Called with equal
   * `first` and `last` for a single question, so a translation can choose its
   * own singular rather than receive a pre-pluralised English one.
   */
  stimulusRange: (first: number, last: number) => string;

  // ── Error boundary ─────────────────────────────────────────────────────
  /** Production fallback when an activity throws during render. */
  activityFailed: string;
  /** The same, when the activity's title is known. */
  activityFailedNamed: (title: string) => string;
  /** Production fallback when the activity has no title to name. */
  activityFailedUnnamed: string;

  // ── Audio transport ────────────────────────────────────────────────────
  /**
   * The listening-paper transport. Shipped in 0.8.0 as its own `mediaStrings`
   * prop, which still works — this is the same shape, reachable from the one
   * provider so a consumer does not wire two mechanisms.
   */
  media: MediaTransportStrings;
}

/** A partial override, nested one level for {@link LkStrings.media}. */
export type LkStringsOverride = Partial<Omit<LkStrings, 'media' | 'stimulusKind'>> & {
  media?: Partial<MediaTransportStrings>;
  stimulusKind?: Partial<Record<Stimulus['kind'], string>>;
};

/**
 * English defaults, byte-identical to what every component rendered before the
 * strings surface existed. Supplying no override changes nothing on screen.
 */
export const DEFAULT_STRINGS: LkStrings = {
  submit: 'Submit',
  checkAnswers: 'Check answers',
  submitAnswers: 'Submit answers',

  scoreAnnouncement: (percent, passed) =>
    `Score ${percent}%. ${passed ? 'Passed.' : 'Not passed.'}`,
  answerSubmitted: 'Answer submitted.',
  notGradedYet: 'Not graded yet.',
  noGradeAvailable: 'No grade available.',

  showFeedback: 'Show feedback',
  hideFeedback: 'Hide feedback',

  blankLabel: (ordinal) => `Fill in blank ${ordinal}`,
  showHint: 'Show hint',
  hideHint: 'Hide hint',

  responseSubmitted:
    'Response submitted. It will be graded and your result will appear here later.',
  wordCount: (count) => `${count} ${count === 1 ? 'word' : 'words'}`,
  wordBounds: (min, max) => (min > 0 ? `${min}–${max} words` : `up to ${max} words`),
  notApplicable: 'Not applicable',
  awaitingHumanReview: 'This grade is awaiting review by a teacher.',
  awaitingGrade: 'Not graded yet. This response is waiting for its grade.',
  couldNotBeGraded: 'This response could not be graded.',

  previous: 'Previous',
  next: 'Next',
  questionProgress: (index, total) => `Question ${index} of ${total}`,
  unsupportedActivity: 'This activity type has no renderer. Supply one through the renderers prop.',

  embeddedMedia: 'Embedded media',

  stimulusKind: {
    text: 'Passage',
    audio: 'Recording',
    video: 'Video',
    image: 'Image',
    mixed: 'Material',
  },
  stimulusRange: (first, last) =>
    first === last ? `Question ${first}` : `Questions ${first}–${last}`,

  activityFailed: 'Activity failed to render',
  activityFailedNamed: (title) => `"${title}" could not be displayed.`,
  activityFailedUnnamed: 'This activity could not be displayed.',

  media: {
    play: 'Play',
    pause: 'Pause',
    preparing: 'Preparing…',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    speed: 'Playback speed',
    seek: 'Seek',
    timeValue: (elapsed, duration) => `${elapsed} of ${duration}`,
    playsRemaining: (remaining, max) =>
      `${remaining} of ${max} play${max === 1 ? '' : 's'} remaining`,
    noPlaysRemaining: 'No plays remaining',
    lastPlayConfirm: 'This is your last play. Start it now?',
    lastPlayStart: 'Start last play',
    lastPlayCancel: 'Not yet',
    seekBlocked: 'Rewinding is not available for this recording.',
    rateBlocked: 'Playback speed is fixed for this recording.',
    playFailed: 'The recording could not be started. Try again.',
  },
};

/**
 * Layers an override onto a base dictionary.
 *
 * Two levels deep and no further, because the shape is two levels deep. A
 * generic deep merge would silently accept a nested object where a function
 * belongs and fail at render instead of at the call site.
 */
export function mergeStrings(base: LkStrings, override?: LkStringsOverride): LkStrings {
  if (override === undefined) {
    return base;
  }
  const { media, stimulusKind, ...flat } = override;
  return {
    ...base,
    ...flat,
    stimulusKind: { ...base.stimulusKind, ...stimulusKind },
    media: { ...base.media, ...media },
  };
}
