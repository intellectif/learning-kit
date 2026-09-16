'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import { ReadAloud as ReadAloudCore, type ReadAloudProps } from './ReadAloud.js';

// `RecordedTake` travels with `RecordingBinding` because `upload`, the one
// method a binding must have, takes one: a binding written against this subpath
// must not need a second import path to name its own argument.
export type { RecordedTake } from '../../hooks/useSpeechRecorder.js';
export type { ReadAloudAssessResult, ReadAloudProps, RecordingBinding } from './ReadAloud.js';

/**
 * Public Read Aloud activity: the core wrapped in `ActivityErrorBoundary` so a
 * render failure (including the dev schema-validation throw and the
 * missing-`upload` guard) degrades to an accessible fallback instead of
 * crashing the host.
 */
export function ReadAloud(props: ReadAloudProps) {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <ReadAloudCore {...props} />
    </ActivityErrorBoundary>
  );
}
