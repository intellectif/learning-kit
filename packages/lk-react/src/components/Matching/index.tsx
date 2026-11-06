'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import { Matching as MatchingCore, type MatchingProps } from './Matching.js';

export type { MatchingProps } from './Matching.js';

/**
 * Public Matching activity: the core wrapped in `ActivityErrorBoundary` so a
 * render failure (including the dev schema-validation throw and the
 * redacted-in-`practice` guard) degrades to an accessible fallback instead of
 * crashing the host.
 */
export function Matching(props: MatchingProps): React.JSX.Element {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <MatchingCore {...props} />
    </ActivityErrorBoundary>
  );
}
