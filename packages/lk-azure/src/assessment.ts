import type { ValidationError } from '@intellectif/lk-core';
import { type SpeechAssessment, validateSpeechAssessment } from '@intellectif/lk-core/scoring';
import { mergedScores } from './merge.js';
import { readResult, type Utterance } from './read.js';
import type {
  AzureAssessmentRequest,
  AzureAssessmentResult,
  AzureRefusalCode,
  AzureResult,
} from './types.js';

const DEFAULT_ASSESSOR_ID = 'azure-pronunciation-assessment';

function refused(code: AzureRefusalCode, message: string): AzureAssessmentResult {
  return { ok: false, code, message };
}

function invalid(errors: ValidationError[]): AzureAssessmentResult {
  return {
    ok: false,
    code: 'invalid_assessment',
    message: 'lk-core refused the assessment these results make; see `errors`.',
    errors,
  };
}

/** The assessment lk-core accepts, or its reasons for refusing it. */
function checked(assessment: SpeechAssessment): AzureAssessmentResult {
  const result = validateSpeechAssessment(assessment);
  return result.success ? { ok: true, assessment: result.data } : invalid(result.errors);
}

/**
 * Azure pronunciation assessment results → lk-core's `SpeechAssessment`, for
 * a read-aloud take: pure, with no network, no key and no clock.
 *
 * Pass every result of the take in order: the one result of single-shot
 * recognition or of a REST request, or each `recognized` result of continuous
 * recognition. Pass `request` as you sent it.
 *
 * - **Nothing heard is `no_speech`.** Azure answers silence and background
 *   noise with a successful result in which every reference word is omitted,
 *   and every score is 0. That take is `status: 'no_speech'`, which
 *   `gradeReadAloud` reports as unscorable, never a grade of 0.
 * - **One result keeps Azure's scores.** Several are scored over the whole
 *   take, as Microsoft's continuous sample scores one; see `merge.ts`.
 * - **What is not a probability is left out:** break confidences, and a
 *   monotone value outside 0..1.
 * - **What has no name is left out:** syllables Azure names `""` (every
 *   locale but en-US), phoneme symbols and candidates named `""`.
 * - **An omitted word has no score and no time.**
 * - The result is checked by `validateSpeechAssessment`, so an assessment it
 *   returns is one `gradeReadAloud` reads.
 *
 * Choose single-shot recognition only below about 28 s, measured from the
 * recording: it stops at 30 s and reports the rest of the reading as omitted,
 * with no error. And leave its segmentation silence at the default: at
 * 5000 ms, a 7 s pause ends the take.
 */
export function assessmentFromAzure(
  results: readonly AzureResult[],
  request: AzureAssessmentRequest,
): AzureAssessmentResult {
  if (request.gradingSystem !== 'HundredMark') {
    return refused(
      'five_point_scale',
      'The request used the FivePoint grading system, whose scores cannot be told from low ' +
        '0–100 scores. Send GradingSystem: HundredMark.',
    );
  }
  if (request.miscue && results.length > 1) {
    return refused(
      'miscue_across_results',
      `miscue was on with ${results.length} results. Azure judges omissions and insertions in ` +
        'single-shot recognition only; send continuous recognition with miscue: false.',
    );
  }
  const utterances: Utterance[] = [];
  for (const [index, raw] of results.entries()) {
    const read = readResult(raw);
    if (read.kind === 'refused') {
      return refused(read.code, `Result ${index + 1} of ${results.length}: ${read.message}`);
    }
    if (read.kind === 'utterance') {
      utterances.push(read.utterance);
    }
  }

  const base = {
    assessmentVersion: '1.0',
    task: 'scripted',
    locale: request.locale,
    referenceText: request.referenceText,
    recordingKey: request.recordingKey,
    assessor: { kind: 'auto', id: request.assessorId ?? DEFAULT_ASSESSOR_ID },
    scale: 100,
  } as const;
  const words = utterances.flatMap((utterance) => utterance.words);
  if (!words.some((word) => word.error !== 'omission')) {
    return checked({ ...base, status: 'no_speech', scores: {}, miscue: 'none', words: [] });
  }

  const single = utterances.length === 1 ? utterances[0] : undefined;
  const text = utterances.flatMap((utterance) => utterance.text ?? []).join(' ');
  const monotone = utterances.find((utterance) => utterance.monotone !== undefined)?.monotone;
  const named = words.some((word) =>
    word.phonemes?.some((phoneme) => phoneme.symbol !== undefined || phoneme.heardAs !== undefined),
  );
  const assessment: SpeechAssessment = {
    ...base,
    status: 'assessed',
    scores: single !== undefined ? single.scores : {},
    ...(text !== '' ? { recognizedText: text } : {}),
    // Miscue on with several results was refused above.
    miscue: request.miscue ? 'assessor' : 'none',
    ...(named ? { phonemeAlphabet: request.phonemeAlphabet === 'IPA' ? 'ipa' : 'sapi' } : {}),
    words,
    ...(monotone !== undefined ? { prosody: { monotoneConfidence: monotone } } : {}),
    ...(single?.snrDb !== undefined ? { signal: { snrDb: single.snrDb } } : {}),
  };
  if (single !== undefined) {
    return checked(assessment);
  }
  // The aligner reads checked evidence only, so the words are checked first.
  const unscored = validateSpeechAssessment(assessment);
  if (!unscored.success) {
    return invalid(unscored.errors);
  }
  return checked({
    ...unscored.data,
    scores: mergedScores(utterances, unscored.data, request.referenceText),
  });
}
