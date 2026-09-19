'use client';

import {
  type ActivityMedia,
  type ActivityResult,
  flattenSequence,
  type InteractionEvent,
  type ItemOutcome,
  isItemGroup,
  type LearnerResponse,
  type RecordingRef,
  resolvePlaybackPolicy,
  type SequenceEntry,
  type SequenceSlot,
  type SequenceSlotGroup,
  type SpeechAssessment,
  slotMediaKey,
  stimulusMediaKey,
  type ThemeTokens,
} from '@intellectif/lk-core';
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStringsOverride } from '../../i18n/strings.js';
import { randomSessionId } from '../_internal.js';
import { Dictation } from '../Dictation/index.js';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { GapSelect } from '../GapSelect/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';
import { ReadAloud } from '../ReadAloud/index.js';
import type { RecordingBinding } from '../ReadAloud/ReadAloud.js';
import { StimulusPanel } from '../StimulusPanel/index.js';
import { stopCaptureGroup } from '../shared/capture-registry.js';
import {
  mintTake,
  type SequenceSlotChannel,
  SequenceSlotContext,
  type TakeState,
  takeOf,
} from '../shared/sequence-slot.js';
import type {
  ActivityProps,
  HtmlSanitizer,
  MediaBudgetBinding,
  RenderableActivity,
  RenderMode,
  SequenceMediaBudget,
  SequenceRecordingBinding,
  SequenceRecordingSlot,
} from '../types.js';
import { WrittenResponse, type WrittenResponseSubmission } from '../WrittenResponse/index.js';

/**
 * What one finished slot in a sequence produced. Two kinds, because two kinds
 * of activity exist: those the SDK scores at submit time, and those a grader
 * scores later. Collapsing them would mean inventing a score for ungraded
 * work — the exact defect the deferred outcome exists to prevent.
 *
 * **A read-aloud hand-in adds no arm here, deliberately.** The obvious home for
 * a handed-in take is `submitted`, and it is the wrong one: that arm's payload
 * is typed `WrittenResponseSubmission`, this union is published from both the
 * barrel and the `components/ActivitySequence` subpath, and a consumer narrows
 * on `kind === 'submitted'` and reads `.text`. Widening the payload to a union
 * would break every one of those reads — a breaking change to a published
 * discriminated union, bought for a type that `responded` already describes: a
 * read-aloud hand-in IS a raw `LearnerResponse` with no grade, which is exactly
 * what `responded` carries.
 *
 * What a read-aloud does add is `unsubmitted`, for the one thing no existing
 * arm can say honestly: a take that never reached storage. Any response would
 * be a lie about it — a `recording` of `null` is the blank a learner chooses,
 * and grades as 0.
 */
export type SequenceItemOutcome =
  | {
      kind: 'scored';
      /** Presented position. */
      index: number;
      /** Slot identity from `flattenSequence` — stable under shuffling; the `slotId` to score with. */
      slotId: string;
      activityId: string;
      result: ActivityResult;
      /**
       * The answer this score grades, for a slot whose grade arrives after its
       * answer was handed in and whose learner may hand in another: a
       * `practice` read-aloud, whose `response.recording` names the take the
       * score belongs to. Absent for every other slot, whose score and answer
       * arrive together.
       */
      response?: LearnerResponse;
    }
  | {
      kind: 'submitted';
      index: number;
      slotId: string;
      activityId: string;
      /** Ungraded submission; the grade arrives asynchronously. */
      submission: WrittenResponseSubmission;
    }
  | {
      kind: 'restored';
      index: number;
      slotId: string;
      activityId: string;
      /**
       * The answer as restored, when one was. A slot can be submitted with no
       * stored response (a blank the learner committed), so this is optional —
       * inventing one would be worse than admitting it is absent.
       */
      response?: LearnerResponse;
    }
  | {
      kind: 'responded';
      index: number;
      slotId: string;
      activityId: string;
      /**
       * The raw answer, with no grade of any kind. This is what an `exam` slot
       * produces: the client is forbidden to score, so a response is all there
       * is until the server grades it.
       *
       * A read-aloud `recording` of `null` here is always a blank the learner
       * chose to hand in, never a take that failed to upload — that is
       * `unsubmitted`.
       */
      response: LearnerResponse;
    }
  | {
      /**
       * A question the learner tried to answer and could not hand in, and then
       * left: a `practice` read-aloud whose take never reached your storage. It
       * carries no response, because there is none.
       *
       * Deliberately not `responded` with a `recording` of `null`: that is the
       * blank a learner chooses, and a grader marks it 0 with every word
       * omitted — which would turn a storage outage into a zero. Grade nothing
       * for this slot; the learner can still return to it, and a take stored
       * then reaches you through `onSubmit`.
       */
      kind: 'unsubmitted';
      index: number;
      slotId: string;
      activityId: string;
    };

/**
 * A component that can render one activity inside a sequence. Register one per
 * activity `type` to put a consumer-defined type on screen — the React half of
 * the activity-type registry, matching `registerActivityType` in lk-core.
 */
export type ActivityRenderer = ComponentType<ActivityProps>;

export interface ActivitySequenceProps {
  /**
   * The ordered set of entries to present, one question at a time: loose
   * activities, and item groups — a shared passage, recording or image with
   * the questions that refer to it. A group's stimulus stays on screen
   * alongside each of its questions.
   *
   * Accepts `redact()` projections. For data straight off a server, pass it
   * through `asRenderableSequence()` — see that helper for why a cast is
   * unavoidable there — and set `renderMode="exam"`.
   */
  activities: readonly SequenceEntry<RenderableActivity>[];
  /**
   * Renderers for activity types beyond the built-ins, keyed by `data.type`.
   * A key matching a built-in overrides it, so a consumer can replace the
   * bundled renderer without forking the sequencer.
   *
   * A registered renderer is an `ActivityRenderer`, which is
   * `ComponentType<ActivityProps>` — so it receives the shared prop contract
   * and nothing beyond it. `shuffleSeed`, `recordingBinding`, `assessment` and
   * `workletUrl` are all outside that contract and none of them reaches an
   * override: a replacement for `read-aloud` has to be given its own binding by
   * whoever wrote it.
   */
  renderers?: Readonly<Record<string, ActivityRenderer>>;
  /**
   * Called whenever an individual activity is scored at submit time — the
   * incremental persist hook.
   *
   * `slotId` is the identity to store the result against, NOT `index`.
   * `index` is where the question was PRESENTED, which is not stable: it moves
   * under shuffling, and it already differs from the slot identity whenever a
   * group is present (the second entry of a sequence is presented at index 1
   * but is slot `"1.0"` if it is a group's first question). `composeAssessmentScore`
   * scores by `slotId`, so persisting `index` cannot be reconciled with it.
   */
  onActivityComplete?: (result: ActivityResult, index: number, slotId: string) => void;
  /**
   * Called on every submit with the learner's raw response and the identity of
   * the slot that produced it — before any grading, in every render mode.
   *
   * **This is the only response channel an `exam` sequence has.** In `exam`
   * mode the components never grade, so `onActivityComplete` cannot fire and
   * `onComplete` never will; without this prop nothing a learner submitted
   * would reach the consumer at all. Persist `response` against `slotId`.
   */
  onSubmit?: (
    response: LearnerResponse,
    slot: { slotId: string; index: number; activityId: string },
  ) => void;
  /**
   * Called once every activity has been completed, with the scored results.
   *
   * Fires only when EVERY item produced a score. A set containing a
   * deferred-graded activity (a written response) can never satisfy that, so
   * use `onFinished` for mixed sets — it is the general completion signal and
   * reports both kinds of outcome. It also carries `slotId` per item, which
   * this callback's bare array cannot.
   *
   * It fires straight after `onFinished`, with the same results, or never: a
   * set `onFinished` reported with an ungraded slot is not reported here later,
   * when a re-recorded take is graded.
   */
  onComplete?: (results: ActivityResult[]) => void;
  /**
   * Called once every activity has been completed, whether it was scored at
   * submit time or submitted for later grading. Use this for any set that
   * mixes graded and deferred-graded activities.
   *
   * **Once per set**, and that matters for a `practice` read-aloud, whose grade
   * arrives after the submit that completed the slot. When the last slot is
   * filled while a read-aloud's take is still being stored or assessed, this
   * waits for it and reports the set then — with the grade in place, or with
   * the slot's raw `responded` outcome when the take came back with no grade.
   * A take that never settles is a question still being answered, so the set
   * is not reported while it runs.
   *
   * **A failure the learner can still retry is in flight too.** While a take
   * that failed to upload, or whose assessment failed, is offered "Try again"
   * on the question the learner is looking at, the set is not reported: the
   * retry may yet store and grade it. It completes once the learner moves to
   * another question — as the last take the slot stored, or as `unsubmitted`
   * when it never stored one, which is never a blank.
   *
   * **A score and a response always describe the same take.** A read-aloud
   * recorded again replaces the earlier take's grade with the new take's
   * `responded`, and a result that arrives for a take the learner has since
   * replaced, or for a paper no longer on screen, is not recorded at all.
   *
   * `onComplete` fires in the same report or not at all, so the two never
   * describe one set differently. What arrives after the set was reported is
   * not reported here again, because a consumer who persists on this callback
   * must not write one attempt twice: a later take reaches you through
   * `onSubmit`, and its grade through `onActivityComplete`, the per-item persist
   * hook keyed by `slotId` — which only ever grades the answer `onSubmit` last
   * reported for that slot.
   */
  onFinished?: (items: SequenceItemOutcome[]) => void;
  /** Forwarded to each activity. */
  onInteraction?: (event: InteractionEvent) => void;
  /** Forwarded to each activity. `exam` and `review` disable local scoring. */
  renderMode?: RenderMode;
  /**
   * Binds every budgeted recording in this sequence to a play ledger the
   * consumer persists.
   *
   * The SDK refuses a play; it does not remember one. `plays` seeds the counts
   * at mount (pass `restoreMediaPlayLedger(plan, stored).entries`), and
   * `onPlayConsumed` is how a play becomes durable — see
   * {@link SequenceMediaBudget}.
   */
  mediaBudget?: SequenceMediaBudget;
  /**
   * Where every read-aloud take in this sequence is stored, and how a
   * judgement comes back. Required by any `read-aloud` slot outside `review`:
   * the component refuses to render a recorder whose take is stored nowhere.
   *
   * Named `recordingBinding` rather than `recording` because both
   * `ReadAloudData.recording` (the bounds an item declares) and
   * `ReadAloudLearnerResponse.recording` (the take a learner handed in) already
   * exist — the plain name would read as one of those. Same name at both
   * levels, different types, as `mediaBudget` has.
   */
  recordingBinding?: SequenceRecordingBinding;
  /**
   * Speech assessments keyed by `slotId`, forwarded to the matching read-aloud
   * slot so `review` can show the per-word marks behind a stored grade.
   *
   * Read LIVE, like `outcomes` and unlike `responses`: an assessment is fetched
   * beside the attempt it explains and lands after the first paint, and a
   * mount-only read would show the grade with no marks under it for ever.
   */
  assessments?: Readonly<Record<string, SpeechAssessment>>;
  /**
   * The URL of a self-hosted copy of `CAPTURE_PROCESSOR_SOURCE`, forwarded to
   * every read-aloud slot's recorder, for a Content-Security-Policy whose
   * `script-src` does not allow `blob:`. See `ReadAloudProps.workletUrl`. Like
   * `recordingBinding`, it does not reach a `renderers` override.
   */
  workletUrl?: string;
  /** Overrides the SDK's chrome text for this sequence. See {@link LkIntlProvider}. */
  strings?: LkStringsOverride;
  /**
   * `entries` shuffles the top-level entries; a group moves as one block, and
   * the order INSIDE a group follows the group's own `shuffle` setting.
   * Default `none`: authored order.
   */
  shuffle?: 'none' | 'entries';
  /**
   * Seed for every shuffle in this sequence (`shuffle: 'entries'` and any
   * group with `shuffle: 'within-group'`). Supply the attempt id, so the
   * server's `flattenSequence(entries, { seed })` derives the same order this
   * pager shows.
   *
   * **Required whenever this sequence shuffles** — `shuffle: 'entries'`, or any
   * group with `shuffle: 'within-group'` — in `exam` or `review` mode; omitting
   * it then throws. An order nobody can reproduce cannot be reconciled with a
   * recorded attempt, and failing at render is the only way that mistake
   * surfaces before a learner sits the paper. A sequence that does not shuffle
   * needs no seed in any mode.
   *
   * The guard covers an activity's own `data.shuffle` too, a group's items
   * included: `<MultipleChoice>` would otherwise fall back to a per-mount seed,
   * in every mode.
   *
   * In `practice` mode it stays optional: a random per-mount seed is used,
   * stable within the mount and deliberately not reproducible. That fallback is
   * also not SSR-safe (server and client would invent different orders and
   * hydration would mismatch), so supply a seed for any server-rendered
   * sequence regardless of mode.
   */
  shuffleSeed?: string;
  /**
   * Where to open. Defaults to the first question; pass a stored
   * `AttemptState.index` to reopen an interrupted attempt where it was left.
   * Read at mount only, like any `default*` prop.
   */
  defaultIndex?: number;
  /**
   * Fires whenever the learner moves. Persist it and the next resume reopens
   * on the right question — without it, the pager's position is the one piece
   * of an attempt a consumer cannot recover.
   */
  onIndexChange?: (index: number) => void;
  /**
   * Answers to restore, keyed by `slotId`, seeded into each slot as its
   * `defaultValue`. This is the other half of resume: `AttemptState.responses`
   * goes straight in.
   *
   * Read at mount only. To restore a different attempt, remount with a `key`.
   */
  responses?: Readonly<Record<string, LearnerResponse>>;
  /**
   * Slots the learner had already submitted, from `AttemptState.submittedSlotIds`.
   * Each is mounted already submitted, so a resumed paper does not reopen a
   * locked question as answerable — without this a learner can change and
   * re-submit work they had already committed.
   *
   * Read at mount only, alongside `responses`.
   */
  submittedSlotIds?: readonly string[];
  /**
   * Server-computed outcomes keyed by `slotId`, forwarded to each slot. In
   * `review` mode this is what marks correctness — the client never scores, so
   * without it a review render has nothing to show.
   */
  outcomes?: Readonly<Record<string, ItemOutcome>>;
  /** Renders author-supplied rich text; forwarded to the stimulus panel and every activity. */
  sanitizeHtml?: HtmlSanitizer;
  theme?: Partial<ThemeTokens>;
  /**
   * BCP 47 tag stamped as `lang` on this component's root. This is the
   * INTERFACE language — the SDK's own chrome renders inside that element — so
   * it should carry the same value you give `<LkIntlProvider locale>`. Passing
   * a different one re-declares the language of every SDK string in this
   * subtree without changing the words.
   *
   * It is NOT `data.locale`, which labels xAPI statements — and, on a
   * dictation, places the dictation's own words: `<Dictation>` puts it, and
   * the direction it names, on its title, hints, marks and solution. Other
   * authored content in another language belongs on `stimulus.locale`, which
   * `<StimulusPanel>` puts on the passage alone.
   */
  locale?: string;
  disabled?: boolean;
}

/** One stimulus panel to keep mounted: the group, and the presented span of its questions. */
interface StimulusMount {
  /** Authored entry position — unique per group in the sequence even if two groups share an id. */
  entryKey: string;
  group: SequenceSlotGroup;
  first: number;
  last: number;
}

/** The authored-entry prefix of a slot id: `"3"` for `"3"` and for `"3.1"`. */
function entryKeyOf(slot: SequenceSlot<RenderableActivity>): string {
  return slot.slotId.split('.')[0] ?? slot.slotId;
}

/** The latest take a slot has been told about, and how far it has got. */
interface SlotTake {
  /** A number from `mintTake`: unique on the page, larger for a later take. */
  take: number;
  state: TakeState;
  /** The answer the take was handed in as, once it was stored. */
  response?: LearnerResponse;
}

/**
 * Names the capture groups of one pager, so a slot's microphone belongs to that
 * pager alone. Per mount, for the reason the playback groups are: slot ids are
 * short and repeat ("0", "1.0"), so two pagers on one page — a review beside a
 * live attempt — would share a group, and hiding one's first question would
 * stop the other's recorder. The name never reaches the DOM, so a server and
 * the client that hydrates it may mint different ones.
 */
let captureScopeCount = 0;

/**
 * A pane that is kept MOUNTED but shown only when it is the current one, and
 * that stops any media it contains on the way out.
 *
 * `hidden` alone is not enough. It resolves to `display: none`, and CSS does
 * not touch playback: an `<audio>` or `<video>` inside a hidden subtree keeps
 * playing to the end. (The HTML spec pauses a media element when it is
 * REMOVED from the document — a different thing, and the thing this pager
 * deliberately does not do, because unmounting is what used to destroy the
 * learner's answers.) So a recording started for one question would carry on
 * underneath the next, which for a listening paper means the passage plays
 * while the learner is somewhere else entirely.
 *
 * Pausing preserves `currentTime`: coming back to a group resumes where the
 * learner left off. Nothing auto-plays on the way in — starting audio the
 * learner did not ask for is its own defect.
 *
 * `embed` media (a provider iframe) cannot be paused this way: controlling a
 * third-party player needs its own JS API, which the SDK has no reliable
 * access to because the author supplies the embed URL. Use `audio`/`video`
 * media for anything that must stop when the learner navigates.
 *
 * A microphone is the other way round: it is not an element in this subtree, so
 * no query can find it. A slot pane hands its content a `channel` through
 * `SequenceSlotContext` — never a prop, so nothing on a public component's
 * signature can name it — whose `captureGroup` the pane's recorders join, and
 * hiding the pane stops them: a learner who navigates away mid-take must not
 * leave the microphone live under the next question.
 */
function SequencePane({
  className,
  hidden,
  channel,
  children,
}: {
  className: string;
  hidden: boolean;
  channel?: SequenceSlotChannel;
  children: React.ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const captureGroup = channel?.captureGroup;

  useEffect(() => {
    if (!hidden) {
      return;
    }
    if (captureGroup !== undefined) {
      stopCaptureGroup(captureGroup);
    }
    const node = ref.current;
    if (node === null) {
      return;
    }
    for (const media of node.querySelectorAll('audio, video')) {
      const element = media as HTMLMediaElement;
      if (!element.paused) {
        element.pause();
      }
    }
  }, [hidden, captureGroup]);

  return (
    <div className={className} hidden={hidden} ref={ref}>
      {channel === undefined ? (
        children
      ) : (
        <SequenceSlotContext.Provider value={channel}>{children}</SequenceSlotContext.Provider>
      )}
    </div>
  );
}

/**
 * Presents a set of activities as an in-place pager: one question visible at a
 * time, navigated with Prev/Next (no page scrolling). Linear free navigation —
 * the learner may move back and forth; activities keep their own submit and
 * scoring. On navigation, focus moves to the question region and the position
 * is announced via an aria-live region.
 *
 * Item groups are flattened into consecutive questions; the group's stimulus
 * is mounted ONCE, beside the question region rather than inside it, and shown
 * alongside every question in the group — so a passage stays put, and a
 * recording keeps its position, as the learner moves between its questions.
 */
/**
 * Whether an activity shuffles its own options, and therefore needs a seed of
 * its own. Read structurally: `shuffle` is a per-type content field, not part
 * of the sequence entry contract.
 */
function shufflesItsOwnOptions(entry: unknown): boolean {
  const item = entry as { shuffle?: unknown; shuffleChoices?: unknown } | null;
  // Two content fields, one question: does this item deal an order of its own?
  // `shuffle` is MultipleChoice's; `shuffleChoices` is Gap Select's. A type
  // added without being named here shuffles unseeded in an exam — and one named
  // here but not in the seed guard's message sends its author looking for a
  // shuffle they never wrote.
  return item?.shuffle === true || item?.shuffleChoices === true;
}

export function ActivitySequence({
  activities,
  renderers,
  onActivityComplete,
  onComplete,
  onFinished,
  onSubmit,
  onInteraction,
  renderMode = 'practice',
  shuffle,
  shuffleSeed,
  defaultIndex,
  onIndexChange,
  responses,
  submittedSlotIds,
  outcomes,
  sanitizeHtml,
  theme,
  locale,
  disabled,
  mediaBudget,
  recordingBinding,
  assessments,
  workletUrl,
  strings,
}: ActivitySequenceProps): React.JSX.Element {
  const sessionIdRef = useRef<string | null>(null);
  const s = useLkStrings(strings);
  const mediaPlays = mediaBudget?.plays;
  const [captureScope] = useState(() => {
    captureScopeCount += 1;
    return `lk-seq-capture-${captureScopeCount}`;
  });

  // The presented order comes from lk-core, never computed here: the server
  // that records an attempt calls the same function with the same seed.
  const shuffleEntries = shuffle === 'entries';
  // Every shuffle this sequence can produce, not just the ones it performs
  // itself. An ACTIVITY's own `data.shuffle` is the third source: MultipleChoice
  // falls back to a per-mount seed when none reaches it, so an unseeded item
  // shuffle used to render happily under `exam` and hand the learner a
  // different option order on every mount — exactly the unreproducible
  // arrangement this guard exists to refuse, arriving through the one door it
  // did not watch.
  const needsSeed =
    shuffleEntries ||
    activities.some((entry) =>
      isItemGroup(entry)
        ? entry.shuffle === 'within-group' || entry.items.some(shufflesItsOwnOptions)
        : shufflesItsOwnOptions(entry),
    );

  // An unreproducible order is a practice-only affordance. Under `exam` or
  // `review` the server has to be able to rebuild exactly what the learner
  // saw, so a missing seed is an error rather than something to paper over —
  // the same reason `flattenSequence` refuses to invent one.
  if (needsSeed && shuffleSeed === undefined && renderMode !== 'practice') {
    // Every door `needsSeed` watches, named: a reader whose only shuffle is an
    // item's own field must find that field here. And no single function
    // rebuilds all of these orders — `flattenSequence` deals entries and group
    // items, while an item deals its own options from the same seed — so the
    // message promises the seed, not a function.
    throw new Error(
      `ActivitySequence: renderMode "${renderMode}" requires a \`shuffleSeed\` when anything ` +
        'in the sequence shuffles: shuffle="entries", a group with shuffle: "within-group", or ' +
        "an activity's own `data.shuffle` (multiple choice) or `data.shuffleChoices` (gap " +
        'select), including an activity inside a group. Pass the attempt id, so the server can ' +
        'rebuild every order the learner saw from that one seed.',
    );
  }

  // Lazily created only when shuffling in practice without a caller seed (same
  // contract as MultipleChoice.shuffleSeed): a per-mount session seed, stable
  // across re-renders, never reproducible.
  const seed = needsSeed
    ? // biome-ignore lint/suspicious/noAssignInExpressions: sanctioned lazy ref initialization
      (shuffleSeed ?? (sessionIdRef.current ??= randomSessionId()))
    : undefined;
  const slots = useMemo(
    () => flattenSequence(activities, { shuffleEntries, ...(seed !== undefined ? { seed } : {}) }),
    [activities, shuffleEntries, seed],
  );

  // Clamped rather than trusted: a stored position from a paper that has since
  // lost its last question would open the pager on a slot that is not there,
  // which renders as an empty shell with no way forward.
  const [index, setIndex] = useState(() => {
    // NaN passes through Math.min/Math.max unchanged, so it survived every
    // clamp and indexed the slots with NaN — the pager then rendered the empty
    // shell this clamp exists to prevent. `NaN` is a `number`, so the prop type
    // gives no protection, and `Number(row.last_index)` on a NULL column
    // produces exactly that.
    const requested = Math.trunc(defaultIndex ?? 0);
    if (!Number.isFinite(requested)) {
      return 0;
    }
    return Math.min(Math.max(0, requested), Math.max(0, slots.length - 1));
  });
  // Outcomes live in a ref, not state: nothing renders from them, and a ref is
  // written SYNCHRONOUSLY. Reading them from a `useState` closure meant two
  // slots completing in the same tick both saw the pre-update array — the
  // second overwrote the first, so one answer vanished and completion never
  // fired. Every slot is mounted at once here, so same-tick completions are
  // reachable (a custom renderer that completes from a mount effect).
  const outcomesRef = useRef<(SequenceItemOutcome | null)[] | null>(null);
  // The slot each position of `outcomesRef` belongs to, assigned wherever that
  // array is created so the two can never describe different papers. A ref,
  // not the `slots` a closure saw: an outcome that settles late arrives through
  // a closure from the render that started it, and only a ref can tell it what
  // is at its position NOW — see `record`.
  const outcomeSlotsRef = useRef<readonly SequenceSlot<RenderableActivity>[] | null>(null);
  // The latest take each `practice` read-aloud slot has been told about, keyed
  // by position — see `record`. A ref for the reason the outcomes are one: a
  // submit, the grade after it and the report all read it inside one tick.
  const takesRef = useRef<Map<number, SlotTake>>(new Map());
  // Which set the outcomes describe: bumped on every set change, and captured
  // by every callback a render hands a slot. A result that arrives through a
  // callback from an earlier set is refused, whatever slot and activity ids the
  // new set reuses — ids a host chooses, and a loading blip or a paper that
  // shares an item repeats them exactly.
  const setGenerationRef = useRef(0);
  // The question on screen, as of the last commit: leaving a question is what
  // completes a failure on it that was being offered a retry, and a report made
  // on a position the screen does not show yet would describe a question the
  // learner is still looking at. Written by the effect below `go`.
  const indexRef = useRef(index);
  // Whether this set has been reported. One flag for both whole-set callbacks,
  // because they are one report: a set can be filled again after it reported —
  // a practice read-aloud recorded again replaces its own outcome — and a
  // consumer who persists on either callback must not be handed one attempt
  // twice, nor be told by `onComplete` later what `onFinished` reported
  // differently.
  const reportedRef = useRef(false);
  // The channel each slot pane hands its content, one per slot per set, so it
  // keeps one identity for as long as its set is on screen.
  const channelsRef = useRef<Map<string, SequenceSlotChannel>>(new Map());
  // What a channel calls, as of the latest render — assigned below `updateTake`.
  const latestRef = useRef<{
    updateTake: (generation: number, at: number, take: number, state: TakeState) => void;
    reportIfFinished: () => void;
  } | null>(null);
  // Cleared as this pager unmounts. A slot's own teardown tells the pager its
  // take is over, and a pager on its way out must not report a set on the
  // strength of that.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  if (outcomesRef.current === null) {
    // Slots the learner had already submitted are seeded as `restored`. They
    // will not submit again — they mount locked — so leaving them null meant
    // `onFinished` waited forever on outcomes that could never arrive, and a
    // resumed attempt could never signal completion however many of the
    // remaining questions the learner answered. Seeding fires no callback: the
    // attempt was already this far along before this mount existed.
    const submittedAtMount = new Set(submittedSlotIds ?? []);
    outcomesRef.current = slots.map((slot) =>
      submittedAtMount.has(slot.slotId)
        ? {
            kind: 'restored' as const,
            index: slot.index,
            slotId: slot.slotId,
            activityId: slot.activity.id,
            ...(responses !== undefined && Object.hasOwn(responses, slot.slotId)
              ? { response: responses[slot.slotId] as LearnerResponse }
              : {}),
          }
        : null,
    );
    outcomeSlotsRef.current = slots;
  }
  const regionRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // Reset pager position and outcomes when the presented SET changes (B8):
  // without this, results from the previous set leak into the new one and can
  // fire completion with a mixed old/new array. Keyed on the set's CONTENT
  // identity (ordered slot and activity ids), not the array reference — a
  // parent that re-creates a structurally identical array on every render
  // (inline literals, .map() in render) must not wipe in-progress answers.
  // JSON.stringify (not join) so ids containing the separator cannot collide.
  const setKey = JSON.stringify(slots.map((slot) => [slot.slotId, slot.activity.id]));
  const [prevSetKey, setPrevSetKey] = useState(setKey);
  // The set this component mounted with. `responses` seeds slots BY slotId,
  // and slot ids are short and repeat across papers ("0", "1.0"), so applying
  // them after the set changed would drop one paper's answers under another
  // paper's questions — a review modal stepping to the next attempt did
  // exactly that. Seeding stops at the first set change; to show a different
  // attempt, remount with a `key`, which is what "read at mount only" means.
  // `mediaBudget.resumeKey` participates so an invigilator can hand a play
  // back — re-seeding the budgets in place — without remounting the pager and
  // costing the learner their focus, their scroll position and an unsaved
  // answer.
  const seedKey = `${setKey}::${mediaBudget?.resumeKey ?? ''}`;
  const mountSetKeyRef = useRef(setKey);
  const mountSeedKeyRef = useRef(seedKey);
  const seedsApply = mountSetKeyRef.current === setKey;
  const mediaSeedsApply = mountSeedKeyRef.current === seedKey || seedsApply;
  if (mountSeedKeyRef.current !== seedKey) {
    mountSeedKeyRef.current = seedKey;
  }
  const submitted = useMemo(() => new Set(submittedSlotIds ?? []), [submittedSlotIds]);
  if (prevSetKey !== setKey) {
    setPrevSetKey(setKey);
    setIndex(0);
    // At once, not in the effect: a new set has no question the learner was on,
    // and the effect does not run at all when the position was already 0.
    indexRef.current = 0;
    outcomesRef.current = slots.map(() => null);
    outcomeSlotsRef.current = slots;
    takesRef.current = new Map();
    setGenerationRef.current += 1;
    channelsRef.current = new Map();
    reportedRef.current = false;
  }
  const setGeneration = setGenerationRef.current;

  // After a navigation (not the initial mount) move focus to the question
  // region so screen-reader / keyboard users land on the new question.
  // biome-ignore lint/correctness/useExhaustiveDependencies: index is the intended trigger
  useEffect(() => {
    if (mountedRef.current) {
      regionRef.current?.focus();
    } else {
      mountedRef.current = true;
    }
  }, [index]);

  // Report where the pager actually IS, from an effect rather than from the
  // navigation handler. Two positions the learner never chose are still
  // positions a consumer has to persist: a `defaultIndex` that was clamped
  // (stored 99, showing 2) and the reset a set change performs. Reporting only
  // clicks left storage disagreeing with the screen, and the next autosave
  // then wrote a position the plan does not have.
  const reportedIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (reportedIndexRef.current === index) {
      return;
    }
    const first = reportedIndexRef.current === null;
    reportedIndexRef.current = index;
    // On mount, stay silent unless the requested position was corrected.
    if (first && index === Math.trunc(defaultIndex ?? 0)) {
      return;
    }
    onIndexChange?.(index);
  }, [index, defaultIndex, onIndexChange]);

  // The learner has moved, and the screen shows where to. Leaving a question
  // can complete a failure on it that was being offered a retry — see
  // `reportIfFinished` — so the set may be reportable now.
  useEffect(() => {
    if (indexRef.current === index) {
      return;
    }
    indexRef.current = index;
    latestRef.current?.reportIfFinished();
  }, [index]);

  // One panel per group, spanning the presented positions of its questions.
  const stimulusMounts = useMemo<StimulusMount[]>(() => {
    const mounts = new Map<string, StimulusMount>();
    for (const slot of slots) {
      if (slot.group === undefined) {
        continue;
      }
      const entryKey = entryKeyOf(slot);
      const existing = mounts.get(entryKey);
      if (existing === undefined) {
        mounts.set(entryKey, { entryKey, group: slot.group, first: slot.index, last: slot.index });
      } else {
        existing.last = slot.index;
      }
    }
    return [...mounts.values()];
  }, [slots]);

  const total = slots.length;
  const current = slots[index];

  const go = (next: number): void => {
    setIndex(next);
  };

  /**
   * Fires the whole-set callbacks — once, together — when every slot is done
   * and no take is still on its way.
   *
   * **A take on its way holds the report.** A practice read-aloud records its
   * `responded` outcome the moment its take is stored, and its grade can land
   * after the last slot was filled; reporting then handed `onFinished` the raw
   * outcome, and the grade a moment later could never reach it. So a slot
   * whose latest take is being stored or judged is not done. The take states
   * come from the component itself, through the slot's channel, and every way a
   * take can end reports an end — a grade, a take with no grade, a failure
   * nobody can retry, an unmount — so a take that settles never holds a set.
   *
   * **So does a failure the learner can still retry, on the question in front
   * of them.** Reporting there reported a set whose answer "Try again" was about
   * to change: the retry stored and graded the take, and `onComplete` then
   * described a different set from the `onFinished` before it. Once the learner
   * moves to another question the failure no longer holds the report: the slot
   * completes as whatever it last stored, or as `unsubmitted` when that is
   * nothing — never as a `recording` of `null`, which is the blank a learner
   * chooses and a grader marks 0. `unsubmitted` is a `practice` outcome only:
   * an exam question with no stored take is unanswered, and the learner has a
   * blank to hand in if that is their answer.
   */
  const reportIfFinished = (): void => {
    const held = outcomesRef.current;
    const presented = outcomeSlotsRef.current;
    if (held === null || presented === null || reportedRef.current) {
      return;
    }
    const items: SequenceItemOutcome[] = [];
    for (const [at, outcome] of held.entries()) {
      const take = takesRef.current.get(at);
      if (take?.state === 'in-flight' || (take?.state === 'retryable' && at === indexRef.current)) {
        return;
      }
      const slot = presented[at];
      if (outcome !== null) {
        items.push(outcome);
      } else if (take?.state === 'retryable' && renderMode === 'practice' && slot !== undefined) {
        items.push({
          kind: 'unsubmitted',
          index: at,
          slotId: slot.slotId,
          activityId: slot.activity.id,
        });
      } else {
        return;
      }
    }
    reportedRef.current = true;
    onFinished?.(items);

    // `onComplete` predates deferred grading and promises ActivityResult[].
    // Fire it only when every slot really was scored, rather than inventing a
    // result for work nobody has graded — and only here, beside `onFinished`.
    const scored: ActivityResult[] = [];
    for (const item of items) {
      if (item.kind !== 'scored') {
        return;
      }
      scored.push(item.result);
    }
    onComplete?.(scored);
  };

  /**
   * Records a finished slot and reports the set when it is done — the one place
   * a slot's outcome is decided.
   *
   * **An outcome must come from the set on screen.** A grade can settle after
   * the paper changed — an assessment held across a swap of `activities`, or a
   * consumer's own renderer grading asynchronously — and it arrives through a
   * callback from the render that started it. Accepted, it landed in whatever
   * slot of the NEW paper had its index, and could report that paper fully
   * scored though nobody had answered it. Ids cannot tell the papers apart: a
   * new paper can reuse both the slot id and the activity id, and a loading
   * blip reuses every id there is. `generation` can: it is the set the callback
   * was handed out for, and it is refused unless that set is still current.
   *
   * **A slot that already holds an outcome is FINAL**: the first outcome wins,
   * so a renderer that reports twice keeps what it reported first. There is one
   * exception.
   *
   * **The exception is a `practice` read-aloud, and it is decided by `take`.**
   * That slot records `responded` when a take is stored, because a take that
   * comes back unscorable produces no grade at all and the slot would otherwise
   * stay `null` for ever. Each take has a number (`mintTake`), unique on the page
   * and larger for a later take, carried by everything the component reports
   * about it. The invariant:
   *
   * **The score and the response a slot holds always describe the same take.**
   *
   * - A `responded` for a newer take replaces whatever the slot holds, a grade
   *   included: `onSubmit` has already told the host about that take, so a
   *   grade kept for the older one would sit beside a response it does not
   *   grade.
   * - A `scored` lands only for the slot's latest take, once, and replaces that
   *   take's `responded`. A grade for any other take — one the learner has
   *   since replaced, even one still in flight when they did — is dropped
   *   rather than filed against a take it did not grade.
   * - A `restored` slot is never replaced: it was submitted before this mount,
   *   and a resumed attempt must not be re-reported as if it had just been sat.
   *
   * A grade therefore lands once per take, and `onActivityComplete` — the
   * per-item hook, keyed by `slotId` — only ever grades the answer `onSubmit`
   * last reported for that slot. The whole-set callbacks stay once per set
   * whatever is replaced — see `reportedRef`.
   */
  const record = (outcome: SequenceItemOutcome, generation: number, take?: number): void => {
    const held = outcomesRef.current;
    if (held === null || generation !== setGenerationRef.current) {
      return;
    }
    const at = outcome.index;
    const holding = held[at];
    let accepted = outcome;
    if (take === undefined) {
      if (holding != null) {
        return;
      }
    } else {
      if (holding?.kind === 'restored') {
        return;
      }
      const latest = takesRef.current.get(at);
      if (outcome.kind === 'responded') {
        // Older than the latest take, or a second answer for the same one.
        if (
          latest !== undefined &&
          (take < latest.take || (take === latest.take && latest.response !== undefined))
        ) {
          return;
        }
        takesRef.current.set(at, {
          take,
          // A take this pager hears of first through its answer — a consumer's
          // renderer has no channel — has nothing on its way.
          state: latest?.take === take ? latest.state : 'settled',
          response: outcome.response,
        });
      } else if (outcome.kind === 'scored') {
        // Only the latest take's grade, only once it was stored, and only once.
        if (latest?.take !== take || latest.response === undefined || holding?.kind === 'scored') {
          return;
        }
        accepted = { ...outcome, response: latest.response };
      } else {
        return;
      }
    }
    const next = held.slice();
    next[at] = accepted;
    // Commit before firing anything: a second record() in the same tick must
    // see this one.
    outcomesRef.current = next;

    if (accepted.kind === 'scored') {
      onActivityComplete?.(accepted.result, accepted.index, accepted.slotId);
    }
    reportIfFinished();
  };

  /**
   * What a slot's channel reports: the state of one of its takes. A take older
   * than the slot's latest has been replaced, and a report from a set that is
   * no longer current, or reaching a pager that is unmounting, describes
   * nothing on screen.
   */
  const updateTake = (generation: number, at: number, take: number, state: TakeState): void => {
    if (!aliveRef.current || generation !== setGenerationRef.current) {
      return;
    }
    const latest = takesRef.current.get(at);
    if (latest !== undefined && take < latest.take) {
      return;
    }
    // A newer take starts with no answer of its own: the response the slot
    // holds belongs to the take before it until this one is stored.
    takesRef.current.set(at, latest?.take === take ? { ...latest, state } : { take, state });
    reportIfFinished();
  };
  // Channels keep one identity for a whole set, so they call through this ref
  // and always reach the latest render's props.
  latestRef.current = { updateTake, reportIfFinished };

  /** The channel a slot's pane hands its content: its capture group and its takes. */
  const channelFor = (slot: SequenceSlot<RenderableActivity>): SequenceSlotChannel => {
    const key = `${slot.index}::${slot.slotId}`;
    let channel = channelsRef.current.get(key);
    if (channel === undefined) {
      const generation = setGeneration;
      const at = slot.index;
      channel = {
        captureGroup: `${captureScope}::${slot.slotId}`,
        takeState: (take, state) => {
          latestRef.current?.updateTake(generation, at, take, state);
        },
      };
      channelsRef.current.set(key, channel);
    }
    return channel;
  };

  if (!current) {
    return <div className="lk-seq" />;
  }

  // Every budgeted recording this paper presents, and the key it is budgeted
  // under. Derived from the resolved policy, so the pager, the plan and the
  // schema cannot disagree about what is budgeted.
  const budgetedMedia = slots.flatMap((slot) => {
    const found: { key: string; url: string }[] = [];
    const own = (slot.activity as { media?: ActivityMedia }).media;
    if (own !== undefined && resolvePlaybackPolicy(own).maxPlays !== null) {
      found.push({ key: slotMediaKey(slot.slotId), url: own.url });
    }
    const stimulus = slot.group?.stimulus.media;
    if (stimulus !== undefined && resolvePlaybackPolicy(stimulus).maxPlays !== null) {
      found.push({ key: stimulusMediaKey(slot.slotId), url: stimulus.url });
    }
    return found;
  });

  const budgetEnforced = mediaBudget?.enforced ?? renderMode !== 'review';

  if (budgetedMedia.length > 0 && renderMode === 'exam' && budgetEnforced) {
    if (mediaBudget?.onPlayConsumed === undefined) {
      throw new Error(
        'ActivitySequence: renderMode "exam" with media that declares `maxPlays` requires ' +
          '`mediaBudget.onPlayConsumed`. The SDK persists nothing, so without it the count lives ' +
          'only in this mount: a refresh silently restores the full budget, and a paper that ' +
          'grants unlimited plays while showing "2 plays remaining" is indistinguishable — to the ' +
          'learner and to an appeal — from one that works. Budgeted media: ' +
          `${[...new Set(budgetedMedia.map((m) => m.key))].join(', ')}.`,
      );
    }
    const resuming =
      (responses !== undefined && Object.keys(responses).length > 0) ||
      (submittedSlotIds !== undefined && submittedSlotIds.length > 0);
    if (resuming && mediaBudget.plays === undefined) {
      throw new Error(
        'ActivitySequence: this is a resumed attempt (`responses`/`submittedSlotIds` were ' +
          'supplied) but `mediaBudget.plays` is absent. A resume that omits the ledger hands the ' +
          'learner a fresh budget at exactly the moment it matters. Pass ' +
          '`restoreMediaPlayLedger(plan, stored).entries`, or `{}` to state explicitly that ' +
          'nothing was spent.',
      );
    }
  }

  // One recording must not carry two budgets, in any mode — six questions each
  // holding the same clip at maxPlays 2 is twelve plays of one recording.
  const keysByUrl = new Map<string, Set<string>>();
  for (const { key, url } of budgetedMedia) {
    const keys = keysByUrl.get(url) ?? new Set<string>();
    keys.add(key);
    keysByUrl.set(url, keys);
  }
  for (const [url, keys] of keysByUrl) {
    if (keys.size > 1) {
      throw new Error(
        `ActivitySequence: media ${JSON.stringify(url)} is budgeted under ${keys.size} separate ` +
          `keys (${[...keys].join(', ')}), so one recording grants ${keys.size} × maxPlays. Put ` +
          "the questions that share a recording in an item group — a group's stimulus is one " +
          'recording with one budget.',
      );
    }
  }

  /** The per-media binding handed to a component or to the stimulus panel. */
  const bindingFor = (
    key: string,
    slot: { slotId: string; index: number; activity: { id: string } },
  ): MediaBudgetBinding | undefined => {
    if (mediaBudget === undefined) {
      return undefined;
    }
    const entry =
      mediaSeedsApply && mediaPlays !== undefined && Object.hasOwn(mediaPlays, key)
        ? mediaPlays[key]
        : undefined;
    return {
      key,
      slotId: slot.slotId,
      index: slot.index,
      activityId: slot.activity.id,
      ...(entry !== undefined ? { entry } : {}),
      ...(mediaBudget.enforced !== undefined ? { enforced: mediaBudget.enforced } : {}),
      ...(mediaBudget.onPlayConsumed !== undefined
        ? { onPlayConsumed: mediaBudget.onPlayConsumed }
        : {}),
      ...(mediaBudget.onPlayRefunded !== undefined
        ? { onPlayRefunded: mediaBudget.onPlayRefunded }
        : {}),
      ...(mediaBudget.onPosition !== undefined ? { onPosition: mediaBudget.onPosition } : {}),
      ...(mediaBudget.strings !== undefined ? { strings: mediaBudget.strings } : {}),
    };
  };

  /**
   * The per-slot recording binding handed to a read-aloud, modelled on
   * `bindingFor`: the sequence-level methods are called with the slot they
   * belong to, and `assess` / `playbackUrl` are copied only when the consumer
   * supplied them — a binding carrying `assess: undefined` is a binding the
   * component would try to call.
   *
   * It watches nothing. The pager used to watch the promises it handed out to
   * decide when a set was finished, and a promise knows nothing of the take
   * that asked for it: a late failure from a paper no longer on screen landed
   * in a new paper that reused the slot's ids, as a blank. What a take came to
   * is reported by the component, numbered by take, through the slot's channel
   * — see `record` and `reportIfFinished`.
   *
   * A consumer's own renderer is handed no binding.
   */
  const recordingBindingFor = (slot: {
    slotId: string;
    index: number;
    activity: { id: string };
  }): RecordingBinding | undefined => {
    if (recordingBinding === undefined) {
      return undefined;
    }
    const at: SequenceRecordingSlot = {
      slotId: slot.slotId,
      index: slot.index,
      activityId: slot.activity.id,
    };
    const { assess, playbackUrl } = recordingBinding;
    // Called on the binding, so a consumer's binding written as a class keeps
    // its `this`.
    return {
      upload: (take) => recordingBinding.upload(take, at),
      ...(assess !== undefined
        ? { assess: (ref: RecordingRef) => assess.call(recordingBinding, ref, at) }
        : {}),
      ...(playbackUrl !== undefined
        ? { playbackUrl: (ref: RecordingRef) => playbackUrl.call(recordingBinding, ref, at) }
        : {}),
    };
  };

  const forwarded = {
    ...(onInteraction ? { onInteraction } : {}),
    renderMode,
    ...(sanitizeHtml ? { sanitizeHtml } : {}),
    ...(strings !== undefined ? { strings } : {}),
    ...(theme ? { theme } : {}),
    ...(locale ? { locale } : {}),
    ...(disabled ? { disabled } : {}),
  };

  const renderSlot = (slot: SequenceSlot<RenderableActivity>): React.JSX.Element => {
    const activity = slot.activity;
    const { slotId, index: slotIndex } = slot;
    const activityId = activity.id;
    const restored =
      seedsApply && responses !== undefined && Object.hasOwn(responses, slotId)
        ? responses[slotId]
        : undefined;
    const slotOutcome =
      outcomes !== undefined && Object.hasOwn(outcomes, slotId) ? outcomes[slotId] : undefined;
    const slotBinding = bindingFor(slotMediaKey(slotId), slot);
    // Whether this slot's answers are numbered by take — see `record`.
    const takesAnswers = renderMode === 'practice' && activity.type === 'read-aloud';
    const childProps = {
      // `defaultValue`, not `value`: the learner must be able to keep editing
      // a restored answer. A controlled `value` would freeze it unless the
      // consumer also threaded state back, which is not what resume means.
      ...(restored !== undefined ? { defaultValue: restored } : {}),
      ...(seedsApply && submitted.has(slotId) ? { defaultSubmitted: true } : {}),
      ...(slotOutcome !== undefined ? { outcome: slotOutcome } : {}),
      onComplete: (result: ActivityResult) =>
        record(
          { kind: 'scored', index: slotIndex, slotId, activityId, result },
          setGeneration,
          // The take the grade is for: stamped by `<ReadAloud>`, and for a
          // consumer's renderer, which cannot stamp one, the slot's latest.
          takesAnswers ? (takeOf(result) ?? takesRef.current.get(slotIndex)?.take) : undefined,
        ),
      onSubmit: (response: LearnerResponse) => {
        // A submit through a callback handed out for an earlier set is a
        // consumer renderer's late one, for a question no longer on screen: the
        // host would file it against whatever slot reuses these ids now.
        if (setGeneration !== setGenerationRef.current) {
          return;
        }
        onSubmit?.(response, { slotId, index: slotIndex, activityId });
        // Written responses are excluded in every mode because they report
        // something richer through `onSubmitted` a moment later, and the first
        // outcome wins.
        if (activity.type === 'written-response') {
          return;
        }
        // Outside `practice` the components do not grade, so a raw response is
        // the ONLY outcome this slot will ever produce — record it, or the set
        // could never complete and `onFinished` would be dead in exam mode.
        if (renderMode !== 'practice') {
          record(
            { kind: 'responded', index: slotIndex, slotId, activityId, response },
            setGeneration,
          );
          return;
        }
        // A `practice` read-aloud is the one type that can submit and then
        // produce no score: an unscorable take, an assessor that failed, or a
        // binding that stores without judging all end the attempt with nothing
        // to grade, and `onComplete` fires only on a grade. Recorded for its
        // take, so the grade that may still arrive for that take replaces it —
        // and a take recorded again replaces the one before, grade and all.
        if (takesAnswers) {
          record(
            { kind: 'responded', index: slotIndex, slotId, activityId, response },
            setGeneration,
            takeOf(response) ?? mintTake(),
          );
        }
      },
      ...forwarded,
      ...(slotBinding !== undefined ? { mediaBudget: slotBinding } : {}),
    };

    const CustomRenderer = renderers?.[activity.type];
    if (CustomRenderer) {
      return <CustomRenderer data={activity} {...childProps} />;
    }
    if (activity.type === 'multiple-choice') {
      return (
        <MultipleChoice
          data={activity}
          // The sequence seed reaches the OPTION shuffle too. Without it a
          // resumed or reviewed item invented a fresh per-mount order, so the
          // learner saw their answers against a different arrangement than the
          // one they sat — the exact reproducibility the attempt id is for.
          {...(shuffleSeed !== undefined ? { shuffleSeed } : {})}
          {...childProps}
        />
      );
    }
    if (activity.type === 'fill-in-the-blanks') {
      return <FillInTheBlanks data={activity} {...childProps} />;
    }
    if (activity.type === 'gap-select') {
      return (
        <GapSelect
          data={activity}
          // The sequence seed reaches the per-gap choice shuffle too, for the
          // same reason it reaches MultipleChoice's options: a resumed or
          // reviewed item that dealt a fresh order would show the learner
          // their answers against an arrangement they never sat.
          {...(shuffleSeed !== undefined ? { shuffleSeed } : {})}
          {...childProps}
        />
      );
    }
    if (activity.type === 'dictation') {
      // Nothing to seed: a dictation shuffles nothing. Outside `practice` its
      // raw response is recorded through `onSubmit` above, like MC/FIB/GS.
      return <Dictation data={activity} {...childProps} />;
    }
    if (activity.type === 'read-aloud') {
      const slotRecordingBinding = recordingBindingFor(slot);
      const slotAssessment =
        assessments !== undefined && Object.hasOwn(assessments, slotId)
          ? assessments[slotId]
          : undefined;
      return (
        <ReadAloud
          data={activity}
          // The whole bag, nothing subtracted — unlike the written-response
          // branch below, which drops `onComplete` because it never grades. A
          // read-aloud needs it in `practice`, where a returned grade is a
          // score like any other, and simply never calls it in `exam`.
          {...childProps}
          // No capture group here: the slot's pane hands it down through
          // `SequenceSlotContext`, so it is no prop of the public component.
          {...(slotRecordingBinding !== undefined
            ? { recordingBinding: slotRecordingBinding }
            : {})}
          {...(slotAssessment !== undefined ? { assessment: slotAssessment } : {})}
          {...(workletUrl !== undefined ? { workletUrl } : {})}
        />
      );
    }
    if (activity.type === 'written-response') {
      // Derived from the SAME bag the other two get, minus the one prop this
      // component genuinely does not have. Listing the props by hand is what
      // made this the branch left behind three separate times —
      // `defaultSubmitted`, the redacted-in-`practice` guard and the media
      // budget were each added to `childProps` and each silently missed here.
      // Subtracting from the shared bag cannot forget a prop that is added to
      // it; listing them can.
      const { onComplete: _neverGrades, ...writtenResponseProps } = childProps;
      return (
        <WrittenResponse
          data={activity}
          {...writtenResponseProps}
          onSubmitted={(submission) =>
            record(
              { kind: 'submitted', index: slotIndex, slotId, activityId, submission },
              setGeneration,
            )
          }
        />
      );
    }
    return (
      <div className="lk-seq-unsupported" role="note">
        {s.unsupportedActivity}
      </div>
    );
  };

  const currentEntryKey = entryKeyOf(current);

  return (
    <div className="lk-seq" lang={locale}>
      <div className="lk-seq-progress" aria-live="polite" role="status">
        {s.questionProgress(index + 1, total)}
      </div>

      {/*
        Each group's stimulus is mounted ONCE and only hidden while the current
        question is outside its group. That — not re-rendering it per slot — is
        what makes the passage the same DOM node throughout, and what lets a
        recording keep its position between questions of one group.

        It sits BESIDE the question region, not inside it. Inside, every
        navigation dropped focus onto a container whose first content was the
        whole passage: the region promised "Question 3 of 5" and then began
        with the passage, keyboard users tabbed through the stimulus (audio
        controls included) before reaching the question, and the passage was a
        landmark nested inside another landmark. As a sibling it stays a
        landmark the learner can jump back to, while focus lands on the
        question that was actually navigated to.
      */}
      {stimulusMounts.map(({ entryKey, group, first, last }) => {
        // `setKey` leads for the same reason it does on a slot pane: entry keys
        // are short and repeat across papers, so a set change to a DIFFERENT
        // paper that happens to reuse an entry key would not remount this
        // panel — and a mount-only budget seed would leak into the next paper.
        const firstSlot = slots[first];
        const stimulusBinding =
          firstSlot === undefined
            ? undefined
            : bindingFor(stimulusMediaKey(firstSlot.slotId), firstSlot);
        return (
          <SequencePane
            className="lk-seq-stimulus"
            hidden={entryKey !== currentEntryKey}
            key={`${setKey}::group-${entryKey}`}
          >
            <StimulusPanel
              stimulus={group.stimulus}
              range={{ first: first + 1, last: last + 1 }}
              renderMode={renderMode}
              {...(sanitizeHtml ? { sanitizeHtml } : {})}
              {...(locale ? { locale } : {})}
              {...(onInteraction ? { onInteraction } : {})}
              {...(disabled ? { disabled } : {})}
              {...(strings !== undefined ? { strings } : {})}
              {...(stimulusBinding !== undefined ? { mediaBudget: stimulusBinding } : {})}
            />
          </SequencePane>
        );
      })}

      <section
        className="lk-seq-question"
        ref={regionRef}
        tabIndex={-1}
        aria-label={s.questionProgress(index + 1, total)}
      >
        {/*
          Every slot stays MOUNTED; only the current one is visible. Rendering
          just the current activity unmounted the others, so navigating back to
          an answered question showed it blank and re-answerable — the learner
          silently lost their answer and a second submit fired completion
          again. `hidden` removes the inactive slots from the accessibility
          tree and from tab order, so only the current question is reachable.
        */}
        {slots.map((slot) => {
          // The slot id (authored position) plus the activity id: the same
          // activity may legitimately fill two slots, and each must keep its
          // own answer state; and a different activity in the same slot must
          // remount rather than inherit the previous one's state.
          //
          // `setKey` leads, so a set change remounts every child. Without it a
          // pure REORDER changed `setKey` — clearing the outcomes — while each
          // child kept its key and therefore its `completed` state. Those
          // slots could not be answered again and no outcome would ever refill
          // them, so the sequence could never finish. A reset has to reset
          // both halves or neither. A parent re-creating a structurally
          // identical array leaves `setKey` untouched, so answers still
          // survive that.
          const slotKey = `${setKey}::slot-${slot.slotId}-${slot.activity.id}`;
          return (
            <SequencePane
              className="lk-seq-slot"
              hidden={slot.index !== index}
              // A channel for every slot, not just the ones that record: its
              // capture group is empty until something joins it, and a pane
              // that asked whether its activity records would have to know the
              // type of a renderer the consumer supplied.
              channel={channelFor(slot)}
              key={slotKey}
            >
              {renderSlot(slot)}
            </SequencePane>
          );
        })}
      </section>

      <div className="lk-seq-nav">
        <button
          type="button"
          className="lk-seq-prev"
          onClick={() => go(index - 1)}
          disabled={index === 0}
        >
          {s.previous}
        </button>
        <button
          type="button"
          className="lk-seq-next"
          onClick={() => go(index + 1)}
          disabled={index === total - 1}
        >
          {s.next}
        </button>
      </div>
    </div>
  );
}
