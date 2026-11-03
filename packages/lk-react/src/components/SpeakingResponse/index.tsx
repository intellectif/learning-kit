'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import {
  SpeakingResponse as SpeakingResponseCore,
  type SpeakingResponseProps,
} from './SpeakingResponse.js';

// What a binding written against this subpath needs to name, from this subpath:
// its argument, the binding itself, and what `assess` returns.
export type { RecordedTake } from '../../hooks/useSpeechRecorder.js';
export type { ReadAloudAssessResult, RecordingBinding } from '../ReadAloud/ReadAloud.js';
export type { SpeakingAssessResult, SpeakingResponseProps } from './SpeakingResponse.js';

/**
 * Public Speaking Response activity: the core wrapped in
 * `ActivityErrorBoundary`, so a render failure — the dev schema-validation
 * throw and the missing-`upload` guard included — degrades to an accessible
 * fallback instead of crashing the host.
 */
export function SpeakingResponse(props: SpeakingResponseProps): React.JSX.Element {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <SpeakingResponseCore {...props} />
    </ActivityErrorBoundary>
  );
}
