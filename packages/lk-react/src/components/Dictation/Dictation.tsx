'use client';

import {
  type ActivityMedia as ActivityMediaData,
  ActivitySchemaError,
  alignDictation,
  assertRedacted,
  DICTATION_MAX_TEXT_LENGTH,
  type DictationAlignment,
  type DictationCharOp,
  type DictationData,
  type DictationLearnerResponse,
  type DictationWordAlignment,
  diffDictationChars,
  type LearnerResponse,
  type MediaPlaybackPolicy,
  type ScoringDetail,
  type ScoringResult,
  score,
  validateActivity,
  xAPIBuilder,
  xapiDefinitionFor,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useActivityState } from '../../hooks/useActivityState.js';
import { characterDirectionOf, localeDirectionOf, textDirectionOf } from '../../i18n/direction.js';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ANONYMOUS_ACTOR, isDevelopment, objectIdFor } from '../_internal.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';
import type { ActivityProps, Renderable } from '../types.js';

// Nothing shuffles and nothing is seeded, so the shared contract is the whole
// contract. Kept as an interface so a later prop lands here, not in a union.
export interface DictationProps extends ActivityProps<DictationData> {}

/** How long the learner has to stop typing before one `text-changed` is emitted. */
const TEXT_CHANGED_DEBOUNCE_MS = 500;

/**
 * Present for assistive technology, invisible on screen. Inline rather than
 * left to the optional skin: the per-word sentences are the marks' only
 * channel for a screen reader, and without this a page that does not load the
 * skin would show every one of them beside its word.
 */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Names playback groups. Per mount and never derived from `useId`: two
 * separately hydrated roots derive the same id for the same tree position, and
 * their recordings would pause each other. The name never reaches the DOM.
 */
let recordingsGroupCount = 0;

/**
 * A token with nothing spelled in it, as the scorer reads it once composed:
 * only punctuation, control, format and default-ignorable characters, the acute
 * accent, grave accent (and its fullwidth form) and modifier apostrophe the
 * scorer folds into an apostrophe, and the Arabic tatweel and N'Ko lajanyalan
 * it removes.
 */
const UNSPELLED_RE = new RegExp(
  `^[\\p{P}\\p{Cc}\\p{Cf}\\p{Default_Ignorable_Code_Point}${String.fromCodePoint(0xb4, 0x60, 0xff40, 0x2bc, 0x640, 0x7fa)}]*$`,
  'u',
);
/**
 * Spacing as the scorer reads it: whitespace and NEXT LINE — but not the
 * byte-order mark, which JavaScript counts as whitespace and the scorer
 * removes as a format character, joining the letters on either side.
 */
const HINT_SPACE_RE = new RegExp(
  `(?:(?!${String.fromCodePoint(0xfeff)})\\s|${String.fromCodePoint(0x85)})+`,
  'u',
);
/** A title with something in it a screen reader can say. */
const VISIBLE_TEXT_RE = /[^\p{White_Space}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

const BULLET = '•';
const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);
const RIGHT_TO_LEFT_MARK = String.fromCodePoint(0x200f);
/**
 * Code points a font draws onto the character before them rather than beside
 * it — combining marks (variation selectors among them), the joiners, emoji
 * skin tones, tag characters, the vowel and final jamo of an old Hangul
 * syllable, and the Thai and Lao SARA AM, whose ring the font sets on the
 * consonant before — so their own span can have no width to decorate.
 */
const EXTENDING_RE = new RegExp(
  `^[\\p{M}${String.fromCodePoint(0x200c, 0x200d, 0xe33, 0xeb3)}${String.fromCodePoint(0x1f3fb)}-${String.fromCodePoint(0x1f3ff)}${String.fromCodePoint(0xe0020)}-${String.fromCodePoint(0xe007f)}${String.fromCodePoint(0x1160)}-${String.fromCodePoint(0x11ff)}${String.fromCodePoint(0xd7b0)}-${String.fromCodePoint(0xd7ff)}]$`,
  'u',
);
/**
 * Viramas that stack the letter after them into one glyph without asking —
 * Devanagari, Bengali, Gujarati, Oriya, Telugu, Kannada and Malayalam, the
 * Burmese stacker, the Khmer coeng, and the Tai Tham, Balinese, Javanese,
 * Chakma and Brahmi signs. Not the Tamil, Gurmukhi or Sinhala virama, which is
 * drawn visibly and leaves most letters after it on their own.
 */
const STACKING_VIRAMAS = new Set(
  [
    0x94d, 0x9cd, 0xacd, 0xb4d, 0xc4d, 0xccd, 0xd4d, 0x1039, 0x17d2, 0x1a60, 0x1b44, 0xa9c0,
    0x11046, 0x11133,
  ].map((point) => String.fromCodePoint(point)),
);
/**
 * The letters a visible virama still draws into the letter before it: the
 * Gurmukhi RA, YA and VA, which fonts set under the consonant, and the Tamil
 * conjuncts KSSA (க்ஷ) and SHRII (ஸ்ரீ), which fonts draw as one glyph —
 * each keyed by its letter, virama and the letter before the virama.
 */
const SUBJOINED_AFTER = new Map<string, (before: readonly string[]) => boolean>([
  ...[0xa30, 0xa2f, 0xa35].map(
    (point) =>
      [
        String.fromCodePoint(point),
        (before: readonly string[]) => before.at(-1) === String.fromCodePoint(0xa4d),
      ] as const,
  ),
  [
    String.fromCodePoint(0xbb7),
    (before: readonly string[]) =>
      before.at(-1) === String.fromCodePoint(0xbcd) &&
      before.at(-2) === String.fromCodePoint(0xb95),
  ],
  [
    String.fromCodePoint(0xbb0),
    (before: readonly string[]) =>
      before.at(-1) === String.fromCodePoint(0xbcd) &&
      before.at(-2) === String.fromCodePoint(0xbb8),
  ],
]);
/** Viramas after which a zero-width joiner asks for a conjunct: every stacking one, and the Sinhala. */
const JOINABLE_VIRAMAS = new Set([...STACKING_VIRAMAS, String.fromCodePoint(0xdca)]);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
/**
 * Characters the font draws into the letter after them: MALAYALAM LETTER DOT
 * REPH, set on the consonant after it, and the MONGOLIAN VOWEL SEPARATOR, which
 * has no width of its own and changes the shape of the vowel after it.
 */
const PREPENDED = new Set([String.fromCodePoint(0xd4e), String.fromCodePoint(0x180e)]);
const ARABIC_LAM = String.fromCodePoint(0x644);
/** The alefs a lam before them fuses with into one glyph, in every Arabic font. */
const LIGATING_ALEFS = new Set(
  [0x622, 0x623, 0x625, 0x627, 0x671, 0x672, 0x673, 0x675].map((point) =>
    String.fromCodePoint(point),
  ),
);
const REGIONAL_INDICATOR_RE = /^[\u{1f1e6}-\u{1f1ff}]$/u;
const LETTER_RE = /^\p{L}$/u;
/** A letter of any script but Latin, Greek or Cyrillic, whose common ligatures are only decorative. */
const LETTER_WITH_REQUIRED_LIGATURES_RE =
  /(?![\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{L}/u;
const DIGIT_RE = /^\p{Nd}$/u;
/**
 * Signs laid out with the European number beside them (bidirectional class
 * ET): the currency signs, the degree, plus-minus and per-mille signs.
 */
const NUMBER_SIGN_RE = new RegExp(
  `^[\\p{Sc}${String.fromCodePoint(0xb0, 0xb1, 0x2030, 0x2031, 0x212e, 0x2213)}]$`,
  'u',
);
/** Letters of the Arabic, Syriac and Thaana blocks and their presentation forms: before them, a European number is not one. */
const ARABIC_LETTER_BLOCKS: readonly (readonly [number, number])[] = [
  [0x0600, 0x07bf],
  [0x0860, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
];

/**
 * The text out of a `LearnerResponse`. A response of another activity type
 * reads as nothing typed rather than throwing — a controlled host that has not
 * yet swapped its state on an activity change would otherwise crash the attempt.
 */
function textOf(response: LearnerResponse | undefined): string {
  return response !== undefined && response.type === 'dictation' ? response.text : '';
}

/** The hint count out of a `LearnerResponse`; absent or another type reads as none. */
function hintsOf(response: LearnerResponse | undefined): number {
  if (response === undefined || response.type !== 'dictation') {
    return 0;
  }
  const revealed = response.hintsRevealed;
  return typeof revealed === 'number' && Number.isInteger(revealed) && revealed > 0 ? revealed : 0;
}

/** The response this component emits; `hintsRevealed` is written only when there is one. */
function responseOf(text: string, hintsRevealed: number): DictationLearnerResponse {
  return { type: 'dictation', text, ...(hintsRevealed > 0 ? { hintsRevealed } : {}) };
}

/**
 * The slower recording as an `ActivityMedia`: it follows the recording's
 * playback policy minus `maxPlays` (`controls`, `seek`, `rate`, the native
 * hints), so a locked scrubber or a fixed speed binds both files — and it never
 * carries a budget of its own, so `<ActivityMedia>` never demands a binding
 * for it. `undefined` when there is no slow recording.
 */
function slowMediaFor(
  data: Renderable<DictationData>,
  label: string,
): ActivityMediaData | undefined {
  const slow = data.slowMedia;
  if (slow === undefined) {
    return undefined;
  }
  const policy: MediaPlaybackPolicy = data.media?.playback ?? {};
  const { maxPlays: _budget, ...inherited } = policy;
  const hasPolicy = Object.values(inherited).some((value) => value !== undefined);
  return {
    type: 'audio',
    url: slow.url,
    alt: slow.alt ?? label,
    ...(hasPolicy ? { playback: inherited } : {}),
  };
}

/**
 * The transcript's words as a learner would read them: raw, in order, split at
 * whitespace. A token with nothing in it that is spelled — a dash, an ellipsis
 * — is joined to the word before it (or to the first word, when it leads), so
 * every reveal shows a word. A script written without spaces is one token, so
 * one reveal shows the whole sentence.
 */
function hintWordsOf(transcript: string): string[] {
  const words: string[] = [];
  let leading = '';
  for (const token of transcript.split(HINT_SPACE_RE)) {
    if (token === '') {
      continue;
    }
    const last = words.length - 1;
    // Composed first: the Greek varia and oxia decompose to the grave and acute
    // accents, which the scorer folds into an apostrophe and removes.
    if (!UNSPELLED_RE.test(token.normalize('NFC'))) {
      words.push(leading === '' ? token : `${leading} ${token}`);
      leading = '';
    } else if (last >= 0) {
      words[last] = `${words[last]} ${token}`;
    } else {
      leading = leading === '' ? token : `${leading} ${token}`;
    }
  }
  return words;
}

/**
 * Word marks rebuilt from stored scoring details — a server-recorded mark
 * shown after an exam, with no transcript on the client. Extras are not in the
 * details (the scorer writes one per transcript word), so none appear.
 */
function wordsFromDetails(details: readonly ScoringDetail[]): DictationWordAlignment[] | null {
  if (details.length === 0 || !details.every((detail) => /^w\d+$/.test(detail.itemId))) {
    return null;
  }
  return details.map((detail) => {
    const attempt = Array.isArray(detail.learnerResponse)
      ? detail.learnerResponse.join(' ')
      : detail.learnerResponse;
    const reference = Array.isArray(detail.correctResponse)
      ? detail.correctResponse.join(' ')
      : detail.correctResponse;
    const correct = detail.outcome !== undefined ? detail.outcome === 'correct' : detail.correct;
    const missing = detail.outcome === 'incorrect-omission' || (!correct && attempt === '');
    return {
      itemId: detail.itemId,
      reference,
      attempt,
      similarity: detail.score ?? (correct ? 1 : 0),
      status: correct ? 'correct' : missing ? 'missing' : 'incorrect',
    };
  });
}

/** A run of character operations drawn as one glyph cluster, and how it is marked. */
interface MarkedCluster {
  op: DictationCharOp['op'];
  text: string;
}

/**
 * Whether `shown`, the character an operation displays, is drawn into the
 * cluster whose characters so far are `before`: a mark, a joiner or a skin tone
 * onto its base, a letter stacked under a virama, an alef fused with the lam
 * before it, the second half of a flag.
 */
function extendsCluster(before: readonly string[], shown: string): boolean {
  const previous = before.at(-1) as string;
  if (EXTENDING_RE.test(shown)) {
    return true;
  }
  if (LETTER_RE.test(shown)) {
    if (
      STACKING_VIRAMAS.has(previous) ||
      PREPENDED.has(previous) ||
      SUBJOINED_AFTER.get(shown)?.(before) === true
    ) {
      return true;
    }
    if (previous === ZERO_WIDTH_JOINER && JOINABLE_VIRAMAS.has(before.at(-2) as string)) {
      return true;
    }
  }
  if (previous === ARABIC_LAM && LIGATING_ALEFS.has(shown)) {
    return true;
  }
  return (
    REGIONAL_INDICATOR_RE.test(shown) &&
    before.length % 2 === 1 &&
    before.every((character) => REGIONAL_INDICATOR_RE.test(character))
  );
}

/** The character an operation stands for: what should have been typed, or what was typed in excess. */
function characterOf(op: DictationCharOp): string {
  return op.reference === '' ? op.attempt : op.reference;
}

function isArabicLetter(character: string | undefined): boolean {
  const point = character?.codePointAt(0);
  return (
    point !== undefined &&
    LETTER_RE.test(character as string) &&
    ARABIC_LETTER_BLOCKS.some(([first, last]) => point >= first && point <= last)
  );
}

/**
 * The directions missing characters' bullets are laid out in, by operation
 * index, worked out in two passes over the operations rather than a search
 * per bullet: a word of 2,000 emoji missing its letters took seconds to draw.
 *
 * A bullet takes the character's own direction when it has one — a digit runs
 * left to right, unless it is a digit of a right-to-left script. A currency,
 * degree or per-mille sign beside a digit is laid out with that number, left to
 * right, unless an Arabic letter comes before it, after which the number is not
 * a European one. Otherwise, for a space or a punctuation mark, it takes the
 * direction of the characters on both sides when they agree, and the content's
 * when they do not. A bare bullet is a neutral, which the bidirectional
 * algorithm would otherwise attach to the wrong side of a number or a word of
 * the other direction.
 */
function bulletDirections(
  ops: readonly DictationCharOp[],
  contentDir: 'ltr' | 'rtl' | undefined,
): Map<number, 'ltr' | 'rtl' | undefined> {
  const own = ops.map((op) => characterDirectionOf(characterOf(op)));
  const before: ('ltr' | 'rtl' | undefined)[] = [];
  const arabicBefore: boolean[] = [];
  let lastDirection: 'ltr' | 'rtl' | undefined;
  let lastLetterArabic = false;
  ops.forEach((op, index) => {
    before[index] = lastDirection;
    arabicBefore[index] = lastLetterArabic;
    lastDirection = own[index] ?? lastDirection;
    if (LETTER_RE.test(characterOf(op))) {
      lastLetterArabic = isArabicLetter(characterOf(op));
    }
  });
  const after: ('ltr' | 'rtl' | undefined)[] = [];
  let nextDirection: 'ltr' | 'rtl' | undefined;
  for (let index = ops.length - 1; index >= 0; index -= 1) {
    after[index] = nextDirection;
    nextDirection = own[index] ?? nextDirection;
  }
  const directions = new Map<number, 'ltr' | 'rtl' | undefined>();
  ops.forEach((op, index) => {
    if (op.op !== 'missing') {
      return;
    }
    const neighbourIsDigit = [ops[index - 1], ops[index + 1]].some(
      (neighbour) => neighbour !== undefined && DIGIT_RE.test(characterOf(neighbour)),
    );
    directions.set(
      index,
      own[index] ??
        (NUMBER_SIGN_RE.test(characterOf(op)) && neighbourIsDigit && !arabicBefore[index]
          ? 'ltr'
          : before[index] !== undefined && before[index] === after[index]
            ? before[index]
            : (contentDir ?? before[index] ?? after[index])),
    );
  });
  return directions;
}

/**
 * How a cluster is marked. One led by a missing character's bullet is missing,
 * whatever marks sit on the bullet: the character they belong to is not there.
 * Otherwise a cluster is marked as its wrong operations are when they agree —
 * a correct letter with an extra mark is `extra` — and as a substitution when
 * they do not.
 */
function clusterOpOf(ops: readonly DictationCharOp[]): DictationCharOp['op'] {
  if ((ops[0] as DictationCharOp).op === 'missing') {
    return 'missing';
  }
  const wrong = new Set(ops.map((op) => op.op).filter((kind) => kind !== 'equal'));
  if (wrong.size === 0) {
    return 'equal';
  }
  return wrong.size === 1 ? ([...wrong][0] as DictationCharOp['op']) : 'substitute';
}

/**
 * Character operations grouped into what is drawn as one cluster, so a wrong
 * combining mark, joiner or stacked letter marks the glyph it is drawn into —
 * alone, its span has no width, and its underline or strike would not be
 * painted at all. A missing character's bullet carries only the marks drawn
 * onto it, never a letter that is drawn apart. A missing character's bullet is
 * wrapped in the direction mark of the character it stands for. Consecutive
 * correct clusters are one run: an engine that shapes each element on its own
 * would otherwise draw a correctly typed conjunct or a joined Mongolian word
 * broken apart.
 */
function clustersOf(
  ops: readonly DictationCharOp[],
  contentDir: 'ltr' | 'rtl' | undefined,
): MarkedCluster[] {
  const bullets = bulletDirections(ops, contentDir);
  const groups: { ops: DictationCharOp[]; shown: string[]; bullet?: 'ltr' | 'rtl' }[] = [];
  ops.forEach((op, index) => {
    const shown = op.op === 'missing' ? BULLET : op.attempt;
    const current = groups.at(-1);
    if (
      current !== undefined &&
      op.op !== 'missing' &&
      ((current.ops[0] as DictationCharOp).op === 'missing'
        ? EXTENDING_RE.test(shown)
        : extendsCluster(current.shown, shown))
    ) {
      current.ops.push(op);
      current.shown.push(shown);
      return;
    }
    const direction = bullets.get(index);
    groups.push({
      ops: [op],
      shown: [shown],
      ...(direction !== undefined ? { bullet: direction } : {}),
    });
  });
  const clusters: MarkedCluster[] = [];
  for (const group of groups) {
    const mark =
      group.bullet === undefined
        ? ''
        : group.bullet === 'rtl'
          ? RIGHT_TO_LEFT_MARK
          : LEFT_TO_RIGHT_MARK;
    const cluster = { op: clusterOpOf(group.ops), text: `${mark}${group.shown.join('')}${mark}` };
    const previous = clusters.at(-1);
    if (previous !== undefined && previous.op === 'equal' && cluster.op === 'equal') {
      previous.text += cluster.text;
    } else {
      clusters.push(cluster);
    }
  }
  return clusters;
}

/**
 * Character-level edit operations as decoration. Hidden from assistive
 * technology as a whole: a screen reader must never verbalise surrogate or
 * combining fragments one by one, and the word list already carries the
 * meaning. Sighted colour-blind and forced-colors users still get one
 * decoration per state, which the skin draws and the legend explains.
 */
function CharOps({
  ops,
  contentDir,
}: {
  ops: readonly DictationCharOp[];
  contentDir: 'ltr' | 'rtl' | undefined;
}) {
  return clustersOf(ops, contentDir).map((cluster, index) => (
    <span
      // biome-ignore lint/suspicious/noArrayIndexKey: clusters are positional and recomputed whole
      key={index}
      className="lk-dc-op"
      data-op={cluster.op}
      // A run with no letter whose script needs its common ligatures: the skin
      // turns them off there, so a font's "fi" cannot draw a wrong "i" into one glyph.
      {...(LETTER_WITH_REQUIRED_LIGATURES_RE.test(cluster.text)
        ? {}
        : { 'data-ligatures': 'decorative' })}
      aria-hidden="true"
    >
      {cluster.text}
    </span>
  ));
}

/** What the live region says: the SDK's own sentences, then any authored feedback. */
interface Announcement {
  text: string;
  feedback: string | null;
}

/**
 * The announcement, with authored feedback in its own isolated span: its
 * direction is its own, so an English "Well heard." in an Arabic interface
 * keeps its full stop at its end. Its language is not guessed — feedback may be
 * written in the interface's language or the dictation's.
 */
function AnnouncementText({ announcement }: { announcement: Announcement | null }) {
  if (announcement === null) {
    return null;
  }
  return (
    <>
      {announcement.text}
      {announcement.feedback ? (
        <>
          {' '}
          <span dir="auto">{announcement.feedback}</span>
        </>
      ) : null}
    </>
  );
}

export function Dictation({
  data,
  onComplete,
  onSubmit,
  onChange,
  onInteraction,
  value,
  defaultValue,
  defaultSubmitted,
  renderMode = 'practice',
  outcome,
  mediaBudget,
  mediaStrings,
  strings,
  theme,
  locale,
  disabled,
}: DictationProps) {
  const isExam = renderMode === 'exam';
  const isReview = renderMode === 'review';
  const s = useLkStrings(strings);

  // Whether the payload carries the transcript at all — the KEY, not the
  // `redacted` marker. `redact(data, { reveal: 'after-submit' })` stamps
  // `redacted: true` on a projection that still has its transcript, and that
  // projection is exactly what a review screen hands this component. A type
  // test only: no content is read here, and none is read in `exam` below.
  const hasKey = typeof (data as { transcript?: unknown }).transcript === 'string';

  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    if (data.redacted === true) {
      if (hasKey) {
        // An after-submit projection: the strict redacted schema has no
        // `transcript`, so `assertRedacted` would throw on the one payload
        // this component exists to render in review. Check the public subset.
        const shape = data as { type?: unknown; id?: unknown; title?: unknown };
        return shape.type === 'dictation' &&
          typeof shape.id === 'string' &&
          typeof shape.title === 'string'
          ? null
          : new Error(
              'Dictation received a revealed projection (redacted: true with a transcript) that ' +
                'is not a dictation: `type`, `id` and `title` are required.',
            );
      }
      try {
        assertRedacted(data);
        return null;
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    }
    const result = validateActivity('dictation', data);
    return result.success ? null : new ActivitySchemaError('dictation', result.errors);
  }, [data, hasKey]);

  const { state, start, complete, getTimeSpent, reset } = useActivityState(
    defaultSubmitted === true ? 'completed' : 'idle',
  );
  const isControlled = value !== undefined;
  const [internalText, setInternalText] = useState<string>(() => textOf(defaultValue));
  const [internalRevealed, setInternalRevealed] = useState<number>(() => hintsOf(defaultValue));
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [summary, setSummary] = useState<Announcement | null>(null);
  const [solutionShown, setSolutionShown] = useState(false);

  const text = isControlled ? textOf(value) : internalText;
  const revealed = isControlled ? hintsOf(value) : internalRevealed;

  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    defaultValueRef.current = defaultValue;
  }, [defaultValue]);

  const defaultSubmittedRef = useRef(defaultSubmitted);
  useEffect(() => {
    defaultSubmittedRef.current = defaultSubmitted;
  }, [defaultSubmitted]);

  // Identity-guarded so the mount run is a no-op: without it this fires after
  // the first paint and undoes every seed it was just given (Req 3.7).
  const lastDataRef = useRef(data);
  useEffect(() => {
    if (lastDataRef.current === data) {
      return;
    }
    lastDataRef.current = data;
    setInternalText(textOf(defaultValueRef.current));
    setInternalRevealed(hintsOf(defaultValueRef.current));
    setResult(null);
    setSummary(null);
    setSolutionShown(false);
    reset(defaultSubmittedRef.current === true ? 'completed' : 'idle');
  }, [data, reset]);

  // `text-changed` is debounced so an autosaving host is not told about every
  // keystroke; only the length travels, never the text.
  const textChangedRef = useRef<{ timer: ReturnType<typeof setTimeout>; length: number } | null>(
    null,
  );
  useEffect(
    () => () => {
      if (textChangedRef.current !== null) {
        clearTimeout(textChangedRef.current.timer);
      }
    },
    [],
  );

  const revealButtonRef = useRef<HTMLButtonElement>(null);
  const ids = useId();
  const hintId = `${ids}-hint`;
  const titleId = `${ids}-title`;
  const solutionId = `${ids}-solution`;
  // Per mount, not per activity id: two renderings of one item on a page (a
  // review list of several attempts, a preview beside a sequence) are
  // separate players, and neither should pause the other's recordings.
  const [recordingsGroup] = useState(() => {
    recordingsGroupCount += 1;
    return `lk-dc-recordings-${recordingsGroupCount}`;
  });

  const slowMedia = useMemo(
    () => slowMediaFor(data, s.dictationSlowRecording),
    [data, s.dictationSlowRecording],
  );

  // All hooks are called before these throws, so hook order stays stable.
  if (devError) {
    throw devError;
  }
  // Practice grades locally, and a redacted projection has no answer key to
  // grade against — `score()` would throw RedactedScoringError from the submit
  // handler, where no error boundary can reach it and after the learner has
  // typed. Fail at render instead, in production too, as every built-in does.
  if (data.redacted === true && renderMode === 'practice') {
    throw new Error(
      `Dictation "${data.id}" received redacted activity data in renderMode "practice", ` +
        'which grades locally and has no answer key to grade against. ' +
        'Render redacted data with renderMode="exam" (server grades) or "review" (pass `outcome`).',
    );
  }

  const submitted = state === 'completed';
  const inactive = disabled === true || submitted || isReview;

  /**
   * Whether answer-key-derived information may be shown. Never in `exam`; in
   * `practice` only once this component has scored; in `review` only once the
   * caller supplies a SCORED outcome.
   */
  const revealing = isReview ? outcome?.status === 'scored' : !isExam && submitted;

  // The transcript, read only outside `exam`. `Renderable` says it is a
  // string; a plain redacted projection has none, so it is read defensively
  // and every consumer of it goes through `alignDictation`'s own guards.
  const transcript: string | undefined =
    isExam || !hasKey ? undefined : (data as { transcript: string }).transcript;

  // Hints exist only where the transcript does and nothing has been graded:
  // practice, before submit. A plain redacted projection has no words to give.
  const hintWords = useMemo(
    () => (transcript === undefined ? [] : hintWordsOf(transcript)),
    [transcript],
  );
  const hintsOffered =
    data.hints?.mode === 'progressive-words' && !isExam && !isReview && transcript !== undefined;
  const hintsEnabled = hintsOffered && !submitted;
  const hintTotal = hintWords.length;
  const hintsShown = Math.min(revealed, hintTotal);
  // What a response reports: the words actually shown, and none where no hint
  // can be — whatever count a seeded or controlled value carries.
  const reportedHints = hintsOffered ? hintsShown : 0;

  const fireInteraction = (
    type: 'text-changed' | 'hint-requested' | 'submitted',
    payload: Record<string, unknown>,
  ): void => {
    onInteraction?.({ type, activityId: data.id, timestamp: Date.now(), payload });
  };

  const flushTextChanged = (): void => {
    const pending = textChangedRef.current;
    if (pending === null) {
      return;
    }
    clearTimeout(pending.timer);
    textChangedRef.current = null;
    fireInteraction('text-changed', { length: pending.length });
  };

  const handleTextChange = (next: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    if (!isControlled) {
      setInternalText(next);
    }
    onChange?.(responseOf(next, reportedHints));
    if (onInteraction === undefined) {
      return;
    }
    if (textChangedRef.current !== null) {
      clearTimeout(textChangedRef.current.timer);
    }
    textChangedRef.current = {
      length: next.length,
      timer: setTimeout(() => {
        const pending = textChangedRef.current;
        textChangedRef.current = null;
        if (pending !== null) {
          fireInteraction('text-changed', { length: pending.length });
        }
      }, TEXT_CHANGED_DEBOUNCE_MS),
    };
  };

  const setRevealed = (next: number): void => {
    if (!isControlled) {
      setInternalRevealed(next);
    }
    onChange?.(responseOf(text, next));
  };

  const revealNextHint = (): void => {
    if (inactive || hintsShown >= hintTotal) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    const next = hintsShown + 1;
    setRevealed(next);
    fireInteraction('hint-requested', { revealed: next, total: hintTotal });
  };

  const resetHints = (): void => {
    if (inactive || hintsShown === 0) {
      return;
    }
    // The reset button leaves the page once nothing is revealed; hand focus to
    // the reveal button first, or the keyboard user lands on the page body.
    revealButtonRef.current?.focus();
    setRevealed(0);
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive) {
      return;
    }
    const response = responseOf(text, reportedHints);
    onSubmit?.(response);
    flushTextChanged();

    if (isExam) {
      // The client neither grades nor reveals: no score(), no read of the
      // transcript, no onComplete, and no xAPI statement — its
      // correctResponsesPattern IS the answer key.
      complete();
      setSummary({ text: s.answerSubmitted, feedback: null });
      fireInteraction('submitted', { length: text.length, hintsRevealed: reportedHints });
      return;
    }

    const scoringResult = score('dictation', data as DictationData, response);
    complete();
    const timeSpent = getTimeSpent();
    const xapiStatement = xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: {
        id: objectIdFor(data.id),
        name: { [data.locale ?? 'en-US']: data.title },
        ...xapiDefinitionFor(data),
      },
      scoringResult,
      timeSpentMs: timeSpent,
      response: response.text,
    });
    setResult(scoringResult);
    onComplete?.({
      score: scoringResult.score,
      maxScore: scoringResult.maxScore,
      passed: scoringResult.passed,
      timeSpent,
      xapiStatement,
    });
    const correctWords = scoringResult.details.filter(
      (detail) => (detail.outcome ?? (detail.correct ? 'correct' : 'incorrect')) === 'correct',
    ).length;
    setSummary({
      text: `${s.answerSubmitted} ${s.scoreAnnouncement(
        Math.round(scoringResult.score * 100),
        scoringResult.passed,
      )} ${s.dictationWordsSummary(correctWords, scoringResult.details.length)}`,
      feedback: scoringResult.feedback,
    });
    fireInteraction('submitted', {
      length: text.length,
      hintsRevealed: reportedHints,
      score: scoringResult.score,
    });
  };

  // A review may hold the key but not the learner's text — an outcome recorded
  // without its response. Recomputing from an empty box would contradict the
  // stored score, so the stored details are the record then.
  const given = isControlled ? value : defaultValue;
  const hasResponse = given !== undefined && given.type === 'dictation';
  // The dictation's language, and the direction its tag names when it names
  // one. Read defensively: stale data may carry a locale that is not a string.
  // A tag written with underscores reads as its hyphenated form, the only one `lang` accepts.
  const contentLang =
    typeof data.locale === 'string' ? data.locale.replaceAll('_', '-') : undefined;
  const localeDir = localeDirectionOf(data.locale);

  // The same comparison the scorer made — computed only when it may be shown.
  // The character diff is UI-only and needs memory proportional to the product
  // of the two lengths, so it lives here and nowhere near `score()`.
  const alignment = useMemo<DictationAlignment | null>(
    () =>
      revealing && transcript !== undefined && (!isReview || hasResponse)
        ? alignDictation(data, text)
        : null,
    [revealing, transcript, isReview, hasResponse, data, text],
  );
  const sentenceDiff = useMemo<DictationCharOp[] | null>(
    () =>
      alignment !== null && alignment.attempt !== ''
        ? diffDictationChars(alignment.reference, alignment.attempt)
        : null,
    [alignment],
  );

  // Review with no transcript on the client, or no response to recompute from:
  // a server-recorded mark still renders its word list from the stored details.
  const detailWords = useMemo<DictationWordAlignment[] | null>(
    () =>
      isReview && alignment === null && outcome?.status === 'scored'
        ? wordsFromDetails(outcome.details)
        : null,
    [isReview, alignment, outcome],
  );

  const words: DictationWordAlignment[] | null = alignment?.words ?? detailWords;
  const marksShown = revealing && words !== null;
  // The authored content's direction: from its language, or else from the first
  // letter of the transcript (or of the stored words, when only they are here).
  // Never `auto` on a container: its first strong character could be a hidden
  // interface sentence, or whatever the learner typed. `undefined` — no letter
  // anywhere — inherits the interface's.
  const contentDir =
    localeDir ??
    textDirectionOf(transcript ?? words?.map((word) => word.reference).join(' ') ?? '');
  // Nothing survived normalisation: from the alignment when there is one, and
  // from the stored details otherwise (every transcript word unanswered).
  const nothingTyped =
    alignment !== null
      ? alignment.attempt === ''
      : (words?.every((word) => word.attempt === '') ?? false);

  const passed = isReview
    ? outcome?.status === 'scored' || outcome?.status === 'graded'
      ? outcome.passed
      : undefined
    : result?.passed;

  const reviewSummary = useMemo<Announcement | null>(() => {
    if (!isReview || outcome === undefined) {
      return null;
    }
    if (outcome.status === 'scored') {
      return {
        text: s.scoreAnnouncement(Math.round(outcome.score * 100), outcome.passed),
        feedback: outcome.feedback,
      };
    }
    if (outcome.status === 'deferred') {
      return { text: s.notGradedYet, feedback: null };
    }
    if (outcome.status === 'graded') {
      const percent =
        outcome.maxScore > 0
          ? Math.round((outcome.score / outcome.maxScore) * 100)
          : Math.round(outcome.score * 100);
      return {
        text: s.scoreAnnouncement(percent, outcome.passed),
        feedback: outcome.feedback ?? null,
      };
    }
    return { text: s.noGradeAvailable, feedback: null };
  }, [isReview, outcome, s]);

  const sentenceFor = (word: DictationWordAlignment): string => {
    switch (word.status) {
      case 'correct':
        return s.dictationWordCorrect(word.attempt);
      case 'incorrect':
        return s.dictationWordWrong(word.attempt, word.reference);
      case 'missing':
        return s.dictationWordMissing(word.reference);
      default:
        return s.dictationWordExtra(word.attempt);
    }
  };

  const acceptedTranscripts: readonly string[] | undefined =
    transcript === undefined || !Array.isArray(data.acceptedTranscripts)
      ? undefined
      : data.acceptedTranscripts.filter((entry): entry is string => typeof entry === 'string');

  return (
    <form
      className="lk-dc"
      // A title with nothing to say would name the form with silence.
      aria-labelledby={VISIBLE_TEXT_RE.test(data.title) ? titleId : undefined}
      lang={locale}
      data-render-mode={renderMode}
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
      {/*
        The form's name: read from here, it keeps the content's language. A
        paragraph of its own, so without a language to go by its own first
        letter decides its direction.
      */}
      <p id={titleId} className="lk-dc-title" dir={localeDir ?? 'auto'} lang={contentLang}>
        {data.title}
      </p>

      {data.media !== undefined || slowMedia !== undefined ? (
        <div className="lk-dc-recordings">
          {/*
            Each recording is a named group (a fieldset with a legend, which is
            what `role="group"` plus a label spells natively), so the two
            transports are told apart by name and not only by position.
          */}
          {data.media !== undefined ? (
            <fieldset className="lk-dc-recording">
              <legend className="lk-dc-recording-label">{s.dictationRecording}</legend>
              {/* The ONLY budgeted recording: the binding is whatever the pager or the caller passes. */}
              <ActivityMedia
                media={data.media}
                renderMode={renderMode}
                playbackGroup={recordingsGroup}
                {...(mediaBudget !== undefined ? { mediaBudget } : {})}
                {...(mediaStrings !== undefined ? { mediaStrings } : {})}
                {...(strings !== undefined ? { strings } : {})}
                {...(onInteraction !== undefined ? { onInteraction } : {})}
                {...(locale !== undefined ? { locale } : {})}
                {...(disabled !== undefined ? { disabled } : {})}
              />
            </fieldset>
          ) : null}
          {slowMedia !== undefined ? (
            <fieldset className="lk-dc-recording" data-slow="true">
              <legend className="lk-dc-recording-label">{s.dictationSlowRecording}</legend>
              {/* No budget of its own, by contract — so no binding is passed and none is demanded. */}
              <ActivityMedia
                media={slowMedia}
                renderMode={renderMode}
                playbackGroup={recordingsGroup}
                {...(mediaStrings !== undefined ? { mediaStrings } : {})}
                {...(strings !== undefined ? { strings } : {})}
                {...(locale !== undefined ? { locale } : {})}
                {...(disabled !== undefined ? { disabled } : {})}
              />
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {hintsEnabled ? (
        <div className="lk-dc-hints">
          {/*
            aria-disabled, never disabled, once every word is shown: a natively
            disabled button drops keyboard focus to the page body.
          */}
          <button
            ref={revealButtonRef}
            type="button"
            className="lk-dc-hint-btn"
            disabled={inactive}
            aria-disabled={hintsShown >= hintTotal || undefined}
            onClick={revealNextHint}
          >
            {s.dictationRevealNextWord(hintsShown, hintTotal)}
          </button>
          {hintsShown > 0 ? (
            <button
              type="button"
              className="lk-dc-hint-reset"
              disabled={inactive}
              onClick={resetHints}
            >
              {s.dictationResetHints}
            </button>
          ) : null}
          {/* Rendered before it has content, so the live region exists when the first word lands. */}
          <p id={hintId} className="lk-dc-hint" role="status" dir={contentDir} lang={contentLang}>
            {hintsShown > 0
              ? `${hintWords.slice(0, hintsShown).join(' ')}${hintsShown < hintTotal ? ' …' : ''}`
              : ''}
          </p>
        </div>
      ) : null}

      <fieldset disabled={inactive}>
        <textarea
          className="lk-dc-input"
          aria-label={s.dictationInputLabel}
          aria-describedby={hintsEnabled && hintsShown > 0 ? hintId : undefined}
          // No content lang here: the element's accessible name is interface
          // text, and a screen reader voices a name in its element's language.
          dir="auto"
          rows={3}
          maxLength={DICTATION_MAX_TEXT_LENGTH}
          // Assessment integrity, not style: a corrected or completed word is
          // not the learner's spelling.
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={text}
          disabled={inactive}
          aria-disabled={inactive || undefined}
          data-correct={
            revealing && passed !== undefined && (!isReview || hasResponse)
              ? String(passed)
              : undefined
          }
          onChange={(event) => handleTextChange(event.target.value)}
        />
        {isReview ? null : (
          // Enabled on empty text: an omission is a recorded answer.
          <button type="submit" disabled={inactive}>
            {isExam ? s.submitAnswers : s.checkAnswers}
          </button>
        )}
      </fieldset>

      {marksShown ? (
        <div className="lk-dc-result">
          {nothingTyped ? (
            <p className="lk-dc-nothing" role="note">
              {s.dictationNothingTyped}
            </p>
          ) : (
            <>
              {/*
                The word list is the assistive-technology channel: one hidden
                sentence per word says what happened to it. The visible token,
                its glyph and its character marks are decoration.
              */}
              {/*
                The list's name and the hidden sentences are interface text, so
                they keep the interface language; only the typed tokens carry
                the dictation's. Its direction is the dictation's, never
                resolved from the list's own text: the first strong character
                there would be a hidden interface sentence, or whatever the
                learner typed. Each word's own text may resolve from itself.
              */}
              <ol className="lk-dc-words" aria-label={s.dictationMarksLabel} dir={contentDir}>
                {words?.map((word, index) => {
                  const sentence = sentenceFor(word);
                  return (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: alignment order is the identity; words repeat
                      key={index}
                      className="lk-dc-word"
                      data-state={word.status}
                      title={sentence}
                    >
                      <span className="lk-visually-hidden" style={VISUALLY_HIDDEN}>
                        {sentence}
                      </span>
                      <span
                        className="lk-dc-word-text"
                        aria-hidden="true"
                        dir={contentDir ?? 'auto'}
                        lang={contentLang}
                        // A wrong word drawn as its character marks: the marks
                        // carry the decoration, so the wrong characters stand
                        // out from the right ones by shape, not colour alone.
                        {...(word.status === 'incorrect' && alignment !== null
                          ? { 'data-marks': 'characters' }
                          : {})}
                      >
                        {word.status === 'incorrect' && alignment !== null ? (
                          <CharOps
                            ops={diffDictationChars(word.reference, word.attempt)}
                            contentDir={contentDir}
                          />
                        ) : word.status === 'missing' ? (
                          word.reference
                        ) : (
                          word.attempt
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {sentenceDiff !== null ? (
                <p className="lk-dc-diff" aria-hidden="true" dir={contentDir} lang={contentLang}>
                  <CharOps ops={sentenceDiff} contentDir={contentDir} />
                </p>
              ) : null}
              <ul className="lk-dc-legend">
                <li data-state="correct">{s.dictationLegendCorrect}</li>
                <li data-state="incorrect">{s.dictationLegendWrong}</li>
                <li data-state="missing">{s.dictationLegendMissing}</li>
                {alignment !== null ? <li data-state="extra">{s.dictationLegendExtra}</li> : null}
              </ul>
              <p className="lk-dc-diff-note">{s.dictationDiffNote}</p>
            </>
          )}
          {/*
            Offered after an empty answer too: a learner who could make out
            nothing is the one who most needs to read the sentence, and a
            single typed letter would reveal it anyway.
          */}
          {transcript !== undefined ? (
            <>
              <button
                type="button"
                className="lk-dc-solution-toggle"
                aria-expanded={solutionShown}
                aria-controls={solutionId}
                onClick={() => setSolutionShown((shown) => !shown)}
              >
                {solutionShown ? s.hideSolution : s.showSolution}
              </button>
              {solutionShown ? (
                <blockquote
                  id={solutionId}
                  className="lk-dc-solution"
                  aria-label={s.dictationSolutionLabel}
                  dir={contentDir}
                >
                  <p lang={contentLang}>{transcript}</p>
                  {acceptedTranscripts !== undefined && acceptedTranscripts.length > 0 ? (
                    <ul className="lk-dc-solution-alternatives" lang={contentLang}>
                      {acceptedTranscripts.map((alternative) => (
                        <li key={alternative}>{alternative}</li>
                      ))}
                    </ul>
                  ) : null}
                </blockquote>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <FeedbackRegion id={`${data.id}-feedback`}>
        <AnnouncementText announcement={isReview ? reviewSummary : summary} />
      </FeedbackRegion>
    </form>
  );
}
