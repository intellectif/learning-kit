'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import { Dictation as DictationCore, type DictationProps } from './Dictation.js';

export type { DictationProps } from './Dictation.js';

/**
 * Public Dictation activity: the core wrapped in `ActivityErrorBoundary` so a
 * render failure (including the dev schema-validation throw and the
 * redacted-in-`practice` guard) degrades to an accessible fallback instead of
 * crashing the host.
 */
export function Dictation(props: DictationProps): React.JSX.Element {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <DictationCore {...props} />
    </ActivityErrorBoundary>
  );
}
