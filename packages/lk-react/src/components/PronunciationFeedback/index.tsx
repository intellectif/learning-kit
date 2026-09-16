'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import {
  PronunciationFeedback as PronunciationFeedbackCore,
  type PronunciationFeedbackProps,
} from './PronunciationFeedback.js';

export type { PronunciationFeedbackProps } from './PronunciationFeedback.js';

/**
 * Public pronunciation-feedback panel: the core wrapped in
 * `ActivityErrorBoundary` so a render failure (the dev throw for evidence
 * `validateSpeechAssessment` refuses among them) degrades to an accessible
 * fallback instead of crashing the host.
 *
 * **No `activityTitle`.** Its `data` is two fields of a read-aloud item and
 * carries no title, so the production fallback is the unnamed one. Naming it
 * would mean inventing a title for a panel that never had one.
 */
export function PronunciationFeedback(props: PronunciationFeedbackProps) {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary strings={strings}>
      <PronunciationFeedbackCore {...props} />
    </ActivityErrorBoundary>
  );
}
