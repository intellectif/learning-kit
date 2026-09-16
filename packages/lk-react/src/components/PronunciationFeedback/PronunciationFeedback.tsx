'use client';

import {
  ActivitySchemaError,
  alignReadAloud,
  type GradeRecord,
  type ReadAloudData,
  type ReadAloudWordAlignment,
  type SpeechAssessment,
  type SpeechPhoneme,
  type SpeechWord,
  type ThemeTokens,
  type ValidationResult,
  validateSpeechAssessment,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from 'react';
import { localeDirectionOf } from '../../i18n/direction.js';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStrings, LkStringsOverride } from '../../i18n/strings.js';
import { isDevelopment } from '../_internal.js';
import { percentOfGrade, readDimensions, readGrade } from '../shared/read-grade.js';

/**
 * Present for assistive technology, invisible on screen. Inline rather than
 * left to the optional skin, for the reason `<Dictation>` gives: the per-word
 * sentences are the marks' only channel for a screen reader, and a page that
 * does not load the skin would otherwise show every one of them beside its
 * word. Exported so `<ReadAloud>`, whose review fallback renders the same
 * marks from stored details, carries one definition rather than a copy.
 */
export const VISUALLY_HIDDEN: CSSProperties = {
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

/** The four marking states, in the order the legend lists them. */
const LEGEND_STATES: readonly ReadAloudWordAlignment['state'][] = [
  'correct',
  'mispronounced',
  'omitted',
  'inserted',
];

export interface PronunciationFeedbackProps {
  /**
   * The item's reading and its language. Only these two fields, because they
   * are the only ones a mark depends on — everything else about the activity
   * belongs to whoever rendered it.
   */
  data: Pick<ReadAloudData, 'referenceText' | 'locale'>;
  /**
   * The assessor's evidence. Checked with `validateSpeechAssessment` before it
   * is aligned: see the note on this component about what a bad one costs.
   */
  assessment: SpeechAssessment;
  /**
   * The grade the evidence produced, when one exists. Its `criteria` are what
   * the dimensions are read from, because they are the numbers the learner was
   * actually graded on. A grade that cannot be read — a score that is not a
   * number between 0 and its maximum, a `passed` that is not a boolean — is
   * shown as could-not-be-graded, never as a percentage made up from it.
   */
  grade?: GradeRecord;
  /**
   * The learner's own take, playable. With it, each word that carries timings
   * gets a button that plays just that word.
   */
  audioUrl?: string;
  /**
   * Confidence above which a break note is shown, 0..1. **No default**: how
   * confident an engine has to be before a pause is worth telling a learner
   * about is a calibration, and the SDK has no calibrated answer. Without it no
   * break note is shown at all.
   */
  breakThreshold?: number;
  /** The same, for the monotone note read off `assessment.prosody`. */
  monotoneThreshold?: number;
  /**
   * BCP 47 tag stamped as `lang` on the root: the INTERFACE language, the one
   * this component's own sentences are written in. It is not `data.locale`,
   * which is the language of the reading and is put on the words themselves.
   */
  locale?: string;
  /** Per-instance token overrides, applied as inline CSS vars on the root. */
  theme?: Partial<ThemeTokens>;
  /** Overrides the SDK's chrome text for this panel. See {@link LkIntlProvider}. */
  strings?: LkStringsOverride;
}

/**
 * What the validator says about evidence that may not even be readable. Its
 * cross-field rules read the value directly, so a getter that throws escapes
 * it — and evidence that cannot be read is evidence refused, not a reason to
 * take the grade beside it down.
 */
function checkEvidence(assessment: unknown): ValidationResult<SpeechAssessment> {
  try {
    return validateSpeechAssessment(assessment);
  } catch {
    return {
      success: false,
      errors: [{ path: [], message: 'The assessment could not be read.', code: 'unreadable' }],
    };
  }
}

/** Whether a word carries anything a disclosure would have to show. */
function hasDetail(word: SpeechWord | undefined): word is SpeechWord {
  if (word === undefined) {
    return false;
  }
  return (
    word.accuracy !== undefined ||
    (word.syllables !== undefined && word.syllables.length > 0) ||
    (word.phonemes !== undefined && word.phonemes.length > 0) ||
    word.breaks !== undefined ||
    (typeof word.startMs === 'number' && typeof word.durationMs === 'number')
  );
}

/** A confidence that clears the caller's threshold. No threshold, no note. */
function past(confidence: number | undefined, threshold: number | undefined): boolean {
  return (
    threshold !== undefined &&
    typeof confidence === 'number' &&
    Number.isFinite(confidence) &&
    confidence > threshold
  );
}

/** One phoneme, named by its symbol or — when the engine named none — by its place. */
function phonemeLabel(phoneme: SpeechPhoneme, index: number, s: LkStrings): string {
  return phoneme.symbol ?? s.pronunciationPhonemePosition(index + 1);
}

/**
 * What a screen reader hears for one marked word — the marks' only channel for
 * assistive technology, since the glyph and the decoration are both hidden from
 * it. Exported because `<ReadAloud>`'s review fallback marks the same four
 * states from stored details, and a second copy of these four sentences would
 * be a second thing to translate.
 *
 * Branches on `state` and **never** on `heard === ''`: an inserted word whose
 * text normalises to nothing carries the empty string too, and would otherwise
 * be announced as an omission.
 */
export function markSentence(entry: ReadAloudWordAlignment, s: LkStrings): string {
  switch (entry.state) {
    case 'correct':
      return s.pronunciationWordCorrect(entry.reference);
    case 'mispronounced':
      return s.pronunciationWordMispronounced(entry.reference);
    case 'omitted':
      return s.pronunciationWordOmitted(entry.reference);
    default:
      return s.pronunciationWordInserted(entry.heard);
  }
}

/**
 * The per-word marks of a read-aloud take, plus the dimensions they were
 * graded on.
 *
 * **A bad assessment never destroys a good grade.** `alignReadAloud` throws a
 * `TypeError` for evidence `validateSpeechAssessment` refuses, so this
 * component runs the validator first. In development the refusal is thrown as
 * an `ActivitySchemaError`, which is the package's dev-error convention and
 * puts the problem in front of whoever wired the adapter up. In production the
 * dimensions and the grade are rendered and the word list is left out — a
 * learner who earned 82% should see 82%, not "this activity could not be
 * displayed" from an error boundary.
 *
 * **Nor does a bad grade take the evidence down.** `grade` is read, not
 * trusted: a score that is not a number between 0 and its maximum, or a
 * `passed` that is not a boolean, is shown as could-not-be-graded beside the
 * dimensions and the marks, and criteria that cannot be read name no dimension.
 *
 * There is **no `renderMode`**: nothing here submits, grades or reveals an
 * answer key. A read-aloud item has none, and the marks exist only once a
 * server has graded the take, so there is no mode in which they must be
 * withheld.
 *
 * ```tsx
 * <PronunciationFeedback
 *   data={item}
 *   assessment={assessment}
 *   grade={grade}
 *   audioUrl={takeUrl}
 *   breakThreshold={0.75}
 *   monotoneThreshold={0.6}
 * />
 * ```
 */
export function PronunciationFeedback({
  data,
  assessment,
  grade,
  audioUrl,
  breakThreshold,
  monotoneThreshold,
  locale,
  theme,
  strings,
}: PronunciationFeedbackProps) {
  const s = useLkStrings(strings);
  const ids = useId();
  const [openWord, setOpenWord] = useState<number | null>(null);

  const checked = useMemo(() => checkEvidence(assessment), [assessment]);

  const devError = useMemo(
    () =>
      isDevelopment() && !checked.success
        ? new ActivitySchemaError('read-aloud', checked.errors)
        : null,
    [checked],
  );

  // The checked copy, never the argument, for the same reason lk-core aligns
  // from it: a property getter cannot answer the validator one word and the
  // aligner another.
  const words = useMemo<ReadAloudWordAlignment[] | null>(
    () => (checked.success ? alignReadAloud(data, checked.data) : null),
    [checked, data],
  );

  // The grade as the one reader of a host's grade reads it: `undefined` when
  // none was given, and `null` when one was and cannot be shown. Everything
  // below that shows a number reads this and the dimension rows, never `grade`.
  const reading = useMemo(
    () => (grade === undefined || grade === null ? undefined : readGrade(grade)),
    [grade],
  );
  const dimensions = useMemo(() => readDimensions(assessment, reading), [assessment, reading]);

  // The take, for the per-word play buttons. A ref and an effect, never a read
  // during render: this component server-renders like every other one here.
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (stopRef.current !== null) {
        clearTimeout(stopRef.current);
      }
    },
    [],
  );

  // All hooks are called before this throw, so hook order stays stable.
  if (devError) {
    throw devError;
  }

  /** Plays one word out of the take, and stops at the end of it. */
  const playWord = (startMs: number, durationMs: number): void => {
    const element = audioRef.current;
    if (element === null) {
      return;
    }
    if (stopRef.current !== null) {
      clearTimeout(stopRef.current);
    }
    element.currentTime = startMs / 1000;
    try {
      void element.play().catch(() => {
        /* an autoplay refusal is not this component's to report */
      });
    } catch {
      /* an engine with no media stack at all; the button simply does nothing */
    }
    stopRef.current = setTimeout(() => {
      stopRef.current = null;
      element.pause();
    }, durationMs);
  };

  // The reading's own language and the direction its tag names, put on the
  // words and on nothing else: the sentences beside them are interface text.
  // No `_`→`-` normalisation, unlike `<Dictation>` — `ReadAloudData.locale` is
  // canonical by schema, so there is nothing to normalise.
  const contentLang = typeof data.locale === 'string' ? data.locale : undefined;
  const contentDir = localeDirectionOf(data.locale);

  const alphabet = checked.success ? checked.data.phonemeAlphabet : undefined;
  const monotone = checked.success ? checked.data.prosody?.monotoneConfidence : undefined;
  // Read through `at`, not through an index: `wordIndex` belongs to a public
  // type a caller may have built by hand, and it is allowed to point nowhere.
  const evidenceWords: readonly SpeechWord[] = checked.success ? checked.data.words : [];

  return (
    <section
      className="lk-pf"
      aria-label={s.pronunciationFeedbackLabel}
      lang={locale}
      style={theme as CSSProperties | undefined}
    >
      {reading !== undefined ? (
        // `.lk-pf-grade` is load-bearing beyond the skin: `<ReadAloud>` looks
        // for it after the commit to decide whether it must render the score
        // itself, so a grade is never lost between the two components. It
        // hands this panel only a grade it has already read, so the block it
        // finds always carries the score.
        //
        // `data-passed` only where there is a verdict: a grade that could not
        // be read has none, and styling it as a fail would invent one.
        <div
          className="lk-pf-grade"
          {...(reading !== null ? { 'data-passed': String(reading.passed) } : {})}
        >
          <p className="lk-pf-score">
            {reading === null
              ? s.couldNotBeGraded
              : s.scoreAnnouncement(percentOfGrade(reading), reading.passed)}
          </p>
          {/* The grader's words, isolated: their direction is their own, so an
              English comment in an Arabic interface keeps its full stop at its
              end. Their language is not guessed — feedback may be written in
              either the interface's language or the reading's. */}
          {reading?.feedback ? (
            <p className="lk-pf-grade-feedback" dir="auto">
              {reading.feedback}
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="lk-pf-dimensions">
        {dimensions.map(({ dimension, percent }) => (
          <div className="lk-pf-dimension" key={dimension} data-dimension={dimension}>
            <dt className="lk-pf-dimension-name">{s.pronunciationDimension(dimension)}</dt>
            {/* An absent score is NEVER a 0: a dimension nobody measured and a
                dimension measured at nothing are different findings, and only
                one of them is the learner's. */}
            <dd className="lk-pf-dimension-score">
              {percent === undefined ? s.pronunciationNotAssessed : `${percent}%`}
            </dd>
          </div>
        ))}
      </dl>

      {words !== null ? (
        <>
          {/* The list's name and the hidden sentences are interface text and
              keep the interface language; only the words carry the reading's.
              Its direction is the reading's, never resolved from the list's own
              text: the first strong character there is a hidden sentence. */}
          <ol className="lk-pf-words" aria-label={s.pronunciationWordsLabel} dir={contentDir}>
            {words.map((entry, index) => {
              const sentence = markSentence(entry, s);
              const shown = entry.state === 'inserted' ? entry.heard : entry.reference;
              const word =
                entry.wordIndex === undefined ? undefined : evidenceWords.at(entry.wordIndex);
              const open = openWord === index;
              const panelId = `${ids}-w${index}`;
              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: alignment order is the identity; words repeat
                  key={index}
                  className="lk-pf-word"
                  data-state={entry.state}
                >
                  {/* The state's only channel for assistive technology, and
                      exactly one channel: the same sentence as a `title` is an
                      accessible description, which a screen reader reads
                      straight after the name it duplicates. */}
                  <span className="lk-visually-hidden" style={VISUALLY_HIDDEN}>
                    {sentence}
                  </span>
                  {/* Decoration: the glyph the skin draws and the word itself.
                      Hidden from assistive technology, which already has the
                      sentence above — and the glyph is never the only channel. */}
                  <span
                    className="lk-pf-word-text"
                    aria-hidden="true"
                    dir={contentDir ?? 'auto'}
                    lang={contentLang}
                  >
                    {shown}
                  </span>
                  {hasDetail(word) ? (
                    <>
                      <button
                        type="button"
                        className="lk-pf-word-toggle"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setOpenWord(open ? null : index)}
                      >
                        {s.pronunciationWordDetails(shown)}
                      </button>
                      {open ? (
                        <div id={panelId} className="lk-pf-word-detail">
                          <dl className="lk-pf-word-facts">
                            <dt>{s.pronunciationDimension('accuracy')}</dt>
                            <dd>
                              {word.accuracy === undefined
                                ? s.pronunciationNotAssessed
                                : `${Math.round(word.accuracy)}%`}
                            </dd>
                            {word.syllables !== undefined && word.syllables.length > 0 ? (
                              <>
                                <dt>{s.pronunciationSyllables}</dt>
                                <dd>
                                  <ul className="lk-pf-syllables">
                                    {word.syllables.map((syllable, position) => (
                                      <li
                                        // biome-ignore lint/suspicious/noArrayIndexKey: syllables are positional and repeat within a word
                                        key={position}
                                        dir={contentDir ?? 'auto'}
                                        lang={contentLang}
                                      >
                                        {syllable.grapheme === undefined
                                          ? syllable.text
                                          : s.pronunciationSyllableSpelling(
                                              syllable.text,
                                              syllable.grapheme,
                                            )}
                                      </li>
                                    ))}
                                  </ul>
                                </dd>
                              </>
                            ) : null}
                            {word.phonemes !== undefined && word.phonemes.length > 0 ? (
                              <>
                                <dt>{s.pronunciationPhonemes}</dt>
                                <dd>
                                  <ul className="lk-pf-phonemes">
                                    {word.phonemes.map((phoneme, position) => (
                                      <li
                                        // biome-ignore lint/suspicious/noArrayIndexKey: a word may sound the same phoneme twice
                                        key={position}
                                        className="lk-pf-phoneme"
                                      >
                                        <span className="lk-pf-phoneme-symbol">
                                          {phonemeLabel(phoneme, position, s)}
                                        </span>
                                        {phoneme.heardAs !== undefined &&
                                        phoneme.heardAs.length > 0 ? (
                                          <>
                                            <span className="lk-pf-heard-label">
                                              {s.pronunciationHeardAs}
                                            </span>
                                            <ul className="lk-pf-heard-as">
                                              {phoneme.heardAs.map((candidate, rank) => (
                                                <li
                                                  // biome-ignore lint/suspicious/noArrayIndexKey: candidates are ranked and a symbol may repeat
                                                  key={rank}
                                                >
                                                  {candidate.symbol}
                                                </li>
                                              ))}
                                            </ul>
                                          </>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                </dd>
                              </>
                            ) : null}
                          </dl>
                          {audioUrl !== undefined &&
                          typeof word.startMs === 'number' &&
                          typeof word.durationMs === 'number' ? (
                            <button
                              type="button"
                              className="lk-pf-word-play"
                              onClick={() =>
                                playWord(word.startMs as number, word.durationMs as number)
                              }
                            >
                              {s.pronunciationPlayWord(shown)}
                            </button>
                          ) : null}
                          {past(word.breaks?.unexpected, breakThreshold) ? (
                            <p className="lk-pf-break" data-break="unexpected">
                              {s.pronunciationBreakUnexpected}
                            </p>
                          ) : null}
                          {past(word.breaks?.missing, breakThreshold) ? (
                            <p className="lk-pf-break" data-break="missing">
                              {s.pronunciationBreakMissing}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <ul className="lk-pf-legend">
            {LEGEND_STATES.map((state) => (
              <li key={state} data-state={state}>
                {s.pronunciationLegend(state)}
              </li>
            ))}
          </ul>
          {/* Only where there are symbols to explain, and only for the alphabet
              this note names. An engine that reported another one, or none at
              all, gets no note rather than a wrong one. */}
          {alphabet === 'ipa' ? <p className="lk-pf-alphabet">{s.pronunciationIpaNote}</p> : null}
        </>
      ) : null}

      {past(monotone, monotoneThreshold) ? (
        <p className="lk-pf-monotone" role="note">
          {s.pronunciationMonotone}
        </p>
      ) : null}

      {audioUrl !== undefined ? (
        // biome-ignore lint/a11y/useMediaCaption: the learner's own take has no caption track to offer, and this element is never played as content — it carries no controls and exists only so one word can be replayed from a button that names it
        <audio ref={audioRef} className="lk-pf-audio" src={audioUrl} preload="metadata" />
      ) : null}
    </section>
  );
}
