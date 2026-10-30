import type { ValidationError } from '@intellectif/lk-core';
import type { SpeechAssessment } from '@intellectif/lk-core/scoring';

/**
 * One recognition result as Azure returned it: the Speech SDK's
 * `SpeechServiceResponse_JsonResult` property, or the body of a REST
 * short-audio response, as text or already parsed.
 */
export type AzureResult = string | object;

/** What the host sent Azure: the settings that decide how a result is read. */
export interface AzureAssessmentRequest {
  /** The text sent as `ReferenceText`: the item's `referenceText`, verbatim. */
  referenceText: string;
  /** The locale assessed: the item's `locale`, canonical, as sent. */
  locale: string;
  /** The storage key of the recording assessed: the response's `RecordingRef.key`. */
  recordingKey: string;
  /**
   * `EnableMiscue`, as sent. Azure judges omissions and insertions only in
   * single-shot recognition, which returns one result.
   */
  miscue: boolean;
  /**
   * `GradingSystem`, as sent. Only `HundredMark` can be read: `FivePoint`
   * rescales every score in half-point steps, and its values cannot be told
   * from low 0–100 scores.
   */
  gradingSystem: 'HundredMark' | 'FivePoint';
  /** `PhonemeAlphabet`, as sent. Azure's default is `SAPI`. */
  phonemeAlphabet?: 'IPA' | 'SAPI';
  /** Recorded as `assessor.id`, for audit. Default `'azure-pronunciation-assessment'`. */
  assessorId?: string;
}

/**
 * Why results could not be read into an assessment:
 * - `five_point_scale`: the request used `FivePoint`;
 * - `miscue_across_results`: `miscue` was on, with more than one result.
 *   Continuous recognition does not judge miscues; send it with `miscue: false`;
 * - `not_a_result`: a result is not JSON, not an object, or carries no
 *   pronunciation assessment;
 * - `no_match`: Azure heard speech that matched no words. Route the take to
 *   review or a re-record, not to a retry;
 * - `recognition_failed`: a status other than success or silence;
 * - `invalid_assessment`: lk-core refused the assessment the results make,
 *   for the reasons in `errors`.
 */
export type AzureRefusalCode =
  | 'five_point_scale'
  | 'miscue_across_results'
  | 'not_a_result'
  | 'no_match'
  | 'recognition_failed'
  | 'invalid_assessment';

/** The assessment, checked by `validateSpeechAssessment`, or why there is none. */
export type AzureAssessmentResult =
  | { ok: true; assessment: SpeechAssessment }
  | { ok: false; code: AzureRefusalCode; message: string; errors?: ValidationError[] };
