'use client';

import {
  ActivitySchemaError,
  assertRedacted,
  type LearnerResponse,
  type SpeakingResponseData,
  type SpeechAssessment,
  type SpeechUnscorableCode,
  validateActivity,
} from '@intellectif/lk-core';
import { type CSSProperties, useId, useMemo } from 'react';
import { localeDirectionOf } from '../../i18n/direction.js';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStrings } from '../../i18n/strings.js';
import { isDevelopment } from '../_internal.js';
import type { ReadAloudAssessResult, RecordingBinding } from '../ReadAloud/ReadAloud.js';
import { readRecordingBounds, secondsWithin } from '../ReadAloud/recording-bounds.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import { useDeliveryPolicy } from '../shared/delivery.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';
import { CorrectionsList, GradeBody } from '../shared/grade-parts.js';
import {
  type OutcomeReading,
  percentOfGrade,
  type ReadGrade,
  readAssessResult,
  readEvidence,
  readOutcome,
} from '../shared/read-grade.js';
import { alertTextOf, TakeControls, useRecordedAnswer } from '../shared/recorded-answer.js';
import type { ActivityProps, Renderable } from '../types.js';

/** A title with something in it a screen reader can say. */
const VISIBLE_TEXT_RE = /[^\p{White_Space}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

/**
 * What an application's assessor came back with for a spoken answer: a
 * read-aloud's results, and `pending` for an answer a person will grade — a
 * grade `routeGrade` sent to a person. `pending` is no failure and no grade:
 * the learner is told the answer is in and waits for its grade, and
 * `onComplete` is not called.
 */
export type SpeakingAssessResult = ReadAloudAssessResult | { status: 'pending' };

export interface SpeakingResponseProps extends ActivityProps<SpeakingResponseData> {
  /**
   * How a take is stored and judged: `upload` is required outside `review`,
   * `assess` is `practice` only and returns {@link SpeakingAssessResult} — the
   * server's `gradeSpeakingResponse` grade with the evidence it read.
   */
  recordingBinding?: RecordingBinding<SpeakingAssessResult>;
  /**
   * The evidence behind a stored grade, for `review`: its transcript is shown
   * under the grade, as "what you said".
   */
  assessment?: SpeechAssessment;
  /** See `ReadAloudProps.workletUrl`. */
  workletUrl?: string;
  /**
   * Never called. A spoken answer is a key in your storage, and there is none
   * until the take has been uploaded. `onSubmit` carries the response, once.
   */
  onChange?: (response: LearnerResponse) => void;
}

/**
 * The learner message each of the SDK's unscorable codes earns. Typed over
 * every `SpeechUnscorableCode`, so a code lk-core adds does not build here until
 * it has a message.
 */
const UNSCORABLE_MESSAGES: Readonly<
  Record<SpeechUnscorableCode, 'readAloudNotHeard' | 'readAloudNotAssessed' | 'failed'>
> = {
  // Nothing was heard: a quieter room helps.
  no_speech: 'readAloudNotHeard',
  insufficient_voiced_time: 'readAloudNotHeard',
  // More words than the recording can hold: another take helps.
  implausible_speech_rate: 'readAloudNotAssessed',
  // The server's setup, the evidence it sent, or the judge: the next take is
  // refused the same way, so none is asked for.
  invalid_assessment: 'failed',
  task_mismatch: 'failed',
  locale_mismatch: 'failed',
  reference_mismatch: 'failed',
  recording_mismatch: 'failed',
  assessor_not_accepted: 'failed',
  missing_dimension: 'failed',
  judgement_mismatch: 'failed',
};

function unscorableMessage(code: string | undefined, s: LkStrings): string {
  const key =
    code !== undefined && Object.hasOwn(UNSCORABLE_MESSAGES, code)
      ? UNSCORABLE_MESSAGES[code as SpeechUnscorableCode]
      : 'readAloudNotAssessed';
  return key === 'failed' ? s.speakingAssessmentFailed : s[key];
}

/**
 * What a take is a take OF: the item, its prompt and what it shows, its
 * language, and the bounds the take is captured under. An answer to another
 * question, or about another picture, answers nothing here. Never the
 * identity of `data` — see `<ReadAloud>`'s `readingKeyOf` for why.
 */
function questionKeyOf(
  data: Renderable<SpeakingResponseData>,
  bounds: { maxSeconds: number; minSeconds: number | undefined; maxTakes: number | undefined },
): string {
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  const media = data.media as { url?: unknown } | undefined;
  return JSON.stringify([
    text(data.id),
    text(data.prompt),
    text(data.locale),
    text(media?.url),
    String(bounds.maxSeconds),
    String(bounds.minSeconds),
    String(bounds.maxTakes),
  ]);
}

/** The transcript evidence carries, when it is text; `null` otherwise. Never throws. */
function transcriptOf(assessment: unknown): string | null {
  try {
    const transcript = (assessment as { transcript?: { text?: unknown } } | null)?.transcript;
    return typeof transcript?.text === 'string' && transcript.text.trim() !== ''
      ? transcript.text
      : null;
  } catch {
    return null;
  }
}

/** What a statement records as the response: the transcript the grade read. */
const readSpeakingResult = (value: unknown) =>
  readAssessResult(value, {
    pending: true,
    responseText: (assessment) => transcriptOf(assessment) ?? undefined,
  });

/**
 * A grade's breakdown and what was said: the criteria, the corrections, the
 * grader's flag for a person, and the transcript. Outside the live region, so
 * a long list is read when the learner reaches it rather than all at once.
 */
function GradeDetails({
  grade,
  transcript,
  s,
  contentLang,
  contentDir,
}: {
  grade: ReadGrade | null;
  transcript: string | null;
  s: LkStrings;
  contentLang: string | undefined;
  contentDir: 'ltr' | 'rtl' | undefined;
}) {
  if (grade === null && transcript === null) {
    return null;
  }
  // The feedback is said in the live region; here it is the rest of the grade.
  // The corrections are listed under their own name: they are corrections to
  // what was SAID, which the transcript below them shows.
  const {
    feedback: _said,
    corrections,
    ...rest
  } = grade ?? {
    feedback: null,
    corrections: undefined,
  };
  const breakdown = grade === null ? null : { ...(rest as typeof grade), feedback: null };
  return (
    <div className="lk-sr-details">
      {breakdown !== null ? <GradeBody grade={breakdown} s={s} prefix="lk-sr" /> : null}
      {corrections !== undefined && corrections.length > 0 ? (
        <CorrectionsList corrections={corrections} label={s.speakingCorrections} prefix="lk-sr" />
      ) : null}
      {transcript !== null ? (
        <figure className="lk-sr-transcript">
          <figcaption className="lk-sr-transcript-label">{s.speakingTranscript}</figcaption>
          <blockquote
            className="lk-sr-transcript-text"
            dir={contentDir ?? 'auto'}
            lang={contentLang}
          >
            {transcript}
          </blockquote>
        </figure>
      ) : null}
    </div>
  );
}

/** The server's outcome in `review`, as `readOutcome` read it. Nothing on this path scores. */
function OutcomeSentence({ reading, s }: { reading: OutcomeReading; s: LkStrings }) {
  switch (reading.kind) {
    case 'graded':
      return (
        <div
          className="lk-sr-outcome"
          data-status={reading.status}
          data-passed={String(reading.grade.passed)}
        >
          <p className="lk-sr-grade">
            {s.scoreAnnouncement(percentOfGrade(reading.grade), reading.grade.passed)}
          </p>
          {reading.grade.feedback ? (
            <p className="lk-sr-grade-feedback" dir="auto">
              {reading.grade.feedback}
            </p>
          ) : null}
        </div>
      );
    case 'deferred':
      return (
        <div className="lk-sr-outcome" data-status="deferred">
          <p className="lk-sr-grade">{s.awaitingGrade}</p>
        </div>
      );
    case 'unscorable':
      // An unscorable code is a developer-facing label: on the element, never shown.
      return (
        <div
          className="lk-sr-outcome"
          data-status="unscorable"
          {...(reading.code !== undefined ? { 'data-code': reading.code } : {})}
        >
          <p className="lk-sr-grade">{s.couldNotBeGraded}</p>
        </div>
      );
    default:
      return (
        <div
          className="lk-sr-outcome"
          {...(reading.status !== undefined ? { 'data-status': reading.status } : {})}
        >
          <p className="lk-sr-grade">{s.couldNotBeGraded}</p>
        </div>
      );
  }
}

/**
 * Answers a prompt out loud — optionally about a picture, or after a recording
 * — and hands the take to the application.
 *
 * The SDK records; it never judges. The take is captured as `<ReadAloud>`
 * captures one — mono 16-bit PCM WAV at 16 kHz, which `inspectWav` measures —
 * handed to `recordingBinding.upload`, and reported through `onSubmit`. On the
 * server, the application transcribes it verbatim, has the speech engine
 * measure it against that transcript, asks a judge for the rubric's other
 * criteria, and grades with `gradeSpeakingResponse`. In `practice`, an optional
 * `assess` may come back with that grade — or `pending`, when the grade waits
 * for a person; in `exam`, nothing is ever assessed on the client.
 *
 * **`recordingBinding.upload` is required outside `review`**, and its absence
 * throws at render: a learner must never speak into a control that stores
 * nothing. **A grade that comes back is read, not trusted**, as `<ReadAloud>`
 * reads one.
 *
 * The grade shows its score and the grader's feedback, each criterion — the
 * judge's and the engine's — with its level or percentage and the judge's
 * comment, the corrections, and the transcript of what was said.
 *
 * ```tsx
 * <SpeakingResponse
 *   data={item}
 *   recordingBinding={{ upload, assess }}
 *   onSubmit={persist}
 *   onComplete={record}
 * />
 * ```
 */
export function SpeakingResponse({
  data,
  onComplete,
  onSubmit,
  onInteraction,
  value,
  defaultValue,
  defaultSubmitted,
  renderMode = 'practice',
  outcome,
  sanitizeHtml,
  mediaBudget,
  mediaStrings,
  strings,
  theme,
  locale,
  disabled,
  recordingBinding,
  assessment,
  workletUrl,
  delivery,
}: SpeakingResponseProps) {
  const isExam = renderMode === 'exam';
  const isReview = renderMode === 'review';
  const policy = useDeliveryPolicy(delivery);
  const s = useLkStrings(strings);

  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    if (data.redacted === true) {
      try {
        assertRedacted(data);
        return null;
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    }
    const result = validateActivity('speaking-response', data);
    return result.success ? null : new ActivitySchemaError('speaking-response', result.errors);
  }, [data]);

  // Read, not merely defaulted, as a read-aloud's are: `practice` renders
  // unvalidated content in production. See `readRecordingBounds`.
  const { maxSeconds, minSeconds, maxTakes } = readRecordingBounds(data.recording);
  const questionKey = questionKeyOf(data, { maxSeconds, minSeconds, maxTakes });

  const answer = useRecordedAnswer({
    type: 'speaking-response',
    data,
    readingKey: questionKey,
    bounds: { maxSeconds, minSeconds, maxTakes },
    binding: recordingBinding,
    renderMode,
    disabled,
    value,
    defaultValue,
    defaultSubmitted,
    onSubmit,
    onComplete,
    onInteraction,
    workletUrl,
    readResult: readSpeakingResult,
  });
  const { recorder, phase, submitted } = answer;

  const ids = useId();
  const titleId = `${ids}-title`;

  const promptHtml = useMemo(() => {
    if (sanitizeHtml === undefined || typeof data.promptHtml !== 'string') {
      return null;
    }
    return sanitizeHtml(data.promptHtml);
  }, [data.promptHtml, sanitizeHtml]);

  const outcomeReading = useMemo(() => readOutcome(outcome), [outcome]);
  const keptTranscript = useMemo(() => transcriptOf(readEvidence(assessment)), [assessment]);

  // All hooks are called before these throws, so hook order stays stable.
  if (devError) {
    throw devError;
  }
  // `review` needs no upload: it renders what a server already stored.
  if (!isReview && recordingBinding?.upload === undefined) {
    throw new Error(
      `SpeakingResponse "${data.id}" was rendered in renderMode "${renderMode}" without ` +
        '`recordingBinding.upload`. The learner could record an answer that is stored ' +
        'nowhere and submitted as nothing, which looks like a working activity the ' +
        'whole way through. Pass a `recordingBinding` whose `upload` puts the take in ' +
        'your storage and returns its key. `assess` is optional: without it the take is ' +
        'still recorded, uploaded and submitted, and a notice replaces the feedback.',
    );
  }

  const contentLang = typeof data.locale === 'string' ? data.locale : undefined;
  const contentDir = localeDirectionOf(data.locale);

  // The grade and what was said, from one source per mode: the stored outcome
  // and kept evidence in `review`, the judged take otherwise. Nothing at all
  // without feedback — the score, the breakdown and the transcript are all it.
  const storedGrade = outcomeReading?.kind === 'graded' ? outcomeReading.grade : null;
  const shownGrade = !policy.feedback
    ? null
    : isReview
      ? storedGrade
      : phase.kind === 'graded'
        ? phase.reading.grade
        : null;
  const shownTranscript = !policy.feedback
    ? null
    : isReview
      ? keptTranscript
      : phase.kind === 'graded'
        ? transcriptOf(phase.reading.assessment)
        : null;

  const announcement = ((): { text: string; feedback: string | null } | null => {
    if (isReview) {
      return null;
    }
    if (recorder.status === 'recording') {
      return { text: s.readAloudRecordingStarted, feedback: null };
    }
    const take = recorder.take;
    const stopped =
      recorder.status === 'recorded' && take !== null
        ? {
            text: s.readAloudRecordingStopped(
              secondsWithin(take.durationMs, maxSeconds, 'nearest'),
              maxSeconds,
            ),
            feedback: null,
          }
        : null;
    if (isExam) {
      if (phase.kind === 'submitted' || submitted) {
        return { text: s.answerSubmitted, feedback: null };
      }
      return phase.kind === 'idle' ? stopped : null;
    }
    switch (phase.kind) {
      case 'graded': {
        const grade = phase.reading.grade;
        if (grade === null) {
          return { text: `${s.answerSubmitted} ${s.couldNotBeGraded}`, feedback: null };
        }
        if (!policy.feedback) {
          return { text: s.answerSubmitted, feedback: null };
        }
        return {
          text: `${s.answerSubmitted} ${s.scoreAnnouncement(percentOfGrade(grade), grade.passed)}`,
          feedback: grade.feedback,
        };
      }
      case 'pending':
        return { text: `${s.answerSubmitted} ${s.awaitingGrade}`, feedback: null };
      case 'unscorable':
        return { text: unscorableMessage(phase.code, s), feedback: null };
      case 'unassessed':
        return { text: s.speakingAssessmentUnavailable, feedback: null };
      case 'idle':
        return stopped;
      default:
        return null;
    }
  })();

  const alertText = alertTextOf(answer, s, s.speakingAssessmentFailed);

  return (
    <form
      className="lk-sr"
      aria-labelledby={VISIBLE_TEXT_RE.test(data.title) ? titleId : undefined}
      lang={locale}
      data-render-mode={renderMode}
      style={theme as CSSProperties | undefined}
      onSubmit={answer.handleSubmit}
    >
      <p id={titleId} className="lk-sr-title" dir={contentDir ?? 'auto'} lang={contentLang}>
        {data.title}
      </p>

      {typeof data.instructions === 'string' && data.instructions !== '' ? (
        <p className="lk-sr-instructions" dir={contentDir ?? 'auto'} lang={contentLang}>
          {data.instructions}
        </p>
      ) : null}

      {promptHtml === null ? (
        <p className="lk-sr-prompt" dir={contentDir ?? 'auto'} lang={contentLang}>
          {data.prompt}
        </p>
      ) : (
        // A div, not a p: sanitised author HTML may contain block content.
        <div
          className="lk-sr-prompt"
          dir={contentDir ?? 'auto'}
          lang={contentLang}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered only through the caller-supplied HtmlSanitizer — the SDK never injects unsanitised markup
          dangerouslySetInnerHTML={{ __html: promptHtml }}
        />
      )}

      {data.media !== undefined ? (
        // A recording to answer stays silent while the learner records, as a
        // reading's model does: a microphone that hears it would grade it.
        <div className="lk-sr-media" ref={answer.mediaRef}>
          <ActivityMedia
            media={data.media}
            renderMode={renderMode}
            {...(mediaBudget !== undefined ? { mediaBudget } : {})}
            {...(mediaStrings !== undefined ? { mediaStrings } : {})}
            {...(strings !== undefined ? { strings } : {})}
            {...(onInteraction !== undefined ? { onInteraction } : {})}
            {...(locale !== undefined ? { locale } : {})}
            {...(disabled === true || answer.isCapturing ? { disabled: true } : {})}
          />
        </div>
      ) : null}

      {isReview || submitted ? null : (
        <p className="lk-sr-time-limit">{s.speakingTimeLimit(minSeconds, maxSeconds)}</p>
      )}

      <TakeControls
        answer={answer}
        prefix="lk-sr"
        s={s}
        maxSeconds={maxSeconds}
        maxTakes={maxTakes}
        isExam={isExam}
        isReview={isReview}
        disabled={disabled}
        assessingText={s.speakingAssessing}
        alertText={alertText}
      />

      <FeedbackRegion id={`${data.id}-feedback`}>
        {isReview ? (
          outcomeReading !== undefined && (policy.feedback || outcomeReading.kind !== 'graded') ? (
            <OutcomeSentence reading={outcomeReading} s={s} />
          ) : null
        ) : announcement === null ? null : (
          <>
            {announcement.text}
            {announcement.feedback ? (
              <>
                {' '}
                <span dir="auto">{announcement.feedback}</span>
              </>
            ) : null}
          </>
        )}
      </FeedbackRegion>

      <GradeDetails
        grade={shownGrade}
        transcript={shownTranscript}
        s={s}
        contentLang={contentLang}
        contentDir={contentDir}
      />
    </form>
  );
}
