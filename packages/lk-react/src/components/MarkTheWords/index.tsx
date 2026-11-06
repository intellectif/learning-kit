'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import { MarkTheWords as MarkTheWordsCore, type MarkTheWordsProps } from './MarkTheWords.js';

export type { MarkTheWordsProps } from './MarkTheWords.js';

/**
 * Public Mark the Words activity: the core wrapped in `ActivityErrorBoundary`
 * so a render failure (including the dev schema-validation throw and the
 * redacted-in-`practice` guard) degrades to an accessible fallback instead of
 * crashing the host.
 */
export function MarkTheWords(props: MarkTheWordsProps): React.JSX.Element {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <MarkTheWordsCore {...props} />
    </ActivityErrorBoundary>
  );
}
